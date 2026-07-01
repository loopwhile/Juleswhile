import type { JulesApiClient, JulesSession } from "../scripts/jules-api.js";

import type {
	CliOptions,
	GitHubComment,
	GitHubIssue,
	ReconcileResult,
	TaskContract,
} from "../domain/reconciliation/reconciliation-contract.js";

import {
	ACTIVE_JULES_STATES,
	DISPATCH_MARKER,
	HUMAN_INTERVENTION_JULES_STATES,
	SESSION_RECONCILIATION_MARKER,
} from "../domain/reconciliation/reconciliation-policy.js";

import {
	correctionAttempts,
	extractPullRequestUrls,
	hasUnresolvedDispatchIntent,
	latestActiveReservation,
	latestDispatchIntent,
	parseSessionMarkers,
	pullRequestNumberFromUrl,
} from "./reconciliation-evidence.js";

import {
	comment,
	getPullRequest,
	replaceStateLabels,
} from "../infrastructure/github/reconciler-github-adapter.js";

import {
	createIncidentOnce,
	recordSessionReconciliation,
	recoverSessionFromCandidates,
	releaseReservation,
} from "./reconciliation-session-support.js";

export async function reconcileJulesSession(
	repository: string,
	issue: GitHubIssue,
	taskId: string,
	task: TaskContract | undefined,
	comments: GitHubComment[],
	labels: Set<string>,
	options: CliOptions,
	julesClient: JulesApiClient,
	result: ReconcileResult,
): Promise<boolean> {
	const sessionMarkers = parseSessionMarkers(comments);
	let session: JulesSession | null = null;

	if (sessionMarkers.length > 0) {
		const marker = sessionMarkers[0];
		result.summary.sessions_checked += 1;
		session = await julesClient.getSession(marker.name || marker.id);
	} else {
		const intent = latestDispatchIntent(comments);

		if (
			labels.has("state:dispatching") &&
			intent !== null &&
			hasUnresolvedDispatchIntent(comments)
		) {
			const recovery = await recoverSessionFromCandidates(
				julesClient,
				repository,
				taskId,
				task,
				intent,
			);

			result.summary.sessions_checked += 1;

			if (recovery.kind === "found") {
				result.summary.sessions_recovered += 1;
				session = recovery.session;

				await comment(
					repository,
					issue.number,
					[
						SESSION_RECONCILIATION_MARKER,
						DISPATCH_MARKER,
						"",
						"## Jules Session Marker Recovered",
						"",
						"```yaml",
						`task_id: ${taskId}`,
						`session_name: ${session.name}`,
						`session_id: ${session.id}`,
						`session_url: ${session.url}`,
						`state: ${session.state}`,
						"recovered_from: dispatch-intent",
						`created_at: ${new Date().toISOString()}`,
						"```",
					].join("\n"),
					options,
				);
			} else if (recovery.kind === "none") {
				const reservation = latestActiveReservation(
					taskId,
					issue.number,
					comments,
				);

				if (reservation) {
					await releaseReservation(
						repository,
						issue,
						taskId,
						reservation,
						options,
						"dispatch-intent-without-jules-session",
					);
				}

				result.summary.repaired += 1;
				result.summary.retried += 1;
				result.actions.push({
					issueNumber: issue.number,
					taskId,
					action: "restore-ready-no-session-candidate",
					reason: "Dispatch intent had no matching Jules Session candidate.",
					applied: options.apply,
				});

				await replaceStateLabels(repository, issue, "state:ready", options);

				return true;
			} else {
				result.summary.repaired += 1;
				result.summary.blocked += 1;
				result.actions.push({
					issueNumber: issue.number,
					taskId,
					action: "block-ambiguous-session-candidates",
					reason: `Found ${recovery.count} matching Jules Session candidates.`,
					applied: options.apply,
				});

				await replaceStateLabels(repository, issue, "state:blocked", options);

				if (
					await createIncidentOnce(
						repository,
						issue.number,
						`Ambiguous Jules Session candidates for ${taskId}`,
						`${taskId}-ambiguous-session-candidates`,
						[
							"## Jules Session 후보 중복",
							"",
							`동일 TASK에 대한 Jules Session 후보가 ${recovery.count}개 발견되어 BLOCKED로 전환했습니다.`,
						].join("\n"),
						[
							"# Ambiguous Jules Session Candidates",
							"",
							`- TASK: \`${taskId}\``,
							`- Issue: #${issue.number}`,
							`- Candidates: ${recovery.count}`,
						].join("\n"),
						comments,
						options,
					)
				) {
					result.summary.incidents += 1;
				}

				return true;
			}
		}
	}

	if (session === null) {
		return false;
	}

	const state = session.state.toUpperCase();

	if (ACTIVE_JULES_STATES.has(state)) {
		result.actions.push({
			issueNumber: issue.number,
			taskId,
			action: "preserve-running-active-session",
			reason: `Jules Session is ${state}.`,
			applied: false,
		});

		if (!labels.has("state:running")) {
			result.summary.repaired += 1;
			await replaceStateLabels(repository, issue, "state:running", options);
		}

		await recordSessionReconciliation(
			repository,
			issue,
			taskId,
			session,
			"preserve-running",
			`Jules Session is ${state}.`,
			options,
		);

		return true;
	}

	if (HUMAN_INTERVENTION_JULES_STATES.has(state)) {
		result.summary.repaired += 1;
		result.summary.blocked += 1;
		result.actions.push({
			issueNumber: issue.number,
			taskId,
			action: "block-human-intervention",
			reason: `Jules Session requires intervention: ${state}.`,
			applied: options.apply,
		});

		await replaceStateLabels(repository, issue, "state:blocked", options);

		const markerKey = `${taskId}-human-intervention-${state.toLowerCase()}`;

		if (
			await createIncidentOnce(
				repository,
				issue.number,
				`Jules Session requires intervention for ${taskId}`,
				markerKey,
				[
					"## Jules Session 사람 개입 필요",
					"",
					`- Session: ${session.url || session.name}`,
					`- State: \`${state}\``,
				].join("\n"),
				[
					"# Jules Session Requires Intervention",
					"",
					`- TASK: \`${taskId}\``,
					`- Issue: #${issue.number}`,
					`- State: \`${state}\``,
					`- Session: ${session.url || session.name}`,
				].join("\n"),
				comments,
				options,
			)
		) {
			result.summary.incidents += 1;
		}

		return true;
	}

	if (state === "COMPLETED") {
		const pullRequestUrl = extractPullRequestUrls(session)[0] ?? "";
		const pullRequestNumber =
			pullRequestUrl === ""
				? null
				: pullRequestNumberFromUrl(repository, pullRequestUrl);

		if (pullRequestNumber === null) {
			result.summary.repaired += 1;
			result.summary.blocked += 1;
			result.actions.push({
				issueNumber: issue.number,
				taskId,
				action: "block-completed-without-pr",
				reason: "Session completed without traceable PR.",
				applied: options.apply,
			});

			await replaceStateLabels(repository, issue, "state:blocked", options);

			if (
				await createIncidentOnce(
					repository,
					issue.number,
					`Session completed without traceable PR for ${taskId}`,
					`${taskId}-completed-without-pr`,
					[
						"## Session completed without traceable PR",
						"",
						`- Session: ${session.url || session.name}`,
						`- updateTime: ${session.updateTime}`,
					].join("\n"),
					[
						"# Session Completed Without Traceable PR",
						"",
						`- TASK: \`${taskId}\``,
						`- Issue: #${issue.number}`,
						`- Session: ${session.url || session.name}`,
					].join("\n"),
					comments,
					options,
				)
			) {
				result.summary.incidents += 1;
			}

			return true;
		}

		const pullRequest = await getPullRequest(repository, pullRequestNumber);

		result.summary.repaired += 1;
		result.actions.push({
			issueNumber: issue.number,
			taskId,
			action: "move-to-pr-opened",
			reason: `Jules Session completed with PR #${pullRequest.number}.`,
			applied: options.apply,
		});

		await replaceStateLabels(repository, issue, "state:pr-opened", options);

		await recordSessionReconciliation(
			repository,
			issue,
			taskId,
			session,
			"move-to-pr-opened",
			`Pull Request #${pullRequest.number} is ${pullRequest.state}.`,
			options,
			pullRequest.number,
		);

		return true;
	}

	if (state === "FAILED") {
		const attempts = correctionAttempts(comments);
		const maxCorrections =
			task?.retry_policy?.max_corrections ?? options.maxCorrections;
		const nextState =
			attempts < maxCorrections ? "state:retry-wait" : "state:blocked";

		result.summary.repaired += 1;
		if (nextState === "state:retry-wait") {
			result.summary.retried += 1;
		} else {
			result.summary.blocked += 1;
		}

		result.actions.push({
			issueNumber: issue.number,
			taskId,
			action:
				nextState === "state:retry-wait"
					? "move-failed-session-to-retry-wait"
					: "block-failed-session",
			reason: `Jules Session failed. attempts=${attempts}, max=${maxCorrections}.`,
			applied: options.apply,
		});

		await replaceStateLabels(repository, issue, nextState, options);

		await recordSessionReconciliation(
			repository,
			issue,
			taskId,
			session,
			nextState === "state:retry-wait" ? "move-to-retry-wait" : "block",
			`Jules Session failed at ${session.updateTime}.`,
			options,
		);

		return true;
	}

	result.summary.unknown_states += 1;
	result.actions.push({
		issueNumber: issue.number,
		taskId,
		action: "preserve-unknown-session-state",
		reason: `Unknown Jules Session state: ${state}.`,
		applied: false,
	});

	await recordSessionReconciliation(
		repository,
		issue,
		taskId,
		session,
		"preserve-state",
		`Unknown Jules Session state: ${state}.`,
		options,
	);

	return true;
}
