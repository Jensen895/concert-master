import AppKit
import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var selectedSection: AppSection? = .monitor
    @Published var captureScope: CaptureScope = .selectedWindow
    @Published var selectedTarget: CaptureTarget?
    @Published var isMonitoring = false
    @Published var screenPermission: PermissionState = .notRequested
    @Published var accessibilityPermission: PermissionState = .notRequested
    @Published var profile: UserProfile = .empty
    @Published var profileMessage: String?
    @Published var shortcutAvailable = true

    private let permissions: any PermissionServicing
    private let profileRepository: any ProfileRepository
    private let hotKeyController: GlobalHotKeyController
    private var hasBootstrapped = false

    init(
        permissions: any PermissionServicing = SystemPermissionService(),
        profileRepository: any ProfileRepository = KeychainProfileRepository(),
        hotKeyController: GlobalHotKeyController = GlobalHotKeyController()
    ) {
        self.permissions = permissions
        self.profileRepository = profileRepository
        self.hotKeyController = hotKeyController
    }

    var lifecycle: MonitorLifecycle {
        if isMonitoring { return .monitoring }
        return screenPermission == .granted ? .ready : .inactive
    }

    var canStartMonitoring: Bool {
        screenPermission == .granted
    }

    func bootstrap() {
        guard !hasBootstrapped else { return }
        hasBootstrapped = true

        refreshPermissions()
        shortcutAvailable = hotKeyController.registerToggle { [weak self] in
            self?.toggleMonitoring()
        }

        do {
            if let storedProfile = try profileRepository.load() {
                profile = storedProfile
            }
        } catch {
            profileMessage = "The saved profile could not be loaded."
        }
    }

    func refreshPermissions() {
        screenPermission = permissions.screenCaptureStatus()
        accessibilityPermission = permissions.accessibilityStatus(prompt: false)
    }

    func requestScreenPermission() {
        screenPermission = permissions.requestScreenCaptureAccess()
    }

    func requestAccessibilityPermission() {
        accessibilityPermission = permissions.accessibilityStatus(prompt: true)
    }

    func useFrontmostApplication() {
        guard let application = NSWorkspace.shared.frontmostApplication else { return }
        selectedTarget = CaptureTarget(
            applicationName: application.localizedName ?? "Current application"
        )
    }

    func toggleMonitoring() {
        guard canStartMonitoring || isMonitoring else { return }
        isMonitoring.toggle()
    }

    func saveProfile() {
        do {
            try profileRepository.save(profile)
            profileMessage = "Profile saved securely in Keychain."
        } catch {
            profileMessage = "The profile could not be saved."
        }
    }
}
