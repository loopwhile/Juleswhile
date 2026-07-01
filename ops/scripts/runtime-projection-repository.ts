import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type { LoadedTaskManifest, TaskContract } from "./task-manifest.js";
import type { TaskRuntimePatch } from "./task-runtime-synchronizer.js";

export interface FileMutation {
	filePath: string;
	content: string;
}

interface TaskBlock {
	lines: string[];
	start: number;
	end: number;
	idIndent: string;
}

interface PreparedMutation {
	filePath: string;
	tempPath: string;
	backupPath: string;
	hadOriginal: boolean;
	committed: boolean;
}

function fail(message: string): never {
	throw new Error(message);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTaskBlock(content: string, taskId: string): TaskBlock {
	const lines = content.split("\n");
	const idPattern = new RegExp(`^(\\s*)id:\\s*${escapeRegExp(taskId)}\\s*$`);

	const idMatches = lines
		.map((line, index) => ({
			index,
			match: line.match(idPattern),
		}))
		.filter(
			(
				value,
			): value is {
				index: number;
				match: RegExpMatchArray;
			} => value.match !== null,
		);

	if (idMatches.length !== 1) {
		fail(
			`${taskId}: TASK ID 행을 정확히 하나 찾지 못했습니다. count=${idMatches.length}`,
		);
	}

	const idLine = idMatches[0];
	const idIndent = idLine.match[1];

	let start = -1;
	let listIndent = "";

	for (let index = idLine.index - 1; index >= 0; index -= 1) {
		const marker = lines[index].match(
			/^(\s*)-\s+kind:\s+(?:task|template)\s*$/,
		);

		if (marker && marker[1].length < idIndent.length) {
			start = index;
			listIndent = marker[1];
			break;
		}
	}

	if (start < 0) {
		fail(`${taskId}: TASK 블록 시작점을 찾지 못했습니다.`);
	}

	const nextTaskPattern = new RegExp(
		`^${escapeRegExp(listIndent)}-\\s+kind:\\s+(?:task|template)\\s*$`,
	);

	let end = lines.length;

	for (let index = start + 1; index < lines.length; index += 1) {
		if (nextTaskPattern.test(lines[index])) {
			end = index;
			break;
		}
	}

	return {
		lines,
		start,
		end,
		idIndent,
	};
}

function replaceSingleLine(
	lines: string[],
	start: number,
	end: number,
	pattern: RegExp,
	replacement: string,
	description: string,
): void {
	const matches: number[] = [];

	for (let index = start; index < end; index += 1) {
		if (pattern.test(lines[index])) {
			matches.push(index);
		}
	}

	if (matches.length !== 1) {
		fail(
			`${description} 행을 정확히 하나 찾지 못했습니다. count=${matches.length}`,
		);
	}

	lines[matches[0]] = replacement;
}

function parseManifest(
	content: string,
	filePath: string,
): {
	tasks: TaskContract[];
	[key: string]: unknown;
} {
	const parsed = parseYaml(content) as unknown;

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		fail(`${filePath}: YAML 최상위 값은 객체여야 합니다.`);
	}

	const manifest = parsed as {
		tasks?: TaskContract[];
		[key: string]: unknown;
	};

	if (!Array.isArray(manifest.tasks)) {
		fail(`${filePath}: tasks 배열이 없습니다.`);
	}

	return manifest as {
		tasks: TaskContract[];
		[key: string]: unknown;
	};
}

function assertRuntimeOnlyMutation(
	beforeContent: string,
	afterContent: string,
	filePath: string,
	patch: TaskRuntimePatch,
): void {
	const before = parseManifest(beforeContent, filePath);

	const after = parseManifest(afterContent, filePath);

	const beforeTask = before.tasks.find((task) => task.id === patch.taskId);

	const afterTask = after.tasks.find((task) => task.id === patch.taskId);

	if (!beforeTask || !afterTask) {
		fail(`${patch.taskId}: 변경 전후 TASK를 찾지 못했습니다.`);
	}

	beforeTask.status = patch.status;
	beforeTask.enabled = patch.enabled;

	if (!beforeTask.metadata) {
		fail(`${patch.taskId}: metadata가 없습니다.`);
	}

	beforeTask.metadata.updated_at = patch.updatedAt;

	if (JSON.stringify(before) !== JSON.stringify(after)) {
		fail(`${patch.taskId}: Runtime 허용 필드 외의 변경이 감지됐습니다.`);
	}
}

function patchTaskRuntimeFields(
	content: string,
	filePath: string,
	patch: TaskRuntimePatch,
): string {
	const block = findTaskBlock(content, patch.taskId);

	const lines = [...block.lines];

	const statusPattern = new RegExp(
		`^${escapeRegExp(block.idIndent)}status:\\s*.*$`,
	);

	const enabledPattern = new RegExp(
		`^${escapeRegExp(block.idIndent)}enabled:\\s*.*$`,
	);

	replaceSingleLine(
		lines,
		block.start,
		block.end,
		statusPattern,
		`${block.idIndent}status: ${patch.status}`,
		`${patch.taskId} status`,
	);

	replaceSingleLine(
		lines,
		block.start,
		block.end,
		enabledPattern,
		`${block.idIndent}enabled: ${patch.enabled}`,
		`${patch.taskId} enabled`,
	);

	const metadataPattern = new RegExp(
		`^${escapeRegExp(block.idIndent)}metadata:\\s*$`,
	);

	const metadataMatches: number[] = [];

	for (let index = block.start; index < block.end; index += 1) {
		if (metadataPattern.test(lines[index])) {
			metadataMatches.push(index);
		}
	}

	if (metadataMatches.length !== 1) {
		fail(`${patch.taskId}: metadata 블록을 정확히 하나 찾지 못했습니다.`);
	}

	const metadataStart = metadataMatches[0];

	let metadataEnd = block.end;

	for (let index = metadataStart + 1; index < block.end; index += 1) {
		const keyMatch = lines[index].match(/^(\s*)[A-Za-z0-9_-]+:\s*/);

		if (keyMatch && keyMatch[1].length <= block.idIndent.length) {
			metadataEnd = index;
			break;
		}
	}

	const updatedMatches: Array<{
		index: number;
		indent: string;
	}> = [];

	for (let index = metadataStart + 1; index < metadataEnd; index += 1) {
		const match = lines[index].match(/^(\s*)updated_at:\s*.*$/);

		if (match) {
			updatedMatches.push({
				index,
				indent: match[1],
			});
		}
	}

	if (updatedMatches.length !== 1) {
		fail(
			`${patch.taskId}: metadata.updated_at 행을 정확히 하나 찾지 못했습니다.`,
		);
	}

	const updated = updatedMatches[0];

	lines[updated.index] = `${updated.indent}updated_at: ${patch.updatedAt}`;

	const result = lines.join("\n");

	assertRuntimeOnlyMutation(content, result, filePath, patch);

	return result;
}

export async function renderTaskRuntimePatches(
	loaded: LoadedTaskManifest,
	patches: TaskRuntimePatch[],
): Promise<FileMutation[]> {
	const patchesByFile = new Map<string, TaskRuntimePatch[]>();

	for (const patch of patches) {
		const source = loaded.sourceByTaskId.get(patch.taskId);

		if (!source) {
			fail(`${patch.taskId}: 원본 Manifest 파일을 찾지 못했습니다.`);
		}

		const existing = patchesByFile.get(source) ?? [];

		existing.push(patch);
		patchesByFile.set(source, existing);
	}

	const mutations: FileMutation[] = [];

	for (const [filePath, filePatches] of [...patchesByFile.entries()].sort(
		(left, right) => left[0].localeCompare(right[0]),
	)) {
		const original = await fs.readFile(filePath, "utf8");

		let candidate = original;

		for (const patch of filePatches.sort((left, right) =>
			left.taskId.localeCompare(right.taskId),
		)) {
			candidate = patchTaskRuntimeFields(candidate, filePath, patch);
		}

		if (candidate !== original) {
			mutations.push({
				filePath,
				content: candidate,
			});
		}
	}

	return mutations;
}

async function removeIfExists(filePath: string): Promise<void> {
	try {
		await fs.unlink(filePath);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
	}
}

async function renameIfExists(from: string, to: string): Promise<boolean> {
	try {
		await fs.rename(from, to);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

export async function writeFilesAtomically(
	mutations: FileMutation[],
): Promise<void> {
	if (mutations.length === 0) {
		return;
	}

	const uniquePaths = new Set(
		mutations.map((mutation) => path.resolve(mutation.filePath)),
	);

	if (uniquePaths.size !== mutations.length) {
		fail("동일 파일에 대한 중복 mutation이 있습니다.");
	}

	const transactionId = `${process.pid}-${randomUUID()}`;

	const prepared: PreparedMutation[] = mutations.map((mutation) => {
		const filePath = path.resolve(mutation.filePath);

		return {
			filePath,
			tempPath: `${filePath}.${transactionId}.tmp`,
			backupPath: `${filePath}.${transactionId}.bak`,
			hadOriginal: false,
			committed: false,
		};
	});

	try {
		for (let index = 0; index < mutations.length; index += 1) {
			const mutation = mutations[index];

			const target = prepared[index];

			await fs.mkdir(path.dirname(target.filePath), {
				recursive: true,
			});

			await fs.writeFile(target.tempPath, mutation.content, "utf8");
		}

		for (const target of prepared) {
			target.hadOriginal = await renameIfExists(
				target.filePath,
				target.backupPath,
			);

			await fs.rename(target.tempPath, target.filePath);

			target.committed = true;
		}

		for (const target of prepared) {
			if (target.hadOriginal) {
				await removeIfExists(target.backupPath);
			}
		}
	} catch (error) {
		for (const target of [...prepared].reverse()) {
			if (target.committed) {
				await removeIfExists(target.filePath);
			}

			if (target.hadOriginal) {
				await renameIfExists(target.backupPath, target.filePath);
			}

			await removeIfExists(target.tempPath);
		}

		throw error;
	} finally {
		for (const target of prepared) {
			await removeIfExists(target.tempPath);

			await removeIfExists(target.backupPath);
		}
	}
}
