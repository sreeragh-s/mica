use crate::git_support::{git_status_output, git_stdout_trim};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckResult {
    pub installed: bool,
    pub version: Option<String>,
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
    pub name: String,
    pub full_ref: String,
    pub is_current: bool,
    pub kind: String,
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

#[tauri::command]
pub fn check_git_installation() -> GitCheckResult {
    match Command::new("git").arg("--version").output() {
        Ok(output) if output.status.success() => {
            let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
            GitCheckResult {
                installed: true,
                version: if line.is_empty() { None } else { Some(line) },
            }
        }
        _ => GitCheckResult {
            installed: false,
            version: None,
        },
    }
}

#[tauri::command]
pub fn get_git_global_identity() -> GitIdentity {
    GitIdentity {
        name: git_stdout_trim(&["config", "--global", "user.name"], None),
        email: git_stdout_trim(&["config", "--global", "user.email"], None),
    }
}

#[tauri::command]
pub fn set_git_global_identity(name: String, email: String) -> Result<(), String> {
    let name = name.trim();
    let email = email.trim();
    if name.is_empty() {
        return Err("Git user name cannot be empty.".to_string());
    }
    if email.is_empty() {
        return Err("Git email cannot be empty.".to_string());
    }

    let run = |args: &[&str]| -> Result<(), String> {
        let output = Command::new("git").args(args).output().map_err(|e| {
            format!("Could not run git ({e}). Install Git and ensure it is on your PATH.")
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

#[tauri::command]
pub async fn git_sync_branch(app: AppHandle, path: String) -> Result<GitSyncResult, String> {
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
    let upstream_missing = git_stdout_trim(
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
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
pub fn init_git_repo(path: String) -> Result<bool, String> {
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
pub fn get_git_repo_info(path: String) -> Result<GitRepoInfo, String> {
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

    let has_remote = git_stdout_trim(&["remote"], Some(p))
        .map(|s| !s.is_empty())
        .unwrap_or(false);
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
pub fn get_git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let git_dir = p.join(".git");
    if !git_dir.exists() || !git_dir.is_dir() {
        return Err("Not a git repository".to_string());
    }

    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-uall", "-z"])
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
        let file_path = String::from_utf8_lossy(&record[3..]).to_string();

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
pub fn stage_file(path: String, file_path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .args(["add", "--", &file_path])
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
pub fn stage_all_files(path: String) -> Result<(), String> {
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
pub fn unstage_file(path: String, file_path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let has_head = Command::new("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let output = if has_head {
        Command::new("git")
            .args(["reset", "HEAD", "--", &file_path])
            .current_dir(p)
            .output()
    } else {
        Command::new("git")
            .args(["rm", "--cached", "--", &file_path])
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
pub fn unstage_all_files(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let has_head = Command::new("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let output = if has_head {
        Command::new("git")
            .args(["reset", "HEAD"])
            .current_dir(p)
            .output()
    } else {
        Command::new("git")
            .args(["rm", "--cached", "-r", "--", "."])
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
pub fn discard_file_changes(path: String, file_path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }

    let tracked = Command::new("git")
        .args(["ls-files", "--error-unmatch", "--", &file_path])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let staged_added = Command::new("git")
        .args([
            "diff",
            "--cached",
            "--name-only",
            "--diff-filter=A",
            "--",
            &file_path,
        ])
        .current_dir(p)
        .output()
        .map(|o| !o.stdout.is_empty() && o.status.success())
        .unwrap_or(false);

    let has_head = Command::new("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .current_dir(p)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if tracked && has_head && !staged_added {
        let output = Command::new("git")
            .args(["checkout", "HEAD", "--", &file_path])
            .current_dir(p)
            .output()
            .map_err(|e| format!("Failed to discard changes: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(stderr);
        }
        return Ok(());
    }

    if staged_added || tracked {
        let _ = Command::new("git")
            .args(["rm", "--cached", "--force", "--", &file_path])
            .current_dir(p)
            .output();
    }

    let target = p.join(&file_path);
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn commit_changes(path: String, message: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .args(["commit", "-m", &message])
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
pub fn get_git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
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
            if remote_path.ends_with("/HEAD") {
                continue;
            }
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

#[tauri::command]
pub fn create_git_branch(
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

#[tauri::command]
pub fn checkout_branch(path: String, branch_name: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }

    let current = git_stdout_trim(&["branch", "--show-current"], Some(p))
        .or_else(|| git_stdout_trim(&["symbolic-ref", "--short", "HEAD"], Some(p)));
    if current.as_deref() == Some(branch_name.as_str()) {
        return Ok(());
    }

    let remotes = git_stdout_trim(&["remote"], Some(p)).unwrap_or_default();
    let is_remote_ref = branch_name
        .split_once('/')
        .is_some_and(|(head, _)| remotes.lines().any(|r| r.trim() == head))
        && git_stdout_trim(
            &[
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/remotes/{branch_name}"),
            ],
            Some(p),
        )
        .is_none()
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
        let local_name = branch_name
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_else(|| branch_name.clone());
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
pub fn get_recent_commits(path: String, limit: u32) -> Result<Vec<GitCommitEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Path '{}' is not a valid directory", path));
    }
    let output = Command::new("git")
        .args([
            "log",
            &format!("-{}", limit),
            "--pretty=format:%H|%h|%s|%an|%ad",
            "--date=short",
        ])
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
pub fn get_file_diff(path: String, file_path: String, staged: bool) -> Result<String, String> {
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
