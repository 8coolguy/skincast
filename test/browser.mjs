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
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${audio}`,
  ],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1120 },
    permissions: ["microphone", "clipboard-read", "clipboard-write"],
  });
  const studio = await context.newPage();
  const overlay = await context.newPage();
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
  await studio.locator('[data-framing="portrait"]').click();
  await studio.waitForFunction(
    () =>
      document
        .querySelector('[data-framing="portrait"]')
        .getAttribute("aria-pressed") === "true",
  );
  await studio.locator("#reset-view").click();
  await studio.locator('[data-background="color"]').click();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.background === "color",
  );
  assert.equal(
    await overlay
      .locator("#avatar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(184, 173, 220)",
  );
  await studio.locator('[data-background="transparent"]').click();
  await overlay.waitForFunction(
    () =>
      document.querySelector("#avatar").dataset.background === "transparent",
  );

  await studio
    .locator("#background-file")
    .setInputFiles({
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
  await studio.locator('[data-background="transparent"]').click();
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
  await studio.screenshot({ path: "test-results/studio.png", fullPage: true });
  await overlay.screenshot({
    path: "test-results/overlay-speaking.png",
    omitBackground: true,
  });
  await studio.locator("#mic-toggle").click();
  await overlay.waitForFunction(
    () => document.querySelector("#avatar").dataset.speaking === "false",
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
    "Browser verification passed: real WebGL pixels and alpha, gaze, framing, backgrounds, PNG upload, microphone AudioWorklet, overlay sync, clipboard, reload, mobile layout.",
  );
  console.log(
    "Screenshots: test-results/studio.png, test-results/overlay-speaking.png, test-results/mobile.png",
  );
} finally {
  await browser.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
