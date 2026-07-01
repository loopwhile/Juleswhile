import type {
	GitHubIssueEvidence,
	TaskContract,
	TaskIndex,
} from "./project-state-projection.js";

const STATE_PRIORITY = [
	"state:completed",
	"state:cancelled",
	"state:failed",
	"state:blocked",
	"state:timeout",
	"state:retry-wait",
	"state:deployment-review",
	"state:deploying",
	"state:merged",
	"state:merge-ready",
	"state:correcting",
	"state:validating",
	"state:pr-opened",
	"state:running",
	"state:dispatching",
	"state:queued",
	"state:ready",
	"state:draft",
] as const;

const LABEL_TO_STATUS: Record<string, string> = {
	"state:draft": "DRAFT",
	"state:ready": "READY",
	"state:queued": "QUEUED",
	"state:dispatching": "DISPATCHING",
	"state:running": "RUNNING",
	"state:pr-opened": "PR_OPENED",
	"state:validating": "VALIDATING",
	"state:correcting": "CORRECTING",
	"state:merge-ready": "MERGE_READY",
	"state:merged": "MERGED",
	"state:deploying": "DEPLOYING",
	"state:completed": "COMPLETED",
	"state:failed": "FAILED",
	"state:timeout": "TIMEOUT",
	"state:retry-wait": "RETRY_WAIT",
	"state:blocked": "BLOCKED",
	"state:deployment-review": "BLOCKED",
	"state:cancelled": "CANCELLED",
};

const TERMINAL_TASK_STATUSES = new Set([
	"COMPLETED",
	"FAILED",
	"TIMEOUT",
	"BLOCKED",
	"CANCELLED",
]);

export interface TaskRuntimePatch {
	taskId: string;
	status: string;
	enabled: boolean;
	updatedAt: string;
	issueNumber: number;
}

export interface RuntimeTaskState {
	status: string;
	enabled: boolean;
	stateLabels: string[];
	updatedAt: string;
}

function fail(message: string): never {
	throw new Error(message);
}

function labelNames(issue: GitHubIssueEvidence): string[] {
	return issue.labels
		.map((label) => (typeof label === "string" ? label : (label.name ?? "")))
		.filter(Boolean);
}

function validTimestamp(value: string, description: string): string {
	const parsed = Date.parse(value);

	if (!Number.isFinite(parsed)) {
		fail(`${description}에 유효하지 않은 timestamp가 있습니다: ${value}`);
	}

	return new Date(parsed).toISOString();
}

function projectedEnabled(status: string): boolean {
	if (status === "DRAFT" || TERMINAL_TASK_STATUSES.has(status)) {
		return false;
	}

	return true;
}

function validateIssueLifecycle(
	task: TaskContract,
	issue: GitHubIssueEvidence,
	status: string,
): void {
	const terminal = TERMINAL_TASK_STATUSES.has(status);

	if (issue.state === "closed" && !terminal) {
		fail(
			`${task.id}: 닫힌 Issue #${issue.number}가 비종료 상태 ${status}입니다.`,
		);
	}

	if (issue.state === "open" && terminal) {
		fail(
			`${task.id}: 열린 Issue #${issue.number}가 종료 상태 ${status}입니다.`,
		);
	}
}

export function selectRuntimeTaskState(
	task: TaskContract,
	issue: GitHubIssueEvidence,
): RuntimeTaskState {
	const stateLabels = labelNames(issue).filter((label) =>
		label.startsWith("state:"),
	);

	if (stateLabels.length !== 1) {
		fail(
			`${task.id}: canonical Issue #${issue.number}의 state 라벨은 정확히 하나여야 합니다: ${stateLabels.join(", ") || "(none)"}`,
		);
	}

	const selectedLabel = STATE_PRIORITY.find((label) =>
		stateLabels.includes(label),
	);

	if (!selectedLabel) {
		fail(`${task.id}: 지원하지 않는 state 라벨입니다: ${stateLabels[0]}`);
	}

	const status = LABEL_TO_STATUS[selectedLabel];

	if (!status) {
		fail(
			`${task.id}: state 라벨을 TASK 상태로 변환하지 못했습니다: ${selectedLabel}`,
		);
	}

	validateIssueLifecycle(task, issue, status);

	return {
		status,
		enabled: projectedEnabled(status),
		stateLabels,
		updatedAt: validTimestamp(
			issue.updated_at,
			`${task.id} Issue #${issue.number}`,
		),
	};
}

export function buildTaskRuntimePatches(
	taskIndex: TaskIndex,
	issues: GitHubIssueEvidence[],
): TaskRuntimePatch[] {
	const issueByNumber = new Map(issues.map((issue) => [issue.number, issue]));

	const patches: TaskRuntimePatch[] = [];

	for (const task of taskIndex.tasks) {
		if (task.kind !== "task") {
			continue;
		}

		const issueNumber = task.metadata?.issue_number;

		if (!Number.isInteger(issueNumber)) {
			fail(`${task.id}: canonical Issue 번호가 없습니다.`);
		}

		const issue = issueByNumber.get(issueNumber as number);

		if (!issue) {
			fail(`${task.id}: canonical Issue #${issueNumber}를 찾지 못했습니다.`);
		}

		const projected = selectRuntimeTaskState(task, issue);

		if (
			task.status === projected.status &&
			task.enabled === projected.enabled
		) {
			continue;
		}

		patches.push({
			taskId: task.id,
			status: projected.status,
			enabled: projected.enabled,
			updatedAt: projected.updatedAt,
			issueNumber: issue.number,
		});
	}

	return patches.sort((left, right) => left.taskId.localeCompare(right.taskId));
}
