#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { stringify as stringifyYaml } from "yaml";

import { loadTaskManifest } from "./task-manifest.js";

const TASK_INDEX_PATH =
  "ops/tasks/task-index.yaml";

const GITHUB_API_BASE_URL =
  process.env.GITHUB_API_URL ??
  "https://api.github.com";

const TASK_ID_PATTERN =
  /^TASK-[0-9]{3,}$/;

const MANAGED_MARKER =
  "<!-- juleswhile:managed-task-issue -->";

interface CliOptions {
  mode: "sync" | "instantiate";
  responseFile: string;
  dryRun: boolean;
  force: boolean;
  templateId?: string;
  instanceKey?: string;
  contentType?: string;
  topic?: string;
  periodKey?: string;
  timezone?: string;
}

interface TaskContract {
  kind: "task" | "template";
  id: string;
  title: string;
  role: string;
  type: string;
  status: string;
  priority: string;
  enabled: boolean;
  objective: string;
  depends_on: string[];
  inputs: string[];
  outputs: string[];
  acceptance_criteria: string[];
  allowed_paths: string[];
  forbidden_paths: string[];
  forbidden_actions: string[];
  validation_commands: string[];
  risk_level: string;
  approval_policy: string;
  parallelizable: boolean;
  resource_locks: string[];
  conflicts_with: string[];
  retry_policy: {
    max_corrections: number;
    timeout_minutes: number;
  };
  stitch: {
    allowed: boolean;
    required?: boolean;
    expected_outputs?: string[];
  };
  recurrence?: {
    enabled: boolean;
    schedule: string;
    timezone: string;
    instance_id_strategy: string;
    max_instances_per_day: number;
  };
  metadata: {
    goal_issue_number?: number | null;
    issue_number?: number | null;
    created_at: string;
    updated_at: string;
    created_by: string;
    tags: string[];
    template_id?: string | null;
    instance_key?: string | null;
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
  pull_request?: unknown;
  labels: Array<
    | string
    | {
        name?: string;
      }
  >;
}

interface SyncResult {
  mode: "sync";
  created: number;
  updated: number;
  existing: number;
  skipped: number;
  dryRun: boolean;
  issues: Array<{
    taskId: string;
    issueNumber: number | null;
    action:
      | "create"
      | "update"
      | "existing"
      | "skip";
    reason: string;
  }>;
  completedAt: string;
}

interface InstantiateResult {
  mode: "instantiate";
  created: boolean;
  duplicate: boolean;
  dispatchable: boolean;
  taskId: string;
  issueNumber: number | null;
  templateId: string;
  instanceKey: string;
  reason: string;
  dryRun: boolean;
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

function parseArguments(
  argv: string[],
): CliOptions {
  let mode: CliOptions["mode"] | undefined;
  let responseFile =
    process.env.RESPONSE_FILE ?? "";
  let dryRun = false;
  let force = false;
  let templateId: string | undefined;
  let instanceKey: string | undefined;
  let contentType: string | undefined;
  let topic: string | undefined;
  let periodKey: string | undefined;
  let timezone: string | undefined;

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const argument = argv[index];

    switch (argument) {
      case "--mode": {
        const value = requireValue(
          argv,
          index,
          argument,
        );

        if (
          value !== "sync" &&
          value !== "instantiate"
        ) {
          fail(
            "mode는 sync 또는 instantiate여야 합니다.",
          );
        }

        mode = value;
        index += 1;
        break;
      }

      case "--response-file": {
        responseFile = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--template-id": {
        templateId = requireValue(
          argv,
          index,
          argument,
        ).toUpperCase();

        index += 1;
        break;
      }

      case "--instance-key": {
        instanceKey = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--content-type": {
        contentType = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--topic": {
        topic = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--period-key": {
        periodKey = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--timezone": {
        timezone = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--dry-run": {
        dryRun = true;
        break;
      }

      case "--force": {
        force = true;
        break;
      }

      default: {
        fail(
          `지원하지 않는 옵션입니다: ${argument}`,
        );
      }
    }
  }

  if (!mode) {
    fail("--mode가 필요합니다.");
  }

  if (responseFile.trim() === "") {
    fail("--response-file이 필요합니다.");
  }

  if (mode === "instantiate") {
    if (
      !templateId ||
      !TASK_ID_PATTERN.test(templateId)
    ) {
      fail(
        "instantiate 모드에는 TASK-000 형식의 --template-id가 필요합니다.",
      );
    }

    if (!instanceKey?.trim()) {
      fail(
        "instantiate 모드에는 --instance-key가 필요합니다.",
      );
    }

    if (!contentType?.trim()) {
      fail(
        "instantiate 모드에는 --content-type이 필요합니다.",
      );
    }

    if (!topic?.trim()) {
      fail(
        "instantiate 모드에는 --topic이 필요합니다.",
      );
    }

    if (!periodKey?.trim()) {
      fail(
        "instantiate 모드에는 --period-key가 필요합니다.",
      );
    }

    if (!timezone?.trim()) {
      fail(
        "instantiate 모드에는 --timezone이 필요합니다.",
      );
    }
  }

  return {
    mode,
    responseFile,
    dryRun,
    force,
    templateId,
    instanceKey,
    contentType,
    topic,
    periodKey,
    timezone,
  };
}

async function readTaskIndex(): Promise<TaskIndex> {
  const parsed =
    (await loadTaskManifest(
      TASK_INDEX_PATH,
    )) as unknown as TaskIndex;

  if (!Array.isArray(parsed.tasks)) {
    fail(
      `${TASK_INDEX_PATH}에 tasks 배열이 없습니다.`,
    );
  }

  return parsed;
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

  const titleMatch = issue.title.match(
    /\b(TASK-[0-9]{3,})\b/i,
  );

  return titleMatch
    ? titleMatch[1].toUpperCase()
    : null;
}

function getInstanceKey(
  issue: GitHubIssue,
): string | null {
  const body = issue.body ?? "";

  const match = body.match(
    /<!--\s*juleswhile:instance-key:([A-Za-z0-9._-]+)\s*-->/,
  );

  return match
    ? match[1]
    : null;
}

function stateLabel(
  status: string,
): string {
  switch (status) {
    case "DRAFT":
      return "state:draft";

    case "READY":
      return "state:ready";

    case "QUEUED":
      return "state:queued";

    case "DISPATCHING":
      return "state:dispatching";

    case "RUNNING":
      return "state:running";

    case "PR_OPENED":
      return "state:pr-opened";

    case "VALIDATING":
      return "state:validating";

    case "CORRECTING":
      return "state:correcting";

    case "MERGE_READY":
      return "state:merge-ready";

    case "MERGED":
      return "state:merged";

    case "DEPLOYING":
      return "state:deploying";

    case "COMPLETED":
      return "state:completed";

    case "FAILED":
      return "state:failed";

    case "TIMEOUT":
      return "state:timeout";

    case "RETRY_WAIT":
      return "state:retry-wait";

    case "BLOCKED":
      return "state:blocked";

    case "CANCELLED":
      return "state:cancelled";

    default:
      return "state:draft";
  }
}

function riskLabel(
  riskLevel: string,
): string {
  return `risk:${riskLevel}`;
}

function approvalLabel(
  approvalPolicy: string,
): string {
  return `approval:${approvalPolicy}`;
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

async function ensureBaseLabels(
  repository: string,
): Promise<void> {
  const labels = [
    [
      "juleswhile:task",
      "0052CC",
      "Juleswhile executable TASK",
    ],
    [
      "juleswhile:managed",
      "0052CC",
      "Managed by Juleswhile workflows",
    ],
    [
      "task:scheduled-content",
      "1D76DB",
      "Recurring scheduled content TASK",
    ],
    [
      "state:draft",
      "D4C5F9",
      "TASK definition is not executable yet",
    ],
    [
      "state:ready",
      "0E8A16",
      "TASK can be selected for execution",
    ],
    [
      "state:blocked",
      "D73A4A",
      "TASK requires intervention",
    ],
    [
      "risk:low",
      "C2E0C6",
      "Low-risk TASK",
    ],
    [
      "risk:medium",
      "FBCA04",
      "Medium-risk TASK",
    ],
    [
      "risk:high",
      "D93F0B",
      "High-risk TASK",
    ],
    [
      "risk:critical",
      "B60205",
      "Critical-risk TASK",
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

function taskHash(
  task: TaskContract,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(task),
    )
    .digest("hex");
}

function buildTaskIssueBody(
  task: TaskContract,
): string {
  const contractYaml =
    stringifyYaml(task, {
      indent: 2,
      lineWidth: 100,
    }).trim();

  return [
    MANAGED_MARKER,
    `<!-- juleswhile:task-id:${task.id} -->`,
    `<!-- juleswhile:task-hash:${taskHash(task)} -->`,
    "",
    `# ${task.id} · ${task.title}`,
    "",
    "## TASK 정보",
    "",
    `- Role: \`${task.role}\``,
    `- Type: \`${task.type}\``,
    `- Status: \`${task.status}\``,
    `- Priority: \`${task.priority}\``,
    `- Risk: \`${task.risk_level}\``,
    `- Approval: \`${task.approval_policy}\``,
    "",
    "## 목표",
    "",
    task.objective,
    "",
    "## 완료 조건",
    "",
    ...task.acceptance_criteria.map(
      (criterion) =>
        `- [ ] ${criterion}`,
    ),
    "",
    "## TASK Contract",
    "",
    "```yaml",
    contractYaml,
    "```",
    "",
    "이 Issue는 `ops/tasks/task-index.yaml`에서 자동 실체화됐습니다.",
    "구조화된 TASK 계약의 최종 기준은 `main`의 Manifest입니다.",
  ].join("\n");
}

function desiredLabels(
  task: TaskContract,
): string[] {
  return [
    "juleswhile:task",
    "juleswhile:managed",
    stateLabel(task.status),
    riskLabel(task.risk_level),
    approvalLabel(
      task.approval_policy,
    ),
    `role:${task.role}`,
    `type:${task.type}`,
  ];
}

async function syncIssues(
  repository: string,
  taskIndex: TaskIndex,
  issues: GitHubIssue[],
  options: CliOptions,
): Promise<SyncResult> {
  const issueByNumber =
    new Map<number, GitHubIssue>(
      issues.map(
        (issue) => [
          issue.number,
          issue,
        ],
      ),
    );

  const issueMap =
    new Map<string, GitHubIssue>();

  for (const issue of issues) {
    const taskId =
      getTaskId(issue);

    if (
      taskId &&
      !issueMap.has(taskId)
    ) {
      issueMap.set(taskId, issue);
    }
  }

  const result: SyncResult = {
    mode: "sync",
    created: 0,
    updated: 0,
    existing: 0,
    skipped: 0,
    dryRun: options.dryRun,
    issues: [],
    completedAt:
      new Date().toISOString(),
  };

  for (const task of taskIndex.tasks) {
    if (task.kind !== "task") {
      continue;
    }

    const linkedIssueNumber =
      task.metadata.issue_number;

    let existing: GitHubIssue | undefined;

    if (
      linkedIssueNumber !== null &&
      linkedIssueNumber !== undefined
    ) {
      existing =
        issueByNumber.get(
          linkedIssueNumber,
        );

      if (!existing) {
        fail(
          `${task.id}의 metadata.issue_number #${linkedIssueNumber}를 GitHub Issues에서 찾을 수 없습니다.`,
        );
      }

      const linkedTaskId =
        getTaskId(existing);

      if (linkedTaskId !== task.id) {
        fail(
          `${task.id}의 metadata.issue_number #${linkedIssueNumber}가 ` +
            `다른 TASK를 가리킵니다: ${linkedTaskId ?? "unknown"}`,
        );
      }
    } else {
      existing =
        issueMap.get(task.id);
    }

    const body =
      buildTaskIssueBody(task);

    const labels =
      desiredLabels(task);

    if (!existing) {
      if (!options.dryRun) {
        const created =
          await githubRequest<GitHubIssue>(
            repository,
            "/issues",
            {
              method: "POST",
              body: JSON.stringify({
                title:
                  `[TASK] ${task.id} · ${task.title}`,
                body,
                labels,
              }),
            },
          );

        result.issues.push({
          taskId: task.id,
          issueNumber:
            created.number,
          action: "create",
          reason:
            "No managed Issue existed for this TASK.",
        });
      } else {
        result.issues.push({
          taskId: task.id,
          issueNumber: null,
          action: "create",
          reason:
            "Dry run: a managed TASK Issue would be created.",
        });
      }

      result.created += 1;
      continue;
    }

    if (
      !(existing.body ?? "").includes(
        MANAGED_MARKER,
      )
    ) {
      result.skipped += 1;

      result.issues.push({
        taskId: task.id,
        issueNumber:
          existing.number,
        action: "skip",
        reason:
          "An Issue exists but is not marked as Juleswhile-managed.",
      });

      continue;
    }

    const expectedHash =
      taskHash(task);

    const currentHash =
      (existing.body ?? "").match(
        /<!--\s*juleswhile:task-hash:([0-9a-f]{64})\s*-->/,
      )?.[1] ?? "";

    const currentLabels =
      getLabels(existing);

    const missingLabel =
      labels.some(
        (label) =>
          !currentLabels.has(label),
      );

    if (
      currentHash === expectedHash &&
      !missingLabel
    ) {
      result.existing += 1;

      result.issues.push({
        taskId: task.id,
        issueNumber:
          existing.number,
        action: "existing",
        reason:
          "Managed Issue already matches the TASK contract.",
      });

      continue;
    }

    if (!options.dryRun) {
      const preservedLabels =
        [...currentLabels].filter(
          (label) =>
            !label.startsWith("state:") &&
            !label.startsWith("risk:") &&
            !label.startsWith("role:") &&
            !label.startsWith("type:") &&
            !label.startsWith("approval:"),
        );

      await githubRequest(
        repository,
        `/issues/${existing.number}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title:
              `[TASK] ${task.id} · ${task.title}`,
            body,
            labels: Array.from(
              new Set([
                ...preservedLabels,
                ...labels,
              ]),
            ),
          }),
        },
      );
    }

    result.updated += 1;

    result.issues.push({
      taskId: task.id,
      issueNumber:
        existing.number,
      action: "update",
      reason:
        options.dryRun
          ? "Dry run: the managed Issue would be synchronized."
          : "The managed Issue was synchronized with the TASK contract.",
    });
  }

  return result;
}

function nextTaskId(
  taskIndex: TaskIndex,
  issues: GitHubIssue[],
): string {
  const numbers: number[] = [];

  for (const task of taskIndex.tasks) {
    numbers.push(
      Number(
        task.id.replace(
          "TASK-",
          "",
        ),
      ),
    );
  }

  for (const issue of issues) {
    const taskId =
      getTaskId(issue);

    if (taskId) {
      numbers.push(
        Number(
          taskId.replace(
            "TASK-",
            "",
          ),
        ),
      );
    }
  }

  const nextNumber =
    Math.max(
      999,
      ...numbers,
    ) + 1;

  return `TASK-${String(
    nextNumber,
  ).padStart(3, "0")}`;
}

function replacePlaceholders(
  value: unknown,
  replacements: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    let output = value;

    for (const [
      key,
      replacement,
    ] of Object.entries(replacements)) {
      output = output.replaceAll(
        `{{${key}}}`,
        replacement,
      );
    }

    return output;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        replacePlaceholders(
          item,
          replacements,
        ),
    );
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, item]) => [
          key,
          replacePlaceholders(
            item,
            replacements,
          ),
        ],
      ),
    );
  }

  return value;
}

function buildInstanceProposalBody(
  task: TaskContract,
  templateId: string,
  instanceKey: string,
): string {
  const contractYaml =
    stringifyYaml(task, {
      indent: 2,
      lineWidth: 100,
    }).trim();

  return [
    MANAGED_MARKER,
    `<!-- juleswhile:task-id:${task.id} -->`,
    `<!-- juleswhile:template-id:${templateId} -->`,
    `<!-- juleswhile:instance-key:${instanceKey} -->`,
    "",
    `# ${task.id} · ${task.title}`,
    "",
    "## 반복 TASK 실체화 제안",
    "",
    `- Template: \`${templateId}\``,
    `- Instance key: \`${instanceKey}\``,
    "- Status: `DRAFT`",
    "",
    "이 Issue는 정기 콘텐츠 Template에서 생성된 TASK 제안입니다.",
    "",
    "안전한 실행을 위해 다음 절차가 필요합니다.",
    "",
    "1. Planner가 이 계약을 검토합니다.",
    "2. `ops/tasks/task-index.yaml`에 TASK를 추가하는 PR을 생성합니다.",
    "3. Schema와 TASK Graph 검증을 통과합니다.",
    "4. PR이 `main`에 병합됩니다.",
    "5. Issue가 `state:ready`로 전환된 후 Jules에 전달됩니다.",
    "",
    "## 제안 TASK Contract",
    "",
    "```yaml",
    contractYaml,
    "```",
  ].join("\n");
}

async function instantiateTask(
  repository: string,
  taskIndex: TaskIndex,
  issues: GitHubIssue[],
  options: CliOptions,
): Promise<InstantiateResult> {
  const templateId =
    options.templateId as string;

  const instanceKey =
    options.instanceKey as string;

  const template =
    taskIndex.tasks.find(
      (task) =>
        task.id === templateId,
    );

  if (!template) {
    fail(
      `${templateId} Template을 찾을 수 없습니다.`,
    );
  }

  if (
    template.kind !== "template" ||
    template.status !== "TEMPLATE"
  ) {
    fail(
      `${templateId}는 반복 TASK Template이 아닙니다.`,
    );
  }

  const duplicateIssue =
    issues.find(
      (issue) =>
        getInstanceKey(issue) ===
        instanceKey,
    );

  if (
    duplicateIssue &&
    !options.force
  ) {
    return {
      mode: "instantiate",
      created: false,
      duplicate: true,
      dispatchable: false,
      taskId:
        getTaskId(duplicateIssue) ??
        "",
      issueNumber:
        duplicateIssue.number,
      templateId,
      instanceKey,
      reason:
        "An Issue already exists for this recurring instance key.",
      dryRun: options.dryRun,
      completedAt:
        new Date().toISOString(),
    };
  }

  const taskId =
    nextTaskId(
      taskIndex,
      issues,
    );

  const now =
    new Date().toISOString();

  const replacements = {
    topic:
      options.topic as string,
    period_key:
      options.periodKey as string,
    content_type:
      options.contentType as string,
    timezone:
      options.timezone as string,
    task_id:
      taskId,
  };

  const instance =
    replacePlaceholders(
      template,
      replacements,
    ) as TaskContract;

  instance.kind = "task";
  instance.id = taskId;
  instance.status = "DRAFT";
  instance.enabled = false;
  instance.title =
    `${options.contentType}: ${options.periodKey}`;

  instance.metadata = {
    ...instance.metadata,
    issue_number: null,
    created_at: now,
    updated_at: now,
    created_by:
      "github-actions",
    template_id:
      templateId,
    instance_key:
      instanceKey,
    tags: Array.from(
      new Set([
        ...(instance.metadata.tags ?? []),
        "scheduled-instance",
      ]),
    ),
  };

  if (options.dryRun) {
    return {
      mode: "instantiate",
      created: true,
      duplicate: false,
      dispatchable: false,
      taskId,
      issueNumber: null,
      templateId,
      instanceKey,
      reason:
        "Dry run: a DRAFT recurring TASK proposal Issue would be created. It must be added to the TASK manifest through a Pull Request before dispatch.",
      dryRun: true,
      completedAt: now,
    };
  }

  const createdIssue =
    await githubRequest<GitHubIssue>(
      repository,
      "/issues",
      {
        method: "POST",
        body: JSON.stringify({
          title:
            `[TASK] ${taskId} · ${instance.title}`,
          body:
            buildInstanceProposalBody(
              instance,
              templateId,
              instanceKey,
            ),
          labels: [
            "juleswhile:task",
            "juleswhile:managed",
            "task:scheduled-content",
            "state:draft",
            riskLabel(
              instance.risk_level,
            ),
            approvalLabel(
              instance.approval_policy,
            ),
          ],
        }),
      },
    );

  return {
    mode: "instantiate",
    created: true,
    duplicate: false,
    dispatchable: false,
    taskId,
    issueNumber:
      createdIssue.number,
    templateId,
    instanceKey,
    reason:
      "A DRAFT recurring TASK proposal Issue was created. The TASK is not dispatchable until a Planner Pull Request adds it to task-index.yaml and changes its status to READY.",
    dryRun: false,
    completedAt: now,
  };
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

  const [
    taskIndex,
    issues,
  ] = await Promise.all([
    readTaskIndex(),
    listIssues(repository),
  ]);

  if (!options.dryRun) {
    await ensureBaseLabels(
      repository,
    );
  }

  const result =
    options.mode === "sync"
      ? await syncIssues(
          repository,
          taskIndex,
          issues,
          options,
        )
      : await instantiateTask(
          repository,
          taskIndex,
          issues,
          options,
        );

  await writeJsonAtomic(
    options.responseFile,
    result,
  );

  console.log(
    options.mode === "sync"
      ? "TASK Issue 동기화를 완료했습니다."
      : "반복 TASK 제안 처리를 완료했습니다.",
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `TASK Issue 실체화 실패: ${message}`,
  );

  process.exitCode = 1;
});
