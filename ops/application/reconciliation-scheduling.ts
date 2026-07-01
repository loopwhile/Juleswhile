import type { GitHubIssue } from "../domain/reconciliation/reconciliation-contract.js";

import { ACTIVE_LABELS } from "../domain/reconciliation/reconciliation-policy.js";

import { getLabels, hasAnyLabel } from "./reconciliation-evidence.js";

export function shouldScheduleNextTask(taskIssues: GitHubIssue[]): boolean {
	const hasActiveTask = taskIssues.some((issue) => {
		if (issue.state !== "open") {
			return false;
		}

		return hasAnyLabel(getLabels(issue), ACTIVE_LABELS);
	});

	const hasReadyTask = taskIssues.some((issue) => {
		if (issue.state !== "open") {
			return false;
		}

		const labels = getLabels(issue);

		return labels.has("state:ready") || labels.has("state:retry-wait");
	});

	return !hasActiveTask && hasReadyTask;
}
