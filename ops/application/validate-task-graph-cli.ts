import { DEFAULT_TASK_INDEX } from "../domain/task-validation/task-validation-contract.js";

import type { CliOptions } from "../domain/task-validation/task-validation-contract.js";

import { fail } from "../domain/task-validation/task-validation-error.js";

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

export function parseArguments(argv: string[]): CliOptions {
	let mode: CliOptions["mode"] = "graph";

	let taskIndexPath = DEFAULT_TASK_INDEX;

	let taskId: string | undefined;
	let changeList: string | undefined;
	let baseSha: string | undefined;
	let headSha: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--mode": {
				const value = requireValue(argv, index, argument);

				if (value !== "graph" && value !== "pr-scope") {
					fail("mode는 graph 또는 pr-scope여야 합니다.");
				}

				mode = value;
				index += 1;
				break;
			}

			case "--task-index": {
				taskIndexPath = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--task-id": {
				taskId = requireValue(argv, index, argument).toUpperCase();

				index += 1;
				break;
			}

			case "--change-list": {
				changeList = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--base-sha": {
				baseSha = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--head-sha": {
				headSha = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			default: {
				fail(`지원하지 않는 옵션입니다: ${argument}`);
			}
		}
	}

	if (mode === "pr-scope") {
		if (!taskId) {
			fail("pr-scope 모드에는 --task-id가 필요합니다.");
		}

		if (!changeList) {
			fail("pr-scope 모드에는 --change-list가 필요합니다.");
		}
	}

	return {
		mode,
		taskIndexPath,
		taskId,
		changeList,
		baseSha,
		headSha,
	};
}
