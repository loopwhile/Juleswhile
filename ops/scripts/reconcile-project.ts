#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { parse as parseYaml } from "yaml";

import {
  JulesApiClient,
  JulesApiError,
  type JulesSession,
} from "./jules-api.js";

const TASK_INDEX_PATH = "ops/tasks/task-index.yaml";

const GITHUB_API_BASE_URL =
  process.env.GITHUB_API_URL ??
  "https://api.github.com";

const TASK_ID_PATTERN =
  /^TASK-[0-9]{3,}$/;

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

const QUOTA_LEDGER_MARKER =
  "<!-- juleswhile:quota-ledger -->";

const DISPATCH_MARKER =
  "<!-- juleswhile:task-dispatch -->";

const DISPATCH_INTENT_MARKER =
  "<!-- juleswhile:dispatch-intent -->";

const DISPATCH_OUTCOME_MARKER =
  "<!-- juleswhile:dispatch-outcome -->";

const SESSION_RECONCILIATION_MARKER =
  "<!-- juleswhile:session-reconciliation -->";

const INCIDENT_MARKER_PREFIX =
  "<!-- juleswhile:incident:";

const ACTIVE_JULES_STATES = new Set([
  "QUEUED",
  "PLANNING",
  "IN_PROGRESS",
]);

const HUMAN_INTERVENTION_JULES_STATES = new Set([
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "PAUSED",
]);

const TRANSIENT_API_ERROR_KINDS = new Set([
  "rate_limited",
  "server",
  "timeout",
  "network",
]);

interface CliOptions {
  responseFile: string;
  staleDispatchingMinutes: number;
  staleRunningMinutes: number;
  staleValidatingMinutes: number;
  sessionTimeoutMinutes: number;
  maxCorrections: number;
  dryRun: boolean;
  apply: boolean;
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
  body: string | null;
  created_at: string;
}

interface GitHubPullRequest {
  number: number;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  html_url: string;
}

interface RuntimeReservation {
  key: string;
  category: "new" | "correction" | "maintenance";
}

interface TaskContract {
  id: string;
  title: string;
  retry_policy?: {
    max_corrections?: number;
  };
  metadata?: {
    issue_number?: number | null;
  };
}

interface TaskIndex {
  tasks: TaskContract[];
}

interface SessionMarker {
  name: string;
  id: string;
  url: string;
  state: string;
  createdAt: string;
}

interface DispatchIntent {
  createdAt: string;
  reservationKey: string;
}

interface ReconcileAction {
  issueNumber: number;
  taskId: string;
  action: string;
  reason: string;
  applied: boolean;
}

interface ReconcileResult {
  dryRun: boolean;
  shouldScheduleNext: boolean;
  summary: {
    scanned: number;
    repaired: number;
    stuck: number;
    blocked: number;
    retried: number;
    incidents: number;
    sessions_checked: number;
    sessions_recovered: number;
    api_errors: number;
    unknown_states: number;
  };
  actions: ReconcileAction[];
  completedAt: string;
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
  minimum: number,
  maximum: number,
): number {
  if (!/^[0-9]+$/.test(value)) {
    fail(`${field}는 정수여야 합니다.`);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    fail(
      `${field}는 ${minimum}~${maximum} 범위여야 합니다.`,
    );
  }

  return parsed;
}

function parseArguments(
  argv: string[],
): CliOptions {
  let responseFile =
    process.env.RESPONSE_FILE ?? "";

  let staleDispatchingMinutes = 20;
  let staleRunningMinutes = 180;
  let staleValidatingMinutes = 60;
  let sessionTimeoutMinutes = 240;
  let maxCorrections = 2;
  let dryRun = false;
  let apply = false;

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

      case "--stale-dispatching-minutes": {
        staleDispatchingMinutes =
          parseInteger(
            requireValue(
              argv,
              index,
              argument,
            ),
            "stale-dispatching-minutes",
            5,
            1440,
          );

        index += 1;
        break;
      }

      case "--stale-running-minutes": {
        staleRunningMinutes =
          parseInteger(
            requireValue(
              argv,
              index,
              argument,
            ),
            "stale-running-minutes",
            10,
            2880,
          );

        index += 1;
        break;
      }

      case "--stale-validating-minutes": {
        staleValidatingMinutes =
          parseInteger(
            requireValue(
              argv,
              index,
              argument,
            ),
            "stale-validating-minutes",
            5,
            1440,
          );

        index += 1;
        break;
      }

      case "--session-timeout-minutes": {
        sessionTimeoutMinutes =
          parseInteger(
            requireValue(
              argv,
              index,
              argument,
            ),
            "session-timeout-minutes",
            15,
            2880,
          );

        index += 1;
        break;
      }

      case "--max-corrections": {
        maxCorrections =
          parseInteger(
            requireValue(
              argv,
              index,
              argument,
            ),
            "max-corrections",
            0,
            10,
          );

        index += 1;
        break;
      }

      case "--dry-run": {
        dryRun = true;
        break;
      }

      case "--apply": {
        apply = true;
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

  if (dryRun === apply) {
    fail(
      "--dry-run 또는 --apply 중 하나만 지정해야 합니다.",
    );
  }

  return {
    responseFile,
    staleDispatchingMinutes,
    staleRunningMinutes,
    staleValidatingMinutes,
    sessionTimeoutMinutes,
    maxCorrections,
    dryRun,
    apply,
  };
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

function getToken(): string {
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
  const response = await fetch(
    `${GITHUB_API_BASE_URL}/repos/${repository}${route}`,
    {
      ...options,
      headers: {
        Accept:
          "application/vnd.github+json",
        Authorization:
          `Bearer ${getToken()}`,
        "Content-Type":
          "application/json",
        "X-GitHub-Api-Version":
          "2022-11-28",
        "User-Agent":
          `Juleswhile/${repository}`,
        ...(options.headers ?? {}),
      },
    },
  );

  const text =
    await response.text();

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
      // Preserve response text.
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
  const result: GitHubIssue[] = [];

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

    result.push(
      ...batch.filter(
        (issue) =>
          issue.pull_request === undefined,
      ),
    );

    if (batch.length < 100) {
      break;
    }
  }

  return result;
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

async function readTaskIndex(): Promise<Map<string, TaskContract>> {
  const content = await fs.readFile(TASK_INDEX_PATH, "utf8");
  const parsed = parseYaml(content) as TaskIndex;

  if (!Array.isArray(parsed.tasks)) {
    fail(`${TASK_INDEX_PATH}에 tasks 배열이 없습니다.`);
  }

  return new Map(
    parsed.tasks.map((task) => [
      task.id,
      task,
    ]),
  );
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

function setLocalLabels(
  issue: GitHubIssue,
  labels: string[],
): void {
  issue.labels = labels.map(
    (name) => ({ name }),
  );
}

function getTaskId(
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

  const titleMatch =
    issue.title.match(
      /\b(TASK-[0-9]{3,})\b/i,
    );

  return titleMatch
    ? titleMatch[1].toUpperCase()
    : null;
}

function ageMinutes(
  isoDate: string,
): number {
  const timestamp =
    Date.parse(isoDate);

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return (
    Date.now() -
    timestamp
  ) / 60000;
}

function hasAnyLabel(
  labels: Set<string>,
  candidates: Set<string>,
): boolean {
  return [...candidates].some(
    (label) => labels.has(label),
  );
}

function findPullRequestNumber(
  issue: GitHubIssue,
  comments: GitHubComment[],
): number | null {
  const combined = [
    issue.body ?? "",
    ...comments.map(
      (comment) =>
        comment.body ?? "",
    ),
  ].join("\n");

  const matches = [
    combined.match(
      /Pull Request:\s*#([0-9]+)/i,
    ),
    combined.match(
      /github\.com\/[^/\s]+\/[^/\s]+\/pull\/([0-9]+)/i,
    ),
  ];

  for (const match of matches) {
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function parseSessionMarkers(
  comments: GitHubComment[],
): SessionMarker[] {
  return comments
    .map((comment) => {
      const body = comment.body ?? "";

      if (!body.includes(DISPATCH_MARKER)) {
        return null;
      }

      const yamlName = parseLedgerField(body, "session_name");
      const yamlId = parseLedgerField(body, "session_id");
      const yamlUrl = parseLedgerField(body, "session_url");
      const yamlState = parseLedgerField(body, "state");
      const tableName =
        body.match(/\|\s*Session\s*\|\s*`([^`]+)`\s*\|/i)?.[1] ??
        "";
      const tableId =
        body.match(/\|\s*Session ID\s*\|\s*`([^`]+)`\s*\|/i)?.[1] ??
        "";
      const tableState =
        body.match(/\|\s*Session 상태\s*\|\s*`([^`]+)`\s*\|/i)?.[1] ??
        "";
      const markdownUrl =
        body.match(/\[Jules Session 열기\]\(([^)]+)\)/i)?.[1] ??
        "";

      const name = yamlName || tableName;
      const id =
        yamlId ||
        tableId ||
        name.split("/").at(-1) ||
        "";

      if (name === "" && id === "") {
        return null;
      }

      return {
        name,
        id,
        url: yamlUrl || markdownUrl,
        state: yamlState || tableState || "UNKNOWN",
        createdAt: comment.created_at,
      };
    })
    .filter(
      (marker): marker is SessionMarker =>
        marker !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) -
        Date.parse(left.createdAt),
    );
}

function latestDispatchIntent(
  comments: GitHubComment[],
): DispatchIntent | null {
  const intents = comments
    .map((comment) => {
      const body = comment.body ?? "";

      if (!body.includes(DISPATCH_INTENT_MARKER)) {
        return null;
      }

      return {
        createdAt: comment.created_at,
        reservationKey:
          parseLedgerField(body, "reservation_key"),
      };
    })
    .filter(
      (intent): intent is DispatchIntent =>
        intent !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) -
        Date.parse(left.createdAt),
    );

  return intents[0] ?? null;
}

function extractPullRequestUrls(
  session: JulesSession,
): string[] {
  return session.outputs
    .map((output) => output.pullRequest?.url ?? "")
    .filter((url) => url !== "");
}

function pullRequestNumberFromUrl(
  repository: string,
  url: string,
): number | null {
  const [owner, repo] = repository.split("/");
  const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = url.match(
    new RegExp(
      `^https://github\\.com/${escapedOwner}/${escapedRepo}/pull/([0-9]+)(?:[#?].*)?$`,
      "i",
    ),
  );

  return match ? Number(match[1]) : null;
}

function sessionTitle(taskId: string, task: TaskContract | undefined): string {
  return `[${taskId}] ${task?.title ?? ""}`.trim();
}

function sessionMatchesRepository(
  session: JulesSession,
  repository: string,
): boolean {
  return (
    session.sourceContextRepository === "" ||
    session.sourceContextRepository === repository ||
    session.sourceContextRepository === `github/${repository}` ||
    session.sourceContextRepository === `sources/github/${repository}`
  );
}

function incidentMarker(key: string): string {
  return `${INCIDENT_MARKER_PREFIX}${key} -->`;
}

function hasCommentMarker(
  comments: GitHubComment[],
  marker: string,
): boolean {
  return comments.some((comment) =>
    (comment.body ?? "").includes(marker),
  );
}

function shouldPreserveStateOnApiError(error: JulesApiError): boolean {
  return TRANSIENT_API_ERROR_KINDS.has(error.kind);
}

function correctionAttempts(
  comments: GitHubComment[],
): number {
  return comments.filter(
    (comment) =>
      (comment.body ?? "").includes(
        "<!-- juleswhile:correction-attempt -->",
      ),
    ).length;
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

function latestMarkerAt(
  comments: GitHubComment[],
  marker: string,
): number {
  return Math.max(
    0,
    ...comments
      .filter((comment) =>
        (comment.body ?? "").includes(marker),
      )
      .map((comment) =>
        Date.parse(comment.created_at),
      )
      .filter(Number.isFinite),
  );
}

function latestResolvedDispatchOutcomeAt(
  comments: GitHubComment[],
): number {
  return Math.max(
    0,
    ...comments
      .filter((comment) =>
        (comment.body ?? "").includes(DISPATCH_OUTCOME_MARKER),
      )
      .filter((comment) => {
        const status = parseLedgerField(
          comment.body ?? "",
          "status",
        );

        return [
          "released",
          "failed",
          "reconciled",
        ].includes(status);
      })
      .map((comment) =>
        Date.parse(comment.created_at),
      )
      .filter(Number.isFinite),
  );
}

function hasUnresolvedDispatchIntent(
  comments: GitHubComment[],
): boolean {
  const latestIntentAt = latestMarkerAt(
    comments,
    DISPATCH_INTENT_MARKER,
  );

  if (latestIntentAt === 0) {
    return false;
  }

  return (
    latestIntentAt >
      latestMarkerAt(comments, DISPATCH_MARKER) &&
    latestIntentAt >
      latestResolvedDispatchOutcomeAt(comments)
  );
}

function latestActiveReservation(
  taskId: string,
  issueNumber: number,
  comments: GitHubComment[],
): RuntimeReservation | null {
  const events = comments
    .map((comment) => {
      const body = comment.body ?? "";

      if (!body.includes(QUOTA_LEDGER_MARKER)) {
        return null;
      }

      const parsedTaskId =
        parseLedgerField(body, "task_id").toUpperCase();
      const parsedIssueNumber = Number(
        parseLedgerField(body, "issue_number"),
      );
      const key =
        parseLedgerField(body, "reservation_key");
      const status =
        parseLedgerField(body, "status");
      const category =
        parseLedgerField(body, "category");

      if (
        parsedTaskId !== taskId ||
        parsedIssueNumber !== issueNumber ||
        key === "" ||
        !["new", "correction", "maintenance"].includes(category)
      ) {
        return null;
      }

      return {
        key,
        status,
        category:
          category as RuntimeReservation["category"],
        createdAt:
          comment.created_at,
      };
    })
    .filter((event): event is {
      key: string;
      status: string;
      category: RuntimeReservation["category"];
      createdAt: string;
    } => event !== null)
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) -
        Date.parse(right.createdAt),
    );

  const latestByKey =
    new Map<string, (typeof events)[number]>();

  for (const event of events) {
    latestByKey.set(event.key, event);
  }

  const active = [...latestByKey.values()]
    .filter((event) =>
      ["reserved", "committed"].includes(
        event.status,
      ),
    )
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) -
        Date.parse(left.createdAt),
    );

  const latest = active[0];

  return latest
    ? {
        key: latest.key,
        category: latest.category,
      }
    : null;
}

async function releaseReservation(
  repository: string,
  issue: GitHubIssue,
  taskId: string,
  reservation: RuntimeReservation,
  options: CliOptions,
  reason: string,
): Promise<void> {
  const workflowRunUrl =
    process.env.WORKFLOW_RUN_URL ?? "unknown";
  const workflowRunId =
    process.env.GITHUB_RUN_ID ??
    workflowRunUrl.match(/\/actions\/runs\/([0-9]+)/)?.[1] ??
    "manual";

  await comment(
    repository,
    issue.number,
    [
      QUOTA_LEDGER_MARKER,
      DISPATCH_OUTCOME_MARKER,
      "",
      "## Reconciler Dispatch Reservation Release",
      "",
      "```yaml",
      "event: quota-released",
      "status: released",
      `date: ${formatUtcDate(new Date())}`,
      `category: ${reservation.category}`,
      `task_id: ${taskId}`,
      `issue_number: ${issue.number}`,
      `reservation_key: ${reservation.key}`,
      `workflow_run_id: ${workflowRunId}`,
      `workflow_run_url: ${workflowRunUrl}`,
      "dispatch_status: reconciled",
      `reason: ${reason}`,
      `created_at: ${new Date().toISOString()}`,
      "```",
    ].join("\n"),
    options,
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

async function replaceStateLabels(
  repository: string,
  issue: GitHubIssue,
  nextState: string,
  options: CliOptions,
): Promise<void> {
  const labels =
    [...getLabels(issue)];

  const nextLabels = Array.from(
    new Set([
      ...labels.filter(
        (label) =>
          !label.startsWith("state:"),
      ),
      nextState,
    ]),
  );

  setLocalLabels(
    issue,
    nextLabels,
  );

  if (options.dryRun) {
    return;
  }

  await githubRequest(
    repository,
    `/issues/${issue.number}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        labels: nextLabels,
      }),
    },
  );
}

async function comment(
  repository: string,
  issueNumber: number,
  body: string,
  options: CliOptions,
): Promise<void> {
  if (options.dryRun) {
    return;
  }

  await githubRequest(
    repository,
    `/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({
        body,
      }),
    },
  );
}

async function closeIssue(
  repository: string,
  issue: GitHubIssue,
  options: CliOptions,
): Promise<void> {
  issue.state = "closed";

  if (options.dryRun) {
    return;
  }

  await githubRequest(
    repository,
    `/issues/${issue.number}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
        state_reason: "completed",
      }),
    },
  );
}

async function createIncident(
  repository: string,
  title: string,
  body: string,
  options: CliOptions,
): Promise<void> {
  if (options.dryRun) {
    return;
  }

  await githubRequest(
    repository,
    "/issues",
    {
      method: "POST",
      body: JSON.stringify({
        title:
          `[INCIDENT] ${title}`,
        body,
        labels: [
          "incident",
          "state:investigating",
        ],
      }),
    },
  );
}

async function createIncidentOnce(
  repository: string,
  issueNumber: number,
  title: string,
  markerKey: string,
  issueCommentBody: string,
  body: string,
  comments: GitHubComment[],
  options: CliOptions,
): Promise<boolean> {
  const marker = incidentMarker(markerKey);

  if (hasCommentMarker(comments, marker)) {
    return false;
  }

  await comment(
    repository,
    issueNumber,
    [
      marker,
      "",
      issueCommentBody,
    ].join("\n"),
    options,
  );

  await createIncident(
    repository,
    title,
    [
      marker,
      "",
      body,
    ].join("\n"),
    options,
  );

  return true;
}

async function ensureLabels(
  repository: string,
  options: CliOptions,
): Promise<void> {
  if (options.dryRun) {
    return;
  }

  const labels = [
    [
      "state:ready",
      "0E8A16",
      "TASK can be selected",
    ],
    [
      "state:retry-wait",
      "FBCA04",
      "TASK is waiting for retry",
    ],
    [
      "state:blocked",
      "D73A4A",
      "TASK requires intervention",
    ],
    [
      "state:running",
      "1D76DB",
      "TASK has an active Jules Session",
    ],
    [
      "state:pr-opened",
      "5319E7",
      "TASK produced a Pull Request",
    ],
    [
      "state:completed",
      "0E8A16",
      "TASK is completed",
    ],
    [
      "incident",
      "B60205",
      "Operational incident",
    ],
    [
      "state:investigating",
      "D93F0B",
      "Incident is under investigation",
    ],
  ] as const;

  for (const [
    name,
    color,
    description,
  ] of labels) {
    await ensureLabel(
      repository,
      name,
      color,
      description,
    );
  }
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

async function getPullRequest(
  repository: string,
  pullRequestNumber: number,
): Promise<GitHubPullRequest> {
  return githubRequest<GitHubPullRequest>(
    repository,
    `/pulls/${pullRequestNumber}`,
  );
}

async function recordSessionReconciliation(
  repository: string,
  issue: GitHubIssue,
  taskId: string,
  session: JulesSession,
  action: string,
  reason: string,
  options: CliOptions,
  pullRequestNumber?: number,
): Promise<void> {
  await comment(
    repository,
    issue.number,
    [
      SESSION_RECONCILIATION_MARKER,
      "",
      "## Jules Session Reconciliation",
      "",
      "```yaml",
      `task_id: ${taskId}`,
      `session_name: ${session.name}`,
      `session_id: ${session.id}`,
      `session_state: ${session.state}`,
      `session_url: ${session.url}`,
      `session_update_time: ${session.updateTime}`,
      `action: ${action}`,
      `reason: ${reason}`,
      ...(pullRequestNumber
        ? [`pull_request: #${pullRequestNumber}`]
        : []),
      `created_at: ${new Date().toISOString()}`,
      "```",
    ].join("\n"),
    options,
  );
}

async function recoverSessionFromCandidates(
  julesClient: JulesApiClient,
  repository: string,
  taskId: string,
  task: TaskContract | undefined,
  intent: DispatchIntent,
): Promise<
  | {
      kind: "none";
    }
  | {
      kind: "ambiguous";
      count: number;
    }
  | {
      kind: "found";
      session: JulesSession;
    }
> {
  const expectedTitle = sessionTitle(taskId, task);
  const createdAfter = Date.parse(intent.createdAt);
  const { sessions } =
    await julesClient.listSessions();
  const candidates = sessions.filter((session) => {
    const createdAt = Date.parse(session.createTime);

    return (
      session.title === expectedTitle &&
      (Number.isNaN(createdAfter) ||
        Number.isNaN(createdAt) ||
        createdAt >= createdAfter) &&
      sessionMatchesRepository(session, repository)
    );
  });

  if (candidates.length === 0) {
    return {
      kind: "none",
    };
  }

  if (candidates.length > 1) {
    return {
      kind: "ambiguous",
      count: candidates.length,
    };
  }

  return {
    kind: "found",
    session: candidates[0],
  };
}

async function reconcileJulesSession(
  repository: string,
  issue: GitHubIssue,
  taskId: string,
  task: TaskContract | undefined,
  comments: GitHubComment[],
  labels: Set<string>,
  options: CliOptions,
  julesClient: JulesApiClient,
  result: ReconcileResult,
): Promise<boolean> {
  const sessionMarkers =
    parseSessionMarkers(comments);
  let session: JulesSession | null = null;

  if (sessionMarkers.length > 0) {
    const marker = sessionMarkers[0];
    result.summary.sessions_checked += 1;
    session = await julesClient.getSession(
      marker.name || marker.id,
    );
  } else {
    const intent = latestDispatchIntent(comments);

    if (
      labels.has("state:dispatching") &&
      intent !== null &&
      hasUnresolvedDispatchIntent(comments)
    ) {
      const recovery =
        await recoverSessionFromCandidates(
          julesClient,
          repository,
          taskId,
          task,
          intent,
        );

      result.summary.sessions_checked += 1;

      if (recovery.kind === "found") {
        result.summary.sessions_recovered += 1;
        session = recovery.session;

        await comment(
          repository,
          issue.number,
          [
            SESSION_RECONCILIATION_MARKER,
            DISPATCH_MARKER,
            "",
            "## Jules Session Marker Recovered",
            "",
            "```yaml",
            `task_id: ${taskId}`,
            `session_name: ${session.name}`,
            `session_id: ${session.id}`,
            `session_url: ${session.url}`,
            `state: ${session.state}`,
            "recovered_from: dispatch-intent",
            `created_at: ${new Date().toISOString()}`,
            "```",
          ].join("\n"),
          options,
        );
      } else if (recovery.kind === "none") {
        const reservation =
          latestActiveReservation(
            taskId,
            issue.number,
            comments,
          );

        if (reservation) {
          await releaseReservation(
            repository,
            issue,
            taskId,
            reservation,
            options,
            "dispatch-intent-without-jules-session",
          );
        }

        result.summary.repaired += 1;
        result.summary.retried += 1;
        result.actions.push({
          issueNumber: issue.number,
          taskId,
          action: "restore-ready-no-session-candidate",
          reason:
            "Dispatch intent had no matching Jules Session candidate.",
          applied: options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:ready",
          options,
        );

        return true;
      } else {
        result.summary.repaired += 1;
        result.summary.blocked += 1;
        result.actions.push({
          issueNumber: issue.number,
          taskId,
          action: "block-ambiguous-session-candidates",
          reason: `Found ${recovery.count} matching Jules Session candidates.`,
          applied: options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:blocked",
          options,
        );

        if (
          await createIncidentOnce(
            repository,
            issue.number,
            `Ambiguous Jules Session candidates for ${taskId}`,
            `${taskId}-ambiguous-session-candidates`,
            [
              "## Jules Session 후보 중복",
              "",
              `동일 TASK에 대한 Jules Session 후보가 ${recovery.count}개 발견되어 BLOCKED로 전환했습니다.`,
            ].join("\n"),
            [
              "# Ambiguous Jules Session Candidates",
              "",
              `- TASK: \`${taskId}\``,
              `- Issue: #${issue.number}`,
              `- Candidates: ${recovery.count}`,
            ].join("\n"),
            comments,
            options,
          )
        ) {
          result.summary.incidents += 1;
        }

        return true;
      }
    }
  }

  if (session === null) {
    return false;
  }

  const state = session.state.toUpperCase();

  if (ACTIVE_JULES_STATES.has(state)) {
    result.actions.push({
      issueNumber: issue.number,
      taskId,
      action: "preserve-running-active-session",
      reason: `Jules Session is ${state}.`,
      applied: false,
    });

    if (!labels.has("state:running")) {
      result.summary.repaired += 1;
      await replaceStateLabels(
        repository,
        issue,
        "state:running",
        options,
      );
    }

    await recordSessionReconciliation(
      repository,
      issue,
      taskId,
      session,
      "preserve-running",
      `Jules Session is ${state}.`,
      options,
    );

    return true;
  }

  if (HUMAN_INTERVENTION_JULES_STATES.has(state)) {
    result.summary.repaired += 1;
    result.summary.blocked += 1;
    result.actions.push({
      issueNumber: issue.number,
      taskId,
      action: "block-human-intervention",
      reason: `Jules Session requires intervention: ${state}.`,
      applied: options.apply,
    });

    await replaceStateLabels(
      repository,
      issue,
      "state:blocked",
      options,
    );

    const markerKey =
      `${taskId}-human-intervention-${state.toLowerCase()}`;

    if (
      await createIncidentOnce(
        repository,
        issue.number,
        `Jules Session requires intervention for ${taskId}`,
        markerKey,
        [
          "## Jules Session 사람 개입 필요",
          "",
          `- Session: ${session.url || session.name}`,
          `- State: \`${state}\``,
        ].join("\n"),
        [
          "# Jules Session Requires Intervention",
          "",
          `- TASK: \`${taskId}\``,
          `- Issue: #${issue.number}`,
          `- State: \`${state}\``,
          `- Session: ${session.url || session.name}`,
        ].join("\n"),
        comments,
        options,
      )
    ) {
      result.summary.incidents += 1;
    }

    return true;
  }

  if (state === "COMPLETED") {
    const pullRequestUrl =
      extractPullRequestUrls(session)[0] ?? "";
    const pullRequestNumber =
      pullRequestUrl === ""
        ? null
        : pullRequestNumberFromUrl(
            repository,
            pullRequestUrl,
          );

    if (pullRequestNumber === null) {
      result.summary.repaired += 1;
      result.summary.blocked += 1;
      result.actions.push({
        issueNumber: issue.number,
        taskId,
        action: "block-completed-without-pr",
        reason:
          "Session completed without traceable PR.",
        applied: options.apply,
      });

      await replaceStateLabels(
        repository,
        issue,
        "state:blocked",
        options,
      );

      if (
        await createIncidentOnce(
          repository,
          issue.number,
          `Session completed without traceable PR for ${taskId}`,
          `${taskId}-completed-without-pr`,
          [
            "## Session completed without traceable PR",
            "",
            `- Session: ${session.url || session.name}`,
            `- updateTime: ${session.updateTime}`,
          ].join("\n"),
          [
            "# Session Completed Without Traceable PR",
            "",
            `- TASK: \`${taskId}\``,
            `- Issue: #${issue.number}`,
            `- Session: ${session.url || session.name}`,
          ].join("\n"),
          comments,
          options,
        )
      ) {
        result.summary.incidents += 1;
      }

      return true;
    }

    const pullRequest =
      await getPullRequest(
        repository,
        pullRequestNumber,
      );

    result.summary.repaired += 1;
    result.actions.push({
      issueNumber: issue.number,
      taskId,
      action: "move-to-pr-opened",
      reason: `Jules Session completed with PR #${pullRequest.number}.`,
      applied: options.apply,
    });

    await replaceStateLabels(
      repository,
      issue,
      "state:pr-opened",
      options,
    );

    await recordSessionReconciliation(
      repository,
      issue,
      taskId,
      session,
      "move-to-pr-opened",
      `Pull Request #${pullRequest.number} is ${pullRequest.state}.`,
      options,
      pullRequest.number,
    );

    return true;
  }

  if (state === "FAILED") {
    const attempts =
      correctionAttempts(comments);
    const maxCorrections =
      task?.retry_policy?.max_corrections ??
      options.maxCorrections;
    const nextState =
      attempts < maxCorrections
        ? "state:retry-wait"
        : "state:blocked";

    result.summary.repaired += 1;
    if (nextState === "state:retry-wait") {
      result.summary.retried += 1;
    } else {
      result.summary.blocked += 1;
    }

    result.actions.push({
      issueNumber: issue.number,
      taskId,
      action:
        nextState === "state:retry-wait"
          ? "move-failed-session-to-retry-wait"
          : "block-failed-session",
      reason: `Jules Session failed. attempts=${attempts}, max=${maxCorrections}.`,
      applied: options.apply,
    });

    await replaceStateLabels(
      repository,
      issue,
      nextState,
      options,
    );

    await recordSessionReconciliation(
      repository,
      issue,
      taskId,
      session,
      nextState === "state:retry-wait"
        ? "move-to-retry-wait"
        : "block",
      `Jules Session failed at ${session.updateTime}.`,
      options,
    );

    return true;
  }

  result.summary.unknown_states += 1;
  result.actions.push({
    issueNumber: issue.number,
    taskId,
    action: "preserve-unknown-session-state",
    reason: `Unknown Jules Session state: ${state}.`,
    applied: false,
  });

  await recordSessionReconciliation(
    repository,
    issue,
    taskId,
    session,
    "preserve-state",
    `Unknown Jules Session state: ${state}.`,
    options,
  );

  return true;
}

async function main(): Promise<void> {
  const options =
    parseArguments(
      process.argv.slice(2),
    );

  const repository =
    getRepository();

  const taskIndex =
    await readTaskIndex();
  const julesClient =
    new JulesApiClient();

  await ensureLabels(
    repository,
    options,
  );

  const issues =
    await listIssues(repository);

  const taskIssues =
    issues.filter(
      (issue) =>
        getTaskId(issue) !== null,
    );

  const result: ReconcileResult = {
    dryRun: options.dryRun,
    shouldScheduleNext: false,
    summary: {
      scanned:
        taskIssues.length,
      repaired: 0,
      stuck: 0,
      blocked: 0,
      retried: 0,
      incidents: 0,
      sessions_checked: 0,
      sessions_recovered: 0,
      api_errors: 0,
      unknown_states: 0,
    },
    actions: [],
    completedAt:
      new Date().toISOString(),
  };

  const groups =
    new Map<
      string,
      GitHubIssue[]
    >();

  for (const issue of taskIssues) {
    const taskId =
      getTaskId(issue) as string;

    const group =
      groups.get(taskId) ?? [];

    group.push(issue);

    groups.set(taskId, group);
  }

  result.summary.scanned =
    groups.size;

  for (
    const [
      taskId,
      group,
    ] of groups
  ) {
    if (group.length <= 1) {
      continue;
    }

    const ordered =
      [...group].sort(
        (left, right) =>
          left.number -
          right.number,
      );

    const canonical =
      ordered[0];

    for (
      const duplicate of
      ordered.slice(1)
    ) {
      if (duplicate.state !== "open") {
        continue;
      }

      result.summary.incidents += 1;
      result.summary.blocked += 1;

      result.actions.push({
        issueNumber:
          duplicate.number,
        taskId,
        action:
          "block-duplicate",
        reason:
          `Duplicate TASK Issue. Canonical Issue is #${canonical.number}.`,
        applied:
          options.apply,
      });

      await replaceStateLabels(
        repository,
        duplicate,
        "state:blocked",
        options,
      );

      await comment(
        repository,
        duplicate.number,
        [
          "<!-- juleswhile:duplicate-task -->",
          "",
          "## 중복 TASK Issue 차단",
          "",
          `\`${taskId}\`의 기준 Issue는 #${canonical.number}입니다.`,
          "",
          "이 Issue에서는 Jules Session을 생성하지 마십시오.",
        ].join("\n"),
        options,
      );
    }

    await createIncident(
      repository,
      `Duplicate TASK Issue detected for ${taskId}`,
      [
        "# Duplicate TASK Issue",
        "",
        `- TASK: \`${taskId}\``,
        `- Canonical Issue: #${canonical.number}`,
        `- Duplicate Issues: ${ordered.slice(1).map((issue) => `#${issue.number}`).join(", ")}`,
        "",
        "Dispatcher idempotency와 Issue materialization 상태를 확인하십시오.",
      ].join("\n"),
      options,
    );
  }

  for (const issue of taskIssues) {
    if (issue.state !== "open") {
      continue;
    }

    const taskId =
      getTaskId(issue);

    if (
      !taskId ||
      !TASK_ID_PATTERN.test(taskId)
    ) {
      continue;
    }

    const labels =
      getLabels(issue);

    const age =
      ageMinutes(
        issue.updated_at,
      );

    const comments =
      await listComments(
        repository,
        issue.number,
      );

    const task =
      taskIndex.get(taskId);

    if (
      labels.has("state:running") ||
      labels.has("state:dispatching")
    ) {
      try {
        const handled =
          await reconcileJulesSession(
            repository,
            issue,
            taskId,
            task,
            comments,
            labels,
            options,
            julesClient,
            result,
          );

        if (handled) {
          continue;
        }
      } catch (error) {
        if (error instanceof JulesApiError) {
          result.summary.api_errors += 1;
          result.actions.push({
            issueNumber: issue.number,
            taskId,
            action:
              error.kind === "not_found"
                ? "block-missing-jules-session"
                : "preserve-state-api-error",
            reason:
              error.kind === "not_found"
                ? "Jules Session lookup returned 404."
                : `Jules API lookup failed: ${error.kind}.`,
            applied:
              error.kind === "not_found" &&
              options.apply,
          });

          if (error.kind === "not_found") {
            result.summary.repaired += 1;
            result.summary.blocked += 1;

            await replaceStateLabels(
              repository,
              issue,
              "state:blocked",
              options,
            );

            if (
              await createIncidentOnce(
                repository,
                issue.number,
                `Missing Jules Session for ${taskId}`,
                `${taskId}-missing-jules-session`,
                [
                  "## Jules Session 유실",
                  "",
                  "Jules API가 기존 Session marker에 대해 404를 반환했습니다.",
                  "",
                  "새 Session은 자동 생성하지 않습니다.",
                ].join("\n"),
                [
                  "# Missing Jules Session",
                  "",
                  `- TASK: \`${taskId}\``,
                  `- Issue: #${issue.number}`,
                  "- API result: 404",
                ].join("\n"),
                comments,
                options,
              )
            ) {
              result.summary.incidents += 1;
            }
          } else if (!shouldPreserveStateOnApiError(error)) {
            result.summary.unknown_states +=
              error.kind === "invalid_response" ? 1 : 0;
          }

          continue;
        }

        throw error;
      }
    }

    if (
      labels.has("state:dispatching") &&
      age >=
        options.staleDispatchingMinutes
    ) {
      result.summary.stuck += 1;

      const hasSession =
        comments.some(
          (entry) =>
            (entry.body ?? "").includes(
              DISPATCH_MARKER,
            ),
        );

      if (!hasSession) {
        const reservation =
          latestActiveReservation(
            taskId,
            issue.number,
            comments,
          );

        if (hasUnresolvedDispatchIntent(comments)) {
          result.summary.repaired += 1;
          result.summary.blocked += 1;
          result.summary.incidents += 1;

          result.actions.push({
            issueNumber:
              issue.number,
            taskId,
            action:
              "block-unresolved-dispatch-intent",
            reason:
              "Dispatch intent exists without a Session marker or explicit release.",
            applied:
              options.apply,
          });

          await replaceStateLabels(
            repository,
            issue,
            "state:blocked",
            options,
          );

          await comment(
            repository,
            issue.number,
            [
              "<!-- juleswhile:reconciler-dispatch-unknown -->",
              "",
              "## Dispatch 결과 확인 필요",
              "",
              "Jules Session 생성 의도는 기록됐지만 Session 또는 명시적 해제 기록이 없습니다.",
              "",
              "중복 Jules Session 생성을 막기 위해 TASK를 BLOCKED로 전환했습니다.",
              "",
              `- Detected at: ${new Date().toISOString()}`,
            ].join("\n"),
            options,
          );

          await createIncident(
            repository,
            `Unresolved Dispatch Intent for ${taskId}`,
            [
              "# Unresolved Dispatch Intent",
              "",
              `- TASK: \`${taskId}\``,
              `- Issue: #${issue.number}`,
              "",
              "A dispatch intent exists without a Jules Session marker or explicit release.",
              "Verify the Jules API state before retrying this TASK.",
            ].join("\n"),
            options,
          );

          continue;
        }

        if (reservation) {
          await releaseReservation(
            repository,
            issue,
            taskId,
            reservation,
            options,
            "stale-dispatching-without-session",
          );
        }

        result.summary.repaired += 1;
        result.summary.retried += 1;

        result.actions.push({
          issueNumber:
            issue.number,
          taskId,
          action:
            "restore-ready",
          reason:
            "Dispatch reservation expired before a Jules Session marker was recorded.",
          applied:
            options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:ready",
          options,
        );

        await comment(
          repository,
          issue.number,
          [
            "<!-- juleswhile:reconciler-retry -->",
            "",
            "## Reconciler 복구",
            "",
            "Dispatch 예약 이후 Jules Session 생성 기록이 없어 TASK를 READY로 복구했습니다.",
            "",
            `- Detected at: ${new Date().toISOString()}`,
          ].join("\n"),
          options,
        );

        continue;
      }
    }

    if (
      labels.has("state:running") &&
      (
        age >=
          options.staleRunningMinutes ||
        age >=
          options.sessionTimeoutMinutes
      )
    ) {
      result.summary.stuck += 1;

      result.actions.push({
        issueNumber:
          issue.number,
        taskId,
        action:
          "preserve-running-without-api-session",
        reason:
          "Running TASK exceeded the stale threshold but no Jules Session marker was available for API verification.",
        applied:
          false,
      });

      continue;
    }

    if (
      labels.has("state:validating") &&
      age >=
        options.staleValidatingMinutes
    ) {
      result.summary.stuck += 1;

      const pullRequestNumber =
        findPullRequestNumber(
          issue,
          comments,
        );

      if (!pullRequestNumber) {
        result.summary.repaired += 1;
        result.summary.blocked += 1;

        result.actions.push({
          issueNumber:
            issue.number,
          taskId,
          action:
            "block-missing-pr",
          reason:
            "A validating TASK has no traceable Pull Request.",
          applied:
            options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:blocked",
          options,
        );

        continue;
      }

      const pullRequest =
        await githubRequest<GitHubPullRequest>(
          repository,
          `/pulls/${pullRequestNumber}`,
        );

      if (pullRequest.merged) {
        result.summary.repaired += 1;

        result.actions.push({
          issueNumber:
            issue.number,
          taskId,
          action:
            "complete-merged-task",
          reason:
            `Pull Request #${pullRequestNumber} is merged.`,
          applied:
            options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:completed",
          options,
        );

        await closeIssue(
          repository,
          issue,
          options,
        );

        continue;
      }

      if (
        pullRequest.state === "closed"
      ) {
        result.summary.repaired += 1;
        result.summary.blocked += 1;

        result.actions.push({
          issueNumber:
            issue.number,
          taskId,
          action:
            "block-closed-pr",
          reason:
            `Pull Request #${pullRequestNumber} was closed without merge.`,
          applied:
            options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:blocked",
          options,
        );

        continue;
      }

      result.summary.incidents += 1;

      result.actions.push({
        issueNumber:
          issue.number,
        taskId,
        action:
          "report-stale-validation",
        reason:
          `Pull Request #${pullRequestNumber} remains open beyond the validation threshold.`,
        applied:
          options.apply,
      });

      await comment(
        repository,
        issue.number,
        [
          "<!-- juleswhile:stale-validation -->",
          "",
          "## 장기 VALIDATING 상태 감지",
          "",
          `Pull Request #${pullRequestNumber}가 검증 제한 시간을 초과했습니다.`,
          "",
          "Required Checks, Review, Merge Conflict와 CI 실행 상태를 확인하십시오.",
        ].join("\n"),
        options,
      );
    }
  }

  const hasActiveTask =
    taskIssues.some((issue) => {
      if (issue.state !== "open") {
        return false;
      }

      return hasAnyLabel(
        getLabels(issue),
        ACTIVE_LABELS,
      );
    });

  const hasReadyTask =
    taskIssues.some((issue) => {
      if (issue.state !== "open") {
        return false;
      }

      const labels =
        getLabels(issue);

      return (
        labels.has("state:ready") ||
        labels.has("state:retry-wait")
      );
    });

  result.shouldScheduleNext =
    !hasActiveTask &&
    hasReadyTask;

  await writeJsonAtomic(
    options.responseFile,
    result,
  );

  console.log(
    `Reconciler 완료: scanned=${result.summary.scanned}, repaired=${result.summary.repaired}`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `프로젝트 상태 복구 실패: ${message}`,
  );

  process.exitCode = 1;
});
