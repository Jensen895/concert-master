import Foundation

struct UserProfile: Codable, Equatable {
    var country: String
    var governmentID: String
    var dateOfBirth: Date
    var firstName: String
    var lastName: String

    static let empty = UserProfile(
        country: "",
        governmentID: "",
        dateOfBirth: Calendar.current.date(byAdding: .year, value: -18, to: .now) ?? .now,
        firstName: "",
        lastName: ""
    )

    var isComplete: Bool {
        !country.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !governmentID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

