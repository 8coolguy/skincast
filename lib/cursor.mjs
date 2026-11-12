import { spawn } from "node:child_process";
import { access, mkdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createRelativeMouse, parseCursorSample } from "./relative-mouse.mjs";

export async function startCursor(
  root,
  onPosition,
  onStatus,
  { dataDir = path.join(root, ".runtime") } = {},
) {
  let child;
  let stopped = false;
  let permissionRequest;
  let requestRelative = async () => {
    throw new Error("Game mouse is currently supported on macOS only.");
  };
  const relative = createRelativeMouse();
  onStatus({ connected: false, message: "Starting desktop tracking…" });
  try {
    if (process.platform === "darwin") {
      const source = path.join(root, "native/cursor.swift");
      const binary = path.join(dataDir, "cursor");
      await mkdir(path.dirname(binary), { recursive: true });
      const old = await stat(binary).catch(() => null);
      if (!old || old.mtimeMs < (await stat(source)).mtimeMs) {
        onStatus({
          connected: false,
          message: "Compiling cursor helper. First launch can take a minute…",
        });
        await new Promise((resolve, reject) => {
          const compiler = spawn("xcrun", [
            "swiftc",
            "-O",
            source,
            "-o",
            binary,
          ]);
          let error = "";
          compiler.stderr.on("data", (data) => {
            error += data.toString();
          });
          compiler.on("error", reject);
          compiler.on("exit", (code) =>
            code === 0
              ? resolve()
              : reject(
                  new Error(
                    error.slice(0, 600) ||
                      "Install Xcode Command Line Tools with xcode-select --install.",
                  ),
                ),
          );
        });
      }
      await access(binary);
      requestRelative = async () => {
        if (stopped) throw new Error("Restart Skincast to enable Game mouse.");
        if (permissionRequest) return permissionRequest;
        permissionRequest = new Promise((resolve, reject) => {
          const prompt = spawn(binary, ["--request-relative-permission"], {
            stdio: "ignore",
          });
          prompt.once("error", reject);
          prompt.once("exit", (code) =>
            code === 0
              ? resolve()
              : reject(
                  new Error("Could not request Input Monitoring permission."),
                ),
          );
        }).finally(() => {
          permissionRequest = null;
        });
        return permissionRequest;
      };
      child = spawn(binary, [], { stdio: ["ignore", "pipe", "pipe"] });
    } else if (process.platform === "win32") {
      child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(root, "native/cursor.ps1"),
        ],
        { windowsHide: true },
      );
    } else if (process.platform === "linux" && !process.env.WAYLAND_DISPLAY) {
      child = spawn("python3", [path.join(root, "native/cursor-x11.py")]);
    } else {
      throw new Error(
        "Global tracking is unavailable on this desktop. Use Preview tracking, or an X11 session on Linux.",
      );
    }
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const value = JSON.parse(line);
        const parsed = parseCursorSample(value);
        onPosition({
          x: parsed.x,
          y: parsed.y,
          ...relative.sample(
            parsed.dx,
            parsed.dy,
            parsed.relativeAvailable,
            performance.now(),
          ),
        });
        onStatus({
          connected: true,
          message: String(value.display || "Desktop"),
          relativeAvailable: parsed.relativeAvailable,
          relativeSupported: process.platform === "darwin",
          relativeMessage:
            process.platform === "darwin"
              ? String(value.relativeMessage || "Game mouse is unavailable.")
              : "Game mouse is currently supported on macOS only.",
        });
      } catch {
        /* Ignore non-protocol helper output. */
      }
    });
    let error = "";
    child.stderr.on("data", (data) => {
      error = (error + data).slice(-600);
    });
    child.on("error", (err) =>
      onStatus({ connected: false, message: err.message }),
    );
    child.on("exit", () => {
      if (!stopped)
        onStatus({
          connected: false,
          message:
            error || "Cursor helper stopped. Restart the app to reconnect.",
        });
    });
  } catch (err) {
    onStatus({ connected: false, message: err.message });
  }
  return {
    requestRelative,
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}
