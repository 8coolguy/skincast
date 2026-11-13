import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Linux event reader filters keys and wheel input and recovers from dropped events", () => {
  if (process.platform !== "linux") return;
  const result = spawnSync("python3", ["-c", `
import sys
sys.dont_write_bytecode = True
import importlib.util
spec = importlib.util.spec_from_file_location('mouse', 'native/cursor-linux.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
def event(kind, code, value):
    return m.EVENT.pack(0, 0, kind, code, value)
assert m.deltas(event(2, 0, 50) + event(2, 1, -12) + event(1, 30, 1) + event(2, 8, 99)) == (50, -12, False)
assert m.deltas(event(2, 0, 50) + event(0, 3, 0) + event(2, 0, 100)) == (0, 0, True)
assert m.deltas(event(2, 0, 100) + event(0, 0, 0) + event(2, 1, -5), True) == (0, -5, False)
`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
