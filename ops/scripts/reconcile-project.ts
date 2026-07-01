#!/usr/bin/env node

import process from "node:process";

import { runProjectReconciliation } from "../application/reconcile-project-runner.js";

runProjectReconciliation(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`프로젝트 상태 복구 실패: ${message}`);

	process.exitCode = 1;
});
