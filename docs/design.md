# Local avatar studio

## Usage

Run `npm install` and `npm start`, open `http://127.0.0.1:3333`, and enable the microphone. Put `http://127.0.0.1:3333/overlay` in OBS as a Browser source. The control panel stays open to measure microphone volume. All settings update both views immediately and survive server restarts.

## Shape

`server.mjs` owns saved settings, Minecraft profile lookup, WebSocket connections, and live input. `lib/settings.mjs` validates complete settings at the network and disk boundaries. `lib/cursor.mjs` hides platform-specific cursor polling. The macOS helper outputs normalized position on the display containing the cursor. Windows uses a PowerShell helper. Linux supports X11 through xdotool.

The browser has one renderer, `src/avatar.js`, shared between studio and overlay. Its interface is `createAvatar(container, onError)` returning `configure(settings)`, `setInput(input)`, `setPerformance(play)`, `testVoice()`, and `dispose()`. It owns the skin viewer, smoothing, and pose composition. `src/speech.js` owns the speaking meshes and their appearance. `src/island.js` owns the block scene and build-target marker. `src/connection.js` manages reconnects. `src/microphone.js` owns capture and a background-safe AudioWorklet. It sends only a numerical volume measurement.

Settings are the persistent state. Cursor and microphone are ephemeral, independently owned inputs. Expired microphone input and disconnected cursor input return to neutral. A single controller owns microphone input at a time. Clients receive full state on connection, then small input messages. The overlay has no controls and no microphone permission requirement.

`lib/sandbox.mjs` owns the simulation. Clients send bounded movement input and named commands, never positions. The server advances physics at 30 Hz and broadcasts one shared player, action progress, and block layout. `src/playground.js` owns local focus, key releases, on-screen movement, and control ownership UI. The microphone and sandbox can have different controller tabs. Movement input expires after 400 ms without an update. Switching mode or disconnecting the controller releases movement ownership. World state is in memory and appears in connection snapshots; settings remain on disk. Block geometry rebuilds only when the world's revision changes.

The pose renderer combines walking, jumps, gestures, head tracking, and voice bounce each frame. Switching back to the avatar view restores the normal camera and size. Sandbox framing uses a fixed angled camera, so portrait controls are disabled while the island is visible. Voice customization uses the same saved fields and meshes in both views; its test button affects only the studio renderer.

## Synthesis decision

Compared browser-only, Electron desktop app, and a local server with a native cursor helper against global tracking, OBS isolation, setup effort, and state ownership. The browser-only candidate fails global tracking. Electron adds a large runtime for functionality the local bridge already supplies. Chose the local bridge, retaining a normal-browser microphone controller so OBS needs no media permissions. Architect's multi-provider runners were unavailable; these alternatives were compared directly without delegates.

## Tradeoffs

- The controller tab must stay open for the voice indicator. An AudioWorklet measures audio even when rendering is throttled in a background tab.
- Absolute cursor tracking follows the display containing the cursor. Games that lock the cursor to the center also center the avatar's gaze.
- macOS needs Command Line Tools to compile the tiny cursor helper on first run. Windows needs PowerShell; Linux X11 needs xdotool. Wayland requires an alternative global pointer integration.
- Username refresh needs Minecraft's profile service. The requested 8coolguy skin is bundled for offline startup. Downloaded skins are cached locally, and PNG upload works offline.

## Verification

Node tests exercise HTTP settings, persistence, input validation, stale/disconnected voice input, skin lookup boundaries, sandbox collision, jump landings, bounds, gestures, stale movement, and shared controller ownership. Browser tests exercise the real renderer, speaking controls, gestures, keyboard and block tools, focus release, late-joining overlays, synthetic microphone input, and reload behavior. Live OBS composition and hardware microphone permission are manual checks.

## Optional Minecraft input

`minecraft-mod/` is a client-only Fabric publisher for Java 1.21.11. `lib/minecraft.mjs` owns pairing validation, packet validation, publisher ownership, and stale expiry. The dedicated `/minecraft` WebSocket accepts authenticated native clients only. `server.mjs` broadcasts sanitized Minecraft state alongside the existing pointer, play, and voice streams. No Minecraft state is persisted.

The persisted `motionSource` setting defaults to `desktop`. `src/minecraft-pose.js` maps game pose to audience-facing avatar motion; `src/avatar.js` selects it only in Avatar view and clears stale poses locally as well as through server expiry. Microphone and background behavior remain independent. The full decision, protocol, installation, and verification limits are in [the Minecraft guide](minecraft.md).
