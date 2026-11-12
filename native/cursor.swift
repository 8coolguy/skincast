import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
    let point = NSEvent.mouseLocation
    let screens = NSScreen.screens
    guard let screen = screens.first(where: { NSMouseInRect(point, $0.frame, false) }) ?? screens.first else { return }
    let frame = screen.frame
    let x = max(-1, min(1, (point.x - frame.minX) / frame.width * 2 - 1))
    let y = max(-1, min(1, 1 - (point.y - frame.minY) / frame.height * 2))
    let payload: [String: Any] = ["x": x, "y": y, "display": screen.localizedName]
    if let data = try? JSONSerialization.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}
RunLoop.main.run()
