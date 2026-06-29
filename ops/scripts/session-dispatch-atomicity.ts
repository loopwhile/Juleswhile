export const CANONICAL_SESSION_MARKER =
  "<!-- juleswhile:task-dispatch -->";

const QUOTA_LEDGER_MARKER =
  "<!-- juleswhile:quota-ledger -->";

const DISPATCH_OUTCOME_MARKER =
  "<!-- juleswhile:dispatch-outcome -->";

export interface DispatchEvidenceComment {
  body?: string | null;
  created_at?: string;
}

export interface DispatchSessionEvidence {
  name: string;
  id: string;
  url: string;
  state: string;
}

export interface CommittedSessionEvidence {
  reservationKey: string;
  category: "new" | "correction" | "maintenance";
  session: DispatchSessionEvidence;
}

export interface LiveDispatchContext {
  dryRun: boolean;
  issueNumber?: number;
  githubActions?: string;
  workflowName?: string;
  workflowRef?: string;
  runId?: string;
}

export type JulesCreateFailureOutcome =
  | "failed"
  | "unknown";

export function classifyJulesCreateFailure(
  status: number,
): JulesCreateFailureOutcome {
  if (
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    throw new Error(
      `HTTP 상태 코드가 올바르지 않습니다: ${status}`,
    );
  }

  if (
    status === 408 ||
    status === 425 ||
    status >= 500
  ) {
    return "unknown";
  }

  return "failed";
}

function fail(message: string): never {
  throw new Error(message);
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

function safeInline(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "'");
}

function parseTimestamp(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Date.parse(value ?? "");

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export function assertLiveDispatchContext(
  context: LiveDispatchContext,
): void {
  if (context.dryRun) {
    return;
  }

  if (
    context.issueNumber === undefined ||
    !Number.isSafeInteger(context.issueNumber) ||
    context.issueNumber < 1
  ) {
    fail(
      "실제 Jules Session 생성에는 Tracking Issue 번호가 필요합니다.",
    );
  }

  if (context.githubActions !== "true") {
    fail(
      "실제 Jules Session 생성은 GitHub Actions에서만 허용됩니다.",
    );
  }

  if (
    context.workflowName !== "02-dispatch-jules"
  ) {
    fail(
      "실제 Jules Session 생성은 02-dispatch-jules Workflow에서만 허용됩니다.",
    );
  }

  if (
    !context.workflowRef?.includes(
      "/.github/workflows/02-dispatch-jules.yml@",
    )
  ) {
    fail(
      "현재 GitHub Workflow가 Jules Dispatcher 계약과 일치하지 않습니다.",
    );
  }

  if (!/^[0-9]+$/.test(context.runId ?? "")) {
    fail(
      "실제 Jules Session 생성에는 유효한 GITHUB_RUN_ID가 필요합니다.",
    );
  }
}

export function buildDispatchAttemptKey(
  taskId: string,
  issueNumber: number,
  runId: string,
): string {
  if (!/^TASK-[0-9]{3,}$/.test(taskId)) {
    fail(`TASK ID 형식이 올바르지 않습니다: ${taskId}`);
  }

  if (
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1
  ) {
    fail("Issue 번호는 양의 정수여야 합니다.");
  }

  if (!/^[0-9]+$/.test(runId)) {
    fail("Workflow Run ID는 숫자여야 합니다.");
  }

  return `${taskId}-${issueNumber}-run-${runId}`;
}

export function hasCanonicalSessionEvidence(
  comments: DispatchEvidenceComment[],
  sessionName?: string,
): boolean {
  return comments.some((comment) => {
    const body = comment.body ?? "";

    if (!body.includes(CANONICAL_SESSION_MARKER)) {
      return false;
    }

    if (!sessionName) {
      return true;
    }

    return body.includes(
      `| Session | \`${sessionName}\` |`,
    );
  });
}

export function parseCommittedSessionEvidence(
  comments: DispatchEvidenceComment[],
): CommittedSessionEvidence | null {
  const events = comments
    .map((comment, index) => {
      const body = comment.body ?? "";

      if (
        !body.includes(QUOTA_LEDGER_MARKER) ||
        !body.includes(DISPATCH_OUTCOME_MARKER)
      ) {
        return null;
      }

      const reservationKey =
        readField(body, "reservation_key");
      const status =
        readField(body, "status").toLowerCase();
      const category =
        readField(body, "category").toLowerCase();
      const sessionName =
        readField(body, "session_name");
      const sessionId =
        readField(body, "session_id");
      const sessionUrl =
        readField(body, "session_url");
      const sessionState =
        readField(body, "session_state");

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
        category:
          category as
            | "new"
            | "correction"
            | "maintenance",
        sessionName,
        sessionId,
        sessionUrl,
        sessionState,
        order:
          parseTimestamp(
            comment.created_at,
            index,
          ),
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
        left.order - right.order,
    );

  const latestByReservation =
    new Map<string, (typeof events)[number]>();

  for (const event of events) {
    latestByReservation.set(
      event.reservationKey,
      event,
    );
  }

  const committed = [
    ...latestByReservation.values(),
  ]
    .filter(
      (event) =>
        event.status === "committed" &&
        event.sessionName !== "" &&
        event.sessionId !== "",
    )
    .sort(
      (left, right) =>
        right.order - left.order,
    )[0];

  if (!committed) {
    return null;
  }

  return {
    reservationKey: committed.reservationKey,
    category: committed.category,
    session: {
      name: committed.sessionName,
      id: committed.sessionId,
      url: committed.sessionUrl,
      state:
        committed.sessionState ||
        "QUEUED",
    },
  };
}

export function buildCanonicalSessionComment(
  taskId: string,
  attemptKey: string,
  session: DispatchSessionEvidence,
): string {
  const lines = [
    CANONICAL_SESSION_MARKER,
    "",
    "## Jules TASK Dispatch",
    "",
    `\`${safeInline(taskId)}\`를 Jules Session 하나에 전달했습니다.`,
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| TASK | \`${safeInline(taskId)}\` |`,
    `| Dispatch attempt | \`${safeInline(attemptKey)}\` |`,
    `| Session | \`${safeInline(session.name)}\` |`,
    `| Session ID | \`${safeInline(session.id)}\` |`,
    `| Session 상태 | \`${safeInline(session.state || "QUEUED")}\` |`,
    "| Starting branch | `main` |",
    "| Automation mode | `AUTO_CREATE_PR` |",
    "",
  ];

  if (session.url !== "") {
    lines.push(
      `[Jules Session 열기](${session.url})`,
      "",
    );
  } else {
    lines.push(
      "Session URL은 Jules API 응답에 포함되지 않았습니다.",
      "",
    );
  }

  lines.push(
    "이 canonical marker가 존재하는 동안 같은 TASK에 새 Session을 생성하지 않습니다.",
  );

  return lines.join("\n");
}
