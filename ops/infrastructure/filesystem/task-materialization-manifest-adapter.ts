import { loadTaskManifest } from "../../scripts/task-manifest.js";

import { TASK_INDEX_PATH } from "../../domain/task-materialization/task-materialization-contract.js";

import type { TaskIndex } from "../../domain/task-materialization/task-materialization-contract.js";

import { fail } from "../../domain/task-materialization/task-materialization-error.js";

export async function readTaskIndex(): Promise<TaskIndex> {
	const parsed = (await loadTaskManifest(
		TASK_INDEX_PATH,
	)) as unknown as TaskIndex;

	if (!Array.isArray(parsed.tasks)) {
		fail(`${TASK_INDEX_PATH}에 tasks 배열이 없습니다.`);
	}

	return parsed;
}
