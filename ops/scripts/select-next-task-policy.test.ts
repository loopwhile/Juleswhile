import assert from "node:assert/strict";
import test from "node:test";

import type {
  GitHubIssue,
  TaskContract,
} from "../domain/task-selection/task-selection-contract.js";

import {
  buildIssueMap,
  isCompleted,
} from "../domain/task-selection/task-selection-issue-policy.js";

import {
  getTaskCategory,
  hasQuota,
} from "../domain/task-selection/task-selection-quota-policy.js";

import {
  compareCandidates,
  sharesResourceLock,
} from "../domain/task-selection/task-selection-resource-policy.js";

function task(
  overrides: Partial<TaskContract> = {},
): TaskContract {
  return {
    kind: "task",
    id: "TASK-100",
    title: "Fixture",
    role: "developer",
    type: "feature",
    status: "READY",
    priority: "P1",
    enabled: true,
    depends_on: [],
    risk_level: "medium",
    approval_policy: "reviewer",
    parallelizable: true,
    resource_locks: [],
    conflicts_with: [],
    metadata: {
      issue_number: 100,
    },
    ...overrides,
  };
}

function issue(
  number: number,
  labels: string[],
  state: "open" | "closed" = "open",
): GitHubIssue {
  return {
    number,
    title: `[TASK] TASK-100 Fixture ${number}`,
    body:
      "<!-- juleswhile:task-id:TASK-100 -->",
    state,
    html_url:
      `https://github.test/issues/${number}`,
    created_at:
      "2026-07-01T00:00:00Z",
    updated_at:
      "2026-07-01T00:00:00Z",
    labels,
  };
}

test(
  "Issue Map은 완료된 Canonical Issue를 우선한다",
  () => {
    const readyIssue =
      issue(200, [
        "juleswhile:task",
        "state:ready",
      ]);

    const completedIssue =
      issue(
        201,
        [
          "juleswhile:task",
          "state:completed",
          "deployment:ready",
        ],
        "closed",
      );

    const map =
      buildIssueMap([
        readyIssue,
        completedIssue,
      ]);

    assert.equal(
      map.get("TASK-100")?.number,
      201,
    );

    assert.equal(
      isCompleted(
        task(),
        completedIssue,
      ),
      true,
    );
  },
);

test(
  "Resource Lock 또는 비병렬 TASK는 동시 실행을 차단한다",
  () => {
    const candidate =
      task({
        resource_locks: [
          "control-plane",
        ],
      });

    const active =
      task({
        id: "TASK-099",
        resource_locks: [
          "control-plane",
        ],
      });

    assert.equal(
      sharesResourceLock(
        candidate,
        [active],
      ),
      true,
    );

    assert.equal(
      sharesResourceLock(
        task({
          parallelizable: false,
        }),
        [
          task({
            id: "TASK-098",
          }),
        ],
      ),
      true,
    );
  },
);

test(
  "Quota 정책은 TASK Category별 예산을 적용한다",
  () => {
    const options = {
      responseFile: "/tmp/result.json",
      maxConcurrency: 10,
      newTaskBudget: 65,
      correctionBudget: 20,
      maintenanceBudget: 10,
      reserveBudget: 5,
      dryRun: true,
      reserve: false,
    };

    assert.equal(
      getTaskCategory(
        task({
          type: "maintenance",
        }),
      ),
      "maintenance",
    );

    assert.equal(
      hasQuota(
        task(),
        {
          newTasks: 64,
          corrections: 0,
          maintenance: 0,
          total: 64,
        },
        options,
      ),
      true,
    );

    assert.equal(
      hasQuota(
        task(),
        {
          newTasks: 65,
          corrections: 0,
          maintenance: 0,
          total: 65,
        },
        options,
      ),
      false,
    );
  },
);

test(
  "Candidate 정렬은 Priority 이후 TASK 번호를 사용한다",
  () => {
    const first = {
      task: task({
        id: "TASK-101",
        priority: "P0",
      }),
      issue: issue(
        101,
        ["state:ready"],
      ),
    };

    const second = {
      task: task({
        id: "TASK-102",
        priority: "P1",
      }),
      issue: issue(
        102,
        ["state:ready"],
      ),
    };

    assert.ok(
      compareCandidates(
        first,
        second,
      ) < 0,
    );
  },
);
