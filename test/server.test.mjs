import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { startServer } from "../server.mjs";
import { validateSettings } from "../lib/settings.mjs";
import { fetchSkin } from "../lib/skins.mjs";
import { createSandbox } from "../lib/sandbox.mjs";

function client(url) {
  const socket = new WebSocket(url.replace("http:", "ws:") + "/events");
  const messages = [];
  socket.on("message", (raw) => messages.push(JSON.parse(raw)));
  async function next(type, predicate = () => true) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const index = messages.findIndex(
        (item) => item.type === type && predicate(item),
      );
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`Timed out waiting for ${type}`);
  }
  return { socket, next, send: (value) => socket.send(JSON.stringify(value)) };
}

test("settings reject invalid external values and keep source tied to username", () => {
  assert.equal(validateSettings({}).username, "8coolguy");
  assert.equal(validateSettings({}).clickArm, false);
  assert.equal(validateSettings({ clickArm: true }).clickArm, true);
  for (const patch of [
    { zoom: NaN },
    { threshold: -1 },
    { tracking: "yes" },
    { clickArm: "yes" },
    { model: "unknown" },
    { background: "image" },
    { skinSource: "https://example.com/skin.png" },
    { username: "other" },
    { unknown: true },
    { voiceStyle: "fireworks" },
    { voiceSize: 9 },
    { voiceCount: 3.5 },
    { voiceOpacity: -1 },
    { stageMode: "minecraft" },
  ])
    assert.throws(() => validateSettings(patch));
  assert.equal(
    validateSettings({ skinSource: "/api/skin/8coolguy?v=1794450000000" })
      .username,
    "8coolguy",
  );
});

test("sandbox movement is bounded, blocks collide, jumping lands, and stale keys stop", () => {
  const game = createSandbox();
  game.setMode("sandbox");
  game.control(true);
  let now = 10000;
  const move = (x, z, count) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 30;
      game.input(
        { x, z, sprint: false, active: true, yaw: Math.PI, pitch: -1 },
        now,
      );
      game.tick(1 / 30, now);
    }
  };
  game.input(
    { x: 0, z: 0, sprint: false, active: true, yaw: Math.PI, pitch: -1 },
    now,
  );
  game.command("place", "stone", now);
  assert.deepEqual(game.snapshot(now).blocks, [{ x: 0, z: 1, type: "stone" }]);
  move(0, -1, 30);
  assert.ok(
    game.snapshot(now).z < 0.25,
    "A solid block must stop the player before overlap",
  );
  game.command("jump", null, now);
  move(0, -1, 15);
  assert.ok(game.snapshot(now).y >= 1, "A jump must clear a block");
  move(0, 0, 40);
  assert.equal(game.snapshot(now).y, 1, "Player lands on the block top");
  game.command("reset", null, now);
  move(1, 0, 100);
  assert.equal(game.snapshot(now).x, -3.15);
  game.command("reset", null, now);
  game.input(
    { x: 1, z: 0, sprint: false, active: true, yaw: Math.PI, pitch: -1 },
    now,
  );
  game.tick(0.05, now + 500);
  assert.equal(
    game.snapshot(now + 500).x,
    0,
    "Stale held keys cannot keep walking",
  );
  game.command("dance", null, now);
  assert.ok(Math.abs(game.snapshot(now + 2000).action.progress - 0.5) < 1e-8);
  game.tick(0.03, now + 4100);
  assert.equal(game.snapshot(now + 4100).action, null);
  assert.throws(
    () => game.input({ x: 100, z: 0, sprint: true, active: true }, now),
    /Invalid movement/,
  );
});

test("sandbox has one controller and synchronizes blocks and actions to overlays and reconnects", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-sandbox-"));
  const app = await startServer({
    port: 0,
    dataDir,
    cursor: false,
    quiet: true,
  });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const studio = client(app.url),
    overlay = client(app.url);
  await Promise.all([studio.next("state"), overlay.next("state")]);
  await fetch(`${app.url}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stageMode: "sandbox",
      voiceStyle: "ring",
      voicePlacement: "above",
      voiceSize: 1.7,
    }),
  });
  assert.equal((await overlay.next("settings")).settings.voiceStyle, "ring");
  studio.send({ type: "control-start" });
  assert.equal((await studio.next("control")).owned, true);
  overlay.send({ type: "control-start" });
  await overlay.next("control-busy");
  overlay.send({ type: "game-input", x: 1, z: 0, sprint: false, active: true });
  await overlay.next("error");
  studio.send({ type: "game-command", action: "place", blockType: "wood" });
  const built = (
    await overlay.next("play", (item) => item.play.blocks.length === 1)
  ).play;
  assert.deepEqual(built.blocks, [{ x: 0, z: 2, type: "wood" }]);
  const fresh = client(app.url);
  assert.equal((await fresh.next("state")).play.blocks[0].type, "wood");
  await new Promise((resolve) => setTimeout(resolve, 120));
  studio.send({ type: "game-command", action: "wave" });
  assert.equal(
    (await overlay.next("play", (item) => item.play.action?.name === "wave"))
      .play.action.name,
    "wave",
  );
  studio.socket.close();
  await overlay.next(
    "play",
    (item) => !item.play.controlled && item.play.revision >= built.revision,
  );
  overlay.send({ type: "control-start" });
  assert.equal((await overlay.next("control")).owned, true);
  overlay.send({ type: "game-command", action: "remove" });
  await fresh.next(
    "play",
    (item) =>
      item.play.revision > built.revision && item.play.blocks.length === 0,
  );
  await fetch(`${app.url}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stageMode: "avatar" }),
  });
  await fresh.next(
    "play",
    (item) => item.play.revision > built.revision && !item.play.controlled,
  );
});

test("studio and overlay share persisted settings, validate requests, and reconnect with current state", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-"));
  let app = await startServer({ port: 0, dataDir, cursor: false, quiet: true });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const studio = client(app.url);
  const overlay = client(app.url);
  assert.equal((await studio.next("state")).settings.background, "transparent");
  await overlay.next("state");
  const put = async (body) =>
    fetch(`${app.url}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const response = await put({
    background: "color",
    backgroundColor: "#ff8800",
    framing: "portrait",
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await overlay.next("settings")).settings.backgroundColor,
    "#ff8800",
  );
  assert.equal(
    JSON.parse(await readFile(path.join(dataDir, "settings.json"), "utf8"))
      .framing,
    "portrait",
  );
  assert.equal((await put({ zoom: 100 })).status, 400);
  assert.equal((await put(null)).status, 400);
  assert.equal((await put({ backgroundColor: "url(evil)" })).status, 400);
  assert.equal(
    (
      await fetch(`${app.url}/api/settings`, {
        method: "PUT",
        headers: {
          Origin: "https://example.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  await app.close();
  app = await startServer({ port: 0, dataDir, cursor: false, quiet: true });
  const fresh = client(app.url);
  const saved = await fresh.next("state");
  assert.equal(saved.settings.backgroundColor, "#ff8800");
  assert.equal(saved.settings.framing, "portrait");
  fresh.socket.close();
});

test("left clicks broadcast a swing only when enabled for desktop or game mouse", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-click-"));
  let position;
  const app = await startServer({
    port: 0, dataDir, quiet: true,
    cursorFactory: async (_root, onPosition) => {
      position = onPosition;
      return { stop() {} };
    },
  });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const studio = client(app.url), overlay = client(app.url);
  await Promise.all([studio.next("state"), overlay.next("state")]);
  const counts = [0, 0];
  [studio, overlay].forEach((view, index) => view.socket.on("message", (raw) => {
    if (JSON.parse(raw).type === "arm-swing") counts[index]++;
  }));
  const put = async (patch) => {
    const response = await fetch(`${app.url}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    assert.equal(response.status, 200);
  };
  let sequence = 0;
  const sample = async (leftClicks, expected) => {
    position({ x: 0, y: 0, leftClicks });
    // A later pointer packet is a barrier for all earlier swing broadcasts.
    position({ x: ++sequence / 100, y: 0, leftClicks: 0 });
    await Promise.all([studio, overlay].map((view) =>
      view.next("pointer", (message) => message.x === sequence / 100),
    ));
    assert.deepEqual(counts, [expected, expected]);
  };
  await sample(1, 0);
  await put({ clickArm: true, tracking: false });
  await sample(1, 1);
  await sample(0, 1);
  await put({ motionSource: "relative" });
  await sample(1, 2);
  await put({ motionSource: "minecraft" });
  await sample(1, 2);
  await put({ motionSource: "desktop", stageMode: "sandbox" });
  await sample(1, 2);
  await put({ stageMode: "avatar", clickArm: false });
  await sample(1, 2);
});

test("microphone ownership, level broadcasts, disconnect, and stale input recover", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "skincast-voice-"));
  const app = await startServer({
    port: 0,
    dataDir,
    cursor: false,
    quiet: true,
  });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const owner = client(app.url),
    other = client(app.url),
    overlay = client(app.url);
  await Promise.all([
    owner.next("state"),
    other.next("state"),
    overlay.next("state"),
  ]);
  owner.send({ type: "voice-start" });
  await overlay.next("voice", (item) => item.connected);
  owner.send({ type: "voice", level: 0.65 });
  assert.equal(
    (await overlay.next("voice", (item) => item.level > 0)).level,
    0.65,
  );
  other.send({ type: "voice-start" });
  assert.match((await other.next("mic-busy")).message, /another studio tab/);
  owner.send({ type: "voice", level: 2 });
  await owner.next("error");
  owner.socket.close();
  assert.equal(
    (await overlay.next("voice", (item) => !item.connected)).level,
    0,
  );
  other.send({ type: "voice-start" });
  await overlay.next("voice", (item) => item.connected);
  assert.equal(
    (await overlay.next("voice", (item) => !item.connected)).level,
    0,
  );
});

test("Minecraft skin resolution validates profile and texture host, and bundles 8coolguy offline", async () => {
  const bundled = await fetchSkin("8coolguy", {
    fetcher: () => {
      throw new Error("Network must not be needed");
    },
  });
  assert.equal(bundled.readUInt32BE(16), 64);
  await assert.rejects(fetchSkin("../escape"), /Invalid Minecraft username/);
  const calls = [];
  const session = (url) => ({
    properties: [
      {
        name: "textures",
        value: Buffer.from(
          JSON.stringify({ textures: { SKIN: { url } } }),
        ).toString("base64"),
      },
    ],
  });
  const fetcher = async (url) => {
    calls.push(String(url));
    if (calls.length === 1)
      return new Response(JSON.stringify({ id: "a".repeat(32) }));
    if (calls.length === 2)
      return new Response(
        JSON.stringify(
          session("http://textures.minecraft.net/texture/example"),
        ),
      );
    return new Response(bundled);
  };
  assert.deepEqual(await fetchSkin("test", { fetcher }), bundled);
  assert.equal(calls[2], "https://textures.minecraft.net/texture/example");
  await assert.rejects(
    fetchSkin("test", { fetcher: async () => new Response("{}") }),
    /username not found/,
  );
  const hostile = async (url) =>
    new Response(
      JSON.stringify(
        String(url).includes("sessionserver")
          ? session("https://example.com/private")
          : { id: "b".repeat(32) },
      ),
    );
  await assert.rejects(
    fetchSkin("test", { fetcher: hostile }),
    /Invalid Minecraft skin response/,
  );
});
