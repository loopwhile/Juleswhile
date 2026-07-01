import {
  ACTIVE_LABELS,
  COMPLETED_STATUSES,
  type GitHubIssue,
  type TaskContract,
} from "./task-selection-contract.js";

export function getLabels(
  issue: GitHubIssue,
): Set<string> {
  return new Set(
    issue.labels
      .map((label) => {
        if (typeof label === "string") {
          return label;
        }

        return label.name ?? "";
      })
      .filter(Boolean),
  );
}

export function getTaskIdFromIssue(
  issue: GitHubIssue,
): string | null {
  const body = issue.body ?? "";

  const markerMatch = body.match(
    /<!--\s*juleswhile:task-id:(TASK-[0-9]{3,})\s*-->/i,
  );

  if (markerMatch) {
    return markerMatch[1].toUpperCase();
  }

  if (!getLabels(issue).has("juleswhile:task")) {
    return null;
  }

  const titleMatch = issue.title.match(
    /\b(TASK-[0-9]{3,})\b/i,
  );

  return titleMatch
    ? titleMatch[1].toUpperCase()
    : null;
}

export function buildIssueMap(
  issues: GitHubIssue[],
): Map<string, GitHubIssue> {
  const issueMap =
    new Map<string, GitHubIssue>();

  for (const issue of issues) {
    const taskId =
      getTaskIdFromIssue(issue);

    if (!taskId) {
      continue;
    }

    const existing =
      issueMap.get(taskId);

    if (!existing) {
      issueMap.set(taskId, issue);
      continue;
    }

    const existingLabels =
      getLabels(existing);

    const currentLabels =
      getLabels(issue);

    const existingCompleted =
      existingLabels.has("state:completed");

    const currentCompleted =
      currentLabels.has("state:completed");

    if (
      currentCompleted &&
      !existingCompleted
    ) {
      issueMap.set(taskId, issue);
      continue;
    }

    if (
      issue.number < existing.number &&
      currentCompleted === existingCompleted
    ) {
      issueMap.set(taskId, issue);
    }
  }

  return issueMap;
}

export function isCompleted(
  task: TaskContract,
  issue: GitHubIssue | undefined,
): boolean {
  if (
    COMPLETED_STATUSES.has(task.status)
  ) {
    return true;
  }

  if (!issue) {
    return false;
  }

  const labels = getLabels(issue);

  return (
    labels.has("state:completed") ||
    (
      issue.state === "closed" &&
      labels.has("deployment:ready")
    )
  );
}

export function isActiveIssue(
  issue: GitHubIssue,
): boolean {
  if (issue.state !== "open") {
    return false;
  }

  const labels = getLabels(issue);

  return [...ACTIVE_LABELS].some(
    (label) => labels.has(label),
  );
}

export function isBlockedIssue(
  issue: GitHubIssue,
): boolean {
  const labels = getLabels(issue);

  return (
    labels.has("state:blocked") ||
    labels.has("do-not-dispatch") ||
    labels.has("human-decision-required")
  );
}

export function isReadyIssue(
  issue: GitHubIssue,
): boolean {
  if (issue.state !== "open") {
    return false;
  }

  const labels = getLabels(issue);

  return (
    labels.has("state:ready") ||
    labels.has("state:retry-wait")
  );
}
