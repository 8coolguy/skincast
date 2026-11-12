import test from "node:test";
import assert from "node:assert/strict";
import { aimTarget } from "../lib/aim.mjs";
import { createSandbox } from "../lib/sandbox.mjs";

test("crosshair rays select the nearest block face and respect reach", () => {
  const player = { x: 0, z: 0, y: 0, heading: 0, pitch: -0.4 };
  const hit = aimTarget(player, [{ x: 0, z: 2, type: "wood" }]);
  assert.equal(hit.kind, "block");
  assert.deepEqual(hit.place, { x: 0, z: 1 });
  assert.deepEqual([hit.x, hit.z], [0, 2]);
  assert.equal(aimTarget({ ...player, pitch: 0 }, []), null);
});

test("looking up, outside the island, or beyond reach cannot build", () => {
  const player = { x: 0, z: 0, y: 0, heading: 0, pitch: 0 };
  assert.equal(aimTarget(player, []), null);
  assert.equal(aimTarget({ ...player, pitch: 0.6 }, []), null);
  assert.equal(aimTarget({ ...player, pitch: -0.1 }, []), null);
  const floor = aimTarget({ ...player, pitch: -1 }, []);
  assert.deepEqual(floor.place, { x: 0, z: 1 });
  const top = aimTarget({ ...player, pitch: -0.55 }, [
    { x: 0, z: 1, type: "stone" },
  ]);
  assert.equal(top.kind, "block");
  assert.equal(
    top.place,
    null,
    "The one-layer island must not offer stacking on a block top",
  );
});

test("walking and strafing follow camera direction without changing the direction of gaze", () => {
  const game = createSandbox();
  game.setMode("sandbox");
  game.control(true);
  game.input(
    { x: 0, z: -1, sprint: false, yaw: Math.PI / 2, pitch: -0.3 },
    1000,
  );
  game.tick(0.1, 1010);
  let state = game.snapshot(1010);
  assert.ok(Math.abs(state.x - -0.22) < 1e-8);
  assert.ok(Math.abs(state.z) < 1e-8);
  game.input(
    { x: 1, z: 0, sprint: false, yaw: Math.PI / 2, pitch: -0.3 },
    1020,
  );
  game.tick(0.1, 1030);
  state = game.snapshot(1030);
  assert.ok(Math.abs(state.z - -0.22) < 1e-8);
  assert.equal(state.heading, Math.PI * 1.5);
  assert.equal(state.pitch, -0.3);
  for (const patch of [
    { yaw: NaN },
    { yaw: 100 },
    { pitch: 9 },
    { yaw: undefined },
  ])
    assert.throws(
      () =>
        game.input(
          { x: 0, z: 0, sprint: false, yaw: 0, pitch: 0, ...patch },
          1040,
        ),
      /Invalid movement/,
    );
});
