import SwiftUI

struct APIStatusView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageHeading(
                    eyebrow: "Service layer",
                    title: "Three focused APIs, one clear boundary.",
                    detail: "The client contracts and backend routes are ready. Provider implementations will be added after capture and privacy behavior are finalized."
                )

                VStack(spacing: 12) {
                    ServiceCard(
                        symbol: "checkmark.shield",
                        title: "CAPTCHA detection",
                        endpoint: "POST /v1/detections/captcha",
                        detail: "Detects a challenge and pauses for human action. It does not solve or bypass it."
                    )
                    ServiceCard(
                        symbol: "questionmark.bubble",
                        title: "Question detection",
                        endpoint: "POST /v1/detections/question",
                        detail: "Finds question-like prompts in an approved captured frame."
                    )
                    ServiceCard(
                        symbol: "text.cursor",
                        title: "Text input planning",
                        endpoint: "POST /v1/automation/text-input",
                        detail: "Maps requested profile fields to visible targets; execution remains local and confirmed."
                    )
                }

                Panel {
                    HStack(spacing: 14) {
                        Image(systemName: "server.rack")
                            .font(.title2)
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Backend scaffold")
                                .font(.headline)
                            Text("Development base URL: http://127.0.0.1:8787")
                                .font(.callout.monospaced())
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        StatusPill(title: "Not connected", symbol: "circle.dashed", color: .secondary)
                    }
                }
            }
            .padding(32)
            .frame(maxWidth: 900, alignment: .leading)
        }
    }
}

private struct ServiceCard: View {
    let symbol: String
    let title: String
    let endpoint: String
    let detail: String

    var body: some View {
        Panel {
            HStack(spacing: 16) {
                Image(systemName: symbol)
                    .font(.title2)
                    .foregroundStyle(.tint)
                    .frame(width: 44, height: 44)
                    .background(.tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                    Text(detail)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text(endpoint)
                        .font(.caption.monospaced())
                        .foregroundStyle(.tertiary)
                }

                Spacer()
                StatusPill(title: "Scaffolded", symbol: "hammer.fill", color: .orange)
            }
        }
    }
}

