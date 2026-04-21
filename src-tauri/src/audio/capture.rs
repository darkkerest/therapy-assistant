use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig, SupportedStreamConfig};
use std::sync::{Arc, Mutex};
use anyhow::Result;

pub struct AudioLevels {
    pub mic: f32,
    pub system: f32,
}

pub fn list_input_devices() -> Vec<(String, String)> {
    let host = cpal::default_host();
    let mut devices = Vec::new();
    if let Ok(inputs) = host.input_devices() {
        for device in inputs {
            if let Ok(name) = device.name() {
                devices.push((name.clone(), name));
            }
        }
    }
    devices
}

pub fn start_mic_capture(
    device_name: &str,
    sender: tokio::sync::mpsc::Sender<Vec<i16>>,
    levels: Arc<Mutex<AudioLevels>>,
) -> Result<cpal::Stream> {
    let host = cpal::default_host();
    let device = find_input_device(&host, device_name)?;
    start_capture_on_device(device, sender, levels, true)
}

pub fn start_system_capture(
    device_name: &str,
    sender: tokio::sync::mpsc::Sender<Vec<i16>>,
    levels: Arc<Mutex<AudioLevels>>,
) -> Result<cpal::Stream> {
    let host = cpal::default_host();
    let device = find_input_device(&host, device_name)?;
    start_capture_on_device(device, sender, levels, false)
}

fn start_capture_on_device(
    device: Device,
    sender: tokio::sync::mpsc::Sender<Vec<i16>>,
    levels: Arc<Mutex<AudioLevels>>,
    is_mic: bool,
) -> Result<cpal::Stream> {
    let supported = device.default_input_config()?;
    let native_rate = supported.sample_rate().0;
    let channels = supported.channels() as usize;

    // Build config using native sample rate and channel count (no Fixed buffer)
    let config = StreamConfig {
        channels: channels as u16,
        sample_rate: supported.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    let stream = match supported.sample_format() {
        SampleFormat::F32 => {
            device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    let level = data.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                    if let Ok(mut lvl) = levels.lock() {
                        if is_mic { lvl.mic = level; } else { lvl.system = level; }
                    }
                    let pcm = convert_to_16k_mono_i16(data, channels, native_rate);
                    let _ = sender.try_send(pcm);
                },
                |err| log::error!("audio stream error: {}", err),
                None,
            )?
        }
        SampleFormat::I16 => {
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    let level = data.iter().map(|s| (*s as f32 / 32768.0).abs()).fold(0.0f32, f32::max);
                    if let Ok(mut lvl) = levels.lock() {
                        if is_mic { lvl.mic = level; } else { lvl.system = level; }
                    }
                    let floats: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                    let pcm = convert_to_16k_mono_i16(&floats, channels, native_rate);
                    let _ = sender.try_send(pcm);
                },
                |err| log::error!("audio stream error: {}", err),
                None,
            )?
        }
        SampleFormat::U8 => {
            device.build_input_stream(
                &config,
                move |data: &[u8], _| {
                    let floats: Vec<f32> = data.iter().map(|&s| (s as f32 - 128.0) / 128.0).collect();
                    let level = floats.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                    if let Ok(mut lvl) = levels.lock() {
                        if is_mic { lvl.mic = level; } else { lvl.system = level; }
                    }
                    let pcm = convert_to_16k_mono_i16(&floats, channels, native_rate);
                    let _ = sender.try_send(pcm);
                },
                |err| log::error!("audio stream error: {}", err),
                None,
            )?
        }
        _ => {
            // Fallback: try F32
            device.build_input_stream(
                &StreamConfig {
                    channels: 1,
                    sample_rate: cpal::SampleRate(16000),
                    buffer_size: cpal::BufferSize::Default,
                },
                move |data: &[f32], _| {
                    let pcm: Vec<i16> = data.iter().map(|&s| (s * 32767.0) as i16).collect();
                    let _ = sender.try_send(pcm);
                },
                |err| log::error!("audio stream error: {}", err),
                None,
            )?
        }
    };

    stream.play()?;
    Ok(stream)
}

/// Downmix to mono then resample to 16kHz using linear interpolation
fn convert_to_16k_mono_i16(data: &[f32], channels: usize, native_rate: u32) -> Vec<i16> {
    let target_rate: u32 = 16000;

    // Downmix to mono
    let mono: Vec<f32> = if channels == 1 {
        data.to_vec()
    } else {
        data.chunks(channels)
            .map(|ch| ch.iter().sum::<f32>() / ch.len() as f32)
            .collect()
    };

    if native_rate == target_rate {
        return mono.iter().map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16).collect();
    }

    // Simple linear resample
    let ratio = native_rate as f64 / target_rate as f64;
    let out_len = (mono.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let idx = src as usize;
        let frac = src - idx as f64;
        let a = mono.get(idx).copied().unwrap_or(0.0);
        let b = mono.get(idx + 1).copied().unwrap_or(a);
        let sample = a + (b - a) * frac as f32;
        out.push((sample.clamp(-1.0, 1.0) * 32767.0) as i16);
    }
    out
}

fn find_input_device(host: &cpal::Host, name: &str) -> Result<Device> {
    if name.is_empty() || name == "default" {
        return host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No default input device"));
    }
    host.input_devices()?
        .find(|d| d.name().map(|n| n == name).unwrap_or(false))
        .ok_or_else(|| anyhow::anyhow!("Device '{}' not found", name))
}
