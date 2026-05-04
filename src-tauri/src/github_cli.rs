use crate::git_support::git_stdout_trim;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhCheckResult {
    pub installed: bool,
    pub version: Option<String>,
    pub authenticated: bool,
    /// Which package manager we can drive for a one-click install on this
    /// platform, if any. `None` means the user has to install manually.
    pub installer: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhPublishResult {
    pub remote_url: Option<String>,
    pub branch: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthCodePayload {
    pub code: String,
    pub url: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthDonePayload {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhPublishProgressPayload {
    /// A short, user-facing label for the current step.
    pub phase: String,
    /// Most recent line of output from gh/git, for live feedback.
    pub line: Option<String>,
}

/// Resolve which package manager (if any) this platform has available for a
/// one-click `gh` install. Returns the CLI name so the frontend can surface a
/// sensible label.
fn detect_gh_installer() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        if Command::new("brew")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some("brew");
        }
        None
    }
    #[cfg(target_os = "windows")]
    {
        if Command::new("winget")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some("winget");
        }
        None
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        None
    }
}

fn check_gh_installation_inner() -> GhCheckResult {
    let version = match Command::new("gh").arg("--version").output() {
        Ok(output) if output.status.success() => {
            let line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(|s| s.trim().to_string());
            line.filter(|s| !s.is_empty())
        }
        _ => None,
    };

    let installed = version.is_some();
    let authenticated = installed
        && Command::new("gh")
            .args(["auth", "status"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

    let result = GhCheckResult {
        installed,
        version,
        authenticated,
        installer: if installed {
            None
        } else {
            detect_gh_installer().map(|s| s.to_string())
        },
    };
    eprintln!(
        "[gh] check installed={} authenticated={} version={:?} installer={:?}",
        result.installed, result.authenticated, result.version, result.installer,
    );
    result
}

#[tauri::command]
pub async fn check_gh_installation() -> GhCheckResult {
    tauri::async_runtime::spawn_blocking(check_gh_installation_inner)
        .await
        .unwrap_or_else(|e| {
            eprintln!("[gh] check task failed: {e}");
            GhCheckResult {
                installed: false,
                version: None,
                authenticated: false,
                installer: None,
            }
        })
}

/// Run the platform's package manager to install `gh`. Blocks until the
/// installer exits. Returns the post-install check result so the UI can
/// update in one round-trip.
fn install_gh_cli_inner() -> Result<GhCheckResult, String> {
    let installer = detect_gh_installer()
        .ok_or_else(|| "No supported package manager found on this system.".to_string())?;

    let args: &[&str] = match installer {
        "brew" => &["install", "gh"],
        "winget" => &["install", "--id", "GitHub.cli", "-e", "--silent"],
        _ => return Err(format!("Unsupported installer: {installer}")),
    };

    let output = Command::new(installer)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {installer}: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if msg.is_empty() {
            format!("{installer} exited with status {}", output.status)
        } else {
            msg
        });
    }

    Ok(check_gh_installation_inner())
}

#[tauri::command]
pub async fn install_gh_cli() -> Result<GhCheckResult, String> {
    tauri::async_runtime::spawn_blocking(install_gh_cli_inner)
        .await
        .map_err(|e| format!("Failed to run GitHub CLI installer task: {e}"))?
}

/// Start the `gh auth login` device flow and stream its output to the
/// frontend.
#[tauri::command]
pub async fn start_gh_auth_login(app: AppHandle) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command as TokioCommand;

    let mut child = TokioCommand::new("gh")
        .args([
            "auth",
            "login",
            "--web",
            "--hostname",
            "github.com",
            "--git-protocol",
            "https",
        ])
        .env("GH_PROMPT_DISABLED", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch `gh auth login`: {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let tx_out = tx.clone();
    let tx_err = tx;

    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_out.send(line);
        }
    });
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_err.send(line);
        }
    });

    let app_for_lines = app.clone();
    tokio::spawn(async move {
        let mut code: Option<String> = None;
        let mut url: Option<String> = None;
        let mut emitted = false;
        while let Some(line) = rx.recv().await {
            if code.is_none() {
                if let Some(c) = extract_device_code(&line) {
                    code = Some(c);
                }
            }
            if url.is_none() {
                if let Some(u) = extract_device_url(&line) {
                    url = Some(u);
                }
            }
            if !emitted {
                if let (Some(c), Some(u)) = (code.as_ref(), url.as_ref()) {
                    let _ = app_for_lines.emit(
                        "gh-auth-code",
                        GhAuthCodePayload {
                            code: c.clone(),
                            url: u.clone(),
                        },
                    );
                    emitted = true;
                }
            }
        }
    });

    tokio::spawn(async move {
        let payload = match child.wait().await {
            Ok(status) if status.success() => GhAuthDonePayload {
                success: true,
                error: None,
            },
            Ok(status) => GhAuthDonePayload {
                success: false,
                error: Some(format!("`gh auth login` exited with status {status}")),
            },
            Err(e) => GhAuthDonePayload {
                success: false,
                error: Some(format!("Failed waiting for gh: {e}")),
            },
        };
        let _ = app.emit("gh-auth-done", payload);
    });

    Ok(())
}

fn extract_device_code(line: &str) -> Option<String> {
    let bytes = line.as_bytes();
    for i in 0..bytes.len().saturating_sub(8) {
        let slice = &bytes[i..i + 9];
        if slice[4] == b'-'
            && slice[..4]
                .iter()
                .all(|b| b.is_ascii_alphanumeric() && !b.is_ascii_lowercase())
            && slice[5..]
                .iter()
                .all(|b| b.is_ascii_alphanumeric() && !b.is_ascii_lowercase())
        {
            return Some(String::from_utf8_lossy(slice).to_string());
        }
    }
    None
}

fn extract_device_url(line: &str) -> Option<String> {
    const NEEDLE: &str = "https://github.com/login/device";
    let idx = line.find(NEEDLE)?;
    let rest = &line[idx..];
    let end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

/// Publish the current branch of the repo at `path` to GitHub.
#[tauri::command]
pub async fn gh_publish_branch(
    app: AppHandle,
    path: String,
    branch_name: String,
    visibility: String,
    repo_name: Option<String>,
) -> Result<GhPublishResult, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command as TokioCommand;

    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    if !matches!(visibility.as_str(), "public" | "private" | "internal") {
        return Err(format!("Invalid visibility: {visibility}"));
    }
    let branch = branch_name.trim().to_string();
    if branch.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }

    let existing_remote = git_stdout_trim(&["remote", "get-url", "origin"], Some(p));
    eprintln!(
        "[gh] publish_branch path={path:?} branch={branch} visibility={visibility} repo_name={repo_name:?} existing_remote={existing_remote:?}"
    );

    let emit_progress = |phase: &str, line: Option<String>| {
        let _ = app.emit(
            "gh-publish-progress",
            GhPublishProgressPayload {
                phase: phase.to_string(),
                line,
            },
        );
    };

    if existing_remote.is_none() {
        emit_progress("Creating GitHub repository…", None);
        let visibility_flag = format!("--{visibility}");
        let mut args: Vec<String> = Vec::with_capacity(6);
        args.push("repo".into());
        args.push("create".into());
        let trimmed_name = repo_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(name) = trimmed_name {
            args.push(name.to_string());
        }
        args.push("--source=.".into());
        args.push("--push".into());
        args.push(visibility_flag);

        eprintln!("[gh] exec gh {args:?}");
        let mut child = TokioCommand::new("gh")
            .args(&args)
            .current_dir(p)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to run gh: {e}"))?;

        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let tx_out = tx.clone();
        let tx_err = tx;
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx_out.send(line);
            }
        });
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx_err.send(line);
            }
        });

        let mut captured_err = String::new();
        let app_for_lines = app.clone();
        let drain_task = tokio::spawn(async move {
            while let Some(line) = rx.recv().await {
                eprintln!("[gh] :: {line}");
                let phase = if line.contains("Pushing") || line.to_lowercase().contains("push") {
                    "Pushing to GitHub…"
                } else if line.contains("Created repository") {
                    "Pushing to GitHub…"
                } else {
                    "Creating GitHub repository…"
                };
                let _ = app_for_lines.emit(
                    "gh-publish-progress",
                    GhPublishProgressPayload {
                        phase: phase.to_string(),
                        line: Some(line.clone()),
                    },
                );
                captured_err.push_str(&line);
                captured_err.push('\n');
            }
            captured_err
        });

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed waiting for gh: {e}"))?;
        let captured = drain_task.await.unwrap_or_default();
        eprintln!("[gh] exit status={status}");
        if !status.success() {
            let trimmed = captured.trim().to_string();
            return Err(if trimmed.is_empty() {
                format!("gh exited with status {status}")
            } else {
                trimmed
            });
        }
    } else {
        emit_progress("Pushing to GitHub…", None);
        eprintln!("[gh] exec git push -u origin {branch}");
        let mut child = TokioCommand::new("git")
            .args(["push", "-u", "origin", &branch])
            .current_dir(p)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to run git push: {e}"))?;

        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let tx_out = tx.clone();
        let tx_err = tx;
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx_out.send(line);
            }
        });
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx_err.send(line);
            }
        });

        let mut captured_err = String::new();
        let app_for_lines = app.clone();
        let drain_task = tokio::spawn(async move {
            while let Some(line) = rx.recv().await {
                eprintln!("[git push] :: {line}");
                let _ = app_for_lines.emit(
                    "gh-publish-progress",
                    GhPublishProgressPayload {
                        phase: "Pushing to GitHub…".to_string(),
                        line: Some(line.clone()),
                    },
                );
                captured_err.push_str(&line);
                captured_err.push('\n');
            }
            captured_err
        });

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed waiting for git push: {e}"))?;
        let captured = drain_task.await.unwrap_or_default();
        eprintln!("[gh] git push exit status={status}");
        if !status.success() {
            let trimmed = captured.trim().to_string();
            return Err(if trimmed.is_empty() {
                format!("git push exited with status {status}")
            } else {
                trimmed
            });
        }
    }

    let remote_url = git_stdout_trim(&["remote", "get-url", "origin"], Some(p));
    eprintln!("[gh] publish ok remote={remote_url:?}");
    Ok(GhPublishResult { remote_url, branch })
}
