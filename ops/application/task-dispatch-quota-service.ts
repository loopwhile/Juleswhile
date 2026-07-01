import process from "node:process";

import {
	buildCanonicalSessionComment,
	buildDispatchAttemptKey,
	hasCanonicalSessionEvidence,
} from "../scripts/session-dispatch-atomicity.js";

import {
	DISPATCH_INTENT_MARKER,
	DISPATCH_OUTCOME_MARKER,
	QUOTA_LEDGER_MARKER,
} from "../domain/task-dispatch/task-dispatch-contract.js";

import type {
	ExistingSession,
	GitHubComment,
	RuntimeReservation,
	TaskContract,
} from "../domain/task-dispatch/task-dispatch-contract.js";

import {
	formatUtcDate,
	getTaskCategory,
	latestActiveReservation,
} from "../domain/task-dispatch/task-dispatch-evidence-policy.js";

import { comment } from "../infrastructure/github/task-dispatch-github-adapter.js";

export function buildReservationKey(
	task: TaskContract,
	issueNumber: number,
): string {
	return buildDispatchAttemptKey(
		task.id,
		issueNumber,
		process.env.GITHUB_RUN_ID ?? "",
	);
}

export async function ensureReservation(
	repository: string,
	task: TaskContract,
	issueNumber: number,
	comments: GitHubComment[],
): Promise<RuntimeReservation> {
	const existing = latestActiveReservation(task, issueNumber, comments);

	if (existing) {
		return existing;
	}

	const now = new Date();
	const workflowRunUrl = process.env.WORKFLOW_RUN_URL ?? "unknown";
	const workflowRunId =
		process.env.GITHUB_RUN_ID ??
		workflowRunUrl.match(/\/actions\/runs\/([0-9]+)/)?.[1] ??
		"manual";
	const category = getTaskCategory(task);
	const key = buildReservationKey(task, issueNumber);

	await comment(
		repository,
		issueNumber,
		[
			QUOTA_LEDGER_MARKER,
			"",
			"## Dispatch Quota Reservation",
			"",
			"```yaml",
			"event: quota-reserved",
			"status: reserved",
			`date: ${formatUtcDate(now)}`,
			`category: ${category}`,
			`task_id: ${task.id}`,
			`issue_number: ${issueNumber}`,
			`reservation_key: ${key}`,
			`workflow_run_id: ${workflowRunId}`,
			`workflow_run_url: ${workflowRunUrl}`,
			`created_at: ${now.toISOString()}`,
			"```",
		].join("\n"),
	);

	return {
		key,
		category,
	};
}

export async function recordDispatchIntent(
	repository: string,
	task: TaskContract,
	issueNumber: number,
	reservation: RuntimeReservation,
): Promise<void> {
	const now = new Date();
	const workflowRunUrl = process.env.WORKFLOW_RUN_URL ?? "unknown";

	await comment(
		repository,
		issueNumber,
		[
			DISPATCH_INTENT_MARKER,
			"",
			"## Jules Dispatch Intent",
			"",
			"```yaml",
			"event: dispatch-intent",
			"status: creating-session",
			`task_id: ${task.id}`,
			`issue_number: ${issueNumber}`,
			`reservation_key: ${reservation.key}`,
			`workflow_run_url: ${workflowRunUrl}`,
			`created_at: ${now.toISOString()}`,
			"```",
		].join("\n"),
	);
}

export async function recordQuotaOutcome(
	repository: string,
	task: TaskContract,
	issueNumber: number,
	reservation: RuntimeReservation,
	outcome:
		| {
				status: "committed";
				session: ExistingSession;
		  }
		| {
				status: "released" | "invalidated";
				reason: string;
		  },
): Promise<void> {
	const now = new Date();
	const workflowRunUrl = process.env.WORKFLOW_RUN_URL ?? "unknown";
	const workflowRunId =
		process.env.GITHUB_RUN_ID ??
		workflowRunUrl.match(/\/actions\/runs\/([0-9]+)/)?.[1] ??
		"manual";
	const event =
		outcome.status === "committed"
			? "quota-committed"
			: outcome.status === "released"
				? "quota-released"
				: "quota-invalidated";

	await comment(
		repository,
		issueNumber,
		[
			QUOTA_LEDGER_MARKER,
			DISPATCH_OUTCOME_MARKER,
			"",
			"## Jules Dispatch Runtime Outcome",
			"",
			"```yaml",
			`event: ${event}`,
			`status: ${outcome.status}`,
			`date: ${formatUtcDate(now)}`,
			`category: ${reservation.category}`,
			`task_id: ${task.id}`,
			`issue_number: ${issueNumber}`,
			`reservation_key: ${reservation.key}`,
			`workflow_run_id: ${workflowRunId}`,
			`workflow_run_url: ${workflowRunUrl}`,
			...(outcome.status === "committed"
				? [
						`session_name: ${outcome.session.name}`,
						`session_id: ${outcome.session.id}`,
						`session_url: ${outcome.session.url}`,
						`session_state: ${outcome.session.state}`,
					]
				: [`reason: ${outcome.reason}`]),
			`created_at: ${now.toISOString()}`,
			"```",
		].join("\n"),
	);
}

export async function recordCanonicalSession(
	repository: string,
	task: TaskContract,
	issueNumber: number,
	reservation: RuntimeReservation,
	session: ExistingSession,
	comments: GitHubComment[],
): Promise<boolean> {
	if (hasCanonicalSessionEvidence(comments, session.name)) {
		return false;
	}

	await comment(
		repository,
		issueNumber,
		buildCanonicalSessionComment(task.id, reservation.key, session),
	);

	return true;
}
