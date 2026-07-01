import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Dispatch workflow declares the live execution boundary", async () => {
	const content = await readFile(
		".github/workflows/02-dispatch-jules.yml",
		"utf8",
	);

	assert.match(content, /JULES_DISPATCH_WORKFLOW:\s*"02-dispatch-jules"/);

	assert.match(content, /group:\s*>-\s*\n\s+dispatch-/);
});

test("Workflow no longer writes canonical Session comments", async () => {
	const content = await readFile(
		".github/workflows/02-dispatch-jules.yml",
		"utf8",
	);

	assert.doesNotMatch(content, /<!-- juleswhile:task-dispatch -->/);

	assert.match(content, /Finalize Jules TASK running state/);
});

test("Dispatcher enforces duplicate protection even with force", async () => {
	const [entrypoint, applicationService] = await Promise.all([
		readFile("ops/scripts/dispatch-jules.ts", "utf8"),
		readFile("ops/application/dispatch-jules-service.ts", "utf8"),
	]);

	assert.match(entrypoint, /runDispatchJules/);

	assert.doesNotMatch(
		applicationService,
		/existingSession !== null\s*&&\s*!options\.force/,
	);

	assert.doesNotMatch(
		applicationService,
		/!options\.force\s*&&\s*existingSession === null\s*&&\s*hasBlockingDispatchIntent/,
	);

	assert.match(applicationService, /assertLiveDispatchContext/);

	assert.match(applicationService, /hasBlockingDispatchIntent/);
});
