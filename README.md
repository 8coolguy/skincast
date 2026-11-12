# Skincast

Use your Minecraft skin as a 3D VTuber avatar in OBS. Your head follows the desktop cursor, and a customizable effect reacts to speech. Trigger gestures or control the avatar on a small block island. Choose a transparent background, a solid color, or an image.

## Start the studio

Install [Node.js 22 or newer](https://nodejs.org/). Then run these commands in the project folder.

```sh
npm install
npm start
```

Open [the local studio](http://127.0.0.1:3333) in Chrome, Edge, or Firefox. Your `8coolguy` skin is included, so the first preview works offline. To fetch your current skin from Minecraft, submit the username with the arrow button. You can also upload a skin PNG.

Click **Enable microphone** and allow access in your browser. Speak and adjust **Speaking threshold** until the indicator reacts to your voice but stays off for room noise.

Keep the server and studio tab open while streaming. The studio reads microphone volume and sends the volume to the overlay. It does not record or transmit your audio. You still use your normal OBS microphone source for stream audio.

## Add the avatar to OBS

1. In OBS, select **Sources → + → Browser**.
2. Name the source **Skincast**.
3. Leave **Local file** unchecked.
4. Paste `http://127.0.0.1:3333/overlay` into **URL**.
5. Set **Width** and **Height** to `800`.
6. Position and resize the source in your scene.

Use the studio's **Open overlay** button to inspect the output in a browser. The overlay contains the avatar without the studio controls. Settings apply to both views automatically.

Select **Transparent** for a cutout with no background. The checkerboard appears only in the studio. Select **Solid color** to choose a color. Select **Image** to upload a PNG, JPG, or WebP background.

## Enable desktop tracking

The server starts the cursor helper automatically. Check the **Movement** card for the helper's status.

- **macOS:** Install Xcode Command Line Tools with `xcode-select --install` if the helper cannot compile. The first launch compiles a small Swift program. It reads the pointer position without a screen recording permission.
- **Windows:** The helper runs through Windows PowerShell and reads the cursor with Windows Forms.
- **Linux with X11:** Install `xdotool` and Python 3. The helper reads the X11 desktop geometry and cursor position.
- **Linux with Wayland:** Global tracking is unavailable. Use an X11 session or **Preview tracking** to test movement inside the studio.

On macOS and Windows, the avatar follows the cursor relative to the display containing it. On X11, coordinates cover the combined desktop. **Preview tracking** affects only the studio preview. The OBS overlay continues using the desktop cursor.

A game that locks or repeatedly warps the mouse to the center also centers the avatar's gaze. This version tracks absolute cursor position, so mouse-look in Minecraft's locked-cursor mode does not turn the avatar's head.

## Adjust the avatar

Use **Full body**, **Portrait**, and the size slider to frame the avatar. The reset button restores full body at the default size. **Look sensitivity** sets how far the head turns. **Smoothing** controls how gradually it follows the cursor. Turn off **Idle animation** to stop the breathing motion.

Use the color picker beside **Speaking indicator** to choose the effect's color. Open **Customize speaking effect** for bars, dots, or a pulsing ring. Choose a position beside the head, above it, or on the chest. Set the size, opacity, count, and horizontal or vertical offset. **Fade-out time** controls how gradually the effect disappears when you stop speaking.

Set **Voice bounce** to zero to keep the avatar still while talking. The indicator switch hides the speaking effect independently of the bounce. **Test effect** runs a short preview without a microphone and does not send simulated speech to OBS. **Reset speaking effect** restores the default look. These settings save automatically and update the OBS overlay.

Custom skins can use classic or slim arms. Auto detect works for standard skins. Uploaded PNGs must be 64 × 64, 64 × 32, or an HD multiple up to 1024 px wide.

## Play with the avatar

The actions panel below the preview has **Wave**, **Dance**, **Spin**, **Cheer**, and **Jump** buttons. These actions appear in the OBS overlay. **Stop action** ends a gesture. You can use gestures in the normal avatar view or on the island.

To explore the island, select **Sandbox**, then click **Click to play** in the view or **Take control** below it. You see through the avatar's eyes and use the mouse to look around. OBS keeps its separate third-person camera, so viewers can still see your skin and speaking effect.

| Key | Action |
| --- | --- |
| Mouse | Look around |
| WASD or arrow keys | Walk relative to the direction you face |
| Shift | Run while moving |
| Space | Jump |
| 1, 2, 3 or mouse wheel | Select grass, stone, or wood |
| 4, 5, 6, 7 | Wave, dance, spin, cheer |
| Right click or E | Place the selected block at the crosshair |
| Left click or Q | Remove the block at the crosshair |
| F | Toggle fullscreen |
| Escape | Pause and release the mouse |

Aim with the crosshair. The outline marks the nearest block within reach. Aim at empty ground to build there, or at a block's side to build beside it. The island has one building layer, so aiming at a block's top does not stack another block. The island floor cannot be removed. Solid blocks stop movement, and you can jump onto them.

Press **Escape** to pause before changing studio settings. **Resume first person** captures the mouse again. Click **Release control** to let another studio tab take over. Only one tab can control the avatar at a time. Closing it releases control. The microphone and speaking effect continue working during play.

If mouse capture is unavailable, drag inside the view to look around and use E and Q to build or remove blocks. Touch users can drag to look and hold the on-screen arrow buttons to move. In the normal **Avatar** view, keys 1–4 still trigger gestures while the preview has focus.

**Reset island** clears placed blocks and returns the avatar to the center. **Avatar** returns to the normal stream framing. The island has a fixed 7 × 7 floor and one layer of placeable blocks. It has no inventory, crafting, mining timer, or combat. The shared island survives page refreshes and mode changes, and resets when you restart the server. Saved speaking and background settings survive server restarts.

## Troubleshoot

- **The avatar does not react to speech:** Keep the studio tab open, enable its microphone, and check that the input meter moves. Lower the speaking threshold. Only one studio tab can own the microphone.
- **Microphone access is blocked:** Allow microphone access in the browser's site settings and macOS or Windows privacy settings. Reload the studio and enable it again.
- **The avatar is blank:** Enable browser hardware acceleration. In OBS, refresh the source after restarting the server. Check the studio for a skin-loading error.
- **A username cannot load:** The username lookup supports Minecraft Java profiles. Upload a PNG for Bedrock or when Minecraft's service is unavailable.
- **The cursor helper stopped:** Restart the server. Use **Preview tracking** to check avatar motion independently of the helper.
- **Port 3333 is occupied:** On macOS or Linux, run `PORT=3334 npm start`. In PowerShell, set `$env:PORT=3334` before `npm start`. Copy the updated URL from the studio into OBS.

Settings and downloaded skins live in `.runtime/`, which Git ignores. Stop the server and remove that directory to reset the studio.

## Verify changes

Run the server checks and browser checks with Node.js 22 or newer.

```sh
npm test
npx playwright install chromium
npm run test:browser
```

To verify mouse capture, mouse-button building, and fullscreen in a regular Chromium window, run `SKINCAST_HEADED=1 npm run test:browser`. The default headless run checks the drag-to-look fallback because headless Chromium on macOS refuses pointer lock.

The browser check uses a real WebGL canvas and synthetic microphone audio. It checks alpha transparency, tracking, framing, backgrounds, uploads, speaking customization, gestures, first-person camera movement, block aiming, jumping, pause behavior, the independent OBS camera, overlay synchronization, page reloads, clipboard copying, and the mobile layout. Server tests cover ray intersections and reach, movement relative to gaze, collisions, landing on blocks, bounds, stale keys, and controller ownership. Screenshots go to `test-results/`.

The macOS helper was compiled and exercised on this computer. Windows and Linux helpers need verification on their respective desktops. Live OBS composition and hardware microphone permission still need a manual check.

## Project notes

The app binds only to `127.0.0.1`. It uses local WebSockets for cursor position, volume, and settings. Start, build, and test commands use a Node.js 22+ runtime from your PATH when an older Node version is the default.

See [the architecture notes](docs/design.md) for the module boundaries and design tradeoffs. The 3D renderer uses [skinview3d](https://github.com/bs-community/skinview3d), which is MIT licensed. The included skin was downloaded for the requested `8coolguy` Minecraft profile on November 11, 2026. This project is not affiliated with Mojang or Microsoft.
