import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

export const GUIDE_PATHS = [
	"OPERATOR-GUIDE-01-OVERVIEW.md",
	"OPERATOR-GUIDE-02-BOOTSTRAP.md",
	"OPERATOR-GUIDE-03-RUNTIME-OPERATIONS.md",
	"OPERATOR-GUIDE-04-TASK-LIFECYCLE.md",
	"OPERATOR-GUIDE-05-PULL-REQUEST-AND-MERGE.md",
	"OPERATOR-GUIDE-06-DEPLOYMENT.md",
	"OPERATOR-GUIDE-07-PROJECTION-AND-DASHBOARD.md",
	"OPERATOR-GUIDE-08-RECOVERY.md",
	"OPERATOR-GUIDE-09-TROUBLESHOOTING.md",
] as const;

export const DOCUMENT_PATHS = [
	"QUICKSTART.md",
	...GUIDE_PATHS,
] as const;

interface WorkflowDocument {
	on?: {
		workflow_dispatch?: {
			inputs?: Record<string, unknown>;
		};
	};
}

export function fail(message: string): never {
	throw new Error(message);
}

export function readDocument(
	root: string,
	filePath: string,
): string {
	const absolutePath = path.join(root, filePath);

	if (!existsSync(absolutePath)) {
		fail(`Required Operator Guide path is missing: ${filePath}`);
	}

	return readFileSync(absolutePath, "utf8");
}

export function extractBashBlocks(
	markdown: string,
): string[] {
	return [
		...markdown.matchAll(
			/```(?:bash|sh)\s*\n([\s\S]*?)```/gu,
		),
	].map((match) => match[1].trimEnd());
}

export function assertInOrder(
	value: string,
	markers: string[],
	description: string,
): void {
	let offset = -1;

	for (const marker of markers) {
		const next = value.indexOf(marker, offset + 1);

		if (next < 0) {
			fail(
				`${description}: required marker is missing: ${marker}`,
			);
		}

		if (next <= offset) {
			fail(
				`${description}: marker is out of order: ${marker}`,
			);
		}

		offset = next;
	}
}

function normalizeShell(value: string): string {
	return value
		.replace(
			/<[A-Z][A-Z0-9_]*>/gu,
			"123",
		)
		.replaceAll("\r\n", "\n");
}

export function validateShellSyntax(
	filePath: string,
	blocks: string[],
): void {
	const directory = mkdtempSync(
		path.join(
			os.tmpdir(),
			"juleswhile-guide-shell-",
		),
	);

	try {
		for (
			let index = 0;
			index < blocks.length;
			index += 1
		) {
			const scriptPath = path.join(
				directory,
				`${index}.sh`,
			);

			writeFileSync(
				scriptPath,
				[
					"#!/usr/bin/env bash",
					"set -Eeuo pipefail",
					normalizeShell(blocks[index]),
					"",
				].join("\n"),
				"utf8",
			);

			try {
				execFileSync(
					"bash",
					["-n", scriptPath],
					{
						stdio: "pipe",
					},
				);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: String(error);

				fail(
					`${filePath}: Bash block ${index + 1} is invalid: ${message}`,
				);
			}
		}
	} finally {
		rmSync(
			directory,
			{
				recursive: true,
				force: true,
			},
		);
	}
}

export function workflowInputs(
	root: string,
): Map<string, Set<string>> {
	const workflowDirectory = path.join(
		root,
		".github/workflows",
	);
	const workflows = new Map<
		string,
		Set<string>
	>();

	for (
		const entry
		of readdirSync(
			workflowDirectory,
			{
				withFileTypes: true,
			},
		)
	) {
		if (
			!entry.isFile() ||
			!/\.(?:yml|yaml)$/u.test(entry.name)
		) {
			continue;
		}

		const document = parse(
			readFileSync(
				path.join(
					workflowDirectory,
					entry.name,
				),
				"utf8",
			),
		) as WorkflowDocument;

		const inputs =
			document.on
				?.workflow_dispatch
				?.inputs ??
			{};

		workflows.set(
			entry.name,
			new Set(Object.keys(inputs)),
		);
	}

	return workflows;
}

export function validateWorkflowCommands(
	filePath: string,
	blocks: string[],
	workflows: Map<string, Set<string>>,
): void {
	for (const block of blocks) {
		const commands = [
			...block.matchAll(
				/gh workflow run\s+"([^"]+)"/gu,
			),
		];

		for (const command of commands) {
			const workflowName = command[1];
			const inputs = workflows.get(
				workflowName,
			);

			if (!inputs) {
				fail(
					`${filePath}: referenced Workflow does not exist: ${workflowName}`,
				);
			}

			const flags = [
				...block.matchAll(
					/-f\s+([A-Za-z0-9_]+)=/gu,
				),
			].map((match) => match[1]);

			for (const flag of flags) {
				if (!inputs.has(flag)) {
					fail(
						`${filePath}: ${workflowName} has no workflow_dispatch input named ${flag}`,
					);
				}
			}
		}
	}
}

export function validateNpmCommands(
	filePath: string,
	content: string,
	scripts: Record<string, string>,
): void {
	for (
		const match
		of content.matchAll(
			/\bnpm run ([A-Za-z0-9:_-]+)/gu,
		)
	) {
		const script = match[1];

		if (!scripts[script]) {
			fail(
				`${filePath}: npm script does not exist: ${script}`,
			);
		}
	}
}

export function validateNodePaths(
	root: string,
	filePath: string,
	content: string,
): void {
	for (
		const match
		of content.matchAll(
			/\bnode(?:\s+--input-type=module)?\s+(ops\/scripts\/[A-Za-z0-9._/-]+\.(?:js|mjs|ts))/gu,
		)
	) {
		if (
			!existsSync(
				path.join(
					root,
					match[1],
				),
			)
		) {
			fail(
				`${filePath}: referenced Node script does not exist: ${match[1]}`,
			);
		}
	}
}

export function validateForbiddenPatterns(
	filePath: string,
	content: string,
): void {
	const forbidden: Array<
		[RegExp, string]
	> = [
		[
			/\boperator-guide\.md\b/u,
			"obsolete operator-guide.md path",
		],
		[
			/\bJULES_SOURCE\b/u,
			"obsolete JULES_SOURCE variable",
		],
		[
			/sources\/github\/OWNER\/REPOSITORY/u,
			"hard-coded Jules Source example",
		],
		[
			/node <<'NODE'/u,
			"Node stdin execution without --input-type=module",
		],
		[
			/<PR_NUMBER>/u,
			"non-executable PR_NUMBER placeholder",
		],
		[
			/node ops\/scripts\/bootstrap-project\.mjs(?!\s+--(?:dry-run|apply))/u,
			"Bootstrap command without explicit mode",
		],
	];

	for (
		const [
			pattern,
			description,
		]
		of forbidden
	) {
		if (pattern.test(content)) {
			fail(
				`${filePath}: ${description}`,
			);
		}
	}
}
