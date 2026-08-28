import SwiftUI

struct MainWindowView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $model.selectedSection) { section in
                Label(section.title, systemImage: section.symbol)
                    .tag(section)
                    .padding(.vertical, 4)
            }
            .navigationTitle("Concert Master")
            .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 260)
        } detail: {
            Group {
                switch model.selectedSection ?? .monitor {
                case .monitor:
                    MonitoringView()
                case .profile:
                    ProfileView()
                case .services:
                    APIStatusView()
                }
            }
            .environmentObject(model)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .toolbar {
            ToolbarItem(placement: .status) {
                HStack(spacing: 7) {
                    Circle()
                        .fill(model.isMonitoring ? Color.green : Color.secondary.opacity(0.5))
                        .frame(width: 8, height: 8)
                    Text(model.lifecycle.title)
                        .font(.callout.weight(.medium))
                }
            }
        }
    }
}

