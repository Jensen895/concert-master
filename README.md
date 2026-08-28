# Concert Master

Concert Master is a macOS 15 menu-bar app skeleton for user-authorized ticket-page monitoring. It establishes the UI, application/service boundaries, a secure local profile repository, and a backend HTTP contract without implementing page analysis or automation yet.

## What is included

- A background-style SwiftUI menu-bar app with a configuration window
- A global `Command + Option + T` monitoring toggle
- Selected-window and frontmost-app monitoring modes
- Screen Recording and Accessibility permission status UI
- A profile form for country, ID number, date of birth, first name, and last name
- Keychain-backed local profile storage
- Client protocols for CAPTCHA detection, question detection, and text-input planning
- A dependency-free Node.js backend skeleton and OpenAPI contract

The current monitoring and automation services are intentionally inert. CAPTCHA support is detection-only; solving or bypassing challenges is outside the design. Text entry is planned as a local, user-controlled accessibility action.

## Open the app

1. Open `ConcertMaster/ConcertMaster.xcodeproj` in Xcode 16 or newer.
2. Select the `ConcertMaster` scheme and a local Mac destination.
3. Build and run.

The target deployment version is macOS 15.0. The app is configured as a menu-bar agent (`LSUIElement`) so it does not remain in the Dock.

## Validate from the command line

The included Swift package mirrors the app source tree for lightweight compiler checks:

```sh
swift build
```

The backend uses only built-in Node.js modules:

```sh
cd backend
npm test
npm start
```

See `docs/ARCHITECTURE.md` for the layer boundaries and the next implementation steps.
