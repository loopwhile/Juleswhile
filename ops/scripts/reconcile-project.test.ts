import assert from "node:assert/strict";
import test from "node:test";

import {
	runReconciler,
	sessionComment,
} from "./reconcile-project.test-fixture.js";

test("IN_PROGRESS keeps TASK running", async () => {
	const { issue, result } = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "IN_PROGRESS",
			updateTime: "2026-06-28T00:02:00Z",
		},
	});

	assert(issue.labels.some((label) => label.name === "state:running"));
	assert.equal(result.summary.sessions_checked, 1);
});

test("COMPLETED with PR output moves to PR tracking", async () => {
	const { issue } = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "COMPLETED",
			updateTime: "2026-06-28T00:02:00Z",
			outputs: [
				{
					pullRequest: {
						url: "https://github.com/loopwhile/Juleswhile/pull/7",
					},
				},
			],
		},
	});

	assert(issue.labels.some((label) => label.name === "state:pr-opened"));
});

test("dry-run checks Jules API without mutating GitHub labels", async () => {
	const { issue, result } = await runReconciler({
		dryRun: true,
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "COMPLETED",
			updateTime: "2026-06-28T00:02:00Z",
			outputs: [
				{
					pullRequest: {
						url: "https://github.com/loopwhile/Juleswhile/pull/7",
					},
				},
			],
		},
	});

	assert(issue.labels.some((label) => label.name === "state:running"));
	assert.equal(result.summary.sessions_checked, 1);
});

test("COMPLETED without PR blocks the TASK", async () => {
	const { issue, incidents } = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "COMPLETED",
			updateTime: "2026-06-28T00:02:00Z",
			outputs: [],
		},
	});

	assert(issue.labels.some((label) => label.name === "state:blocked"));
	assert.equal(incidents.length, 1);
});

test("FAILED follows retry limits", async () => {
	const retry = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "FAILED",
			updateTime: "2026-06-28T00:02:00Z",
		},
	});

	assert(retry.issue.labels.some((label) => label.name === "state:retry-wait"));

	const blocked = await runReconciler({
		labels: ["state:running"],
		comments: [
			sessionComment(),
			{
				body: "<!-- juleswhile:correction-attempt -->",
				created_at: "2026-06-28T00:03:00Z",
			},
			{
				body: "<!-- juleswhile:correction-attempt -->",
				created_at: "2026-06-28T00:04:00Z",
			},
		],
		session: {
			name: "sessions/s-1",
			state: "FAILED",
			updateTime: "2026-06-28T00:02:00Z",
		},
	});

	assert(blocked.issue.labels.some((label) => label.name === "state:blocked"));
});

test("AWAITING_USER_FEEDBACK blocks the TASK", async () => {
	const { issue, incidents } = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "AWAITING_USER_FEEDBACK",
			url: "https://jules.google/session",
		},
	});

	assert(issue.labels.some((label) => label.name === "state:blocked"));
	assert.equal(incidents.length, 1);
});

test("404 blocks without retrying", async () => {
	const { issue, result } = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		julesStatus: 404,
	});

	assert(issue.labels.some((label) => label.name === "state:blocked"));
	assert.equal(result.summary.api_errors, 1);
});

test("429 and 5xx preserve state", async () => {
	for (const status of [429, 500]) {
		const { issue, result } = await runReconciler({
			labels: ["state:running"],
			comments: [sessionComment()],
			julesStatus: status,
		});

		assert(issue.labels.some((label) => label.name === "state:running"));
		assert.equal(result.summary.api_errors, 1);
	}
});

test("unknown state does not retry automatically", async () => {
	const { issue, result } = await runReconciler({
		labels: ["state:running"],
		comments: [sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "NEW_ALPHA_STATE",
		},
	});

	assert(issue.labels.some((label) => label.name === "state:running"));
	assert.equal(result.summary.unknown_states, 1);
});
