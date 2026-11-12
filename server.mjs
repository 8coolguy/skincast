import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaults, validateSettings, parseLevel } from "./lib/settings.mjs";
import { fetchSkin } from "./lib/skins.mjs";
import { startCursor } from "./lib/cursor.mjs";
import { createSandbox } from "./lib/sandbox.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

export async function startServer({
  port = Number(process.env.PORT || 3333),
  dataDir = path.join(root, ".runtime"),
  cursor = true,
  quiet = false,
  skinFetcher = fetchSkin,
} = {}) {
  await mkdir(dataDir, { recursive: true });
  const settingsPath = path.join(dataDir, "settings.json");
  let settings = { ...defaults };
  try {
    settings = validateSettings(
      JSON.parse(await readFile(settingsPath, "utf8")),
    );
  } catch (err) {
    if (err.code !== "ENOENT" && !quiet)
      console.warn(`Could not read saved settings: ${err.message}`);
  }
  let tracking = {
    connected: false,
    message: cursor ? "Starting desktop helper…" : "Desktop helper disabled",
  };
  let pointer = { x: 0, y: 0 };
  let level = 0;
  let micOwner = null;
  let micTimestamp = 0;
  let writeQueue = Promise.resolve();
  const sandbox = createSandbox();
  sandbox.setMode(settings.stageMode);
  let controlOwner = null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const broadcast = (message) => {
    const text = JSON.stringify(message);
    for (const client of wss.clients)
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < 100_000
      )
        client.send(text);
  };
  const voiceState = () => ({ type: "voice", level, connected: !!micOwner });
  const state = () => ({
    type: "state",
    settings,
    tracking,
    pointer,
    voice: { level, connected: !!micOwner },
    play: sandbox.snapshot(Date.now()),
  });
  const sendJson = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (
        !/^127\.0\.0\.1:\d+$/.test(req.headers.host || "") &&
        !/^localhost:\d+$/.test(req.headers.host || "")
      )
        return sendJson(res, 403, { error: "Use localhost to connect." });
      if (
        req.headers.origin &&
        ![
          `http://127.0.0.1:${server.address().port}`,
          `http://localhost:${server.address().port}`,
        ].includes(req.headers.origin)
      )
        return sendJson(res, 403, { error: "Origin is not allowed." });
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/state" && req.method === "GET")
        return sendJson(res, 200, state());
      if (url.pathname === "/api/settings" && req.method === "PUT") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return sendJson(res, 415, { error: "Send settings as JSON." });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 11_000_000)
            return sendJson(res, 413, { error: "Upload is too large." });
          chunks.push(chunk);
        }
        let patch;
        try {
          patch = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          return sendJson(res, 400, { error: "Invalid JSON." });
        }
        const operation = writeQueue.then(async () => {
          if (!patch || typeof patch !== "object" || Array.isArray(patch))
            throw new Error("Settings must be an object.");
          const next = validateSettings({ ...settings, ...patch });
          await writeFile(`${settingsPath}.tmp`, JSON.stringify(next, null, 2));
          await rename(`${settingsPath}.tmp`, settingsPath);
          const modeChanged = settings.stageMode !== next.stageMode;
          settings = next;
          if (modeChanged) {
            controlOwner = null;
            sandbox.setMode(settings.stageMode);
          }
          broadcast({ type: "settings", settings });
          sendJson(res, 200, { settings });
        });
        writeQueue = operation.catch(() => {});
        try {
          await operation;
        } catch (err) {
          sendJson(res, 400, { error: err.message });
        }
        return;
      }
      if (url.pathname.startsWith("/api/skin/") && req.method === "GET") {
        const name = decodeURIComponent(
          url.pathname.slice("/api/skin/".length),
        );
        try {
          const png = await skinFetcher(name, {
            cacheDir: path.join(dataDir, "skins"),
            refresh: url.searchParams.has("refresh"),
          });
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Cache-Control": "no-cache",
          });
          res.end(png);
        } catch (err) {
          sendJson(res, 422, { error: err.message });
        }
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return sendJson(res, 405, { error: "Method not allowed." });
      const pathname =
        url.pathname === "/"
          ? "/index.html"
          : url.pathname === "/overlay"
            ? "/overlay.html"
            : decodeURIComponent(url.pathname);
      const filename = path.resolve(root, "dist", `.${pathname}`);
      if (!filename.startsWith(path.join(root, "dist") + path.sep))
        return sendJson(res, 404, { error: "Not found." });
      const content = await readFile(filename).catch(() => null);
      if (!content) return sendJson(res, 404, { error: "Not found." });
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (err) {
      if (!res.headersSent)
        sendJson(res, 500, {
          error: "The local server could not complete this request.",
        });
      else res.end();
    }
  });
  server.on("upgrade", (req, socket, head) => {
    const address = server.address();
    const allowed = [
      `http://127.0.0.1:${address.port}`,
      `http://localhost:${address.port}`,
    ];
    if (
      req.url !== "/events" ||
      !allowed.includes(`http://${req.headers.host}`) ||
      (req.headers.origin && !allowed.includes(req.headers.origin))
    )
      return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify(state()));
    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "control-start") {
          if (settings.stageMode !== "sandbox")
            throw new Error("Switch to Sandbox to take control.");
          if (controlOwner && controlOwner !== ws)
            return ws.send(
              JSON.stringify({
                type: "control-busy",
                message: "Another studio tab is controlling the avatar.",
              }),
            );
          controlOwner = ws;
          sandbox.control(true);
          ws.send(JSON.stringify({ type: "control", owned: true }));
        } else if (message.type === "control-stop" && controlOwner === ws) {
          controlOwner = null;
          sandbox.control(false);
          ws.send(JSON.stringify({ type: "control", owned: false }));
        } else if (message.type === "game-input") {
          if (controlOwner !== ws)
            throw new Error("Take control before moving the avatar.");
          sandbox.input(message, Date.now());
        } else if (message.type === "game-command") {
          if (controlOwner && controlOwner !== ws)
            throw new Error("Another studio tab is controlling the avatar.");
          if (
            settings.stageMode === "sandbox" &&
            ["jump", "place", "remove", "reset"].includes(message.action) &&
            controlOwner !== ws
          )
            throw new Error("Take control before using sandbox tools.");
          if (typeof message.action !== "string")
            throw new Error("Choose an avatar action.");
          const now = Date.now();
          sandbox.command(message.action, message.blockType, now);
        } else if (message.type === "voice-start") {
          if (micOwner && micOwner !== ws)
            return ws.send(
              JSON.stringify({
                type: "mic-busy",
                message: "The microphone is active in another studio tab.",
              }),
            );
          micOwner = ws;
          micTimestamp = Date.now();
          level = 0;
          broadcast(voiceState());
        } else if (message.type === "voice" && micOwner === ws) {
          level = parseLevel(message.level);
          micTimestamp = Date.now();
          broadcast(voiceState());
        } else if (message.type === "voice-stop" && micOwner === ws) {
          micOwner = null;
          level = 0;
          broadcast(voiceState());
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: err.message || "Invalid live input.",
          }),
        );
      }
    });
    ws.on("close", () => {
      if (controlOwner === ws) {
        controlOwner = null;
        sandbox.control(false);
      }
      if (micOwner === ws) {
        micOwner = null;
        level = 0;
        broadcast(voiceState());
      }
    });
  });
  let previousTick = Date.now();
  const simulation = setInterval(() => {
    const now = Date.now();
    sandbox.tick(Math.min(0.05, (now - previousTick) / 1000), now);
    previousTick = now;
    broadcast({ type: "play", play: sandbox.snapshot(now) });
  }, 1000 / 30);
  const stale = setInterval(() => {
    if (micOwner && Date.now() - micTimestamp > 2500) {
      micOwner = null;
      level = 0;
      broadcast(voiceState());
    }
  }, 500);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const cursorPromise = cursor
    ? startCursor(
        root,
        (value) => {
          pointer = value;
          broadcast({ type: "pointer", ...pointer });
        },
        (value) => {
          if (
            value.connected !== tracking.connected ||
            value.message !== tracking.message
          ) {
            tracking = value;
            broadcast({ type: "tracking", tracking });
          }
        },
      )
    : Promise.resolve(() => {});
  const address = `http://127.0.0.1:${server.address().port}`;
  if (!quiet)
    console.log(
      `\n  SKINCAST\n  Studio   ${address}\n  OBS      ${address}/overlay\n\n  Keep the studio tab open while using the microphone.\n`,
    );
  return {
    url: address,
    close: async () => {
      clearInterval(stale);
      clearInterval(simulation);
      (await cursorPromise)();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await writeQueue;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
