import {
  loadTaskManifest,
} from "../scripts/task-manifest.js";

import {
  fail,
  getRepository,
  parseArguments,
} from "./select-next-task-cli.js";

import {
  EXECUTABLE_STATUSES,
  TASK_INDEX_PATH,
  type Candidate,
  type GitHubComment,
  type SelectionResult,
  type TaskIndex,
} from "../domain/task-selection/task-selection-contract.js";

import {
  buildIssueMap,
  isActiveIssue,
  isBlockedIssue,
  isCompleted,
  isReadyIssue,
} from "../domain/task-selection/task-selection-issue-policy.js";

import {
  buildRuntimeQuotaUsage,
  formatUtcDate,
  hasQuota,
} from "../domain/task-selection/task-selection-quota-policy.js";

import {
  compareCandidates,
  sharesResourceLock,
} from "../domain/task-selection/task-selection-resource-policy.js";

import {
  listComments,
  listIssues,
  reserveCandidate,
} from "../infrastructure/github/task-selection-github-adapter.js";

import {
  writeJsonAtomic,
} from "../infrastructure/filesystem/json-output.js";

export async function readTaskIndex(): Promise<TaskIndex> {
  const taskIndex =
    (await loadTaskManifest(
      TASK_INDEX_PATH,
    )) as unknown as Partial<TaskIndex>;

  if (!Array.isArray(taskIndex.tasks)) {
    fail(
      `${TASK_INDEX_PATH}에 tasks 배열이 없습니다.`,
    );
  }

  return taskIndex as TaskIndex;
}

export async function runSelectNextTask(argv: string[]): Promise<void> {
  const options =
    parseArguments(argv);

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

  candidates.sort(compareCandidates);

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
