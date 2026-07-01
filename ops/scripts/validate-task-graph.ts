#!/usr/bin/env node

import process from "node:process";

import { runTaskValidation } from "../application/validate-task-graph-service.js";

runTaskValidation(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`TASK 검증 실패: ${message}`);

	process.exitCode = 1;
});
