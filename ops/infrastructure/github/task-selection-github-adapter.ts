import process from "node:process";

import { fail } from "../../application/select-next-task-cli.js";

import {
  QUOTA_LEDGER_MARKER,
  type Candidate,
  type GitHubComment,
  type GitHubIssue,
} from "../../domain/task-selection/task-selection-contract.js";

import {
  getLabels,
} from "../../domain/task-selection/task-selection-issue-policy.js";

import {
  formatUtcDate,
  getTaskCategory,
} from "../../domain/task-selection/task-selection-quota-policy.js";

const GITHUB_API_BASE_URL =
  process.env.GITHUB_API_URL ??
  "https://api.github.com";

export function getGitHubToken(): string {
  const token = process.env.GH_TOKEN;

  if (!token) {
    fail("GH_TOKEN이 필요합니다.");
  }

  return token;
}

export async function githubRequest<T>(
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

export async function listIssues(
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

export async function listComments(
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

export async function ensureLabel(
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

export async function reserveCandidate(
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
