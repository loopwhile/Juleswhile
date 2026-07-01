import process from "node:process";

import type { CliOptions } from "../domain/reconciliation/reconciliation-contract.js";

const TASK_INDEX_PATH = "ops/tasks/task-index.yaml";

export function fail(message: string): never {
	throw new Error(message);
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];

	if (value === undefined || value.startsWith("--")) {
		fail(`${flag} 옵션에 값이 필요합니다.`);
	}

	return value;
}

function parseInteger(
	value: string,
	field: string,
	minimum: number,
	maximum: number,
): number {
	if (!/^[0-9]+$/.test(value)) {
		fail(`${field}는 정수여야 합니다.`);
	}

	const parsed = Number(value);

	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		fail(`${field}는 ${minimum}~${maximum} 범위여야 합니다.`);
	}

	return parsed;
}

export function parseArguments(argv: string[]): CliOptions {
	let responseFile = process.env.RESPONSE_FILE ?? "";

	let taskIndexPath = TASK_INDEX_PATH;

	let staleDispatchingMinutes = 20;
	let staleRunningMinutes = 180;
	let staleValidatingMinutes = 60;
	let sessionTimeoutMinutes = 240;
	let maxCorrections = 2;
	let dryRun = false;
	let apply = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--response-file": {
				responseFile = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--task-index": {
				taskIndexPath = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--stale-dispatching-minutes": {
				staleDispatchingMinutes = parseInteger(
					requireValue(argv, index, argument),
					"stale-dispatching-minutes",
					5,
					1440,
				);

				index += 1;
				break;
			}

			case "--stale-running-minutes": {
				staleRunningMinutes = parseInteger(
					requireValue(argv, index, argument),
					"stale-running-minutes",
					10,
					2880,
				);

				index += 1;
				break;
			}

			case "--stale-validating-minutes": {
				staleValidatingMinutes = parseInteger(
					requireValue(argv, index, argument),
					"stale-validating-minutes",
					5,
					1440,
				);

				index += 1;
				break;
			}

			case "--session-timeout-minutes": {
				sessionTimeoutMinutes = parseInteger(
					requireValue(argv, index, argument),
					"session-timeout-minutes",
					15,
					2880,
				);

				index += 1;
				break;
			}

			case "--max-corrections": {
				maxCorrections = parseInteger(
					requireValue(argv, index, argument),
					"max-corrections",
					0,
					10,
				);

				index += 1;
				break;
			}

			case "--dry-run": {
				dryRun = true;
				break;
			}

			case "--apply": {
				apply = true;
				break;
			}

			default: {
				fail(`지원하지 않는 옵션입니다: ${argument}`);
			}
		}
	}

	if (responseFile.trim() === "") {
		fail("--response-file이 필요합니다.");
	}

	if (dryRun === apply) {
		fail("--dry-run 또는 --apply 중 하나만 지정해야 합니다.");
	}

	return {
		responseFile,
		taskIndexPath,
		staleDispatchingMinutes,
		staleRunningMinutes,
		staleValidatingMinutes,
		sessionTimeoutMinutes,
		maxCorrections,
		dryRun,
		apply,
	};
}

export function getRepository(): string {
	const repository =
		process.env.REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? "";

	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
		fail(
			"REPOSITORY 또는 GITHUB_REPOSITORY가 owner/repository 형식이어야 합니다.",
		);
	}

	return repository;
}
