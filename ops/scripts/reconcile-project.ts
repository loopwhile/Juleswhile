#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
	JulesApiClient,
	JulesApiError,
	type JulesSession,
} from "./jules-api.js";
import { loadTaskManifest } from "./task-manifest.js";

import {
	fail,
	getRepository,
	parseArguments,
} from "../application/reconciliation-cli.js";
import {
	ageMinutes,
	correctionAttempts,
	extractPullRequestUrls,
	findPullRequestNumber,
	formatUtcDate,
	getLabels,
	getTaskId,
	hasAnyLabel,
	hasCommentMarker,
	hasUnresolvedDispatchIntent,
	incidentMarker,
	latestActiveReservation,
	latestDispatchIntent,
	parseSessionMarkers,
	pullRequestNumberFromUrl,
	sessionMatchesRepository,
	sessionTitle,
} from "../application/reconciliation-evidence.js";
import type {
	CliOptions,
	DispatchIntent,
	GitHubComment,
	GitHubIssue,
	GitHubPullRequest,
	ReconcileResult,
	RuntimeReservation,
	TaskContract,
	TaskIndex,
} from "../domain/reconciliation/reconciliation-contract.js";
import {
	ACTIVE_JULES_STATES,
	ACTIVE_LABELS,
	DISPATCH_INTENT_MARKER,
	DISPATCH_MARKER,
	DISPATCH_OUTCOME_MARKER,
	HUMAN_INTERVENTION_JULES_STATES,
	QUOTA_LEDGER_MARKER,
	SESSION_RECONCILIATION_MARKER,
	TASK_ID_PATTERN,
	TRANSIENT_API_ERROR_KINDS,
} from "../domain/reconciliation/reconciliation-policy.js";
import {
	closeIssue,
	comment,
	createIncident,
	ensureLabels,
	getPullRequest,
	githubRequest,
	listComments,
	listIssues,
	replaceStateLabels,
} from "../infrastructure/github/reconciler-github-adapter.js";

async function readTaskIndex(
	filePath: string,
): Promise<Map<string, TaskContract>> {
	const parsed = (await loadTaskManifest(filePath)) as unknown as TaskIndex;

	if (!Array.isArray(parsed.tasks)) {
		fail(`${filePath}에 tasks 배열이 없습니다.`);
	}

	return new Map(parsed.tasks.map((task) => [task.id, task]));
}

function shouldPreserveStateOnApiError(error: JulesApiError): boolean {
	return TRANSIENT_API_ERROR_KINDS.has(error.kind);
}

async function releaseReservation(
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

async function createIncidentOnce(
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

async function writeJsonAtomic(
	filePath: string,
	value: unknown,
): Promise<void> {
	const absolutePath = path.resolve(filePath);

	await fs.mkdir(path.dirname(absolutePath), {
		recursive: true,
	});

	const temporaryPath = `${absolutePath}.${process.pid}.tmp`;

	await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});

	await fs.rename(temporaryPath, absolutePath);
}

async function recordSessionReconciliation(
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

async function recoverSessionFromCandidates(
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

async function reconcileJulesSession(
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

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));

	const repository = getRepository();

	const taskIndex = await readTaskIndex(options.taskIndexPath);
	const julesClient = new JulesApiClient();

	await ensureLabels(repository, options);

	const issues = await listIssues(repository);

	const taskIssues = issues.filter((issue) => getTaskId(issue) !== null);

	const result: ReconcileResult = {
		dryRun: options.dryRun,
		shouldScheduleNext: false,
		summary: {
			scanned: taskIssues.length,
			repaired: 0,
			stuck: 0,
			blocked: 0,
			retried: 0,
			incidents: 0,
			sessions_checked: 0,
			sessions_recovered: 0,
			api_errors: 0,
			unknown_states: 0,
		},
		actions: [],
		completedAt: new Date().toISOString(),
	};

	const groups = new Map<string, GitHubIssue[]>();

	for (const issue of taskIssues) {
		const taskId = getTaskId(issue) as string;

		const group = groups.get(taskId) ?? [];

		group.push(issue);

		groups.set(taskId, group);
	}

	result.summary.scanned = groups.size;

	for (const [taskId, group] of groups) {
		if (group.length <= 1) {
			continue;
		}

		const ordered = [...group].sort(
			(left, right) => left.number - right.number,
		);

		const canonical = ordered[0];

		for (const duplicate of ordered.slice(1)) {
			if (duplicate.state !== "open") {
				continue;
			}

			result.summary.incidents += 1;
			result.summary.blocked += 1;

			result.actions.push({
				issueNumber: duplicate.number,
				taskId,
				action: "block-duplicate",
				reason: `Duplicate TASK Issue. Canonical Issue is #${canonical.number}.`,
				applied: options.apply,
			});

			await replaceStateLabels(repository, duplicate, "state:blocked", options);

			await comment(
				repository,
				duplicate.number,
				[
					"<!-- juleswhile:duplicate-task -->",
					"",
					"## 중복 TASK Issue 차단",
					"",
					`\`${taskId}\`의 기준 Issue는 #${canonical.number}입니다.`,
					"",
					"이 Issue에서는 Jules Session을 생성하지 마십시오.",
				].join("\n"),
				options,
			);
		}

		await createIncident(
			repository,
			`Duplicate TASK Issue detected for ${taskId}`,
			[
				"# Duplicate TASK Issue",
				"",
				`- TASK: \`${taskId}\``,
				`- Canonical Issue: #${canonical.number}`,
				`- Duplicate Issues: ${ordered
					.slice(1)
					.map((issue) => `#${issue.number}`)
					.join(", ")}`,
				"",
				"Dispatcher idempotency와 Issue materialization 상태를 확인하십시오.",
			].join("\n"),
			options,
		);
	}

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

	result.shouldScheduleNext = !hasActiveTask && hasReadyTask;

	await writeJsonAtomic(options.responseFile, result);

	console.log(
		`Reconciler 완료: scanned=${result.summary.scanned}, repaired=${result.summary.repaired}`,
	);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`프로젝트 상태 복구 실패: ${message}`);

	process.exitCode = 1;
});
