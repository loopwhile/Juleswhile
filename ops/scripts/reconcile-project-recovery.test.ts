import assert from "node:assert/strict";
import test from "node:test";

import {
	intentComment,
	runReconciler,
	sessionComment,
} from "./reconcile-project.test-fixture.js";

test("ambiguous dispatch intent recovers exactly one candidate", async () => {
	const { comments, result } = await runReconciler({
		labels: ["state:dispatching"],
		comments: [intentComment()],
		sessions: [
			{
				name: "sessions/s-2",
				id: "s-2",
				title: "[TASK-004] Reconcile runtime state with Jules API sessions",
				state: "IN_PROGRESS",
				createTime: "2026-06-28T00:02:00Z",
				sourceContext: {
					repository: "loopwhile/Juleswhile",
				},
			},
		],
	});

	assert.equal(result.summary.sessions_recovered, 1);
	assert(
		comments.some((comment) =>
			comment.body.includes("Jules Session Marker Recovered"),
		),
	);
});

test("multiple dispatch intent candidates block", async () => {
	const { issue, incidents } = await runReconciler({
		labels: ["state:dispatching"],
		comments: [intentComment()],
		sessions: [
			{
				name: "sessions/s-2",
				title: "[TASK-004] Reconcile runtime state with Jules API sessions",
				state: "IN_PROGRESS",
				createTime: "2026-06-28T00:02:00Z",
			},
			{
				name: "sessions/s-3",
				title: "[TASK-004] Reconcile runtime state with Jules API sessions",
				state: "IN_PROGRESS",
				createTime: "2026-06-28T00:03:00Z",
			},
		],
	});

	assert(issue.labels.some((label) => label.name === "state:blocked"));
	assert.equal(incidents.length, 1);
});

test("Issue comment pagination finds session marker after 100 comments", async () => {
	const comments = Array.from(
		{
			length: 100,
		},
		(_, index) => ({
			body: `noise ${index}`,
			created_at: "2026-06-28T00:00:00Z",
		}),
	);

	const { result } = await runReconciler({
		labels: ["state:running"],
		comments: [...comments, sessionComment()],
		session: {
			name: "sessions/s-1",
			state: "IN_PROGRESS",
		},
	});

	assert.equal(result.summary.sessions_checked, 1);
});

test("incident idempotency marker prevents duplicate incidents", async () => {
	const { incidents } = await runReconciler({
		labels: ["state:running"],
		comments: [
			sessionComment(),
			{
				body: "<!-- juleswhile:incident:TASK-004-human-intervention-awaiting_user_feedback -->",
				created_at: "2026-06-28T00:02:00Z",
			},
		],
		session: {
			name: "sessions/s-1",
			state: "AWAITING_USER_FEEDBACK",
		},
	});

	assert.equal(incidents.length, 0);
});
