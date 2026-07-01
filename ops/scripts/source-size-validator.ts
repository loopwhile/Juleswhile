import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
	countTextLines,
	matchesSourceSizeScope,
	parseSourceSizeBaseline,
} from "./source-size-policy.js";

const DEFAULT_BASELINE_PATH =
	"ops/config/source-size-baseline.json";

const EXCLUDED_DIRECTORIES = new Set([
	".git",
	".netlify",
	"coverage",
	"dist",
	"node_modules",
]);

export interface SourceSizeFinding {
	path: string;
	message: string;
}

export interface SourceSizeValidationReport {
	errors: SourceSizeFinding[];
	summary: {
		managedFiles: number;
		exceptions: number;
		oversizedFiles: number;
		ratchetedFiles: number;
		lineLimit: number;
	};
}

export interface SourceSizeValidationOptions {
	rootDir?: string;
	baselinePath?: string;
	readBaselineLineCount?: (
		baselineSha: string,
		filePath: string,
	) => Promise<number | null>;
}

async function listRepositoryFiles(
	rootDir: string,
): Promise<string[]> {
	const files: string[] = [];

	async function visit(
		absoluteDirectory: string,
	): Promise<void> {
		const entries = await fs.readdir(
			absoluteDirectory,
			{
				withFileTypes: true,
			},
		);

		for (const entry of entries) {
			if (
				entry.isDirectory() &&
				EXCLUDED_DIRECTORIES.has(entry.name)
			) {
				continue;
			}

			const absolutePath = path.join(
				absoluteDirectory,
				entry.name,
			);

			if (entry.isDirectory()) {
				await visit(absolutePath);
				continue;
			}

			if (!entry.isFile()) {
				continue;
			}

			files.push(
				path
					.relative(
						rootDir,
						absolutePath,
					)
					.split(path.sep)
					.join("/"),
			);
		}
	}

	await visit(rootDir);

	return files.sort();
}

async function readBaselineLineCountFromGit(
	rootDir: string,
	baselineSha: string,
	filePath: string,
): Promise<number | null> {
	try {
		const content = execFileSync(
			"git",
			[
				"-C",
				rootDir,
				"show",
				`${baselineSha}:${filePath}`,
			],
			{
				encoding: "utf8",
				maxBuffer: 16 * 1024 * 1024,
				stdio: [
					"ignore",
					"pipe",
					"ignore",
				],
			},
		);

		return countTextLines(content);
	} catch {
		return null;
	}
}

export async function validateSourceSize(
	options: SourceSizeValidationOptions = {},
): Promise<SourceSizeValidationReport> {
	const rootDir = path.resolve(
		options.rootDir ?? process.cwd(),
	);
	const baselinePath =
		options.baselinePath ??
		DEFAULT_BASELINE_PATH;
	const absoluteBaselinePath = path.resolve(
		rootDir,
		baselinePath,
	);
	const relativeBaselinePath = path.relative(
		rootDir,
		absoluteBaselinePath,
	);

	if (
		relativeBaselinePath.startsWith("..") ||
		path.isAbsolute(relativeBaselinePath)
	) {
		throw new Error(
			"Source Size Baseline must be inside the repository",
		);
	}

	const baseline = parseSourceSizeBaseline(
		JSON.parse(
			await fs.readFile(
				absoluteBaselinePath,
				"utf8",
			),
		) as unknown,
	);

	const repositoryFiles =
		await listRepositoryFiles(rootDir);
	const managedFiles = repositoryFiles.filter(
		(filePath) =>
			matchesSourceSizeScope(
				filePath,
				baseline.scopes,
			),
	);
	const managedFileSet = new Set(managedFiles);
	const exceptionMap = new Map(
		baseline.exceptions.map((entry) => [
			entry.path,
			entry,
		]),
	);
	const lineCounts = new Map<string, number>();
	const errors: SourceSizeFinding[] = [];

	async function currentLineCount(
		filePath: string,
	): Promise<number | null> {
		const cached = lineCounts.get(filePath);

		if (cached !== undefined) {
			return cached;
		}

		try {
			const content = await fs.readFile(
				path.join(rootDir, filePath),
				"utf8",
			);
			const lineCount =
				countTextLines(content);

			lineCounts.set(
				filePath,
				lineCount,
			);

			return lineCount;
		} catch {
			return null;
		}
	}

	const readBaselineLineCount =
		options.readBaselineLineCount ??
		((baselineSha: string, filePath: string) =>
			readBaselineLineCountFromGit(
				rootDir,
				baselineSha,
				filePath,
			));

	for (const exception of baseline.exceptions) {
		if (!managedFileSet.has(exception.path)) {
			errors.push({
				path: exception.path,
				message:
					"exception path is missing or outside managed scopes",
			});
		}

		const currentLines =
			await currentLineCount(exception.path);

		if (currentLines === null) {
			errors.push({
				path: exception.path,
				message:
					"exception file does not exist",
			});
		} else {
			if (currentLines <= baseline.line_limit) {
				errors.push({
					path: exception.path,
					message:
						"exception is no longer required and must be removed",
				});
			}

			if (currentLines > exception.max_lines) {
				errors.push({
					path: exception.path,
					message:
						`line count ${currentLines} exceeds ` +
						`ratchet maximum ${exception.max_lines}`,
				});
			}
		}

		const baselineLines =
			await readBaselineLineCount(
				baseline.baseline_sha,
				exception.path,
			);

		if (baselineLines === null) {
			errors.push({
				path: exception.path,
				message:
					"exception file did not exist at baseline_sha",
			});
		} else if (
			baselineLines !== exception.max_lines
		) {
			errors.push({
				path: exception.path,
				message:
					`max_lines ${exception.max_lines} does not ` +
					`match baseline count ${baselineLines}`,
			});
		}
	}

	let oversizedFiles = 0;

	for (const filePath of managedFiles) {
		const lineCount =
			await currentLineCount(filePath);

		if (
			lineCount === null ||
			lineCount <= baseline.line_limit
		) {
			continue;
		}

		oversizedFiles += 1;

		if (!exceptionMap.has(filePath)) {
			errors.push({
				path: filePath,
				message:
					`line count ${lineCount} exceeds ` +
					`limit ${baseline.line_limit} without an exception`,
			});
		}
	}

	errors.sort((left, right) => {
		const pathComparison =
			left.path.localeCompare(right.path);

		return (
			pathComparison ||
			left.message.localeCompare(right.message)
		);
	});

	return {
		errors,
		summary: {
			managedFiles: managedFiles.length,
			exceptions:
				baseline.exceptions.length,
			oversizedFiles,
			ratchetedFiles:
				baseline.exceptions.length,
			lineLimit:
				baseline.line_limit,
		},
	};
}
