# Local avatar studio

## Usage

Run `npm install` and `npm start`, open `http://127.0.0.1:3333`, and enable the microphone. Put `http://127.0.0.1:3333/overlay` in OBS as a Browser source. The control panel stays open to measure microphone volume. All settings update both views immediately and survive server restarts.

## Shape

`server.mjs` owns saved settings, Minecraft profile lookup, WebSocket connections, and live input. `lib/settings.mjs` validates complete settings at the network and disk boundaries. `lib/cursor.mjs` hides platform-specific cursor polling. The macOS helper outputs normalized position on the display containing the cursor. Windows uses a PowerShell helper. Linux supports absolute X11 tracking through xdotool and relative mouse motion on X11 or Wayland through evdev.

The browser has one renderer, `src/avatar.js`, shared between studio and overlay. Its interface is `createAvatar(container, onError, {firstPerson})` returning `configure(settings)`, `setInput(input)`, `setMinecraft(minecraft)`, `setPerformance(play)`, `setLook(look)`, `swing()`, `testVoice()`, and `dispose()`. The studio opts into first-person sandbox rendering. The overlay keeps third person. The renderer owns the skin viewer, camera, skinned first-person arm, and pose composition. `src/speech.js` owns the speaking meshes. `src/island.js` owns the block scene and target outline. `src/connection.js` manages reconnects. `src/microphone.js` owns capture and an AudioWorklet that sends only a numerical volume measurement.

Settings are the persistent state. Cursor and microphone are ephemeral, independently owned inputs. Expired microphone input and disconnected cursor input return to neutral. A single controller owns microphone input at a time. Clients receive full state on connection, then small input messages. The overlay has no controls and no microphone permission requirement.

`lib/sandbox.mjs` owns the simulation. Clients send bounded movement input and named commands, never positions. The server advances physics at 30 Hz and broadcasts one shared player, action progress, and block layout. `src/playground.js` owns local focus, key releases, on-screen movement, and control ownership UI. The microphone and sandbox can have different controller tabs. Movement input expires after 400 ms without an update. Switching mode or disconnecting the controller releases movement ownership. World state is in memory and appears in connection snapshots; settings remain on disk. Block geometry rebuilds only when the world's revision changes.

Movement input includes bounded yaw and pitch. The server rotates local movement into world coordinates and keeps body heading aligned with gaze, including when strafing. `lib/aim.mjs` traces a ray from the player's eye through the crosshair. The nearest block face or ground intersection within 4.5 tiles determines placement and removal. Clients cannot submit arbitrary block coordinates. Reset increments an epoch so the controller resets its local predicted look together with the server's world state.

Controller ownership and active input are separate. The studio sends an `active` flag only while its view is focused and capturing mouse-look, using drag-to-look, or holding an on-screen movement button. Inactive input cannot move the player or change game aim. The shared `play.active` flag also expires with stale input. While it is false, both renderers apply the saved cursor sensitivity and smoothing to the avatar's pose, and the first-person view adds a cursor offset to its resting camera. These offsets never change simulation state. While active, cursor offsets decay to neutral and game mouse-look takes priority.

An explicit `initialWorld` option accepts a validated snapshot for a controlled server restart without losing placed blocks or position. It never restores control ownership or held input. Normal starts still create a fresh island.

The studio camera sits at the player's eye and applies local mouse-look immediately. The player body is hidden only in that renderer, with a separate copy of the skinned arm attached to the camera. OBS retains an angled camera and renders the full player with shared heading, pitch, movement, gestures, and voice effects. First-person sky and HUD are local to the studio; OBS uses the saved background. Pointer lock captures mouse movement after a click. Input handlers read the browser's current lock directly, because mouse input can arrive before the lock-change notification. Captured game clicks do not reach studio controls. Escape releases the pointer and clears movement without giving up controller ownership, so studio buttons remain usable while paused. Explicit release or disconnect frees ownership. Drag-to-look is the fallback when capture is unavailable. Switching back to Avatar restores the normal camera and framing.

## Synthesis decision

Compared browser-only, Electron desktop app, and a local server with a native cursor helper against global tracking, OBS isolation, setup effort, and state ownership. The browser-only candidate fails global tracking. Electron adds a large runtime for functionality the local bridge already supplies. Chose the local bridge, retaining a normal-browser microphone controller so OBS needs no media permissions. Architect's multi-provider runners were unavailable; these alternatives were compared directly without delegates.

## Tradeoffs

- The controller tab must stay open for the voice indicator. An AudioWorklet measures audio even when rendering is throttled in a background tab.
- Absolute cursor tracking follows the display containing the cursor. Games that lock the cursor to the center also center the avatar's gaze.
- macOS needs Command Line Tools to compile the tiny cursor helper on first run. Windows needs PowerShell; Linux X11 needs xdotool. Wayland requires an alternative global pointer integration.
- Username refresh needs Minecraft's profile service. The requested 8coolguy skin is bundled for offline startup. Downloaded skins are cached locally, and PNG upload works offline.

## Verification

Node tests exercise HTTP settings, input validation, persistence, skin lookup, crosshair targeting and reach, view-relative movement, collision, jump landings, bounds, stale input, and controller ownership. Browser tests exercise the renderer, speaking controls, gestures, first-person look and block tools, pause behavior, independent OBS view, late joins, synthetic microphone input, and page reloads. A headed browser run verifies actual pointer lock, mouse-button building, and fullscreen; the headless run verifies the drag fallback. Live OBS composition and hardware microphone permission are manual checks.

## Optional Minecraft input

`minecraft-mod/` is a client-only Fabric publisher for Java 26.1. `lib/minecraft.mjs` owns pairing validation, packet validation, publisher ownership, and stale expiry. The dedicated `/minecraft` WebSocket accepts authenticated native clients only. `server.mjs` broadcasts sanitized Minecraft state alongside the existing pointer, play, and voice streams. No Minecraft state is persisted.

The persisted `motionSource` setting defaults to `desktop`. `src/minecraft-pose.js` maps game pose to audience-facing avatar motion; `src/avatar.js` selects it only in Avatar view and clears stale poses locally as well as through server expiry. Microphone and background behavior remain independent. The full decision, protocol, installation, and verification limits are in [the Minecraft guide](minecraft.md).

## Relative mouse input

Game mouse is a third `motionSource`, separate from absolute desktop position and Minecraft player pose. The macOS helper emits mouse-event deltas through a listen-only Core Graphics event tap. `lib/relative-mouse.mjs` validates helper samples and integrates a bounded pose with a return to center. `lib/cursor.mjs` publishes absolute and relative values together and exposes a permission-request action. `server.mjs` shares the input with all views. The renderer selects relative values only in Avatar view and times out stale samples. Windows retains its absolute helper, and Linux retains absolute X11 tracking. See [Game mouse setup](game-mouse.md) for scope and verification limits.

On Linux, `native/cursor-linux.py` discovers relative mouse devices through sysfs and reads evdev motion with scoped device ACLs. It retries hotplug and permission changes, discards non-motion input, and shares the existing relative pose integration. Wayland supplies relative motion only; X11 absolute coordinates continue through xdotool.
