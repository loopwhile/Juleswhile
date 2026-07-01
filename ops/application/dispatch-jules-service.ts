import process from "node:process";

import { loadTaskManifest } from "../scripts/task-manifest.js";

import {
	assertLiveDispatchContext,
	parseCommittedSessionEvidence,
} from "../scripts/session-dispatch-atomicity.js";

import { TASK_INDEX_PATH } from "../domain/task-dispatch/task-dispatch-contract.js";

import type {
	ExistingSession,
	GitHubComment,
	GitHubIssue,
	RuntimeReservation,
	TaskIndex,
} from "../domain/task-dispatch/task-dispatch-contract.js";

import { fail } from "../domain/task-dispatch/task-dispatch-error.js";

import {
	getPromptFilePath,
	getRoleFilePath,
	getTask,
	validateIssueForDispatch,
	validateTaskContract,
} from "../domain/task-dispatch/task-dispatch-task-policy.js";

import {
	hasBlockingDispatchIntent,
	parseExistingSession,
} from "../domain/task-dispatch/task-dispatch-evidence-policy.js";

import { parseArguments } from "./dispatch-jules-cli.js";

import {
	buildPrompt,
	buildRequest,
	getJulesSourceName,
} from "./task-dispatch-prompt.js";

import {
	ensureReservation,
	recordCanonicalSession,
	recordDispatchIntent,
	recordQuotaOutcome,
} from "./task-dispatch-quota-service.js";

import { createResult } from "./task-dispatch-result.js";

import { pathExists } from "../infrastructure/filesystem/task-dispatch-filesystem-adapter.js";

import { writeJsonAtomic } from "../infrastructure/filesystem/json-output.js";

import {
	getIssueComments,
	getTrackingIssue,
} from "../infrastructure/github/task-dispatch-github-adapter.js";

import {
	JulesSessionCreationError,
	createJulesSession,
} from "../infrastructure/jules/jules-session-adapter.js";

export async function readTaskIndex(): Promise<TaskIndex> {
	const parsed = (await loadTaskManifest(
		TASK_INDEX_PATH,
	)) as unknown as Partial<TaskIndex>;

	if (!Array.isArray(parsed.tasks)) {
		fail(`${TASK_INDEX_PATH}에 tasks 배열이 없습니다.`);
	}

	return parsed as TaskIndex;
}

export async function runDispatchJules(argv: string[]): Promise<void> {
	const options = parseArguments(argv);

	const taskIndex = await readTaskIndex();

	const task = getTask(taskIndex, options.taskId);

	validateTaskContract(task, options.force);

	assertLiveDispatchContext({
		dryRun: options.dryRun,
		issueNumber: options.issueNumber,
		githubActions: process.env.GITHUB_ACTIONS,
		workflowName: process.env.JULES_DISPATCH_WORKFLOW,
		workflowRef: process.env.GITHUB_WORKFLOW_REF,
		runId: process.env.GITHUB_RUN_ID,
	});

	const roleFile = getRoleFilePath(task.role);

	const promptFile = getPromptFilePath(task);

	if (!(await pathExists(roleFile))) {
		fail(`역할 계약 파일이 없습니다: ${roleFile}`);
	}

	if (!(await pathExists(promptFile))) {
		fail(`실행 프롬프트 파일이 없습니다: ${promptFile}`);
	}

	let issue: GitHubIssue | null = null;
	let existingSession: ExistingSession | null = null;
	let comments: GitHubComment[] = [];

	if (options.issueNumber !== undefined) {
		issue = await getTrackingIssue(options.repository, options.issueNumber);

		validateIssueForDispatch(task, issue, options.dryRun, options.force);

		comments = await getIssueComments(options.repository, options.issueNumber);

		existingSession = parseExistingSession(comments);

		const committedEvidence = parseCommittedSessionEvidence(comments);

		if (existingSession === null && committedEvidence !== null) {
			if (!options.dryRun) {
				await recordCanonicalSession(
					options.repository,
					task,
					options.issueNumber,
					{
						key: committedEvidence.reservationKey,
						category: committedEvidence.category,
					},
					committedEvidence.session,
					comments,
				);
			}

			existingSession = committedEvidence.session;
		}

		if (
			!options.dryRun &&
			existingSession === null &&
			hasBlockingDispatchIntent(comments)
		) {
			fail(
				"이전 Dispatch Intent가 Session 또는 명시적 해제 없이 남아 있습니다. " +
					"force 옵션과 관계없이 중복 Jules Session 생성을 차단합니다.",
			);
		}
	}

	const sourceName = options.dryRun
		? (process.env.JULES_SOURCE_NAME ?? "sources/dry-run")
		: getJulesSourceName();

	if (existingSession !== null && !options.dryRun) {
		const duplicateResult = createResult(
			options,
			task,
			sourceName,
			roleFile,
			promptFile,
			existingSession,
			{
				dispatched: true,
				dryRun: false,
				duplicate: true,
				reusedExistingSession: true,
				reason:
					"Existing canonical or committed Jules Session evidence was found. No new Session was created.",
			},
		);

		await writeJsonAtomic(options.responseFile, duplicateResult);

		console.log(`${task.id}: 기존 Jules Session을 재사용합니다.`);

		return;
	}

	const prompt = buildPrompt(
		task,
		options.repository,
		issue,
		roleFile,
		promptFile,
	);

	const request = buildRequest(task, prompt, sourceName);

	if (options.dryRun) {
		const dryRunResult = createResult(
			options,
			task,
			sourceName,
			roleFile,
			promptFile,
			{
				name: "",
				id: "",
				url: "",
				state: "NOT_CREATED",
			},
			{
				dispatched: false,
				dryRun: true,
				duplicate: false,
				reusedExistingSession: false,
				reason:
					"TASK contract and Jules request were validated. The Jules API was not called.",
			},
		);

		await writeJsonAtomic(options.responseFile, dryRunResult);

		console.log(`${task.id}: Jules Dispatch Dry Run을 통과했습니다.`);

		return;
	}

	let reservation: RuntimeReservation | null = null;

	if (issue !== null && options.issueNumber !== undefined) {
		reservation = await ensureReservation(
			options.repository,
			task,
			options.issueNumber,
			comments,
		);

		await recordDispatchIntent(
			options.repository,
			task,
			options.issueNumber,
			reservation,
		);
	}

	let session: ExistingSession;

	try {
		session = await createJulesSession(request);
	} catch (error) {
		if (reservation !== null && options.issueNumber !== undefined) {
			const outcome =
				error instanceof JulesSessionCreationError && error.outcome === "failed"
					? "released"
					: "invalidated";

			const reason = error instanceof Error ? error.message : String(error);

			await recordQuotaOutcome(
				options.repository,
				task,
				options.issueNumber,
				reservation,
				{
					status: outcome,
					reason: reason.slice(0, 500),
				},
			);
		}

		throw error;
	}

	if (reservation !== null && options.issueNumber !== undefined) {
		await recordQuotaOutcome(
			options.repository,
			task,
			options.issueNumber,
			reservation,
			{
				status: "committed",
				session,
			},
		);

		await recordCanonicalSession(
			options.repository,
			task,
			options.issueNumber,
			reservation,
			session,
			comments,
		);
	}

	const result = createResult(
		options,
		task,
		sourceName,
		roleFile,
		promptFile,
		session,
		{
			dispatched: true,
			dryRun: false,
			duplicate: false,
			reusedExistingSession: false,
			reason: "A new Jules Session was created successfully.",
		},
	);

	await writeJsonAtomic(options.responseFile, result);

	console.log(`${task.id}: Jules Session 생성 완료 (${session.name})`);
}
