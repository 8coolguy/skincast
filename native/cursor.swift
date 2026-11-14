import AppKit
import CoreGraphics

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
if CommandLine.arguments.contains("--request-relative-permission") {
    print(CGRequestListenEventAccess() ? "granted" : "requested")
    exit(0)
}

var deltaX: Int64 = 0
var deltaY: Int64 = 0
var leftClicks = 0
var leftWasDown = false
var eventTap: CFMachPort?
var tapSource: CFRunLoopSource?
var permissionCheckAt = Date.distantPast
var relativeMessage = "Game mouse needs Input Monitoring permission."
let mouseEvents: CGEventMask = [CGEventType.mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .leftMouseDown]
    .reduce(0) { $0 | (CGEventMask(1) << $1.rawValue) }

func updateTap() {
    guard CGPreflightListenEventAccess() else {
        if let source = tapSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        if let tap = eventTap { CFMachPortInvalidate(tap) }
        tapSource = nil
        eventTap = nil
        deltaX = 0
        deltaY = 0
        relativeMessage = "Game mouse needs Input Monitoring permission."
        return
    }
    guard eventTap == nil else { return }
    eventTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
        options: .listenOnly, eventsOfInterest: mouseEvents, callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
            } else if type == .leftMouseDown {
                leftClicks += 1
            } else {
                deltaX += event.getIntegerValueField(.mouseEventDeltaX)
                deltaY += event.getIntegerValueField(.mouseEventDeltaY)
            }
            return Unmanaged.passUnretained(event)
        }, userInfo: nil)
    if let tap = eventTap {
        tapSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), tapSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        relativeMessage = "Game mouse is listening for relative movement."
    } else {
        relativeMessage = "Could not start Game mouse. Check Input Monitoring and restart Skincast."
    }
}

let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
    if Date().timeIntervalSince(permissionCheckAt) >= 1 {
        updateTap()
        permissionCheckAt = Date()
    }
    let point = NSEvent.mouseLocation
    let screens = NSScreen.screens
    guard let screen = screens.first(where: { NSMouseInRect(point, $0.frame, false) }) ?? screens.first else { return }
    let frame = screen.frame
    let x = max(-1, min(1, (point.x - frame.minX) / frame.width * 2 - 1))
    let y = max(-1, min(1, 1 - (point.y - frame.minY) / frame.height * 2))
    let available = eventTap.map { CGEvent.tapIsEnabled(tap: $0) } ?? false
    let leftDown = NSEvent.pressedMouseButtons & 1 != 0
    if !available && leftDown && !leftWasDown { leftClicks += 1 }
    leftWasDown = leftDown
    let payload: [String: Any] = ["x": x, "y": y, "display": screen.localizedName,
        "leftClicks": leftClicks,
        "dx": deltaX, "dy": deltaY, "relativeAvailable": available,
        "relativeMessage": relativeMessage]
    deltaX = 0
    deltaY = 0
    leftClicks = 0
    if let data = try? JSONSerialization.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}
RunLoop.main.run()
