import SwiftUI

struct MonitoringView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageHeading(
                    eyebrow: "Live assistant",
                    title: "Keep watch without the clutter.",
                    detail: "Choose exactly what Concert Master may observe. Monitoring stays off until you start it."
                )

                monitoringHero
                captureScopePanel
                permissionsPanel
                pipelinePanel
            }
            .padding(32)
            .frame(maxWidth: 900, alignment: .leading)
        }
    }

    private var monitoringHero: some View {
        Panel {
            HStack(spacing: 22) {
                ZStack {
                    Circle()
                        .fill(model.isMonitoring ? Color.green.opacity(0.16) : Color.accentColor.opacity(0.12))
                    Image(systemName: model.isMonitoring ? "waveform.path.ecg.rectangle.fill" : "eye.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(model.isMonitoring ? Color.green : Color.accentColor)
                }
                .frame(width: 68, height: 68)

                VStack(alignment: .leading, spacing: 5) {
                    Text(model.lifecycle.title)
                        .font(.title2.weight(.bold))
                    Text(monitoringDescription)
                        .foregroundStyle(.secondary)
                    Text("Global shortcut: Command + Option + T")
                        .font(.caption)
                        .foregroundStyle(model.shortcutAvailable ? Color.secondary : Color.red)
                }

                Spacer()

                Button(model.isMonitoring ? "Stop" : "Start") {
                    model.toggleMonitoring()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(model.isMonitoring ? .red : .accentColor)
                .disabled(!model.canStartMonitoring && !model.isMonitoring)
            }
        }
    }

    private var captureScopePanel: some View {
        Panel {
            VStack(alignment: .leading, spacing: 16) {
                Text("1. Choose the monitoring scope")
                    .font(.headline)

                Picker("Monitoring scope", selection: $model.captureScope) {
                    ForEach(CaptureScope.allCases) { scope in
                        Label(scope.title, systemImage: scope.symbol)
                            .tag(scope)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: model.captureScope.symbol)
                        .font(.title3)
                        .foregroundStyle(.tint)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.captureScope.title)
                            .font(.callout.weight(.semibold))
                        Text(model.captureScope.detail)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Use current app") {
                        model.useFrontmostApplication()
                    }
                }

                Divider()

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Current target")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(model.selectedTarget?.displayName ?? "Choose a source when capture is implemented")
                            .font(.callout.weight(.medium))
                    }
                    Spacer()
                    StatusPill(
                        title: model.selectedTarget == nil ? "Unselected" : "Selected",
                        symbol: model.selectedTarget == nil ? "circle.dashed" : "checkmark.circle.fill",
                        color: model.selectedTarget == nil ? .secondary : .green
                    )
                }
            }
        }
    }

    private var permissionsPanel: some View {
        Panel {
            VStack(alignment: .leading, spacing: 16) {
                Text("2. Allow only what is needed")
                    .font(.headline)

                PermissionRow(
                    title: "Screen Recording",
                    detail: "Required to inspect the window or active app you choose.",
                    state: model.screenPermission,
                    actionTitle: "Request access",
                    action: model.requestScreenPermission
                )

                Divider()

                PermissionRow(
                    title: "Accessibility",
                    detail: "Required later for local, user-controlled text entry.",
                    state: model.accessibilityPermission,
                    actionTitle: "Request access",
                    action: model.requestAccessibilityPermission
                )
            }
        }
    }

    private var pipelinePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Planned assist pipeline")
                .font(.headline)

            HStack(spacing: 12) {
                PipelineStep(number: "01", title: "Observe", detail: "Capture the approved target")
                PipelineStep(number: "02", title: "Detect", detail: "Find CAPTCHAs and questions")
                PipelineStep(number: "03", title: "Assist", detail: "Prepare confirmed text input")
            }
        }
    }

    private var monitoringDescription: String {
        switch model.lifecycle {
        case .inactive: "Grant Screen Recording access to prepare monitoring."
        case .ready: "Permissions are ready. Capture implementation is the next milestone."
        case .monitoring: "The monitoring state is active; frame capture remains a stub."
        }
    }
}

private struct PermissionRow: View {
    let title: String
    let detail: String
    let state: PermissionState
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: state.symbol)
                .font(.title3)
                .foregroundStyle(state == .granted ? .green : .orange)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.callout.weight(.semibold))
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if state == .granted {
                StatusPill(title: state.title, symbol: state.symbol, color: .green)
            } else {
                Button(actionTitle, action: action)
            }
        }
    }
}

private struct PipelineStep: View {
    let number: String
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(number)
                .font(.caption.monospaced().weight(.bold))
                .foregroundStyle(.tint)
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 128, alignment: .topLeading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 15))
        .overlay {
            RoundedRectangle(cornerRadius: 15)
                .stroke(.quaternary)
        }
    }
}
