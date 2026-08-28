# Architecture

Concert Master is split into three layers so page monitoring and automation can be added without coupling privileged macOS operations to the UI.

## macOS frontend

`ConcertMaster/ConcertMaster/UI` contains the menu-bar surface and the main configuration window. `AppModel` is the single UI state owner. The app supports two target policies:

- **Selected window:** remain scoped to a window the user explicitly chooses.
- **Frontmost app:** follow the active application after whole-screen access is granted.

The skeleton never captures screen content. It only exposes permission state and target-selection boundaries.

## Application and API layer

`Infrastructure/API` defines the client and three feature protocols:

- `CaptchaDetecting`
- `QuestionDetecting`
- `TextInputPlanning`

Their concrete remote adapter uses `/v1` endpoints from `backend/openapi.yaml`. Request and response types live in `Domain`, keeping the SwiftUI screens independent of networking details.

Screen capture and text insertion will be local macOS services. The backend can analyze a user-approved frame or generate an input plan, but execution stays on-device and should remain visible and interruptible.

## Backend

`backend` is a dependency-free Node.js service scaffold. It includes routing, consistent JSON responses, placeholder handlers, a health check, and contract tests. Feature endpoints return HTTP 501 until providers and data-handling rules are selected.

## Privacy and safety boundaries

- Profile data is stored locally in macOS Keychain.
- ID numbers are presented as secure fields and are not included in backend contracts.
- Capture should be opt-in, visibly active, and limited to the selected target.
- CAPTCHA support detects that human action is needed; it does not solve or bypass a challenge.
- Text insertion should require Accessibility permission and remain user-controlled.

## Suggested next milestones

1. Add ScreenCaptureKit source selection and low-frequency frame sampling.
2. Define redaction and retention rules before sending any frame to a backend.
3. Implement provider-backed CAPTCHA and question detection behind the protocols.
4. Implement local Accessibility-based field discovery and user-confirmed text entry.
5. Add signed backend authentication, rate limiting, structured logging, and persistence only where needed.
