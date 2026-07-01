import { createHash } from "node:crypto";

import { MANAGED_MARKER } from "./task-materialization-contract.js";

import type {
	GitHubIssue,
	TaskContract,
} from "./task-materialization-contract.js";

export function getLabels(issue: GitHubIssue): Set<string> {
	return new Set(
		issue.labels
			.map((label) => {
				if (typeof label === "string") {
					return label;
				}

				return label.name ?? "";
			})
			.filter(Boolean),
	);
}

export function getTaskId(issue: GitHubIssue): string | null {
	const body = issue.body ?? "";

	const markerMatch = body.match(
		/<!--\s*juleswhile:task-id:(TASK-[0-9]{3,})\s*-->/i,
	);

	if (markerMatch) {
		return markerMatch[1].toUpperCase();
	}

	if (!getLabels(issue).has("juleswhile:task")) {
		return null;
	}

	const titleMatch = issue.title.match(/\b(TASK-[0-9]{3,})\b/i);

	return titleMatch ? titleMatch[1].toUpperCase() : null;
}

export function getInstanceKey(issue: GitHubIssue): string | null {
	const body = issue.body ?? "";

	const match = body.match(
		/<!--\s*juleswhile:instance-key:([A-Za-z0-9._-]+)\s*-->/,
	);

	return match ? match[1] : null;
}

export function stateLabel(status: string): string {
	switch (status) {
		case "DRAFT":
			return "state:draft";

		case "READY":
			return "state:ready";

		case "QUEUED":
			return "state:queued";

		case "DISPATCHING":
			return "state:dispatching";

		case "RUNNING":
			return "state:running";

		case "PR_OPENED":
			return "state:pr-opened";

		case "VALIDATING":
			return "state:validating";

		case "CORRECTING":
			return "state:correcting";

		case "MERGE_READY":
			return "state:merge-ready";

		case "MERGED":
			return "state:merged";

		case "DEPLOYING":
			return "state:deploying";

		case "COMPLETED":
			return "state:completed";

		case "FAILED":
			return "state:failed";

		case "TIMEOUT":
			return "state:timeout";

		case "RETRY_WAIT":
			return "state:retry-wait";

		case "BLOCKED":
			return "state:blocked";

		case "CANCELLED":
			return "state:cancelled";

		default:
			return "state:draft";
	}
}

export function riskLabel(riskLevel: string): string {
	return `risk:${riskLevel}`;
}

export function approvalLabel(approvalPolicy: string): string {
	return `approval:${approvalPolicy}`;
}

export function taskHash(task: TaskContract): string {
	return createHash("sha256").update(JSON.stringify(task)).digest("hex");
}

export function desiredLabels(task: TaskContract): string[] {
	return [
		"juleswhile:task",
		"juleswhile:managed",
		stateLabel(task.status),
		riskLabel(task.risk_level),
		approvalLabel(task.approval_policy),
		`role:${task.role}`,
		`type:${task.type}`,
	];
}
