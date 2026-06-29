import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLiveDispatchContext,
  buildCanonicalSessionComment,
  buildDispatchAttemptKey,
  classifyJulesCreateFailure,
  hasCanonicalSessionEvidence,
  parseCommittedSessionEvidence,
} from "./session-dispatch-atomicity.js";

test("attempt key is deterministic for one workflow run", () => {
  const first = buildDispatchAttemptKey(
    "TASK-006",
    18,
    "12345",
  );

  const second = buildDispatchAttemptKey(
    "TASK-006",
    18,
    "12345",
  );

  assert.equal(
    first,
    "TASK-006-18-run-12345",
  );
  assert.equal(first, second);
});

test("different workflow runs create different attempt keys", () => {
  assert.notEqual(
    buildDispatchAttemptKey(
      "TASK-006",
      18,
      "12345",
    ),
    buildDispatchAttemptKey(
      "TASK-006",
      18,
      "12346",
    ),
  );
});

test("dry-run is allowed outside GitHub Actions", () => {
  assert.doesNotThrow(() =>
    assertLiveDispatchContext({
      dryRun: true,
    }),
  );
});

test("live dispatch requires a tracking Issue", () => {
  assert.throws(
    () =>
      assertLiveDispatchContext({
        dryRun: false,
        githubActions: "true",
        workflowName: "02-dispatch-jules",
        workflowRef:
          "loopwhile/Juleswhile/.github/workflows/02-dispatch-jules.yml@refs/heads/main",
        runId: "123",
      }),
    /Tracking Issue/,
  );
});

test("live dispatch requires GitHub Actions", () => {
  assert.throws(
    () =>
      assertLiveDispatchContext({
        dryRun: false,
        issueNumber: 18,
        githubActions: "false",
        workflowName: "02-dispatch-jules",
        workflowRef:
          "loopwhile/Juleswhile/.github/workflows/02-dispatch-jules.yml@refs/heads/main",
        runId: "123",
      }),
    /GitHub Actions/,
  );
});

test("live dispatch requires the dispatcher workflow", () => {
  assert.throws(
    () =>
      assertLiveDispatchContext({
        dryRun: false,
        issueNumber: 18,
        githubActions: "true",
        workflowName: "other-workflow",
        workflowRef:
          "loopwhile/Juleswhile/.github/workflows/other.yml@refs/heads/main",
        runId: "123",
      }),
    /02-dispatch-jules/,
  );
});

test("valid workflow context allows live dispatch", () => {
  assert.doesNotThrow(() =>
    assertLiveDispatchContext({
      dryRun: false,
      issueNumber: 18,
      githubActions: "true",
      workflowName: "02-dispatch-jules",
      workflowRef:
        "loopwhile/Juleswhile/.github/workflows/02-dispatch-jules.yml@refs/heads/main",
      runId: "123",
    }),
  );
});

test("committed ledger reconstructs Session evidence", () => {
  const result =
    parseCommittedSessionEvidence([
      {
        created_at: "2026-06-29T00:00:00Z",
        body: `
<!-- juleswhile:quota-ledger -->
<!-- juleswhile:dispatch-outcome -->

status: committed
category: new
reservation_key: TASK-006-18-run-123
session_name: sessions/session-1
session_id: session-1
session_url: https://jules.google.com/session-1
session_state: QUEUED
        `.trim(),
      },
    ]);

  assert.deepEqual(result, {
    reservationKey:
      "TASK-006-18-run-123",
    category: "new",
    session: {
      name: "sessions/session-1",
      id: "session-1",
      url:
        "https://jules.google.com/session-1",
      state: "QUEUED",
    },
  });
});

test("later release invalidates committed evidence for same reservation", () => {
  const result =
    parseCommittedSessionEvidence([
      {
        created_at: "2026-06-29T00:00:00Z",
        body: `
<!-- juleswhile:quota-ledger -->
<!-- juleswhile:dispatch-outcome -->
status: committed
category: new
reservation_key: TASK-006-18-run-123
session_name: sessions/session-1
session_id: session-1
        `.trim(),
      },
      {
        created_at: "2026-06-29T00:01:00Z",
        body: `
<!-- juleswhile:quota-ledger -->
<!-- juleswhile:dispatch-outcome -->
status: released
category: new
reservation_key: TASK-006-18-run-123
        `.trim(),
      },
    ]);

  assert.equal(result, null);
});

test("canonical comment contains stable Session evidence", () => {
  const comment =
    buildCanonicalSessionComment(
      "TASK-006",
      "TASK-006-18-run-123",
      {
        name: "sessions/session-1",
        id: "session-1",
        url:
          "https://jules.google.com/session-1",
        state: "QUEUED",
      },
    );

  assert.match(
    comment,
    /juleswhile:task-dispatch/,
  );
  assert.match(
    comment,
    /TASK-006-18-run-123/,
  );
  assert.match(
    comment,
    /\| Session \| `sessions\/session-1` \|/,
  );
});

test("canonical Session evidence is detected by Session name", () => {
  const comments = [
    {
      body: buildCanonicalSessionComment(
        "TASK-006",
        "TASK-006-18-run-123",
        {
          name: "sessions/session-1",
          id: "session-1",
          url: "",
          state: "QUEUED",
        },
      ),
    },
  ];

  assert.equal(
    hasCanonicalSessionEvidence(
      comments,
      "sessions/session-1",
    ),
    true,
  );

  assert.equal(
    hasCanonicalSessionEvidence(
      comments,
      "sessions/session-2",
    ),
    false,
  );
});

test("definite client failures release the reservation", () => {
  for (const status of [
    400,
    401,
    403,
    404,
    409,
    422,
    429,
  ]) {
    assert.equal(
      classifyJulesCreateFailure(status),
      "failed",
      `HTTP ${status}`,
    );
  }
});

test("ambiguous timeout and server failures block blind retry", () => {
  for (const status of [
    408,
    425,
    500,
    502,
    503,
    504,
    599,
  ]) {
    assert.equal(
      classifyJulesCreateFailure(status),
      "unknown",
      `HTTP ${status}`,
    );
  }
});
