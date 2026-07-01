import { promises as fs } from "node:fs";

import path from "node:path";

import { loadTaskManifest } from "../../scripts/task-manifest.js";

import { DEFAULT_PROJECT_STATE } from "../../domain/task-validation/task-validation-contract.js";

import type {
	ProjectState,
	TaskIndex,
} from "../../domain/task-validation/task-validation-contract.js";

import { fail } from "../../domain/task-validation/task-validation-error.js";

export async function readTaskIndex(filePath: string): Promise<TaskIndex> {
	const parsed = (await loadTaskManifest(filePath)) as unknown as TaskIndex;

	if (!Array.isArray(parsed.tasks)) {
		fail(`${filePath}에 tasks 배열이 없습니다.`);
	}

	return parsed;
}

export async function readProjectState(): Promise<ProjectState> {
	const content = await fs.readFile(DEFAULT_PROJECT_STATE, "utf8");

	const parsed = JSON.parse(content) as ProjectState;

	if (!parsed.taskSummary || typeof parsed.taskSummary !== "object") {
		fail(`${DEFAULT_PROJECT_STATE}에 taskSummary가 없습니다.`);
	}

	return parsed;
}

export async function roleFileExists(role: string): Promise<boolean> {
	try {
		await fs.access(path.join("ops", "roles", `${role}.md`));

		return true;
	} catch {
		return false;
	}
}

export async function readChangeList(filePath: string): Promise<string> {
	return fs.readFile(filePath, "utf8");
}
