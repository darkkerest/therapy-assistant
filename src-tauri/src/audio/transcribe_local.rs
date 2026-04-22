use anyhow::{anyhow, Result};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;
use tokio::process::Child;
use std::process::Stdio;

#[derive(Deserialize)]
struct HelperMsg {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    confidence: Option<f32>,
    message: Option<String>,
}

pub struct LocalTranscriber {
    child: Child,
    stderr_abort: tokio::task::AbortHandle,
    reader_abort: tokio::task::AbortHandle,
}

impl LocalTranscriber {
    pub async fn spawn(app: &AppHandle, window: tauri::Window) -> Result<Self> {
        let helper_path = resolve_helper_path(app)?;

        append_debug_line("/tmp/parakeet-pipe.log", &format!("=== spawning helper: {} ===", helper_path.display()));

        let mut child = tokio::process::Command::new(&helper_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| anyhow!("failed to spawn parakeet-helper: {}", e))?;

        append_debug_line("/tmp/parakeet-pipe.log", &format!("=== helper pid: {:?} ===", child.id()));

        let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow!("no stderr"))?;

        // Log stderr → also write to debug file
        let stderr_window = window.clone();
        let stderr_handle = tokio::spawn(async move {
            let mut dbg_err = std::fs::OpenOptions::new()
                .create(true).append(true)
                .open("/tmp/parakeet-stderr.log")
                .ok();
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                log::info!("[parakeet] {}", line);
                let status = if line.contains("loading models") {
                    Some(("loading", "Загружаю локальную модель Parakeet v3..."))
                } else if line.contains("ready") {
                    Some(("ready", "Parakeet v3 готов. Говорите."))
                } else if line.contains("fatal") || line.contains("denied") {
                    Some(("error", line.as_str()))
                } else {
                    None
                };
                if let Some((phase, message)) = status {
                    let _ = stderr_window.emit("transcription-status", &serde_json::json!({
                        "phase": phase,
                        "message": message,
                    }));
                }
                if let Some(ref mut f) = dbg_err {
                    use std::io::Write;
                    let _ = writeln!(f, "{}", line);
                }
            }
        });

        // Read stdout → emit transcript events
        let window_clone = window.clone();
        let reader_handle = tokio::spawn(async move {
            // Debug log file
            let mut dbg = std::fs::OpenOptions::new()
                .create(true).append(true)
                .open("/tmp/parakeet-pipe.log")
                .ok();
            if let Some(ref mut f) = dbg {
                use std::io::Write;
                let _ = writeln!(f, "=== reader task started ===");
            }

            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // Log every raw line
                if let Some(ref mut f) = dbg {
                    use std::io::Write;
                    let _ = writeln!(f, "RAW: {}", line);
                }
                if let Ok(msg) = serde_json::from_str::<HelperMsg>(&line) {
                    match msg.kind.as_str() {
                        "partial" | "final" => {
                            if let Some(text) = &msg.text {
                                if !text.trim().is_empty() {
                                    if let Some(ref mut f) = dbg {
                                        use std::io::Write;
                                        let _ = writeln!(f, "EMIT transcript: {}", text);
                                    }
                                    let payload = serde_json::json!({
                                        "transcript": text,
                                        "words": [],
                                        "speaker": serde_json::Value::Null,
                                        "is_final": msg.kind == "final",
                                        "speech_final": msg.kind == "final",
                                        "confidence": msg.confidence,
                                    });
                                    let _ = window_clone.emit("transcript", &payload);
                                }
                            }
                        }
                        "error" => {
                            log::error!("[parakeet] error: {:?}", msg.message);
                            let _ = window_clone.emit("transcription-error", &serde_json::json!({
                                "message": msg.message.clone().unwrap_or_else(|| "Unknown local transcription error".into())
                            }));
                            if let Some(ref mut f) = dbg {
                                use std::io::Write;
                                let _ = writeln!(f, "ERROR: {:?}", msg.message);
                            }
                        }
                        "ready" => {
                            let _ = window_clone.emit("transcription-ready", &serde_json::json!({ "backend": "local" }));
                            let _ = window_clone.emit("transcription-status", &serde_json::json!({
                                "phase": "ready",
                                "message": "Parakeet v3 готов. Говорите.",
                            }));
                            if let Some(ref mut f) = dbg {
                                use std::io::Write;
                                let _ = writeln!(f, "READY");
                            }
                        }
                        _ => {
                            if let Some(ref mut f) = dbg {
                                use std::io::Write;
                                let _ = writeln!(f, "OTHER type: {}", msg.kind);
                            }
                        }
                    }
                }
            }
            if let Some(ref mut f) = dbg {
                use std::io::Write;
                let _ = writeln!(f, "=== reader task ended ===");
            }
        });

        Ok(LocalTranscriber {
            child,
            stderr_abort: stderr_handle.abort_handle(),
            reader_abort: reader_handle.abort_handle(),
        })
    }

    pub fn terminate(&mut self) {
        self.reader_abort.abort();
        self.stderr_abort.abort();
        let _ = self.child.start_kill();
    }
}

impl Drop for LocalTranscriber {
    fn drop(&mut self) {
        self.terminate();
    }
}

fn resolve_helper_path(app: &AppHandle) -> Result<std::path::PathBuf> {
    for relative in [
        "resources/therapy-parakeet-helper",
        "therapy-parakeet-helper",
        "resources/parakeet-helper",
        "parakeet-helper",
    ] {
        if let Ok(path) = app.path().resolve(relative, tauri::path::BaseDirectory::Resource) {
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Err(anyhow!("parakeet-helper not found in app resources"))
}

fn append_debug_line(path: &str, line: &str) {
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(file, "{}", line);
    }
}
