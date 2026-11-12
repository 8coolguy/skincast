import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MINECRAFT_TIMEOUT = 1500;
const numbers = {
  yaw: [-180, 180],
  bodyYaw: [-180, 180],
  pitch: [-90, 90],
  speed: [0, 4],
  rise: [0, 2],
  swing: [0, 1],
};
const flags = ["grounded", "crouching", "sprinting", "usingItem"];

export function parseMotion(message) {
  if (
    !message ||
    message.type !== "motion" ||
    message.version !== 1 ||
    typeof message.active !== "boolean"
  )
    throw new Error("Expected Skincast motion protocol version 1.");
  if (!message.active) return { active: false };
  const pose = { active: true };
  for (const [key, [min, max]] of Object.entries(numbers)) {
    const value = message[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new Error(`Invalid Minecraft ${key}.`);
    pose[key] = value;
  }
  for (const key of flags) {
    if (typeof message[key] !== "boolean")
      throw new Error(`Invalid Minecraft ${key}.`);
    pose[key] = message[key];
  }
  return pose;
}

export async function minecraftToken(dataDir) {
  const file = path.join(dataDir, "minecraft-token");
  try {
    await writeFile(file, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const token = (await readFile(file, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error(
      "Invalid .runtime/minecraft-token. Remove the file and restart Skincast.",
    );
  return token;
}

export function authorizedMinecraft(value, token) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/.test(value) &&
    value.length === token.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(token))
  );
}

export function createMinecraftBridge() {
  let owner = null;
  let timestamp = 0;
  let pose = { connected: false, active: false };
  return {
    snapshot: () => pose,
    claim(client) {
      if (owner) return false;
      owner = client;
      timestamp = Date.now();
      pose = { connected: true, active: false };
      return true;
    },
    receive(client, message, now = Date.now()) {
      if (client !== owner)
        throw new Error("Minecraft bridge is already in use.");
      const next = parseMotion(message);
      if (now - timestamp < 35 && pose.active && next.active) return false;
      timestamp = now;
      pose = { connected: true, ...next };
      return true;
    },
    disconnect(client) {
      if (client !== owner) return false;
      owner = null;
      pose = { connected: false, active: false };
      return true;
    },
    expire(now = Date.now()) {
      if (!owner || now - timestamp <= MINECRAFT_TIMEOUT) return null;
      const stale = owner;
      owner = null;
      pose = { connected: false, active: false };
      return stale;
    },
  };
}
