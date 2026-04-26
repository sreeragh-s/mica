// Meeting transcription pipeline.
//
// On `start_meeting_capture` we:
//   1. Mint an OpenAI Realtime API ephemeral client secret using the
//      OPENAI_API_KEY env var (never exposed to the webview).
//   2. Spawn the macOS mic sidecar (and optionally the system-audio sidecar).
//      Each sidecar emits newline-delimited JSON like
//      `{"type":"chunk","pcm16":"<base64 PCM16 LE mono 24kHz>"}`.
//   3. Open one WebSocket per source to
//      `wss://api.openai.com/v1/realtime?intent=transcription`, send the
//      transcription session config, and pipe each PCM chunk through as
//      `input_audio_buffer.append`.
//   4. Forward transcript deltas/completions back to the renderer as Tauri
//      events.
//
// `stop_meeting_capture` kills the sidecars and closes the sockets.

use std::collections::HashMap;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

// Both the client_secrets endpoint and the WebSocket use the GA nested
// `audio.input.*` schema.
//
// For `session.type = "transcription"` sessions the WS URL takes NO
// `?model=...` query param — providing one returns `invalid_model: You
// must not provide a model parameter for transcription sessions`. The
// STT model lives inside `audio.input.transcription.model`.
const OPENAI_REALTIME_WS: &str = "wss://api.openai.com/v1/realtime";
const OPENAI_CLIENT_SECRETS_URL: &str = "https://api.openai.com/v1/realtime/client_secrets";
const OPENAI_TRANSCRIPTION_MODEL: &str = "gpt-4o-transcribe";

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioSource {
    Mic,
    System,
}

impl AudioSource {
    fn as_str(self) -> &'static str {
        match self {
            AudioSource::Mic => "mic",
            AudioSource::System => "system",
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEvent {
    pub session_id: String,
    pub source: &'static str,
    pub kind: &'static str,
    pub text: Option<String>,
    pub item_id: Option<String>,
    pub error: Option<String>,
}

struct ActiveSession {
    children: Vec<CommandChild>,
    tasks: Vec<JoinHandle<()>>,
}

static ACTIVE: Mutex<Option<HashMap<String, ActiveSession>>> = Mutex::new(None);

fn with_active<R>(f: impl FnOnce(&mut HashMap<String, ActiveSession>) -> R) -> R {
    let mut guard = ACTIVE.lock().expect("meeting capture mutex poisoned");
    let map = guard.get_or_insert_with(HashMap::new);
    f(map)
}

#[tauri::command]
pub async fn start_meeting_capture(
    app: AppHandle,
    session_id: String,
    capture_system_audio: bool,
) -> Result<(), String> {
    eprintln!(
        "[meeting] start_meeting_capture session={} capture_system_audio={}",
        session_id, capture_system_audio
    );

    if session_id.trim().is_empty() {
        return Err("session_id is required".into());
    }
    if with_active(|m| m.contains_key(&session_id)) {
        return Err(format!("session {} is already active", session_id));
    }

    let api_key = std::env::var("OPENAI_API_KEY")
        .or_else(|_| std::env::var("VITE_OPENAI_API_KEY"))
        .map_err(|_| {
            "Set OPENAI_API_KEY (or VITE_OPENAI_API_KEY) in your environment, then restart the app."
                .to_string()
        })?;
    eprintln!(
        "[meeting] resolved api key (len={}, prefix={})",
        api_key.len(),
        api_key.chars().take(7).collect::<String>()
    );

    let client_secret = mint_client_secret(&api_key).await?;
    eprintln!(
        "[meeting] minted client secret (len={}, prefix={})",
        client_secret.len(),
        client_secret.chars().take(8).collect::<String>()
    );

    let mut children = Vec::new();
    let mut tasks = Vec::new();

    // --- mic ---
    eprintln!("[meeting] spawning mic sidecar");
    let (mic_child, mic_rx) = spawn_sidecar(&app, "notelab-mic-capture")
        .map_err(|err| format!("Failed to spawn microphone sidecar: {err}"))?;
    eprintln!("[meeting] mic sidecar spawned (pid={})", mic_child.pid());
    children.push(mic_child);
    let mic_task = tokio::spawn(run_source_pipeline(
        app.clone(),
        session_id.clone(),
        AudioSource::Mic,
        client_secret.clone(),
        mic_rx,
    ));
    tasks.push(mic_task);

    // --- system audio (optional) ---
    if capture_system_audio {
        eprintln!("[meeting] spawning system-audio sidecar");
        match spawn_sidecar(&app, "notelab-system-capture") {
            Ok((child, rx)) => {
                eprintln!(
                    "[meeting] system-audio sidecar spawned (pid={})",
                    child.pid()
                );
                children.push(child);
                let task = tokio::spawn(run_source_pipeline(
                    app.clone(),
                    session_id.clone(),
                    AudioSource::System,
                    client_secret.clone(),
                    rx,
                ));
                tasks.push(task);
            }
            Err(err) => {
                eprintln!("[meeting] system-audio sidecar failed to spawn: {err}");
                let _ = app.emit(
                    "transcript-event",
                    TranscriptEvent {
                        session_id: session_id.clone(),
                        source: AudioSource::System.as_str(),
                        kind: "error",
                        text: None,
                        item_id: None,
                        error: Some(format!("Failed to start system audio capture: {err}")),
                    },
                );
            }
        }
    }

    with_active(|m| {
        m.insert(session_id.clone(), ActiveSession { children, tasks });
    });
    eprintln!("[meeting] session {} registered as active", session_id);

    Ok(())
}

#[tauri::command]
pub async fn stop_meeting_capture(session_id: String) -> Result<(), String> {
    eprintln!("[meeting] stop_meeting_capture session={}", session_id);
    let session = with_active(|m| m.remove(&session_id));
    let Some(session) = session else {
        eprintln!("[meeting] stop: no active session for {}", session_id);
        return Ok(()); // already stopped
    };

    for child in session.children {
        let pid = child.pid();
        match child.kill() {
            Ok(()) => eprintln!("[meeting] killed sidecar pid={pid}"),
            Err(err) => eprintln!("[meeting] kill sidecar pid={pid} failed: {err}"),
        }
    }
    for task in session.tasks {
        task.abort();
    }
    eprintln!("[meeting] session {} stopped", session_id);
    Ok(())
}

fn spawn_sidecar(
    app: &AppHandle,
    name: &str,
) -> Result<(CommandChild, UnboundedReceiver<CommandEvent>), String> {
    let cmd = app
        .shell()
        .sidecar(name)
        .map_err(|err| format!("sidecar('{name}'): {err}"))?;
    let (rx, child) = cmd
        .spawn()
        .map_err(|err| format!("spawn('{name}'): {err}"))?;

    // The shell plugin gives us a tauri::async_runtime::Receiver. Forward its
    // events into a tokio mpsc so the rest of the pipeline can use plain tokio.
    let (tx, out_rx) = mpsc::unbounded_channel();
    tauri::async_runtime::spawn(forward_events(rx, tx));
    Ok((child, out_rx))
}

async fn forward_events(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    tx: UnboundedSender<CommandEvent>,
) {
    while let Some(event) = rx.recv().await {
        if tx.send(event).is_err() {
            break;
        }
    }
}

async fn mint_client_secret(api_key: &str) -> Result<String, String> {
    eprintln!("[meeting] minting client_secret via {}", OPENAI_CLIENT_SECRETS_URL);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|err| format!("client build: {err}"))?;

    // The actual per-source config is sent separately on each WebSocket so
    // values like VAD silence padding can differ between mic and system
    // audio. Schema is the GA nested `audio.input.*` shape.
    let body = json!({
        "expires_after": { "anchor": "created_at", "seconds": 1800 },
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "format": { "type": "audio/pcm", "rate": 24000 },
                    "transcription": { "model": OPENAI_TRANSCRIPTION_MODEL }
                }
            }
        }
    });

    let response = client
        .post(OPENAI_CLIENT_SECRETS_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| format!("client_secrets request failed: {err}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|_| "<no body>".into());
    eprintln!("[meeting] client_secrets response status={}", status);
    if !status.is_success() {
        eprintln!("[meeting] client_secrets body: {}", text);
        return Err(format!("OpenAI client_secrets {status}: {text}"));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|err| format!("client_secrets parse: {err}"))?;
    let secret = parsed
        .get("value")
        .and_then(|v| v.as_str())
        .or_else(|| parsed.get("client_secret").and_then(|v| v.as_str()))
        .ok_or_else(|| format!("OpenAI client_secrets response missing 'value': {text}"))?;
    Ok(secret.to_string())
}

async fn run_source_pipeline(
    app: AppHandle,
    session_id: String,
    source: AudioSource,
    client_secret: String,
    mut sidecar_rx: UnboundedReceiver<CommandEvent>,
) {
    let result = run_source_pipeline_inner(
        app.clone(),
        session_id.clone(),
        source,
        client_secret,
        &mut sidecar_rx,
    )
    .await;
    if let Err(err) = result {
        let _ = app.emit(
            "transcript-event",
            TranscriptEvent {
                session_id,
                source: source.as_str(),
                kind: "error",
                text: None,
                item_id: None,
                error: Some(err),
            },
        );
    }
}

async fn run_source_pipeline_inner(
    app: AppHandle,
    session_id: String,
    source: AudioSource,
    client_secret: String,
    sidecar_rx: &mut UnboundedReceiver<CommandEvent>,
) -> Result<(), String> {
    // Connect to OpenAI Realtime over WebSocket.
    let mut request = OPENAI_REALTIME_WS
        .into_client_request()
        .map_err(|err| format!("WS request: {err}"))?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {client_secret}")
            .parse()
            .map_err(|err| format!("auth header: {err}"))?,
    );
    // Do NOT send `OpenAI-Beta: realtime=v1` — that header pins the connection
    // to the beta protocol, which is incompatible with the GA client secrets
    // minted by /v1/realtime/client_secrets. The server returns
    // `api_version_mismatch` and closes the socket.

    eprintln!("[{}] connecting to {}", source.as_str(), OPENAI_REALTIME_WS);
    let (ws, response) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|err| format!("connect_async: {err}"))?;
    eprintln!(
        "[{}] WS connected, status={}",
        source.as_str(),
        response.status()
    );
    let (mut ws_sink, mut ws_stream) = ws.split();

    // Send the per-source session config. opengran tunes VAD differently for
    // mic vs system audio and disables noise reduction on system audio.
    let session_update = build_session_update(source);
    eprintln!(
        "[{}] sending session.update: {}",
        source.as_str(),
        session_update
    );
    ws_sink
        .send(Message::Text(session_update.to_string()))
        .await
        .map_err(|err| format!("send session.update: {err}"))?;

    // Spawn a task that reads transcript events from the WS and emits them.
    let app_for_ws = app.clone();
    let session_for_ws = session_id.clone();
    let ws_task: JoinHandle<()> = tokio::spawn(async move {
        while let Some(message) = ws_stream.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    let parsed: Option<serde_json::Value> =
                        serde_json::from_str(&text).ok();
                    let event_type = parsed
                        .as_ref()
                        .and_then(|v| v.get("type").and_then(|t| t.as_str()))
                        .unwrap_or("<unparsed>");
                    if event_type == "error" {
                        eprintln!(
                            "[{}] WS recv error: {}",
                            source.as_str(),
                            text
                        );
                    } else {
                        eprintln!(
                            "[{}] WS recv type={} (len={})",
                            source.as_str(),
                            event_type,
                            text.len()
                        );
                    }
                    handle_realtime_event(&app_for_ws, &session_for_ws, source, &text);
                }
                Ok(Message::Close(frame)) => {
                    eprintln!("[{}] WS closed by server: {:?}", source.as_str(), frame);
                    break;
                }
                Err(err) => {
                    eprintln!("[{}] WS error: {}", source.as_str(), err);
                    break;
                }
                _ => {}
            }
        }
        eprintln!("[{}] WS reader task exiting", source.as_str());
    });

    // Forward sidecar PCM chunks to the WebSocket as input_audio_buffer.append.
    let mut chunks_forwarded: u64 = 0;
    let mut bytes_forwarded: u64 = 0;
    let mut last_log_at = std::time::Instant::now();
    while let Some(event) = sidecar_rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes);
                let trimmed = line.trim();
                // Sidecar emits a `ready` event once at startup. Log it; for
                // every chunk just bump counters and log periodically.
                if trimmed.starts_with("{\"type\":\"ready\"") {
                    eprintln!("[{}] sidecar ready: {}", source.as_str(), trimmed);
                } else if trimmed.starts_with("{\"type\":\"error\"") {
                    eprintln!("[{}] sidecar error: {}", source.as_str(), trimmed);
                } else if trimmed.starts_with("{\"type\":\"stopped\"") {
                    eprintln!("[{}] sidecar stopped: {}", source.as_str(), trimmed);
                }
                if let Some(append) = sidecar_line_to_append(&line) {
                    bytes_forwarded += append.len() as u64;
                    chunks_forwarded += 1;
                    if let Err(err) = ws_sink.send(Message::Text(append)).await {
                        eprintln!("[{}] WS send failed: {}", source.as_str(), err);
                        return Err(format!("send append: {err}"));
                    }
                    if last_log_at.elapsed() >= std::time::Duration::from_secs(5) {
                        eprintln!(
                            "[{}] forwarded {} chunks ({} bytes) so far",
                            source.as_str(),
                            chunks_forwarded,
                            bytes_forwarded
                        );
                        last_log_at = std::time::Instant::now();
                    }
                }
            }
            CommandEvent::Stderr(line_bytes) => {
                eprintln!(
                    "[{}] sidecar stderr: {}",
                    source.as_str(),
                    String::from_utf8_lossy(&line_bytes).trim_end()
                );
            }
            CommandEvent::Terminated(payload) => {
                eprintln!(
                    "[{}] sidecar terminated code={:?} signal={:?}",
                    source.as_str(),
                    payload.code,
                    payload.signal
                );
                break;
            }
            _ => {}
        }
    }

    eprintln!(
        "[{}] sidecar stream ended; forwarded {} chunks total ({} bytes)",
        source.as_str(),
        chunks_forwarded,
        bytes_forwarded
    );
    let _ = ws_sink.send(Message::Close(None)).await;
    ws_task.abort();
    Ok(())
}

fn sidecar_line_to_append(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).ok()?;
    if value.get("type")?.as_str()? != "chunk" {
        return None;
    }
    let pcm16 = value.get("pcm16")?.as_str()?;
    Some(
        json!({
            "type": "input_audio_buffer.append",
            "audio": pcm16,
        })
        .to_string(),
    )
}

fn build_session_update(source: AudioSource) -> serde_json::Value {
    // GA nested schema. Per-source tuning:
    //   - Mic: server_vad with short silence window. Real conversation has
    //     natural pauses, so silence-based VAD works and gives crisp turns.
    //   - System: semantic_vad. Continuous-audio content (music, videos,
    //     calls without pauses) keeps server_vad from ever committing,
    //     making transcripts arrive only at recording-stop. semantic_vad
    //     uses a model to cut at clause/sentence boundaries instead.
    //   - Noise reduction stays on for the mic (near_field denoiser) and
    //     off for system audio (denoiser hurts mixed-music output).
    let (noise_reduction, turn_detection) = match source {
        AudioSource::Mic => (
            json!({ "type": "near_field" }),
            json!({
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 200
            }),
        ),
        AudioSource::System => (
            json!(null),
            json!({
                "type": "semantic_vad",
                "eagerness": "high"
            }),
        ),
    };

    json!({
        "type": "session.update",
        "session": {
            "type": "transcription",
            "include": ["item.input_audio_transcription.logprobs"],
            "audio": {
                "input": {
                    "format": { "type": "audio/pcm", "rate": 24000 },
                    "noise_reduction": noise_reduction,
                    "turn_detection": turn_detection,
                    "transcription": {
                        "model": OPENAI_TRANSCRIPTION_MODEL,
                        "prompt": "Transcribe the audio literally. Do not add filler, descriptions, or notes."
                    }
                }
            }
        }
    })
}

fn handle_realtime_event(app: &AppHandle, session_id: &str, source: AudioSource, payload: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return;
    };
    let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match event_type {
        "conversation.item.input_audio_transcription.delta" => {
            let delta = value
                .get("delta")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("text").and_then(|v| v.as_str()))
                .or_else(|| value.get("transcript").and_then(|v| v.as_str()))
                .unwrap_or("");
            let item_id = value
                .get("item_id")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            if delta.is_empty() {
                eprintln!(
                    "[{}] empty delta payload (full event): {}",
                    source.as_str(),
                    payload
                );
                return;
            }
            eprintln!(
                "[{}] delta text=\"{}\" item={:?}",
                source.as_str(),
                delta,
                item_id
            );
            let _ = app.emit(
                "transcript-event",
                TranscriptEvent {
                    session_id: session_id.to_string(),
                    source: source.as_str(),
                    kind: "delta",
                    text: Some(delta.to_string()),
                    item_id,
                    error: None,
                },
            );
        }
        "conversation.item.input_audio_transcription.completed" => {
            let transcript = value
                .get("transcript")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("text").and_then(|v| v.as_str()))
                .unwrap_or("");
            let item_id = value
                .get("item_id")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let _ = app.emit(
                "transcript-event",
                TranscriptEvent {
                    session_id: session_id.to_string(),
                    source: source.as_str(),
                    kind: "completed",
                    text: Some(transcript.to_string()),
                    item_id,
                    error: None,
                },
            );
        }
        "conversation.item.input_audio_transcription.failed" | "error" => {
            let message = value
                .pointer("/error/message")
                .and_then(|v| v.as_str())
                .unwrap_or(payload);
            let _ = app.emit(
                "transcript-event",
                TranscriptEvent {
                    session_id: session_id.to_string(),
                    source: source.as_str(),
                    kind: "error",
                    text: None,
                    item_id: None,
                    error: Some(message.to_string()),
                },
            );
        }
        _ => {}
    }
}

// Allow the unused-import warning for `BASE64` to remain quiet — we keep the
// import as an explicit declaration that PCM data is base64-encoded so anyone
// extending this module knows the encoding without grepping the sidecar.
#[allow(dead_code)]
fn _base64_marker() {
    let _ = BASE64.encode(&[0u8]);
}
