import type {
  GitHubCommentEvidence,
  GitHubIssueEvidence,
  TaskIndex,
} from "./projection-contract.js";

import {
  ACTIVE_TASK_STATUSES,
  selectTaskStatus,
} from "./projection-policy.js";
import {
  parseTimestamp,
  readField,
} from "./projection-state-tools.js";

const TASK_DISPATCH_MARKER =
  "<!-- juleswhile:task-dispatch -->";

interface SessionMarker {
  name: string;
  id: string;
  url: string;
  state: string;
  createdAt: string;
}

export function latestSessionMarker(
  comments: GitHubCommentEvidence[],
): SessionMarker | null {
  const markers = comments
    .map((comment) => {
      const body = comment.body ?? "";

      if (!body.includes(TASK_DISPATCH_MARKER)) {
        return null;
      }

      const tableName =
        body.match(
          /\|\s*Session\s*\|\s*`([^`]+)`\s*\|/i,
        )?.[1] ?? "";

      const tableId =
        body.match(
          /\|\s*Session ID\s*\|\s*`([^`]+)`\s*\|/i,
        )?.[1] ?? "";

      const tableState =
        body.match(
          /\|\s*Session 상태\s*\|\s*`([^`]+)`\s*\|/i,
        )?.[1] ?? "";

      const markdownUrl =
        body.match(
          /\[Jules Session 열기\]\(([^)]+)\)/i,
        )?.[1] ?? "";

      const name =
        readField(body, "session_name") ||
        tableName;

      const id =
        readField(body, "session_id") ||
        tableId ||
        name.split("/").at(-1) ||
        "";

      if (name === "" || id === "") {
        return null;
      }

      return {
        name,
        id,
        url:
          readField(body, "session_url") ||
          markdownUrl,
        state:
          readField(body, "session_state") ||
          readField(body, "state") ||
          tableState ||
          "UNKNOWN",
        createdAt: comment.created_at,
      };
    })
    .filter(
      (
        marker,
      ): marker is NonNullable<typeof marker> =>
        marker !== null,
    )
    .sort(
      (left, right) =>
        parseTimestamp(right.createdAt) -
        parseTimestamp(left.createdAt),
    );

  return markers[0] ?? null;
}

export function activeSessionNamesFromEvidence(
  taskIndex: TaskIndex,
  issues: GitHubIssueEvidence[],
  commentsByIssue: Record<
    number,
    GitHubCommentEvidence[]
  >,
): string[] {
  const issueByNumber = new Map(
    issues.map((issue) => [
      issue.number,
      issue,
    ]),
  );

  const names = new Set<string>();

  for (const task of taskIndex.tasks) {
    if (task.kind !== "task") {
      continue;
    }

    const issueNumber =
      task.metadata?.issue_number;

    if (!Number.isInteger(issueNumber)) {
      continue;
    }

    const issue = issueByNumber.get(
      issueNumber as number,
    );

    if (!issue) {
      continue;
    }

    const projectedStatus =
      selectTaskStatus(
        task,
        issue,
      ).status;

    if (
      !ACTIVE_TASK_STATUSES.has(
        projectedStatus,
      )
    ) {
      continue;
    }

    const marker =
      latestSessionMarker(
        commentsByIssue[
          issueNumber as number
        ] ?? [],
      );

    if (marker) {
      names.add(marker.name);
    }
  }

  return [...names].sort();
}
