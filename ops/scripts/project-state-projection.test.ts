import assert from "node:assert/strict";
import test from "node:test";

import {
  type GitHubCommentEvidence,
  type GitHubIssueEvidence,
  type ProjectionInput,
  activeSessionNamesFromEvidence,
  projectRuntimeState,
} from "./project-state-projection.js";

function issue(
  number: number,
  taskId: string,
  stateLabels: string[],
  state: "open" | "closed",
  updatedAt: string,
): GitHubIssueEvidence {
  return {
    number,
    title: `[TASK] ${taskId}`,
    body:
      `<!-- juleswhile:task-id:${taskId} -->`,
    state,
    html_url:
      `https://github.com/loopwhile/Juleswhile/issues/${number}`,
    created_at:
      "2026-06-29T00:00:00Z",
    updated_at: updatedAt,
    labels: [
      { name: "juleswhile:task" },
      ...stateLabels.map((name) => ({
        name,
      })),
    ],
  };
}

function baseState(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    projectId: "juleswhile",
    stateAuthority:
      "github-issues-and-pull-requests",
    status: "active",
    phase: "operations",
    primaryBranch: "main",
    repository: {
      fullName:
        "loopwhile/Juleswhile",
      htmlUrl:
        "https://github.com/loopwhile/Juleswhile",
      julesSourceName:
        "sources/github/loopwhile/Juleswhile",
    },
    projectGoal: null,
    automation: {
      enabled: false,
      contentEnabled: false,
      netlifyStatusEnabled: true,
      mode: "guarded",
      pausedReason: "paused",
    },
    taskSummary: {
      total: 2,
      draft: 0,
      ready: 1,
      queued: 0,
      dispatching: 0,
      running: 0,
      prOpened: 0,
      validating: 0,
      correcting: 0,
      mergeReady: 0,
      merged: 0,
      deploying: 0,
      completed: 1,
      failed: 0,
      timeout: 0,
      retryWait: 0,
      blocked: 0,
      cancelled: 0,
      templates: 1,
    },
    runtime: {
      activeSessions: [],
      activePullRequests: [],
      resourceLocks: [],
      lastReconciledAt:
        "2026-06-29T00:00:00Z",
    },
    quotas: {
      date: null,
      hardLimit: 100,
      newTaskBudget: 65,
      correctionBudget: 20,
      maintenanceBudget: 10,
      reserve: 5,
      maxConcurrent: 10,
      used: {
        newTasks: 0,
        corrections: 0,
        maintenance: 0,
        total: 0,
      },
    },
    lastEvent: null,
    createdAt:
      "2026-06-29T00:00:00Z",
    updatedAt:
      "2026-06-29T00:00:00Z",
  };
}

function baseInput(): ProjectionInput {
  return {
    repository:
      "loopwhile/Juleswhile",
    taskIndex: {
      tasks: [
        {
          kind: "template",
          id: "TASK-900",
          status: "TEMPLATE",
          enabled: false,
          resource_locks: [],
        },
        {
          kind: "task",
          id: "TASK-001",
          status: "COMPLETED",
          enabled: false,
          resource_locks: [],
          metadata: {
            issue_number: 5,
          },
        },
        {
          kind: "task",
          id: "TASK-002",
          status: "READY",
          enabled: true,
          resource_locks: [
            "control-plane",
          ],
          retry_policy: {
            timeout_minutes: 90,
          },
          metadata: {
            issue_number: 3,
          },
        },
      ],
    },
    currentState: baseState(),
    issues: [
      issue(
        5,
        "TASK-001",
        ["state:completed"],
        "closed",
        "2026-06-29T01:00:00Z",
      ),
      issue(
        3,
        "TASK-002",
        [
          "state:completed",
          "state:merge-ready",
        ],
        "closed",
        "2026-06-29T02:00:00Z",
      ),
      issue(
        7,
        "TASK-002",
        ["state:blocked"],
        "closed",
        "2026-06-29T00:30:00Z",
      ),
    ],
    commentsByIssue: {
      3: [],
      5: [],
    },
    pullRequests: [],
    sessionsByName: {},
    runUrl: null,
  };
}

test("canonical Issues exclude superseded TASK Issues", () => {
  const result =
    projectRuntimeState(
      baseInput(),
    );

  assert.equal(
    (
      result.projectState.taskSummary as {
        completed: number;
      }
    ).completed,
    2,
  );

  assert.deepEqual(
    result.drift.supersededIssues.map(
      (value) => value.number,
    ),
    [7],
  );
});

test("terminal state wins when canonical Issue has multiple state labels", () => {
  const result =
    projectRuntimeState(
      baseInput(),
    );

  assert.deepEqual(
    result.drift.stateLabelConflicts,
    [
      {
        taskId: "TASK-002",
        issueNumber: 3,
        labels: [
          "state:completed",
          "state:merge-ready",
        ],
        selectedStatus:
          "COMPLETED",
      },
    ],
  );

  assert.deepEqual(
    result.drift.manifestMismatches,
    [
      {
        taskId: "TASK-002",
        issueNumber: 3,
        manifestStatus: "READY",
        projectedStatus:
          "COMPLETED",
      },
    ],
  );
});

test("quota projection uses latest active reservation state", () => {
  const input = baseInput();

  const comments: GitHubCommentEvidence[] = [
    {
      created_at:
        "2026-06-29T01:00:00Z",
      body: `
<!-- juleswhile:quota-ledger -->
status: reserved
date: 2026-06-29
category: new
reservation_key: reservation-1
      `.trim(),
    },
    {
      created_at:
        "2026-06-29T01:05:00Z",
      body: `
<!-- juleswhile:quota-ledger -->
status: committed
date: 2026-06-29
category: new
reservation_key: reservation-1
      `.trim(),
    },
    {
      created_at:
        "2026-06-29T02:00:00Z",
      body: `
<!-- juleswhile:quota-ledger -->
status: reserved
date: 2026-06-29
category: maintenance
reservation_key: reservation-2
      `.trim(),
    },
    {
      created_at:
        "2026-06-29T02:05:00Z",
      body: `
<!-- juleswhile:quota-ledger -->
status: released
date: 2026-06-29
category: maintenance
reservation_key: reservation-2
      `.trim(),
    },
  ];

  input.commentsByIssue[3] =
    comments;

  const result =
    projectRuntimeState(input);

  assert.deepEqual(
    (
      result.projectState.quotas as {
        date: string;
        used: unknown;
      }
    ),
    {
      date: "2026-06-29",
      hardLimit: 100,
      newTaskBudget: 65,
      correctionBudget: 20,
      maintenanceBudget: 10,
      reserve: 5,
      maxConcurrent: 10,
      used: {
        newTasks: 1,
        corrections: 0,
        maintenance: 0,
        total: 1,
      },
    },
  );
});

test("active runtime objects are reconstructed deterministically", () => {
  const input = baseInput();

  input.issues = [
    issue(
      5,
      "TASK-001",
      ["state:completed"],
      "closed",
      "2026-06-29T01:00:00Z",
    ),
    issue(
      3,
      "TASK-002",
      ["state:running"],
      "open",
      "2026-06-29T02:00:00Z",
    ),
  ];

  input.commentsByIssue[3] = [
    {
      created_at:
        "2026-06-29T01:30:00Z",
      body: `
<!-- juleswhile:task-dispatch -->

| 항목 | 값 |
|---|---|
| Session | \`sessions/example\` |
| Session ID | \`example\` |
| Session 상태 | \`QUEUED\` |
      `.trim(),
    },
  ];

  input.sessionsByName = {
    "sessions/example": {
      name: "sessions/example",
      id: "example",
      url:
        "https://jules.google.com/session/example",
      state: "IN_PROGRESS",
      createTime:
        "2026-06-29T01:30:00Z",
      updateTime:
        "2026-06-29T02:10:00Z",
    },
  };

  input.pullRequests = [
    {
      number: 21,
      title:
        "[TASK-002] Runtime work",
      body: "TASK Issue: #3",
      html_url:
        "https://github.com/loopwhile/Juleswhile/pull/21",
      state: "open",
      draft: false,
      created_at:
        "2026-06-29T01:40:00Z",
      updated_at:
        "2026-06-29T02:05:00Z",
      head: {
        sha:
          "1234567890abcdef1234567890abcdef12345678",
      },
    },
  ];

  const first =
    projectRuntimeState(input);

  const second =
    projectRuntimeState(input);

  assert.deepEqual(
    first.projectState,
    second.projectState,
  );

  const runtime =
    first.projectState.runtime as {
      activeSessions: unknown[];
      activePullRequests: unknown[];
      resourceLocks: unknown[];
    };

  assert.equal(
    runtime.activeSessions.length,
    1,
  );
  assert.equal(
    runtime.activePullRequests.length,
    1,
  );
  assert.equal(
    runtime.resourceLocks.length,
    1,
  );
});

test("completed TASK Session markers are excluded from live lookup", () => {
  const input = baseInput();

  input.commentsByIssue[5] = [
    {
      created_at:
        "2026-06-29T01:00:00Z",
      body: `
<!-- juleswhile:task-dispatch -->

| 항목 | 값 |
|---|---|
| Session | \`sessions/completed\` |
| Session ID | \`completed\` |
| Session 상태 | \`COMPLETED\` |
      `.trim(),
    },
  ];

  assert.deepEqual(
    activeSessionNamesFromEvidence(
      input.taskIndex,
      input.issues,
      input.commentsByIssue,
    ),
    [],
  );
});

test("only latest active TASK Session marker is selected", () => {
  const input = baseInput();

  input.issues = [
    issue(
      5,
      "TASK-001",
      ["state:completed"],
      "closed",
      "2026-06-29T01:00:00Z",
    ),
    issue(
      3,
      "TASK-002",
      ["state:running"],
      "open",
      "2026-06-29T03:00:00Z",
    ),
  ];

  input.commentsByIssue[3] = [
    {
      created_at:
        "2026-06-29T01:00:00Z",
      body: `
<!-- juleswhile:task-dispatch -->

| 항목 | 값 |
|---|---|
| Session | \`sessions/old\` |
| Session ID | \`old\` |
      `.trim(),
    },
    {
      created_at:
        "2026-06-29T02:00:00Z",
      body: `
<!-- juleswhile:task-dispatch -->

| 항목 | 값 |
|---|---|
| Session | \`sessions/current\` |
| Session ID | \`current\` |
      `.trim(),
    },
  ];

  assert.deepEqual(
    activeSessionNamesFromEvidence(
      input.taskIndex,
      input.issues,
      input.commentsByIssue,
    ),
    ["sessions/current"],
  );
});
