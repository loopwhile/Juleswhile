import path from "node:path";
import process from "node:process";
import {
	fileURLToPath,
} from "node:url";

import {
	DOCUMENT_PATHS,
	GUIDE_PATHS,
	assertInOrder,
	extractBashBlocks,
	readDocument,
	validateForbiddenPatterns,
	validateNodePaths,
	validateNpmCommands,
	validateShellSyntax,
	validateWorkflowCommands,
	workflowInputs,
} from "./operator-guide-validation-core.js";

export {
	assertInOrder,
	extractBashBlocks,
} from "./operator-guide-validation-core.js";

function validateBootstrapOrder(
	quickstart: string,
	bootstrapGuide: string,
): void {
	assertInOrder(
		quickstart,
		[
			"git clone ",
			"rm -rf .git",
			"git init -b main",
			"npm ci",
			"bootstrap-project.mjs --dry-run",
			"bootstrap-project.mjs --apply",
			'gh repo create "$REPOSITORY"',
			"git remote add origin",
			"git commit",
			"git push -u origin main",
			'read -rsp "Jules API Key:',
			"jules.googleapis.com/v1alpha/sources",
			"gh variable set JULES_SOURCE_NAME",
			"unset JULES_API_KEY",
		],
		"QUICKSTART Bootstrap order",
	);

	assertInOrder(
		bootstrapGuide,
		[
			'git clone "$TEMPLATE_REPO"',
			"rm -rf .git",
			"git init -b main",
			"npm ci",
			"bootstrap-project.mjs --dry-run",
			"bootstrap-project.mjs --apply",
			'gh repo create "$REPOSITORY"',
			"git remote add origin",
			"git commit",
			"git push -u origin main",
			'read -rsp "Jules API Key:',
			"jules.googleapis.com/v1alpha/sources",
			"gh variable set JULES_SOURCE_NAME",
			"unset JULES_API_KEY",
		],
		"Operator Guide Bootstrap order",
	);
}

function validateIndex(root: string): void {
	const index = readDocument(
		root,
		GUIDE_PATHS[0],
	);

	for (const guide of GUIDE_PATHS) {
		if (!index.includes(`(${guide})`)) {
			throw new Error(
				`Operator Guide index does not reference ${guide}`,
			);
		}
	}
}

export function validateOperatorGuides(
	root = process.cwd(),
): void {
	validateIndex(root);

	const packageJson = JSON.parse(
		readDocument(
			root,
			"package.json",
		),
	) as {
		scripts?: Record<string, string>;
	};

	const scripts =
		packageJson.scripts ??
		{};

	const workflows =
		workflowInputs(root);

	for (const filePath of DOCUMENT_PATHS) {
		const content = readDocument(
			root,
			filePath,
		);
		const bashBlocks =
			extractBashBlocks(content);

		validateShellSyntax(
			filePath,
			bashBlocks,
		);

		validateWorkflowCommands(
			filePath,
			bashBlocks,
			workflows,
		);

		validateNpmCommands(
			filePath,
			content,
			scripts,
		);

		validateNodePaths(
			root,
			filePath,
			content,
		);

		validateForbiddenPatterns(
			filePath,
			content,
		);
	}

	const quickstart = readDocument(
		root,
		"QUICKSTART.md",
	);
	const bootstrapGuide = readDocument(
		root,
		"OPERATOR-GUIDE-02-BOOTSTRAP.md",
	);

	validateBootstrapOrder(
		quickstart,
		bootstrapGuide,
	);

	for (
		const required
		of [
			'--arg owner "$GITHUB_OWNER"',
			'--arg repo "$GITHUB_REPO"',
			'--body "$JULES_SOURCE_NAME"',
			"unset JULES_SOURCE_NAME",
		]
	) {
		if (!bootstrapGuide.includes(required)) {
			throw new Error(
				`Operator Guide Bootstrap contract is missing: ${required}`,
			);
		}
	}

	console.log(
		[
			"Operator Guide validation passed.",
			`Guides: ${GUIDE_PATHS.length}`,
			`Documents: ${DOCUMENT_PATHS.length}`,
			`Workflows: ${workflows.size}`,
		].join(" "),
	);
}

const invokedPath =
	process.argv[1]
		? path.resolve(process.argv[1])
		: "";

if (
	invokedPath ===
	fileURLToPath(import.meta.url)
) {
	try {
		validateOperatorGuides();
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: String(error);

		console.error(
			`ERROR: ${message}`,
		);

		process.exitCode = 1;
	}
}
