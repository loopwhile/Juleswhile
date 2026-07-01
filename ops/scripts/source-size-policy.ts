import path from "node:path";

import { minimatch } from "minimatch";

export interface SourceSizeScope {
	name: string;
	patterns: string[];
}

export interface SourceSizeException {
	path: string;
	max_lines: number;
	follow_up_task: string;
	reason: string;
}

export interface SourceSizeBaseline {
	schema_version: 1;
	policy: "ratchet";
	line_limit: number;
	baseline_sha: string;
	recorded_at: string;
	scopes: SourceSizeScope[];
	exceptions: SourceSizeException[];
}

function isRecord(
	value: unknown,
): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value)
	);
}

function assertExactKeys(
	value: Record<string, unknown>,
	expectedKeys: string[],
	context: string,
): void {
	const actual = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();

	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${context} fields are invalid: ` +
				`expected=${expected.join(",")}; ` +
				`actual=${actual.join(",")}`,
		);
	}
}

function requireString(
	value: unknown,
	context: string,
): string {
	if (
		typeof value !== "string" ||
		value.trim().length === 0
	) {
		throw new Error(
			`${context} must be a non-empty string`,
		);
	}

	return value;
}

function isSafeRepositoryPath(
	value: string,
): boolean {
	if (
		value.length === 0 ||
		value.includes("\\") ||
		value.includes("\0") ||
		path.posix.isAbsolute(value) ||
		value.startsWith("./")
	) {
		return false;
	}

	const parts = value.split("/");

	return (
		!parts.includes("..") &&
		!parts.includes(".")
	);
}

function parseScope(
	value: unknown,
	index: number,
): SourceSizeScope {
	if (!isRecord(value)) {
		throw new Error(
			`scopes[${index}] must be an object`,
		);
	}

	assertExactKeys(
		value,
		["name", "patterns"],
		`scopes[${index}]`,
	);

	const name = requireString(
		value.name,
		`scopes[${index}].name`,
	);

	if (
		!Array.isArray(value.patterns) ||
		value.patterns.length === 0
	) {
		throw new Error(
			`scopes[${index}].patterns must be non-empty`,
		);
	}

	const patterns = value.patterns.map(
		(pattern, patternIndex) => {
			const parsed = requireString(
				pattern,
				`scopes[${index}].patterns[${patternIndex}]`,
			);

			if (
				!isSafeRepositoryPath(parsed) ||
				parsed.startsWith("!")
			) {
				throw new Error(
					`unsafe scope pattern: ${parsed}`,
				);
			}

			return parsed;
		},
	);

	if (new Set(patterns).size !== patterns.length) {
		throw new Error(
			`scopes[${index}] contains duplicate patterns`,
		);
	}

	return {
		name,
		patterns,
	};
}

function parseException(
	value: unknown,
	index: number,
	lineLimit: number,
): SourceSizeException {
	if (!isRecord(value)) {
		throw new Error(
			`exceptions[${index}] must be an object`,
		);
	}

	assertExactKeys(
		value,
		[
			"path",
			"max_lines",
			"follow_up_task",
			"reason",
		],
		`exceptions[${index}]`,
	);

	const filePath = requireString(
		value.path,
		`exceptions[${index}].path`,
	);
	const followUpTask = requireString(
		value.follow_up_task,
		`exceptions[${index}].follow_up_task`,
	);
	const reason = requireString(
		value.reason,
		`exceptions[${index}].reason`,
	);

	if (
		!isSafeRepositoryPath(filePath) ||
		/[*?[\]{}]/u.test(filePath)
	) {
		throw new Error(
			`unsafe exception path: ${filePath}`,
		);
	}

	if (
		!Number.isInteger(value.max_lines) ||
		Number(value.max_lines) <= lineLimit
	) {
		throw new Error(
			`exceptions[${index}].max_lines must exceed ${lineLimit}`,
		);
	}

	if (!/^TASK-[0-9]{3,}$/u.test(followUpTask)) {
		throw new Error(
			`invalid follow-up TASK: ${followUpTask}`,
		);
	}

	return {
		path: filePath,
		max_lines: Number(value.max_lines),
		follow_up_task: followUpTask,
		reason,
	};
}

export function parseSourceSizeBaseline(
	value: unknown,
): SourceSizeBaseline {
	if (!isRecord(value)) {
		throw new Error(
			"Source Size Baseline must be an object",
		);
	}

	assertExactKeys(
		value,
		[
			"schema_version",
			"policy",
			"line_limit",
			"baseline_sha",
			"recorded_at",
			"scopes",
			"exceptions",
		],
		"Source Size Baseline",
	);

	if (value.schema_version !== 1) {
		throw new Error(
			"Source Size Baseline schema_version must be 1",
		);
	}

	if (value.policy !== "ratchet") {
		throw new Error(
			"Source Size Baseline policy must be ratchet",
		);
	}

	if (
		!Number.isInteger(value.line_limit) ||
		Number(value.line_limit) < 1
	) {
		throw new Error(
			"Source Size Baseline line_limit must be positive",
		);
	}

	const lineLimit = Number(value.line_limit);
	const baselineSha = requireString(
		value.baseline_sha,
		"Source Size Baseline baseline_sha",
	);
	const recordedAt = requireString(
		value.recorded_at,
		"Source Size Baseline recorded_at",
	);

	if (!/^[0-9a-f]{40}$/u.test(baselineSha)) {
		throw new Error(
			"Source Size Baseline baseline_sha must be a full commit SHA",
		);
	}

	if (!Number.isFinite(Date.parse(recordedAt))) {
		throw new Error(
			"Source Size Baseline recorded_at must be a date-time",
		);
	}

	if (
		!Array.isArray(value.scopes) ||
		value.scopes.length === 0
	) {
		throw new Error(
			"Source Size Baseline scopes must be non-empty",
		);
	}

	if (!Array.isArray(value.exceptions)) {
		throw new Error(
			"Source Size Baseline exceptions must be an array",
		);
	}

	const scopes = value.scopes.map(parseScope);
	const exceptions = value.exceptions.map(
		(entry, index) =>
			parseException(
				entry,
				index,
				lineLimit,
			),
	);

	const scopeNames = scopes.map(
		(scope) => scope.name,
	);

	if (new Set(scopeNames).size !== scopeNames.length) {
		throw new Error(
			"Source Size Baseline contains duplicate scope names",
		);
	}

	const exceptionPaths = exceptions.map(
		(entry) => entry.path,
	);

	if (
		new Set(exceptionPaths).size !==
		exceptionPaths.length
	) {
		throw new Error(
			"Source Size Baseline contains duplicate exception paths",
		);
	}

	if (
		JSON.stringify(exceptionPaths) !==
		JSON.stringify([...exceptionPaths].sort())
	) {
		throw new Error(
			"Source Size Baseline exceptions must be path-sorted",
		);
	}

	return {
		schema_version: 1,
		policy: "ratchet",
		line_limit: lineLimit,
		baseline_sha: baselineSha,
		recorded_at: recordedAt,
		scopes,
		exceptions,
	};
}

export function countTextLines(
	content: string,
): number {
	if (content.length === 0) {
		return 0;
	}

	const newlineCount =
		content.match(/\n/gu)?.length ?? 0;

	return (
		newlineCount +
		(content.endsWith("\n") ? 0 : 1)
	);
}

export function matchesSourceSizeScope(
	filePath: string,
	scopes: SourceSizeScope[],
): boolean {
	return scopes.some((scope) =>
		scope.patterns.some((pattern) =>
			minimatch(filePath, pattern, {
				dot: true,
				nocase: false,
			}),
		),
	);
}
