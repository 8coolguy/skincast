import { aimTarget } from "./aim.mjs";

export const actionDurations = Object.freeze({
  wave: 1800,
  dance: 4000,
  spin: 1400,
  cheer: 2200,
});
export const blockTypes = Object.freeze(["grass", "stone", "wood"]);

export function createSandbox(initialWorld) {
  const spawnPlayer = () => ({
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    pitch: -0.55,
    moving: false,
  });
  let player = spawnPlayer();
  let velocity = 0;
  let blocks = [];
  let action = null;
  let keys = { x: 0, z: 0, sprint: false };
  let inputTime = 0;
  let controlled = false;
  let inputActive = false;
  let mode = "avatar";
  let revision = 0;
  let epoch = 0;
  if (initialWorld !== undefined) {
    const validPlayer =
      initialWorld &&
      ["x", "z", "y", "heading", "pitch"].every((key) =>
        Number.isFinite(initialWorld[key]),
      ) &&
      Math.abs(initialWorld.x) <= 3.15 &&
      Math.abs(initialWorld.z) <= 3.15 &&
      initialWorld.y >= 0 &&
      initialWorld.y <= 3 &&
      Math.abs(initialWorld.pitch) <= 1.3;
    const validBlocks =
      Array.isArray(initialWorld?.blocks) &&
      initialWorld.blocks.length <= 49 &&
      initialWorld.blocks.every(
        (block) =>
          block &&
          Number.isInteger(block.x) &&
          Number.isInteger(block.z) &&
          Math.abs(block.x) <= 3 &&
          Math.abs(block.z) <= 3 &&
          blockTypes.includes(block.type),
      );
    const uniqueBlocks =
      validBlocks &&
      new Set(initialWorld.blocks.map((block) => `${block.x}:${block.z}`))
        .size === initialWorld.blocks.length;
    if (
      !validPlayer ||
      !uniqueBlocks ||
      ![initialWorld.revision ?? 0, initialWorld.epoch ?? 0].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      throw new Error("Invalid sandbox snapshot.");
    player = {
      x: initialWorld.x,
      z: initialWorld.z,
      y: initialWorld.y,
      heading: initialWorld.heading,
      pitch: initialWorld.pitch,
      moving: false,
    };
    blocks = initialWorld.blocks.map(({ x, z, type }) => ({ x, z, type }));
    revision = initialWorld.revision ?? 0;
    epoch = initialWorld.epoch ?? 0;
  }
  const groundAt = (x, z) =>
    blocks.some(
      (block) => Math.abs(x - block.x) < 0.5 && Math.abs(z - block.z) < 0.5,
    )
      ? 1
      : 0;
  const blocked = (x, z) =>
    blocks.some(
      (block) =>
        Math.abs(x - block.x) < 0.76 &&
        Math.abs(z - block.z) < 0.76 &&
        player.y < 0.98,
    );
  const reset = () => {
    player = spawnPlayer();
    velocity = 0;
    blocks = [];
    action = null;
    keys = { x: 0, z: 0, sprint: false };
    revision++;
    epoch++;
  };
  return {
    setMode(next) {
      if (mode !== next) {
        mode = next;
        keys = { x: 0, z: 0, sprint: false };
        controlled = false;
        inputActive = false;
        player.moving = false;
      }
    },
    control(owned) {
      controlled = owned;
      if (!owned) {
        inputActive = false;
        keys = { x: 0, z: 0, sprint: false };
        player.moving = false;
      }
    },
    input(value, now) {
      if (
        !value ||
        ![value.x, value.z].every(
          (n) => Number.isInteger(n) && n >= -1 && n <= 1,
        ) ||
        typeof value.sprint !== "boolean" ||
        typeof value.active !== "boolean" ||
        typeof value.yaw !== "number" ||
        !Number.isFinite(value.yaw) ||
        Math.abs(value.yaw) > Math.PI ||
        typeof value.pitch !== "number" ||
        !Number.isFinite(value.pitch) ||
        Math.abs(value.pitch) > 1.3
      )
        throw new Error("Invalid movement input.");
      inputActive = value.active;
      keys = inputActive
        ? { x: value.x, z: value.z, sprint: value.sprint }
        : { x: 0, z: 0, sprint: false };
      if (inputActive) {
        player.heading = value.yaw + Math.PI;
        player.pitch = value.pitch;
      }
      inputTime = now;
    },
    command(name, blockType, now) {
      if (Object.hasOwn(actionDurations, name)) {
        action = { name, started: now };
        return;
      }
      if (name === "stop") {
        action = null;
        return;
      }
      if (name === "jump") {
        const floor = mode === "sandbox" ? groundAt(player.x, player.z) : 0;
        if (player.y <= floor + 0.001) velocity = 6.2;
        return;
      }
      if (mode !== "sandbox")
        throw new Error("Switch to the sandbox to build.");
      if (name === "reset") {
        reset();
        return;
      }
      if (!["place", "remove"].includes(name))
        throw new Error("Unknown avatar action.");
      const target = aimTarget(player, blocks);
      if (!target)
        throw new Error("Aim at a block or the island within reach.");
      if (name === "remove") {
        if (target.kind !== "block")
          throw new Error(
            "The island floor cannot be removed. Aim at a placed block.",
          );
        blocks = blocks.filter(
          (block) => block.x !== target.x || block.z !== target.z,
        );
        revision++;
        return;
      }
      if (!blockTypes.includes(blockType))
        throw new Error("Choose grass, stone, or wood.");
      if (!target.place)
        throw new Error(
          "Build on the ground or beside a block. This island has one building layer.",
        );
      const { x, z } = target.place;
      if (Math.abs(player.x - x) < 0.76 && Math.abs(player.z - z) < 0.76)
        throw new Error("Move away from that tile before placing a block.");
      if (blocks.some((block) => block.x === x && block.z === z))
        throw new Error("There is already a block ahead. Remove it first.");
      blocks = [...blocks, { x, z, type: blockType }];
      revision++;
    },
    tick(dt, now) {
      if (action && now - action.started >= actionDurations[action.name])
        action = null;
      player.moving = false;
      if (
        mode === "sandbox" &&
        controlled &&
        inputActive &&
        now - inputTime < 400
      ) {
        const length = Math.hypot(keys.x, keys.z);
        if (length) {
          const speed = keys.sprint ? 3.8 : 2.2;
          const yaw = player.heading - Math.PI;
          const dx = keys.x * Math.cos(yaw) + keys.z * Math.sin(yaw);
          const dz = -keys.x * Math.sin(yaw) + keys.z * Math.cos(yaw);
          const nextX = Math.max(
            -3.15,
            Math.min(3.15, player.x + (dx / length) * speed * dt),
          );
          const nextZ = Math.max(
            -3.15,
            Math.min(3.15, player.z + (dz / length) * speed * dt),
          );
          const oldX = player.x,
            oldZ = player.z;
          if (!blocked(nextX, player.z)) player.x = nextX;
          if (!blocked(player.x, nextZ)) player.z = nextZ;
          player.moving = Math.hypot(player.x - oldX, player.z - oldZ) > 0.0001;
        }
      }
      const floor = mode === "sandbox" ? groundAt(player.x, player.z) : 0;
      if (velocity || player.y > floor) {
        velocity -= 15 * dt;
        player.y += velocity * dt;
      }
      if (player.y <= floor) {
        player.y = floor;
        velocity = 0;
      }
    },
    snapshot(now) {
      return {
        ...player,
        controlled,
        active: controlled && inputActive && now - inputTime < 400,
        action: action
          ? {
              name: action.name,
              progress: Math.max(
                0,
                Math.min(
                  1,
                  (now - action.started) / actionDurations[action.name],
                ),
              ),
            }
          : null,
        blocks,
        revision,
        epoch,
        target: mode === "sandbox" ? aimTarget(player, blocks) : null,
      };
    },
  };
}
