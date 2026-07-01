#!/usr/bin/env node

import process from "node:process";

import { runRuntimeProjection } from "../application/runtime-projection-rebuilder.js";

runRuntimeProjection(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`Runtime State Projection 실패: ${message}`);

	process.exitCode = 1;
});
