export const eyeHeight = 1.45;
export const buildReach = 4.5;

export function aimTarget(player, blocks) {
  const origin = [player.x, player.y + eyeHeight, player.z];
  const direction = [
    Math.sin(player.heading) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    Math.cos(player.heading) * Math.cos(player.pitch),
  ];
  let nearest = null;
  if (direction[1] < -0.00001) {
    const distance = -origin[1] / direction[1];
    const x = Math.floor(origin[0] + direction[0] * distance + 0.5);
    const z = Math.floor(origin[2] + direction[2] * distance + 0.5);
    if (distance <= buildReach && Math.abs(x) <= 3 && Math.abs(z) <= 3)
      nearest = {
        x,
        z,
        kind: "ground",
        type: "grass",
        place: { x, z },
        distance,
      };
  }
  for (const block of blocks) {
    const min = [block.x - 0.5, 0, block.z - 0.5];
    const max = [block.x + 0.5, 1, block.z + 0.5];
    let near = 0,
      far = buildReach;
    let face = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(direction[axis]) < 0.00001) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) {
          far = -1;
          break;
        }
      } else {
        const a = (min[axis] - origin[axis]) / direction[axis];
        const b = (max[axis] - origin[axis]) / direction[axis];
        if (Math.min(a, b) > near) {
          near = Math.min(a, b);
          face = [0, 0, 0];
          face[axis] = direction[axis] > 0 ? -1 : 1;
        }
        far = Math.min(far, Math.max(a, b));
      }
    }
    if (near > far || far < 0 || (nearest && nearest.distance < near)) continue;
    const x = block.x + face[0],
      z = block.z + face[2];
    const place =
      face[1] === 0 && Math.abs(x) <= 3 && Math.abs(z) <= 3 ? { x, z } : null;
    nearest = {
      x: block.x,
      z: block.z,
      kind: "block",
      type: block.type,
      place,
      distance: near,
    };
  }
  return nearest;
}
