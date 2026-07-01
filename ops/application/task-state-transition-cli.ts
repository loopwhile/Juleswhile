import process from "node:process";

import type {
	TransitionMode,
	TransitionOptions,
} from "../domain/task-state-transition/task-state-transition-contract.js";

import { fail } from "../domain/task-state-transition/task-state-transition-error.js";

export function requireValue(
	argv: string[],
	index: number,
	flag: string,
): string {
	const value = argv[index + 1];

	if (value === undefined || value.startsWith("--")) {
		fail(`${flag} 옵션에 값이 필요합니다.`);
	}

	return value;
}

export function parseIssueNumber(value: string): number {
	if (!/^[0-9]+$/.test(value)) {
		fail("issue-number는 양의 정수여야 합니다.");
	}

	const parsed = Number(value);

	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		fail("issue-number는 양의 정수여야 합니다.");
	}

	return parsed;
}

export function parseArguments(argv: string[]): TransitionOptions {
	let mode = "";
	let issueNumber = 0;
	let taskId = "";
	let mergeSha = "";
	let responseFile = "";
	let prNumber = "";
	let deployId = "";
	let deployUrl = "";
	let deployState = "";
	let workflowUrl = "";
	let dryRun = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--mode":
				mode = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--issue-number":
				issueNumber = parseIssueNumber(requireValue(argv, index, argument));
				index += 1;
				break;

			case "--task-id":
				taskId = requireValue(argv, index, argument).toUpperCase();
				index += 1;
				break;

			case "--merge-sha":
				mergeSha = requireValue(argv, index, argument).toLowerCase();
				index += 1;
				break;

			case "--response-file":
				responseFile = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--pr-number":
				prNumber = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--deploy-id":
				deployId = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--deploy-url":
				deployUrl = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--deploy-state":
				deployState = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--workflow-url":
				workflowUrl = requireValue(argv, index, argument);
				index += 1;
				break;

			case "--dry-run":
				dryRun = true;
				break;

			default:
				fail(`지원하지 않는 옵션입니다: ${argument}`);
		}
	}

	if (
		!["deploying", "completed", "failed", "verification-disabled"].includes(
			mode,
		)
	) {
		fail("mode가 올바르지 않습니다.");
	}

	if (issueNumber === 0) {
		fail("issue-number가 필요합니다.");
	}

	if (!/^(TASK-[0-9]{3,}|CORRECTION-[A-Z0-9-]+)$/.test(taskId)) {
		fail(`TASK ID 형식이 올바르지 않습니다: ${taskId}`);
	}

	if (!/^[0-9a-f]{7,40}$/.test(mergeSha)) {
		fail("merge-sha가 올바르지 않습니다.");
	}

	if (responseFile.trim() === "") {
		fail("response-file이 필요합니다.");
	}

	return {
		mode: mode as TransitionMode,
		issueNumber,
		taskId,
		mergeSha,
		responseFile,
		prNumber,
		deployId,
		deployUrl,
		deployState,
		workflowUrl,
		dryRun,
	};
}

export function getRepository(): string {
	const repository =
		process.env.REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? "";

	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
		fail("REPOSITORY 또는 GITHUB_REPOSITORY가 필요합니다.");
	}

	return repository;
}

export function getToken(): string {
	const token = process.env.GH_TOKEN ?? "";

	if (token === "") {
		fail("GH_TOKEN이 필요합니다.");
	}

	return token;
}
