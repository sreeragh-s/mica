use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::SystemTime,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CliProviderStatus {
    pub id: String,
    pub name: String,
    pub logo_provider: String,
    pub installed: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CliProviderModel {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CliChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CliChatChunkPayload {
    chat_id: String,
    delta: String,
    done: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CliChatLogPayload {
    chat_id: String,
    provider_id: String,
    level: String,
    message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CliChatFileChangedPayload {
    chat_id: String,
    path: String,
}

struct CliProvider {
    id: &'static str,
    name: &'static str,
    binary: &'static str,
    logo_provider: &'static str,
}

const PROVIDERS: &[CliProvider] = &[
    CliProvider {
        id: "codex",
        name: "Codex",
        binary: "codex",
        logo_provider: "openai",
    },
    CliProvider {
        id: "opencode",
        name: "OpenCode",
        binary: "opencode",
        logo_provider: "opencode",
    },
    CliProvider {
        id: "claude",
        name: "Claude",
        binary: "claude",
        logo_provider: "anthropic",
    },
];

fn chunk_event_name(chat_id: &str) -> String {
    format!("cli-chat-chunk:{}", chat_id)
}

fn log_event_name(chat_id: &str) -> String {
    format!("cli-chat-log:{}", chat_id)
}

fn file_changed_event_name(chat_id: &str) -> String {
    format!("cli-chat-file-changed:{}", chat_id)
}

fn emit_cli_log(
    app: &AppHandle,
    chat_id: &str,
    provider_id: &str,
    level: &str,
    message: impl Into<String>,
) {
    let message = message.into();
    eprintln!("[cli-chat:{provider_id}:{chat_id}:{level}] {message}");
    let _ = app.emit(
        &log_event_name(chat_id),
        CliChatLogPayload {
            chat_id: chat_id.to_string(),
            provider_id: provider_id.to_string(),
            level: level.to_string(),
            message,
        },
    );
}

fn provider_by_id(provider_id: &str) -> Option<&'static CliProvider> {
    PROVIDERS.iter().find(|provider| provider.id == provider_id)
}

fn provider_binary_candidates(provider: &CliProvider) -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from(provider.binary)];

    for prefix in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        candidates.push(PathBuf::from(prefix).join(provider.binary));
    }

    if let Some(home) = dirs::home_dir() {
        match provider.id {
            "codex" => candidates.push(home.join(".local/bin/codex")),
            "opencode" => candidates.push(home.join(".opencode/bin/opencode")),
            "claude" => {
                candidates.push(home.join(".claude/local/claude"));
                candidates.push(home.join(".local/bin/claude"));
            }
            _ => {}
        }
    }

    candidates
}

async fn run_provider_version(
    provider: &CliProvider,
) -> Result<(PathBuf, std::process::Output), String> {
    let mut last_error = None;

    for candidate in provider_binary_candidates(provider) {
        match Command::new(&candidate).arg("--version").output().await {
            Ok(output) => return Ok((candidate, output)),
            Err(error) => last_error = Some(error),
        }
    }

    Err(format!(
        "{} CLI (`{}`) is not installed or not available on PATH: {}",
        provider.name,
        provider.binary,
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "command not found".to_string())
    ))
}

fn parse_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|part| {
            let numeric_count = part.chars().filter(|ch| ch.is_ascii_digit()).count();
            numeric_count > 0 && part.contains('.')
        })
        .map(|part| {
            part.trim_matches(|ch: char| {
                !(ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '+')
            })
            .to_string()
        })
}

fn build_prompt(messages: &[CliChatMessage]) -> String {
    messages
        .iter()
        .filter_map(|message| {
            let content = message.content.trim();
            if content.is_empty() {
                return None;
            }

            let role = match message.role.as_str() {
                "assistant" => "Assistant",
                "system" => "System",
                _ => "User",
            };
            Some(format!("{role}: {content}"))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn title_case_model_id(value: &str) -> String {
    value
        .split(['-', '_', '/', '.'])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if segment.eq_ignore_ascii_case("gpt") {
                return "GPT".to_string();
            }
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn fallback_models(provider_id: &str) -> Vec<CliProviderModel> {
    let ids: &[&str] = match provider_id {
        "codex" => &["gpt-5.2", "gpt-5.1-codex", "gpt-5-codex", "gpt-5"],
        "claude" => &[
            "claude-opus-4-7",
            "claude-opus-4-6",
            "claude-opus-4-5",
            "claude-sonnet-4-6",
            "claude-haiku-4-5",
        ],
        "opencode" => &["opencode/gpt-5-nano"],
        _ => &[],
    };

    ids.iter()
        .map(|id| CliProviderModel {
            id: (*id).to_string(),
            name: title_case_model_id(id),
        })
        .collect()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FileSnapshot {
    len: u64,
    modified: Option<SystemTime>,
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn collect_markdown_snapshot(root: &Path) -> HashMap<PathBuf, FileSnapshot> {
    fn visit(root: &Path, current: &Path, snapshot: &mut HashMap<PathBuf, FileSnapshot>) {
        let Ok(entries) = fs::read_dir(current) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            let file_name = file_name.to_string_lossy();
            if file_name == ".git" || file_name == "node_modules" || file_name == "target" {
                continue;
            }

            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                visit(root, &path, snapshot);
                continue;
            }
            if !metadata.is_file() || !is_markdown_path(&path) {
                continue;
            }

            let relative_path = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
            snapshot.insert(
                relative_path,
                FileSnapshot {
                    len: metadata.len(),
                    modified: metadata.modified().ok(),
                },
            );
        }
    }

    let mut snapshot = HashMap::new();
    visit(root, root, &mut snapshot);
    snapshot
}

fn changed_markdown_files(
    root: &Path,
    before: &HashMap<PathBuf, FileSnapshot>,
    after: &HashMap<PathBuf, FileSnapshot>,
) -> Vec<PathBuf> {
    let mut changed = Vec::new();

    for (relative_path, after_snapshot) in after {
        if before.get(relative_path) != Some(after_snapshot) {
            changed.push(root.join(relative_path));
        }
    }

    changed.sort();
    changed
}

fn parse_opencode_models(output: &str) -> Vec<CliProviderModel> {
    let mut models = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in output.lines() {
        let id = line.trim();
        if id.is_empty() || id.starts_with("Usage:") || id.starts_with("Options:") {
            continue;
        }
        if !id.contains('/') || !seen.insert(id.to_string()) {
            continue;
        }
        models.push(CliProviderModel {
            id: id.to_string(),
            name: title_case_model_id(id),
        });
    }

    models
}

fn command_for_provider(
    provider: &CliProvider,
    binary_path: &PathBuf,
    prompt: &str,
    model: Option<&str>,
) -> Command {
    let mut command = Command::new(binary_path);
    command.env("NO_COLOR", "1");
    let selected_model = model.map(str::trim).filter(|value| !value.is_empty());

    match provider.id {
        "codex" => {
            command
                .arg("exec")
                .arg("--ephemeral")
                .arg("--skip-git-repo-check")
                .arg("-s")
                .arg("workspace-write")
                .arg("--color")
                .arg("never");
            if let Some(model) = selected_model {
                command.arg("--model").arg(model);
            }
            command.arg("-");
        }
        "claude" => {
            command.arg("-p").arg("--dangerously-skip-permissions");
            if let Some(model) = selected_model {
                command.arg("--model").arg(model);
            }
        }
        "opencode" => {
            command
                .arg("run")
                .arg("--format")
                .arg("default")
                .arg("--dangerously-skip-permissions");
            if let Some(model) = selected_model {
                command.arg("-m").arg(model);
            }
            command.arg(prompt);
        }
        _ => {}
    }

    command
}

#[tauri::command]
pub async fn list_cli_provider_models(
    provider_id: String,
) -> Result<Vec<CliProviderModel>, String> {
    let provider = provider_by_id(&provider_id)
        .ok_or_else(|| format!("Unknown CLI provider '{}'.", provider_id))?;
    let (binary_path, version_output) = run_provider_version(provider).await?;
    if !version_output.status.success() {
        return Err(format!(
            "{} CLI is installed but failed to run.",
            provider.name
        ));
    }

    if provider.id != "opencode" {
        return Ok(fallback_models(provider.id));
    }

    let output = Command::new(binary_path)
        .arg("models")
        .output()
        .await
        .map_err(|error| format!("Failed to list OpenCode models: {}", error))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Ok(if stderr.is_empty() {
            fallback_models(provider.id)
        } else {
            vec![CliProviderModel {
                id: "opencode/gpt-5-nano".to_string(),
                name: format!("OpenCode default ({stderr})"),
            }]
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let models = parse_opencode_models(&stdout);
    Ok(if models.is_empty() {
        fallback_models(provider.id)
    } else {
        models
    })
}

#[tauri::command]
pub async fn list_cli_providers() -> Vec<CliProviderStatus> {
    let mut statuses = Vec::new();

    for provider in PROVIDERS {
        let output = run_provider_version(provider).await;

        match output {
            Ok((_binary_path, output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let combined = format!("{stdout}\n{stderr}");
                statuses.push(CliProviderStatus {
                    id: provider.id.to_string(),
                    name: provider.name.to_string(),
                    logo_provider: provider.logo_provider.to_string(),
                    installed: output.status.success(),
                    version: parse_version(&combined),
                    error: if output.status.success() {
                        None
                    } else {
                        let detail = combined.trim();
                        Some(if detail.is_empty() {
                            format!("{} is installed but failed to run.", provider.name)
                        } else {
                            detail.to_string()
                        })
                    },
                });
            }
            Err(error) => statuses.push(CliProviderStatus {
                id: provider.id.to_string(),
                name: provider.name.to_string(),
                logo_provider: provider.logo_provider.to_string(),
                installed: false,
                version: None,
                error: Some(error),
            }),
        }
    }

    statuses
}

#[tauri::command]
pub async fn chat_with_cli_provider_stream(
    app: AppHandle,
    chat_id: String,
    provider_id: String,
    model: Option<String>,
    cwd: Option<String>,
    messages: Vec<CliChatMessage>,
) -> Result<(), String> {
    let provider = provider_by_id(&provider_id)
        .ok_or_else(|| format!("Unknown CLI provider '{}'.", provider_id))?;
    if messages.is_empty() {
        return Err("Cannot send an empty conversation.".to_string());
    }

    let prompt = build_prompt(&messages);
    if prompt.trim().is_empty() {
        return Err("Cannot send an empty message.".to_string());
    }

    let event = chunk_event_name(&chat_id);
    let (binary_path, version_output) = run_provider_version(provider).await?;
    if !version_output.status.success() {
        return Err(format!(
            "{} CLI is installed but failed to run.",
            provider.name
        ));
    }

    let working_dir = cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);

    emit_cli_log(
        &app,
        &chat_id,
        provider.id,
        "info",
        format!(
            "starting {} with binary='{}' model='{}' cwd='{}' prompt_chars={}",
            provider.name,
            binary_path.display(),
            model.as_deref().unwrap_or("<default>"),
            working_dir
                .as_ref()
                .map(|path| path.display().to_string())
                .unwrap_or_else(|| "<app>".to_string()),
            prompt.len()
        ),
    );

    let markdown_snapshot_before = working_dir
        .as_ref()
        .filter(|path| path.is_dir())
        .map(|path| {
            let snapshot = collect_markdown_snapshot(path);
            emit_cli_log(
                &app,
                &chat_id,
                provider.id,
                "debug",
                format!(
                    "tracked {} markdown files before CLI run in '{}'",
                    snapshot.len(),
                    path.display()
                ),
            );
            snapshot
        });

    let mut command = command_for_provider(provider, &binary_path, &prompt, model.as_deref());
    if let Some(working_dir) = &working_dir {
        command.current_dir(working_dir);
    }
    if provider.id == "opencode" {
        command.stdin(Stdio::null());
    } else {
        command.stdin(Stdio::piped());
    }
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start {} CLI: {}", provider.name, error))?;
    emit_cli_log(
        &app,
        &chat_id,
        provider.id,
        "info",
        format!("spawned {} process", provider.name),
    );

    if provider.id != "opencode" {
        if let Some(mut stdin) = child.stdin.take() {
            let prompt = prompt.clone();
            tokio::spawn(async move {
                let _ = stdin.write_all(prompt.as_bytes()).await;
                let _ = stdin.shutdown().await;
            });
        }
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Failed to capture {} stdout.", provider.name))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Failed to capture {} stderr.", provider.name))?;

    let stderr_app = app.clone();
    let stderr_chat_id = chat_id.clone();
    let stderr_provider_id = provider.id.to_string();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut output = String::new();
        let mut suppress_codex_final_answer = false;
        while let Ok(Some(line)) = reader.next_line().await {
            let trimmed_line = line.trim();
            if stderr_provider_id == "codex" && trimmed_line == "codex" {
                suppress_codex_final_answer = true;
                continue;
            }
            if suppress_codex_final_answer {
                if trimmed_line.starts_with("tokens used") {
                    suppress_codex_final_answer = false;
                }
                continue;
            }

            if !output.is_empty() {
                output.push('\n');
            }
            output.push_str(&line);
            emit_cli_log(
                &stderr_app,
                &stderr_chat_id,
                &stderr_provider_id,
                "debug",
                format!("stderr: {line}"),
            );
        }
        output
    });

    let mut stdout_reader = BufReader::new(stdout).lines();
    while let Some(line) = stdout_reader
        .next_line()
        .await
        .map_err(|error| format!("Failed to read {} output: {}", provider.name, error))?
    {
        if line.trim().is_empty() {
            continue;
        }

        emit_cli_log(
            &app,
            &chat_id,
            provider.id,
            "debug",
            format!("stdout: {line}"),
        );
        let payload = CliChatChunkPayload {
            chat_id: chat_id.clone(),
            delta: format!("{line}\n"),
            done: false,
            error: None,
        };
        let _ = app.emit(&event, payload);
    }

    let status = child
        .wait()
        .await
        .map_err(|error| format!("Failed to wait for {} CLI: {}", provider.name, error))?;
    let stderr_output = stderr_task.await.unwrap_or_default();
    emit_cli_log(
        &app,
        &chat_id,
        provider.id,
        if status.success() { "info" } else { "error" },
        format!("{} process exited with status {}", provider.name, status),
    );

    if !status.success() {
        let detail = stderr_output.trim();
        let message = if detail.is_empty() {
            format!("{} CLI failed with status {}.", provider.name, status)
        } else {
            detail.to_string()
        };
        let payload = CliChatChunkPayload {
            chat_id: chat_id.clone(),
            delta: String::new(),
            done: true,
            error: Some(message.clone()),
        };
        let _ = app.emit(&event, payload);
        return Err(message);
    }

    if let (Some(working_dir), Some(snapshot_before)) = (&working_dir, &markdown_snapshot_before) {
        let snapshot_after = collect_markdown_snapshot(working_dir);
        let changed_files = changed_markdown_files(working_dir, snapshot_before, &snapshot_after);

        emit_cli_log(
            &app,
            &chat_id,
            provider.id,
            "info",
            format!(
                "detected {} changed markdown files after CLI run",
                changed_files.len()
            ),
        );

        for path in changed_files {
            let path = path.to_string_lossy().to_string();
            emit_cli_log(
                &app,
                &chat_id,
                provider.id,
                "info",
                format!("changed markdown file: {path}"),
            );
            let _ = app.emit(
                &file_changed_event_name(&chat_id),
                CliChatFileChangedPayload {
                    chat_id: chat_id.clone(),
                    path,
                },
            );
        }
    } else {
        emit_cli_log(
            &app,
            &chat_id,
            provider.id,
            "debug",
            "skipped markdown change detection because no workspace cwd was provided",
        );
    }

    let final_payload = CliChatChunkPayload {
        chat_id,
        delta: String::new(),
        done: true,
        error: None,
    };
    let _ = app.emit(&event, final_payload);

    Ok(())
}
