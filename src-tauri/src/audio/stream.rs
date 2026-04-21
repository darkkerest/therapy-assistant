use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest, tungstenite::Message};

#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscriptWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
    pub speaker: Option<u32>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscriptResult {
    pub transcript: String,
    pub words: Vec<TranscriptWord>,
    pub speaker: Option<u32>,
    pub is_final: bool,
    pub speech_final: bool,
}

pub async fn stream_to_deepgram(
    api_key: String,
    language: String,
    audio_rx: mpsc::Receiver<Vec<i16>>,
    result_tx: mpsc::Sender<TranscriptResult>,
) -> Result<()> {
    let url_str = format!(
        "wss://api.deepgram.com/v1/listen?\
         model=nova-2&\
         language={}&\
         diarize=true&\
         punctuate=true&\
         interim_results=true&\
         endpointing=300&\
         encoding=linear16&\
         sample_rate=16000&\
         channels=1",
        language
    );

    let mut request = url_str.into_client_request()?;
    request.headers_mut().insert(
        "Authorization",
        format!("Token {}", api_key).parse()?,
    );

    let (ws_stream, _) = connect_async(request).await?;
    let (mut write, mut read) = ws_stream.split();

    let mut audio_rx = audio_rx;

    let send_task = tokio::spawn(async move {
        while let Some(samples) = audio_rx.recv().await {
            let bytes: Vec<u8> = samples
                .iter()
                .flat_map(|s| s.to_le_bytes())
                .collect();
            if write.send(Message::Binary(bytes)).await.is_err() {
                break;
            }
        }
        let _ = write.send(Message::Binary(vec![])).await;
        let _ = write.close().await;
    });

    let recv_task = tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(result) = parse_deepgram_response(&json) {
                            let _ = result_tx.send(result).await;
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    log::error!("deepgram ws error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    let _ = tokio::join!(send_task, recv_task);
    Ok(())
}

fn parse_deepgram_response(json: &Value) -> Option<TranscriptResult> {
    let channel = json.get("channel")?;
    let alternatives = channel.get("alternatives")?.as_array()?;
    let alt = alternatives.first()?;

    let transcript = alt.get("transcript")?.as_str()?.to_string();
    if transcript.is_empty() {
        return None;
    }

    let is_final = json.get("is_final")?.as_bool().unwrap_or(false);
    let speech_final = json
        .get("speech_final")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let words: Vec<TranscriptWord> = alt
        .get("words")
        .and_then(|w| w.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|w| {
                    Some(TranscriptWord {
                        word: w.get("word")?.as_str()?.to_string(),
                        start: w.get("start")?.as_f64().unwrap_or(0.0),
                        end: w.get("end")?.as_f64().unwrap_or(0.0),
                        confidence: w.get("confidence")?.as_f64().unwrap_or(0.0),
                        speaker: w
                            .get("speaker")
                            .and_then(|s| s.as_u64())
                            .map(|s| s as u32),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let speaker = words.first().and_then(|w| w.speaker);

    Some(TranscriptResult {
        transcript,
        words,
        speaker,
        is_final,
        speech_final,
    })
}
