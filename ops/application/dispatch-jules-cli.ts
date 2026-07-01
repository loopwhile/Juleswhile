import process from "node:process";

import {
	REPOSITORY_PATTERN,
	TASK_ID_PATTERN,
} from "../domain/task-dispatch/task-dispatch-contract.js";

import type { CliOptions } from "../domain/task-dispatch/task-dispatch-contract.js";

import { fail } from "../domain/task-dispatch/task-dispatch-error.js";

export function parsePositiveInteger(value: string, field: string): number {
	if (!/^[0-9]+$/.test(value)) {
		fail(`${field}는 양의 정수여야 합니다.`);
	}

	const parsed = Number(value);

	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		fail(`${field}가 안전한 양의 정수 범위를 벗어났습니다.`);
	}

	return parsed;
}

export function requireArgumentValue(
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

export function parseArguments(argv: string[]): CliOptions {
	let taskId = "";
	let repository =
		process.env.REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? "";
	let responseFile = process.env.RESPONSE_FILE ?? "";
	let issueNumber: number | undefined;
	let dryRun = false;
	let force = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--task-id": {
				taskId = requireArgumentValue(argv, index, argument).toUpperCase();

				index += 1;
				break;
			}

			case "--repository": {
				repository = requireArgumentValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--response-file": {
				responseFile = requireArgumentValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--issue-number": {
				issueNumber = parsePositiveInteger(
					requireArgumentValue(argv, index, argument),
					"issue-number",
				);

				index += 1;
				break;
			}

			case "--dry-run": {
				dryRun = true;
				break;
			}

			case "--force": {
				force = true;
				break;
			}

			default: {
				fail(`지원하지 않는 옵션입니다: ${argument}`);
			}
		}
	}

	if (!TASK_ID_PATTERN.test(taskId)) {
		fail("TASK ID는 TASK-000 이상의 형식이어야 합니다.");
	}

	if (!REPOSITORY_PATTERN.test(repository)) {
		fail("repository는 owner/repository 형식이어야 합니다.");
	}

	if (responseFile.trim() === "") {
		fail("--response-file 경로가 필요합니다.");
	}

	return {
		taskId,
		repository,
		responseFile,
		issueNumber,
		dryRun,
		force,
	};
}
