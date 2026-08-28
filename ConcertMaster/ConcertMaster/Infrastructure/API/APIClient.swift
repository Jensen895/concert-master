import Foundation

protocol APIClient: Sendable {
    func send<Request: Encodable & Sendable, Response: Decodable & Sendable>(
        _ request: Request,
        to path: String,
        responseType: Response.Type
    ) async throws -> Response
}

enum APIClientError: Error {
    case invalidResponse
    case unsuccessfulStatus(Int)
}

struct URLSessionAPIClient: APIClient {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func send<Request: Encodable & Sendable, Response: Decodable & Sendable>(
        _ request: Request,
        to path: String,
        responseType: Response.Type
    ) async throws -> Response {
        let url = baseURL.appending(path: path)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = try JSONEncoder().encode(request)

        let (data, response) = try await session.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw APIClientError.unsuccessfulStatus(httpResponse.statusCode)
        }
        return try JSONDecoder().decode(responseType, from: data)
    }
}

