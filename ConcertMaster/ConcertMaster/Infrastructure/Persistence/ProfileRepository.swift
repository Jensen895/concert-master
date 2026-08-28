import Foundation
import Security

protocol ProfileRepository {
    func load() throws -> UserProfile?
    func save(_ profile: UserProfile) throws
}

enum ProfileRepositoryError: Error {
    case unexpectedData
    case keychain(OSStatus)
}

struct KeychainProfileRepository: ProfileRepository {
    private let service = "com.concertmaster.app.profile"
    private let account = "default-profile"

    func load() throws -> UserProfile? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else {
            throw ProfileRepositoryError.keychain(status)
        }
        guard let data = result as? Data else {
            throw ProfileRepositoryError.unexpectedData
        }

        return try JSONDecoder().decode(UserProfile.self, from: data)
    }

    func save(_ profile: UserProfile) throws {
        let data = try JSONEncoder().encode(profile)
        let lookup: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let updates: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let updateStatus = SecItemUpdate(lookup as CFDictionary, updates as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw ProfileRepositoryError.keychain(updateStatus)
        }

        var insertion = lookup
        insertion.merge(updates) { _, new in new }
        let addStatus = SecItemAdd(insertion as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw ProfileRepositoryError.keychain(addStatus)
        }
    }
}

