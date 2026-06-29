#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export type TransitionMode =
  | "deploying"
  | "completed"
  | "failed"
  | "verification-disabled";

export interface TransitionOptions {
  mode: TransitionMode;
  issueNumber: number;
  taskId: string;
  mergeSha: string;
  responseFile: string;
  prNumber: string;
  deployId: string;
  deployUrl: string;
  deployState: string;
  workflowUrl: string;
  dryRun: boolean;
}

interface GitHubIssue {
  number: number;
  state: "open" | "closed";
  labels: Array<
    | string
    | {
        name?: string;
      }
  >;
}

interface GitHubComment {
  body: string | null;
}

export interface TransitionResult {
  mode: TransitionMode;
  issueNumber: number;
  taskId: string;
  mergeSha: string;
  labels: string[];
  issueState: "open" | "closed";
  marker: string;
  commentCreated: boolean;
  shouldDispatchNext: boolean;
  dryRun: boolean;
  completedAt: string;
}

interface TransitionDependencies {
  fetchImpl?: typeof fetch;
  repository?: string;
  token?: string;
  apiBaseUrl?: string;
}

const DEPLOYMENT_LABELS = new Set([
  "deployment:ready",
  "deployment:failed",
  "deployment:verification-disabled",
]);

function fail(message: string): never {
  throw new Error(message);
}

function requireValue(
  argv: string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    fail(`${flag} 옵션에 값이 필요합니다.`);
  }

  return value;
}

function parseIssueNumber(value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    fail("issue-number는 양의 정수여야 합니다.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fail("issue-number는 양의 정수여야 합니다.");
  }

  return parsed;
}

function parseArguments(argv: string[]): TransitionOptions {
  let mode = "";
  let issueNumber = 0;
  let taskId = "";
  let mergeSha = "";
  let responseFile = "";
  let prNumber = "";
  let deployId = "";
  let deployUrl = "";
  let deployState = "";
  let workflowUrl = "";
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--mode":
        mode = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--issue-number":
        issueNumber = parseIssueNumber(
          requireValue(argv, index, argument),
        );
        index += 1;
        break;

      case "--task-id":
        taskId = requireValue(argv, index, argument).toUpperCase();
        index += 1;
        break;

      case "--merge-sha":
        mergeSha = requireValue(argv, index, argument).toLowerCase();
        index += 1;
        break;

      case "--response-file":
        responseFile = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--pr-number":
        prNumber = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--deploy-id":
        deployId = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--deploy-url":
        deployUrl = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--deploy-state":
        deployState = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--workflow-url":
        workflowUrl = requireValue(argv, index, argument);
        index += 1;
        break;

      case "--dry-run":
        dryRun = true;
        break;

      default:
        fail(`지원하지 않는 옵션입니다: ${argument}`);
    }
  }

  if (
    ![
      "deploying",
      "completed",
      "failed",
      "verification-disabled",
    ].includes(mode)
  ) {
    fail("mode가 올바르지 않습니다.");
  }

  if (issueNumber === 0) {
    fail("issue-number가 필요합니다.");
  }

  if (!/^(TASK-[0-9]{3,}|CORRECTION-[A-Z0-9-]+)$/.test(taskId)) {
    fail(`TASK ID 형식이 올바르지 않습니다: ${taskId}`);
  }

  if (!/^[0-9a-f]{7,40}$/.test(mergeSha)) {
    fail("merge-sha가 올바르지 않습니다.");
  }

  if (responseFile.trim() === "") {
    fail("response-file이 필요합니다.");
  }

  return {
    mode: mode as TransitionMode,
    issueNumber,
    taskId,
    mergeSha,
    responseFile,
    prNumber,
    deployId,
    deployUrl,
    deployState,
    workflowUrl,
    dryRun,
  };
}

function getRepository(): string {
  const repository =
    process.env.REPOSITORY ??
    process.env.GITHUB_REPOSITORY ??
    "";

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    fail("REPOSITORY 또는 GITHUB_REPOSITORY가 필요합니다.");
  }

  return repository;
}

function getToken(): string {
  const token = process.env.GH_TOKEN ?? "";

  if (token === "") {
    fail("GH_TOKEN이 필요합니다.");
  }

  return token;
}

function labelNames(issue: GitHubIssue): string[] {
  return issue.labels
    .map((label) =>
      typeof label === "string" ? label : label.name ?? "",
    )
    .filter(Boolean);
}

export function buildTransitionLabels(
  currentLabels: string[],
  mode: TransitionMode,
): string[] {
  const labels = currentLabels.filter(
    (label) =>
      !label.startsWith("state:") &&
      !DEPLOYMENT_LABELS.has(label),
  );

  switch (mode) {
    case "deploying":
      labels.push("state:deploying");
      break;

    case "completed":
      labels.push("state:completed", "deployment:ready");
      break;

    case "failed":
      labels.push(
        "state:deployment-review",
        "deployment:failed",
      );
      break;

    case "verification-disabled":
      labels.push(
        "state:deploying",
        "deployment:verification-disabled",
      );
      break;
  }

  return [...new Set(labels)].sort();
}

function markerPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

export function buildTransitionMarker(
  options: Pick<
    TransitionOptions,
    "mode" | "mergeSha" | "deployId" | "deployState"
  >,
): string {
  switch (options.mode) {
    case "deploying":
      return `<!-- juleswhile:task-deploying:${options.mergeSha} -->`;

    case "completed":
      return `<!-- juleswhile:deployment-completed:${options.mergeSha}:${markerPart(options.deployId)} -->`;

    case "failed":
      return `<!-- juleswhile:deployment-failed:${options.mergeSha}:${markerPart(options.deployId || options.deployState)} -->`;

    case "verification-disabled":
      return `<!-- juleswhile:deployment-verification-disabled:${options.mergeSha} -->`;
  }
}

function buildComment(
  options: TransitionOptions,
  marker: string,
): string {
  const lines = [marker, ""];

  switch (options.mode) {
    case "deploying":
      lines.push(
        "## TASK Production 배포 대기",
        "",
        `\`${options.taskId}\`의 Pull Request가 \`main\`에 병합됐습니다.`,
        "",
        `- Pull Request: #${options.prNumber || "unknown"}`,
        `- Merge Commit: \`${options.mergeSha}\``,
        "- 상태: `deploying`",
        "",
        "Netlify Production 배포 검증 전에는 TASK를 완료 처리하지 않습니다.",
      );
      break;

    case "completed":
      lines.push(
        "## Production 배포 검증 완료",
        "",
        `\`${options.taskId}\`의 Production 배포가 확인됐습니다.`,
        "",
        `- Merge Commit: \`${options.mergeSha}\``,
        `- Netlify Deploy: \`${options.deployId || "unknown"}\``,
        "- 상태: `completed`",
        `- 완료 시각: ${new Date().toISOString()}`,
      );

      if (options.deployUrl !== "") {
        lines.push("", `[Production 결과 확인](${options.deployUrl})`);
      }
      break;

    case "failed":
      lines.push(
        "## Production 배포 검증 실패",
        "",
        `\`${options.taskId}\`의 Production 배포를 확인하지 못했습니다.`,
        "",
        `- Merge Commit: \`${options.mergeSha}\``,
        `- Netlify Deploy: \`${options.deployId || "not-found"}\``,
        `- 상태: \`${options.deployState || "workflow-error"}\``,
        `- Workflow: ${options.workflowUrl || "unknown"}`,
        "",
        "Issue를 다시 열고 deployment review 상태로 전환했습니다.",
      );
      break;

    case "verification-disabled":
      lines.push(
        "## Production 배포 검증 비활성",
        "",
        `\`${options.taskId}\`의 Production 배포 검증이 비활성 상태입니다.`,
        "",
        `- Merge Commit: \`${options.mergeSha}\``,
        "- 상태: `deploying`",
        "",
        "배포 성공을 추정하지 않으며, 수동 Netlify 검증이 필요합니다.",
      );
      break;
  }

  return lines.join("\n");
}

async function githubRequest<T>(
  repository: string,
  route: string,
  init: RequestInit,
  dependencies: Required<TransitionDependencies>,
): Promise<T> {
  const response = await dependencies.fetchImpl(
    `${dependencies.apiBaseUrl}/repos/${repository}${route}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${dependencies.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    },
  );

  const text = await response.text();

  if (!response.ok) {
    fail(
      `GitHub API 요청 실패 HTTP ${response.status}: ${text.slice(0, 1000)}`,
    );
  }

  return text.trim() === ""
    ? (undefined as T)
    : (JSON.parse(text) as T);
}

async function listComments(
  repository: string,
  issueNumber: number,
  dependencies: Required<TransitionDependencies>,
): Promise<GitHubComment[]> {
  const comments: GitHubComment[] = [];

  for (let page = 1; page <= 100; page += 1) {
    const batch = await githubRequest<GitHubComment[]>(
      repository,
      `/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      {
        method: "GET",
      },
      dependencies,
    );

    comments.push(...batch);

    if (batch.length < 100) {
      break;
    }
  }

  return comments;
}

async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolutePath), {
    recursive: true,
  });

  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;

  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(temporaryPath, absolutePath);
}

export async function transitionTaskState(
  options: TransitionOptions,
  dependencies: TransitionDependencies = {},
): Promise<TransitionResult> {
  const resolvedDependencies: Required<TransitionDependencies> = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    repository: dependencies.repository ?? getRepository(),
    token: dependencies.token ?? getToken(),
    apiBaseUrl:
      dependencies.apiBaseUrl ??
      process.env.GITHUB_API_URL ??
      "https://api.github.com",
  };

  const repository = resolvedDependencies.repository;

  const issue = await githubRequest<GitHubIssue>(
    repository,
    `/issues/${options.issueNumber}`,
    {
      method: "GET",
    },
    resolvedDependencies,
  );

  const comments = await listComments(
    repository,
    options.issueNumber,
    resolvedDependencies,
  );

  const labels = buildTransitionLabels(
    labelNames(issue),
    options.mode,
  );

  const issueState =
    options.mode === "completed" ? "closed" : "open";

  const marker = buildTransitionMarker(options);
  const markerExists = comments.some((comment) =>
    (comment.body ?? "").includes(marker),
  );

  if (!options.dryRun) {
    await githubRequest(
      repository,
      `/issues/${options.issueNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          labels,
          state: issueState,
          ...(issueState === "closed"
            ? {
                state_reason: "completed",
              }
            : {}),
        }),
      },
      resolvedDependencies,
    );

    if (!markerExists) {
      await githubRequest(
        repository,
        `/issues/${options.issueNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            body: buildComment(options, marker),
          }),
        },
        resolvedDependencies,
      );
    }
  }

  const result: TransitionResult = {
    mode: options.mode,
    issueNumber: options.issueNumber,
    taskId: options.taskId,
    mergeSha: options.mergeSha,
    labels,
    issueState,
    marker,
    commentCreated: !options.dryRun && !markerExists,
    shouldDispatchNext: options.mode === "completed",
    dryRun: options.dryRun,
    completedAt: new Date().toISOString(),
  };

  await writeJsonAtomic(options.responseFile, result);

  console.log(
    `TASK 상태 전이 완료: ${options.taskId} -> ${options.mode}`,
  );

  return result;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  await transitionTaskState(options);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
