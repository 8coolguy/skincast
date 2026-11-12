import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { startServer } from "../server.mjs";
import { validateSettings } from "../lib/settings.mjs";
import { fetchSkin } from "../lib/skins.mjs";

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
  for (const patch of [
    { zoom: NaN },
    { threshold: -1 },
    { tracking: "yes" },
    { model: "unknown" },
    { background: "image" },
    { skinSource: "https://example.com/skin.png" },
    { username: "other" },
    { unknown: true },
  ])
    assert.throws(() => validateSettings(patch));
  assert.equal(
    validateSettings({ skinSource: "/api/skin/8coolguy?v=1794450000000" })
      .username,
    "8coolguy",
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
