import { build } from "esbuild";
import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/studio.js", "src/overlay.js"],
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: ["chrome100"],
  minify: true,
  sourcemap: true,
});
await Promise.all(
  ["index.html", "overlay.html", "style.css", "audio-meter.js"].map((name) =>
    copyFile(`public/${name}`, `dist/${name}`),
  ),
);
await cp("public/fonts", "dist/fonts", { recursive: true });
console.log("Built studio and OBS overlay.");
