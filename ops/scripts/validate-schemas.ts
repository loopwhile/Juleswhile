#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

import addFormatsImport from "ajv-formats";
import Ajv2020Import from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

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

async function main(): Promise<void> {
	const goalSchemaPath = "ops/schemas/project-goal.schema.json";

	const taskSchemaPath = "ops/schemas/task.schema.json";

	const stateSchemaPath = "ops/schemas/project-state.schema.json";

	const [goalSchema, taskSchema, stateSchema, taskIndexYaml, projectStateJson] =
		await Promise.all([
			readJson(goalSchemaPath),
			readJson(taskSchemaPath),
			readJson(stateSchemaPath),
			readFile("ops/tasks/task-index.yaml", "utf8"),
			readFile("ops/state/project-state.json", "utf8"),
		]);

	const taskIndex = parseYaml(taskIndexYaml) as unknown;

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
