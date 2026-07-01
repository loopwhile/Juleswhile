import assert from "node:assert/strict";
import test from "node:test";

import {
	type DashboardState,
	type ProjectionStatus,
	assertNoSensitiveKeys,
	formatTimestamp,
	nextAction,
	renderDashboard,
} from "./build-dashboard.js";

function dashboardState(): DashboardState {
	return {
		projectId: "juleswhile",
		status: "active",
		phase: "operations",
		repository: {
			fullName: "loopwhile/Juleswhile",
		},
		automation: {
			enabled: true,
			contentEnabled: false,
			netlifyStatusEnabled: true,
			mode: "guarded",
			pausedReason: null,
		},
		taskSummary: {
			total: 12,
			ready: 1,
			running: 0,
			completed: 11,
			blocked: 0,
			retryWait: 0,
			prOpened: 0,
		},
		runtime: {
			activeSessions: [],
			activePullRequests: [],
			resourceLocks: [],
			lastReconciledAt: "2026-07-01T12:53:48Z",
		},
		projection: {
			status: "current",
			observedAt: "2026-07-01T12:53:48Z",
			generatedAt: "2026-07-01T12:53:48Z",
			evidenceDigest: `sha256:${"a".repeat(64)}`,
			source: "github-runtime-evidence",
			workflowRunUrl: "https://github.com/loopwhile/Juleswhile/actions/runs/1",
			syncReason: "runtime-projection-sync",
			drift: {
				stateLabelConflicts: 0,
				missingCanonicalIssues: 0,
				supersededIssues: 0,
				manifestMismatches: 0,
				issueLifecycleMismatches: 0,
				sessionLookupErrors: 0,
			},
		},
		quotas: {
			date: "2026-07-01",
			hardLimit: 100,
			newTaskBudget: 65,
			correctionBudget: 20,
			maintenanceBudget: 10,
			reserve: 5,
			maxConcurrent: 1,
			used: {
				newTasks: 1,
				corrections: 0,
				maintenance: 0,
				total: 1,
			},
		},
		lastEvent: {
			type: "task-created",
			taskId: "TASK-012",
			issueNumber: 75,
			occurredAt: "2026-07-01T12:53:48Z",
		},
		updatedAt: "2026-07-01T12:53:48Z",
	};
}

test("Dashboard renders current Projection and Runtime totals", () => {
	const html = renderDashboard(dashboardState(), 12);

	assert.match(html, /Projection: CURRENT/);

	assert.match(html, /Runtime drift:<\/strong> 0/);

	assert.match(html, /<h2>Completed<\/h2><p class="metric">11<\/p>/);

	assert.match(html, /<h2>Running<\/h2><p class="metric">0<\/p>/);

	assert.match(html, /Dispatch the next ready TASK/);
});

test("Every non-current Projection requires operator review", () => {
	const statuses: ProjectionStatus[] = ["stale", "degraded", "invalid"];

	for (const status of statuses) {
		const state = dashboardState();

		if (!state.projection) {
			throw new Error("Projection fixture is missing.");
		}

		state.projection.status = status;

		assert.equal(
			nextAction(state),
			"Runtime Projection requires synchronization or operator review.",
		);

		assert.match(
			renderDashboard(state, 12),
			new RegExp(`Projection: ${status.toUpperCase()}`),
		);
	}
});

test("Dashboard rejects nested secret-like keys", () => {
	const unsafe = {
		runtime: {
			connection: {
				accessToken: "must-not-render",
			},
		},
	};

	assert.throws(
		() => assertNoSensitiveKeys(unsafe),
		/Sensitive key is forbidden/,
	);
});

test("Dashboard escapes user-controlled values", () => {
	const state = dashboardState();

	state.projectId = '<script>alert("x")</script>';

	const html = renderDashboard(state, 12);

	assert.doesNotMatch(html, /<script>alert/);

	assert.match(html, /&lt;script&gt;alert/);
});

test("Dashboard output is deterministic", () => {
	const state = dashboardState();

	assert.equal(renderDashboard(state, 12), renderDashboard(state, 12));
});

test("Invalid timestamps render safely", () => {
	assert.equal(formatTimestamp("not-a-date"), "invalid timestamp");

	assert.equal(formatTimestamp(null), "unknown");

	const state = dashboardState();

	if (!state.projection) {
		throw new Error("Projection fixture is missing.");
	}

	state.projection.observedAt = "not-a-date";

	assert.match(renderDashboard(state, 12), /invalid timestamp/);
});

test("Empty Runtime collections render explicit None values", () => {
	const html = renderDashboard(dashboardState(), 12);

	const noneValues = html.match(/<li>None<\/li>/g) ?? [];

	assert.equal(noneValues.length, 3);
});
