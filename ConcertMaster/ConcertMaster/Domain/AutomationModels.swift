import Foundation

struct CapturedFrameReference: Codable, Equatable, Sendable {
    let sessionID: UUID
    let frameID: UUID
    let capturedAt: Date
}

struct CaptchaDetectionRequest: Codable, Sendable {
    let frame: CapturedFrameReference
}

struct CaptchaDetectionResponse: Codable, Sendable {
    let detected: Bool
    let confidence: Double
    let requiresHumanAction: Bool
}

struct QuestionDetectionRequest: Codable, Sendable {
    let frame: CapturedFrameReference
}

struct DetectedQuestion: Codable, Identifiable, Sendable {
    let id: UUID
    let text: String
    let confidence: Double
}

struct QuestionDetectionResponse: Codable, Sendable {
    let questions: [DetectedQuestion]
}

enum ProfileFieldReference: String, Codable, Sendable {
    case country
    case governmentID
    case dateOfBirth
    case firstName
    case lastName
}

struct TextInputPlanRequest: Codable, Sendable {
    let sessionID: UUID
    let requestedFields: [ProfileFieldReference]
}

struct TextInputStep: Codable, Identifiable, Sendable {
    let id: UUID
    let field: ProfileFieldReference
    let targetLabel: String
}

struct TextInputPlanResponse: Codable, Sendable {
    let steps: [TextInputStep]
    let requiresConfirmation: Bool
}

