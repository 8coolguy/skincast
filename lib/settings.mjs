export const defaults = Object.freeze({
  username: "8coolguy",
  skinSource: "/api/skin/8coolguy",
  model: "auto",
  tracking: true,
  sensitivity: 0.7,
  smoothing: 0.78,
  idle: true,
  zoom: 0.9,
  framing: "full",
  threshold: 0.055,
  voiceColor: "#a6efb4",
  voiceIndicator: true,
  voiceStyle: "bars",
  voicePlacement: "right",
  voiceSize: 1,
  voiceCount: 3,
  voiceOpacity: 1,
  voiceOffsetX: 0,
  voiceOffsetY: 0,
  voiceRelease: 0.12,
  voiceBounce: 1,
  stageMode: "avatar",
  background: "transparent",
  backgroundColor: "#b8addc",
  backgroundImage: "",
});

const enums = {
  model: ["auto", "default", "slim"],
  framing: ["full", "portrait"],
  background: ["transparent", "color", "image"],
  voiceStyle: ["bars", "dots", "ring"],
  voicePlacement: ["right", "left", "above", "chest"],
  stageMode: ["avatar", "sandbox"],
};
const ranges = {
  sensitivity: [0, 1.5],
  smoothing: [0, 0.95],
  zoom: [0.5, 1.4],
  threshold: [0.005, 0.4],
  voiceSize: [0.4, 2.5],
  voiceCount: [3, 9],
  voiceOpacity: [0.2, 1],
  voiceOffsetX: [-6, 6],
  voiceOffsetY: [-6, 6],
  voiceRelease: [0.05, 1],
  voiceBounce: [0, 2],
};
const booleans = ["tracking", "idle", "voiceIndicator"];
const color = /^#[a-f\d]{6}$/i;
const image = /^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i;

export function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Settings must be an object.");
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(defaults, key))
      throw new Error(`Unknown setting: ${key}`);
  }
  const value = { ...defaults, ...input };
  if (
    typeof value.username !== "string" ||
    !/^[a-z\d_]{1,16}$/i.test(value.username)
  )
    throw new Error(
      "Use a Minecraft username with 1–16 letters, numbers, or underscores.",
    );
  const skinPath = `/api/skin/${value.username}`;
  const profileSource =
    typeof value.skinSource === "string" &&
    (value.skinSource === skinPath ||
      (value.skinSource.startsWith(`${skinPath}?v=`) &&
        /^\d{13}$/.test(value.skinSource.slice(skinPath.length + 3))));
  if (
    typeof value.skinSource !== "string" ||
    !(
      profileSource ||
      (image.test(value.skinSource) &&
        value.skinSource.startsWith("data:image/png;"))
    )
  )
    throw new Error("Choose a Minecraft username or upload a PNG skin.");
  if (value.skinSource.length > 2_000_000)
    throw new Error("Skin must be smaller than 1.5 MB.");
  for (const [key, allowed] of Object.entries(enums))
    if (!allowed.includes(value[key])) throw new Error(`Invalid ${key}.`);
  for (const [key, [min, max]] of Object.entries(ranges))
    if (
      typeof value[key] !== "number" ||
      !Number.isFinite(value[key]) ||
      value[key] < min ||
      value[key] > max
    )
      throw new Error(`Invalid ${key}.`);
  for (const key of booleans)
    if (typeof value[key] !== "boolean") throw new Error(`Invalid ${key}.`);
  if (!Number.isInteger(value.voiceCount))
    throw new Error("Bar count must be a whole number.");
  for (const key of ["voiceColor", "backgroundColor"])
    if (typeof value[key] !== "string" || !color.test(value[key]))
      throw new Error(`Invalid ${key}.`);
  if (
    typeof value.backgroundImage !== "string" ||
    (value.backgroundImage && !image.test(value.backgroundImage)) ||
    value.backgroundImage.length > 8_000_000
  )
    throw new Error(
      "Background must be a PNG, JPG, or WebP smaller than 6 MB.",
    );
  if (value.background === "image" && !value.backgroundImage)
    throw new Error("Upload a background image first.");
  return value;
}

export function parseLevel(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw new Error("Invalid microphone level.");
  return value;
}
