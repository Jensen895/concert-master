import SwiftUI

struct PreferencesView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Form {
            Section("Keyboard shortcut") {
                LabeledContent("Toggle monitoring") {
                    Text("⌘⌥T")
                        .font(.body.monospaced())
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                }

                if !model.shortcutAvailable {
                    Label("The shortcut is already used by another app.", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }

            Section("Permissions") {
                LabeledContent("Screen Recording", value: model.screenPermission.title)
                LabeledContent("Accessibility", value: model.accessibilityPermission.title)
                Button("Refresh permission status") {
                    model.refreshPermissions()
                }
            }

            Section {
                Text("Concert Master 0.1.0 · macOS 15+")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}
