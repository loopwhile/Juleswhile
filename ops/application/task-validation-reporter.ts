import type { ValidationReport } from "../domain/task-validation/task-validation-contract.js";

export function printReport(report: ValidationReport): void {
	console.log(`Mode: ${report.mode}`);

	for (const warning of report.warnings) {
		console.warn(`WARNING: ${warning}`);
	}

	for (const error of report.errors) {
		console.error(`ERROR: ${error}`);
	}

	console.log(`Summary: ${JSON.stringify(report.summary)}`);
}
