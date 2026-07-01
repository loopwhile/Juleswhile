import type {
  GitHubIssueEvidence,
  ProjectionDrift,
  ProjectionInput,
  ProjectionResult,
} from "../domain/projection/projection-contract.js";
import {
  ACTIVE_TASK_STATUSES,
  STATUS_TO_SUMMARY,
  TERMINAL_TASK_STATUSES,
  emptyTaskSummary,
  labelNames,
  normalizeSessionState,
  selectTaskStatus,
  taskIdFromText,
} from "../domain/projection/projection-policy.js";
import {
  runtimeEvidenceDigest,
} from "../domain/projection/projection-evidence-digest.js";
import {
  projectQuotaUsage,
} from "../domain/projection/projection-quota.js";
import {
  latestSessionMarker,
} from "../domain/projection/projection-session-evidence.js";
import {
  maxObservedAt,
  parseTimestamp,
  semanticState,
  stableJson,
} from "../domain/projection/projection-state-tools.js";

const CORRECTION_MARKER =
  "<!-- juleswhile:correction-attempt -->";

export function projectRuntimeState(
  input: ProjectionInput,
): ProjectionResult {
  const tasks = input.taskIndex.tasks.filter(
    (task) => task.kind === "task",
  );
  const templates =
    input.taskIndex.tasks.filter(
      (task) => task.kind === "template",
    );
  const issueByNumber = new Map(
    input.issues.map((issue) => [
      issue.number,
      issue,
    ]),
  );
  const taskById = new Map(
    tasks.map((task) => [
      task.id,
      task,
    ]),
  );
  const canonicalIssueNumbers =
    new Set<number>();
  for (const task of tasks) {
    const issueNumber =
      task.metadata?.issue_number;
    if (Number.isInteger(issueNumber)) {
      canonicalIssueNumbers.add(
        issueNumber as number,
      );
    }
  }
  const drift: ProjectionDrift = {
    stateLabelConflicts: [],
    missingCanonicalIssues: [],
    supersededIssues: [],
    manifestMismatches: [],
    issueLifecycleMismatches: [],
  };
  const summary = emptyTaskSummary(
    tasks.length,
    templates.length,
  );
  const projectedStatusByTask =
    new Map<string, string>();
  const canonicalIssueByTask =
    new Map<string, GitHubIssueEvidence>();
  for (const task of tasks) {
    const issueNumber =
      task.metadata?.issue_number;
    const issue =
      Number.isInteger(issueNumber)
        ? issueByNumber.get(
            issueNumber as number,
          )
        : undefined;
    if (!issue) {
      drift.missingCanonicalIssues.push({
        taskId: task.id,
        issueNumber:
          Number.isInteger(issueNumber)
            ? (issueNumber as number)
            : null,
      });
      projectedStatusByTask.set(
        task.id,
        task.status,
      );
      const summaryKey =
        STATUS_TO_SUMMARY[task.status];
      if (summaryKey) {
        summary[summaryKey] += 1;
      }
      continue;
    }
    canonicalIssueByTask.set(
      task.id,
      issue,
    );
    const selection =
      selectTaskStatus(task, issue);
    projectedStatusByTask.set(
      task.id,
      selection.status,
    );
    const summaryKey =
      STATUS_TO_SUMMARY[selection.status];
    if (summaryKey) {
      summary[summaryKey] += 1;
    }
    if (selection.stateLabels.length !== 1) {
      drift.stateLabelConflicts.push({
        taskId: task.id,
        issueNumber: issue.number,
        labels: selection.stateLabels,
        selectedStatus: selection.status,
      });
    }
    if (task.status !== selection.status) {
      drift.manifestMismatches.push({
        taskId: task.id,
        issueNumber: issue.number,
        manifestStatus: task.status,
        projectedStatus: selection.status,
      });
    }
    if (
      issue.state === "closed" &&
      !TERMINAL_TASK_STATUSES.has(
        selection.status,
      )
    ) {
      drift.issueLifecycleMismatches.push({
        taskId: task.id,
        issueNumber: issue.number,
        issueState: issue.state,
        projectedStatus: selection.status,
      });
    }
    if (
      issue.state === "open" &&
      TERMINAL_TASK_STATUSES.has(
        selection.status,
      )
    ) {
      drift.issueLifecycleMismatches.push({
        taskId: task.id,
        issueNumber: issue.number,
        issueState: issue.state,
        projectedStatus: selection.status,
      });
    }
  }
  drift.supersededIssues = input.issues
    .filter((issue) => {
      const labels = labelNames(issue);
      return (
        labels.includes("juleswhile:task") &&
        !canonicalIssueNumbers.has(
          issue.number,
        )
      );
    })
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      stateLabels: labelNames(issue).filter(
        (label) =>
          label.startsWith("state:"),
      ),
    }))
    .sort(
      (left, right) =>
        left.number - right.number,
    );
  const activeSessions = tasks
    .filter((task) =>
      ACTIVE_TASK_STATUSES.has(
        projectedStatusByTask.get(
          task.id,
        ) ?? task.status,
      ),
    )
    .map((task) => {
      const issue =
        canonicalIssueByTask.get(task.id);
      if (!issue) {
        return null;
      }
      const comments =
        input.commentsByIssue[
          issue.number
        ] ?? [];
      const marker =
        latestSessionMarker(comments);
      if (!marker) {
        return null;
      }
      const observation =
        input.sessionsByName[
          marker.name
        ];
      const correctionAttempts =
        comments.filter((comment) =>
          (comment.body ?? "").includes(
            CORRECTION_MARKER,
          ),
        ).length;
      return {
        taskId: task.id,
        issueNumber: issue.number,
        sessionName: marker.name,
        sessionId:
          observation?.id ||
          marker.id,
        sessionUrl:
          observation?.url ||
          marker.url ||
          null,
        state: normalizeSessionState(
          observation?.state ||
            marker.state,
        ),
        attempt: Math.min(
          correctionAttempts,
          10,
        ),
        startedAt:
          observation?.createTime ||
          marker.createdAt,
        lastObservedAt:
          observation?.updateTime ||
          issue.updated_at,
      };
    })
    .filter(
      (
        session,
      ): session is NonNullable<
        typeof session
      > => session !== null,
    )
    .sort((left, right) =>
      left.taskId.localeCompare(
        right.taskId,
      ),
    )
    .slice(0, 15);
  const activePullRequests =
    input.pullRequests
      .filter(
        (pullRequest) =>
          pullRequest.state === "open",
      )
      .map((pullRequest) => {
        const taskId = taskIdFromText(
          pullRequest.title,
          pullRequest.body,
        );
        if (!taskId) {
          return null;
        }
        const task =
          taskById.get(taskId);
        const issueNumber =
          task?.metadata?.issue_number;
        if (
          !task ||
          !Number.isInteger(issueNumber)
        ) {
          return null;
        }
        return {
          taskId,
          issueNumber:
            issueNumber as number,
          number: pullRequest.number,
          url: pullRequest.html_url,
          headSha: pullRequest.head.sha,
          state: pullRequest.draft
            ? "draft"
            : "open",
          openedAt:
            pullRequest.created_at,
        };
      })
      .filter(
        (
          pullRequest,
        ): pullRequest is NonNullable<
          typeof pullRequest
        > => pullRequest !== null,
      )
      .sort(
        (left, right) =>
          left.number - right.number,
      );
  const resourceLocks = tasks
    .filter((task) =>
      ACTIVE_TASK_STATUSES.has(
        projectedStatusByTask.get(
          task.id,
        ) ?? task.status,
      ),
    )
    .flatMap((task) => {
      const issue =
        canonicalIssueByTask.get(task.id);
      if (!issue) {
        return [];
      }
      const acquiredAt =
        issue.updated_at;
      const acquiredTimestamp =
        parseTimestamp(acquiredAt);
      const timeoutMinutes =
        task.retry_policy
          ?.timeout_minutes ?? 60;
      const expiresAt = new Date(
        acquiredTimestamp +
          timeoutMinutes * 60_000,
      ).toISOString();
      return task.resource_locks.map(
        (resource) => ({
          resource,
          taskId: task.id,
          acquiredAt,
          expiresAt,
        }),
      );
    })
    .sort((left, right) => {
      const resourceOrder =
        left.resource.localeCompare(
          right.resource,
        );
      return resourceOrder !== 0
        ? resourceOrder
        : left.taskId.localeCompare(
            right.taskId,
          );
    });
  const observedAt =
    maxObservedAt(input);
  const currentRuntime =
    (
      input.currentState.runtime ??
      {}
    ) as Record<string, unknown>;
  const currentQuotas =
    (
      input.currentState.quotas ??
      {}
    ) as Record<string, unknown>;
  const driftCounts = {
    stateLabelConflicts:
      drift.stateLabelConflicts.length,
    missingCanonicalIssues:
      drift.missingCanonicalIssues.length,
    supersededIssues:
      drift.supersededIssues.length,
    manifestMismatches: 0,
    issueLifecycleMismatches:
      drift.issueLifecycleMismatches.length,
    sessionLookupErrors: Math.max(
      0,
      input.sessionLookupErrors ?? 0,
    ),
  };
  const projectionStatus =
    driftCounts.stateLabelConflicts > 0 ||
    driftCounts.missingCanonicalIssues > 0
      ? "invalid"
      : driftCounts.sessionLookupErrors > 0 ||
          driftCounts.issueLifecycleMismatches > 0
        ? "degraded"
        : "current";
  const candidateState = {
    ...input.currentState,
    taskSummary: summary,
    runtime: {
      ...currentRuntime,
      activeSessions,
      activePullRequests,
      resourceLocks,
    },
    projection: {
      status: projectionStatus,
      observedAt,
      generatedAt: observedAt,
      evidenceDigest:
        runtimeEvidenceDigest(input),
      source:
        "github-runtime-evidence",
      workflowRunUrl:
        input.runUrl ?? null,
      syncReason:
        input.syncReason ??
        "runtime-projection-sync",
      drift: driftCounts,
    },
    quotas: projectQuotaUsage(
      input.commentsByIssue,
      currentQuotas,
    ),
  };
  const changed =
    stableJson(
      semanticState(candidateState),
    ) !==
    stableJson(
      semanticState(input.currentState),
    );
  const projectState = changed
    ? {
        ...candidateState,
        runtime: {
          ...(
            candidateState.runtime as Record<
              string,
              unknown
            >
          ),
          lastReconciledAt:
            observedAt,
        },
        lastEvent: {
          type:
            "runtime-state-projected",
          source: "reconciler",
          taskId: null,
          issueNumber: null,
          occurredAt: observedAt,
          runUrl:
            input.runUrl ?? null,
        },
        updatedAt: observedAt,
      }
    : structuredClone(
        input.currentState,
      );
  return {
    changed,
    observedAt,
    projectState,
    drift,
  };
}
