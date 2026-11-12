# Follow mouse movement while playing another instance or game

Choose **Game mouse · macOS** under **Movement → Motion source** to turn the OBS avatar's head from relative mouse movement. This input comes from the desktop helper, independently of Minecraft, so the instance that owns the Fabric connection does not determine the head pose. No game mod is required for this mode.

This drives the avatar rendered by Skincast in OBS. It does not send input to a second Minecraft window or animate a character rendered inside that window.

## Enable it

1. Start this isolated checkout with `PORT=3334 npm start` and open `http://127.0.0.1:3334`. Use `http://127.0.0.1:3334/overlay` for its OBS Browser source. Leave the original project's server on its existing port.
2. Choose **Game mouse · macOS** in the Movement card. This selects Avatar view. Leave **Follow look direction** enabled.
3. Click **Enable Game mouse** if the card requests access. In **System Settings → Privacy & Security → Input Monitoring**, allow the helper or the terminal/app that launched Skincast, as named by macOS. Restart this checkout's server if macOS asks. The card should then say it is listening for relative movement.
4. Play the second Minecraft instance or your other game. Adjust look sensitivity and smoothing in Skincast. Microphone effects, skins, backgrounds, and studio gestures keep working.

The permission button requests access only when clicked. Starting Skincast does not prompt for Input Monitoring. The helper checks for an existing grant and otherwise keeps ordinary desktop tracking working. After granting access, it retries starting the event tap about once per second; a macOS-requested restart may still be necessary.

## What each mode follows

- **Desktop cursor** follows the absolute position of an unlocked pointer across the screen.
- **Game mouse · macOS** follows relative movement events. It works with a synthetic centered cursor in the automated replay. It is intended for games that lock or recenter the pointer, but captured-input compatibility still needs checking in each actual game. It does not read a game's camera orientation, walking, jumps, or actions.
- **Minecraft Java** follows actual player state through the Fabric bridge. Install the bridge and pairing config in the instance you play. The current bridge allows one publisher at a time, so avoid pairing a second background instance with the same studio. See [the Minecraft guide](minecraft.md).

Game mouse turns the head within a bounded range and returns it toward center after movement stops. It is an expressive movement reaction, not a permanent reconstruction of the game's camera angle. Large turns do not rotate the avatar away from the audience. It applies in Avatar view; Sandbox keeps its original controls.

## Implementation and permissions

The macOS helper uses a listen-only Core Graphics event tap for mouse movement and drag events. It does not register keyboard events, suppress mouse events, or inject input into another application. It reads relative event deltas rather than calculating a difference between screen positions. Core Graphics event deltas are not a promise of unaccelerated hardware input.

Primary references:

- [Apple's horizontal mouse delta field](https://developer.apple.com/documentation/coregraphics/cgeventfield/mouseeventdeltax).
- [Creating a Core Graphics event tap](<https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate(tap:place:options:eventsofinterest:callback:userinfo:)>).
- [Checking Input Monitoring access](<https://developer.apple.com/documentation/coregraphics/cgpreflightlisteneventaccess()>) and [requesting access](<https://developer.apple.com/documentation/coregraphics/cgrequestlisteneventaccess()>).

The Node helper validates samples and converts deltas to a shared head pose, so studio and OBS receive the same input. Missing permission clears the relative pose. The browser also clears relative input after 1.5 seconds without a sample. Switching to Desktop cursor restores the absolute pointer behavior.

This implementation supports relative tracking on macOS only. Existing Windows and X11 desktop cursor tracking still works, and Game mouse reports that it is unsupported there. No Windows Raw Input or Linux relative-input backend is included.

## Verification

```sh
npm test
npm run test:game-mouse
npm run test:minecraft
npm run test:browser
```

The Game mouse replay injects native-helper samples into a temporary server. It runs the real studio and OBS overlay in Chromium, verifies movement while absolute coordinates stay centered, checks recentering, reload, permission loss, stale input, and restores Desktop cursor mode. The permission request is stubbed in tests, so tests do not open a system dialog or modify privacy settings.

Verified on this machine: the Swift helper compiles, runs, and emits valid desktop samples while reporting missing Input Monitoring access. Eleven Node tests pass. The Game mouse and Minecraft browser replays and the existing browser suite pass. Actual global movement capture with permission granted, captured input in Minecraft or another game, and live OBS composition remain unverified. No game was launched and no privacy setting was changed during verification.

## Fedora continuation

Work paused before implementing the Linux backend. The user's target is Fedora on Wayland, including mouse tracking while another Minecraft instance or another game has focus. The current Game mouse source, pose integration, and browser tests are ready to reuse, but native relative capture currently exists only for macOS.

Next work: implement Linux mouse-device discovery and relative-event reading, establish scoped read access to the selected mouse device, and verify captured input on the actual Fedora desktop. The Linux kernel evdev interface is the proposed approach; no Linux reader, device permissions, or live Wayland verification have been implemented yet. Keep this checkout's server on a separate port and preserve the existing Fabric/OBS functionality.
