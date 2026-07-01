import { getRepository, parseArguments } from "./materialize-issues-cli.js";

import { instantiateTask } from "./instantiate-task-issue.js";

import { syncIssues } from "./synchronize-task-issues.js";

import { writeJsonAtomic } from "../infrastructure/filesystem/json-output.js";

import { readTaskIndex } from "../infrastructure/filesystem/task-materialization-manifest-adapter.js";

import {
	ensureBaseLabels,
	listIssues,
} from "../infrastructure/github/task-materialization-github-adapter.js";

export async function runMaterializeIssues(argv: string[]): Promise<void> {
	const options = parseArguments(argv);

	const repository = getRepository();

	const [taskIndex, issues] = await Promise.all([
		readTaskIndex(),
		listIssues(repository),
	]);

	if (!options.dryRun) {
		await ensureBaseLabels(repository);
	}

	const result =
		options.mode === "sync"
			? await syncIssues(repository, taskIndex, issues, options)
			: await instantiateTask(repository, taskIndex, issues, options);

	await writeJsonAtomic(options.responseFile, result);

	console.log(
		options.mode === "sync"
			? "TASK Issue 동기화를 완료했습니다."
			: "반복 TASK 제안 처리를 완료했습니다.",
	);
}
