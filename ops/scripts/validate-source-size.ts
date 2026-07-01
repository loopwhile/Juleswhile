#!/usr/bin/env node

import process from "node:process";

import {
	validateSourceSize,
} from "./source-size-validator.js";

async function main(): Promise<void> {
	const report = await validateSourceSize();

	console.log(
		`Source size summary: ${JSON.stringify(report.summary)}`,
	);

	for (const error of report.errors) {
		console.error(
			`ERROR ${error.path}: ${error.message}`,
		);
	}

	if (report.errors.length > 0) {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error: unknown) => {
		console.error(
			error instanceof Error
				? error.message
				: String(error),
		);
		process.exitCode = 1;
	});
}
