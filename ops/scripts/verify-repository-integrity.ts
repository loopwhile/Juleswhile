#!/usr/bin/env node

import { execFile } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SENSITIVE_NAMES = [
	"JULES_API_KEY",
	"NETLIFY_AUTH_TOKEN",
] as const;

const SAFE_LITERAL_WORDS = [
	"test",
	"mock",
	"dummy",
	"example",
	"placeholder",
];

const PRIVATE_KEY_PATTERN =
	/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/;

const GENERIC_SECRET_NAME_PATTERN =
	/[A-Z0-9_]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|TOKEN|SECRET)[A-Z0-9_]*/i;

interface CliOptions {
	baseSha: string;
	headSha: string;
}

export interface IntegrityViolation {
	kind: "private-key" | "hardcoded-secret";
	lineNumber: number;
	message: string;
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];

	if (value === undefined || value.startsWith("--")) {
		throw new Error(`${flag} 옵션에 값이 필요합니다.`);
	}

	return value;
}

function parseArguments(argv: string[]): CliOptions {
	let baseSha = "";
	let headSha = "";

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--base-sha": {
				baseSha = requireValue(argv, index, argument);
				index += 1;
				break;
			}

			case "--head-sha": {
				headSha = requireValue(argv, index, argument);
				index += 1;
				break;
			}

			default:
				throw new Error(`지원하지 않는 옵션입니다: ${argument}`);
		}
	}

	if (baseSha === "") {
		throw new Error("--base-sha 옵션이 필요합니다.");
	}

	if (headSha === "") {
		throw new Error("--head-sha 옵션이 필요합니다.");
	}

	return {
		baseSha,
		headSha,
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLiteralSyntax(value: string): string {
	let literal = value.trim().replace(/[;,]\s*$/, "").trim();

	if (
		(literal.startsWith('"') && literal.endsWith('"')) ||
		(literal.startsWith("'") && literal.endsWith("'"))
	) {
		literal = literal.slice(1, -1);
	}

	return literal.trim();
}

function isSafeReference(value: string, variableName: string): boolean {
	const literal = stripLiteralSyntax(value);
	const escapedName = escapeRegExp(variableName);

	return [
		new RegExp(`^\\$\\{\\{\\s*secrets\\.${escapedName}\\s*\\}\\}$`),
		new RegExp(`^\\$\\{\\{\\s*(?:env|vars)\\.${escapedName}\\s*\\}\\}$`),
		new RegExp(`^process\\.env\\.${escapedName}$`),
		new RegExp(`^\\$${escapedName}$`),
		new RegExp(`^\\$\\{${escapedName}(?::[-=?+][^}]*)?\\}$`),
	].some((pattern) => pattern.test(literal));
}

function isGenericSafeReference(value: string): boolean {
	const literal = stripLiteralSyntax(value);

	return [
		/^\$\{\{\s*(?:secrets|env|vars)\.[A-Z_][A-Z0-9_]*\s*\}\}$/,
		/^process\.env\.[A-Z_][A-Z0-9_]*$/,
		/^\$[A-Z_][A-Z0-9_]*$/,
		/^\$\{[A-Z_][A-Z0-9_]*(?::[-=?+][^}]*)?\}$/,
	].some((pattern) => pattern.test(literal));
}

function isSafeLiteral(value: string): boolean {
	const literal = stripLiteralSyntax(value).toLowerCase();

	return SAFE_LITERAL_WORDS.some((word) => literal.includes(word));
}

function looksLikeLongSecret(value: string): boolean {
	const literal = stripLiteralSyntax(value);

	if (literal.length < 20) {
		return false;
	}

	if (/\s/.test(literal)) {
		return false;
	}

	return /[A-Za-z0-9_.=/-]{20,}/.test(literal);
}

function getAssignedValue(
	line: string,
	variableName: string,
): string | undefined {
	const escapedName = escapeRegExp(variableName);

	const patterns = [
		new RegExp(`^\\s*["']?${escapedName}["']?\\s*:\\s*(?<value>.+?)\\s*$`),
		new RegExp(`^\\s*(?:export\\s+)?${escapedName}\\s*=\\s*(?<value>.+?)\\s*$`),
		new RegExp(
			`\\bprocess\\.env\\.${escapedName}\\s*=\\s*(?<value>.+?)\\s*;?\\s*$`,
		),
		new RegExp(
			`\\b(?:const|let|var)\\s+${escapedName}\\s*=\\s*(?<value>.+?)\\s*;?\\s*$`,
		),
		new RegExp(
			`(?:^|[{,]\\s*)["']?${escapedName}["']?\\s*:\\s*(?<value>.+?)(?:[,}]\\s*)?$`,
		),
	];

	for (const pattern of patterns) {
		const match = line.match(pattern);
		const value = match?.groups?.value;

		if (value !== undefined) {
			return value;
		}
	}

	return undefined;
}

function getGenericSecretAssignment(line: string): {
	name: string;
	value: string;
} | undefined {
	const match = line.match(
		/^\s*(?:export\s+|const\s+|let\s+|var\s+)?(?<name>[A-Z0-9_]*(?:API[_-]?KEY|AUTH[_-]?TOKEN|TOKEN|SECRET)[A-Z0-9_]*)\s*[:=]\s*(?<value>.+?)\s*;?\s*$/i,
	);

	if (match?.groups?.name === undefined || match.groups.value === undefined) {
		return undefined;
	}

	if (!GENERIC_SECRET_NAME_PATTERN.test(match.groups.name)) {
		return undefined;
	}

	return {
		name: match.groups.name,
		value: match.groups.value,
	};
}

function scanAddedLine(
	line: string,
	lineNumber: number,
): IntegrityViolation[] {
	const violations: IntegrityViolation[] = [];

	if (PRIVATE_KEY_PATTERN.test(line)) {
		violations.push({
			kind: "private-key",
			lineNumber,
			message: "private key body was added",
		});
	}

	for (const variableName of SENSITIVE_NAMES) {
		const value = getAssignedValue(line, variableName);

		if (
			value !== undefined &&
			!isSafeReference(value, variableName) &&
			!isSafeLiteral(value) &&
			looksLikeLongSecret(value)
		) {
			violations.push({
				kind: "hardcoded-secret",
				lineNumber,
				message: `${variableName} is assigned a long literal value`,
			});
		}
	}

	const genericAssignment = getGenericSecretAssignment(line);

	if (
		genericAssignment !== undefined &&
		!SENSITIVE_NAMES.includes(
			genericAssignment.name.toUpperCase() as (typeof SENSITIVE_NAMES)[number],
		) &&
		!isGenericSafeReference(genericAssignment.value) &&
		!isSafeLiteral(genericAssignment.value) &&
		looksLikeLongSecret(genericAssignment.value)
	) {
		violations.push({
			kind: "hardcoded-secret",
			lineNumber,
			message: `${genericAssignment.name} is assigned a long literal value`,
		});
	}

	return violations;
}

export function inspectDiff(diff: string): IntegrityViolation[] {
	const violations: IntegrityViolation[] = [];

	const lines = diff.split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];

		if (!line.startsWith("+") || line.startsWith("+++")) {
			continue;
		}

		violations.push(...scanAddedLine(line.slice(1), index + 1));
	}

	return violations;
}

async function getDiff(baseSha: string, headSha: string): Promise<string> {
	const { stdout } = await execFileAsync("git", [
		"diff",
		"--no-ext-diff",
		baseSha,
		headSha,
	]);

	return stdout;
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	const diff = await getDiff(options.baseSha, options.headSha);
	const violations = inspectDiff(diff);

	if (violations.length === 0) {
		console.log("Repository integrity check passed.");
		return;
	}

	for (const violation of violations) {
		console.error(
			`ERROR: line ${violation.lineNumber}: ${violation.message}`,
		);
	}

	process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);

		console.error(`Repository integrity check failed: ${message}`);
		process.exitCode = 1;
	});
}
