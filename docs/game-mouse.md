# Follow mouse movement while playing another instance or game

Choose **Game mouse · macOS / Linux** under **Movement → Motion source** to turn the OBS avatar's head from relative mouse movement. This input comes from the desktop helper, independently of Minecraft, so the instance that owns the Fabric connection does not determine the head pose. No game mod is required for this mode.

This drives the avatar rendered by Skincast in OBS. It does not send input to a second Minecraft window or animate a character rendered inside that window.

## Enable it

1. Start this isolated checkout with `PORT=3334 npm start` and open `http://127.0.0.1:3334`. Use `http://127.0.0.1:3334/overlay` for its OBS Browser source. Leave the original project's server on its existing port.
2. Choose **Game mouse · macOS / Linux** in the Movement card. This selects Avatar view. Leave **Follow look direction** enabled.
3. Click **Enable Game mouse** if the card requests access. In **System Settings → Privacy & Security → Input Monitoring**, allow the helper or the terminal/app that launched Skincast, as named by macOS. Restart this checkout's server if macOS asks. The card should then say it is listening for relative movement.
4. Play the second Minecraft instance or your other game. Adjust look sensitivity and smoothing in Skincast. Microphone effects, skins, backgrounds, and studio gestures keep working.

The permission button requests access only when clicked. Starting Skincast does not prompt for Input Monitoring. The helper checks for an existing grant and otherwise keeps ordinary desktop tracking working. After granting access, it retries starting the event tap about once per second; a macOS-requested restart may still be necessary.

## What each mode follows

- **Desktop cursor** follows the absolute position of an unlocked pointer across the screen.
- **Game mouse · macOS / Linux** follows relative movement events. It works with a synthetic centered cursor in the automated replay. It is intended for games that lock or recenter the pointer, but captured-input compatibility still needs checking in each actual game. It does not read a game's camera orientation, walking, jumps, or actions.
- **Minecraft Java** follows actual player state through the Fabric bridge. Install the bridge and pairing config in the instance you play. The current bridge allows one publisher at a time, so avoid pairing a second background instance with the same studio. See [the Minecraft guide](minecraft.md).

Game mouse turns the head within a bounded range and returns it toward center after movement stops. It is an expressive movement reaction, not a permanent reconstruction of the game's camera angle. Large turns do not rotate the avatar away from the audience. It applies in Avatar view; Sandbox keeps its original controls.

## Implementation and permissions

The macOS helper uses a listen-only Core Graphics event tap for mouse movement and drag events. It does not register keyboard events, suppress mouse events, or inject input into another application. It reads relative event deltas rather than calculating a difference between screen positions. Core Graphics event deltas are not a promise of unaccelerated hardware input.

Primary references:

- [Apple's horizontal mouse delta field](https://developer.apple.com/documentation/coregraphics/cgeventfield/mouseeventdeltax).
- [Creating a Core Graphics event tap](<https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate(tap:place:options:eventsofinterest:callback:userinfo:)>).
- [Checking Input Monitoring access](<https://developer.apple.com/documentation/coregraphics/cgpreflightlisteneventaccess()>) and [requesting access](<https://developer.apple.com/documentation/coregraphics/cgrequestlisteneventaccess()>).

The Node helper validates samples and converts deltas to a shared head pose, so studio and OBS receive the same input. Missing permission clears the relative pose. The browser also clears relative input after 1.5 seconds without a sample. Switching to Desktop cursor restores the absolute pointer behavior.

Linux uses Python 3 and kernel evdev mouse events. It works independently of Wayland pointer position and does not grab or inject input. X11 absolute tracking still uses xdotool. Windows relative input is not implemented.

## Verification

```sh
npm test
npm run test:game-mouse
npm run test:minecraft
npm run test:browser
```

The Game mouse replay injects native-helper samples into a temporary server. It runs the real studio and OBS overlay in Chromium, verifies movement while absolute coordinates stay centered, checks recentering, reload, permission loss, stale input, and restores Desktop cursor mode. The permission request is stubbed in tests, so tests do not open a system dialog or modify privacy settings.

Verified on this machine: the Swift helper compiles, runs, and emits valid desktop samples while reporting missing Input Monitoring access. Eleven Node tests pass. The Game mouse and Minecraft browser replays and the existing browser suite pass. Actual global movement capture with permission granted, captured input in Minecraft or another game, and live OBS composition remain unverified. No game was launched and no privacy setting was changed during verification.

## Fedora / Wayland setup

1. Install Python 3, Node.js 22 or newer, and dependencies with `npm ci`.
2. Identify the mouse: `ls -l /dev/input/by-id/*event-mouse`. Use your physical mouse's stable path, not an `event-kbd` device.
3. Grant only your user read access to that mouse (replace the path):

   ```sh
   sudo setfacl -m "u:$(id -un):r" /dev/input/by-id/YOUR-MOUSE-event-mouse
   ```

4. Start a separate studio using that same path:

   ```sh
   SKINCAST_MOUSE_DEVICE=/dev/input/by-id/YOUR-MOUSE-event-mouse PORT=3334 npm start
   ```

5. Open `http://127.0.0.1:3334`, select **Game mouse · macOS / Linux**, and add `http://127.0.0.1:3334/overlay` to OBS. The status should say it is listening. Move your mouse while playing either Minecraft instance or another game.

The helper retries device discovery and access every second, so granting access does not require restarting. Without `SKINCAST_MOUSE_DEVICE`, it reads accessible devices advertising both relative mouse axes. The reader discards key/button events and wheel input. It emits zero deltas at rest so the avatar returns to center. Disconnects and access loss clear relative availability. An already open device may remain readable until the helper closes it; restart Skincast after revoking access.

The ACL lasts until the device is recreated, usually at unplug or reboot. Reapply it then. Remove it with `sudo setfacl -x "u:$(id -un)" /dev/input/by-id/YOUR-MOUSE-event-mouse` and restart Skincast. Do not run the studio as root or add yourself to the broad `input` group.

Wayland absolute desktop cursor position is unavailable; select Game mouse for this session. Fabric mode remains available for actual Minecraft orientation, walking, jumping, and actions. Game mouse follows physical movement with its own sensitivity, rather than reading a game's camera angle.

### Fedora verification (2026-11-12)

Verified native capture on this Fedora Wayland desktop after granting a user-only read ACL to the Cooler Master mouse event device: 236 valid samples, 158 containing physical movement. The real server reports relative input available. All 12 Node tests pass, including Linux event filtering and dropped-event recovery. The Game mouse and Minecraft Chromium replays pass with simulated game input. Actual captured input inside a focused game and live OBS composition still require a gameplay check.
