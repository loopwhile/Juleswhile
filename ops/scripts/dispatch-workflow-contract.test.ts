import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Dispatch workflow declares the live execution boundary", async () => {
  const content = await readFile(
    ".github/workflows/02-dispatch-jules.yml",
    "utf8",
  );

  assert.match(
    content,
    /JULES_DISPATCH_WORKFLOW:\s*"02-dispatch-jules"/,
  );

  assert.match(
    content,
    /group:\s*>-\s*\n\s+dispatch-/,
  );
});

test("Workflow no longer writes canonical Session comments", async () => {
  const content = await readFile(
    ".github/workflows/02-dispatch-jules.yml",
    "utf8",
  );

  assert.doesNotMatch(
    content,
    /<!-- juleswhile:task-dispatch -->/,
  );

  assert.match(
    content,
    /Finalize Jules TASK running state/,
  );
});

test("Dispatcher enforces duplicate protection even with force", async () => {
  const content = await readFile(
    "ops/scripts/dispatch-jules.ts",
    "utf8",
  );

  assert.doesNotMatch(
    content,
    /existingSession !== null\s*&&\s*!options\.force/,
  );

  assert.doesNotMatch(
    content,
    /!options\.force\s*&&\s*existingSession === null\s*&&\s*hasBlockingDispatchIntent/,
  );

  assert.match(
    content,
    /assertLiveDispatchContext/,
  );
});
