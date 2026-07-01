#!/usr/bin/env node

import process from "node:process";

export { assertLiveDispatchContext } from "./session-dispatch-atomicity.js";

import { runDispatchJules } from "../application/dispatch-jules-service.js";

runDispatchJules(process.argv.slice(2)).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`Jules Dispatch 실패: ${message}`);

	process.exitCode = 1;
});
