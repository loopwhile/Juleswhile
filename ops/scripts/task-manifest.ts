import { promises as fs } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

export interface TaskContract {
	kind: "task" | "template";
	id: string;
	title?: string;
	role?: string;
	type?: string;
	status?: string;
	priority?: string;
	enabled?: boolean;
	objective?: string;
	depends_on?: string[];
	inputs?: string[];
	outputs?: string[];
	acceptance_criteria?: string[];
	allowed_paths?: string[];
	forbidden_paths?: string[];
	forbidden_actions?: string[];
	validation_commands?: string[];
	risk_level?: string;
	approval_policy?: string;
	parallelizable?: boolean;
	resource_locks?: string[];
	conflicts_with?: string[];
	retry_policy?: {
		max_corrections?: number;
		timeout_minutes?: number;
	};
	stitch?: {
		allowed?: boolean;
		required?: boolean;
		expected_outputs?: string[];
	};
	recurrence?: {
		enabled: boolean;
		schedule?: string;
		timezone?: string;
		instance_id_strategy?: string;
		max_instances_per_day?: number;
	};
	metadata?: {
		goal_issue_number?: number | null;
		issue_number?: number | null;
		created_at?: string;
		updated_at?: string;
		created_by?: string;
		tags?: string[];
		template_id?: string | null;
		instance_key?: string | null;
	};
}

export interface TaskManifest {
	schema_version?: number;
	project_id?: string;
	generated_at?: string;
	updated_at?: string;
	defaults?: unknown;
	includes?: string[];
	tasks: TaskContract[];
}

export interface LoadedTaskManifest {
	rootPath: string;
	manifest: TaskManifest;
	sourceByTaskId: ReadonlyMap<string, string>;
	files: string[];
}

function fail(message: string): never {
	throw new Error(message);
}

function normalizeInclude(includePath: string): string {
	const normalized = includePath.replaceAll("\\", "/");

	if (
		normalized.startsWith("/") ||
		normalized.startsWith("../") ||
		normalized.includes("/../") ||
		normalized === ".." ||
		normalized.trim() === ""
	) {
		fail(`안전하지 않은 TASK include 경로입니다: ${includePath}`);
	}

	return normalized;
}

async function readYamlObject(
	filePath: string,
): Promise<Record<string, unknown>> {
	const content = await fs.readFile(filePath, "utf8");
	const parsed = parseYaml(content) as unknown;

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		fail(`${filePath}의 최상위 값은 객체여야 합니다.`);
	}

	return parsed as Record<string, unknown>;
}

function registerTaskSources(
	tasks: TaskContract[],
	filePath: string,
	sourceByTaskId: Map<string, string>,
): void {
	for (const task of tasks) {
		if (typeof task.id !== "string" || task.id.trim() === "") {
			fail(`${filePath}에 ID가 없는 TASK가 있습니다.`);
		}

		const existingSource = sourceByTaskId.get(task.id);

		if (existingSource) {
			fail(`중복 TASK ID ${task.id}: ${existingSource}, ${filePath}`);
		}

		sourceByTaskId.set(task.id, filePath);
	}
}

async function loadManifestFile(
	filePath: string,
	seen: Set<string>,
	sourceByTaskId: Map<string, string>,
	files: Set<string>,
): Promise<TaskManifest> {
	const absolutePath = path.resolve(filePath);

	if (seen.has(absolutePath)) {
		fail(`TASK include 순환 참조가 감지됐습니다: ${filePath}`);
	}

	seen.add(absolutePath);
	files.add(absolutePath);

	const parsed = await readYamlObject(absolutePath);

	const baseDirectory = path.dirname(absolutePath);

	const includes = Array.isArray(parsed.includes)
		? parsed.includes.map((includePath) => {
				if (typeof includePath !== "string") {
					fail(`${filePath} includes 항목은 문자열이어야 합니다.`);
				}

				return normalizeInclude(includePath);
			})
		: [];

	const ownTasks = Array.isArray(parsed.tasks)
		? (parsed.tasks as TaskContract[])
		: [];

	registerTaskSources(ownTasks, absolutePath, sourceByTaskId);

	const includedTasks: TaskContract[] = [];

	for (const includePath of includes) {
		const childManifest = await loadManifestFile(
			path.join(baseDirectory, includePath),
			seen,
			sourceByTaskId,
			files,
		);

		includedTasks.push(...childManifest.tasks);
	}

	seen.delete(absolutePath);

	return {
		...(parsed as Omit<TaskManifest, "tasks">),
		includes,
		tasks: [...ownTasks, ...includedTasks],
	};
}

export async function loadTaskManifestWithSources(
	filePath = "ops/tasks/task-index.yaml",
): Promise<LoadedTaskManifest> {
	const rootPath = path.resolve(filePath);
	const sourceByTaskId = new Map<string, string>();

	const files = new Set<string>();

	const manifest = await loadManifestFile(
		rootPath,
		new Set<string>(),
		sourceByTaskId,
		files,
	);

	if (!Array.isArray(manifest.tasks)) {
		fail(`${filePath}에 tasks 배열이 없습니다.`);
	}

	return {
		rootPath,
		manifest,
		sourceByTaskId,
		files: [...files].sort(),
	};
}

export async function loadTaskManifest(
	filePath = "ops/tasks/task-index.yaml",
): Promise<TaskManifest> {
	const loaded = await loadTaskManifestWithSources(filePath);

	return loaded.manifest;
}
