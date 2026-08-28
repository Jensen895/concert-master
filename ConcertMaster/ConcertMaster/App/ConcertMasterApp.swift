import SwiftUI

@main
struct ConcertMasterApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView()
                .environmentObject(model)
                .onAppear { model.bootstrap() }
        } label: {
            Label("Concert Master", systemImage: model.isMonitoring ? "ticket.fill" : "ticket")
        }
        .menuBarExtraStyle(.window)

        Window("Concert Master", id: AppWindow.main) {
            MainWindowView()
                .environmentObject(model)
                .frame(minWidth: 900, minHeight: 620)
                .onAppear { model.bootstrap() }
        }
        .defaultSize(width: 1_020, height: 720)

        Settings {
            SettingsView()
                .environmentObject(model)
                .frame(width: 520, height: 320)
        }
    }
}

enum AppWindow {
    static let main = "main"
}
