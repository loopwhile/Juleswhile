#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadTaskManifest } from "./task-manifest.js";

interface DashboardState {
	projectId?: string;
	status?: string;
	phase?: string;
	primaryBranch?: string;
	repository?: {
		fullName?: string;
		htmlUrl?: string;
		julesSourceName?: string | null;
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

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function boolLabel(value: unknown): string {
	return value === true ? "enabled" : "disabled";
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nextAction(state: DashboardState): string {
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
	const visibleItems = items ?? [];

	if (visibleItems.length === 0) {
		return "<li>None</li>";
	}

	return visibleItems
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
				`<tr><th>${escapeHtml(field)}</th><td>${numberValue(summary?.[field])}</td></tr>`,
		)
		.join("");
}

function renderDashboard(state: DashboardState, taskCount: number): string {
	const quotas = state.quotas ?? {};
	const used = quotas.used ?? {};
	const quotaTotal = numberValue(used.total);
	const hardLimit = numberValue(quotas.hardLimit);
	const netlifyStatus = state.automation?.netlifyStatusEnabled
		? "verification enabled"
		: "verification disabled";

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(state.projectId ?? "Juleswhile")} Operations</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f7f8fa; }
    body { margin: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 32px; line-height: 1.15; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    section, .panel { background: #fff; border: 1px solid #dfe4ea; border-radius: 8px; padding: 16px; }
    .metric { font-size: 28px; font-weight: 700; }
    .muted { color: #5d6975; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 0; border-bottom: 1px solid #edf0f2; text-align: left; }
    th { color: #5d6975; font-weight: 600; }
    ul { margin: 0; padding-left: 18px; }
    code { background: #edf0f2; border-radius: 4px; padding: 2px 4px; }
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

    <section>
      <h2>Next Action</h2>
      <p>${escapeHtml(nextAction(state))}</p>
    </section>

    <div class="grid" style="margin-top:14px">
      <div class="panel"><h2>Tasks</h2><p class="metric">${taskCount}</p><p class="muted">merged manifest tasks</p></div>
      <div class="panel"><h2>Active Sessions</h2><p class="metric">${numberValue(state.runtime?.activeSessions?.length)}</p><p class="muted">Jules runtime evidence</p></div>
      <div class="panel"><h2>Open PRs</h2><p class="metric">${numberValue(state.runtime?.activePullRequests?.length)}</p><p class="muted">runtime projection</p></div>
      <div class="panel"><h2>Quota</h2><p class="metric">${quotaTotal}/${hardLimit}</p><p class="muted">used today</p></div>
    </div>

    <div class="grid" style="margin-top:14px">
      <section>
        <h2>Automation</h2>
        <table>
          <tr><th>Core</th><td>${escapeHtml(boolLabel(state.automation?.enabled))}</td></tr>
          <tr><th>Content</th><td>${escapeHtml(boolLabel(state.automation?.contentEnabled))}</td></tr>
          <tr><th>Mode</th><td>${escapeHtml(state.automation?.mode ?? "unknown")}</td></tr>
          <tr><th>Netlify</th><td>${escapeHtml(netlifyStatus)}</td></tr>
          <tr><th>Paused Reason</th><td>${escapeHtml(state.automation?.pausedReason ?? "none")}</td></tr>
        </table>
      </section>

      <section>
        <h2>Jules Quota</h2>
        <table>
          <tr><th>Date</th><td>${escapeHtml(quotas.date ?? "not started")}</td></tr>
          <tr><th>Max Concurrent</th><td>${numberValue(quotas.maxConcurrent)}</td></tr>
          <tr><th>New</th><td>${numberValue(used.newTasks)} / ${numberValue(quotas.newTaskBudget)}</td></tr>
          <tr><th>Corrections</th><td>${numberValue(used.corrections)} / ${numberValue(quotas.correctionBudget)}</td></tr>
          <tr><th>Maintenance</th><td>${numberValue(used.maintenance)} / ${numberValue(quotas.maintenanceBudget)}</td></tr>
          <tr><th>Reserve</th><td>${numberValue(quotas.reserve)}</td></tr>
        </table>
      </section>
    </div>

    <div class="grid" style="margin-top:14px">
      <section>
        <h2>Task Counts</h2>
        <table>${taskRows(state.taskSummary)}</table>
      </section>

      <section>
        <h2>Runtime</h2>
        <p><strong>Last reconciled:</strong> ${escapeHtml(state.runtime?.lastReconciledAt ?? "never")}</p>
        <p><strong>Last event:</strong> ${escapeHtml(state.lastEvent?.type ?? "none")}</p>
        <p><strong>Last TASK:</strong> ${escapeHtml(state.lastEvent?.taskId ?? "none")}</p>
        <p><strong>Updated:</strong> ${escapeHtml(state.updatedAt ?? "unknown")}</p>
      </section>
    </div>

    <div class="grid" style="margin-top:14px">
      <section><h2>Active Sessions</h2><ul>${listItems(state.runtime?.activeSessions)}</ul></section>
      <section><h2>Pull Requests</h2><ul>${listItems(state.runtime?.activePullRequests)}</ul></section>
      <section><h2>Blocked Items</h2><p class="metric">${numberValue(state.taskSummary?.blocked)}</p><p class="muted">from committed state projection</p></section>
      <section><h2>Resource Locks</h2><ul>${(state.runtime?.resourceLocks ?? []).map((lock) => `<li><code>${escapeHtml(lock.resource)}</code> ${escapeHtml(lock.taskId ?? "")}</li>`).join("") || "<li>None</li>"}</ul></section>
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
	const taskManifest = await loadTaskManifest("ops/tasks/task-index.yaml");
	const html = renderDashboard(state, taskManifest.tasks.length);

	await mkdir("dist", { recursive: true });
	await writeFile(path.join("dist", "index.html"), html, "utf8");
	console.log("Built dist/index.html");
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Dashboard build failed: ${message}`);
	process.exitCode = 1;
});
