import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createRelativeMouse,
  parseCursorSample,
} from "../lib/relative-mouse.mjs";
import { validateSettings } from "../lib/settings.mjs";
import { startServer } from "../server.mjs";

test("Game mouse follows deltas even with a centered cursor, then recenters and clears lost permission", () => {
  const mouse = createRelativeMouse();
  assert.equal(
    validateSettings({ motionSource: "relative" }).motionSource,
    "relative",
  );
  const centered = parseCursorSample({
    x: 0,
    y: 0,
    dx: 150,
    dy: -75,
    relativeAvailable: true,
  });
  assert.deepEqual(
    mouse.sample(centered.dx, centered.dy, centered.relativeAvailable, 1000),
    { gameX: 0.5, gameY: -0.25, relativeAvailable: true },
  );
  assert.deepEqual(mouse.sample(0, 0, true, 1100), {
    gameX: 0.5,
    gameY: -0.25,
    relativeAvailable: true,
  });
  const returning = mouse.sample(0, 0, true, 1350);
  assert.ok(returning.gameX > 0 && returning.gameX < 0.25);
  assert.ok(returning.gameY < 0 && returning.gameY > -0.125);
  assert.deepEqual(mouse.sample(9999, -9999, true, 1400), {
    gameX: 1,
    gameY: -1,
    relativeAvailable: true,
  });
  assert.deepEqual(mouse.sample(0, 0, false, 1500), {
    gameX: 0,
    gameY: 0,
    relativeAvailable: false,
  });
  for (const bad of [
    { x: 2, y: 0 },
    { x: 0, y: 0, dx: NaN },
    { x: 0, y: 0, dy: "2" },
    { x: 0, y: 0, relativeAvailable: 1 },
  ])
    assert.throws(() => parseCursorSample(bad));
  assert.deepEqual(parseCursorSample({ x: 0.1, y: 0.2 }), {
    x: 0.1,
    y: 0.2,
    dx: 0,
    dy: 0,
    relativeAvailable: false,
  });
});

test("Game mouse status, native permission action, and pose reach the local server independently of Minecraft", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-relative-"));
  let position,
    status,
    requests = 0,
    stopped = false;
  const app = await startServer({
    port: 0,
    dataDir,
    quiet: true,
    cursorFactory: async (_root, onPosition, onStatus) => {
      position = onPosition;
      status = onStatus;
      return {
        stop() {
          stopped = true;
        },
        async requestRelative() {
          requests++;
        },
      };
    },
  });
  try {
    status({
      connected: true,
      message: "Desktop",
      relativeSupported: true,
      relativeAvailable: false,
      relativeMessage: "Permission needed",
    });
    const state = async () =>
      await (await fetch(`${app.url}/api/state`)).json();
    assert.equal((await state()).tracking.relativeAvailable, false);
    assert.equal(
      (
        await fetch(`${app.url}/api/tracking/permission`, {
          method: "POST",
          headers: { Origin: "https://example.org" },
        })
      ).status,
      403,
    );
    assert.equal(requests, 0);
    assert.equal(
      (await fetch(`${app.url}/api/tracking/permission`, { method: "POST" }))
        .status,
      200,
    );
    assert.equal(requests, 1);
    status({
      connected: true,
      message: "Desktop",
      relativeSupported: true,
      relativeAvailable: true,
      relativeMessage: "Listening",
    });
    position({ x: 0, y: 0, gameX: 0.7, gameY: -0.4, relativeAvailable: true });
    const result = await state();
    assert.deepEqual(result.pointer, {
      x: 0,
      y: 0,
      gameX: 0.7,
      gameY: -0.4,
      relativeAvailable: true,
    });
    assert.equal(result.tracking.relativeAvailable, true);
    assert.deepEqual(result.minecraft, { connected: false, active: false });
  } finally {
    await app.close();
    assert.equal(stopped, true);
    await rm(dataDir, { recursive: true, force: true });
  }
});
