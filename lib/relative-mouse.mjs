const clamp = (value) => Math.max(-1, Math.min(1, value));

// Mouse deltas drive a bounded head pose, which returns to center after input stops.
export function createRelativeMouse() {
  let x = 0,
    y = 0,
    previous = null,
    movedAt = 0;
  return {
    sample(dx, dy, available, now) {
      const dt =
        previous === null
          ? 0
          : Math.max(0, Math.min(0.25, (now - previous) / 1000));
      previous = now;
      if (!available) {
        x = y = 0;
      } else if (dx || dy) {
        x = clamp(x + dx / 300);
        y = clamp(y + dy / 300);
        movedAt = now;
      } else if (now - movedAt > 150) {
        const decay = Math.exp(-dt * 3);
        x *= decay;
        y *= decay;
        if (Math.abs(x) < 0.001) x = 0;
        if (Math.abs(y) < 0.001) y = 0;
      }
      return { gameX: x, gameY: y, relativeAvailable: available };
    },
  };
}

export function parseCursorSample(value) {
  if (
    !value ||
    ![value.x, value.y].every(
      (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1,
    )
  )
    throw new Error("Invalid cursor sample.");
  if (
    value.relativeAvailable !== undefined &&
    typeof value.relativeAvailable !== "boolean"
  )
    throw new Error("Invalid relative mouse status.");
  const relativeAvailable = value.relativeAvailable === true;
  const dx = value.dx ?? 0,
    dy = value.dy ?? 0;
  if (
    ![dx, dy].every(
      (v) =>
        typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1_000_000,
    )
  )
    throw new Error("Invalid mouse delta.");
  return { x: value.x, y: value.y, dx, dy, relativeAvailable };
}
