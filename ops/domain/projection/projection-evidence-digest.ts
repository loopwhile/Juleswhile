import {
  createHash,
} from "node:crypto";

import type {
  ProjectionInput,
} from "./projection-contract.js";
import {
  labelNames,
} from "./projection-policy.js";
import {
  stableJson,
} from "./projection-state-tools.js";

export function runtimeEvidenceDigest(
  input: ProjectionInput,
): string {
  const tasks = input.taskIndex.tasks
    .filter((task) => task.kind === "task")
    .map((task) => ({
      id: task.id,
      issueNumber:
        task.metadata?.issue_number ?? null,
    }))
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );

  const issues = input.issues
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      htmlUrl: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      labels: labelNames(issue).sort(),
    }))
    .sort(
      (left, right) =>
        left.number - right.number,
    );

  const comments = Object.entries(
    input.commentsByIssue,
  )
    .map(([issueNumber, entries]) => ({
      issueNumber: Number(issueNumber),
      comments: [...entries].sort(
        (left, right) =>
          `${left.created_at}:${left.updated_at ?? ""}:${left.body ?? ""}`
            .localeCompare(
              `${right.created_at}:${right.updated_at ?? ""}:${right.body ?? ""}`,
            ),
      ),
    }))
    .sort(
      (left, right) =>
        left.issueNumber -
        right.issueNumber,
    );

  const pullRequests = [
    ...input.pullRequests,
  ].sort(
    (left, right) =>
      left.number - right.number,
  );

  const sessions = Object.values(
    input.sessionsByName,
  ).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  const evidence = {
    repository: input.repository,
    tasks,
    issues,
    comments,
    pullRequests,
    sessions,
  };

  return `sha256:${createHash("sha256")
    .update(stableJson(evidence))
    .digest("hex")}`;
}
