import Carbon
import Foundation

@MainActor
final class GlobalHotKeyController {
    private var eventHandler: EventHandlerRef?
    private var hotKey: EventHotKeyRef?
    private var action: (() -> Void)?

    @discardableResult
    func registerToggle(action: @escaping () -> Void) -> Bool {
        self.action = action

        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let context = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())

        let handlerStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, _, userData in
                guard let userData else { return noErr }
                let ownerAddress = UInt(bitPattern: userData)
                DispatchQueue.main.async {
                    guard let pointer = UnsafeMutableRawPointer(bitPattern: ownerAddress) else { return }
                    let owner = Unmanaged<GlobalHotKeyController>
                        .fromOpaque(pointer)
                        .takeUnretainedValue()
                    owner.action?()
                }
                return noErr
            },
            1,
            &eventType,
            context,
            &eventHandler
        )
        guard handlerStatus == noErr else { return false }

        let identifier = EventHotKeyID(
            signature: OSType(0x434D5354), // CMST
            id: 1
        )
        let modifierFlags = UInt32(cmdKey | optionKey)
        let registrationStatus = RegisterEventHotKey(
            UInt32(kVK_ANSI_T),
            modifierFlags,
            identifier,
            GetApplicationEventTarget(),
            0,
            &hotKey
        )
        return registrationStatus == noErr
    }
}
