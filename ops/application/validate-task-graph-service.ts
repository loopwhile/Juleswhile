import process from "node:process";

import { parseArguments } from "./validate-task-graph-cli.js";

import { validateGraph } from "./validate-task-graph-policy.js";

import { validatePrScope } from "./validate-pr-scope-policy.js";

import { printReport } from "./task-validation-reporter.js";

import { readTaskIndex } from "../infrastructure/filesystem/task-validation-filesystem-adapter.js";

export async function runTaskValidation(argv: string[]): Promise<void> {
	const options = parseArguments(argv);

	const taskIndex = await readTaskIndex(options.taskIndexPath);

	const report =
		options.mode === "graph"
			? await validateGraph(taskIndex)
			: await validatePrScope(taskIndex, options);

	printReport(report);

	if (report.errors.length > 0) {
		process.exitCode = 1;
		return;
	}

	console.log("Juleswhile TASK 검증을 통과했습니다.");
}
