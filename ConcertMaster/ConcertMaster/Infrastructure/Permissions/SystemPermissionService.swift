import AppKit
import ApplicationServices
import CoreGraphics

protocol PermissionServicing {
    func screenCaptureStatus() -> PermissionState
    func requestScreenCaptureAccess() -> PermissionState
    func accessibilityStatus(prompt: Bool) -> PermissionState
}

struct SystemPermissionService: PermissionServicing {
    func screenCaptureStatus() -> PermissionState {
        CGPreflightScreenCaptureAccess() ? .granted : .notRequested
    }

    func requestScreenCaptureAccess() -> PermissionState {
        CGRequestScreenCaptureAccess() ? .granted : .denied
    }

    func accessibilityStatus(prompt: Bool) -> PermissionState {
        let options = [
            "AXTrustedCheckOptionPrompt": prompt
        ] as CFDictionary
        return AXIsProcessTrustedWithOptions(options) ? .granted : (prompt ? .denied : .notRequested)
    }
}
