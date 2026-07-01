import type {
	GitHubIssue,
	TaskIndex,
} from "./task-materialization-contract.js";

import { getTaskId } from "./task-issue-identity-policy.js";

export function nextTaskId(
	taskIndex: TaskIndex,
	issues: GitHubIssue[],
): string {
	const numbers: number[] = [];

	for (const task of taskIndex.tasks) {
		numbers.push(Number(task.id.replace("TASK-", "")));
	}

	for (const issue of issues) {
		const taskId = getTaskId(issue);

		if (taskId) {
			numbers.push(Number(taskId.replace("TASK-", "")));
		}
	}

	const nextNumber = Math.max(999, ...numbers) + 1;

	return `TASK-${String(nextNumber).padStart(3, "0")}`;
}

export function replacePlaceholders(
	value: unknown,
	replacements: Record<string, string>,
): unknown {
	if (typeof value === "string") {
		let output = value;

		for (const [key, replacement] of Object.entries(replacements)) {
			output = output.replaceAll(`{{${key}}}`, replacement);
		}

		return output;
	}

	if (Array.isArray(value)) {
		return value.map((item) => replacePlaceholders(item, replacements));
	}

	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				replacePlaceholders(item, replacements),
			]),
		);
	}

	return value;
}
