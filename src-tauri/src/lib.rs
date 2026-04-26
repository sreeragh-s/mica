use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

mod meeting_capture;
mod workspace_index;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckResult {
    pub installed: bool,
    pub version: Option<String>,
}

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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
    pub untracked: bool,
    pub modified: bool,
    pub deleted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    /// Short name users recognize. For remotes this is the part after the
    /// remote name, e.g. `origin/feature/foo` -> `feature/foo`.
    pub name: String,
    /// Full ref identifier. For a local branch this matches `name`; for a
    /// remote it's `origin/<name>` so a checkout command can disambiguate.
    pub full_ref: String,
    pub is_current: bool,
    /// "local" or "remote". Used by the UI to group branches.
    pub kind: String,
    /// Remote name (e.g. "origin"). None for local branches.
    pub remote: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    pub initialized: bool,
    pub current_branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub has_changes: bool,
    pub has_remote: bool,
    pub has_commits: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelEntry {
    pub name: String,
    pub id: Option<String>,
    pub size: Option<String>,
    pub modified_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<OllamaModelEntry>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaChatMessage {
    pub role: String,
    pub content: String,
}

fn git_stdout_trim(args: &[&str], cwd: Option<&Path>) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    if let Some(c) = cwd {
        cmd.current_dir(c);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn git_status_output(args: &[&str], cwd: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            eprintln!("git stderr: {}", stderr);
        }
        return None;
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[tauri::command]
fn check_git_installation() -> GitCheckResult {
    match Command::new("git").arg("--version").output() {
        Ok(output) if output.status.success() => {
            let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
            GitCheckResult {
                installed: true,
                version: if line.is_empty() {
                    None
                } else {
                    Some(line)
                },
            }
        }
        _ => GitCheckResult {
            installed: false,
            version: None,
        },
    }
}

#[tauri::command]
fn get_git_global_identity() -> GitIdentity {
    GitIdentity {
        name: git_stdout_trim(&["config", "--global", "user.name"], None),
        email: git_stdout_trim(&["config", "--global", "user.email"], None),
    }
}

#[tauri::command]
fn set_git_global_identity(name: String, email: String) -> Result<(), String> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() {
        return Err("Git user name cannot be empty.".to_string());
    }
    if email.is_empty() {
        return Err("Git email cannot be empty.".to_string());
    }

    let run = |args: &[&str]| -> Result<(), String> {
        let output = Command::new("git")
            .args(args)
            .output()
            .map_err(|e| {
                format!(
                    "Could not run git ({e}). Install Git and ensure it is on your PATH."
                )
            })?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let msg = if stderr.is_empty() {
            format!("Git exited with status {}", output.status)
        } else {
            stderr
        };
        Err(msg)
    };

    run(&["config", "--global", "user.name", name])?;
    run(&["config", "--global", "user.email", email])?;
    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// GitHub CLI (`gh`) integration
// ────────────────────────────────────────────────────────────────────────────

/// Resolve which package manager (if any) this platform has available for a
/// one-click `gh` install. Returns the CLI name so the frontend can surface a
/// sensible label.
fn detect_gh_installer() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    {
        if Command::new("brew").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
            return Some("brew");
        }
        None
    }
    #[cfg(target_os = "windows")]
    {
        if Command::new("winget").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
            return Some("winget");
        }
        None
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        None
    }
}

#[tauri::command]
fn check_gh_installation() -> GhCheckResult {
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
    // `gh auth status` exits 0 when authenticated. We don't care about the
    // output — just whether the user can push with credentials.
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
        installer: if installed { None } else { detect_gh_installer().map(|s| s.to_string()) },
    };
    eprintln!(
        "[gh] check installed={} authenticated={} version={:?} installer={:?}",
        result.installed, result.authenticated, result.version, result.installer,
    );
    result
}

/// Run the platform's package manager to install `gh`. Blocks until the
/// installer exits. Returns the post-install check result so the UI can
/// update in one round-trip.
#[tauri::command]
fn install_gh_cli() -> Result<GhCheckResult, String> {
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
        // winget often puts the useful error on stdout.
        let msg = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if msg.is_empty() {
            format!("{installer} exited with status {}", output.status)
        } else {
            msg
        });
    }

    Ok(check_gh_installation())
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

/// Start the `gh auth login` device flow and stream its output to the
/// frontend. `gh` prints a one-time code and device URL, then waits for the
/// user to enter the code in their browser. We:
///   1. Spawn with piped stdio (no PTY — gh detects this and uses the device
///      flow, which is what we want).
///   2. Parse the code + URL from gh's output as soon as they appear.
///   3. Emit `gh-auth-code` with `{ code, url }` so the UI can show the code
///      and auto-open the browser.
///   4. Emit `gh-auth-done` when the process exits.
#[tauri::command]
async fn start_gh_auth_login(app: AppHandle) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command as TokioCommand;

    let mut child = TokioCommand::new("gh")
        .args([
            "auth", "login",
            "--web",
            "--hostname", "github.com",
            "--git-protocol", "https",
        ])
        // Force gh to not prompt for scopes interactively; it'll use defaults.
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

    // Parse output as it streams. Both the code and URL arrive before the
    // process exits, so we emit once we've seen both.
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
                        GhAuthCodePayload { code: c.clone(), url: u.clone() },
                    );
                    emitted = true;
                }
            }
        }
    });

    // Wait for the process to exit, then tell the UI how it went.
    tokio::spawn(async move {
        let payload = match child.wait().await {
            Ok(status) if status.success() => GhAuthDonePayload { success: true, error: None },
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

/// Match gh's one-time code. Format is `XXXX-XXXX` where X is uppercase
/// alphanumeric. Example line: `! First copy your one-time code: A11E-A326`.
fn extract_device_code(line: &str) -> Option<String> {
    let bytes = line.as_bytes();
    for i in 0..bytes.len().saturating_sub(8) {
        let slice = &bytes[i..i + 9];
        if slice[4] == b'-'
            && slice[..4].iter().all(|b| b.is_ascii_alphanumeric() && !b.is_ascii_lowercase())
            && slice[5..].iter().all(|b| b.is_ascii_alphanumeric() && !b.is_ascii_lowercase())
        {
            return Some(String::from_utf8_lossy(slice).to_string());
        }
    }
    None
}

/// Match the device verification URL gh prints. Anchored on the canonical
/// path so we don't pick up unrelated github.com URLs if the output ever
/// changes.
fn extract_device_url(line: &str) -> Option<String> {
    const NEEDLE: &str = "https://github.com/login/device";
    let idx = line.find(NEEDLE)?;
    let rest = &line[idx..];
    let end = rest
        .find(|c: char| c.is_whitespace())
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhPublishProgressPayload {
    /// A short, user-facing label for the current step.
    pub phase: String,
    /// Most recent line of output from gh/git, for live feedback.
    pub line: Option<String>,
}

/// Publish the current branch of the repo at `path` to GitHub.
///
/// - If the repo has no `origin` remote, runs `gh repo create` (which creates
///   the GitHub repo *and* wires up `origin` *and* pushes in one step). The
///   optional `repo_name` overrides gh's default (which is the directory
///   basename).
/// - Otherwise, pushes the branch with `-u origin <branch>` so tracking is set.
///
/// `visibility` must be one of: `"public"`, `"private"`, `"internal"`.
///
/// Streams progress via the `gh-publish-progress` event while it runs so the
/// UI isn't a dead spinner during the (often slow) push phase.
#[tauri::command]
async fn gh_publish_branch(
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
        // Fresh repo / no origin: `gh repo create` does the whole handshake —
        // creates the GitHub repo, wires up origin, and pushes the current
        // branch. This can easily take 30+ seconds depending on repo size and
        // network, so we stream gh's output to the UI as progress.
        emit_progress("Creating GitHub repository…", None);
        let visibility_flag = format!("--{visibility}");
        let mut args: Vec<String> = Vec::with_capacity(6);
        args.push("repo".into());
        args.push("create".into());
        let trimmed_name = repo_name.as_deref().map(str::trim).filter(|s| !s.is_empty());
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
                // Crude but effective phase detection — gh prints these in
                // order so the UI labels track what's actually happening.
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
        // Remote already set up — just publish the branch with tracking.
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
    Ok(GhPublishResult {
        remote_url,
        branch,
    })
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncProgressPayload {
    pub phase: String,
    pub line: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResult {
    pub pulled: bool,
    pub pushed: bool,
    pub ahead: u32,
    pub behind: u32,
}

/// Run `git` with streamed output, emitting lines over the given event name
/// with a caller-supplied phase label. Returns the combined output captured
/// from stdout+stderr so the caller can surface meaningful errors.
async fn run_git_streamed(
    app: &AppHandle,
    cwd: &Path,
    args: &[&str],
    event: &str,
    phase: &str,
) -> Result<(std::process::ExitStatus, String), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command as TokioCommand;

    eprintln!("[sync] exec git {args:?}");
    let mut child = TokioCommand::new("git")
        .args(args)
        .current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to run git: {e}"))?;

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

    let mut captured = String::new();
    let app_for_lines = app.clone();
    let event_name = event.to_string();
    let phase_label = phase.to_string();
    let drain_task = tokio::spawn(async move {
        let mut buf = String::new();
        while let Some(line) = rx.recv().await {
            eprintln!("[sync] :: {line}");
            let _ = app_for_lines.emit(
                event_name.as_str(),
                GitSyncProgressPayload {
                    phase: phase_label.clone(),
                    line: Some(line.clone()),
                },
            );
            buf.push_str(&line);
            buf.push('\n');
        }
        buf
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed waiting for git: {e}"))?;
    let output = drain_task.await.unwrap_or_default();
    captured.push_str(&output);
    Ok((status, captured))
}

/// Sync the current branch with its remote. Used by the "Sync Changes" CTA
/// once a remote is configured.
///
/// - Fetches first to get accurate ahead/behind.
/// - Pulls (rebase) if behind, to avoid an unnecessary merge commit.
/// - Pushes if ahead (or if this is the first push on a tracked branch).
///
/// Streams each step via `git-sync-progress`.
#[tauri::command]
async fn git_sync_branch(app: AppHandle, path: String) -> Result<GitSyncResult, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }

    let branch = git_stdout_trim(&["branch", "--show-current"], Some(p))
        .ok_or_else(|| "No current branch (detached HEAD?).".to_string())?;
    let has_origin = git_stdout_trim(&["remote", "get-url", "origin"], Some(p)).is_some();
    if !has_origin {
        return Err("This repository has no `origin` remote.".to_string());
    }

    eprintln!("[sync] branch={branch}");
    let _ = app.emit(
        "git-sync-progress",
        GitSyncProgressPayload {
            phase: "Fetching from origin…".to_string(),
            line: None,
        },
    );
    let (status, captured) = run_git_streamed(
        &app,
        p,
        &["fetch", "origin", &branch],
        "git-sync-progress",
        "Fetching from origin…",
    )
    .await?;
    if !status.success() {
        let trimmed = captured.trim().to_string();
        return Err(if trimmed.is_empty() {
            format!("git fetch exited with status {status}")
        } else {
            trimmed
        });
    }

    let ahead: u32 = git_stdout_trim(&["rev-list", "--count", "@{upstream}..HEAD"], Some(p))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let behind: u32 = git_stdout_trim(&["rev-list", "--count", "HEAD..@{upstream}"], Some(p))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    eprintln!("[sync] ahead={ahead} behind={behind}");

    let mut pulled = false;
    if behind > 0 {
        let (status, captured) = run_git_streamed(
            &app,
            p,
            &["pull", "--rebase", "origin", &branch],
            "git-sync-progress",
            "Pulling from origin…",
        )
        .await?;
        if !status.success() {
            let trimmed = captured.trim().to_string();
            return Err(if trimmed.is_empty() {
                format!("git pull exited with status {status}")
            } else {
                trimmed
            });
        }
        pulled = true;
    }

    let mut pushed = false;
    // Push if we're ahead *or* if upstream tracking isn't set yet (first push
    // after `git branch --set-upstream-to`-less setup).
    let upstream_missing = git_stdout_trim(
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        Some(p),
    )
    .is_none();
    if ahead > 0 || upstream_missing {
        let (status, captured) = run_git_streamed(
            &app,
            p,
            &["push", "-u", "origin", &branch],
            "git-sync-progress",
            "Pushing to origin…",
        )
        .await?;
        if !status.success() {
            let trimmed = captured.trim().to_string();
            return Err(if trimmed.is_empty() {
                format!("git push exited with status {status}")
            } else {
                trimmed
            });
        }
        pushed = true;
    }

    Ok(GitSyncResult {
        pulled,
        pushed,
        ahead,
        behind,
    })
}

#[tauri::command]
fn init_git_repo(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .arg("init")
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to run git init: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(true)
}

#[tauri::command]
fn get_git_repo_info(path: String) -> Result<GitRepoInfo, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let git_dir = p.join(".git");
    let initialized = git_dir.exists() && git_dir.is_dir();

    if !initialized {
        return Ok(GitRepoInfo {
            initialized: false,
            current_branch: None,
            ahead: 0,
            behind: 0,
            has_changes: false,
            has_remote: false,
            has_commits: false,
        });
    }

    let current_branch = git_stdout_trim(&["branch", "--show-current"], Some(p));
    let ahead = git_stdout_trim(&["rev-list", "--count", "@{upstream}..HEAD"], Some(p))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let behind = git_stdout_trim(&["rev-list", "--count", "HEAD..@{upstream}"], Some(p))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let status_output = git_status_output(&["status", "--porcelain=v1"], p);
    let has_changes = status_output.map(|s| !s.is_empty()).unwrap_or(false);

    // `origin` is the default remote VS Code treats as "published". If it's
    // missing the UI should prompt to publish; any other remote name still
    // counts as "has_remote" so we don't nag unnecessarily.
    let has_remote = git_stdout_trim(&["remote"], Some(p))
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    // `rev-parse --verify HEAD` exits non-zero on unborn HEAD.
    let has_commits = git_stdout_trim(&["rev-parse", "--verify", "HEAD"], Some(p)).is_some();

    eprintln!(
        "[git] repo_info path={path:?} branch={current_branch:?} has_commits={has_commits} has_remote={has_remote} has_changes={has_changes} ahead={ahead} behind={behind}"
    );

    Ok(GitRepoInfo {
        initialized: true,
        current_branch,
        ahead,
        behind,
        has_changes,
        has_remote,
        has_commits,
    })
}

#[tauri::command]
fn get_git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let git_dir = p.join(".git");
    if !git_dir.exists() || !git_dir.is_dir() {
        return Err("Not a git repository".to_string());
    }

    // `-z` produces NUL-terminated records with unquoted paths. Without it
    // git quotes any path containing spaces/special chars, and those literal
    // quotes end up in the stored path — later stage/unstage calls then fail
    // silently because git cannot find the quoted filename on disk.
    let output = Command::new("git")
        .args(&["status", "--porcelain=v1", "-uall", "-z"])
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }

    let mut files: Vec<GitFileStatus> = Vec::new();
    let mut records = output.stdout.split(|b| *b == 0u8).peekable();

    while let Some(record) = records.next() {
        if record.len() < 3 {
            continue;
        }
        let index_st = record[0] as char;
        let worktree_st = record[1] as char;
        // Skip the space between status and path.
        let file_path = String::from_utf8_lossy(&record[3..]).to_string();

        // Renames/copies emit two NUL-separated paths: "R  new\0old". The
        // second record is the old path; we only care about the new one, so
        // consume and drop it.
        if index_st == 'R' || index_st == 'C' {
            records.next();
        }

        let staged = index_st != ' ' && index_st != '?';
        let untracked = index_st == '?';
        let modified = index_st == 'M' || index_st == 'A' || index_st == 'D' || worktree_st == 'M';
        let deleted = index_st == 'D' || worktree_st == 'D';

        let status = match (index_st, worktree_st) {
            ('?', '?') => "untracked",
            ('M', ' ') | (' ', 'M') => "modified",
            ('D', ' ') | (' ', 'D') => "deleted",
            ('M', 'M') => "both_modified",
            ('A', ' ') | ('A', 'M') => "added",
            _ => "unknown",
        };

        files.push(GitFileStatus {
            path: file_path,
            status: status.to_string(),
            staged,
            untracked,
            modified,
            deleted,
        });
    }

    Ok(files)
}

#[tauri::command]
fn stage_file(path: String, file_path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .args(&["add", "--", &file_path])
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to stage file: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(())
}

#[tauri::command]
fn stage_all_files(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .arg("add")
        .arg("-A")
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to stage files: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(())
}

#[tauri::command]
fn unstage_file(path: String, file_path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    // Unborn branch: fall back to `rm --cached` for the single path, same
    // reasoning as unstage_all_files.
    let has_head = Command::new("git")
        .args(&["rev-parse", "--verify", "HEAD"])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let output = if has_head {
        Command::new("git")
            .args(&["reset", "HEAD", "--", &file_path])
            .current_dir(p)
            .output()
    } else {
        Command::new("git")
            .args(&["rm", "--cached", "--", &file_path])
            .current_dir(p)
            .output()
    }
    .map_err(|e| format!("Failed to unstage file: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(())
}

#[tauri::command]
fn unstage_all_files(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    // On an unborn branch (no commits yet) there is no HEAD to reset to,
    // so `git reset HEAD` fails with "ambiguous argument 'HEAD'". In that
    // case we clear the index with `git rm --cached -r .` which produces
    // the same visible result: all staged files return to untracked.
    let has_head = Command::new("git")
        .args(&["rev-parse", "--verify", "HEAD"])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let output = if has_head {
        Command::new("git")
            .args(&["reset", "HEAD"])
            .current_dir(p)
            .output()
    } else {
        Command::new("git")
            .args(&["rm", "--cached", "-r", "--", "."])
            .current_dir(p)
            .output()
    }
    .map_err(|e| format!("Failed to unstage files: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(())
}

#[tauri::command]
fn discard_file_changes(path: String, file_path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }

    // "Discard" means different things depending on the file's state:
    //   - tracked + modified:        restore from HEAD (git checkout HEAD -- <file>)
    //   - tracked + modified + staged: same
    //   - untracked:                 delete the file on disk
    //   - added (staged new file):   rm from index + delete on disk
    //
    // Plain `git checkout -- <file>` fails on untracked files ("pathspec did
    // not match") and on unborn branches (no HEAD). Dispatch based on the
    // actual state reported by git.

    let tracked = Command::new("git")
        .args(&["ls-files", "--error-unmatch", "--", &file_path])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let staged_added = Command::new("git")
        .args(&["diff", "--cached", "--name-only", "--diff-filter=A", "--", &file_path])
        .current_dir(p)
        .output()
        .map(|o| !o.stdout.is_empty() && o.status.success())
        .unwrap_or(false);

    let has_head = Command::new("git")
        .args(&["rev-parse", "--verify", "HEAD"])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if tracked && has_head && !staged_added {
        let output = Command::new("git")
            .args(&["checkout", "HEAD", "--", &file_path])
            .current_dir(p)
            .output()
            .map_err(|e| format!("Failed to discard changes: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(stderr);
        }
        return Ok(());
    }

    // Added-to-index or untracked: remove from index if needed, then delete
    // on disk. Both operations are idempotent — missing-from-index is fine,
    // missing-on-disk is fine.
    if staged_added || tracked {
        let _ = Command::new("git")
            .args(&["rm", "--cached", "--force", "--", &file_path])
            .current_dir(p)
            .output();
    }

    let target = p.join(&file_path);
    if target.exists() {
        std::fs::remove_file(&target)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn commit_changes(path: String, message: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .args(&["commit", "-m", &message])
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    let hash = git_stdout_trim(&["rev-parse", "HEAD"], Some(p)).unwrap_or_default();
    Ok(hash)
}

#[tauri::command]
fn get_git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    // `for-each-ref` with a custom format is far easier to parse than
    // `git branch -a`: tabs separate fields, no asterisk prefixes, no "(no
    // branch)" surprises. We emit local + remote refs in one pass.
    //   %(refname)          full ref (refs/heads/foo or refs/remotes/origin/foo)
    //   %(refname:short)    short display name
    //   %(HEAD)             "*" for the currently checked-out branch
    let output = Command::new("git")
        .args([
            "for-each-ref",
            "--format=%(refname)%09%(refname:short)%09%(HEAD)",
            "refs/heads",
            "refs/remotes",
        ])
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to get branches: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<GitBranch> = Vec::new();
    for line in output_str.lines() {
        let mut parts = line.splitn(3, '\t');
        let refname = parts.next().unwrap_or("");
        let short = parts.next().unwrap_or("").to_string();
        let head = parts.next().unwrap_or("");
        if refname.is_empty() || short.is_empty() {
            continue;
        }

        if let Some(local) = refname.strip_prefix("refs/heads/") {
            branches.push(GitBranch {
                name: local.to_string(),
                full_ref: local.to_string(),
                is_current: head == "*",
                kind: "local".to_string(),
                remote: None,
            });
        } else if let Some(remote_path) = refname.strip_prefix("refs/remotes/") {
            // Skip `refs/remotes/origin/HEAD` — it's a symbolic ref, not a
            // checkoutable branch; showing it clutters the UI.
            if remote_path.ends_with("/HEAD") {
                continue;
            }
            // `short` is already `origin/foo` — split off the remote name.
            let (remote, name) = match short.split_once('/') {
                Some((r, n)) => (r.to_string(), n.to_string()),
                None => continue,
            };
            branches.push(GitBranch {
                name,
                full_ref: short,
                is_current: false,
                kind: "remote".to_string(),
                remote: Some(remote),
            });
        }
    }

    Ok(branches)
}

/// Create a new branch. If `checkout` is true, switches to it immediately
/// (`git checkout -b`); otherwise just creates the ref (`git branch`) so the
/// user stays on their current branch.
#[tauri::command]
fn create_git_branch(
    path: String,
    branch_name: String,
    checkout: Option<bool>,
) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let name = branch_name.trim();
    if name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    let args: &[&str] = if checkout.unwrap_or(true) {
        &["checkout", "-b", name]
    } else {
        &["branch", name]
    };
    let output = Command::new("git")
        .args(args)
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to create branch: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git exited with status {}", output.status)
        } else {
            stderr
        });
    }
    Ok(())
}

/// Checkout a branch. Accepts either a local short name (`feature/foo`) or a
/// remote ref (`origin/feature/foo`) — in the remote case a local tracking
/// branch is created automatically.
///
/// Refuses to run when the working tree has changes that checkout would
/// clobber. The caller is expected to either commit, stash, or discard first;
/// we deliberately *don't* auto-stash since that's a destructive side effect
/// most users want to see happen explicitly.
#[tauri::command]
fn checkout_branch(path: String, branch_name: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }

    let current = git_stdout_trim(&["branch", "--show-current"], Some(p))
        .or_else(|| git_stdout_trim(&["symbolic-ref", "--short", "HEAD"], Some(p)));
    // No-op when already on that branch; also works around unborn HEAD.
    if current.as_deref() == Some(branch_name.as_str()) {
        return Ok(());
    }

    // Detect a remote ref like `origin/feature/foo` and promote it to a
    // local tracking branch so the user doesn't end up detached. We only
    // check the first segment against known remotes — otherwise a local
    // branch named `origin/foo` (unusual but legal) would be misrouted.
    let remotes = git_stdout_trim(&["remote"], Some(p)).unwrap_or_default();
    let is_remote_ref = branch_name.split_once('/').is_some_and(|(head, _)| {
        remotes.lines().any(|r| r.trim() == head)
    }) && git_stdout_trim(
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/remotes/{branch_name}"),
        ],
        Some(p),
    )
    .is_some() == false
        // `show-ref --verify --quiet` exits 0 on match but prints nothing, so
        // `git_stdout_trim` returns None; re-run explicitly to check.
        && Command::new("git")
            .args([
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/remotes/{branch_name}"),
            ])
            .current_dir(p)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

    let args: Vec<String> = if is_remote_ref {
        // `git checkout -t origin/foo` creates local `foo` tracking the remote.
        let local_name = branch_name
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_else(|| branch_name.clone());
        // If a local branch with that name already exists (diverged), fall
        // back to a plain checkout so git does the right thing.
        let local_exists = Command::new("git")
            .args([
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{local_name}"),
            ])
            .current_dir(p)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if local_exists {
            vec!["checkout".into(), local_name]
        } else {
            vec!["checkout".into(), "-t".into(), branch_name.clone()]
        }
    } else {
        vec!["checkout".into(), branch_name.clone()]
    };

    let output = Command::new("git")
        .args(&args)
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to checkout branch: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // Surface git's "would be overwritten" error as a cleaner message.
        let friendly = if stderr.contains("would be overwritten") {
            "You have uncommitted changes that would be overwritten by switching branches. Commit, stash, or discard them and try again.".to_string()
        } else if stderr.is_empty() {
            format!("git checkout exited with status {}", output.status)
        } else {
            stderr
        };
        return Err(friendly);
    }
    Ok(())
}

#[tauri::command]
fn get_recent_commits(path: String, limit: u32) -> Result<Vec<GitCommitEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .args(&["log", &format!("-{}", limit), "--pretty=format:%H|%h|%s|%an|%ad", "--date=short"])
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to get commits: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<GitCommitEntry> = output_str
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 5 {
                Some(GitCommitEntry {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    message: parts[2].to_string(),
                    author: parts[3].to_string(),
                    date: parts[4].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
fn get_file_diff(path: String, file_path: String, staged: bool) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let git_dir = p.join(".git");
    if !git_dir.exists() || !git_dir.is_dir() {
        return Err("Not a git repository".to_string());
    }

    let args = if staged {
        &["diff", "--cached", "--", &file_path] as &[&str]
    } else {
        &["diff", "--", &file_path] as &[&str]
    };

    let output = Command::new("git")
        .args(args)
        .current_dir(p)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    if diff.is_empty() {
        return Ok("(no diff)".to_string());
    }
    Ok(diff)
}

#[tauri::command]
fn get_default_workspace_path() -> Result<String, String> {
    let docs = dirs::document_dir().ok_or_else(|| {
        "Could not resolve your Documents folder. Set a workspace folder manually.".to_string()
    })?;
    Ok(docs.join("notelab").to_string_lossy().to_string())
}


#[tauri::command]
fn get_ollama_status() -> OllamaStatus {
    let output = match Command::new("ollama").arg("list").output() {
        Ok(output) => output,
        Err(error) => {
            return OllamaStatus {
                installed: false,
                running: false,
                models: vec![],
                error: Some(format!("Ollama is not installed or not available on PATH: {}", error)),
            };
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return OllamaStatus {
            installed: true,
            running: false,
            models: vec![],
            error: Some(if stderr.is_empty() {
                "Ollama is installed, but the local server is not running.".to_string()
            } else {
                stderr
            }),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    for (index, line) in stdout.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || index == 0 {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let modified_at = if parts.len() > 3 {
            Some(parts[3..].join(" "))
        } else {
            None
        };

        models.push(OllamaModelEntry {
            name: parts[0].to_string(),
            id: parts.get(1).map(|value| value.to_string()),
            size: parts.get(2).map(|value| value.to_string()),
            modified_at,
        });
    }

    OllamaStatus {
        installed: true,
        running: true,
        models,
        error: None,
    }
}

#[tauri::command]
async fn pull_ollama_model(model: String) -> Result<(), String> {
    let trimmed_model = model.trim().to_string();
    if trimmed_model.is_empty() {
        return Err("Model name cannot be empty.".to_string());
    }

    let child = std::process::Command::new("ollama")
        .arg("pull")
        .arg(&trimmed_model)
        .spawn()
        .map_err(|error| format!("Failed to start Ollama: {}", error))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for Ollama: {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Failed to pull model '{}'.", trimmed_model)
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn search_ollama_models(query: String) -> Result<Vec<String>, String> {
    let output = Command::new("ollama")
        .arg("list")
        .output()
        .map_err(|error| format!("Failed to run ollama list: {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to list Ollama models.".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let query_lower = query.to_lowercase();

    let models: Vec<String> = stdout
        .lines()
        .skip(1) // Skip header line
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            let name = trimmed.split_whitespace().next()?.to_string();
            if name.to_lowercase().contains(&query_lower) {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    Ok(models)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OllamaChunkPayload {
    chat_id: String,
    delta: String,
    done: bool,
    error: Option<String>,
}

fn chunk_event_name(chat_id: &str) -> String {
    format!("ollama-chat-chunk:{}", chat_id)
}

#[tauri::command]
async fn chat_with_ollama_stream(
    app: AppHandle,
    chat_id: String,
    model: String,
    messages: Vec<OllamaChatMessage>,
) -> Result<(), String> {
    let trimmed_model = model.trim().to_string();
    if trimmed_model.is_empty() {
        return Err("Choose a local model before sending a message.".to_string());
    }

    if messages.is_empty() {
        return Err("Cannot send an empty conversation to Ollama.".to_string());
    }

    let event = chunk_event_name(&chat_id);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|error| format!("Failed to create Ollama client: {}", error))?;

    let response = client
        .post("http://127.0.0.1:11434/api/chat")
        .json(&json!({
            "model": trimmed_model,
            "messages": messages,
            "stream": true
        }))
        .send()
        .await
        .map_err(|error| format!("Failed to reach Ollama. Make sure it is running: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "No error details returned by Ollama.".to_string());
        return Err(format!("Ollama request failed ({}): {}", status, body));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|error| format!("Ollama stream error: {}", error))?;
        let text = match std::str::from_utf8(&bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };
        buffer.push_str(text);

        while let Some(newline_idx) = buffer.find('\n') {
            let line = buffer[..newline_idx].trim().to_string();
            buffer.drain(..=newline_idx);
            if line.is_empty() {
                continue;
            }

            let parsed: serde_json::Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(error) => {
                    return Err(format!("Failed to parse Ollama stream chunk: {}", error));
                }
            };

            if let Some(error_message) = parsed.get("error").and_then(|v| v.as_str()) {
                let payload = OllamaChunkPayload {
                    chat_id: chat_id.clone(),
                    delta: String::new(),
                    done: true,
                    error: Some(error_message.to_string()),
                };
                let _ = app.emit(&event, payload);
                return Err(error_message.to_string());
            }

            let delta = parsed
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            let done = parsed.get("done").and_then(|v| v.as_bool()).unwrap_or(false);

            if !delta.is_empty() || done {
                let payload = OllamaChunkPayload {
                    chat_id: chat_id.clone(),
                    delta,
                    done,
                    error: None,
                };
                let _ = app.emit(&event, payload);
            }

            if done {
                return Ok(());
            }
        }
    }

    let final_payload = OllamaChunkPayload {
        chat_id: chat_id.clone(),
        delta: String::new(),
        done: true,
        error: None,
    };
    let _ = app.emit(&event, final_payload);

    Ok(())
}

#[tauri::command]
async fn rebuild_workspace_index(
    app: AppHandle,
    workspace: String,
    force_full: Option<bool>,
) -> Result<bool, String> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        workspace_index::rebuild_workspace_index(&handle, &workspace, force_full.unwrap_or(false))
    })
    .await
    .map_err(|error| format!("Workspace indexing task failed: {}", error))?
}

#[tauri::command]
fn read_workspace_index_snapshot(
    workspace: String,
) -> Result<workspace_index::WorkspaceIndexSnapshot, String> {
    workspace_index::read_workspace_index_snapshot(&workspace)
}

#[tauri::command]
fn get_workspace_index_summary(
    workspace: String,
) -> Result<Option<workspace_index::WikiLinkMetaRecord>, String> {
    workspace_index::get_workspace_index_summary(&workspace)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_git_installation,
            get_git_global_identity,
            set_git_global_identity,
            check_gh_installation,
            install_gh_cli,
            start_gh_auth_login,
            gh_publish_branch,
            git_sync_branch,
            init_git_repo,
            get_git_repo_info,
            get_git_status,
            stage_file,
            stage_all_files,
            unstage_file,
            unstage_all_files,
            discard_file_changes,
            commit_changes,
            get_git_branches,
            create_git_branch,
            checkout_branch,
            get_recent_commits,
            get_file_diff,
            get_default_workspace_path,
            get_ollama_status,
            pull_ollama_model,
            search_ollama_models,
            chat_with_ollama_stream,
            rebuild_workspace_index,
            read_workspace_index_snapshot,
            get_workspace_index_summary,
            meeting_capture::start_meeting_capture,
            meeting_capture::stop_meeting_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
