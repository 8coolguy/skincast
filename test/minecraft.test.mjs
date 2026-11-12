import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { startServer } from "../server.mjs";
import { createMinecraftBridge, parseMotion } from "../lib/minecraft.mjs";
import { minecraftPose } from "../src/minecraft-pose.js";

export const motion = {
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

const waitFor = async (predicate) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for Minecraft state");
};

test("Minecraft validates motion and maps crossing north to a small head turn", () => {
  const pose = minecraftPose(parseMotion(motion));
  assert.deepEqual(pose, {
    x: -0.2,
    y: -0.5,
    stride: 1,
    lift: 1.8,
    crouch: 1,
    swing: 0.5,
    usingItem: false,
  });
  assert.deepEqual(minecraftPose({ active: false }), {
    x: 0,
    y: 0,
    stride: 0,
    lift: 0,
    crouch: 0,
    swing: 0,
    usingItem: false,
  });
  for (const patch of [
    { version: 2 },
    { speed: 5 },
    { yaw: Infinity },
    { pitch: "45" },
    { grounded: 1 },
    { swing: -1 },
    { active: null },
  ])
    assert.throws(() => parseMotion({ ...motion, ...patch }));
  assert.deepEqual(parseMotion({ ...motion, active: false, pitch: "unused" }), {
    active: false,
  });
  assert.equal(
    Object.hasOwn(
      parseMotion({ ...motion, coordinates: [1, 2, 3] }),
      "coordinates",
    ),
    false,
  );
});

test("Minecraft ownership expires and rejects late packets from an old client", () => {
  const bridge = createMinecraftBridge();
  const old = {},
    next = {};
  assert.equal(bridge.claim(old), true);
  assert.equal(bridge.claim(next), false);
  bridge.receive(old, motion, 10000);
  assert.equal(bridge.expire(11500), null);
  assert.equal(bridge.expire(11501), old);
  assert.deepEqual(bridge.snapshot(), { connected: false, active: false });
  assert.equal(bridge.claim(next), true);
  assert.equal(bridge.disconnect(old), false);
  assert.throws(() => bridge.receive(old, motion));
});

test("paired Minecraft reaches OBS, keeps voice independent, and releases stale publishers", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-minecraft-"));
  const app = await startServer({
    port: 0,
    dataDir,
    cursor: false,
    quiet: true,
  });
  const sockets = [];
  try {
    const configResponse = await fetch(`${app.url}/api/minecraft/config`);
    assert.equal(configResponse.headers.get("cache-control"), "no-store");
    const config = await configResponse.text();
    const url = config.match(/^url=(.+)$/m)[1];
    const token = config.match(/^token=(.+)$/m)[1];
    assert.equal(
      token,
      await readFile(path.join(dataDir, "minecraft-token"), "utf8"),
    );
    assert.equal(url, app.url.replace("http:", "ws:") + "/minecraft");
    const state = async () =>
      await (await fetch(`${app.url}/api/state`)).json();
    assert.equal(JSON.stringify(await state()).includes(token), false);
    const denied = async (options) => {
      const socket = new WebSocket(url, options);
      sockets.push(socket);
      socket.on("error", () => {});
      await new Promise((resolve) => socket.once("close", resolve));
      assert.equal((await state()).minecraft.connected, false);
    };
    await denied({});
    await denied({ headers: { "X-Skincast-Token": "é".repeat(64) } });
    await denied({ headers: { "X-Skincast-Token": "a".repeat(64) } });
    await denied({ origin: app.url, headers: { "X-Skincast-Token": token } });
    assert.equal(
      (
        await fetch(`${app.url}/api/minecraft/config`, {
          headers: { Origin: "https://example.org" },
        })
      ).status,
      403,
    );
    const overlay = new WebSocket(app.url.replace("http:", "ws:") + "/events");
    sockets.push(overlay);
    const received = [];
    overlay.on("message", (raw) => received.push(JSON.parse(raw)));
    await once(overlay, "open");
    overlay.send(JSON.stringify(motion));
    overlay.send(JSON.stringify({ type: "voice-start" }));
    await waitFor(async () => (await state()).voice.connected);
    assert.equal((await state()).minecraft.active, false);
    const connect = async () => {
      const ws = new WebSocket(url, { headers: { "X-Skincast-Token": token } });
      ws.on("error", () => {});
      sockets.push(ws);
      await once(ws, "open");
      return ws;
    };
    const mod = await connect();
    mod.send(JSON.stringify(motion));
    await waitFor(() =>
      received.some((m) => m.type === "minecraft" && m.minecraft.active),
    );
    assert.equal((await state()).minecraft.pitch, 45);
    assert.equal((await state()).voice.connected, true);
    const duplicate = await connect();
    const [code] = await once(duplicate, "close");
    assert.equal(code, 1008);
    mod.send(JSON.stringify({ type: "motion", version: 1, active: false }));
    await waitFor(async () => !(await state()).minecraft.active);
    assert.equal((await state()).minecraft.connected, true);
    await waitFor(async () => !(await state()).minecraft.connected);
    const resumed = await connect();
    resumed.send(JSON.stringify(motion));
    await waitFor(async () => (await state()).minecraft.active);
    resumed.send(JSON.stringify({ ...motion, speed: "bad" }));
    await once(resumed, "close");
    assert.deepEqual((await state()).minecraft, {
      connected: false,
      active: false,
    });
    const final = await connect();
    final.send(JSON.stringify(motion));
    await waitFor(async () => (await state()).minecraft.active);
    final.close();
    await waitFor(async () => !(await state()).minecraft.connected);
    const oversized = await connect();
    oversized.send("x".repeat(3000));
    const [oversizedCode] = await once(oversized, "close");
    assert.equal(oversizedCode, 1009);
    assert.deepEqual((await state()).minecraft, {
      connected: false,
      active: false,
    });
  } finally {
    for (const socket of sockets) socket.terminate();
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
