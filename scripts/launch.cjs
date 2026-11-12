const { spawnSync, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const entry = path.join(__dirname, "start.mjs");
const candidates = [
  process.execPath,
  ...(process.env.PATH || "")
    .split(path.delimiter)
    .map((dir) =>
      path.join(dir, process.platform === "win32" ? "node.exe" : "node"),
    ),
];
if (process.platform === "darwin")
  candidates.push("/opt/homebrew/bin/node", "/usr/local/bin/node");
const node = [...new Set(candidates)].find((candidate) => {
  if (!fs.existsSync(candidate)) return false;
  const version = spawnSync(candidate, ["--version"], { encoding: "utf8" });
  return (
    version.status === 0 &&
    Number(version.stdout.trim().slice(1).split(".")[0]) >= 22
  );
});
if (!node) {
  console.error(
    "Skincast needs Node.js 22 or newer. Install the LTS version from https://nodejs.org, then run npm start again.",
  );
  process.exit(1);
}
const child = spawn(node, [entry], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
