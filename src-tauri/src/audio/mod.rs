pub mod capture;
pub mod stream;
pub mod transcribe_local;

use transcribe_local::LocalTranscriber;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

#[derive(Default)]
pub struct AudioState(pub Arc<Mutex<AudioStateInner>>);

pub struct AudioStateInner {
    pub mic_stream: Option<cpal::Stream>,
    pub system_stream: Option<cpal::Stream>,
    pub test_mic_stream: Option<cpal::Stream>,
    pub test_sys_stream: Option<cpal::Stream>,
    pub levels: Arc<Mutex<capture::AudioLevels>>,
    pub deepgram_abort: Option<tokio::task::AbortHandle>,
    pub local_transcriber: Option<LocalTranscriber>,
    pub audio_tx: Option<mpsc::Sender<Vec<i16>>>,
}

impl Default for AudioStateInner {
    fn default() -> Self {
        Self {
            mic_stream: None,
            system_stream: None,
            test_mic_stream: None,
            test_sys_stream: None,
            levels: Arc::new(Mutex::new(capture::AudioLevels { mic: 0.0, system: 0.0 })),
            deepgram_abort: None,
            local_transcriber: None,
            audio_tx: None,
        }
    }
}

unsafe impl Send for AudioStateInner {}
unsafe impl Sync for AudioStateInner {}
