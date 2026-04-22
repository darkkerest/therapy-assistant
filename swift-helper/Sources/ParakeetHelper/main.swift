import Foundation
import AVFoundation
import FluidAudio

// Protocol:
//   stdin:  ignored - helper captures microphone audio internally
//   stdout: NDJSON lines:
//             {"type":"partial","text":"...","confidence":0.93}
//             {"type":"final","text":"...","confidence":0.98}
//             {"type":"ready"}
//             {"type":"error","message":"..."}
//   stderr: human-readable diagnostics

func emit(_ payload: [String: Any]) {
    guard
        let data = try? JSONSerialization.data(withJSONObject: payload),
        let line = String(data: data, encoding: .utf8)
    else { return }
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func logErr(_ msg: String) {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
}

func cleanTranscript(_ text: String) -> String {
    text
        .replacingOccurrences(of: "<unk>", with: "")
        .replacingOccurrences(of: "  ", with: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func containsSpeechText(_ text: String) -> Bool {
    text.unicodeScalars.contains { scalar in
        CharacterSet.letters.contains(scalar) || CharacterSet.decimalDigits.contains(scalar)
    }
}

final class AudioLevelLogger {
    private let lock = NSLock()
    private var lastLog = Date.distantPast

    func record(buffer: AVAudioPCMBuffer) {
        guard let channels = buffer.floatChannelData else { return }

        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        guard frameCount > 0, channelCount > 0 else { return }

        var peak: Float = 0
        for channel in 0..<channelCount {
            let samples = channels[channel]
            for frame in 0..<frameCount {
                peak = max(peak, abs(samples[frame]))
            }
        }

        lock.lock()
        defer { lock.unlock() }

        let now = Date()
        guard now.timeIntervalSince(lastLog) >= 2 else { return }
        lastLog = now

        logErr(
            "[parakeet-helper] audio peak=\(String(format: "%.4f", peak)) frames=\(frameCount) rate=\(Int(buffer.format.sampleRate)) channels=\(channelCount)"
        )
    }
}

@main
struct ParakeetHelperMain {
    static func main() async {
        do {
            logErr("[parakeet-helper] loading models (Parakeet TDT v3)...")

            let models = try await AsrModels.downloadAndLoad(version: .v3)
            let transcriber = SlidingWindowAsrManager(
                config: SlidingWindowAsrConfig(
                    chunkSeconds: 2.0,
                    hypothesisChunkSeconds: 1.0,
                    leftContextSeconds: 2.0,
                    rightContextSeconds: 0.5,
                    minContextForConfirmation: 2.0,
                    confirmationThreshold: 0.60
                )
            )
            try await transcriber.start(models: models, source: .microphone)

            let engine = AVAudioEngine()
            let input = engine.inputNode
            let inputFormat = input.outputFormat(forBus: 0)
            let levelLogger = AudioLevelLogger()

            let updateTask = Task {
                var lastText = ""
                for await update in await transcriber.transcriptionUpdates {
                    let text = cleanTranscript(update.text)
                    guard !text.isEmpty, containsSpeechText(text), text != lastText else { continue }

                    let minConfidence: Float = update.isConfirmed ? 0.70 : 0.50
                    guard update.confidence >= minConfidence else {
                        logErr(
                            "[parakeet-helper] skip low-confidence conf=\(String(format: "%.2f", update.confidence)) text=\(text)"
                        )
                        continue
                    }

                    lastText = text
                    emit([
                        "type": update.isConfirmed ? "final" : "partial",
                        "text": text,
                        "confidence": update.confidence,
                    ])
                    logErr(
                        "[parakeet-helper] \(update.isConfirmed ? "final" : "partial") conf=\(String(format: "%.2f", update.confidence)) text=\(text)"
                    )
                }
            }

            input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
                levelLogger.record(buffer: buffer)
                Task {
                    await transcriber.streamAudio(buffer)
                }
            }

            try engine.start()

            emit(["type": "ready"])
            logErr("[parakeet-helper] ready, transcribing...")

            while !Task.isCancelled {
                try await Task.sleep(nanoseconds: 1_000_000_000)
            }

            updateTask.cancel()
            input.removeTap(onBus: 0)
            engine.stop()
            await transcriber.cleanup()

        } catch {
            emit(["type": "error", "message": "\(error)"])
            logErr("[parakeet-helper] fatal: \(error)")
            exit(1)
        }
    }
}
