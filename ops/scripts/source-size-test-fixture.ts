import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	type SourceSizeValidationOptions,
	type SourceSizeValidationReport,
	validateSourceSize,
} from "./source-size-validator.js";

export const BASELINE_SHA = "a".repeat(40);
export const BASELINE_PATH =
	"ops/config/source-size-baseline.json";

export interface ExceptionInput {
	path: string;
	max_lines: number;
	follow_up_task?: string;
	reason?: string;
}

export interface SourceSizeFixture {
	rootDir: string;
	writeManagedFile(
		filePath: string,
		lineCount: number,
	): Promise<void>;
	writeBaseline(
		exceptions?: ExceptionInput[],
	): Promise<void>;
	validate(
		baselineCounts?: Record<string, number>,
	): Promise<SourceSizeValidationReport>;
}

function contentWithLines(
	lineCount: number,
): string {
	return "line\n".repeat(lineCount);
}

async function createFixture(): Promise<SourceSizeFixture> {
	const rootDir = await fs.mkdtemp(
		path.join(
			os.tmpdir(),
			"juleswhile-source-size-",
		),
	);

	async function writeManagedFile(
		filePath: string,
		lineCount: number,
	): Promise<void> {
		const absolutePath = path.join(
			rootDir,
			filePath,
		);

		await fs.mkdir(
			path.dirname(absolutePath),
			{
				recursive: true,
			},
		);

		await fs.writeFile(
			absolutePath,
			contentWithLines(lineCount),
			"utf8",
		);
	}

	async function writeBaseline(
		exceptions: ExceptionInput[] = [],
	): Promise<void> {
		const absolutePath = path.join(
			rootDir,
			BASELINE_PATH,
		);

		await fs.mkdir(
			path.dirname(absolutePath),
			{
				recursive: true,
			},
		);

		const document = {
			schema_version: 1,
			policy: "ratchet",
			line_limit: 500,
			baseline_sha: BASELINE_SHA,
			recorded_at:
				"2026-07-01T00:00:00Z",
			scopes: [
				{
					name: "typescript",
					patterns: [
						"ops/**/*.ts",
					],
				},
			],
			exceptions: exceptions.map(
				(entry) => ({
					path: entry.path,
					max_lines:
						entry.max_lines,
					follow_up_task:
						entry.follow_up_task ??
						"TASK-014",
					reason:
						entry.reason ??
						"Legacy oversized file.",
				}),
			),
		};

		await fs.writeFile(
			absolutePath,
			`${JSON.stringify(
				document,
				null,
				2,
			)}\n`,
			"utf8",
		);
	}

	async function validate(
		baselineCounts: Record<string, number> = {},
	): Promise<SourceSizeValidationReport> {
		const options: SourceSizeValidationOptions = {
			rootDir,
			baselinePath:
				BASELINE_PATH,
			readBaselineLineCount:
				async (_sha, filePath) =>
					baselineCounts[filePath] ??
					null,
		};

		return validateSourceSize(options);
	}

	return {
		rootDir,
		writeManagedFile,
		writeBaseline,
		validate,
	};
}

export async function withSourceSizeFixture(
	run: (
		fixture: SourceSizeFixture,
	) => Promise<void>,
): Promise<void> {
	const fixture = await createFixture();

	try {
		await run(fixture);
	} finally {
		await fs.rm(
			fixture.rootDir,
			{
				recursive: true,
				force: true,
			},
		);
	}
}
