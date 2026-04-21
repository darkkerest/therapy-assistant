use tauri::Emitter;
use crate::audio::{
    capture::{list_input_devices, start_mic_capture, start_system_capture},
    stream::stream_to_deepgram,
    AudioState,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State, Window};
use tokio::sync::mpsc;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub data_path: String,
    pub deepgram_api_key: String,
    pub anthropic_api_key: String,
    pub audio_mic_device: String,
    pub audio_system_device: String,
    pub language: String,
    pub hints_mode: String,
    pub hints_interval_seconds: u32,
    pub hotkey_hint: String,
    pub hotkey_note: String,
    pub hotkey_end: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        Self {
            data_path: format!("{}/therapy-assistant", home),
            deepgram_api_key: String::new(),
            anthropic_api_key: String::new(),
            audio_mic_device: String::new(),
            audio_system_device: String::new(),
            language: "ru".into(),
            hints_mode: "mixed".into(),
            hints_interval_seconds: 60,
            hotkey_hint: "CommandOrControl+Shift+H".into(),
            hotkey_note: "CommandOrControl+Shift+N".into(),
            hotkey_end: "CommandOrControl+Shift+S".into(),
        }
    }
}

fn config_path(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().unwrap().join("config.json")
}

#[tauri::command]
pub fn get_audio_devices() -> Vec<AudioDevice> {
    list_input_devices()
        .into_iter()
        .map(|(id, name)| AudioDevice { id, name })
        .collect()
}

#[tauri::command]
pub async fn start_audio_capture(
    state: State<'_, AudioState>,
    window: Window,
    mic_device: String,
    system_device: String,
    deepgram_key: String,
    language: String,
) -> Result<(), String> {
    let levels = {
        let inner = state.0.lock().unwrap();
        inner.levels.clone()
    };

    let (mic_tx, mut mic_rx) = mpsc::channel::<Vec<i16>>(512);
    let (sys_tx, mut sys_rx) = mpsc::channel::<Vec<i16>>(512);
    let (audio_tx, audio_rx) = mpsc::channel::<Vec<i16>>(1024);
    let (result_tx, mut result_rx) = mpsc::channel(128);

    let mic_stream = start_mic_capture(&mic_device, mic_tx, levels.clone())
        .map_err(|e| e.to_string())?;
    let sys_stream = start_system_capture(&system_device, sys_tx, levels.clone())
        .map_err(|e| e.to_string())?;

    let audio_tx_clone = audio_tx.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(mic_data) = mic_rx.recv() => {
                    let _ = audio_tx_clone.send(mic_data).await;
                }
                Some(sys_data) = sys_rx.recv() => {
                    let _ = audio_tx_clone.send(sys_data).await;
                }
                else => break,
            }
        }
    });

    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Some(result) = result_rx.recv().await {
            let _ = window_clone.emit("transcript", &result);
        }
    });

    let deepgram_handle = tokio::spawn(async move {
        if let Err(e) = stream_to_deepgram(deepgram_key, language, audio_rx, result_tx).await {
            log::error!("deepgram error: {}", e);
        }
    });

    let mut inner = state.0.lock().unwrap();
    inner.mic_stream = Some(mic_stream);
    inner.system_stream = Some(sys_stream);
    inner.deepgram_abort = Some(deepgram_handle.abort_handle());
    inner.audio_tx = Some(audio_tx);

    Ok(())
}

#[tauri::command]
pub async fn stop_audio_capture(state: State<'_, AudioState>) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    if let Some(handle) = inner.deepgram_abort.take() {
        handle.abort();
    }
    inner.mic_stream = None;
    inner.system_stream = None;
    inner.audio_tx = None;
    Ok(())
}

#[tauri::command]
pub fn get_audio_levels(state: State<'_, AudioState>) -> (f32, f32) {
    let inner = state.0.lock().unwrap();
    let levels = inner.levels.lock().unwrap();
    (levels.mic, levels.system)
}

#[tauri::command]
pub async fn test_audio(
    state: State<'_, AudioState>,
    window: Window,
    mic_device: String,
    system_device: String,
) -> Result<(), String> {
    let levels = {
        let inner = state.0.lock().unwrap();
        inner.levels.clone()
    };

    let (mic_tx, _mic_rx) = mpsc::channel::<Vec<i16>>(512);
    let (sys_tx, _sys_rx) = mpsc::channel::<Vec<i16>>(512);

    let mic_stream = start_mic_capture(&mic_device, mic_tx, levels.clone())
        .map_err(|e| e.to_string())?;
    let sys_stream = start_system_capture(&system_device, sys_tx, levels.clone())
        .map_err(|e| e.to_string())?;

    // Store test streams in state so they live on the main thread
    {
        let mut inner = state.0.lock().unwrap();
        inner.test_mic_stream = Some(mic_stream);
        inner.test_sys_stream = Some(sys_stream);
    }

    let levels_clone = levels.clone();
    let window_clone = window.clone();
    let state_arc = state.0.clone();
    // Spawn a tokio task that only reads levels (no non-Send values captured)
    tokio::spawn(async move {
        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            let (mic, sys) = {
                let lvl = levels_clone.lock().unwrap();
                (lvl.mic, lvl.system)
            };
            let _ = window_clone.emit("audio_test_levels", (mic, sys));
        }
        // Drop streams by removing them from state
        let mut inner = state_arc.lock().unwrap();
        inner.test_mic_stream = None;
        inner.test_sys_stream = None;
        let _ = window_clone.emit("audio_test_done", ());
    });

    Ok(())
}

#[tauri::command]
pub fn read_config(app: AppHandle) -> AppConfig {
    let path = config_path(&app);
    if path.exists() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str(&text) {
                return cfg;
            }
        }
    }
    AppConfig::default()
}

#[tauri::command]
pub fn write_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ensure_data_dirs(data_path: String) -> Result<(), String> {
    let base = PathBuf::from(shellexpand::tilde(&data_path).to_string());
    fs::create_dir_all(base.join("clients")).map_err(|e| e.to_string())?;
    fs::create_dir_all(base.join("my-context")).map_err(|e| e.to_string())?;

    let approaches = base.join("my-context/approaches.md");
    if !approaches.exists() {
        fs::write(&approaches, "# Мои подходы и техники\n\n").map_err(|e| e.to_string())?;
    }
    let notes = base.join("my-context/notes.md");
    if !notes.exists() {
        fs::write(&notes, "# Заметки\n\n").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ClientInfo {
    pub id: String,
    pub name: String,
    pub session_count: usize,
}

#[tauri::command]
pub fn list_clients(data_path: String) -> Vec<ClientInfo> {
    let base = PathBuf::from(shellexpand::tilde(&data_path).to_string());
    let clients_dir = base.join("clients");
    let mut result = Vec::new();

    if let Ok(entries) = fs::read_dir(&clients_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let id = entry.file_name().to_string_lossy().to_string();
                let profile_path = path.join("profile.md");
                let name = if profile_path.exists() {
                    fs::read_to_string(&profile_path)
                        .ok()
                        .and_then(|text| {
                            text.lines()
                                .find(|l| l.starts_with("# "))
                                .map(|l| l.trim_start_matches("# ").to_string())
                        })
                        .unwrap_or_else(|| id.clone())
                } else {
                    id.clone()
                };
                let session_count = fs::read_dir(path.join("sessions"))
                    .map(|e| e.count())
                    .unwrap_or(0);
                result.push(ClientInfo { id, name, session_count });
            }
        }
    }
    result
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let expanded = shellexpand::tilde(&path).to_string();
    fs::read_to_string(&expanded).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let expanded = shellexpand::tilde(&path).to_string();
    let p = PathBuf::from(&expanded);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&expanded, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let expanded = shellexpand::tilde(&path).to_string();
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&expanded)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&expanded)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Claude API commands (run in Rust to avoid WebView CSP) ──────────────────

#[derive(serde::Deserialize)]
pub struct HintRequest {
    anthropic_key: String,
    approaches: String,
    profile: String,
    recent_sessions: Vec<String>,
    recent_turns: Vec<TurnInput>,
}

#[derive(serde::Deserialize)]
pub struct TurnInput {
    speaker: String,
    text: String,
}

#[tauri::command]
pub async fn request_hint(req: HintRequest) -> Result<String, String> {
    let transcript = req
        .recent_turns
        .iter()
        .map(|t| {
            let label = if t.speaker == "therapist" { "Терапевт" } else { "Клиент" };
            format!("{}: {}", label, t.text)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let session_ctx = req
        .recent_sessions
        .iter()
        .enumerate()
        .map(|(i, s)| format!("--- Сессия {} ---\n{}", i + 1, s))
        .collect::<Vec<_>>()
        .join("\n\n");

    let system = "Ты — ассистент для психотерапевта. Даёшь короткие, конкретные подсказки прямо во время сессии.\nПодсказки должны быть: 1-3 предложения максимум, практичные, не абстрактные.\nФормат: просто текст, без маркдауна, без заголовков.";

    let user = format!(
        "[Подход терапевта]\n{}\n\n[Профиль клиента]\n{}\n\n[Последние сессии]\n{}\n\n[Текущая сессия]\n{}\n\n[ЗАДАЧА]\nДай одну короткую подсказку: что сейчас можно сказать или спросить клиенту.",
        if req.approaches.is_empty() { "Не указан" } else { &req.approaches },
        if req.profile.is_empty() { "Профиль не заполнен" } else { &req.profile },
        if session_ctx.is_empty() { "Нет" } else { &session_ctx },
        if transcript.is_empty() { "Пусто" } else { &transcript },
    );

    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 200,
        "system": system,
        "messages": [{ "role": "user", "content": user }]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &req.anthropic_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API {}: {}", status, text));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let hint = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();
    Ok(hint)
}

#[derive(serde::Deserialize)]
pub struct FinalizeRequest {
    anthropic_key: String,
    client_name: String,
    transcript: String,
}

#[derive(serde::Serialize)]
pub struct FinalizeResult {
    summary: String,
    key_points: String,
}

#[tauri::command]
pub async fn finalize_session_claude(req: FinalizeRequest) -> Result<FinalizeResult, String> {
    let prompt = format!(
        "Вот транскрипт терапевтической сессии с клиентом \"{}\".\n\n{}\n\nСгенерируй:\n1. Краткое саммари (3-5 предложений)\n2. Ключевые моменты (список, 3-7 пунктов в формате Markdown)\n\nОтвечай строго в формате:\nСАММАРИ:\n<текст>\n\nКЛЮЧЕВЫЕ МОМЕНТЫ:\n<список>",
        req.client_name, req.transcript
    );

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1024,
        "messages": [{ "role": "user", "content": prompt }]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &req.anthropic_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API {}: {}", status, text));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = json["content"][0]["text"].as_str().unwrap_or("").to_string();

    let summary = text
        .split("КЛЮЧЕВЫЕ МОМЕНТЫ:")
        .next()
        .unwrap_or("")
        .replace("САММАРИ:", "")
        .trim()
        .to_string();
    let key_points = text
        .split("КЛЮЧЕВЫЕ МОМЕНТЫ:")
        .nth(1)
        .unwrap_or("")
        .trim()
        .to_string();

    Ok(FinalizeResult { summary, key_points })
}

#[tauri::command]
pub fn register_hotkeys(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn unregister_hotkeys(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn set_always_on_top(window: Window, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_window(window: Window, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_blackhole_installed() -> bool {
    let output = std::process::Command::new("/usr/sbin/system_profiler")
        .arg("SPAudioDataType")
        .output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).contains("BlackHole 2ch"),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn install_blackhole(app: AppHandle) -> Result<(), String> {
    let pkg_path = app
        .path()
        .resolve("resources/BlackHole2ch.pkg", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve pkg path: {}", e))?;

    if !pkg_path.exists() {
        return Err(format!("BlackHole pkg not found at {:?}", pkg_path));
    }

    let script = format!(
        r#"do shell script "/usr/sbin/installer -pkg '{}' -target /" with administrator privileges"#,
        pkg_path.to_string_lossy()
    );

    let output = std::process::Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Installer failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn setup_multi_output_device() -> Result<String, String> {
    // Uses AppleScript to drive Audio MIDI Setup.app
    let script = r#"
    tell application "Audio MIDI Setup"
        activate
    end tell
    delay 1
    tell application "System Events"
        tell process "Audio MIDI Setup"
            try
                click menu item "Create Multi-Output Device" of menu "Plus" of button "Add" of window 1
            on error
                return "manual"
            end try
        end tell
    end tell
    return "ok"
    "#;

    let output = std::process::Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("osascript failed: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn open_audio_midi_setup() -> Result<(), String> {
    std::process::Command::new("/usr/bin/open")
        .arg("-a")
        .arg("Audio MIDI Setup")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
