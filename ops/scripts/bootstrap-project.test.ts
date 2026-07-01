import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const repositoryRoot = process.cwd();
const bootstrapScript = path.join(
	repositoryRoot,
	"ops/scripts/bootstrap-project.mjs",
);

function textOutput(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value instanceof Uint8Array) {
		return Buffer.from(value).toString("utf8");
	}

	if (value === null || value === undefined) {
		return "";
	}

	return String(value);
}

function copyFile(relativePath: string, root: string): void {
	const destination = path.join(root, relativePath);

	mkdirSync(path.dirname(destination), {
		recursive: true,
	});

	cpSync(
		path.join(repositoryRoot, relativePath),
		destination,
		{
			recursive: true,
		},
	);
}

function fixture(): string {
	const root = mkdtempSync(
		path.join(os.tmpdir(), "juleswhile-bootstrap-"),
	);

	for (const relativePath of [
		"AGENTS.md",
		"PROJECT_GOAL.md",
		"QUICKSTART.md",
		"ops/tasks",
		"ops/state/project-state.json",
		"package.json",
		"package-lock.json",
	]) {
		copyFile(relativePath, root);
	}

	mkdirSync(path.join(root, "docs/01_overview"), {
		recursive: true,
	});
	writeFileSync(
		path.join(root, "docs/01_overview/smoke-result.md"),
		"legacy smoke result\n",
		"utf8",
	);

	mkdirSync(path.join(root, "dist"), {
		recursive: true,
	});
	writeFileSync(
		path.join(root, "dist/index.html"),
		"legacy build\n",
		"utf8",
	);

	return root;
}

function runBootstrap(
	root: string,
	mode: "--dry-run" | "--apply",
): ReturnType<typeof spawnSync> {
	return spawnSync(
		process.execPath,
		[bootstrapScript, mode],
		{
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				PROJECT_ID: "clean-room-project",
				PROJECT_NAME: "Clean Room Project",
				REPOSITORY: "example/clean-room-project",
				BOOTSTRAP_TIMESTAMP:
					"2026-07-02T00:00:00.000Z",
			},
		},
	);
}

function filesRecursively(root: string): string[] {
	const entries: string[] = [];

	function visit(current: string): void {
		for (const entry of readdirSync(current, {
			withFileTypes: true,
		})) {
			const absolute = path.join(current, entry.name);
			const relative = path.relative(root, absolute);

			if (entry.isDirectory()) {
				visit(absolute);
			} else {
				entries.push(relative);
			}
		}
	}

	visit(root);

	return entries.sort();
}

function treeDigest(root: string): string {
	const hash = createHash("sha256");

	for (const relative of filesRecursively(root)) {
		hash.update(relative);
		hash.update(
			readFileSync(path.join(root, relative)),
		);
	}

	return hash.digest("hex");
}

test("Bootstrap preview, apply and repeated apply are safe", () => {
	const root = fixture();

	try {
		const beforeDryRun = treeDigest(root);
		const dryRun = runBootstrap(root, "--dry-run");

		assert.equal(dryRun.status, 0, textOutput(dryRun.stderr));
		assert.equal(treeDigest(root), beforeDryRun);

		const dryRunResult = JSON.parse(textOutput(dryRun.stdout));

		assert.equal(dryRunResult.mode, "dry-run");
		assert.equal(dryRunResult.changed, true);
		assert.equal(dryRunResult.runtime.tasks, 0);
		assert.equal(dryRunResult.runtime.quotaUsage, 0);

		const firstApply = runBootstrap(root, "--apply");

		assert.equal(firstApply.status, 0, textOutput(firstApply.stderr));

		const firstResult = JSON.parse(textOutput(firstApply.stdout));

		assert.equal(firstResult.changed, true);

		const taskIndex = parse(
			readFileSync(
				path.join(root, "ops/tasks/task-index.yaml"),
				"utf8",
			),
		);
		const taskHistory = parse(
			readFileSync(
				path.join(root, "ops/tasks/task-history.yaml"),
				"utf8",
			),
		);
		const state = JSON.parse(
			readFileSync(
				path.join(root, "ops/state/project-state.json"),
				"utf8",
			),
		);
		const packageJson = JSON.parse(
			readFileSync(
				path.join(root, "package.json"),
				"utf8",
			),
		);
		const packageLock = JSON.parse(
			readFileSync(
				path.join(root, "package-lock.json"),
				"utf8",
			),
		);

		assert.deepEqual(taskIndex.includes, [
			"task-templates.yaml",
			"task-history.yaml",
		]);
		assert.deepEqual(taskIndex.tasks, []);
		assert.deepEqual(taskHistory.tasks, []);
		assert.equal(
			existsSync(path.join(root, "ops/tasks/history")),
			false,
		);
		assert.equal(
			readdirSync(path.join(root, "docs")).length,
			0,
		);
		assert.equal(
			existsSync(path.join(root, "dist")),
			false,
		);

		assert.equal(state.projectId, "clean-room-project");
		assert.equal(state.repository.fullName, "example/clean-room-project");
		assert.equal(state.repository.julesSourceName, null);
		assert.equal(state.projectGoal, null);
		assert.equal(state.taskSummary.total, 0);
		assert.equal(state.taskSummary.completed, 0);
		assert.deepEqual(state.runtime.activeSessions, []);
		assert.deepEqual(state.runtime.activePullRequests, []);
		assert.deepEqual(state.runtime.resourceLocks, []);
		assert.equal(state.quotas.used.total, 0);
		assert.equal(state.projection.status, "stale");
		assert.equal(state.projection.drift.supersededIssues, 0);

		assert.equal(packageJson.name, "clean-room-project");
		assert.equal(packageLock.name, "clean-room-project");
		assert.equal(
			packageLock.packages[""].name,
			"clean-room-project",
		);

		const firstDigest = treeDigest(root);
		const secondApply = runBootstrap(root, "--apply");

		assert.equal(secondApply.status, 0, textOutput(secondApply.stderr));

		const secondResult = JSON.parse(textOutput(secondApply.stdout));

		assert.equal(secondResult.changed, false);
		assert.equal(treeDigest(root), firstDigest);
	} finally {
		rmSync(root, {
			recursive: true,
			force: true,
		});
	}
});

test("Bootstrap recovers partially reintroduced Runtime residue", () => {
	const root = fixture();

	try {
		const firstApply = runBootstrap(root, "--apply");

		assert.equal(firstApply.status, 0, textOutput(firstApply.stderr));

		mkdirSync(path.join(root, "ops/tasks/history"), {
			recursive: true,
		});
		writeFileSync(
			path.join(root, "ops/tasks/history/task-001.yaml"),
			"tasks: []\n",
			"utf8",
		);
		writeFileSync(
			path.join(root, "docs/stale.md"),
			"stale\n",
			"utf8",
		);

		const statePath = path.join(
			root,
			"ops/state/project-state.json",
		);
		const state = JSON.parse(
			readFileSync(statePath, "utf8"),
		);

		state.taskSummary.total = 99;

		writeFileSync(
			statePath,
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const recovered = runBootstrap(root, "--apply");

		assert.equal(recovered.status, 0, textOutput(recovered.stderr));
		assert.equal(JSON.parse(textOutput(recovered.stdout)).changed, true);

		const recoveredState = JSON.parse(
			readFileSync(statePath, "utf8"),
		);

		assert.equal(recoveredState.taskSummary.total, 0);
		assert.equal(
			existsSync(path.join(root, "ops/tasks/history")),
			false,
		);
		assert.equal(
			readdirSync(path.join(root, "docs")).length,
			0,
		);
	} finally {
		rmSync(root, {
			recursive: true,
			force: true,
		});
	}
});

test("Bootstrap apply refuses the Juleswhile Template source remote", () => {
	const root = fixture();

	try {
		const init = spawnSync(
			"git",
			["init", "-b", "main"],
			{
				cwd: root,
				encoding: "utf8",
			},
		);

		assert.equal(init.status, 0, textOutput(init.stderr));

		const remote = spawnSync(
			"git",
			[
				"remote",
				"add",
				"origin",
				"https://github.com/loopwhile/Juleswhile.git",
			],
			{
				cwd: root,
				encoding: "utf8",
			},
		);

		assert.equal(remote.status, 0, textOutput(remote.stderr));

		const result = runBootstrap(root, "--apply");

		assert.notEqual(result.status, 0);
		assert.match(
			textOutput(result.stderr),
			/Template source repository/u,
		);
	} finally {
		rmSync(root, {
			recursive: true,
			force: true,
		});
	}
});
