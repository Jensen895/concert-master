import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case monitor
    case profile
    case services

    var id: Self { self }

    var title: String {
        switch self {
        case .monitor: "Monitor"
        case .profile: "Profile"
        case .services: "API Services"
        }
    }

    var symbol: String {
        switch self {
        case .monitor: "eye"
        case .profile: "person.crop.circle"
        case .services: "point.3.connected.trianglepath.dotted"
        }
    }
}
