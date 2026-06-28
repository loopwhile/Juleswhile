import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

interface MockIssue {
  number: number;
  title: string;
  body: string;
  state: "open";
  html_url: string;
  updated_at: string;
  labels: Array<{ name: string }>;
}

interface MockComment {
  body: string;
  created_at: string;
}

interface MockConfig {
  labels: string[];
  comments: MockComment[];
  session?: Record<string, unknown>;
  sessions?: Record<string, unknown>[];
  julesStatus?: number;
  pullRequest?: Record<string, unknown>;
  dryRun?: boolean;
}

interface ReconcileReport {
  summary: {
    sessions_checked: number;
    sessions_recovered: number;
    api_errors: number;
    unknown_states: number;
  };
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function startServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void,
): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer(handler);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

function makeIssue(labels: string[]): MockIssue {
  return {
    number: 14,
    title: "[TASK-004] Reconcile runtime state with Jules API sessions",
    body: "<!-- juleswhile:task-id:TASK-004 -->",
    state: "open",
    html_url: "https://github.com/loopwhile/Juleswhile/issues/14",
    updated_at: "2026-06-28T00:00:00Z",
    labels: [
      "juleswhile:task",
      ...labels,
    ].map((name) => ({ name })),
  };
}

function sessionComment(id = "s-1"): MockComment {
  return {
    created_at: "2026-06-28T00:01:00Z",
    body: [
      "<!-- juleswhile:task-dispatch -->",
      "",
      "```yaml",
      `session_name: sessions/${id}`,
      `session_id: ${id}`,
      "session_url: https://jules.google/session",
      "state: QUEUED",
      "```",
    ].join("\n"),
  };
}

function intentComment(): MockComment {
  return {
    created_at: "2026-06-28T00:01:00Z",
    body: [
      "<!-- juleswhile:dispatch-intent -->",
      "",
      "```yaml",
      "event: dispatch-intent",
      "status: creating-session",
      "task_id: TASK-004",
      "issue_number: 14",
      "reservation_key: r-1",
      "created_at: 2026-06-28T00:01:00Z",
      "```",
    ].join("\n"),
  };
}

async function runReconciler(config: MockConfig): Promise<{
  result: ReconcileReport;
  issue: MockIssue;
  comments: MockComment[];
  incidents: unknown[];
}> {
  const issue = makeIssue(config.labels);
  const comments = [...config.comments];
  const incidents: unknown[] = [];

  const github = await startServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      "http://127.0.0.1",
    );

    if (
      request.method === "GET" &&
      url.pathname === "/repos/loopwhile/Juleswhile/issues"
    ) {
      const page = Number(url.searchParams.get("page") ?? "1");
      writeJson(response, 200, page === 1 ? [issue] : []);
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/repos/loopwhile/Juleswhile/issues/14/comments"
    ) {
      const page = Number(url.searchParams.get("page") ?? "1");
      const start = (page - 1) * 100;
      writeJson(response, 200, comments.slice(start, start + 100));
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname === "/repos/loopwhile/Juleswhile/issues/14"
    ) {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        const parsed = JSON.parse(body) as { labels?: string[] };
        if (parsed.labels) {
          issue.labels = parsed.labels.map((name) => ({ name }));
        }
        writeJson(response, 200, issue);
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/repos/loopwhile/Juleswhile/issues/14/comments"
    ) {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        const parsed = JSON.parse(body) as { body: string };
        comments.push({
          body: parsed.body,
          created_at: "2026-06-28T00:02:00Z",
        });
        writeJson(response, 201, {});
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/repos/loopwhile/Juleswhile/issues"
    ) {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        incidents.push(JSON.parse(body));
        writeJson(response, 201, {
          number: 99,
        });
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/repos/loopwhile/Juleswhile/labels/")
    ) {
      writeJson(response, 200, {});
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/repos/loopwhile/Juleswhile/pulls/7"
    ) {
      writeJson(
        response,
        200,
        config.pullRequest ?? {
          number: 7,
          state: "open",
          merged: false,
          merged_at: null,
          html_url: "https://github.com/loopwhile/Juleswhile/pull/7",
        },
      );
      return;
    }

    writeJson(response, 404, {
      message: url.pathname,
    });
  });

  const jules = await startServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      "http://127.0.0.1",
    );

    if (config.julesStatus) {
      writeJson(response, config.julesStatus, {
        error: {
          message: "mock failure",
        },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/sessions/")
    ) {
      writeJson(
        response,
        200,
        config.session ?? {
          name: "sessions/s-1",
          state: "IN_PROGRESS",
          updateTime: "2026-06-28T00:01:30Z",
        },
      );
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/sessions"
    ) {
      writeJson(response, 200, {
        sessions: config.sessions ?? [],
      });
      return;
    }

    writeJson(response, 404, {});
  });

  try {
    const directory = await mkdtemp(
      path.join(tmpdir(), "juleswhile-reconcile-"),
    );
    const responseFile = path.join(directory, "result.json");

    await execFileAsync(
      "node",
      [
        "--import",
        "tsx",
        "ops/scripts/reconcile-project.ts",
        "--response-file",
        responseFile,
        "--stale-running-minutes",
        "10",
        "--stale-dispatching-minutes",
        "5",
        config.dryRun ? "--dry-run" : "--apply",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GH_TOKEN: "gh-test",
          GITHUB_API_URL: github.url,
          JULES_API_KEY: "jules-test",
          JULES_API_BASE_URL: jules.url,
          REPOSITORY: "loopwhile/Juleswhile",
        },
      },
    );

    return {
      result: JSON.parse(
        await readFile(responseFile, "utf8"),
      ) as ReconcileReport,
      issue,
      comments,
      incidents,
    };
  } finally {
    await github.close();
    await jules.close();
  }
}

test("IN_PROGRESS keeps TASK running", async () => {
  const { issue, result } = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "IN_PROGRESS",
      updateTime: "2026-06-28T00:02:00Z",
    },
  });

  assert(issue.labels.some((label) => label.name === "state:running"));
  assert.equal(result.summary.sessions_checked, 1);
});

test("COMPLETED with PR output moves to PR tracking", async () => {
  const { issue } = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "COMPLETED",
      updateTime: "2026-06-28T00:02:00Z",
      outputs: [
        {
          pullRequest: {
            url: "https://github.com/loopwhile/Juleswhile/pull/7",
          },
        },
      ],
    },
  });

  assert(issue.labels.some((label) => label.name === "state:pr-opened"));
});

test("dry-run checks Jules API without mutating GitHub labels", async () => {
  const { issue, result } = await runReconciler({
    dryRun: true,
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "COMPLETED",
      updateTime: "2026-06-28T00:02:00Z",
      outputs: [
        {
          pullRequest: {
            url: "https://github.com/loopwhile/Juleswhile/pull/7",
          },
        },
      ],
    },
  });

  assert(issue.labels.some((label) => label.name === "state:running"));
  assert.equal(result.summary.sessions_checked, 1);
});

test("COMPLETED without PR blocks the TASK", async () => {
  const { issue, incidents } = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "COMPLETED",
      updateTime: "2026-06-28T00:02:00Z",
      outputs: [],
    },
  });

  assert(issue.labels.some((label) => label.name === "state:blocked"));
  assert.equal(incidents.length, 1);
});

test("FAILED follows retry limits", async () => {
  const retry = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "FAILED",
      updateTime: "2026-06-28T00:02:00Z",
    },
  });

  assert(retry.issue.labels.some((label) => label.name === "state:retry-wait"));

  const blocked = await runReconciler({
    labels: ["state:running"],
    comments: [
      sessionComment(),
      {
        body: "<!-- juleswhile:correction-attempt -->",
        created_at: "2026-06-28T00:03:00Z",
      },
      {
        body: "<!-- juleswhile:correction-attempt -->",
        created_at: "2026-06-28T00:04:00Z",
      },
    ],
    session: {
      name: "sessions/s-1",
      state: "FAILED",
      updateTime: "2026-06-28T00:02:00Z",
    },
  });

  assert(blocked.issue.labels.some((label) => label.name === "state:blocked"));
});

test("AWAITING_USER_FEEDBACK blocks the TASK", async () => {
  const { issue, incidents } = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "AWAITING_USER_FEEDBACK",
      url: "https://jules.google/session",
    },
  });

  assert(issue.labels.some((label) => label.name === "state:blocked"));
  assert.equal(incidents.length, 1);
});

test("404 blocks without retrying", async () => {
  const { issue, result } = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    julesStatus: 404,
  });

  assert(issue.labels.some((label) => label.name === "state:blocked"));
  assert.equal(result.summary.api_errors, 1);
});

test("429 and 5xx preserve state", async () => {
  for (const status of [429, 500]) {
    const { issue, result } = await runReconciler({
      labels: ["state:running"],
      comments: [sessionComment()],
      julesStatus: status,
    });

    assert(issue.labels.some((label) => label.name === "state:running"));
    assert.equal(result.summary.api_errors, 1);
  }
});

test("unknown state does not retry automatically", async () => {
  const { issue, result } = await runReconciler({
    labels: ["state:running"],
    comments: [sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "NEW_ALPHA_STATE",
    },
  });

  assert(issue.labels.some((label) => label.name === "state:running"));
  assert.equal(result.summary.unknown_states, 1);
});

test("ambiguous dispatch intent recovers exactly one candidate", async () => {
  const { comments, result } = await runReconciler({
    labels: ["state:dispatching"],
    comments: [intentComment()],
    sessions: [
      {
        name: "sessions/s-2",
        id: "s-2",
        title: "[TASK-004] Reconcile runtime state with Jules API sessions",
        state: "IN_PROGRESS",
        createTime: "2026-06-28T00:02:00Z",
        sourceContext: {
          repository: "loopwhile/Juleswhile",
        },
      },
    ],
  });

  assert.equal(result.summary.sessions_recovered, 1);
  assert(
    comments.some((comment) =>
      comment.body.includes("Jules Session Marker Recovered"),
    ),
  );
});

test("multiple dispatch intent candidates block", async () => {
  const { issue, incidents } = await runReconciler({
    labels: ["state:dispatching"],
    comments: [intentComment()],
    sessions: [
      {
        name: "sessions/s-2",
        title: "[TASK-004] Reconcile runtime state with Jules API sessions",
        state: "IN_PROGRESS",
        createTime: "2026-06-28T00:02:00Z",
      },
      {
        name: "sessions/s-3",
        title: "[TASK-004] Reconcile runtime state with Jules API sessions",
        state: "IN_PROGRESS",
        createTime: "2026-06-28T00:03:00Z",
      },
    ],
  });

  assert(issue.labels.some((label) => label.name === "state:blocked"));
  assert.equal(incidents.length, 1);
});

test("Issue comment pagination finds session marker after 100 comments", async () => {
  const comments = Array.from(
    {
      length: 100,
    },
    (_, index) => ({
      body: `noise ${index}`,
      created_at: "2026-06-28T00:00:00Z",
    }),
  );

  const { result } = await runReconciler({
    labels: ["state:running"],
    comments: [...comments, sessionComment()],
    session: {
      name: "sessions/s-1",
      state: "IN_PROGRESS",
    },
  });

  assert.equal(result.summary.sessions_checked, 1);
});

test("incident idempotency marker prevents duplicate incidents", async () => {
  const { incidents } = await runReconciler({
    labels: ["state:running"],
    comments: [
      sessionComment(),
      {
        body: "<!-- juleswhile:incident:TASK-004-human-intervention-awaiting_user_feedback -->",
        created_at: "2026-06-28T00:02:00Z",
      },
    ],
    session: {
      name: "sessions/s-1",
      state: "AWAITING_USER_FEEDBACK",
    },
  });

  assert.equal(incidents.length, 0);
});
