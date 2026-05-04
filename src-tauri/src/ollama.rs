use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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
pub fn get_ollama_status() -> OllamaStatus {
    let output = match Command::new("ollama").arg("list").output() {
        Ok(output) => output,
        Err(error) => {
            return OllamaStatus {
                installed: false,
                running: false,
                models: vec![],
                error: Some(format!(
                    "Ollama is not installed or not available on PATH: {}",
                    error
                )),
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
pub async fn pull_ollama_model(model: String) -> Result<(), String> {
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
pub fn search_ollama_models(query: String) -> Result<Vec<String>, String> {
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
        .skip(1)
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

#[tauri::command]
pub async fn chat_with_ollama_stream(
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
            let done = parsed
                .get("done")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

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
