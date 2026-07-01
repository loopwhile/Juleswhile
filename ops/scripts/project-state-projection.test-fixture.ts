import type {
  GitHubIssueEvidence,
  ProjectionInput,
} from "./project-state-projection.js";

export function issue(
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

export function baseState(): Record<string, unknown> {
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

export function baseInput(): ProjectionInput {
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
