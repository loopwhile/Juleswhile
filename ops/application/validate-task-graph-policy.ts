import {
	COMPLETED_STATUSES,
	TASK_ID_PATTERN,
} from "../domain/task-validation/task-validation-contract.js";

import type {
	ProjectState,
	TaskContract,
	TaskIndex,
	ValidationReport,
} from "../domain/task-validation/task-validation-contract.js";

import { detectCycles } from "../domain/task-validation/task-graph-policy.js";

import { overlapsPattern } from "../domain/task-validation/task-path-policy.js";

import {
	readProjectState,
	roleFileExists,
} from "../infrastructure/filesystem/task-validation-filesystem-adapter.js";

export async function validateGraph(
	taskIndex: TaskIndex,
): Promise<ValidationReport> {
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
		tasks: taskIndex.tasks.filter((task) => task.kind === "task").length,
		templates: taskIndex.tasks.filter((task) => task.kind === "template")
			.length,
		ready: taskIndex.tasks.filter(
			(task) => task.kind === "task" && task.status === "READY",
		).length,
		blocked: taskIndex.tasks.filter(
			(task) => task.kind === "task" && task.status === "BLOCKED",
		).length,
	};

	const projectState = await readProjectState();

	const expectedStaticSummary = {
		total: summary.tasks,
		templates: summary.templates,
	};

	for (const [field, expected] of Object.entries(expectedStaticSummary)) {
		const actual =
			projectState.taskSummary[field as keyof ProjectState["taskSummary"]];

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

	const projectedTaskTotal = lifecycleFields.reduce(
		(total, field) => total + projectState.taskSummary[field],
		0,
	);

	if (projectedTaskTotal !== projectState.taskSummary.total) {
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
