import { spawn } from "node:child_process";
import { access, mkdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

export async function startCursor(root, onPosition, onStatus) {
  let child;
  let stopped = false;
  onStatus({ connected: false, message: "Starting desktop tracking…" });
  try {
    if (process.platform === "darwin") {
      const source = path.join(root, "native/cursor.swift");
      const binary = path.join(root, ".runtime/cursor");
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
        if (
          ![value.x, value.y].every(
            (v) =>
              typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1,
          )
        )
          return;
        onPosition({ x: value.x, y: value.y });
        onStatus({
          connected: true,
          message: String(value.display || "Desktop"),
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
  return () => {
    stopped = true;
    child?.kill();
  };
}
