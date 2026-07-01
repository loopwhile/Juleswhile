import assert from "node:assert/strict";
import test from "node:test";

import {
  type GitHubCommentEvidence,
  projectRuntimeState,
} from "./project-state-projection.js";
import {
  baseInput,
  issue,
} from "./project-state-projection.test-fixture.js";

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
