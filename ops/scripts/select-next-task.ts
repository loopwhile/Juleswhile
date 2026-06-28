#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { parse as parseYaml } from "yaml";

const TASK_INDEX_PATH = "ops/tasks/task-index.yaml";

const GITHUB_API_BASE_URL =
  process.env.GITHUB_API_URL ??
  "https://api.github.com";

const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;

const ACTIVE_LABELS = new Set([
  "state:queued",
  "state:dispatching",
  "state:running",
  "state:pr-opened",
  "state:validating",
  "state:correcting",
  "state:merge-ready",
  "state:deploying",
]);

const EXECUTABLE_STATUSES = new Set([
  "READY",
  "RETRY_WAIT",
]);

const COMPLETED_STATUSES = new Set([
  "COMPLETED",
  "MERGED",
]);

const QUOTA_LEDGER_MARKER =
  "<!-- juleswhile:quota-ledger -->";

const LEGACY_DISPATCH_MARKER =
  "<!-- juleswhile:task-dispatch -->";

interface CliOptions {
  responseFile: string;
  maxConcurrency: number;
  newTaskBudget: number;
  correctionBudget: number;
  maintenanceBudget: number;
  reserveBudget: number;
  sourceTaskId?: string;
  dryRun: boolean;
  reserve: boolean;
}

interface TaskContract {
  kind: "task" | "template";
  id: string;
  title: string;
  role: string;
  type: string;
  status: string;
  priority: "P0" | "P1" | "P2" | "P3";
  enabled: boolean;
  depends_on: string[];
  risk_level: string;
  approval_policy: string;
  parallelizable: boolean;
  resource_locks: string[];
  conflicts_with: string[];
  metadata: {
    issue_number?: number | null;
  };
}

interface TaskIndex {
  schema_version: number;
  project_id: string;
  tasks: TaskContract[];
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
  labels: Array<
    | string
    | {
        name?: string;
      }
  >;
}

interface GitHubComment {
  body?: string | null;
  created_at: string;
}

interface Candidate {
  task: TaskContract;
  issue: GitHubIssue;
}

interface RuntimeQuotaUsage {
  newTasks: number;
  corrections: number;
  maintenance: number;
  total: number;
}

interface QuotaLedgerEvent {
  event: string;
  status: string;
  date: string;
  category: "new" | "correction" | "maintenance";
  taskId: string;
  issueNumber: number;
  reservationKey: string;
  createdAt: string;
}

interface SelectionResult {
  selected: boolean;
  taskId: string;
  issueNumber: number | null;
  reason: string;
  dryRun: boolean;
  reserved: boolean;
  sourceTaskId: string | null;
  summary: {
    total: number;
    ready: number;
    running: number;
    blocked: number;
    completed: number;
    missingIssue: number;
    dependencyBlocked: number;
    resourceBlocked: number;
    quotaBlocked: number;
  };
  evaluatedAt: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function requireValue(
  argv: string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];

  if (
    value === undefined ||
    value.startsWith("--")
  ) {
    fail(`${flag} 옵션에 값이 필요합니다.`);
  }

  return value;
}

function parseInteger(
  value: string,
  field: string,
  minimum = 0,
): number {
  if (!/^[0-9]+$/.test(value)) {
    fail(`${field}는 정수여야 합니다.`);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum
  ) {
    fail(`${field} 값이 올바르지 않습니다.`);
  }

  return parsed;
}

function parseArguments(
  argv: string[],
): CliOptions {
  let responseFile =
    process.env.RESPONSE_FILE ?? "";

  let maxConcurrency = 10;
  let newTaskBudget = 65;
  let correctionBudget = 20;
  let maintenanceBudget = 10;
  let reserveBudget = 5;
  let sourceTaskId: string | undefined;
  let dryRun = false;
  let reserve = false;

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const argument = argv[index];

    switch (argument) {
      case "--response-file": {
        responseFile = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--max-concurrency": {
        maxConcurrency = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "max-concurrency",
          1,
        );

        index += 1;
        break;
      }

      case "--new-task-budget": {
        newTaskBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "new-task-budget",
        );

        index += 1;
        break;
      }

      case "--correction-budget": {
        correctionBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "correction-budget",
        );

        index += 1;
        break;
      }

      case "--maintenance-budget": {
        maintenanceBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "maintenance-budget",
        );

        index += 1;
        break;
      }

      case "--reserve-budget": {
        reserveBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "reserve-budget",
        );

        index += 1;
        break;
      }

      case "--source-task-id": {
        sourceTaskId = requireValue(
          argv,
          index,
          argument,
        )
          .trim()
          .toUpperCase();

        index += 1;
        break;
      }

      case "--dry-run": {
        dryRun = true;
        break;
      }

      case "--reserve": {
        reserve = true;
        break;
      }

      default: {
        fail(
          `지원하지 않는 옵션입니다: ${argument}`,
        );
      }
    }
  }

  if (responseFile.trim() === "") {
    fail("--response-file이 필요합니다.");
  }

  if (
    sourceTaskId !== undefined &&
    sourceTaskId !== "" &&
    !TASK_ID_PATTERN.test(sourceTaskId)
  ) {
    fail(
      "source-task-id는 TASK-000 형식이어야 합니다.",
    );
  }

  if (maxConcurrency > 15) {
    fail(
      "max-concurrency는 15를 초과할 수 없습니다.",
    );
  }

  if (dryRun && reserve) {
    fail(
      "--dry-run과 --reserve는 동시에 사용할 수 없습니다.",
    );
  }

  if (!dryRun && !reserve) {
    fail(
      "--dry-run 또는 --reserve 중 하나가 필요합니다.",
    );
  }

  const allocatedBudget =
    newTaskBudget +
    correctionBudget +
    maintenanceBudget +
    reserveBudget;

  if (allocatedBudget > 1000) {
    fail(
      "입력된 일일 예산 합계가 비정상적으로 큽니다.",
    );
  }

  return {
    responseFile,
    maxConcurrency,
    newTaskBudget,
    correctionBudget,
    maintenanceBudget,
    reserveBudget,
    sourceTaskId:
      sourceTaskId === ""
        ? undefined
        : sourceTaskId,
    dryRun,
    reserve,
  };
}

async function readTextFile(
  filePath: string,
): Promise<string> {
  try {
    return await fs.readFile(
      filePath,
      "utf8",
    );
  } catch (error) {
    throw new Error(
      `파일을 읽을 수 없습니다: ${filePath}`,
      {
        cause: error,
      },
    );
  }
}

async function readTaskIndex(): Promise<TaskIndex> {
  const content =
    await readTextFile(TASK_INDEX_PATH);

  let parsed: unknown;

  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw new Error(
      `${TASK_INDEX_PATH} 파싱에 실패했습니다.`,
      {
        cause: error,
      },
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    fail(
      `${TASK_INDEX_PATH}의 최상위 값은 객체여야 합니다.`,
    );
  }

  const taskIndex =
    parsed as Partial<TaskIndex>;

  if (!Array.isArray(taskIndex.tasks)) {
    fail(
      `${TASK_INDEX_PATH}에 tasks 배열이 없습니다.`,
    );
  }

  return taskIndex as TaskIndex;
}

function getRepository(): string {
  const repository =
    process.env.REPOSITORY ??
    process.env.GITHUB_REPOSITORY ??
    "";

  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      repository,
    )
  ) {
    fail(
      "REPOSITORY 또는 GITHUB_REPOSITORY가 owner/repository 형식이어야 합니다.",
    );
  }

  return repository;
}

function getGitHubToken(): string {
  const token = process.env.GH_TOKEN;

  if (!token) {
    fail("GH_TOKEN이 필요합니다.");
  }

  return token;
}

async function githubRequest<T>(
  repository: string,
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getGitHubToken();

  const response = await fetch(
    `${GITHUB_API_BASE_URL}/repos/${repository}${route}`,
    {
      ...options,
      headers: {
        Accept:
          "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version":
          "2022-11-28",
        "User-Agent":
          `Juleswhile/${repository}`,
        ...(options.headers ?? {}),
      },
    },
  );

  const text = await response.text();

  if (!response.ok) {
    let message = text;

    try {
      const parsed = JSON.parse(text) as {
        message?: unknown;
      };

      if (
        typeof parsed.message === "string"
      ) {
        message = parsed.message;
      }
    } catch {
      // Preserve non-JSON response.
    }

    fail(
      `GitHub API 요청 실패 HTTP ${response.status}: ${message}`,
    );
  }

  if (text.trim() === "") {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function listIssues(
  repository: string,
): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];

  for (
    let page = 1;
    page <= 100;
    page += 1
  ) {
    const batch =
      await githubRequest<GitHubIssue[]>(
        repository,
        `/issues?state=all&per_page=100&page=${page}`,
      );

    issues.push(
      ...batch.filter(
        (issue) =>
          issue.pull_request === undefined,
      ),
    );

    if (batch.length < 100) {
      break;
    }
  }

  return issues;
}

async function listComments(
  repository: string,
  issueNumber: number,
): Promise<GitHubComment[]> {
  const comments: GitHubComment[] = [];

  for (
    let page = 1;
    page <= 100;
    page += 1
  ) {
    const batch =
      await githubRequest<GitHubComment[]>(
        repository,
        `/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      );

    comments.push(...batch);

    if (batch.length < 100) {
      break;
    }
  }

  return comments;
}

function getLabels(
  issue: GitHubIssue,
): Set<string> {
  return new Set(
    issue.labels
      .map((label) => {
        if (typeof label === "string") {
          return label;
        }

        return label.name ?? "";
      })
      .filter(Boolean),
  );
}

function getTaskIdFromIssue(
  issue: GitHubIssue,
): string | null {
  const body = issue.body ?? "";

  const markerMatch = body.match(
    /<!--\s*juleswhile:task-id:(TASK-[0-9]{3,})\s*-->/i,
  );

  if (markerMatch) {
    return markerMatch[1].toUpperCase();
  }

  if (!getLabels(issue).has("juleswhile:task")) {
    return null;
  }

  const titleMatch = issue.title.match(
    /\b(TASK-[0-9]{3,})\b/i,
  );

  return titleMatch
    ? titleMatch[1].toUpperCase()
    : null;
}

function buildIssueMap(
  issues: GitHubIssue[],
): Map<string, GitHubIssue> {
  const issueMap =
    new Map<string, GitHubIssue>();

  for (const issue of issues) {
    const taskId =
      getTaskIdFromIssue(issue);

    if (!taskId) {
      continue;
    }

    const existing =
      issueMap.get(taskId);

    if (!existing) {
      issueMap.set(taskId, issue);
      continue;
    }

    const existingLabels =
      getLabels(existing);

    const currentLabels =
      getLabels(issue);

    const existingCompleted =
      existingLabels.has("state:completed");

    const currentCompleted =
      currentLabels.has("state:completed");

    if (
      currentCompleted &&
      !existingCompleted
    ) {
      issueMap.set(taskId, issue);
      continue;
    }

    if (
      issue.number < existing.number &&
      currentCompleted === existingCompleted
    ) {
      issueMap.set(taskId, issue);
    }
  }

  return issueMap;
}

function isCompleted(
  task: TaskContract,
  issue: GitHubIssue | undefined,
): boolean {
  if (
    COMPLETED_STATUSES.has(task.status)
  ) {
    return true;
  }

  if (!issue) {
    return false;
  }

  const labels = getLabels(issue);

  return (
    labels.has("state:completed") ||
    (
      issue.state === "closed" &&
      labels.has("deployment:ready")
    )
  );
}

function isActiveIssue(
  issue: GitHubIssue,
): boolean {
  if (issue.state !== "open") {
    return false;
  }

  const labels = getLabels(issue);

  return [...ACTIVE_LABELS].some(
    (label) => labels.has(label),
  );
}

function isBlockedIssue(
  issue: GitHubIssue,
): boolean {
  const labels = getLabels(issue);

  return (
    labels.has("state:blocked") ||
    labels.has("do-not-dispatch") ||
    labels.has("human-decision-required")
  );
}

function isReadyIssue(
  issue: GitHubIssue,
): boolean {
  if (issue.state !== "open") {
    return false;
  }

  const labels = getLabels(issue);

  return (
    labels.has("state:ready") ||
    labels.has("state:retry-wait")
  );
}

function getTaskCategory(
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

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseLedgerField(
  body: string,
  field: string,
): string {
  const match = body.match(
    new RegExp(`^${field}:\\s*(.+)$`, "im"),
  );

  return match?.[1]?.trim() ?? "";
}

function parseQuotaLedgerEvent(
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

function legacyDispatchCountsForDate(
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

function buildRuntimeQuotaUsage(
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

function hasQuota(
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

function sharesResourceLock(
  task: TaskContract,
  activeTasks: TaskContract[],
): boolean {
  const taskLocks =
    new Set(task.resource_locks ?? []);

  for (const activeTask of activeTasks) {
    if (
      task.conflicts_with.includes(
        activeTask.id,
      ) ||
      activeTask.conflicts_with.includes(
        task.id,
      )
    ) {
      return true;
    }

    for (
      const lock of
      activeTask.resource_locks ?? []
    ) {
      if (taskLocks.has(lock)) {
        return true;
      }
    }

    if (
      !task.parallelizable ||
      !activeTask.parallelizable
    ) {
      return true;
    }
  }

  return false;
}

function priorityValue(
  priority: TaskContract["priority"],
): number {
  switch (priority) {
    case "P0":
      return 0;

    case "P1":
      return 1;

    case "P2":
      return 2;

    case "P3":
      return 3;
  }
}

function numericTaskId(
  taskId: string,
): number {
  return Number(
    taskId.replace("TASK-", ""),
  );
}

async function ensureLabel(
  repository: string,
  name: string,
  color: string,
  description: string,
): Promise<void> {
  const encodedName =
    encodeURIComponent(name);

  try {
    await githubRequest(
      repository,
      `/labels/${encodedName}`,
    );
  } catch {
    await githubRequest(
      repository,
      "/labels",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          color,
          description,
        }),
      },
    );
  }
}

async function reserveCandidate(
  repository: string,
  candidate: Candidate,
): Promise<void> {
  const now = new Date();
  const workflowRunUrl =
    process.env.WORKFLOW_RUN_URL ?? "unknown";
  const workflowRunId =
    process.env.GITHUB_RUN_ID ??
    workflowRunUrl.match(/\/actions\/runs\/([0-9]+)/)?.[1] ??
    "unknown";
  const category =
    getTaskCategory(candidate.task);
  const reservationKey = [
    candidate.task.id,
    candidate.issue.number,
    workflowRunId,
    now.getTime(),
  ].join("-");

  await ensureLabel(
    repository,
    "state:dispatching",
    "FBCA04",
    "TASK reservation and dispatch in progress",
  );

  const existingLabels =
    [...getLabels(candidate.issue)];

  const nextLabels =
    Array.from(
      new Set([
        ...existingLabels.filter(
          (label) =>
            label !== "state:ready" &&
            label !== "state:retry-wait",
        ),
        "state:dispatching",
      ]),
    );

  await githubRequest(
    repository,
    `/issues/${candidate.issue.number}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        labels: nextLabels,
      }),
    },
  );

  await githubRequest(
    repository,
    `/issues/${candidate.issue.number}/comments`,
    {
      method: "POST",
      body: JSON.stringify({
        body: [
          "<!-- juleswhile:task-reservation -->",
          QUOTA_LEDGER_MARKER,
          "",
          "## TASK 실행 슬롯 예약",
          "",
          `\`${candidate.task.id}\`가 다음 실행 대상으로 예약됐습니다.`,
          "",
          "```yaml",
          "event: quota-reserved",
          "status: reserved",
          `date: ${formatUtcDate(now)}`,
          `category: ${category}`,
          `task_id: ${candidate.task.id}`,
          `issue_number: ${candidate.issue.number}`,
          `reservation_key: ${reservationKey}`,
          `workflow_run_id: ${workflowRunId}`,
          `workflow_run_url: ${workflowRunUrl}`,
          `created_at: ${now.toISOString()}`,
          "```",
          "",
          "Jules Dispatcher가 Session 생성을 완료하지 못하면 Reconciler가 이 예약을 복구합니다.",
        ].join("\n"),
      }),
    },
  );
}

async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const absolutePath =
    path.resolve(filePath);

  await fs.mkdir(
    path.dirname(absolutePath),
    {
      recursive: true,
    },
  );

  const temporaryPath =
    `${absolutePath}.${process.pid}.tmp`;

  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );

  await fs.rename(
    temporaryPath,
    absolutePath,
  );
}

async function main(): Promise<void> {
  const options =
    parseArguments(process.argv.slice(2));

  const repository =
    getRepository();

  const [
    taskIndex,
    issues,
  ] = await Promise.all([
    readTaskIndex(),
    listIssues(repository),
  ]);

  const issueMap =
    buildIssueMap(issues);

  const commentsByIssue =
    new Map<number, GitHubComment[]>();

  await Promise.all(
    [...issueMap.values()].map(async (issue) => {
      commentsByIssue.set(
        issue.number,
        await listComments(repository, issue.number),
      );
    }),
  );

  const quotaUsage =
    buildRuntimeQuotaUsage(
      taskIndex,
      issueMap,
      commentsByIssue,
      formatUtcDate(new Date()),
    );

  const executableTasks =
    taskIndex.tasks.filter(
      (task) =>
        task.kind === "task" &&
        task.enabled,
    );

  const taskMap =
    new Map(
      executableTasks.map(
        (task) => [task.id, task],
      ),
    );

  const activeTasks =
    executableTasks.filter((task) => {
      const issue =
        issueMap.get(task.id);

      return (
        issue !== undefined &&
        isActiveIssue(issue)
      );
    });

  const summary = {
    total: executableTasks.length,
    ready: 0,
    running: activeTasks.length,
    blocked: 0,
    completed: 0,
    missingIssue: 0,
    dependencyBlocked: 0,
    resourceBlocked: 0,
    quotaBlocked: 0,
  };

  const candidates: Candidate[] = [];

  for (const task of executableTasks) {
    const issue =
      issueMap.get(task.id);

    if (isCompleted(task, issue)) {
      summary.completed += 1;
      continue;
    }

    if (!issue) {
      summary.missingIssue += 1;
      continue;
    }

    if (isBlockedIssue(issue)) {
      summary.blocked += 1;
      continue;
    }

    if (
      !EXECUTABLE_STATUSES.has(
        task.status,
      )
    ) {
      continue;
    }

    if (!isReadyIssue(issue)) {
      continue;
    }

    const dependenciesCompleted =
      task.depends_on.every(
        (dependencyId) => {
          const dependencyTask =
            taskMap.get(dependencyId) ??
            taskIndex.tasks.find(
              (item) =>
                item.id === dependencyId,
            );

          if (!dependencyTask) {
            return false;
          }

          return isCompleted(
            dependencyTask,
            issueMap.get(dependencyId),
          );
        },
      );

    if (!dependenciesCompleted) {
      summary.dependencyBlocked += 1;
      continue;
    }

    if (
      sharesResourceLock(
        task,
        activeTasks,
      )
    ) {
      summary.resourceBlocked += 1;
      continue;
    }

    if (
      activeTasks.length >=
      options.maxConcurrency
    ) {
      summary.resourceBlocked += 1;
      continue;
    }

    if (
      !hasQuota(
        task,
        quotaUsage,
        options,
      )
    ) {
      summary.quotaBlocked += 1;
      continue;
    }

    summary.ready += 1;

    candidates.push({
      task,
      issue,
    });
  }

  candidates.sort((left, right) => {
    const priorityDifference =
      priorityValue(left.task.priority) -
      priorityValue(right.task.priority);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return (
      numericTaskId(left.task.id) -
      numericTaskId(right.task.id)
    );
  });

  const selected =
    candidates[0] ?? null;

  if (
    selected &&
    options.reserve
  ) {
    await reserveCandidate(
      repository,
      selected,
    );
  }

  const result: SelectionResult = {
    selected: selected !== null,
    taskId:
      selected?.task.id ?? "",
    issueNumber:
      selected?.issue.number ?? null,
    reason:
      selected
        ? (
            options.reserve
              ? "The highest-priority executable TASK was reserved."
              : "The highest-priority executable TASK was selected in dry-run mode."
          )
        : (
            activeTasks.length >=
              options.maxConcurrency
              ? "The maximum Jules concurrency limit has been reached."
              : "No TASK currently satisfies dependency, state, quota, approval, and resource-lock requirements."
          ),
    dryRun: options.dryRun,
    reserved:
      selected !== null &&
      options.reserve,
    sourceTaskId:
      options.sourceTaskId ?? null,
    summary,
    evaluatedAt:
      new Date().toISOString(),
  };

  await writeJsonAtomic(
    options.responseFile,
    result,
  );

  console.log(
    selected
      ? `${selected.task.id}를 다음 TASK로 선택했습니다.`
      : "현재 실행 가능한 TASK가 없습니다.",
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `다음 TASK 선택 실패: ${message}`,
  );

  process.exitCode = 1;
});
