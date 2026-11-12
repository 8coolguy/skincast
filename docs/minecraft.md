# Real Minecraft with an OBS avatar

Play Minecraft Java in first person. A client-only Fabric mod sends the local player's pose to Skincast. OBS displays a separate third-person avatar using your selected skin, microphone effects, and background. Minecraft owns the world, building, inventory, physics, and multiplayer. Skincast does not recreate them.

## Recommendation and alternatives

Use the small Fabric bridge in `minecraft-mod/` for this workflow. Its only game hooks are Fabric client tick and shutdown events. It does not replace the game camera, send gameplay commands, or require a server mod. On multiplayer servers, check their client-mod policy before using it.

[Figura](https://github.com/FiguraMC/Figura) customizes the model rendered inside Minecraft with Blockbench models and Lua scripts. [Customizable Player Models](https://github.com/tom5454/CustomPlayerModels) provides an in-game model editor and animations. Its [OSC addon](https://github.com/tom5454/CustomPlayerModels/wiki/OSC-Setup) receives OSC/VMC values to drive those animations. These are useful if you want a custom model visible inside the game. Neither project is a documented drop-in publisher for this app's existing browser renderer. That last assessment is an integration judgment, based on their documented purposes.

The bridge keeps the standard skin and OBS composition already working here. A game capture or a second spectator client would need separate camera, background, and capture setup to produce the same independent avatar.

## Supported build

The current build pins Minecraft Java **1.21.11**, Java **21**, Fabric Loader **0.20.1**, Fabric API **0.141.6+1.21.11**, Loom **1.14.10**, and Gradle **9.2.1**. It uses official Mojang mappings. It is not a Bedrock, Forge, NeoForge, or other Minecraft-version build. Other launchers can work if they run this exact Fabric instance; their compatibility has not been tested.

Primary references checked for this implementation:

- [Fabric events for 1.21.11](https://docs.fabricmc.net/1.21.11/develop/events) explains the event callback mechanism.
- [Fabric's official example project](https://github.com/FabricMC/fabric-example-mod/tree/1.21) demonstrates split client sources, Mojang mappings, and Java 21 builds.
- [Fabric Loader metadata for 1.21.11](https://meta.fabricmc.net/v2/versions/loader/1.21.11) lists available loader builds.
- [Fabric API Maven metadata](https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml) and [Loom Maven metadata](https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml) supply the pinned released dependencies.
- [Java 21 WebSocket API](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/WebSocket.html) provides asynchronous local transport without an additional bundled network library.

## Build and install

1. Install Java 21 and Node.js 22 or newer. Install Minecraft Java and create a Fabric **1.21.11** instance with Loader **0.20.1** and Fabric API **0.141.6+1.21.11**. Use your launcher's instance folder, which may differ from the standard Minecraft folder.
2. Build the mod from this checkout:

   ```sh
   cd minecraft-mod
   ./gradlew build
   ```

   On Windows use `gradlew.bat build`. On macOS, if Gradle uses an older Java, run `JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew build`.
3. Copy `minecraft-mod/build/libs/skincast-minecraft-0.1.0.jar` into the instance's `mods/` folder alongside Fabric API. Use the regular JAR, not the sources JAR.
4. Start this checkout's studio. For this independent checkout, use a separate port so the original project's server keeps running:

   ```sh
   npm ci
   PORT=3334 npm start
   ```

   In PowerShell, set `$env:PORT=3334` before `npm start`. Do not run two copies on port 3333. This checkout has its own ignored `.runtime/` settings and token.
5. Open `http://127.0.0.1:3334`. Under **Movement**, choose **Minecraft Java**. This also selects **Avatar** view. Click **Download Minecraft config**. Put the downloaded `skincast.properties` in the Minecraft instance's `config/` folder with that exact filename.
6. Restart Minecraft, open a world, and play in first person. The studio should say **Minecraft connected · following player**. Keep the studio tab open with the microphone enabled for speech effects.
7. For this checkout's OBS source, use `http://127.0.0.1:3334/overlay` at your existing width and height. Background, framing, skin, and speaking-effect controls work as before.

The config pairs this Minecraft instance with this running studio's port and token. If you change ports, move the config to another computer, or reset `.runtime/`, download a fresh config and restart Minecraft. A missing or invalid config disables the mod's bridge and logs a setup message; the rest of Minecraft continues normally.

## What follows the player

The mod samples on client ticks, normally 20 times per second. It sends wrapped yaw, body yaw, pitch, horizontal speed, a capped height above takeoff, grounded state, sneaking, sprinting, vanilla arm-swing progress, and item-use state. It observes actual player state rather than emulating key presses. The avatar walks in place; it never follows world coordinates across the OBS source.

The body faces the audience. Horizontal head rotation uses the player's head turn relative to the Minecraft body, so sustained camera turning does not spin the OBS avatar away from the stream. Pitch maps to looking up and down. Existing sensitivity, smoothing, and **Follow look direction** apply to the head. Jump rise lifts the avatar by a bounded amount, sneaking lowers it, and swings/item use move the right arm. This is a simplified pose, not Minecraft's full renderer. It does not render held items, armor, swimming, flight, riding, death, or left-handed animations. Swing progress covers mining, attacks, and other vanilla swings; it does not claim a block was successfully placed or broken.

Game menus, pause, lost game focus, spectator mode, and death send an inactive pose. Connection loss or missing packets clears motion after about 1.5 seconds. The server releases stale ownership within another 500 ms at most. Reconnecting starts with the next fresh pose, without a backlog. Only one Minecraft client can publish at a time. The mod retries every five seconds while the studio is unavailable.

Minecraft motion applies in **Avatar** view. Sandbox remains available with its existing controls. In Minecraft mode, game motion takes priority over studio gesture buttons. Choose **Desktop cursor** to restore the original avatar/gesture workflow. Voice effects are independent of both motion sources. This integration adds no audio processing; the existing effects visualize microphone volume.

## Local pairing and data

The server listens on `127.0.0.1`. The mod accepts only a `ws://127.0.0.1:PORT/minecraft` URL and sends the pairing token in a request header. The server rejects browser-origin connections on this dedicated publisher endpoint. Browser studios and overlays receive sanitized pose updates through the existing `/events` endpoint; they cannot publish Minecraft poses there.

The server creates `.runtime/minecraft-token` with owner-only permissions on platforms that support POSIX permissions. The config contains the same token. Keep it local. Removing the token file while the server is stopped rotates pairing on restart. `/api/state` and pose broadcasts never include the token. The config-download endpoint is same-origin and returns `Cache-Control: no-store`.

The mod sends no microphone audio, chat, username, UUID, server address, inventory, world name, or absolute world coordinates. The jump-height field is a relative, capped displacement only. No connection to a public service is needed for motion. Normal skin lookup remains a separate existing feature.

## Verification and remaining game check

Run these from the project root:

```sh
npm test
npm run test:browser
npm run test:minecraft
```

`test:minecraft` is a repeatable synthetic publisher. It starts a temporary local server on an available port, opens the actual studio and overlay in headless Chromium with WebGL, downloads the config, publishes motion, and verifies look direction, walking, jumping, sneaking, swinging, reload state, independent voice, pause, stale reset, and return to desktop input. It closes its server and removes temporary pairing data. It never contacts an existing running studio. Install Chromium with `npx playwright install chromium` if needed.

Verified here: the production mod JAR compiles and remaps against the pinned game APIs; all nine Node server tests and both browser suites pass. The existing browser suite had one transient timeout in sandbox pointer movement and passed on an isolated rerun. The Gradle project currently has no game runtime tests. Synthetic JSON replay proves the app bridge and rendering, not the mod's in-game event timing or visual feel.

No Minecraft game client was launched, and no installed game instance was identified. Manual checks still needed in a licensed 1.21.11 Fabric instance:

- Walk, sprint, turn, look up/down, jump, sneak, mine, attack, place blocks, and use an item while viewing the OBS overlay.
- Check whether head turning relative to the body and stride strength feel right in first person.
- Open inventory/chat/pause, tab away, return, leave the world, and reconnect.
- Stop/restart this studio and confirm the mod reconnects without delaying gameplay.
- Confirm OBS transparency and a real microphone while the game has focus.

Do not treat the built JAR or synthetic replay as a completed in-game acceptance test.
