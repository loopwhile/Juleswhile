#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

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
  return githubRequest<GitHubComment[]>(
    repository,
    `/issues/${issueNumber}/comments?per_page=100`,
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

async function main(): Promise<void> {
  const options =
    parseArguments(
      process.argv.slice(2),
    );

  const repository =
    getRepository();

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
              "<!-- juleswhile:task-dispatch -->",
            ),
        );

      if (!hasSession) {
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

      const attempts =
        correctionAttempts(comments);

      if (
        attempts <
        options.maxCorrections
      ) {
        result.summary.repaired += 1;
        result.summary.retried += 1;

        result.actions.push({
          issueNumber:
            issue.number,
          taskId,
          action:
            "move-to-retry-wait",
          reason:
            "Running TASK exceeded the configured stale or session timeout threshold.",
          applied:
            options.apply,
        });

        await replaceStateLabels(
          repository,
          issue,
          "state:retry-wait",
          options,
        );

        await comment(
          repository,
          issue.number,
          [
            "<!-- juleswhile:reconciler-timeout -->",
            "",
            "## Jules Session 시간 초과",
            "",
            "TASK가 허용된 실행 시간을 초과해 RETRY_WAIT로 전환됐습니다.",
            "",
            `- Previous correction attempts: ${attempts}`,
            `- Maximum corrections: ${options.maxCorrections}`,
          ].join("\n"),
          options,
        );
      } else {
        result.summary.repaired += 1;
        result.summary.blocked += 1;

        result.actions.push({
          issueNumber:
            issue.number,
          taskId,
          action:
            "block-after-timeout",
          reason:
            "The TASK exceeded the correction or retry limit.",
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
            "<!-- juleswhile:reconciler-blocked -->",
            "",
            "## TASK 자동 복구 중단",
            "",
            "허용된 보완 횟수를 초과해 TASK를 BLOCKED로 전환했습니다.",
            "",
            "사람 또는 Reviewer의 원인 분석이 필요합니다.",
          ].join("\n"),
          options,
        );
      }

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