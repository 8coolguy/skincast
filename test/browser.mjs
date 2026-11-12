import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import "../scripts/build.mjs";

const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-browser-"));
await mkdir("test-results", { recursive: true });
const sampleRate = 48000,
  samples = sampleRate * 2;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  wav.writeInt16LE(
    Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 10000),
    44 + i * 2,
  );
const audio = path.join(dataDir, "voice.wav");
await writeFile(audio, wav);
const app = await startServer({ port: 0, dataDir, cursor: false, quiet: true });
const browser = await chromium.launch({
  headless: process.env.SKINCAST_HEADED !== "1",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${audio}`,
  ],
});
const errors = [];
let studio, overlay;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1120 },
    permissions: ["microphone", "clipboard-read", "clipboard-write"],
  });
  studio = await context.newPage();
  overlay = await context.newPage();
  studio.setDefaultTimeout(10000);
  overlay.setDefaultTimeout(10000);
  for (const page of [studio, overlay])
    page.on("pageerror", (err) => errors.push(err.message));
  await studio.goto(app.url);
  await studio.locator('#avatar[data-skin-loaded="true"]').waitFor();
  assert.equal(await studio.locator("#avatar-error").isVisible(), false);
  await overlay.goto(`${app.url}/overlay`);
  await overlay.locator('#avatar[data-skin-loaded="true"]').waitFor();
  assert.equal(
    await overlay
      .locator("#avatar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(await overlay.locator("button").count(), 0);
  const pixels = await overlay.locator("canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let visible = 0,
      transparent = 0;
    for (let i = 3; i < pixels.length; i += 4)
      pixels[i] > 0 ? visible++ : transparent++;
    return { visible, transparent };
  });
  assert.ok(
    pixels.visible > 1000,
    "3D skin must draw actual nontransparent pixels",
  );
  assert.ok(
    pixels.transparent > pixels.visible,
    "Overlay must retain a transparent background",
  );

  await studio.locator("#preview-track").click();
  const stage = await studio.locator("#preview-scene").boundingBox();
  await studio.mouse.move(
    stage.x + stage.width * 0.86,
    stage.y + stage.height * 0.25,
  );
  await studio.waitForFunction(
    () => Number(document.querySelector("#avatar").dataset.gazeX) > 0.3,
  );
  await studio.locator('button[data-framing="portrait"]').click();
  await studio.waitForFunction(
    () =>
      document
        .querySelector('button[data-framing="portrait"]')
        .getAttribute("aria-pressed") === "true",
  );
  await studio.locator("#reset-view").click();
  await studio.locator('button[data-background="color"]').click();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.background === "color",
  );
  assert.equal(
    await overlay
      .locator("#avatar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(184, 173, 220)",
  );
  await studio.locator('button[data-background="transparent"]').click();
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.background === "transparent",
  );

  await studio.locator("#background-file").setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: await readFile("assets/8coolguy.png"),
  });
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.background === "image",
  );
  assert.match(
    await overlay.locator("#avatar").evaluate((el) => el.style.backgroundImage),
    /data:image\/png/,
  );
  await studio.locator('button[data-background="transparent"]').click();
  await studio.locator("#skin-file").setInputFiles("assets/8coolguy.png");
  await studio.waitForFunction(
    () => document.querySelector("#skin-name").textContent === "Custom skin",
  );
  await overlay.locator('#avatar[data-skin-loaded="true"]').waitFor();

  await studio.locator("#mic-toggle").click();
  await studio.waitForFunction(
    () => document.querySelector("#voice-state").textContent === "Speaking",
  );
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.speaking === "true",
  );
  assert.ok(
    Number(await studio.locator("#audio-meter").getAttribute("aria-valuenow")) >
      5,
  );
  await studio.locator("#voice-customization summary").click();
  await studio.locator("#voiceStyle").selectOption("ring");
  await studio.locator("#voicePlacement").selectOption("above");
  const setRange = async (id, value) =>
    studio.locator(`#${id}`).evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, String(value));
  await setRange("voiceSize", 1.5);
  await setRange("voiceOpacity", 0.65);
  await setRange("voiceBounce", 0);
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.indicatorStyle === "ring" &&
      document.querySelector("#avatar").dataset.indicatorSize === "1.5",
  );
  assert.equal(await studio.locator("#voice-count-field").isVisible(), false);
  await overlay.screenshot({
    path: "test-results/voice-ring.png",
    omitBackground: true,
  });
  await studio.locator("#voiceStyle").selectOption("dots");
  await setRange("voiceCount", 5);
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.indicatorStyle === "dots",
  );
  assert.equal(await studio.locator("#voiceCount-value").textContent(), "5");
  await studio.locator("#voiceIndicator").uncheck();
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.indicatorVisible === "false",
  );
  await studio.locator("#voiceIndicator").check();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.indicatorVisible === "true",
  );
  await studio.screenshot({ path: "test-results/studio.png", fullPage: true });
  await overlay.screenshot({
    path: "test-results/overlay-speaking.png",
    omitBackground: true,
  });
  await studio.locator("#mic-toggle").click();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.speaking === "false",
  );
  await studio.locator("#test-voice").click();
  await studio.waitForFunction(
    () => document.querySelector("#avatar").dataset.speaking === "true",
  );
  assert.equal(
    await overlay.locator("#avatar").getAttribute("data-speaking"),
    "false",
    "Effect test must stay in the preview",
  );
  await studio.locator("#reset-voice").click();
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.indicatorStyle === "bars" &&
      document.querySelector("#avatar").dataset.indicatorPlacement === "right",
  );
  await studio.locator("#idle").uncheck();
  await studio.locator("#tracking").uncheck();
  await studio.waitForTimeout(300);
  const silhouetteWidth = () =>
    overlay.locator("canvas").evaluate((canvas) => {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      let minX = canvas.width,
        maxX = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (pixels[(y * canvas.width + x) * 4 + 3] > 32) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
      return maxX - minX;
    });
  const idleWidth = await silhouetteWidth();
  for (const action of ["wave", "dance", "spin", "cheer"]) {
    await studio.locator(`button[data-action="${action}"]`).click();
    await overlay.waitForFunction(
      (action) => document.querySelector("#avatar").dataset.action === action,
      action,
    );
    if (action === "wave") {
      assert.ok(
        (await silhouetteWidth()) > idleWidth + 20,
        "Waving must visibly raise and extend the arm in the actual WebGL output",
      );
      await overlay.screenshot({
        path: "test-results/gesture-wave.png",
        omitBackground: true,
      });
    }
    await studio.waitForTimeout(120);
  }
  await studio.locator('button[data-action="stop"]').click();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.action === "idle",
  );
  await studio.locator("#idle").check();
  await studio.locator("#tracking").check();
  await studio.bringToFront();
  await studio.locator('button[data-stage="sandbox"]').click();
  await studio.waitForFunction(
    () => document.querySelector("#avatar").dataset.view === "first-person",
  );
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.stageMode === "sandbox",
  );
  assert.equal(
    await overlay.locator("#avatar").getAttribute("data-view"),
    "third-person",
    "OBS must retain its independent avatar camera",
  );
  const headed = process.env.SKINCAST_HEADED === "1";
  const dragLook = async (dx = 0, dy = 0) => {
    await studio.locator("#preview-scene").scrollIntoViewIfNeeded();
    const box = await studio.locator("#preview-scene").boundingBox();
    await studio.mouse.move(box.x + 25, box.y + 120);
    await studio.mouse.down();
    if (dx || dy)
      await studio.mouse.move(box.x + 25 + dx, box.y + 120 + dy, { steps: 4 });
    await studio.mouse.up();
  };
  const enterView = async () => {
    await studio.bringToFront();
    await studio.locator("#enter-first-person").click();
    if (headed)
      await studio.waitForFunction(
        () => document.pointerLockElement?.id === "preview-scene",
      );
    else {
      await studio.waitForTimeout(150);
      await dragLook();
    }
  };
  await studio.locator("#take-control").click();
  await studio.waitForFunction(
    () =>
      document.querySelector("#take-control").getAttribute("aria-pressed") ===
      "true",
  );
  if (headed)
    await studio.waitForFunction(
      () => document.pointerLockElement?.id === "preview-scene",
    );
  else await studio.waitForTimeout(150);
  const initialYaw = Number(
    await studio.locator("#avatar").getAttribute("data-look-yaw"),
  );
  if (headed) await studio.mouse.move(640, 360);
  else await dragLook(60, 15);
  await studio.waitForFunction(
    (initial) =>
      Math.abs(
        Number(document.querySelector("#avatar").dataset.lookYaw) - initial,
      ) > 0.03,
    initialYaw,
  );
  await studio.keyboard.press("Escape");
  await studio.waitForFunction(
    () =>
      !document.pointerLockElement &&
      !document.querySelector("#pov-prompt").hidden,
  );
  await studio.locator('button[data-action="reset"]').click();
  await studio.waitForFunction(
    () => document.querySelector("#avatar").dataset.lookPitch === "-0.550",
  );
  await enterView();
  if (headed) {
    await studio.mouse.down({ button: "right" });
    await studio.mouse.up({ button: "right" });
  } else await studio.keyboard.press("e");
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.blocks === "1",
  );
  await studio.waitForTimeout(150);
  if (headed) {
    await studio.mouse.down();
    await studio.mouse.up();
  } else await studio.keyboard.press("q");
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.blocks === "0",
  );
  await studio.waitForTimeout(150);
  await studio.keyboard.press("3");
  assert.equal(await studio.locator("#block-type").inputValue(), "wood");
  if (headed) {
    await studio.mouse.down({ button: "right" });
    await studio.mouse.up({ button: "right" });
  } else await studio.keyboard.press("e");
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.blocks === "1",
  );
  await studio.keyboard.down("w");
  await overlay.waitForFunction(
    () => Number(document.querySelector("#avatar").dataset.playerZ) > 0.3,
  );
  await studio.keyboard.up("w");
  await studio.keyboard.down("d");
  await overlay.waitForFunction(
    () => Number(document.querySelector("#avatar").dataset.playerX) < -0.4,
  );
  await studio.keyboard.up("d");
  await studio.keyboard.press("Space");
  await overlay.waitForFunction(
    () => Number(document.querySelector("#avatar").dataset.playerY) > 0.1,
  );
  await overlay.waitForFunction(
    () => Number(document.querySelector("#avatar").dataset.playerY) === 0,
  );
  if (headed) {
    await studio.keyboard.press("f");
    await studio.waitForFunction(
      () => document.fullscreenElement?.id === "preview-scene",
    );
    await studio.keyboard.press("f");
    await studio.waitForFunction(() => !document.fullscreenElement);
    if (!(await studio.evaluate(() => !!document.pointerLockElement)))
      await enterView();
  }
  await studio
    .locator("#preview-scene")
    .screenshot({ path: "test-results/first-person.png" });
  await studio.keyboard.down("w");
  await studio.keyboard.press("Escape");
  await studio.keyboard.up("w");
  await studio.locator("#username").focus();
  await studio.waitForTimeout(150);
  const stoppedZ = Number(
    await overlay.locator("#avatar").getAttribute("data-player-z"),
  );
  await studio.waitForTimeout(450);
  assert.ok(
    Math.abs(
      Number(await overlay.locator("#avatar").getAttribute("data-player-z")) -
        stoppedZ,
    ) < 0.01,
    "Pausing first-person control must stop movement",
  );
  const startingX = Number(
    await overlay.locator("#avatar").getAttribute("data-player-x"),
  );
  const leftButton = studio.locator('[data-move="left"]');
  await leftButton.scrollIntoViewIfNeeded();
  const buttonBox = await leftButton.boundingBox();
  await studio.mouse.move(
    buttonBox.x + buttonBox.width / 2,
    buttonBox.y + buttonBox.height / 2,
  );
  await studio.mouse.down();
  await overlay.waitForFunction(
    (start) =>
      Number(document.querySelector("#avatar").dataset.playerX) > start + 0.2,
    startingX,
  );
  await studio.mouse.up();
  const lateOverlay = await context.newPage();
  await lateOverlay.goto(`${app.url}/overlay`);
  await lateOverlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.blocks === "1",
  );
  assert.equal(
    await lateOverlay.locator("#avatar").getAttribute("data-view"),
    "third-person",
  );
  await lateOverlay.close();
  await studio.locator('button[data-action="wave"]').click();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.action === "wave",
  );
  await studio.bringToFront();
  await studio.screenshot({
    path: "test-results/sandbox-studio.png",
    fullPage: true,
  });
  await overlay.screenshot({
    path: "test-results/sandbox-overlay.png",
    omitBackground: true,
  });
  await studio.locator("#take-control").click();
  await studio.waitForFunction(
    () =>
      document.querySelector("#take-control").getAttribute("aria-pressed") ===
      "false",
  );
  await studio.locator("#setup-toggle").click();
  assert.equal(await studio.locator("#setup-guide").isVisible(), true);
  await studio.locator("#copy-url").click();
  assert.equal(
    await studio.evaluate(() => navigator.clipboard.readText()),
    `${app.url}/overlay`,
  );

  await studio.reload();
  await studio.locator('#avatar[data-skin-loaded="true"]').waitFor();
  assert.equal(await studio.locator("#skin-name").textContent(), "Custom skin");
  assert.equal(
    await studio.locator("#avatar").getAttribute("data-stage-mode"),
    "sandbox",
  );
  assert.equal(
    await studio.locator("#avatar").getAttribute("data-blocks"),
    "1",
  );
  await studio.setViewportSize({ width: 390, height: 844 });
  await studio.screenshot({ path: "test-results/mobile.png", fullPage: true });
  assert.equal(
    await studio.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile layout must not scroll horizontally",
  );
  assert.deepEqual(errors, [], "Browser must have no uncaught errors");
  console.log(
    `Browser verification passed: WebGL transparency, microphone and speaking styles, gestures, first-person ${headed ? "mouse capture, mouse-button building, and fullscreen" : "drag-to-look fallback"}, movement, jumping, crosshair building, pause/resume, independent OBS camera, late joins, reload, and mobile layout.`,
  );
  console.log(
    "Screenshots: test-results/first-person.png, test-results/sandbox-overlay.png, test-results/mobile.png",
  );
} catch (error) {
  if (studio && !studio.isClosed())
    console.log(
      "Studio failure state:",
      await studio.evaluate(() => ({
        active: document.activeElement.id,
        control: document
          .querySelector("#take-control")
          .getAttribute("aria-pressed"),
        locked: !!document.pointerLockElement,
        focused: document.hasFocus(),
        captureError:
          document.querySelector("#preview-scene").dataset.captureError,
        view: { ...document.querySelector("#avatar").dataset },
        error: document.querySelector("#toast").textContent,
      })),
    );
  console.log(
    "Shared world at failure:",
    (await (await fetch(`${app.url}/api/state`)).json()).play,
  );
  throw error;
} finally {
  await browser.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
