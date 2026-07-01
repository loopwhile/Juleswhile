import process from "node:process";

import type {
	JulesApiClient,
	JulesApiError,
	JulesSession,
} from "../scripts/jules-api.js";

import type {
	CliOptions,
	DispatchIntent,
	GitHubComment,
	GitHubIssue,
	RuntimeReservation,
	TaskContract,
} from "../domain/reconciliation/reconciliation-contract.js";

import {
	DISPATCH_OUTCOME_MARKER,
	QUOTA_LEDGER_MARKER,
	SESSION_RECONCILIATION_MARKER,
	TRANSIENT_API_ERROR_KINDS,
} from "../domain/reconciliation/reconciliation-policy.js";

import {
	formatUtcDate,
	hasCommentMarker,
	incidentMarker,
	sessionMatchesRepository,
	sessionTitle,
} from "./reconciliation-evidence.js";

import {
	comment,
	createIncident,
	hasIncidentEvidence,
} from "../infrastructure/github/reconciler-github-adapter.js";

export function shouldPreserveStateOnApiError(error: JulesApiError): boolean {
	return TRANSIENT_API_ERROR_KINDS.has(error.kind);
}

export async function releaseReservation(
	repository: string,
	issue: GitHubIssue,
	taskId: string,
	reservation: RuntimeReservation,
	options: CliOptions,
	reason: string,
): Promise<void> {
	const workflowRunUrl = process.env.WORKFLOW_RUN_URL ?? "unknown";
	const workflowRunId =
		process.env.GITHUB_RUN_ID ??
		workflowRunUrl.match(/\/actions\/runs\/([0-9]+)/)?.[1] ??
		"manual";

	await comment(
		repository,
		issue.number,
		[
			QUOTA_LEDGER_MARKER,
			DISPATCH_OUTCOME_MARKER,
			"",
			"## Reconciler Dispatch Reservation Release",
			"",
			"```yaml",
			"event: quota-released",
			"status: released",
			`date: ${formatUtcDate(new Date())}`,
			`category: ${reservation.category}`,
			`task_id: ${taskId}`,
			`issue_number: ${issue.number}`,
			`reservation_key: ${reservation.key}`,
			`workflow_run_id: ${workflowRunId}`,
			`workflow_run_url: ${workflowRunUrl}`,
			"dispatch_status: reconciled",
			`reason: ${reason}`,
			`created_at: ${new Date().toISOString()}`,
			"```",
		].join("\n"),
		options,
	);
}

export async function createIncidentOnce(
	repository: string,
	issueNumber: number,
	title: string,
	markerKey: string,
	issueCommentBody: string,
	body: string,
	comments: GitHubComment[],
	options: CliOptions,
): Promise<boolean> {
	const marker = incidentMarker(markerKey);

	if (hasCommentMarker(comments, marker)) {
		return false;
	}

	const existing = await hasIncidentEvidence(
		repository,
		title,
		marker,
		body,
	);

	if (existing) {
		await comment(
			repository,
			issueNumber,
			[
				marker,
				"",
				"## Existing Incident Evidence Adopted",
				"",
				"An existing Incident already represents this exact evidence set.",
				"No additional Incident was created.",
			].join("\n"),
			options,
		);

		return false;
	}

	await comment(
		repository,
		issueNumber,
		[marker, "", issueCommentBody].join("\n"),
		options,
	);

	await createIncident(
		repository,
		title,
		[marker, "", body].join("\n"),
		options,
	);

	return true;
}

export async function recordSessionReconciliation(
	repository: string,
	issue: GitHubIssue,
	taskId: string,
	session: JulesSession,
	action: string,
	reason: string,
	options: CliOptions,
	pullRequestNumber?: number,
): Promise<void> {
	await comment(
		repository,
		issue.number,
		[
			SESSION_RECONCILIATION_MARKER,
			"",
			"## Jules Session Reconciliation",
			"",
			"```yaml",
			`task_id: ${taskId}`,
			`session_name: ${session.name}`,
			`session_id: ${session.id}`,
			`session_state: ${session.state}`,
			`session_url: ${session.url}`,
			`session_update_time: ${session.updateTime}`,
			`action: ${action}`,
			`reason: ${reason}`,
			...(pullRequestNumber ? [`pull_request: #${pullRequestNumber}`] : []),
			`created_at: ${new Date().toISOString()}`,
			"```",
		].join("\n"),
		options,
	);
}

export async function recoverSessionFromCandidates(
	julesClient: JulesApiClient,
	repository: string,
	taskId: string,
	task: TaskContract | undefined,
	intent: DispatchIntent,
): Promise<
	| {
			kind: "none";
	  }
	| {
			kind: "ambiguous";
			count: number;
	  }
	| {
			kind: "found";
			session: JulesSession;
	  }
> {
	const expectedTitle = sessionTitle(taskId, task);
	const createdAfter = Date.parse(intent.createdAt);
	const { sessions } = await julesClient.listSessions();
	const candidates = sessions.filter((session) => {
		const createdAt = Date.parse(session.createTime);

		return (
			session.title === expectedTitle &&
			(Number.isNaN(createdAfter) ||
				Number.isNaN(createdAt) ||
				createdAt >= createdAfter) &&
			sessionMatchesRepository(session, repository)
		);
	});

	if (candidates.length === 0) {
		return {
			kind: "none",
		};
	}

	if (candidates.length > 1) {
		return {
			kind: "ambiguous",
			count: candidates.length,
		};
	}

	return {
		kind: "found",
		session: candidates[0],
	};
}
