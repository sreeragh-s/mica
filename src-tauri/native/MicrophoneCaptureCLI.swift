@preconcurrency import AVFoundation
import CoreAudio
import Dispatch
import Foundation

enum MicrophoneCaptureError: Error, LocalizedError {
	case inputNodeUnavailable
	case invalidInputFormat
	case permissionDenied
	case tapFormatUnavailable
	case unableToCreateEngine

	var errorDescription: String? {
		switch self {
		case .inputNodeUnavailable:
			return "Microphone input node is unavailable."
		case .invalidInputFormat:
			return "Microphone input format is invalid."
		case .permissionDenied:
			return "Microphone access was denied."
		case .tapFormatUnavailable:
			return "Failed to create a microphone tap format."
		case .unableToCreateEngine:
			return "Failed to create the microphone audio engine."
		}
	}
}

final class StdoutEmitter: @unchecked Sendable {
	private let queue = DispatchQueue(label: "com.notelab.microphone.stdout")
	private let fileHandle = FileHandle.standardOutput

	func send(event: [String: Any]) {
		queue.async {
			guard JSONSerialization.isValidJSONObject(event),
				let data = try? JSONSerialization.data(withJSONObject: event)
			else {
				return
			}

			self.fileHandle.write(data)
			self.fileHandle.write(Data([0x0A]))
		}
	}
}

final class StderrLogger: @unchecked Sendable {
	private let queue = DispatchQueue(label: "com.notelab.microphone.stderr")
	private let fileHandle = FileHandle.standardError

	func log(_ message: String) {
		queue.async {
			guard let data = "\(message)\n".data(using: .utf8) else {
				return
			}

			self.fileHandle.write(data)
		}
	}
}

final class PcmChunkEncoder: @unchecked Sendable {
	private let emitter: StdoutEmitter
	private let flushIntervalNanoseconds: UInt64
	private let queue = DispatchQueue(label: "com.notelab.microphone.encoder")
	private var pendingBytes = Data()
	private var timer: DispatchSourceTimer?

	init(emitter: StdoutEmitter, flushIntervalMilliseconds: UInt64 = 100) {
		self.emitter = emitter
		self.flushIntervalNanoseconds = flushIntervalMilliseconds * 1_000_000
	}

	func start() {
		queue.sync {
			guard timer == nil else {
				return
			}

			let nextTimer = DispatchSource.makeTimerSource(queue: queue)
			nextTimer.schedule(
				deadline: .now() + .nanoseconds(Int(flushIntervalNanoseconds)),
				repeating: .nanoseconds(Int(flushIntervalNanoseconds))
			)
			nextTimer.setEventHandler { [weak self] in
				self?.flushLocked()
			}
			nextTimer.resume()
			timer = nextTimer
		}
	}

	func stop() {
		queue.sync {
			timer?.cancel()
			timer = nil
			flushLocked()
		}
	}

	func append(buffer: AVAudioPCMBuffer) {
		guard let floatChannel = buffer.floatChannelData?[0] else {
			return
		}

		let frameCount = Int(buffer.frameLength)
		guard frameCount > 0 else {
			return
		}

		queue.async {
			var encoded = Data(capacity: frameCount * MemoryLayout<Int16>.size)

			for frameIndex in 0..<frameCount {
				let sample = max(-1.0, min(1.0, floatChannel[frameIndex]))
				let scaled = sample >= 0
					? sample * Float(Int16.max)
					: sample * 32768
				var int16Sample = Int16(scaled.rounded())

				withUnsafeBytes(of: &int16Sample) { bytes in
					encoded.append(contentsOf: bytes)
				}
			}

			self.pendingBytes.append(encoded)
		}
	}

	private func flushLocked() {
		guard !pendingBytes.isEmpty else {
			return
		}

		let base64 = pendingBytes.base64EncodedString()
		pendingBytes.removeAll(keepingCapacity: true)
		emitter.send(event: [
			"type": "chunk",
			"pcm16": base64,
		])
	}
}

final class MicrophoneCapture: @unchecked Sendable {
	private static let targetSampleRate = 24_000.0
	private let encoder: PcmChunkEncoder
	private let logger: StderrLogger
	private let routeChangeHandler: @Sendable () -> Void
	private var engine: AVAudioEngine?
	private var hasInstalledTap = false
	private var engineConfigurationObserver: NSObjectProtocol?
	private var hasHandledRouteChange = false
	private var converter: AVAudioConverter?
	private var convertedFormat: AVAudioFormat?
	private(set) var voiceProcessingEnabled = false
	private(set) var voiceProcessingOutputEnabled = false
	private(set) var routeDebugInfo: [String: Any] = [:]

	init(
		encoder: PcmChunkEncoder,
		logger: StderrLogger,
		routeChangeHandler: @escaping @Sendable () -> Void
	) {
		self.encoder = encoder
		self.logger = logger
		self.routeChangeHandler = routeChangeHandler
	}

	func start() throws -> AVAudioFormat {
		try stop()
		logger.log("[helper] microphone start() entered")
		hasHandledRouteChange = false
		voiceProcessingEnabled = false
		voiceProcessingOutputEnabled = false
		routeDebugInfo = [:]

		let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .audio)
		guard authorizationStatus == .authorized else {
			throw MicrophoneCaptureError.permissionDenied
		}

		let nextEngine = AVAudioEngine()
		let inputNode = nextEngine.inputNode
		let outputNode = nextEngine.outputNode
		let inputFormatBeforeVoiceProcessing = inputNode.outputFormat(forBus: 0)
		let outputFormatBeforeVoiceProcessing = outputNode.inputFormat(forBus: 0)
		let inputDevice = Self.defaultInputDevice()
		let outputDevice = Self.defaultOutputDevice()

		if #available(macOS 10.15, *) {
			do {
				try inputNode.setVoiceProcessingEnabled(true)
				inputNode.isVoiceProcessingBypassed = false

				if #available(macOS 14.0, *) {
					inputNode.voiceProcessingOtherAudioDuckingConfiguration =
						AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
							enableAdvancedDucking: false,
							duckingLevel: .min
						)
				}

				voiceProcessingEnabled = inputNode.isVoiceProcessingEnabled
				voiceProcessingOutputEnabled = outputNode.isVoiceProcessingEnabled
				logger.log(
					"[helper] microphone voice processing input=\(voiceProcessingEnabled) output=\(voiceProcessingOutputEnabled)"
				)
			} catch {
				logger.log(
					"[helper] microphone voice processing unavailable: \(error.localizedDescription)"
				)
			}
		}

		let inputFormat = inputNode.outputFormat(forBus: 0)
		let outputFormat = outputNode.inputFormat(forBus: 0)
		routeDebugInfo = [
			"devicesMatch": inputDevice["uid"] as? String == outputDevice["uid"] as? String,
			"inputDevice": inputDevice,
			"inputFormatBeforeVoiceProcessing": Self.describeFormat(
				inputFormatBeforeVoiceProcessing
			),
			"inputFormatAfterVoiceProcessing": Self.describeFormat(inputFormat),
			"outputDevice": outputDevice,
			"outputFormatBeforeVoiceProcessing": Self.describeFormat(
				outputFormatBeforeVoiceProcessing
			),
			"outputFormatAfterVoiceProcessing": Self.describeFormat(outputFormat),
		]
		logger.log("[helper] microphone route \(routeDebugInfo)")

		guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
			throw MicrophoneCaptureError.invalidInputFormat
		}

		guard let tapFormat = AVAudioFormat(
			standardFormatWithSampleRate: inputFormat.sampleRate,
			channels: 1
		) else {
			throw MicrophoneCaptureError.tapFormatUnavailable
		}

		// Mic devices typically run at 44.1 / 48 kHz native. OpenAI Realtime
		// expects 24 kHz PCM16, so resample mono Float32 down to 24 kHz here.
		// Without this OpenAI plays the audio at half speed and produces
		// garbled / hallucinated transcripts.
		guard let targetFormat = AVAudioFormat(
			standardFormatWithSampleRate: Self.targetSampleRate,
			channels: 1
		) else {
			throw MicrophoneCaptureError.tapFormatUnavailable
		}
		let needsConversion =
			tapFormat.sampleRate != targetFormat.sampleRate ||
			tapFormat.channelCount != targetFormat.channelCount ||
			tapFormat.commonFormat != targetFormat.commonFormat ||
			tapFormat.isInterleaved != targetFormat.isInterleaved
		converter = needsConversion ? AVAudioConverter(from: tapFormat, to: targetFormat) : nil
		if needsConversion, converter == nil {
			throw MicrophoneCaptureError.tapFormatUnavailable
		}
		convertedFormat = targetFormat
		logger.log(
			"[helper] microphone resampling \(tapFormat.sampleRate)Hz -> \(targetFormat.sampleRate)Hz (needsConversion=\(needsConversion))"
		)

		inputNode.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) {
			[weak self] buffer, _ in
			self?.handleTapBuffer(buffer)
		}
		hasInstalledTap = true

		do {
			try nextEngine.start()
		} catch {
			inputNode.removeTap(onBus: 0)
			hasInstalledTap = false
			throw error
		}

		engine = nextEngine
		engineConfigurationObserver = NotificationCenter.default.addObserver(
			forName: .AVAudioEngineConfigurationChange,
			object: nextEngine,
			queue: nil
		) { [weak self] _ in
			self?.handleEngineConfigurationChange()
		}
		// Report the resampled (target) format so the host knows what's
		// actually arriving on the wire.
		return convertedFormat ?? tapFormat
	}

	private func handleTapBuffer(_ buffer: AVAudioPCMBuffer) {
		guard let converter, let targetFormat = convertedFormat else {
			// No conversion needed (already mono Float32 at the target rate).
			encoder.append(buffer: buffer)
			return
		}

		let sourceFrames = Double(buffer.frameLength)
		let outputFrameCapacity = max(
			AVAudioFrameCount(
				ceil(sourceFrames * targetFormat.sampleRate / buffer.format.sampleRate)
			),
			1
		)
		guard let convertedBuffer = AVAudioPCMBuffer(
			pcmFormat: targetFormat,
			frameCapacity: outputFrameCapacity
		) else {
			return
		}

		var hasSuppliedInput = false
		var conversionError: NSError?
		let status = converter.convert(to: convertedBuffer, error: &conversionError) {
			_, outStatus in
			if hasSuppliedInput {
				outStatus.pointee = .noDataNow
				return nil
			}
			hasSuppliedInput = true
			outStatus.pointee = .haveData
			return buffer
		}

		if let conversionError {
			logger.log(
				"[helper] microphone conversion error: \(conversionError.localizedDescription)"
			)
			return
		}

		switch status {
		case .haveData, .inputRanDry, .endOfStream:
			if convertedBuffer.frameLength > 0 {
				encoder.append(buffer: convertedBuffer)
			}
		case .error:
			logger.log("[helper] microphone conversion failed")
		@unknown default:
			return
		}
	}

	func stop() throws {
		guard let engine else {
			return
		}

		if hasInstalledTap {
			engine.inputNode.removeTap(onBus: 0)
			hasInstalledTap = false
		}

		if let engineConfigurationObserver {
			NotificationCenter.default.removeObserver(engineConfigurationObserver)
			self.engineConfigurationObserver = nil
		}

		engine.stop()
		self.engine = nil
		converter = nil
		convertedFormat = nil
		hasHandledRouteChange = false
	}

	private func handleEngineConfigurationChange() {
		guard !hasHandledRouteChange else {
			return
		}

		hasHandledRouteChange = true
		logger.log("[helper] microphone engine configuration changed")
		routeChangeHandler()
	}

	private static func propertyAddress(
		selector: AudioObjectPropertySelector,
		scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
		element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain
	) -> AudioObjectPropertyAddress {
		AudioObjectPropertyAddress(
			mSelector: selector,
			mScope: scope,
			mElement: element
		)
	}

	private static func defaultInputDevice() -> [String: Any] {
		describeDefaultDevice(selector: kAudioHardwarePropertyDefaultInputDevice)
	}

	private static func defaultOutputDevice() -> [String: Any] {
		describeDefaultDevice(selector: kAudioHardwarePropertyDefaultOutputDevice)
	}

	private static func describeDefaultDevice(
		selector: AudioObjectPropertySelector
	) -> [String: Any] {
		var address = propertyAddress(selector: selector)
		var deviceID = AudioDeviceID(0)
		var dataSize = UInt32(MemoryLayout<AudioDeviceID>.size)
		let status = AudioObjectGetPropertyData(
			AudioObjectID(kAudioObjectSystemObject),
			&address,
			0,
			nil,
			&dataSize,
			&deviceID
		)

		guard status == noErr, deviceID != 0 else {
			return [
				"id": 0,
				"lookupStatus": Int(status),
				"name": NSNull(),
				"uid": NSNull(),
			]
		}

		return [
			"id": Int(deviceID),
			"lookupStatus": Int(status),
			"name": deviceName(for: deviceID) ?? NSNull(),
			"uid": deviceUID(for: deviceID) ?? NSNull(),
		]
	}

	private static func deviceName(for deviceID: AudioDeviceID) -> String? {
		var address = propertyAddress(selector: kAudioObjectPropertyName)
		var unmanagedName: Unmanaged<CFString>?
		var dataSize = UInt32(MemoryLayout<CFString?>.size)
		let status = AudioObjectGetPropertyData(
			deviceID,
			&address,
			0,
			nil,
			&dataSize,
			&unmanagedName
		)

		guard status == noErr, let unmanagedName else {
			return nil
		}

		return unmanagedName.takeRetainedValue() as String
	}

	private static func deviceUID(for deviceID: AudioDeviceID) -> String? {
		var address = propertyAddress(selector: kAudioDevicePropertyDeviceUID)
		var unmanagedUID: Unmanaged<CFString>?
		var dataSize = UInt32(MemoryLayout<CFString?>.size)
		let status = AudioObjectGetPropertyData(
			deviceID,
			&address,
			0,
			nil,
			&dataSize,
			&unmanagedUID
		)

		guard status == noErr, let unmanagedUID else {
			return nil
		}

		return unmanagedUID.takeRetainedValue() as String
	}

	private static func describeFormat(_ format: AVAudioFormat) -> [String: Any] {
		[
			"channelCount": Int(format.channelCount),
			"commonFormat": format.commonFormat.rawValue,
			"isInterleaved": format.isInterleaved,
			"sampleRate": format.sampleRate,
		]
	}
}

@main
enum MicrophoneCaptureCLI {
	static func main() {
		setbuf(stdout, nil)

		let emitter = StdoutEmitter()
		let logger = StderrLogger()
		let encoder = PcmChunkEncoder(emitter: emitter)
		let capture = MicrophoneCapture(
			encoder: encoder,
			logger: logger,
			routeChangeHandler: {
				logger.log("[helper] microphone route changed, restarting capture")
				emitter.send(event: [
					"type": "error",
					"message": "Microphone device changed. Restarting capture.",
				])
				exit(EXIT_FAILURE)
			}
		)
		var signalSources: [DispatchSourceSignal] = []

		func stopCaptureAndExit(_ signal: Int32) -> Never {
			logger.log("[helper] received signal \(signal)")
			encoder.stop()
			try? capture.stop()
			emitter.send(event: [
				"type": "stopped",
				"signal": signal,
			])
			exit(signal == SIGTERM || signal == SIGINT ? 0 : 1)
		}

		for handledSignal in [SIGINT, SIGTERM] {
			signal(handledSignal, SIG_IGN)
			let source = DispatchSource.makeSignalSource(signal: handledSignal)
			source.setEventHandler {
				stopCaptureAndExit(handledSignal)
			}
			source.resume()
			signalSources.append(source)
		}

		do {
			let format = try capture.start()
			encoder.start()
			emitter.send(event: [
				"type": "ready",
				"channels": Int(format.channelCount),
				"route": capture.routeDebugInfo,
				"sampleRate": Int(format.sampleRate.rounded()),
				"voiceProcessingEnabled": capture.voiceProcessingEnabled,
				"voiceProcessingOutputEnabled": capture.voiceProcessingOutputEnabled,
			])
			withExtendedLifetime(signalSources) {
				dispatchMain()
			}
		} catch {
			logger.log("[helper] microphone failed: \(error.localizedDescription)")
			emitter.send(event: [
				"type": "error",
				"message": error.localizedDescription,
			])
			exit(EXIT_FAILURE)
		}
	}
}
