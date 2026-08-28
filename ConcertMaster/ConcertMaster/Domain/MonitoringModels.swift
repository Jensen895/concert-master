import Foundation

enum CaptureScope: String, CaseIterable, Identifiable, Codable {
    case selectedWindow
    case frontmostApplication

    var id: Self { self }

    var title: String {
        switch self {
        case .selectedWindow: "Selected window"
        case .frontmostApplication: "Frontmost app"
        }
    }

    var detail: String {
        switch self {
        case .selectedWindow:
            "Stay limited to one window that you explicitly select."
        case .frontmostApplication:
            "Follow the app currently in front after full-screen access is allowed."
        }
    }

    var symbol: String {
        switch self {
        case .selectedWindow: "macwindow"
        case .frontmostApplication: "rectangle.on.rectangle"
        }
    }
}

struct CaptureTarget: Identifiable, Equatable, Codable {
    let id: UUID
    var applicationName: String
    var windowTitle: String?

    init(
        id: UUID = UUID(),
        applicationName: String,
        windowTitle: String? = nil
    ) {
        self.id = id
        self.applicationName = applicationName
        self.windowTitle = windowTitle
    }

    var displayName: String {
        guard let windowTitle, !windowTitle.isEmpty else { return applicationName }
        return "\(applicationName) — \(windowTitle)"
    }
}

enum PermissionState: String, Codable {
    case notRequested
    case granted
    case denied

    var title: String {
        switch self {
        case .notRequested: "Not requested"
        case .granted: "Allowed"
        case .denied: "Action needed"
        }
    }

    var symbol: String {
        switch self {
        case .notRequested: "circle.dashed"
        case .granted: "checkmark.circle.fill"
        case .denied: "exclamationmark.triangle.fill"
        }
    }
}

enum MonitorLifecycle: Equatable {
    case inactive
    case ready
    case monitoring

    var title: String {
        switch self {
        case .inactive: "Setup needed"
        case .ready: "Ready"
        case .monitoring: "Monitoring"
        }
    }
}

