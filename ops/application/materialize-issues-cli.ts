import process from "node:process";

import { TASK_ID_PATTERN } from "../domain/task-materialization/task-materialization-contract.js";

import type { CliOptions } from "../domain/task-materialization/task-materialization-contract.js";

import { fail } from "../domain/task-materialization/task-materialization-error.js";

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
	let mode: CliOptions["mode"] | undefined;
	let responseFile = process.env.RESPONSE_FILE ?? "";
	let dryRun = false;
	let force = false;
	let templateId: string | undefined;
	let instanceKey: string | undefined;
	let contentType: string | undefined;
	let topic: string | undefined;
	let periodKey: string | undefined;
	let timezone: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--mode": {
				const value = requireValue(argv, index, argument);

				if (value !== "sync" && value !== "instantiate") {
					fail("mode는 sync 또는 instantiate여야 합니다.");
				}

				mode = value;
				index += 1;
				break;
			}

			case "--response-file": {
				responseFile = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--template-id": {
				templateId = requireValue(argv, index, argument).toUpperCase();

				index += 1;
				break;
			}

			case "--instance-key": {
				instanceKey = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--content-type": {
				contentType = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--topic": {
				topic = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--period-key": {
				periodKey = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--timezone": {
				timezone = requireValue(argv, index, argument);

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

	if (!mode) {
		fail("--mode가 필요합니다.");
	}

	if (responseFile.trim() === "") {
		fail("--response-file이 필요합니다.");
	}

	if (mode === "instantiate") {
		if (!templateId || !TASK_ID_PATTERN.test(templateId)) {
			fail("instantiate 모드에는 TASK-000 형식의 --template-id가 필요합니다.");
		}

		if (!instanceKey?.trim()) {
			fail("instantiate 모드에는 --instance-key가 필요합니다.");
		}

		if (!contentType?.trim()) {
			fail("instantiate 모드에는 --content-type이 필요합니다.");
		}

		if (!topic?.trim()) {
			fail("instantiate 모드에는 --topic이 필요합니다.");
		}

		if (!periodKey?.trim()) {
			fail("instantiate 모드에는 --period-key가 필요합니다.");
		}

		if (!timezone?.trim()) {
			fail("instantiate 모드에는 --timezone이 필요합니다.");
		}
	}

	return {
		mode,
		responseFile,
		dryRun,
		force,
		templateId,
		instanceKey,
		contentType,
		topic,
		periodKey,
		timezone,
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
