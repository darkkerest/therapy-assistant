// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "parakeet-helper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "parakeet-helper", targets: ["ParakeetHelper"])
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", from: "0.12.4")
    ],
    targets: [
        .executableTarget(
            name: "ParakeetHelper",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio")
            ],
            path: "Sources/ParakeetHelper"
        )
    ]
)
