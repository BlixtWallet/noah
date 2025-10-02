import AVFoundation
import Foundation
import NitroModules

extension NoahTools {
    private static var audioPlayer: AVAudioPlayer?

    func performPlayAudio(filePath: String) throws -> Promise<Void> {
        let promise = Promise<Void>()

        DispatchQueue.main.async {
            do {
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playback, mode: .default)
                try audioSession.setActive(true)

                let fileURL: URL
                if filePath.starts(with: "file://") {
                    guard let url = URL(string: filePath) else {
                        promise.reject(
                            withError: NSError(
                                domain: "NoahTools", code: -1,
                                userInfo: [
                                    NSLocalizedDescriptionKey: "Invalid file URI: \(filePath)"
                                ]))
                        return
                    }
                    fileURL = url
                } else if filePath.starts(with: "/") {
                    fileURL = URL(fileURLWithPath: filePath)
                } else {
                    let fileName = (filePath as NSString).deletingPathExtension
                    let fileExtension =
                        (filePath as NSString).pathExtension.isEmpty
                        ? "m4a"
                        : (filePath as NSString).pathExtension

                    guard
                        let bundleURL = Bundle.main.url(
                            forResource: fileName, withExtension: fileExtension)
                    else {
                        promise.reject(
                            withError: NSError(
                                domain: "NoahTools", code: -1,
                                userInfo: [
                                    NSLocalizedDescriptionKey: "Audio file not found: \(filePath)"
                                ]))
                        return
                    }
                    fileURL = bundleURL
                }

                let player = try AVAudioPlayer(contentsOf: fileURL)
                player.prepareToPlay()
                player.play()

                Self.audioPlayer = player
                promise.resolve(withResult: ())
            } catch {
                promise.reject(withError: error)
            }
        }

        return promise
    }

    func performPauseAudio() throws {
        Self.audioPlayer?.pause()
    }

    func performStopAudio() throws {
        Self.audioPlayer?.stop()
        Self.audioPlayer = nil

        try? AVAudioSession.sharedInstance().setActive(false)
    }

    func performResumeAudio() throws {
        Self.audioPlayer?.play()
    }

    func performSeekAudio(positionSeconds: Double) throws {
        guard let player = Self.audioPlayer else { return }
        player.currentTime = positionSeconds
    }

    func performGetAudioDuration() throws -> Double {
        return Self.audioPlayer?.duration ?? 0.0
    }

    func performGetAudioPosition() throws -> Double {
        return Self.audioPlayer?.currentTime ?? 0.0
    }

    func performIsAudioPlaying() throws -> Bool {
        return Self.audioPlayer?.isPlaying ?? false
    }
}
