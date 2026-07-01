import assert from "node:assert/strict";
import test from "node:test";

import type {
	GitHubComment,
	TaskContract,
} from "../domain/task-dispatch/task-dispatch-contract.js";

import {
	getTaskCategory,
	hasBlockingDispatchIntent,
	parseExistingSession,
} from "../domain/task-dispatch/task-dispatch-evidence-policy.js";

import { validateTaskContract } from "../domain/task-dispatch/task-dispatch-task-policy.js";

import { buildRequest } from "../application/task-dispatch-prompt.js";

function task(overrides: Partial<TaskContract> = {}): TaskContract {
	return {
		kind: "task",
		id: "TASK-100",
		title: "Fixture",
		role: "developer",
		type: "feature",
		status: "READY",
		priority: "P1",
		enabled: true,
		objective: "Fixture objective",
		depends_on: [],
		inputs: [],
		outputs: [],
		acceptance_criteria: ["Fixture passes"],
		allowed_paths: ["src/**"],
		forbidden_paths: [],
		forbidden_actions: [],
		validation_commands: ["npm test"],
		risk_level: "medium",
		approval_policy: "reviewer",
		parallelizable: true,
		resource_locks: [],
		conflicts_with: [],
		retry_policy: {
			max_corrections: 1,
			timeout_minutes: 30,
		},
		stitch: {
			allowed: false,
		},
		metadata: {
			goal_issue_number: null,
			issue_number: 100,
			created_at: "2026-07-01T00:00:00Z",
			updated_at: "2026-07-01T00:00:00Z",
			created_by: "test",
			tags: [],
			template_id: null,
			instance_key: null,
		},
		...overrides,
	};
}

test("비활성 TASK는 강제 실행이 아니면 거부된다", () => {
	assert.throws(
		() =>
			validateTaskContract(
				task({
					enabled: false,
				}),
				false,
			),
		/비활성화/,
	);

	assert.doesNotThrow(() =>
		validateTaskContract(
			task({
				enabled: false,
			}),
			true,
		),
	);
});

test("기존 Canonical Session Evidence를 복원한다", () => {
	const comments: GitHubComment[] = [
		{
			created_at: "2026-07-01T00:00:00Z",
			body: [
				"<!-- juleswhile:task-dispatch -->",
				"",
				"| Field | Value |",
				"|---|---|",
				"| Session | `sessions/abc` |",
				"| Session ID | `abc` |",
				"| Session 상태 | `QUEUED` |",
				"",
				"[Jules Session 열기](https://jules.example/sessions/abc)",
			].join("\n"),
		},
	];

	assert.deepEqual(parseExistingSession(comments), {
		name: "sessions/abc",
		id: "abc",
		url: "https://jules.example/sessions/abc",
		state: "QUEUED",
	});
});

test("해제되지 않은 Dispatch Intent는 중복 생성을 차단한다", () => {
	const intentOnly: GitHubComment[] = [
		{
			created_at: "2026-07-01T00:01:00Z",
			body: [
				"<!-- juleswhile:dispatch-intent -->",
				"status: creating-session",
			].join("\n"),
		},
	];

	assert.equal(hasBlockingDispatchIntent(intentOnly), true);

	assert.equal(
		hasBlockingDispatchIntent([
			...intentOnly,
			{
				created_at: "2026-07-01T00:02:00Z",
				body: ["<!-- juleswhile:dispatch-outcome -->", "status: released"].join(
					"\n",
				),
			},
		]),
		false,
	);
});

test("TASK Category와 Jules Request 계약을 보존한다", () => {
	assert.equal(
		getTaskCategory(
			task({
				type: "maintenance",
			}),
		),
		"maintenance",
	);

	const request = buildRequest(task(), "prompt", "sources/example");

	assert.deepEqual(request, {
		prompt: "prompt",
		title: "[TASK-100] Fixture",
		sourceContext: {
			source: "sources/example",
			githubRepoContext: {
				startingBranch: "main",
			},
		},
		requirePlanApproval: false,
		automationMode: "AUTO_CREATE_PR",
	});
});
