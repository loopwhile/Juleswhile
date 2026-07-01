import type {
  GitHubIssueEvidence,
  TaskContract,
} from "./projection-contract.js";

const TASK_ID_PATTERN =
  /\b(TASK-[0-9]{3,})\b/i;

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

export const STATUS_TO_SUMMARY: Record<string, string> = {
  DRAFT: "draft",
  READY: "ready",
  QUEUED: "queued",
  DISPATCHING: "dispatching",
  RUNNING: "running",
  PR_OPENED: "prOpened",
  VALIDATING: "validating",
  CORRECTING: "correcting",
  MERGE_READY: "mergeReady",
  MERGED: "merged",
  DEPLOYING: "deploying",
  COMPLETED: "completed",
  FAILED: "failed",
  TIMEOUT: "timeout",
  RETRY_WAIT: "retryWait",
  BLOCKED: "blocked",
  CANCELLED: "cancelled",
};

export const ACTIVE_TASK_STATUSES = new Set([
  "QUEUED",
  "DISPATCHING",
  "RUNNING",
  "PR_OPENED",
  "VALIDATING",
  "CORRECTING",
  "MERGE_READY",
  "MERGED",
  "DEPLOYING",
]);

export const TERMINAL_TASK_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "TIMEOUT",
  "BLOCKED",
  "CANCELLED",
]);

const SESSION_STATES = new Set([
  "QUEUED",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
]);

export function labelNames(
  issue: GitHubIssueEvidence,
): string[] {
  return issue.labels
    .map((label) =>
      typeof label === "string"
        ? label
        : label.name ?? "",
    )
    .filter(Boolean);
}

export function emptyTaskSummary(
  taskTotal: number,
  templateTotal: number,
): Record<string, number> {
  return {
    total: taskTotal,
    draft: 0,
    ready: 0,
    queued: 0,
    dispatching: 0,
    running: 0,
    prOpened: 0,
    validating: 0,
    correcting: 0,
    mergeReady: 0,
    merged: 0,
    deploying: 0,
    completed: 0,
    failed: 0,
    timeout: 0,
    retryWait: 0,
    blocked: 0,
    cancelled: 0,
    templates: templateTotal,
  };
}

export function selectTaskStatus(
  task: TaskContract,
  issue: GitHubIssueEvidence,
): {
  status: string;
  stateLabels: string[];
} {
  const stateLabels = labelNames(issue)
    .filter((label) =>
      label.startsWith("state:"),
    );

  const selectedLabel =
    STATE_PRIORITY.find((label) =>
      stateLabels.includes(label),
    );

  return {
    status:
      selectedLabel === undefined
        ? task.status
        : LABEL_TO_STATUS[selectedLabel] ??
          task.status,
    stateLabels,
  };
}

export function taskIdFromText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const match = value?.match(TASK_ID_PATTERN);

    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

export function normalizeSessionState(
  state: string,
): string {
  const normalized =
    state.trim().toUpperCase();

  return SESSION_STATES.has(normalized)
    ? normalized
    : "UNKNOWN";
}
