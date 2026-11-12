# Local avatar studio

## Usage

Run `npm install` and `npm start`, open `http://127.0.0.1:3333`, and enable the microphone. Put `http://127.0.0.1:3333/overlay` in OBS as a Browser source. The control panel stays open to measure microphone volume. All settings update both views immediately and survive server restarts.

## Shape

`server.mjs` owns saved settings, Minecraft profile lookup, WebSocket connections, and live input. `lib/settings.mjs` validates complete settings at the network and disk boundaries. `lib/cursor.mjs` hides platform-specific cursor polling. The macOS helper outputs normalized position on the display containing the cursor. Windows uses a PowerShell helper. Linux supports X11 through xdotool.

The browser has one renderer, `src/avatar.js`, shared between studio and overlay. Its interface is `createAvatar(container, onError)` returning `configure(settings)`, `setInput(input)`, and `dispose()`. It owns the skin viewer, smoothing, idle motion, and the mesh attached to the avatar's head that lights up when speaking. `src/connection.js` manages reconnects and exposes state messages. `src/microphone.js` owns capture and a background-safe AudioWorklet. It sends only a numerical volume measurement.

Settings are the persistent state. Cursor and microphone are ephemeral, independently owned inputs. Expired microphone input and disconnected cursor input return to neutral. A single controller owns microphone input at a time. Clients receive full state on connection, then small input messages. The overlay has no controls and no microphone permission requirement.

## Synthesis decision

Compared browser-only, Electron desktop app, and a local server with a native cursor helper against global tracking, OBS isolation, setup effort, and state ownership. The browser-only candidate fails global tracking. Electron adds a large runtime for functionality the local bridge already supplies. Chose the local bridge, retaining a normal-browser microphone controller so OBS needs no media permissions. Architect's multi-provider runners were unavailable; these alternatives were compared directly without delegates.

## Tradeoffs

- The controller tab must stay open for the voice indicator. An AudioWorklet measures audio even when rendering is throttled in a background tab.
- Absolute cursor tracking follows the display containing the cursor. Games that lock the cursor to the center also center the avatar's gaze.
- macOS needs Command Line Tools to compile the tiny cursor helper on first run. Windows needs PowerShell; Linux X11 needs xdotool. Wayland requires an alternative global pointer integration.
- Username refresh needs Minecraft's profile service. The requested 8coolguy skin is bundled for offline startup. Downloaded skins are cached locally, and PNG upload works offline.

## Verification

Node tests exercise HTTP settings, persistence, WebSocket broadcasting and validation, stale/disconnected voice input, and skin lookup boundaries. Browser tests exercise the real 3D renderer, controls, overlay, synthetic microphone input, and reload behavior. Live OBS composition and hardware microphone permission are manual checks.
