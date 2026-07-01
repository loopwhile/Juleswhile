#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

import addFormatsImport from "ajv-formats";
import Ajv2020Import from "ajv/dist/2020.js";

import { loadTaskManifest } from "./task-manifest.js";

type JsonObject = Record<string, unknown>;

const Ajv2020 = ("default" in Ajv2020Import
	? Ajv2020Import.default
	: Ajv2020Import) as unknown as typeof import("ajv/dist/2020.js").default;

const addFormats = ("default" in addFormatsImport
	? addFormatsImport.default
	: addFormatsImport) as unknown as typeof import("ajv-formats").default;

async function readJson(filePath: string): Promise<JsonObject> {
	const content = await readFile(filePath, "utf8");

	return JSON.parse(content) as JsonObject;
}

function getSchemaId(schema: JsonObject, filePath: string): string {
	const schemaId = schema.$id;

	if (typeof schemaId !== "string" || schemaId.trim() === "") {
		throw new Error(`${filePath}에 유효한 $id가 없습니다.`);
	}

	return schemaId;
}

function fail(message: string): never {
	throw new Error(message);
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];

	if (value === undefined || value.startsWith("--")) {
		fail(`${flag} 옵션에 값이 필요합니다.`);
	}

	return value;
}

async function main(): Promise<void> {
	let goalSchemaPath = "ops/schemas/project-goal.schema.json";
	let taskSchemaPath = "ops/schemas/task.schema.json";
	let stateSchemaPath = "ops/schemas/project-state.schema.json";
	let taskIndexPath = "ops/tasks/task-index.yaml";
	let projectStatePath = "ops/state/project-state.json";

	const argv = process.argv.slice(2);

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--goal-schema":
				goalSchemaPath = requireValue(argv, index, argument);
				index += 1;
				break;
			case "--task-schema":
				taskSchemaPath = requireValue(argv, index, argument);
				index += 1;
				break;
			case "--state-schema":
				stateSchemaPath = requireValue(argv, index, argument);
				index += 1;
				break;
			case "--task-index":
				taskIndexPath = requireValue(argv, index, argument);
				index += 1;
				break;
			case "--project-state":
				projectStatePath = requireValue(argv, index, argument);
				index += 1;
				break;
			default:
				fail(`지원하지 않는 옵션입니다: ${argument}`);
		}
	}

	const [goalSchema, taskSchema, stateSchema, taskIndex, projectStateJson] =
		await Promise.all([
			readJson(goalSchemaPath),
			readJson(taskSchemaPath),
			readJson(stateSchemaPath),
			loadTaskManifest(taskIndexPath),
			readFile(projectStatePath, "utf8"),
		]);

	const projectState = JSON.parse(projectStateJson) as unknown;

	const ajv = new Ajv2020({
		allErrors: true,
		strict: true,
		allowUnionTypes: true,
	});

	addFormats(ajv);

	/*
	 * project-state.schema.json이
	 * project-goal.schema.json을 외부 $ref로 참조하므로
	 * 모든 Schema를 먼저 등록한다.
	 */
	ajv.addSchema(goalSchema);
	ajv.addSchema(taskSchema);
	ajv.addSchema(stateSchema);

	const checks = [
		{
			name: "task-index",
			schemaId: getSchemaId(taskSchema, taskSchemaPath),
			data: taskIndex,
		},
		{
			name: "project-state",
			schemaId: getSchemaId(stateSchema, stateSchemaPath),
			data: projectState,
		},
	];

	let failed = false;

	for (const check of checks) {
		const valid = ajv.validate(check.schemaId, check.data);

		if (valid) {
			console.log(`PASS: ${check.name}`);

			continue;
		}

		failed = true;

		console.error(`FAIL: ${check.name}`);

		console.error(
			ajv.errorsText(ajv.errors, {
				separator: "\n",
			}),
		);
	}

	if (failed) {
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`Schema 검증 실패: ${message}`);

	process.exitCode = 1;
});
