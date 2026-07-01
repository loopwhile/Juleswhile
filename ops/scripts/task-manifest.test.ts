import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTaskManifest } from "./task-manifest.js";

async function withTempDir(
	run: (directory: string) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "juleswhile-task-manifest-"),
	);

	try {
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test("loadTaskManifest merges inline tasks and included tasks", async () => {
	await withTempDir(async (directory) => {
		const rootPath = path.join(directory, "task-index.yaml");
		const includePath = path.join(directory, "included.yaml");

		await writeFile(
			rootPath,
			[
				"schema_version: 1",
				"project_id: test-project",
				"includes:",
				"  - included.yaml",
				"tasks:",
				"  - kind: task",
				"    id: TASK-001",
				].join("\n"),
			"utf8",
		);
		await writeFile(
			includePath,
			["tasks:", "  - kind: template", "    id: TASK-900"].join("\n"),
			"utf8",
		);

		const manifest = await loadTaskManifest(rootPath);

		assert.deepEqual(
			manifest.tasks.map((task) => task.id),
			["TASK-001", "TASK-900"],
		);
	});
});

test("loadTaskManifest supports inline-only manifests", async () => {
	await withTempDir(async (directory) => {
		const rootPath = path.join(directory, "task-index.yaml");

		await writeFile(
			rootPath,
			[
				"schema_version: 1",
				"project_id: test-project",
				"tasks:",
				"  - kind: task",
				"    id: TASK-001",
			].join("\n"),
			"utf8",
		);

		const manifest = await loadTaskManifest(rootPath);

		assert.equal(manifest.tasks.length, 1);
		assert.equal(manifest.tasks[0]?.id, "TASK-001");
	});
});

test("loadTaskManifest rejects unsafe include paths", async () => {
	await withTempDir(async (directory) => {
		const rootPath = path.join(directory, "task-index.yaml");

		await writeFile(
			rootPath,
			[
				"schema_version: 1",
				"project_id: test-project",
				"includes:",
				"  - ../outside.yaml",
				"tasks: []",
			].join("\n"),
			"utf8",
		);

		await assert.rejects(
			() => loadTaskManifest(rootPath),
			/안전하지 않은 TASK include 경로/,
		);
	});
});

test("control-plane self-improvement template is disabled and human gated", async () => {
	const manifest = await loadTaskManifest("ops/tasks/task-index.yaml");
	const template = manifest.tasks.find((task) => task.id === "TASK-904");

	assert.equal(template?.kind, "template");
	assert.equal(template?.enabled, false);
	assert.equal(template?.status, "TEMPLATE");
	assert.equal(template?.risk_level, "high");
	assert.equal(template?.approval_policy, "human-before-execution");
	assert.match(
		template?.forbidden_actions?.join("\n") ?? "",
		/Enable AUTOMATION_ENABLED/,
	);
});
