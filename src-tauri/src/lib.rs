mod audio;
mod commands;

use tauri::Manager;

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(audio::AudioState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_audio_devices,
            commands::start_audio_capture,
            commands::stop_audio_capture,
            commands::get_audio_levels,
            commands::test_audio,
            commands::read_config,
            commands::write_config,
            commands::ensure_data_dirs,
            commands::list_clients,
            commands::read_file,
            commands::write_file,
            commands::open_in_explorer,
            commands::register_hotkeys,
            commands::unregister_hotkeys,
            commands::set_always_on_top,
            commands::resize_window,
            commands::request_hint,
            commands::finalize_session_claude,
            commands::is_blackhole_installed,
            commands::install_blackhole,
            commands::setup_multi_output_device,
            commands::open_audio_midi_setup,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
