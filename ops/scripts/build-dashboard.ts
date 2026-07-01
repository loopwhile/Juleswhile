#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadTaskManifest } from "./task-manifest.js";

export type ProjectionStatus = "current" | "stale" | "degraded" | "invalid";

export interface ProjectionDriftCounts {
	stateLabelConflicts?: number;
	missingCanonicalIssues?: number;
	supersededIssues?: number;
	manifestMismatches?: number;
	issueLifecycleMismatches?: number;
	sessionLookupErrors?: number;
}

export interface DashboardState {
	projectId?: string;
	status?: string;
	phase?: string;
	repository?: {
		fullName?: string;
	};
	automation?: {
		enabled?: boolean;
		contentEnabled?: boolean;
		netlifyStatusEnabled?: boolean;
		mode?: string;
		pausedReason?: string | null;
	};
	taskSummary?: Record<string, number>;
	runtime?: {
		activeSessions?: Array<Record<string, unknown>>;
		activePullRequests?: Array<Record<string, unknown>>;
		resourceLocks?: Array<{
			resource?: string;
			taskId?: string;
			expiresAt?: string;
		}>;
		lastReconciledAt?: string | null;
	};
	projection?: {
		status?: ProjectionStatus;
		observedAt?: string;
		generatedAt?: string;
		evidenceDigest?: string;
		source?: string;
		workflowRunUrl?: string | null;
		syncReason?: string;
		drift?: ProjectionDriftCounts;
	};
	quotas?: {
		date?: string | null;
		hardLimit?: number;
		newTaskBudget?: number;
		correctionBudget?: number;
		maintenanceBudget?: number;
		reserve?: number;
		maxConcurrent?: number;
		used?: {
			newTasks?: number;
			corrections?: number;
			maintenance?: number;
			total?: number;
		};
	};
	lastEvent?: {
		type?: string;
		taskId?: string | null;
		issueNumber?: number | null;
		occurredAt?: string;
	} | null;
	updatedAt?: string;
}

const PROJECTION_STATUSES = new Set<ProjectionStatus>([
	"current",
	"stale",
	"degraded",
	"invalid",
]);

const SENSITIVE_KEY_FRAGMENTS = [
	"token",
	"secret",
	"password",
	"authorization",
	"apikey",
	"credential",
	"cookie",
	"privatekey",
] as const;

export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function normalizedKey(key: string): string {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
	const normalized = normalizedKey(key);

	return SENSITIVE_KEY_FRAGMENTS.some(
		(fragment) =>
			normalized === fragment ||
			normalized.startsWith(fragment) ||
			normalized.endsWith(fragment),
	);
}

export function assertNoSensitiveKeys(
	value: unknown,
	location = "projectState",
): void {
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			assertNoSensitiveKeys(value[index], `${location}[${index}]`);
		}

		return;
	}

	if (typeof value !== "object" || value === null) {
		return;
	}

	for (const [key, nested] of Object.entries(
		value as Record<string, unknown>,
	)) {
		if (isSensitiveKey(key)) {
			throw new Error(
				`Sensitive key is forbidden in Dashboard input: ${location}.${key}`,
			);
		}

		assertNoSensitiveKeys(nested, `${location}.${key}`);
	}
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatTimestamp(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") {
		return "unknown";
	}

	const parsed = Date.parse(value);

	return Number.isFinite(parsed)
		? new Date(parsed).toISOString()
		: "invalid timestamp";
}

function projectionStatus(value: unknown): ProjectionStatus {
	return typeof value === "string" &&
		PROJECTION_STATUSES.has(value as ProjectionStatus)
		? (value as ProjectionStatus)
		: "invalid";
}

function driftEntries(
	drift: ProjectionDriftCounts | undefined,
): Array<[string, number]> {
	return [
		["State label conflicts", numberValue(drift?.stateLabelConflicts)],
		["Missing canonical Issues", numberValue(drift?.missingCanonicalIssues)],
		["Superseded Issues", numberValue(drift?.supersededIssues)],
		["Manifest mismatches", numberValue(drift?.manifestMismatches)],
		["Lifecycle mismatches", numberValue(drift?.issueLifecycleMismatches)],
		["Session lookup errors", numberValue(drift?.sessionLookupErrors)],
	];
}

function totalDrift(drift: ProjectionDriftCounts | undefined): number {
	return driftEntries(drift).reduce((total, [, count]) => total + count, 0);
}

export function nextAction(state: DashboardState): string {
	if (projectionStatus(state.projection?.status) !== "current") {
		return "Runtime Projection requires synchronization or operator review.";
	}

	if (state.automation?.enabled !== true) {
		return "Run control-plane preflight, then enable guarded automation by Pull Request.";
	}

	const summary = state.taskSummary ?? {};

	if (numberValue(summary.blocked) > 0) {
		return "Review blocked TASK Issues and record the decision or follow-up TASK.";
	}

	if (numberValue(summary.ready) > 0 || numberValue(summary.retryWait) > 0) {
		return "Dispatch the next ready TASK within the current Jules quota.";
	}

	if (numberValue(summary.running) > 0 || numberValue(summary.prOpened) > 0) {
		return "Monitor active Jules Sessions and Pull Requests until validation completes.";
	}

	return "Create or approve the next GitHub TASK Issue.";
}

function listItems(items: Array<Record<string, unknown>> | undefined): string {
	const values = items ?? [];

	if (values.length === 0) {
		return "<li>None</li>";
	}

	return values
		.map((item) => {
			const title =
				item.title ?? item.taskId ?? item.name ?? item.number ?? "active item";

			const status = item.status ?? item.state ?? item.phase ?? "";

			return `<li><strong>${escapeHtml(title)}</strong>${status ? ` <span>${escapeHtml(status)}</span>` : ""}</li>`;
		})
		.join("");
}

function taskRows(summary: Record<string, number> | undefined): string {
	const fields = [
		"total",
		"templates",
		"draft",
		"ready",
		"queued",
		"dispatching",
		"running",
		"prOpened",
		"validating",
		"correcting",
		"mergeReady",
		"merged",
		"deploying",
		"completed",
		"failed",
		"timeout",
		"retryWait",
		"blocked",
		"cancelled",
	];

	return fields
		.map(
			(field) =>
				`<tr><th>${escapeHtml(field)}</th>` +
				`<td>${numberValue(summary?.[field])}</td></tr>`,
		)
		.join("");
}

function digestLabel(value: string | undefined): string {
	if (!value) {
		return "unavailable";
	}

	return value.length > 32 ? `${value.slice(0, 32)}…` : value;
}

export function renderDashboard(
	state: DashboardState,
	taskCount: number,
): string {
	assertNoSensitiveKeys(state);

	const projection = state.projection ?? {};

	const status = projectionStatus(projection.status);

	const drift = projection.drift ?? {};

	const quotas = state.quotas ?? {};

	const used = quotas.used ?? {};

	const sessions = state.runtime?.activeSessions ?? [];

	const pullRequests = state.runtime?.activePullRequests ?? [];

	const locks = state.runtime?.resourceLocks ?? [];

	const driftRows = driftEntries(drift)
		.map(
			([label, count]) =>
				`<tr><th>${escapeHtml(label)}</th>` + `<td>${count}</td></tr>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(state.projectId ?? "Juleswhile")} Operations</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; color: #17202a; background: #f7f8fa; }
    body { margin: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 32px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    section, .panel { background: #fff; border: 1px solid #dfe4ea; border-radius: 8px; padding: 16px; }
    .projection-banner { margin-bottom: 14px; border-width: 2px; }
    .projection-banner.current { border-color: #1f883d; }
    .projection-banner.stale { border-color: #bf8700; }
    .projection-banner.degraded, .projection-banner.invalid { border-color: #cf222e; }
    .metric { font-size: 28px; font-weight: 700; }
    .muted { color: #5d6975; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 0; border-bottom: 1px solid #edf0f2; text-align: left; vertical-align: top; }
    th { color: #5d6975; font-weight: 600; }
    ul { margin: 0; padding-left: 18px; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeHtml(state.projectId ?? "Juleswhile")}</h1>
        <p class="muted">${escapeHtml(state.repository?.fullName ?? "repository not configured")}</p>
      </div>
      <div>
        <p><strong>Status:</strong> ${escapeHtml(state.status ?? "unknown")}</p>
        <p><strong>Phase:</strong> ${escapeHtml(state.phase ?? "unknown")}</p>
      </div>
    </header>

    <section class="projection-banner ${escapeHtml(status)}">
      <h2>Projection: ${escapeHtml(status.toUpperCase())}</h2>
      <p><strong>Observed:</strong> ${escapeHtml(formatTimestamp(projection.observedAt))}</p>
      <p><strong>Generated:</strong> ${escapeHtml(formatTimestamp(projection.generatedAt))}</p>
      <p><strong>Runtime drift:</strong> ${totalDrift(drift)}</p>
      <p><strong>Evidence digest:</strong> <code>${escapeHtml(digestLabel(projection.evidenceDigest))}</code></p>
      <p><strong>Sync reason:</strong> ${escapeHtml(projection.syncReason ?? "unknown")}</p>
      <p><strong>Source:</strong> ${escapeHtml(projection.source ?? "unknown")}</p>
      <p><strong>Workflow:</strong> ${escapeHtml(projection.workflowRunUrl ?? "unavailable")}</p>
    </section>

    <section>
      <h2>Next Action</h2>
      <p>${escapeHtml(nextAction(state))}</p>
    </section>

    <div class="grid" style="margin-top:14px">
      <div class="panel"><h2>Tasks</h2><p class="metric">${taskCount}</p></div>
      <div class="panel"><h2>Completed</h2><p class="metric">${numberValue(state.taskSummary?.completed)}</p></div>
      <div class="panel"><h2>Running</h2><p class="metric">${numberValue(state.taskSummary?.running)}</p></div>
      <div class="panel"><h2>Active Sessions</h2><p class="metric">${sessions.length}</p></div>
      <div class="panel"><h2>Open PRs</h2><p class="metric">${pullRequests.length}</p></div>
      <div class="panel"><h2>Resource Locks</h2><p class="metric">${locks.length}</p></div>
      <div class="panel"><h2>Quota</h2><p class="metric">${numberValue(used.total)}/${numberValue(quotas.hardLimit)}</p></div>
    </div>

    <div class="grid" style="margin-top:14px">
      <section>
        <h2>Projection Drift</h2>
        <table>${driftRows}</table>
      </section>

      <section>
        <h2>Task Counts</h2>
        <table>${taskRows(state.taskSummary)}</table>
      </section>

      <section>
        <h2>Runtime</h2>
        <p><strong>Last reconciled:</strong> ${escapeHtml(formatTimestamp(state.runtime?.lastReconciledAt))}</p>
        <p><strong>Last event:</strong> ${escapeHtml(state.lastEvent?.type ?? "none")}</p>
        <p><strong>Last TASK:</strong> ${escapeHtml(state.lastEvent?.taskId ?? "none")}</p>
        <p><strong>Updated:</strong> ${escapeHtml(formatTimestamp(state.updatedAt))}</p>
      </section>
    </div>

    <div class="grid" style="margin-top:14px">
      <section><h2>Active Sessions</h2><ul>${listItems(sessions)}</ul></section>
      <section><h2>Pull Requests</h2><ul>${listItems(pullRequests)}</ul></section>
      <section><h2>Resource Locks</h2><ul>${locks.map((lock) => `<li><code>${escapeHtml(lock.resource)}</code> ${escapeHtml(lock.taskId ?? "")}</li>`).join("") || "<li>None</li>"}</ul></section>
    </div>
  </main>
</body>
</html>
`;
}

async function main(): Promise<void> {
	const state = JSON.parse(
		await readFile("ops/state/project-state.json", "utf8"),
	) as DashboardState;

	assertNoSensitiveKeys(state);

	const taskManifest = await loadTaskManifest("ops/tasks/task-index.yaml");

	const taskCount = taskManifest.tasks.filter(
		(task) => task.kind === "task",
	).length;

	const html = renderDashboard(state, taskCount);

	await mkdir("dist", {
		recursive: true,
	});

	await writeFile(path.join("dist", "index.html"), html, "utf8");

	console.log("Built dist/index.html");
}

function isDirectExecution(): boolean {
	const entrypoint = process.argv[1];

	return (
		entrypoint !== undefined &&
		import.meta.url === pathToFileURL(path.resolve(entrypoint)).href
	);
}

if (isDirectExecution()) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);

		console.error(`Dashboard build failed: ${message}`);

		process.exitCode = 1;
	});
}
