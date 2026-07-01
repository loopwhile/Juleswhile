import path from "node:path";

import {
	EXECUTABLE_STATUSES,
	EXECUTE_PROMPT_PATH,
	EXECUTION_APPROVAL_LABEL,
	TASK_INDEX_PATH,
	VERIFY_PROMPT_PATH,
} from "./task-dispatch-contract.js";

import type {
	GitHubIssue,
	TaskContract,
	TaskIndex,
} from "./task-dispatch-contract.js";

import { fail } from "./task-dispatch-error.js";

export function getTask(taskIndex: TaskIndex, taskId: string): TaskContract {
	const matchedTasks = taskIndex.tasks.filter((task) => task.id === taskId);

	if (matchedTasks.length === 0) {
		fail(`${taskId}를 ${TASK_INDEX_PATH}에서 찾을 수 없습니다.`);
	}

	if (matchedTasks.length > 1) {
		fail(`${taskId}가 ${TASK_INDEX_PATH}에 중복 정의돼 있습니다.`);
	}

	return matchedTasks[0];
}

export function validateTaskContract(task: TaskContract, force: boolean): void {
	if (task.kind !== "task") {
		fail(`${task.id}는 실행 TASK가 아니라 Template입니다.`);
	}

	if (!task.enabled && !force) {
		fail(`${task.id}가 비활성화돼 있습니다.`);
	}

	if (!EXECUTABLE_STATUSES.has(task.status) && !force) {
		fail(`${task.id}의 현재 상태는 실행할 수 없습니다: ${task.status}`);
	}

	if (
		task.approval_policy === "human-before-execution" &&
		task.metadata.issue_number === null &&
		!force
	) {
		fail(
			`${task.id}는 실행 전 사람 승인이 필요하지만 추적 Issue가 연결되지 않았습니다.`,
		);
	}

	if (task.type === "correction" && !force) {
		fail(
			"Correction TASK는 기존 Pull Request와 브랜치 정보가 " +
				"필요합니다. Jules CI Fixer 또는 전용 Correction 흐름을 사용하십시오.",
		);
	}

	if (
		!Array.isArray(task.acceptance_criteria) ||
		task.acceptance_criteria.length === 0
	) {
		fail(`${task.id}에 완료 조건이 없습니다.`);
	}

	if (!Array.isArray(task.allowed_paths) || task.allowed_paths.length === 0) {
		fail(`${task.id}에 수정 허용 경로가 없습니다.`);
	}

	if (
		!Array.isArray(task.validation_commands) ||
		task.validation_commands.length === 0
	) {
		fail(`${task.id}에 필수 검증 명령어가 없습니다.`);
	}
}

export function getRoleFilePath(role: string): string {
	return path.join("ops", "roles", `${role}.md`);
}

export function getPromptFilePath(task: TaskContract): string {
	if (
		task.role === "verifier" ||
		task.type === "verification" ||
		task.type === "testing"
	) {
		return VERIFY_PROMPT_PATH;
	}

	return EXECUTE_PROMPT_PATH;
}

export function getIssueLabels(issue: GitHubIssue): Set<string> {
	const labels = issue.labels
		.map((label) => {
			if (typeof label === "string") {
				return label;
			}

			return label.name ?? "";
		})
		.filter((label) => label !== "");

	return new Set(labels);
}

export function validateIssueForDispatch(
	task: TaskContract,
	issue: GitHubIssue,
	dryRun: boolean,
	force: boolean,
): void {
	const labels = getIssueLabels(issue);

	if (
		!dryRun &&
		!force &&
		!labels.has("state:queued") &&
		!labels.has("state:ready") &&
		!labels.has("state:dispatching")
	) {
		fail(`TASK Issue #${issue.number}가 READY 또는 QUEUED 상태가 아닙니다.`);
	}

	if (
		task.approval_policy === "human-before-execution" &&
		!force &&
		!labels.has(EXECUTION_APPROVAL_LABEL)
	) {
		fail(
			`${task.id}는 실행 전 사람 승인이 필요합니다. ` +
				`${EXECUTION_APPROVAL_LABEL} 라벨이 없습니다.`,
		);
	}

	if (labels.has("state:blocked") && !force) {
		fail(`TASK Issue #${issue.number}가 BLOCKED 상태입니다.`);
	}

	if (labels.has("do-not-dispatch") && !force) {
		fail(`TASK Issue #${issue.number}에 do-not-dispatch 라벨이 있습니다.`);
	}
}
