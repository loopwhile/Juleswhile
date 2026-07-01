import assert from "node:assert/strict";
import test from "node:test";

import type {
	GitHubIssueEvidence,
	TaskIndex,
} from "./project-state-projection.js";
import {
	buildTaskRuntimePatches,
	selectRuntimeTaskState,
} from "./task-runtime-synchronizer.js";

function taskIndex(status = "RUNNING", enabled = true): TaskIndex {
	return {
		tasks: [
			{
				kind: "task",
				id: "TASK-010",
				status,
				enabled,
				resource_locks: ["control-plane"],
				metadata: {
					issue_number: 66,
				},
			},
			{
				kind: "template",
				id: "TASK-900",
				status: "TEMPLATE",
				enabled: false,
				resource_locks: [],
			},
		],
	};
}

function issue(
	labels: string[],
	state: "open" | "closed",
): GitHubIssueEvidence {
	return {
		number: 66,
		title: "[TASK] TASK-010",
		body: null,
		state,
		html_url: "https://github.com/loopwhile/Juleswhile/issues/66",
		created_at: "2026-07-01T09:00:00Z",
		updated_at: "2026-07-01T10:30:43Z",
		labels,
	};
}

test("completed Issue creates a terminal Runtime patch", () => {
	const patches = buildTaskRuntimePatches(taskIndex(), [
		issue(["juleswhile:task", "state:completed"], "closed"),
	]);

	assert.deepEqual(patches, [
		{
			taskId: "TASK-010",
			status: "COMPLETED",
			enabled: false,
			updatedAt: "2026-07-01T10:30:43.000Z",
			issueNumber: 66,
		},
	]);
});

test("identical Runtime evidence produces no patch", () => {
	const patches = buildTaskRuntimePatches(taskIndex("COMPLETED", false), [
		issue(["state:completed"], "closed"),
	]);

	assert.deepEqual(patches, []);
});

test("duplicate state labels prevent synchronization", () => {
	assert.throws(
		() =>
			buildTaskRuntimePatches(taskIndex(), [
				issue(["state:completed", "state:running"], "closed"),
			]),
		/state 라벨은 정확히 하나/,
	);
});

test("missing canonical Issue prevents synchronization", () => {
	assert.throws(
		() => buildTaskRuntimePatches(taskIndex(), []),
		/canonical Issue #66를 찾지 못했습니다/,
	);
});

test("open terminal Issue is rejected", () => {
	assert.throws(
		() =>
			selectRuntimeTaskState(
				taskIndex().tasks[0],
				issue(["state:completed"], "open"),
			),
		/열린 Issue #66가 종료 상태/,
	);
});
