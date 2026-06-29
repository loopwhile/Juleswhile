export interface GitHubLabel {
  name?: string;
}

export interface GitHubIssueEvidence {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<string | GitHubLabel>;
  pull_request?: unknown;
}

export interface GitHubCommentEvidence {
  body: string | null;
  created_at: string;
  updated_at?: string;
}

export interface GitHubPullRequestEvidence {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  created_at: string;
  updated_at: string;
  head: {
    sha: string;
  };
}

export interface SessionObservation {
  name: string;
  id: string;
  url: string;
  state: string;
  createTime: string;
  updateTime: string;
}

export interface TaskContract {
  kind: "task" | "template";
  id: string;
  status: string;
  enabled: boolean;
  resource_locks: string[];
  retry_policy?: {
    timeout_minutes?: number;
  };
  metadata?: {
    issue_number?: number | null;
  };
}

export interface TaskIndex {
  tasks: TaskContract[];
}

export interface ProjectionInput {
  repository: string;
  taskIndex: TaskIndex;
  currentState: Record<string, unknown>;
  issues: GitHubIssueEvidence[];
  commentsByIssue: Record<number, GitHubCommentEvidence[]>;
  pullRequests: GitHubPullRequestEvidence[];
  sessionsByName: Record<string, SessionObservation>;
  runUrl?: string | null;
}

export interface ProjectionDrift {
  stateLabelConflicts: Array<{
    taskId: string;
    issueNumber: number;
    labels: string[];
    selectedStatus: string;
  }>;
  missingCanonicalIssues: Array<{
    taskId: string;
    issueNumber: number | null;
  }>;
  supersededIssues: Array<{
    number: number;
    title: string;
    stateLabels: string[];
  }>;
  manifestMismatches: Array<{
    taskId: string;
    issueNumber: number;
    manifestStatus: string;
    projectedStatus: string;
  }>;
  issueLifecycleMismatches: Array<{
    taskId: string;
    issueNumber: number;
    issueState: string;
    projectedStatus: string;
  }>;
}

export interface ProjectionResult {
  changed: boolean;
  observedAt: string;
  projectState: Record<string, unknown>;
  drift: ProjectionDrift;
}

const TASK_ID_PATTERN =
  /\b(TASK-[0-9]{3,})\b/i;

const TASK_DISPATCH_MARKER =
  "<!-- juleswhile:task-dispatch -->";

const QUOTA_LEDGER_MARKER =
  "<!-- juleswhile:quota-ledger -->";

const CORRECTION_MARKER =
  "<!-- juleswhile:correction-attempt -->";

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

const STATUS_TO_SUMMARY: Record<string, string> = {
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

const ACTIVE_TASK_STATUSES = new Set([
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

const TERMINAL_TASK_STATUSES = new Set([
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

function labelNames(
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

function readField(
  body: string,
  field: string,
): string {
  const match = body.match(
    new RegExp(`^${field}:\\s*(.*)$`, "im"),
  );

  return match?.[1]?.trim() ?? "";
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function maxObservedAt(
  input: ProjectionInput,
): string {
  const timestamps: number[] = [];

  const add = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }

    const parsed = parseTimestamp(value);

    if (parsed > 0) {
      timestamps.push(parsed);
    }
  };

  add(input.currentState.createdAt);
  add(input.currentState.updatedAt);

  for (const issue of input.issues) {
    add(issue.created_at);
    add(issue.updated_at);
  }

  for (const comments of Object.values(
    input.commentsByIssue,
  )) {
    for (const comment of comments) {
      add(comment.created_at);
      add(comment.updated_at);
    }
  }

  for (const pullRequest of input.pullRequests) {
    add(pullRequest.created_at);
    add(pullRequest.updated_at);
  }

  for (const session of Object.values(
    input.sessionsByName,
  )) {
    add(session.createTime);
    add(session.updateTime);
  }

  const latest = Math.max(...timestamps, 0);

  if (latest === 0) {
    throw new Error(
      "Projection에 사용할 유효한 관측 시간이 없습니다.",
    );
  }

  return new Date(latest).toISOString();
}

function emptyTaskSummary(
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

function selectTaskStatus(
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

interface SessionMarker {
  name: string;
  id: string;
  url: string;
  state: string;
  createdAt: string;
}

function latestSessionMarker(
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

function semanticState(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const clone = structuredClone(value);

  Reflect.deleteProperty(clone, "updatedAt");
  Reflect.deleteProperty(clone, "lastEvent");

  const runtime = clone.runtime;

  if (
    typeof runtime === "object" &&
    runtime !== null &&
    !Array.isArray(runtime)
  ) {
    Reflect.deleteProperty(
      runtime as Record<string, unknown>,
      "lastReconciledAt",
    );
  }

  return clone;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function normalizeSessionState(
  state: string,
): string {
  const normalized =
    state.trim().toUpperCase();

  return SESSION_STATES.has(normalized)
    ? normalized
    : "UNKNOWN";
}

function projectQuotaUsage(
  commentsByIssue: Record<
    number,
    GitHubCommentEvidence[]
  >,
  currentQuotas: Record<string, unknown>,
): Record<string, unknown> {
  const events = Object.values(commentsByIssue)
    .flat()
    .map((comment) => {
      const body = comment.body ?? "";

      if (!body.includes(QUOTA_LEDGER_MARKER)) {
        return null;
      }

      const reservationKey =
        readField(body, "reservation_key");
      const status =
        readField(body, "status").toLowerCase();
      const category =
        readField(body, "category").toLowerCase();
      const date =
        readField(body, "date");

      if (
        reservationKey === "" ||
        ![
          "new",
          "correction",
          "maintenance",
        ].includes(category)
      ) {
        return null;
      }

      return {
        reservationKey,
        status,
        category,
        date,
        createdAt: comment.created_at,
      };
    })
    .filter(
      (
        event,
      ): event is NonNullable<typeof event> =>
        event !== null,
    )
    .sort(
      (left, right) =>
        parseTimestamp(left.createdAt) -
        parseTimestamp(right.createdAt),
    );

  const latestByReservation =
    new Map<string, (typeof events)[number]>();

  for (const event of events) {
    latestByReservation.set(
      event.reservationKey,
      event,
    );
  }

  const active = [
    ...latestByReservation.values(),
  ].filter((event) =>
    ["reserved", "committed"].includes(
      event.status,
    ),
  );

  const dates = active
    .map((event) => event.date)
    .filter((date) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date),
    )
    .sort();

  const projectedDate =
    dates.at(-1) ?? null;

  const currentDay =
    projectedDate === null
      ? []
      : active.filter(
          (event) =>
            event.date === projectedDate,
        );

  const used = {
    newTasks: currentDay.filter(
      (event) => event.category === "new",
    ).length,
    corrections: currentDay.filter(
      (event) =>
        event.category === "correction",
    ).length,
    maintenance: currentDay.filter(
      (event) =>
        event.category === "maintenance",
    ).length,
    total: currentDay.length,
  };

  return {
    ...currentQuotas,
    date: projectedDate,
    used,
  };
}

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

  const candidateState = {
    ...input.currentState,
    taskSummary: summary,
    runtime: {
      ...currentRuntime,
      activeSessions,
      activePullRequests,
      resourceLocks,
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
