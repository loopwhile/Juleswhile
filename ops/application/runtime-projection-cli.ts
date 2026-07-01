import process from "node:process";

export interface CliOptions {
	responseFile: string;
	taskIndexPath: string;
	projectStatePath: string;
	dryRun: boolean;
	apply: boolean;
}

const DEFAULT_TASK_INDEX = "ops/tasks/task-index.yaml";

const DEFAULT_PROJECT_STATE = "ops/state/project-state.json";

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

export function parseArguments(argv: string[]): CliOptions {
	let responseFile = process.env.RESPONSE_FILE ?? "";

	let taskIndexPath = DEFAULT_TASK_INDEX;

	let projectStatePath = DEFAULT_PROJECT_STATE;

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

			case "--project-state": {
				projectStatePath = requireValue(argv, index, argument);

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
		projectStatePath,
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
