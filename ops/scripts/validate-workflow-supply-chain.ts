#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { parse as parseYaml } from "yaml";

const WORKFLOW_DIR = ".github/workflows";
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

const UNSAFE_RUN_EXPRESSIONS = [
	"github.event.issue.body",
	"github.event.issue.title",
	"github.event.pull_request.body",
	"github.event.pull_request.title",
	"github.event.comment.body",
	"github.event.client_payload",
	"inputs.",
];

interface Finding {
	file: string;
	message: string;
}

interface ValidationReport {
	errors: Finding[];
	warnings: Finding[];
	summary: {
		workflowFiles: number;
		externalUses: number;
		localUses: number;
		pinnedExternalUses: number;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listWorkflowFiles(): Promise<string[]> {
	const entries = await fs.readdir(WORKFLOW_DIR, {
		withFileTypes: true,
	});

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(WORKFLOW_DIR, entry.name))
		.filter((filePath) => /\.(ya?ml)$/u.test(filePath))
		.sort();
}

function visitNodes(
	value: unknown,
	visitor: (node: Record<string, unknown>) => void,
): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			visitNodes(item, visitor);
		}

		return;
	}

	if (!isRecord(value)) {
		return;
	}

	visitor(value);

	for (const child of Object.values(value)) {
		visitNodes(child, visitor);
	}
}

function validatePermissions(
	file: string,
	workflow: unknown,
	errors: Finding[],
): void {
	visitNodes(workflow, (node) => {
		const permissions = node.permissions;

		if (permissions === "write-all") {
			errors.push({
				file,
				message: "permissions: write-all is not allowed",
			});
		}
	});
}

function validateRunExpressions(
	file: string,
	workflow: unknown,
	errors: Finding[],
): void {
	visitNodes(workflow, (node) => {
		const run = node.run;

		if (typeof run !== "string" || !run.includes("${{")) {
			return;
		}

		for (const unsafeExpression of UNSAFE_RUN_EXPRESSIONS) {
			if (run.includes(unsafeExpression)) {
				errors.push({
					file,
					message: `untrusted expression appears directly inside run: ${unsafeExpression}`,
				});
			}
		}
	});
}

function validateUses(
	file: string,
	workflow: unknown,
	report: ValidationReport,
): void {
	visitNodes(workflow, (node) => {
		const uses = node.uses;

		if (typeof uses !== "string") {
			return;
		}

		if (uses.startsWith("./")) {
			report.summary.localUses += 1;
			return;
		}

		report.summary.externalUses += 1;

		const atIndex = uses.lastIndexOf("@");

		if (atIndex < 1 || atIndex === uses.length - 1) {
			report.errors.push({
				file,
				message: `external action is missing an immutable ref: ${uses}`,
			});
			return;
		}

		const ref = uses.slice(atIndex + 1);

		if (!FULL_SHA_PATTERN.test(ref)) {
			report.errors.push({
				file,
				message: `external action ref must be a 40-character lowercase commit SHA: ${uses}`,
			});
			return;
		}

		report.summary.pinnedExternalUses += 1;

		if (uses.startsWith("actions/checkout@")) {
			const persistCredentials = isRecord(node.with)
				? node.with["persist-credentials"]
				: undefined;

			if (persistCredentials !== false) {
				report.errors.push({
					file,
					message:
						"actions/checkout steps must set persist-credentials: false unless code push is required",
				});
			}
		}
	});
}

export async function validateWorkflowSupplyChain(): Promise<ValidationReport> {
	const files = await listWorkflowFiles();

	const report: ValidationReport = {
		errors: [],
		warnings: [],
		summary: {
			workflowFiles: files.length,
			externalUses: 0,
			localUses: 0,
			pinnedExternalUses: 0,
		},
	};

	for (const file of files) {
		const content = await fs.readFile(file, "utf8");
		const workflow = parseYaml(content);

		validateUses(file, workflow, report);
		validatePermissions(file, workflow, report.errors);
		validateRunExpressions(file, workflow, report.errors);
	}

	return report;
}

async function main(): Promise<void> {
	const report = await validateWorkflowSupplyChain();

	console.log(
		`Workflow supply-chain summary: ${JSON.stringify(report.summary)}`,
	);

	for (const warning of report.warnings) {
		console.warn(`WARN ${warning.file}: ${warning.message}`);
	}

	for (const error of report.errors) {
		console.error(`ERROR ${error.file}: ${error.message}`);
	}

	if (report.errors.length > 0) {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
