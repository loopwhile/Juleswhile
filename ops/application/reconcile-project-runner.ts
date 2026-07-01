import { promises as fs } from "node:fs";

import path from "node:path";

import process from "node:process";

import { JulesApiClient } from "../scripts/jules-api.js";

import { loadTaskManifest } from "../scripts/task-manifest.js";

import type {
	ReconcileResult,
	TaskContract,
	TaskIndex,
} from "../domain/reconciliation/reconciliation-contract.js";

import { fail, getRepository, parseArguments } from "./reconciliation-cli.js";

import { getTaskId } from "./reconciliation-evidence.js";

import {
	ensureLabels,
	listIssues,
} from "../infrastructure/github/reconciler-github-adapter.js";

import {
	groupTaskIssues,
	reconcileDuplicateTaskIssues,
} from "./reconciliation-duplicate-service.js";

import { reconcileOpenTaskIssues } from "./reconciliation-task-service.js";

import { shouldScheduleNextTask } from "./reconciliation-scheduling.js";

export async function readTaskIndex(
	filePath: string,
): Promise<Map<string, TaskContract>> {
	const parsed = (await loadTaskManifest(filePath)) as unknown as TaskIndex;

	if (!Array.isArray(parsed.tasks)) {
		fail(`${filePath}에 tasks 배열이 없습니다.`);
	}

	return new Map(parsed.tasks.map((task) => [task.id, task]));
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

export async function runProjectReconciliation(argv: string[]): Promise<void> {
	const options = parseArguments(argv);

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

	const groups = groupTaskIssues(taskIssues);

	result.summary.scanned = groups.size;

	await reconcileDuplicateTaskIssues(repository, groups, options, result);

	await reconcileOpenTaskIssues(
		repository,
		taskIssues,
		taskIndex,
		options,
		julesClient,
		result,
	);

	result.shouldScheduleNext = shouldScheduleNextTask(taskIssues);

	await writeJsonAtomic(options.responseFile, result);

	console.log(
		`Reconciler 완료: scanned=${result.summary.scanned}, repaired=${result.summary.repaired}`,
	);
}
