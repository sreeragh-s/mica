// System-audio capture sidecar.
// Adapted from opengran (https://github.com/murabcd/opengran) — original at
// apps/desktop/native/SystemAudioCaptureCLI.swift. We vendor it largely as-is
// and only rename dispatch-queue labels.
//
// Requires macOS 14.4+ for the CoreAudio process-tap API.

@preconcurrency import AVFoundation
import AudioToolbox
import CoreAudio
import Dispatch
import Foundation

enum CaptureError: Error, LocalizedError {
	case aggregateDeviceCreationFailed(OSStatus)
	case converterCreationFailed
	case defaultOutputLookupFailed(OSStatus)
	case invalidTapFormat
	case ioProcCreationFailed(OSStatus)
	case ioProcStartFailed(OSStatus)
	case outputDeviceLookupFailed(OSStatus)
	case processObjectLookupFailed(OSStatus)
	case tapCreationFailed(OSStatus)
	case tapFormatLookupFailed(OSStatus)
	case tapTeardownFailed(OSStatus)

	var errorDescription: String? {
		switch self {
		case .aggregateDeviceCreationFailed(let status):
			return "Failed to create aggregate device (\(status))."
		case .converterCreationFailed:
			return "Failed to configure native system-audio conversion."
		case .defaultOutputLookupFailed(let status):
			return "Failed to resolve the default output device (\(status))."
		case .invalidTapFormat:
			return "System audio tap returned an invalid format."
		case .ioProcCreationFailed(let status):
			return "Failed to create the system-audio callback (\(status))."
		case .ioProcStartFailed(let status):
			return "Failed to start the system-audio callback (\(status))."
		case .outputDeviceLookupFailed(let status):
			return "Failed to read the output device identity (\(status))."
		case .processObjectLookupFailed(let status):
			return "Failed to resolve the current process object (\(status))."
		case .tapCreationFailed(let status):
			return "Failed to create the system-audio tap (\(status))."
		case .tapFormatLookupFailed(let status):
			return "Failed to read the system-audio tap format (\(status))."
		case .tapTeardownFailed(let status):
			return "Failed to stop the system-audio tap cleanly (\(status))."
		}
	}
}

final class StdoutEmitter: @unchecked Sendable {
	private let queue = DispatchQueue(label: "com.notelab.system-audio.stdout")
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
	private let queue = DispatchQueue(label: "com.notelab.system-audio.stderr")
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
	private let queue = DispatchQueue(label: "com.notelab.system-audio.encoder")
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
			nextTimer.schedule(deadline: .now() + .nanoseconds(Int(flushIntervalNanoseconds)), repeating: .nanoseconds(Int(flushIntervalNanoseconds)))
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

final class SystemAudioCapture: @unchecked Sendable {
	private static let targetSampleRate = 24_000.0
	private let callbackQueue = DispatchQueue(
		label: "com.notelab.system-audio.callback",
		qos: .userInteractive
	)
	private let encoder: PcmChunkEncoder
	private let logger: StderrLogger
	private let routeChangeHandler: @Sendable () -> Void
	private var aggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
	private var convertedFormat: AVAudioFormat?
	private var converter: AVAudioConverter?
	private var defaultOutputChangeListener: AudioObjectPropertyListenerBlock?
	private var hasHandledRouteChange = false
	private var ioProcID: AudioDeviceIOProcID?
	private var tapID = AudioObjectID(kAudioObjectUnknown)

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
		logger.log("[helper] start() entered")
		hasHandledRouteChange = false

		let outputDeviceID = try Self.defaultOutputDeviceID()
		logger.log("[helper] resolved default output device id: \(outputDeviceID)")
		let outputUID = try Self.deviceUID(for: outputDeviceID)
		logger.log("[helper] resolved default output uid: \(outputUID)")
		let tapUUID = UUID()
		let tapDescription = CATapDescription()

		tapDescription.name = "NoteLab System Audio"
		tapDescription.uuid = tapUUID
		tapDescription.processes = Self.currentProcessObjectID().map { [$0] } ?? []
		tapDescription.isPrivate = true
		tapDescription.muteBehavior = .unmuted
		tapDescription.isMixdown = false
		tapDescription.isMono = false
		tapDescription.isExclusive = true
		tapDescription.deviceUID = outputUID
		tapDescription.stream = 0

		var nextTapID = AudioObjectID(kAudioObjectUnknown)
		var status = AudioHardwareCreateProcessTap(tapDescription, &nextTapID)
		logger.log("[helper] AudioHardwareCreateProcessTap status: \(status)")
		guard status == noErr else {
			throw CaptureError.tapCreationFailed(status)
		}

		let aggregateUID = UUID().uuidString
		let aggregateDescription: [String: Any] = [
			kAudioAggregateDeviceNameKey: "NoteLab System Audio",
			kAudioAggregateDeviceUIDKey: aggregateUID,
			kAudioAggregateDeviceMainSubDeviceKey: outputUID,
			kAudioAggregateDeviceIsPrivateKey: true,
			kAudioAggregateDeviceIsStackedKey: false,
			kAudioAggregateDeviceTapAutoStartKey: true,
			kAudioAggregateDeviceSubDeviceListKey: [
				[
					kAudioSubDeviceUIDKey: outputUID,
				],
			],
			kAudioAggregateDeviceTapListKey: [
				[
					kAudioSubTapDriftCompensationKey: true,
					kAudioSubTapUIDKey: tapUUID.uuidString,
				],
			],
		]

		var nextAggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
		status = AudioHardwareCreateAggregateDevice(
			aggregateDescription as CFDictionary,
			&nextAggregateDeviceID
		)
		logger.log("[helper] AudioHardwareCreateAggregateDevice status: \(status)")
		guard status == noErr else {
			_ = AudioHardwareDestroyProcessTap(nextTapID)
			throw CaptureError.aggregateDeviceCreationFailed(status)
		}

		let streamDescription = try Self.tapStreamDescription(for: nextTapID)
		logger.log("[helper] resolved tap stream description")
		var mutableStreamDescription = streamDescription
		guard let format = AVAudioFormat(streamDescription: &mutableStreamDescription) else {
			_ = AudioHardwareDestroyAggregateDevice(nextAggregateDeviceID)
			_ = AudioHardwareDestroyProcessTap(nextTapID)
			throw CaptureError.invalidTapFormat
		}
		guard let targetFormat = AVAudioFormat(
			standardFormatWithSampleRate: Self.targetSampleRate,
			channels: 1
		) else {
			_ = AudioHardwareDestroyAggregateDevice(nextAggregateDeviceID)
			_ = AudioHardwareDestroyProcessTap(nextTapID)
			throw CaptureError.converterCreationFailed
		}
		let nextConverter =
			format.sampleRate == targetFormat.sampleRate &&
				format.channelCount == targetFormat.channelCount &&
				format.commonFormat == targetFormat.commonFormat &&
				format.isInterleaved == targetFormat.isInterleaved
				? nil
				: AVAudioConverter(from: format, to: targetFormat)

		if format.sampleRate != targetFormat.sampleRate &&
			nextConverter == nil
		{
			_ = AudioHardwareDestroyAggregateDevice(nextAggregateDeviceID)
			_ = AudioHardwareDestroyProcessTap(nextTapID)
			throw CaptureError.converterCreationFailed
		}

		var nextIoProcID: AudioDeviceIOProcID?
		status = AudioDeviceCreateIOProcIDWithBlock(
			&nextIoProcID,
			nextAggregateDeviceID,
			callbackQueue
		) { [weak self] _, inInputData, _, _, _ in
			self?.handleInputData(inInputData, sourceFormat: format)
		}
		logger.log("[helper] AudioDeviceCreateIOProcIDWithBlock status: \(status)")

		guard status == noErr, let nextIoProcID else {
			_ = AudioHardwareDestroyAggregateDevice(nextAggregateDeviceID)
			_ = AudioHardwareDestroyProcessTap(nextTapID)
			throw CaptureError.ioProcCreationFailed(status)
		}

		status = AudioDeviceStart(nextAggregateDeviceID, nextIoProcID)
		logger.log("[helper] AudioDeviceStart status: \(status)")
		guard status == noErr else {
			_ = AudioDeviceDestroyIOProcID(nextAggregateDeviceID, nextIoProcID)
			_ = AudioHardwareDestroyAggregateDevice(nextAggregateDeviceID)
			_ = AudioHardwareDestroyProcessTap(nextTapID)
			throw CaptureError.ioProcStartFailed(status)
		}

		tapID = nextTapID
		aggregateDeviceID = nextAggregateDeviceID
		convertedFormat = targetFormat
		converter = nextConverter
		ioProcID = nextIoProcID
		try registerDefaultOutputChangeListener()
		encoder.start()
		logger.log("[helper] encoder started, returning ready format")

		return targetFormat
	}

	func stop() throws {
		logger.log("[helper] stop() entered")
		encoder.stop()

		let currentAggregateDeviceID = aggregateDeviceID
		let currentIoProcID = ioProcID
		let currentTapID = tapID

		aggregateDeviceID = AudioObjectID(kAudioObjectUnknown)
		convertedFormat = nil
		converter = nil
		ioProcID = nil
		tapID = AudioObjectID(kAudioObjectUnknown)
		try removeDefaultOutputChangeListener()
		hasHandledRouteChange = false

		var firstError: CaptureError?

		if currentAggregateDeviceID != AudioObjectID(kAudioObjectUnknown) {
			if let currentIoProcID {
				let stopStatus = AudioDeviceStop(currentAggregateDeviceID, currentIoProcID)
				if stopStatus != noErr, firstError == nil {
					firstError = .tapTeardownFailed(stopStatus)
				}

				let destroyIoProcStatus = AudioDeviceDestroyIOProcID(
					currentAggregateDeviceID,
					currentIoProcID
				)
				if destroyIoProcStatus != noErr, firstError == nil {
					firstError = .tapTeardownFailed(destroyIoProcStatus)
				}
			}

			let destroyAggregateStatus =
				AudioHardwareDestroyAggregateDevice(currentAggregateDeviceID)
			if destroyAggregateStatus != noErr, firstError == nil {
				firstError = .tapTeardownFailed(destroyAggregateStatus)
			}
		}

		if currentTapID != AudioObjectID(kAudioObjectUnknown) {
			let destroyTapStatus = AudioHardwareDestroyProcessTap(currentTapID)
			if destroyTapStatus != noErr, firstError == nil {
				firstError = .tapTeardownFailed(destroyTapStatus)
			}
		}

		if let firstError {
			logger.log("[helper] stop() failed: \(firstError.localizedDescription)")
			throw firstError
		}

		logger.log("[helper] stop() completed")
	}

	private func handleInputData(
		_ inputData: UnsafePointer<AudioBufferList>,
		sourceFormat: AVAudioFormat
	) {
		let sourceBuffers = UnsafeMutableAudioBufferListPointer(
			UnsafeMutablePointer(mutating: inputData)
		)
		let streamDescription = sourceFormat.streamDescription
		let bytesPerFrame = Int(streamDescription.pointee.mBytesPerFrame)
		guard bytesPerFrame > 0, let firstSourceBuffer = sourceBuffers.first else {
			return
		}

		let frameCount = AVAudioFrameCount(Int(firstSourceBuffer.mDataByteSize) / bytesPerFrame)
		guard frameCount > 0 else {
			return
		}

		guard let pcmBuffer = AVAudioPCMBuffer(
			pcmFormat: sourceFormat,
			frameCapacity: frameCount
		) else {
			return
		}

		pcmBuffer.frameLength = frameCount
		let destinationBuffers = UnsafeMutableAudioBufferListPointer(
			pcmBuffer.mutableAudioBufferList
		)
		guard destinationBuffers.count == sourceBuffers.count else {
			return
		}

		for index in 0..<sourceBuffers.count {
			let source = sourceBuffers[index]
			let copySize = min(
				Int(source.mDataByteSize),
				Int(destinationBuffers[index].mDataByteSize)
			)

			guard copySize > 0,
				let sourceData = source.mData,
				let destinationData = destinationBuffers[index].mData
			else {
				continue
			}

			memcpy(destinationData, sourceData, copySize)
			destinationBuffers[index].mDataByteSize = UInt32(copySize)
		}

		guard let targetFormat = convertedFormat else {
			return
		}

		guard let converter else {
			encoder.append(buffer: pcmBuffer)
			return
		}

		let outputFrameCapacity = max(
			AVAudioFrameCount(
				ceil(Double(frameCount) * targetFormat.sampleRate / sourceFormat.sampleRate)
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
			return pcmBuffer
		}

		if let conversionError {
			logger.log("[helper] conversion error: \(conversionError.localizedDescription)")
			return
		}

		switch status {
		case .haveData, .inputRanDry, .endOfStream:
			if convertedBuffer.frameLength > 0 {
				encoder.append(buffer: convertedBuffer)
			}
		case .error:
			logger.log("[helper] conversion failed without a recoverable error")
		@unknown default:
			return
		}
	}

	private func registerDefaultOutputChangeListener() throws {
		try removeDefaultOutputChangeListener()
		var address = Self.propertyAddress(
			selector: kAudioHardwarePropertyDefaultOutputDevice
		)
		let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
			self?.handleDefaultOutputDeviceChange()
		}
		let status = AudioObjectAddPropertyListenerBlock(
			AudioObjectID(kAudioObjectSystemObject),
			&address,
			callbackQueue,
			listener
		)

		guard status == noErr else {
			throw CaptureError.defaultOutputLookupFailed(status)
		}

		defaultOutputChangeListener = listener
	}

	private func removeDefaultOutputChangeListener() throws {
		guard let defaultOutputChangeListener else {
			return
		}

		var address = Self.propertyAddress(
			selector: kAudioHardwarePropertyDefaultOutputDevice
		)
		let status = AudioObjectRemovePropertyListenerBlock(
			AudioObjectID(kAudioObjectSystemObject),
			&address,
			callbackQueue,
			defaultOutputChangeListener
		)

		self.defaultOutputChangeListener = nil

		guard status == noErr else {
			throw CaptureError.tapTeardownFailed(status)
		}
	}

	private func handleDefaultOutputDeviceChange() {
		guard !hasHandledRouteChange else {
			return
		}

		hasHandledRouteChange = true
		logger.log("[helper] default output device changed")
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

	private static func currentProcessObjectID() -> AudioObjectID? {
		var pid = getpid()
		var address = propertyAddress(
			selector: kAudioHardwarePropertyTranslatePIDToProcessObject
		)
		var processObjectID = AudioObjectID(kAudioObjectUnknown)
		var dataSize = UInt32(MemoryLayout<AudioObjectID>.size)

		let status = withUnsafePointer(to: &pid) { pidPointer in
			AudioObjectGetPropertyData(
				AudioObjectID(kAudioObjectSystemObject),
				&address,
				UInt32(MemoryLayout<pid_t>.size),
				pidPointer,
				&dataSize,
				&processObjectID
			)
		}

		guard status == noErr else {
			return nil
		}

		return processObjectID == AudioObjectID(kAudioObjectUnknown)
			? nil
			: processObjectID
	}

	private static func defaultOutputDeviceID() throws -> AudioDeviceID {
		var address = propertyAddress(
			selector: kAudioHardwarePropertyDefaultOutputDevice
		)
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
			throw CaptureError.defaultOutputLookupFailed(status)
		}

		return deviceID
	}

	private static func deviceUID(for deviceID: AudioDeviceID) throws -> String {
		var address = propertyAddress(selector: kAudioDevicePropertyDeviceUID)
		var dataSize = UInt32(MemoryLayout<CFString?>.size)
		var unmanagedUid: Unmanaged<CFString>?

		let status = AudioObjectGetPropertyData(
			deviceID,
			&address,
			0,
			nil,
			&dataSize,
			&unmanagedUid
		)

		guard status == noErr,
			let unmanagedUid
		else {
			throw CaptureError.outputDeviceLookupFailed(status)
		}

		return unmanagedUid.takeRetainedValue() as String
	}

	private static func tapStreamDescription(
		for tapID: AudioObjectID
	) throws -> AudioStreamBasicDescription {
		var address = propertyAddress(selector: kAudioTapPropertyFormat)
		var streamDescription = AudioStreamBasicDescription()
		var dataSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)

		let status = AudioObjectGetPropertyData(
			tapID,
			&address,
			0,
			nil,
			&dataSize,
			&streamDescription
		)

		guard status == noErr else {
			throw CaptureError.tapFormatLookupFailed(status)
		}

		return streamDescription
	}
}

@main
enum SystemAudioCaptureCLI {
	static func main() {
		setbuf(stdout, nil)

		let emitter = StdoutEmitter()
		let logger = StderrLogger()
		let encoder = PcmChunkEncoder(emitter: emitter)
		let capture = SystemAudioCapture(
			encoder: encoder,
			logger: logger,
			routeChangeHandler: {
				logger.log("[helper] system audio route changed, restarting capture")
				emitter.send(event: [
					"type": "error",
					"message": "System audio output changed. Restarting capture.",
				])
				exit(EXIT_FAILURE)
			}
		)
		var signalSources: [DispatchSourceSignal] = []
		logger.log("[helper] process launched")

		func stopCaptureAndExit(_ signal: Int32) -> Never {
			logger.log("[helper] received signal \(signal)")
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
			logger.log("[helper] emitting ready event")
			emitter.send(event: [
				"type": "ready",
				"channels": Int(format.channelCount),
				"sampleRate": format.sampleRate,
			])
			RunLoop.main.run()
		} catch {
			logger.log("[helper] startup failed: \(error.localizedDescription)")
			emitter.send(event: [
				"type": "error",
				"message": error.localizedDescription,
			])
			exit(1)
		}
	}
}
