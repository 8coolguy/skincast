import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import "../scripts/build.mjs";

const dataDir = await mkdtemp(
  path.join(tmpdir(), "skincast-minecraft-replay-"),
);
const app = await startServer({ port: 0, dataDir, cursor: false, quiet: true });
let browser, mod, timer;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1120 },
    acceptDownloads: true,
  });
  const studio = await context.newPage();
  const overlay = await context.newPage();
  const errors = [];
  for (const page of [studio, overlay])
    page.on("pageerror", (error) => errors.push(error.message));
  await studio.goto(app.url);
  await overlay.goto(`${app.url}/overlay`);
  await studio.locator('#avatar[data-skin-loaded="true"]').waitFor();
  await overlay.locator('#avatar[data-skin-loaded="true"]').waitFor();
  await studio.locator("#motionSource").selectOption("minecraft");
  await studio.locator("#minecraft-options").waitFor({ state: "visible" });
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.motionSource === "minecraft",
  );
  await studio.locator("#idle").uncheck();
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.motionSource === "minecraft",
  );
  const pixels = (canvas) => {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const data = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    let hash = 2166136261,
      opaque = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (i % 4 === 3 && data[i] > 0) opaque++;
    }
    return { hash, opaque };
  };
  const neutralPixels = await overlay.locator("canvas").evaluate(pixels);
  assert.ok(
    neutralPixels.opaque > 1000,
    "Neutral avatar must actually render pixels",
  );
  assert.equal(await studio.locator('[data-action="wave"]').isDisabled(), true);
  assert.equal(await studio.locator("#preview-track").isVisible(), false);
  const config = await (await fetch(`${app.url}/api/minecraft/config`)).text();
  const downloadEvent = studio.waitForEvent("download");
  await studio.getByRole("link", { name: "Download Minecraft config" }).click();
  assert.equal(
    (await downloadEvent).suggestedFilename(),
    "skincast.properties",
  );
  mod = new WebSocket(config.match(/^url=(.+)$/m)[1], {
    headers: { "X-Skincast-Token": config.match(/^token=(.+)$/m)[1] },
  });
  await once(mod, "open");
  let packet = {
    type: "motion",
    version: 1,
    active: true,
    yaw: -170,
    bodyYaw: 175,
    pitch: 45,
    speed: 0.22,
    rise: 1,
    swing: 0.5,
    grounded: false,
    crouching: true,
    sprinting: true,
    usingItem: false,
  };
  timer = setInterval(() => mod.send(JSON.stringify(packet)), 50);
  for (const page of [studio, overlay]) {
    await page.waitForFunction(() => {
      const d = document.querySelector("#avatar").dataset;
      return (
        d.minecraftActive === "true" &&
        Number(d.gazeX) < -0.1 &&
        Number(d.gazeY) < -0.3 &&
        Number(d.lift) === 1.8 &&
        Number(d.crouch) === 1 &&
        Number(d.swing) === 0.5 &&
        Math.abs(Number(d.stride)) > 0.2
      );
    });
  }
  const motionPixels = await overlay.locator("canvas").evaluate(pixels);
  assert.ok(
    motionPixels.opaque > 1000,
    "Moving avatar must actually render pixels",
  );
  assert.notEqual(
    motionPixels.hash,
    neutralPixels.hash,
    "Minecraft pose must change the rendered canvas",
  );
  await mkdir("test-results", { recursive: true });
  await studio.screenshot({
    path: "test-results/minecraft-studio.png",
    fullPage: true,
  });
  await overlay.reload();
  await overlay.locator('#avatar[data-minecraft-active="true"]').waitFor();
  // Microphone packets and voice effects continue alongside Minecraft motion.
  const mic = new WebSocket(app.url.replace("http:", "ws:") + "/events");
  await once(mic, "open");
  mic.send(JSON.stringify({ type: "voice-start" }));
  mic.send(JSON.stringify({ type: "voice", level: 0.4 }));
  await overlay
    .locator('#avatar[data-speaking="true"][data-minecraft-active="true"]')
    .waitFor();
  mic.close();
  packet = { type: "motion", version: 1, active: false };
  await overlay.locator('#avatar[data-minecraft-active="false"]').waitFor();
  await overlay.waitForFunction(
    () =>
      Math.abs(Number(document.querySelector("#avatar").dataset.gazeX)) < 0.01,
  );
  packet = {
    ...packet,
    active: true,
    yaw: 0,
    bodyYaw: 0,
    pitch: 0,
    speed: 0,
    rise: 0,
    swing: 0,
    grounded: true,
    crouching: false,
    sprinting: false,
    usingItem: true,
  };
  await overlay.locator('#avatar[data-minecraft-active="true"]').waitFor();
  clearInterval(timer);
  // A silent live socket must stop the renderer and server, rather than freeze the last pose.
  await overlay.locator('#avatar[data-minecraft-active="false"]').waitFor();
  await studio.waitForFunction(
    () =>
      document.querySelector("#minecraft-status").textContent ===
      "Waiting for the Fabric mod",
  );
  await studio.locator("#motionSource").selectOption("desktop");
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.motionSource === "desktop",
  );
  assert.equal(
    await overlay
      .locator("#avatar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(await studio.locator('[data-action="wave"]').isEnabled(), true);
  assert.equal(await studio.locator("#preview-track").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    "Minecraft replay passed: paired publisher, real WebGL studio/overlay poses, config download, reload, voice, pause, stale reset, and desktop restoration. No Minecraft client was launched.",
  );
} finally {
  clearInterval(timer);
  mod?.terminate();
  await browser?.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
