#!/usr/bin/env node

import process from "node:process";

import { runMaterializeIssues } from "../application/materialize-issues-service.js";

runMaterializeIssues(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`TASK Issue 실체화 실패: ${message}`);

	process.exitCode = 1;
});
