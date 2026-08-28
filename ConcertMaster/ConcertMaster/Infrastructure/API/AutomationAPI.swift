import Foundation

protocol CaptchaDetecting: Sendable {
    func detectCaptcha(in request: CaptchaDetectionRequest) async throws -> CaptchaDetectionResponse
}

protocol QuestionDetecting: Sendable {
    func detectQuestions(in request: QuestionDetectionRequest) async throws -> QuestionDetectionResponse
}

protocol TextInputPlanning: Sendable {
    func createTextInputPlan(for request: TextInputPlanRequest) async throws -> TextInputPlanResponse
}

struct RemoteAutomationAPI: CaptchaDetecting, QuestionDetecting, TextInputPlanning {
    let client: any APIClient

    func detectCaptcha(in request: CaptchaDetectionRequest) async throws -> CaptchaDetectionResponse {
        try await client.send(
            request,
            to: "/v1/detections/captcha",
            responseType: CaptchaDetectionResponse.self
        )
    }

    func detectQuestions(in request: QuestionDetectionRequest) async throws -> QuestionDetectionResponse {
        try await client.send(
            request,
            to: "/v1/detections/question",
            responseType: QuestionDetectionResponse.self
        )
    }

    func createTextInputPlan(for request: TextInputPlanRequest) async throws -> TextInputPlanResponse {
        try await client.send(
            request,
            to: "/v1/automation/text-input",
            responseType: TextInputPlanResponse.self
        )
    }
}
