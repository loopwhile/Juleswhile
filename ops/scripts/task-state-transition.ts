#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { parseArguments } from "../application/task-state-transition-cli.js";

import { transitionTaskState } from "../application/task-state-transition-service.js";

export type {
	TransitionDependencies,
	TransitionMode,
	TransitionOptions,
	TransitionResult,
} from "../domain/task-state-transition/task-state-transition-contract.js";

export {
	buildTransitionLabels,
	buildTransitionMarker,
} from "../domain/task-state-transition/task-state-transition-policy.js";

export { transitionTaskState };

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));

	await transitionTaskState(options);
}

const invokedPath = process.argv[1]
	? pathToFileURL(path.resolve(process.argv[1])).href
	: "";

if (import.meta.url === invokedPath) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));

		process.exitCode = 1;
	});
}
