import assert from "node:assert/strict";
import test from "node:test";

import {
  activeSessionNamesFromEvidence,
  projectRuntimeState,
} from "./project-state-projection.js";
import {
  baseInput,
  issue,
} from "./project-state-projection.test-fixture.js";

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

test("Projection metadata is deterministic for identical Runtime evidence", () => {
  const input = baseInput();

  input.syncReason =
    "runtime-projection-sync";
  input.sessionLookupErrors = 0;

  const first =
    projectRuntimeState(input);
  const second =
    projectRuntimeState(input);

  const firstProjection =
    first.projectState.projection as {
      status: string;
      evidenceDigest: string;
      observedAt: string;
      generatedAt: string;
      drift: {
        sessionLookupErrors: number;
      };
    };

  const secondProjection =
    second.projectState.projection as {
      evidenceDigest: string;
    };

  assert.equal(
    firstProjection.status,
    "invalid",
  );

  assert.match(
    firstProjection.evidenceDigest,
    /^sha256:[0-9a-f]{64}$/,
  );

  assert.equal(
    firstProjection.evidenceDigest,
    secondProjection.evidenceDigest,
  );

  assert.equal(
    firstProjection.generatedAt,
    firstProjection.observedAt,
  );

  assert.equal(
    firstProjection.drift.sessionLookupErrors,
    0,
  );
});

test("Session lookup errors degrade an otherwise valid Projection", () => {
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
      ["state:ready"],
      "open",
      "2026-06-29T02:00:00Z",
    ),
  ];

  input.sessionLookupErrors = 1;

  const result =
    projectRuntimeState(input);

  const projection =
    result.projectState.projection as {
      status: string;
      drift: {
        sessionLookupErrors: number;
      };
    };

  assert.equal(
    projection.status,
    "degraded",
  );

  assert.equal(
    projection.drift.sessionLookupErrors,
    1,
  );
});
