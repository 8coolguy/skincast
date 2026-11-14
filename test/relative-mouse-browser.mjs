import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";
import { createRelativeMouse } from "../lib/relative-mouse.mjs";
import "../scripts/build.mjs";

const dataDir = await mkdtemp(
  path.join(tmpdir(), "skincast-relative-browser-"),
);
let position,
  status,
  requests = 0,
  browser,
  timer;
const app = await startServer({
  port: 0,
  dataDir,
  quiet: true,
  cursorFactory: async (_root, onPosition, onStatus) => {
    position = onPosition;
    status = onStatus;
    return {
      stop() {},
      async requestRelative() {
        requests++;
      },
    };
  },
});
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const studio = await context.newPage(),
    overlay = await context.newPage();
  const errors = [];
  for (const page of [studio, overlay])
    page.on("pageerror", (error) => errors.push(error.message));
  status({
    connected: true,
    message: "Synthetic desktop",
    relativeSupported: true,
    relativeAvailable: false,
    relativeMessage: "Game mouse needs Input Monitoring permission.",
  });
  await studio.goto(app.url);
  await overlay.goto(`${app.url}/overlay`);
  await studio.locator('#avatar[data-skin-loaded="true"]').waitFor();
  await overlay.locator('#avatar[data-skin-loaded="true"]').waitFor();
  const clickSample = () => position({ x: 0, y: 0, leftClicks: 1 });
  const noSwing = async () => {
    await Promise.all([studio, overlay].map((page) => page.waitForFunction(() =>
      document.querySelector("#avatar").dataset.clickSwing === "0.000",
    )));
  };
  assert.equal(await studio.locator("#clickArm").isChecked(), false);
  clickSample();
  await noSwing();
  await studio.locator("#clickArm").check();
  await studio.waitForFunction(async () =>
    (await (await fetch("/api/state")).json()).settings.clickArm === true,
  );
  for (const mode of ["desktop", "relative"]) {
    await studio.locator("#motionSource").selectOption(mode);
    await overlay.locator(`#avatar[data-motion-source="${mode}"]`).waitFor();
    clickSample();
    await Promise.all([studio, overlay].map((page) => page.waitForFunction(() => {
      const d = document.querySelector("#avatar").dataset;
      return Number(d.clickSwing) > 0.2 && Number(d.rightArmPitch) < -0.3;
    })));
    await noSwing();
  }
  await studio.reload();
  await studio.locator("#clickArm:checked").waitFor();
  await noSwing();
  await overlay.reload();
  await overlay.locator('#avatar[data-skin-loaded="true"]').waitFor();
  await noSwing();
  await studio.locator("#clickArm").uncheck();
  await studio.waitForFunction(async () =>
    (await (await fetch("/api/state")).json()).settings.clickArm === false,
  );
  clickSample();
  await noSwing();
  await studio.locator("#motionSource").selectOption("relative");
  await studio.locator("#relative-options").waitFor({ state: "visible" });
  await studio.locator("#relative-permission").click();
  assert.equal(requests, 1);
  assert.equal(await studio.locator("#preview-track").isVisible(), false);
  assert.equal(await studio.locator('[data-action="wave"]').isEnabled(), true);
  await overlay
    .locator(
      '#avatar[data-motion-source="relative"][data-relative-active="false"]',
    )
    .waitFor();
  const mouse = createRelativeMouse();
  let available = true,
    moving = true;
  status({
    connected: true,
    message: "Synthetic desktop",
    relativeSupported: true,
    relativeAvailable: true,
    relativeMessage: "Game mouse is listening for relative movement.",
  });
  timer = setInterval(
    () =>
      position({
        x: 0,
        y: 0,
        ...mouse.sample(
          moving ? 60 : 0,
          moving ? -30 : 0,
          available,
          performance.now(),
        ),
      }),
    33,
  );
  for (const page of [studio, overlay])
    await page.waitForFunction(() => {
      const d = document.querySelector("#avatar").dataset;
      return (
        d.relativeActive === "true" &&
        Number(d.gazeX) > 0.4 &&
        Number(d.gazeY) < -0.2
      );
    });
  assert.equal(await studio.locator("#relative-permission").isVisible(), false);
  await overlay.reload();
  await overlay.locator('#avatar[data-relative-active="true"]').waitFor();
  moving = false;
  await overlay.waitForFunction(
    () =>
      Math.abs(Number(document.querySelector("#avatar").dataset.gazeX)) < 0.01,
  );
  moving = true;
  await overlay.waitForFunction(
    () => Number(document.querySelector("#avatar").dataset.gazeX) > 0.4,
  );
  available = false;
  status({
    connected: true,
    message: "Synthetic desktop",
    relativeSupported: true,
    relativeAvailable: false,
    relativeMessage: "Game mouse needs Input Monitoring permission.",
  });
  await overlay.locator('#avatar[data-relative-active="false"]').waitFor();
  await studio.locator("#relative-permission").waitFor({ state: "visible" });
  available = true;
  await overlay.locator('#avatar[data-relative-active="true"]').waitFor();
  clearInterval(timer);
  await overlay.locator('#avatar[data-relative-active="false"]').waitFor();
  await studio.locator("#motionSource").selectOption("desktop");
  position({
    x: -0.8,
    y: 0.7,
    gameX: 0.9,
    gameY: -0.9,
    relativeAvailable: true,
  });
  await overlay.waitForFunction(() => {
    const d = document.querySelector("#avatar").dataset;
    return (
      d.motionSource === "desktop" &&
      Number(d.gazeX) < -0.4 &&
      Number(d.gazeY) > 0.3
    );
  });
  assert.deepEqual(errors, []);
  console.log(
    "Game mouse browser checks passed: centered cursor with relative motion, studio/OBS synchronization, permission action/status, neutral return, reload, revoked access, stale reset, and desktop restoration. Game capture was simulated.",
  );
} finally {
  clearInterval(timer);
  await browser?.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
