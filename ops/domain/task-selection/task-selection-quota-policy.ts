import {
  LEGACY_DISPATCH_MARKER,
  QUOTA_LEDGER_MARKER,
  TASK_ID_PATTERN,
  type CliOptions,
  type GitHubComment,
  type GitHubIssue,
  type QuotaLedgerEvent,
  type RuntimeQuotaUsage,
  type TaskContract,
  type TaskIndex,
} from "./task-selection-contract.js";

export function getTaskCategory(
  task: TaskContract,
): "new" | "correction" | "maintenance" {
  if (task.type === "correction") {
    return "correction";
  }

  if (
    task.type === "maintenance" ||
    task.type === "operations" ||
    task.type === "deployment" ||
    task.role === "operations"
  ) {
    return "maintenance";
  }

  return "new";
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseLedgerField(
  body: string,
  field: string,
): string {
  const match = body.match(
    new RegExp(`^${field}:\\s*(.+)$`, "im"),
  );

  return match?.[1]?.trim() ?? "";
}

export function parseQuotaLedgerEvent(
  comment: GitHubComment,
): QuotaLedgerEvent | null {
  const body = comment.body ?? "";

  if (!body.includes(QUOTA_LEDGER_MARKER)) {
    return null;
  }

  const event = parseLedgerField(
    body,
    "event",
  );

  const status = parseLedgerField(
    body,
    "status",
  );

  const category = parseLedgerField(
    body,
    "category",
  );

  const taskId = parseLedgerField(
    body,
    "task_id",
  ).toUpperCase();

  const issueNumber = Number(
    parseLedgerField(
      body,
      "issue_number",
    ),
  );

  const reservationKey = parseLedgerField(
    body,
    "reservation_key",
  );

  const date =
    parseLedgerField(body, "date") ||
    formatUtcDate(
      new Date(comment.created_at),
    );

  if (
    ![
      "quota-reserved",
      "quota-committed",
      "quota-released",
      "quota-invalidated",
    ].includes(event) ||
    !["reserved", "committed", "released", "invalidated"].includes(
      status,
    ) ||
    !["new", "correction", "maintenance"].includes(category) ||
    !TASK_ID_PATTERN.test(taskId) ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1 ||
    reservationKey === ""
  ) {
    return null;
  }

  return {
    event,
    status,
    date,
    category:
      category as QuotaLedgerEvent["category"],
    taskId,
    issueNumber,
    reservationKey,
    createdAt: comment.created_at,
  };
}

export function legacyDispatchCountsForDate(
  comment: GitHubComment,
  date: string,
): boolean {
  const body = comment.body ?? "";

  return (
    body.includes(LEGACY_DISPATCH_MARKER) &&
    formatUtcDate(
      new Date(comment.created_at),
    ) === date
  );
}

export function buildRuntimeQuotaUsage(
  taskIndex: TaskIndex,
  issueMap: Map<string, GitHubIssue>,
  commentsByIssue: Map<number, GitHubComment[]>,
  date: string,
): RuntimeQuotaUsage {
  const usage: RuntimeQuotaUsage = {
    newTasks: 0,
    corrections: 0,
    maintenance: 0,
    total: 0,
  };

  const taskMap = new Map(
    taskIndex.tasks.map(
      (task) => [task.id, task],
    ),
  );

  const eventByReservation =
    new Map<string, QuotaLedgerEvent>();

  const committedKeys = new Set<string>();

  for (const [
    issueNumber,
    comments,
  ] of commentsByIssue) {
    for (const comment of comments) {
      const event =
        parseQuotaLedgerEvent(comment);

      if (!event || event.date !== date) {
        continue;
      }

      const previous =
        eventByReservation.get(
          event.reservationKey,
        );

      if (
        !previous ||
        Date.parse(event.createdAt) >=
          Date.parse(previous.createdAt)
      ) {
        eventByReservation.set(
          event.reservationKey,
          event,
        );
      }

      if (event.status === "committed") {
        committedKeys.add(
          `${event.taskId}:${issueNumber}`,
        );
      }
    }
  }

  for (const event of eventByReservation.values()) {
    if (
      event.status !== "reserved" &&
      event.status !== "committed"
    ) {
      continue;
    }

    if (event.category === "correction") {
      usage.corrections += 1;
    } else if (event.category === "maintenance") {
      usage.maintenance += 1;
    } else {
      usage.newTasks += 1;
    }

    usage.total += 1;
  }

  for (const [taskId, issue] of issueMap) {
    const comments =
      commentsByIssue.get(issue.number) ?? [];

    if (
      !comments.some((comment) =>
        legacyDispatchCountsForDate(comment, date),
      )
    ) {
      continue;
    }

    if (committedKeys.has(`${taskId}:${issue.number}`)) {
      continue;
    }

    const task = taskMap.get(taskId);

    if (!task) {
      continue;
    }

    const category =
      getTaskCategory(task);

    if (category === "correction") {
      usage.corrections += 1;
    } else if (category === "maintenance") {
      usage.maintenance += 1;
    } else {
      usage.newTasks += 1;
    }

    usage.total += 1;
  }

  return usage;
}

export function hasQuota(
  task: TaskContract,
  usage: RuntimeQuotaUsage,
  options: CliOptions,
): boolean {
  const totalUsed =
    usage.total;

  const hardUsableLimit =
    options.newTaskBudget +
    options.correctionBudget +
    options.maintenanceBudget;

  if (
    totalUsed >=
    hardUsableLimit
  ) {
    return false;
  }

  const category =
    getTaskCategory(task);

  if (category === "correction") {
    return (
      usage.corrections <
      options.correctionBudget
    );
  }

  if (category === "maintenance") {
    return (
      usage.maintenance <
      options.maintenanceBudget
    );
  }

  return (
    usage.newTasks <
    options.newTaskBudget
  );
}
