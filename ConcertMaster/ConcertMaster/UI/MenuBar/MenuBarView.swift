import AppKit
import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: model.isMonitoring ? "waveform.path.ecg.rectangle.fill" : "ticket")
                    .font(.title2)
                    .foregroundStyle(model.isMonitoring ? Color.green : Color.accentColor)
                    .frame(width: 34, height: 34)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 9))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Concert Master")
                        .font(.headline)
                    Text(model.lifecycle.title)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            Divider()

            VStack(alignment: .leading, spacing: 5) {
                Text("Monitoring target")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(model.selectedTarget?.displayName ?? "No target selected")
                    .font(.callout.weight(.medium))
                    .lineLimit(1)
            }

            Button {
                model.toggleMonitoring()
            } label: {
                HStack {
                    Label(
                        model.isMonitoring ? "Stop monitoring" : "Start monitoring",
                        systemImage: model.isMonitoring ? "stop.fill" : "play.fill"
                    )
                    Spacer()
                    Text("⌘⌥T")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(model.isMonitoring ? .red : .accentColor)
            .disabled(!model.canStartMonitoring && !model.isMonitoring)

            HStack {
                Button("Open Concert Master") {
                    openWindow(id: AppWindow.main)
                    NSApplication.shared.activate(ignoringOtherApps: true)
                }
                Spacer()
                SettingsLink {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(.plain)
                Button {
                    NSApplication.shared.terminate(nil)
                } label: {
                    Image(systemName: "power")
                }
                .buttonStyle(.plain)
                .help("Quit Concert Master")
            }
        }
        .padding(16)
        .frame(width: 320)
    }
}
