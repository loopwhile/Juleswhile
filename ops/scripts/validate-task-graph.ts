#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { minimatch } from "minimatch";
import { parse as parseYaml } from "yaml";

const DEFAULT_TASK_INDEX = "ops/tasks/task-index.yaml";

const DEFAULT_PROJECT_STATE =
	"ops/state/project-state.json";

const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;

const GOAL_ID_PATTERN = /^GOAL-[0-9]+$/;

const CORRECTION_ID_PATTERN = /^CORRECTION-[A-Z0-9-]+$/;

const COMPLETED_STATUSES = new Set(["COMPLETED", "MERGED"]);

interface CliOptions {
	mode: "graph" | "pr-scope";
	taskIndexPath: string;
	taskId?: string;
	changeList?: string;
	baseSha?: string;
	headSha?: string;
}

interface TaskContract {
	kind: "task" | "template";
	id: string;
	title: string;
	role: string;
	type: string;
	status: string;
	priority: string;
	enabled: boolean;
	objective: string;
	depends_on: string[];
	inputs: string[];
	outputs: string[];
	acceptance_criteria: string[];
	allowed_paths: string[];
	forbidden_paths: string[];
	validation_commands: string[];
	risk_level: string;
	approval_policy: string;
	parallelizable: boolean;
	resource_locks: string[];
	conflicts_with: string[];
	recurrence?: {
		enabled: boolean;
	};
}

interface TaskIndex {
	schema_version: number;
	project_id: string;
	tasks: TaskContract[];
}

interface ValidationReport {
	mode: string;
	errors: string[];
	warnings: string[];
	summary: Record<string, number | string>;
}

interface ProjectState {
	taskSummary: {
		total: number;
		draft: number;
		ready: number;
		queued: number;
		dispatching: number;
		running: number;
		prOpened: number;
		validating: number;
		correcting: number;
		mergeReady: number;
		merged: number;
		deploying: number;
		completed: number;
		failed: number;
		timeout: number;
		retryWait: number;
		blocked: number;
		cancelled: number;
		templates: number;
	};
}

function fail(message: string): never {
	throw new Error(message);
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];

	if (value === undefined || value.startsWith("--")) {
		fail(`${flag} 옵션에 값이 필요합니다.`);
	}

	return value;
}

function parseArguments(argv: string[]): CliOptions {
	let mode: CliOptions["mode"] = "graph";

	let taskIndexPath = DEFAULT_TASK_INDEX;

	let taskId: string | undefined;
	let changeList: string | undefined;
	let baseSha: string | undefined;
	let headSha: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--mode": {
				const value = requireValue(argv, index, argument);

				if (value !== "graph" && value !== "pr-scope") {
					fail("mode는 graph 또는 pr-scope여야 합니다.");
				}

				mode = value;
				index += 1;
				break;
			}

			case "--task-index": {
				taskIndexPath = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--task-id": {
				taskId = requireValue(argv, index, argument).toUpperCase();

				index += 1;
				break;
			}

			case "--change-list": {
				changeList = requireValue(argv, index, argument);

				index += 1;
				break;
			}

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

			default: {
				fail(`지원하지 않는 옵션입니다: ${argument}`);
			}
		}
	}

	if (mode === "pr-scope") {
		if (!taskId) {
			fail("pr-scope 모드에는 --task-id가 필요합니다.");
		}

		if (!changeList) {
			fail("pr-scope 모드에는 --change-list가 필요합니다.");
		}
	}

	return {
		mode,
		taskIndexPath,
		taskId,
		changeList,
		baseSha,
		headSha,
	};
}

async function readTaskIndex(filePath: string): Promise<TaskIndex> {
	const content = await fs.readFile(filePath, "utf8");

	const parsed = parseYaml(content) as TaskIndex;

	if (!Array.isArray(parsed.tasks)) {
		fail(`${filePath}에 tasks 배열이 없습니다.`);
	}

	return parsed;
}

async function readProjectState(): Promise<ProjectState> {
	const content = await fs.readFile(
		DEFAULT_PROJECT_STATE,
		"utf8",
	);

	const parsed = JSON.parse(content) as ProjectState;

	if (
		!parsed.taskSummary ||
		typeof parsed.taskSummary !== "object"
	) {
		fail(
			`${DEFAULT_PROJECT_STATE}에 taskSummary가 없습니다.`,
		);
	}

	return parsed;
}

function normalizePath(filePath: string): string {
	return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function matchesPattern(filePath: string, pattern: string): boolean {
	const normalizedFile = normalizePath(filePath);

	const normalizedPattern = normalizePath(pattern);

	return minimatch(normalizedFile, normalizedPattern, {
		dot: true,
		nocase: false,
		matchBase: false,
	});
}

function overlapsPattern(left: string, right: string): boolean {
	const normalizedLeft = normalizePath(left);

	const normalizedRight = normalizePath(right);

	const leftRoot = normalizedLeft
		.replace(/[*?[\]{}()!+@].*$/, "")
		.replace(/\/+$/, "");

	const rightRoot = normalizedRight
		.replace(/[*?[\]{}()!+@].*$/, "")
		.replace(/\/+$/, "");

	if (leftRoot === "" || rightRoot === "") {
		return true;
	}

	return (
		leftRoot === rightRoot ||
		leftRoot.startsWith(`${rightRoot}/`) ||
		rightRoot.startsWith(`${leftRoot}/`)
	);
}

function detectCycles(taskMap: Map<string, TaskContract>): string[] {
	const errors: string[] = [];

	const state = new Map<string, "unvisited" | "visiting" | "visited">();

	const stack: string[] = [];

	const visit = (taskId: string): void => {
		const currentState = state.get(taskId) ?? "unvisited";

		if (currentState === "visited") {
			return;
		}

		if (currentState === "visiting") {
			const cycleStart = stack.indexOf(taskId);

			const cycle = [...stack.slice(cycleStart), taskId];

			errors.push(`순환 의존성: ${cycle.join(" -> ")}`);

			return;
		}

		state.set(taskId, "visiting");

		stack.push(taskId);

		const task = taskMap.get(taskId);

		for (const dependency of task?.depends_on ?? []) {
			if (taskMap.has(dependency)) {
				visit(dependency);
			}
		}

		stack.pop();

		state.set(taskId, "visited");
	};

	for (const taskId of taskMap.keys()) {
		visit(taskId);
	}

	return errors;
}

async function roleFileExists(role: string): Promise<boolean> {
	try {
		await fs.access(path.join("ops", "roles", `${role}.md`));

		return true;
	} catch {
		return false;
	}
}

async function validateGraph(taskIndex: TaskIndex): Promise<ValidationReport> {
	const errors: string[] = [];
	const warnings: string[] = [];

	const taskMap = new Map<string, TaskContract>();

	for (const task of taskIndex.tasks) {
		if (!TASK_ID_PATTERN.test(task.id)) {
			errors.push(`잘못된 TASK ID: ${task.id}`);
		}

		if (taskMap.has(task.id)) {
			errors.push(`중복 TASK ID: ${task.id}`);
		}

		taskMap.set(task.id, task);

		if (!(await roleFileExists(task.role))) {
			errors.push(
				`${task.id}: 역할 계약 파일이 없습니다: ops/roles/${task.role}.md`,
			);
		}

		if (task.depends_on.includes(task.id)) {
			errors.push(`${task.id}: 자기 자신을 의존합니다.`);
		}

		if (task.conflicts_with.includes(task.id)) {
			errors.push(`${task.id}: 자기 자신과 충돌하도록 정의됐습니다.`);
		}

		if (task.kind === "template") {
			if (task.status !== "TEMPLATE") {
				errors.push(`${task.id}: Template 상태는 TEMPLATE이어야 합니다.`);
			}

			if (task.enabled) {
				errors.push(`${task.id}: Template은 enabled=false여야 합니다.`);
			}

			if (!task.recurrence) {
				errors.push(`${task.id}: Template에 recurrence가 없습니다.`);
			}
		}

		if (task.kind === "task" && task.status === "TEMPLATE") {
			errors.push(`${task.id}: 실행 TASK가 TEMPLATE 상태입니다.`);
		}

		if (task.kind === "task") {
			const unresolvedValues = [
				...task.inputs,
				...task.outputs,
				...task.allowed_paths,
				...task.forbidden_paths,
				...task.resource_locks,
			].filter((value) => /\{\{[A-Za-z0-9_]+\}\}/.test(value));

			if (unresolvedValues.length > 0) {
				errors.push(
					`${task.id}: 실행 TASK에 치환되지 않은 Template 변수가 있습니다: ${unresolvedValues.join(", ")}`,
				);
			}
		}

		if (task.status === "READY" && !task.enabled) {
			errors.push(`${task.id}: READY TASK는 enabled=true여야 합니다.`);
		}

		if (
			task.risk_level === "critical" &&
			!["human", "human-before-execution"].includes(task.approval_policy)
		) {
			errors.push(`${task.id}: Critical TASK는 사람 승인이 필요합니다.`);
		}

		if (task.risk_level === "high" && task.approval_policy === "automatic") {
			errors.push(`${task.id}: High-risk TASK는 자동 승인할 수 없습니다.`);
		}

		if (task.allowed_paths.length === 0) {
			errors.push(`${task.id}: allowed_paths가 비어 있습니다.`);
		}

		if (task.acceptance_criteria.length === 0) {
			errors.push(`${task.id}: 완료 조건이 없습니다.`);
		}

		if (task.validation_commands.length === 0) {
			errors.push(`${task.id}: 검증 명령어가 없습니다.`);
		}
	}

	for (const task of taskIndex.tasks) {
		for (const dependency of task.depends_on) {
			if (!taskMap.has(dependency)) {
				errors.push(`${task.id}: 존재하지 않는 의존 TASK ${dependency}`);
			}
		}

		for (const conflict of task.conflicts_with) {
			if (!taskMap.has(conflict)) {
				errors.push(`${task.id}: 존재하지 않는 충돌 TASK ${conflict}`);
			}
		}

		if (task.status === "READY") {
			for (const dependencyId of task.depends_on) {
				const dependency = taskMap.get(dependencyId);

				if (dependency && !COMPLETED_STATUSES.has(dependency.status)) {
					errors.push(
						`${task.id}: 미완료 선행 TASK ${dependencyId}가 있는데 READY 상태입니다.`,
					);
				}
			}
		}
	}

	errors.push(...detectCycles(taskMap));

	const readyParallelTasks = taskIndex.tasks.filter(
		(task) =>
			task.kind === "task" &&
			task.enabled &&
			task.status === "READY" &&
			task.parallelizable,
	);

	for (
		let leftIndex = 0;
		leftIndex < readyParallelTasks.length;
		leftIndex += 1
	) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < readyParallelTasks.length;
			rightIndex += 1
		) {
			const left = readyParallelTasks[leftIndex];

			const right = readyParallelTasks[rightIndex];

			const sharedLock = left.resource_locks.some((lock) =>
				right.resource_locks.includes(lock),
			);

			const overlappingPath = left.allowed_paths.some((leftPath) =>
				right.allowed_paths.some((rightPath) =>
					overlapsPattern(leftPath, rightPath),
				),
			);

			if (sharedLock || overlappingPath) {
				warnings.push(
					`${left.id}와 ${right.id}는 parallelizable=true이지만 경로나 Resource Lock이 겹칠 수 있습니다.`,
				);
			}
		}
	}

	const summary = {
		total: taskIndex.tasks.length,
		tasks: taskIndex.tasks.filter(
			(task) => task.kind === "task",
		).length,
		templates: taskIndex.tasks.filter(
			(task) => task.kind === "template",
		).length,
		ready: taskIndex.tasks.filter(
			(task) =>
				task.kind === "task" &&
				task.status === "READY",
		).length,
		blocked: taskIndex.tasks.filter(
			(task) =>
				task.kind === "task" &&
				task.status === "BLOCKED",
		).length,
	};

	const projectState = await readProjectState();

	const expectedStaticSummary = {
		total: summary.tasks,
		templates: summary.templates,
	};

	for (const [
		field,
		expected,
	] of Object.entries(expectedStaticSummary)) {
		const actual =
			projectState.taskSummary[
				field as keyof ProjectState["taskSummary"]
			];

		if (actual !== expected) {
			errors.push(
				`project-state taskSummary.${field} 불일치: ` +
					`expected=${expected}, actual=${actual}`,
			);
		}
	}

	const lifecycleFields = [
		"draft",
		"ready",
		"queued",
		"dispatching",
		"running",
		"prOpened",
		"validating",
		"correcting",
		"mergeReady",
		"merged",
		"deploying",
		"completed",
		"failed",
		"timeout",
		"retryWait",
		"blocked",
		"cancelled",
	] as const;

	const projectedTaskTotal =
		lifecycleFields.reduce(
			(total, field) =>
				total +
				projectState.taskSummary[field],
			0,
		);

	if (
		projectedTaskTotal !==
		projectState.taskSummary.total
	) {
		errors.push(
			`project-state lifecycle 합계 불일치: expected=${projectState.taskSummary.total}, actual=${projectedTaskTotal}`,
		);
	}

	return {
		mode: "graph",
		errors,
		warnings,
		summary,
	};
}

async function validatePrScope(
	taskIndex: TaskIndex,
	options: CliOptions,
): Promise<ValidationReport> {
	const errors: string[] = [];
	const warnings: string[] = [];

	const taskId = options.taskId as string;

	const changeListPath = options.changeList as string;

	const content = await fs.readFile(changeListPath, "utf8");

	const changedFiles = content
		.split(/\r?\n/)
		.map(normalizePath)
		.filter(Boolean);

	if (changedFiles.length === 0) {
		errors.push("변경 파일 목록이 비어 있습니다.");
	}

	const protectedPatterns = [
		"AGENTS.md",
		".github/workflows/**",
		".github/ISSUE_TEMPLATE/**",
		".github/pull_request_template.md",
		"ops/schemas/**",
		"ops/scripts/**",
		"package.json",
		"package-lock.json",
		"netlify.toml",
	];

	if (TASK_ID_PATTERN.test(taskId)) {
		const task = taskIndex.tasks.find((item) => item.id === taskId);

		if (!task) {
			errors.push(`${taskId}를 TASK Manifest에서 찾을 수 없습니다.`);
		} else {
			for (const file of changedFiles) {
				const forbidden = task.forbidden_paths.some((pattern) =>
					matchesPattern(file, pattern),
				);

				if (forbidden) {
					errors.push(`${taskId}: 금지 경로가 변경됐습니다: ${file}`);

					continue;
				}

				const allowed = task.allowed_paths.some((pattern) =>
					matchesPattern(file, pattern),
				);

				if (!allowed) {
					errors.push(`${taskId}: 허용 범위 밖의 파일이 변경됐습니다: ${file}`);
				}
			}

			const protectedChange = changedFiles.filter((file) =>
				protectedPatterns.some((pattern) => matchesPattern(file, pattern)),
			);

			if (
				protectedChange.length > 0 &&
				!["human", "human-before-execution"].includes(task.approval_policy)
			) {
				errors.push(
					`${taskId}: 제어 평면 변경에는 사람 승인 정책이 필요합니다: ${protectedChange.join(", ")}`,
				);
			}
		}
	} else if (GOAL_ID_PATTERN.test(taskId)) {
		const goalAllowedPatterns = [
			"PROJECT_GOAL.md",
			"docs/**",
			"ops/tasks/task-index.yaml",
			"ops/state/project-state.json",
		];

		for (const file of changedFiles) {
			if (
				!goalAllowedPatterns.some((pattern) => matchesPattern(file, pattern))
			) {
				errors.push(
					`${taskId}: Goal Intake PR의 허용 범위 밖 파일입니다: ${file}`,
				);
			}
		}
	} else if (CORRECTION_ID_PATTERN.test(taskId)) {
		for (const file of changedFiles) {
			const protectedChange = protectedPatterns.some((pattern) =>
				matchesPattern(file, pattern),
			);

			if (protectedChange) {
				errors.push(
					`${taskId}: Correction PR은 제어 평면을 수정할 수 없습니다: ${file}`,
				);
			}
		}

		warnings.push(
			"Correction PR의 세부 허용 경로는 원본 TASK와 Reviewer가 추가 검증해야 합니다.",
		);
	} else {
		errors.push(`지원하지 않는 PR 식별자입니다: ${taskId}`);
	}

	return {
		mode: "pr-scope",
		errors,
		warnings,
		summary: {
			taskId,
			changedFiles: changedFiles.length,
			baseSha: options.baseSha ?? "",
			headSha: options.headSha ?? "",
		},
	};
}

function printReport(report: ValidationReport): void {
	console.log(`Mode: ${report.mode}`);

	for (const warning of report.warnings) {
		console.warn(`WARNING: ${warning}`);
	}

	for (const error of report.errors) {
		console.error(`ERROR: ${error}`);
	}

	console.log(`Summary: ${JSON.stringify(report.summary)}`);
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));

	const taskIndex = await readTaskIndex(options.taskIndexPath);

	const report =
		options.mode === "graph"
			? await validateGraph(taskIndex)
			: await validatePrScope(taskIndex, options);

	printReport(report);

	if (report.errors.length > 0) {
		process.exitCode = 1;
		return;
	}

	console.log("Juleswhile TASK 검증을 통과했습니다.");
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`TASK 검증 실패: ${message}`);

	process.exitCode = 1;
});
