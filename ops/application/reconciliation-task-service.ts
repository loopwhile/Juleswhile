import { type JulesApiClient, JulesApiError } from "../scripts/jules-api.js";

import type {
	CliOptions,
	GitHubIssue,
	GitHubPullRequest,
	ReconcileResult,
	TaskContract,
} from "../domain/reconciliation/reconciliation-contract.js";

import {
	DISPATCH_MARKER,
	TASK_ID_PATTERN,
} from "../domain/reconciliation/reconciliation-policy.js";

import {
	ageMinutes,
	findPullRequestNumber,
	getLabels,
	getTaskId,
	hasUnresolvedDispatchIntent,
	latestActiveReservation,
} from "./reconciliation-evidence.js";

import {
	closeIssue,
	comment,
	createIncident,
	githubRequest,
	listComments,
	replaceStateLabels,
} from "../infrastructure/github/reconciler-github-adapter.js";

import {
	createIncidentOnce,
	releaseReservation,
	shouldPreserveStateOnApiError,
} from "./reconciliation-session-support.js";

import { reconcileJulesSession } from "./reconciliation-session-service.js";

export async function reconcileOpenTaskIssues(
	repository: string,
	taskIssues: GitHubIssue[],
	taskIndex: Map<string, TaskContract>,
	options: CliOptions,
	julesClient: JulesApiClient,
	result: ReconcileResult,
): Promise<void> {
	for (const issue of taskIssues) {
		if (issue.state !== "open") {
			continue;
		}

		const taskId = getTaskId(issue);

		if (!taskId || !TASK_ID_PATTERN.test(taskId)) {
			continue;
		}

		const labels = getLabels(issue);

		const age = ageMinutes(issue.updated_at);

		const comments = await listComments(repository, issue.number);

		const task = taskIndex.get(taskId);

		if (labels.has("state:running") || labels.has("state:dispatching")) {
			try {
				const handled = await reconcileJulesSession(
					repository,
					issue,
					taskId,
					task,
					comments,
					labels,
					options,
					julesClient,
					result,
				);

				if (handled) {
					continue;
				}
			} catch (error) {
				if (error instanceof JulesApiError) {
					result.summary.api_errors += 1;
					result.actions.push({
						issueNumber: issue.number,
						taskId,
						action:
							error.kind === "not_found"
								? "block-missing-jules-session"
								: "preserve-state-api-error",
						reason:
							error.kind === "not_found"
								? "Jules Session lookup returned 404."
								: `Jules API lookup failed: ${error.kind}.`,
						applied: error.kind === "not_found" && options.apply,
					});

					if (error.kind === "not_found") {
						result.summary.repaired += 1;
						result.summary.blocked += 1;

						await replaceStateLabels(
							repository,
							issue,
							"state:blocked",
							options,
						);

						if (
							await createIncidentOnce(
								repository,
								issue.number,
								`Missing Jules Session for ${taskId}`,
								`${taskId}-missing-jules-session`,
								[
									"## Jules Session 유실",
									"",
									"Jules API가 기존 Session marker에 대해 404를 반환했습니다.",
									"",
									"새 Session은 자동 생성하지 않습니다.",
								].join("\n"),
								[
									"# Missing Jules Session",
									"",
									`- TASK: \`${taskId}\``,
									`- Issue: #${issue.number}`,
									"- API result: 404",
								].join("\n"),
								comments,
								options,
							)
						) {
							result.summary.incidents += 1;
						}
					} else if (!shouldPreserveStateOnApiError(error)) {
						result.summary.unknown_states +=
							error.kind === "invalid_response" ? 1 : 0;
					}

					continue;
				}

				throw error;
			}
		}

		if (
			labels.has("state:dispatching") &&
			age >= options.staleDispatchingMinutes
		) {
			result.summary.stuck += 1;

			const hasSession = comments.some((entry) =>
				(entry.body ?? "").includes(DISPATCH_MARKER),
			);

			if (!hasSession) {
				const reservation = latestActiveReservation(
					taskId,
					issue.number,
					comments,
				);

				if (hasUnresolvedDispatchIntent(comments)) {
					result.summary.repaired += 1;
					result.summary.blocked += 1;
					result.summary.incidents += 1;

					result.actions.push({
						issueNumber: issue.number,
						taskId,
						action: "block-unresolved-dispatch-intent",
						reason:
							"Dispatch intent exists without a Session marker or explicit release.",
						applied: options.apply,
					});

					await replaceStateLabels(repository, issue, "state:blocked", options);

					await comment(
						repository,
						issue.number,
						[
							"<!-- juleswhile:reconciler-dispatch-unknown -->",
							"",
							"## Dispatch 결과 확인 필요",
							"",
							"Jules Session 생성 의도는 기록됐지만 Session 또는 명시적 해제 기록이 없습니다.",
							"",
							"중복 Jules Session 생성을 막기 위해 TASK를 BLOCKED로 전환했습니다.",
							"",
							`- Detected at: ${new Date().toISOString()}`,
						].join("\n"),
						options,
					);

					await createIncident(
						repository,
						`Unresolved Dispatch Intent for ${taskId}`,
						[
							"# Unresolved Dispatch Intent",
							"",
							`- TASK: \`${taskId}\``,
							`- Issue: #${issue.number}`,
							"",
							"A dispatch intent exists without a Jules Session marker or explicit release.",
							"Verify the Jules API state before retrying this TASK.",
						].join("\n"),
						options,
					);

					continue;
				}

				if (reservation) {
					await releaseReservation(
						repository,
						issue,
						taskId,
						reservation,
						options,
						"stale-dispatching-without-session",
					);
				}

				result.summary.repaired += 1;
				result.summary.retried += 1;

				result.actions.push({
					issueNumber: issue.number,
					taskId,
					action: "restore-ready",
					reason:
						"Dispatch reservation expired before a Jules Session marker was recorded.",
					applied: options.apply,
				});

				await replaceStateLabels(repository, issue, "state:ready", options);

				await comment(
					repository,
					issue.number,
					[
						"<!-- juleswhile:reconciler-retry -->",
						"",
						"## Reconciler 복구",
						"",
						"Dispatch 예약 이후 Jules Session 생성 기록이 없어 TASK를 READY로 복구했습니다.",
						"",
						`- Detected at: ${new Date().toISOString()}`,
					].join("\n"),
					options,
				);

				continue;
			}
		}

		if (
			labels.has("state:running") &&
			(age >= options.staleRunningMinutes ||
				age >= options.sessionTimeoutMinutes)
		) {
			result.summary.stuck += 1;

			result.actions.push({
				issueNumber: issue.number,
				taskId,
				action: "preserve-running-without-api-session",
				reason:
					"Running TASK exceeded the stale threshold but no Jules Session marker was available for API verification.",
				applied: false,
			});

			continue;
		}

		if (
			labels.has("state:validating") &&
			age >= options.staleValidatingMinutes
		) {
			result.summary.stuck += 1;

			const pullRequestNumber = findPullRequestNumber(issue, comments);

			if (!pullRequestNumber) {
				result.summary.repaired += 1;
				result.summary.blocked += 1;

				result.actions.push({
					issueNumber: issue.number,
					taskId,
					action: "block-missing-pr",
					reason: "A validating TASK has no traceable Pull Request.",
					applied: options.apply,
				});

				await replaceStateLabels(repository, issue, "state:blocked", options);

				continue;
			}

			const pullRequest = await githubRequest<GitHubPullRequest>(
				repository,
				`/pulls/${pullRequestNumber}`,
			);

			if (pullRequest.merged) {
				result.summary.repaired += 1;

				result.actions.push({
					issueNumber: issue.number,
					taskId,
					action: "complete-merged-task",
					reason: `Pull Request #${pullRequestNumber} is merged.`,
					applied: options.apply,
				});

				await replaceStateLabels(repository, issue, "state:completed", options);

				await closeIssue(repository, issue, options);

				continue;
			}

			if (pullRequest.state === "closed") {
				result.summary.repaired += 1;
				result.summary.blocked += 1;

				result.actions.push({
					issueNumber: issue.number,
					taskId,
					action: "block-closed-pr",
					reason: `Pull Request #${pullRequestNumber} was closed without merge.`,
					applied: options.apply,
				});

				await replaceStateLabels(repository, issue, "state:blocked", options);

				continue;
			}

			result.summary.incidents += 1;

			result.actions.push({
				issueNumber: issue.number,
				taskId,
				action: "report-stale-validation",
				reason: `Pull Request #${pullRequestNumber} remains open beyond the validation threshold.`,
				applied: options.apply,
			});

			await comment(
				repository,
				issue.number,
				[
					"<!-- juleswhile:stale-validation -->",
					"",
					"## 장기 VALIDATING 상태 감지",
					"",
					`Pull Request #${pullRequestNumber}가 검증 제한 시간을 초과했습니다.`,
					"",
					"Required Checks, Review, Merge Conflict와 CI 실행 상태를 확인하십시오.",
				].join("\n"),
				options,
			);
		}
	}
}
