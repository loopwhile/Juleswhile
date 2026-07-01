import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTaskManifestWithSources } from "./task-manifest.js";
import {
	renderTaskRuntimePatches,
	writeFilesAtomically,
} from "./runtime-projection-repository.js";

test("Runtime patch updates the owning include file only", async (context) => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "juleswhile-projection-"),
	);

	context.after(async () => {
		await fs.rm(directory, {
			recursive: true,
			force: true,
		});
	});

	const rootPath = path.join(directory, "task-index.yaml");

	const historyPath = path.join(directory, "task-history.yaml");

	const rootContent = `schema_version: 1
project_id: test-project
generated_at: 2026-07-01T00:00:00Z
updated_at: 2026-07-01T00:00:00Z
includes:
  - task-history.yaml
tasks: []
`;

	const historyContent = `tasks:
  - kind: task
    id: TASK-010
    title: Preserve contract
    status: RUNNING
    enabled: true
    objective: This value must remain unchanged.
    metadata:
      issue_number: 66
      updated_at: 2026-07-01T09:00:00Z
      created_by: user
`;

	await fs.writeFile(rootPath, rootContent, "utf8");

	await fs.writeFile(historyPath, historyContent, "utf8");

	const loaded = await loadTaskManifestWithSources(rootPath);

	assert.equal(loaded.sourceByTaskId.get("TASK-010"), historyPath);

	const mutations = await renderTaskRuntimePatches(loaded, [
		{
			taskId: "TASK-010",
			status: "COMPLETED",
			enabled: false,
			updatedAt: "2026-07-01T10:30:43.000Z",
			issueNumber: 66,
		},
	]);

	assert.equal(mutations.length, 1);

	assert.equal(mutations[0].filePath, historyPath);

	assert.match(mutations[0].content, /status: COMPLETED/);

	assert.match(mutations[0].content, /enabled: false/);

	assert.match(mutations[0].content, /updated_at: 2026-07-01T10:30:43.000Z/);

	assert.match(
		mutations[0].content,
		/objective: This value must remain unchanged\./,
	);

	await writeFilesAtomically(mutations);

	assert.equal(await fs.readFile(rootPath, "utf8"), rootContent);

	const second = await renderTaskRuntimePatches(loaded, [
		{
			taskId: "TASK-010",
			status: "COMPLETED",
			enabled: false,
			updatedAt: "2026-07-01T10:30:43.000Z",
			issueNumber: 66,
		},
	]);

	assert.deepEqual(second, []);
});

test("transaction writer commits multiple files", async (context) => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "juleswhile-transaction-"),
	);

	context.after(async () => {
		await fs.rm(directory, {
			recursive: true,
			force: true,
		});
	});

	const first = path.join(directory, "first.txt");

	const second = path.join(directory, "second.txt");

	await fs.writeFile(first, "before-first\n", "utf8");

	await fs.writeFile(second, "before-second\n", "utf8");

	await writeFilesAtomically([
		{
			filePath: first,
			content: "after-first\n",
		},
		{
			filePath: second,
			content: "after-second\n",
		},
	]);

	assert.equal(await fs.readFile(first, "utf8"), "after-first\n");

	assert.equal(await fs.readFile(second, "utf8"), "after-second\n");
});
