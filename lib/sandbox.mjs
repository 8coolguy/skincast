export const actionDurations = Object.freeze({
  wave: 1800,
  dance: 4000,
  spin: 1400,
  cheer: 2200,
});
export const blockTypes = Object.freeze(["grass", "stone", "wood"]);

export function createSandbox() {
  let player = { x: 0, z: 0, y: 0, heading: 0, moving: false };
  let velocity = 0;
  let blocks = [];
  let action = null;
  let keys = { x: 0, z: 0, sprint: false };
  let inputTime = 0;
  let controlled = false;
  let mode = "avatar";
  let revision = 0;
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
    player = { x: 0, z: 0, y: 0, heading: 0, moving: false };
    velocity = 0;
    blocks = [];
    action = null;
    keys = { x: 0, z: 0, sprint: false };
    revision++;
  };
  return {
    setMode(next) {
      if (mode !== next) {
        mode = next;
        keys = { x: 0, z: 0, sprint: false };
        controlled = false;
        player.moving = false;
      }
    },
    control(active) {
      controlled = active;
      if (!active) {
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
        typeof value.sprint !== "boolean"
      )
        throw new Error("Invalid movement input.");
      keys = { x: value.x, z: value.z, sprint: value.sprint };
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
      const x = Math.round(player.x + Math.sin(player.heading));
      const z = Math.round(player.z + Math.cos(player.heading));
      if (Math.abs(x) > 3 || Math.abs(z) > 3)
        throw new Error(
          "The edge of the island is ahead. Turn toward an empty tile.",
        );
      if (name === "remove") {
        blocks = blocks.filter((block) => block.x !== x || block.z !== z);
        revision++;
        return;
      }
      if (!blockTypes.includes(blockType))
        throw new Error("Choose grass, stone, or wood.");
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
      if (mode === "sandbox" && controlled && now - inputTime < 400) {
        const length = Math.hypot(keys.x, keys.z);
        if (length) {
          const speed = keys.sprint ? 3.8 : 2.2;
          const nextX = Math.max(
            -3.15,
            Math.min(3.15, player.x + (keys.x / length) * speed * dt),
          );
          const nextZ = Math.max(
            -3.15,
            Math.min(3.15, player.z + (keys.z / length) * speed * dt),
          );
          player.heading = Math.atan2(keys.x, keys.z);
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
      };
    },
  };
}
