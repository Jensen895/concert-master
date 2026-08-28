// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "ConcertMaster",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "ConcertMaster", targets: ["ConcertMaster"])
    ],
    targets: [
        .executableTarget(
            name: "ConcertMaster",
            path: "ConcertMaster/ConcertMaster",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("Carbon"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("Security"),
                .linkedFramework("SwiftUI")
            ]
        )
    ]
)

