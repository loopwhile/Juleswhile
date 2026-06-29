import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransitionLabels,
  buildTransitionMarker,
  transitionTaskState,
  type TransitionOptions,
} from "./task-state-transition.js";

test("deploying removes all previous state labels", () => {
  const labels = buildTransitionLabels(
    [
      "juleswhile:task",
      "state:ready",
      "state:completed",
      "deployment:ready",
      "risk:high",
    ],
    "deploying",
  );

  assert.deepEqual(labels, [
    "juleswhile:task",
    "risk:high",
    "state:deploying",
  ]);
});

test("completed leaves one state and deployment ready", () => {
  const labels = buildTransitionLabels(
    [
      "state:ready",
      "state:deploying",
      "deployment:failed",
      "role:developer",
    ],
    "completed",
  );

  assert.deepEqual(labels, [
    "deployment:ready",
    "role:developer",
    "state:completed",
  ]);
});

test("failed reopens into deployment review", () => {
  const labels = buildTransitionLabels(
    [
      "state:completed",
      "deployment:ready",
      "type:bug-fix",
    ],
    "failed",
  );

  assert.deepEqual(labels, [
    "deployment:failed",
    "state:deployment-review",
    "type:bug-fix",
  ]);
});

test("verification disabled preserves deploying", () => {
  const labels = buildTransitionLabels(
    [
      "state:completed",
      "deployment:ready",
      "approval:human",
    ],
    "verification-disabled",
  );

  assert.deepEqual(labels, [
    "approval:human",
    "deployment:verification-disabled",
    "state:deploying",
  ]);
});

test("completed marker identifies merge and deploy", () => {
  const marker = buildTransitionMarker({
    mode: "completed",
    mergeSha: "abcdef1234567",
    deployId: "Deploy 123",
    deployState: "ready",
  });

  assert.equal(
    marker,
    "<!-- juleswhile:deployment-completed:abcdef1234567:deploy-123 -->",
  );
});

function options(
  overrides: Partial<TransitionOptions> = {},
): TransitionOptions {
  return {
    mode: "completed",
    issueNumber: 14,
    taskId: "TASK-004",
    mergeSha: "abcdef1234567",
    responseFile: "/tmp/task-state-transition-test.json",
    prNumber: "15",
    deployId: "deploy-1",
    deployUrl: "https://example.netlify.app",
    deployState: "ready",
    workflowUrl: "https://github.com/example/actions/runs/1",
    dryRun: false,
    ...overrides,
  };
}

test("completed transition preserves non-state labels and closes issue", async () => {
  let issue = {
    number: 14,
    state: "open",
    labels: [
      {
        name: "juleswhile:task",
      },
      {
        name: "state:ready",
      },
      {
        name: "deployment:failed",
      },
    ],
  };
  const comments: Array<{ body: string }> = [];
  const patches: unknown[] = [];

  const fetchImpl: typeof fetch = async (
    input,
    init,
  ) => {
    const url = new URL(String(input));

    if (
      init?.method === "GET" &&
      url.pathname.endsWith("/issues/14")
    ) {
      return Response.json(issue);
    }

    if (
      init?.method === "GET" &&
      url.pathname.endsWith("/issues/14/comments")
    ) {
      return Response.json(comments);
    }

    if (
      init?.method === "PATCH" &&
      url.pathname.endsWith("/issues/14")
    ) {
      const body = JSON.parse(String(init.body));
      patches.push(body);
      issue = {
        ...issue,
        ...body,
        labels: body.labels.map((name: string) => ({
          name,
        })),
      };
      return Response.json(issue);
    }

    if (
      init?.method === "POST" &&
      url.pathname.endsWith("/issues/14/comments")
    ) {
      comments.push(JSON.parse(String(init.body)));
      return Response.json({}, {
        status: 201,
      });
    }

    return Response.json(
      {
        message: url.pathname,
      },
      {
        status: 404,
      },
    );
  };

  const result = await transitionTaskState(
    options(),
    {
      fetchImpl,
      repository: "loopwhile/Juleswhile",
      token: "test-token",
      apiBaseUrl: "https://api.github.test",
    },
  );

  assert.equal(result.issueState, "closed");
  assert.equal(result.shouldDispatchNext, true);
  assert.equal(comments.length, 1);
  assert.equal(patches.length, 1);

  assert.deepEqual(result.labels, [
    "deployment:ready",
    "juleswhile:task",
    "state:completed",
  ]);
});

test("same deployment does not create duplicate comments", async () => {
  const marker =
    "<!-- juleswhile:deployment-completed:abcdef1234567:deploy-1 -->";

  const issue = {
    number: 14,
    state: "closed",
    labels: [
      {
        name: "juleswhile:task",
      },
      {
        name: "state:completed",
      },
      {
        name: "deployment:ready",
      },
    ],
  };

  const comments = [
    {
      body: marker,
    },
  ];
  let commentPosts = 0;

  const fetchImpl: typeof fetch = async (
    input,
    init,
  ) => {
    const url = new URL(String(input));

    if (
      init?.method === "GET" &&
      url.pathname.endsWith("/issues/14")
    ) {
      return Response.json(issue);
    }

    if (
      init?.method === "GET" &&
      url.pathname.endsWith("/issues/14/comments")
    ) {
      return Response.json(comments);
    }

    if (
      init?.method === "PATCH" &&
      url.pathname.endsWith("/issues/14")
    ) {
      return Response.json(issue);
    }

    if (
      init?.method === "POST" &&
      url.pathname.endsWith("/issues/14/comments")
    ) {
      commentPosts += 1;
      return Response.json({}, {
        status: 201,
      });
    }

    return Response.json({}, {
      status: 404,
    });
  };

  const result = await transitionTaskState(
    options(),
    {
      fetchImpl,
      repository: "loopwhile/Juleswhile",
      token: "test-token",
      apiBaseUrl: "https://api.github.test",
    },
  );

  assert.equal(result.commentCreated, false);
  assert.equal(commentPosts, 0);
});

test("dry-run performs no PATCH or comment POST", async () => {
  let mutations = 0;

  const fetchImpl: typeof fetch = async (
    input,
    init,
  ) => {
    const url = new URL(String(input));

    if (
      init?.method === "GET" &&
      url.pathname.endsWith("/issues/14")
    ) {
      return Response.json({
        number: 14,
        state: "open",
        labels: [
          {
            name: "state:deploying",
          },
        ],
      });
    }

    if (
      init?.method === "GET" &&
      url.pathname.endsWith("/issues/14/comments")
    ) {
      return Response.json([]);
    }

    mutations += 1;
    return Response.json({});
  };

  await transitionTaskState(
    options({
      dryRun: true,
    }),
    {
      fetchImpl,
      repository: "loopwhile/Juleswhile",
      token: "test-token",
      apiBaseUrl: "https://api.github.test",
    },
  );

  assert.equal(mutations, 0);
});
