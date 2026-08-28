import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageHeading(
                    eyebrow: "Secure profile",
                    title: "Be ready before the queue opens.",
                    detail: "Keep frequently requested ticket details on this Mac so they can be offered to approved fields later."
                )

                Panel {
                    VStack(alignment: .leading, spacing: 18) {
                        Label("Stored in macOS Keychain", systemImage: "lock.shield.fill")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(.green)

                        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 16) {
                            GridRow {
                                formLabel("First name")
                                TextField("First name", text: $model.profile.firstName)
                                    .textFieldStyle(.roundedBorder)

                                formLabel("Last name")
                                TextField("Last name", text: $model.profile.lastName)
                                    .textFieldStyle(.roundedBorder)
                            }

                            GridRow {
                                formLabel("Country")
                                TextField("Country or region", text: $model.profile.country)
                                    .textFieldStyle(.roundedBorder)

                                formLabel("Date of birth")
                                DatePicker(
                                    "Date of birth",
                                    selection: $model.profile.dateOfBirth,
                                    in: ...Date.now,
                                    displayedComponents: .date
                                )
                                .labelsHidden()
                            }

                            GridRow {
                                formLabel("ID number")
                                SecureField("Government-issued ID", text: $model.profile.governmentID)
                                    .textFieldStyle(.roundedBorder)
                                    .gridCellColumns(3)
                            }
                        }

                        Divider()

                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Local by default")
                                    .font(.callout.weight(.semibold))
                                Text("Profile values are not part of the backend API contract.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Save profile") {
                                model.saveProfile()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!model.profile.isComplete)
                        }

                        if let message = model.profileMessage {
                            Text(message)
                                .font(.callout)
                                .foregroundStyle(message.contains("securely") ? .green : .red)
                        }
                    }
                }

                Panel {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Before auto-fill is enabled", systemImage: "person.badge.shield.checkmark.fill")
                            .font(.headline)
                        Text("Concert Master will show the target field and requested profile value before local text entry. Sensitive values should never be submitted to an unrecognized page or sent to the analysis backend.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(32)
            .frame(maxWidth: 900, alignment: .leading)
        }
    }

    private func formLabel(_ title: String) -> some View {
        Text(title)
            .font(.callout.weight(.medium))
            .foregroundStyle(.secondary)
    }
}

