#!/usr/bin/env node

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { parse, stringify } from "yaml";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const projectId = required("PROJECT_ID");
const projectName = required("PROJECT_NAME");
const repository = required("REPOSITORY");

if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(projectId)) {
  throw new Error("PROJECT_ID must be 3-64 lowercase letters, numbers, or hyphens");
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error("REPOSITORY must use owner/repository format");
}

const [owner, repo] = repository.split("/");
const now = new Date().toISOString();

const taskPath = "ops/tasks/task-index.yaml";
const taskIndex = parse(readFileSync(taskPath, "utf8"));
const templates = (taskIndex.tasks ?? [])
  .filter((task) => task.kind === "template")
  .map((task) => ({
    ...task,
    status: "TEMPLATE",
    enabled: false,
    metadata: {
      ...(task.metadata ?? {}),
      goal_issue_number: null,
      issue_number: null,
      updated_at: now,
    },
  }));

taskIndex.project_id = projectId;
taskIndex.generated_at = now;
taskIndex.updated_at = now;
taskIndex.tasks = templates;
writeFileSync(taskPath, stringify(taskIndex, { lineWidth: 100 }), "utf8");

const statePath = "ops/state/project-state.json";
const state = JSON.parse(readFileSync(statePath, "utf8"));
state.projectId = projectId;
state.status = "bootstrap";
state.phase = "bootstrap";
state.primaryBranch = "main";
state.repository = {
  fullName: repository,
  htmlUrl: `https://github.com/${owner}/${repo}`,
  julesSourceName: null,
};
state.projectGoal = null;
state.automation = {
  enabled: false,
  contentEnabled: false,
  netlifyStatusEnabled: false,
  mode: "guarded",
  pausedReason: "Bootstrap incomplete. Run 00 · Control Plane Preflight before activation.",
};
state.taskSummary = {
  total: 0,
  draft: 0,
  ready: 0,
  queued: 0,
  dispatching: 0,
  running: 0,
  prOpened: 0,
  validating: 0,
  correcting: 0,
  mergeReady: 0,
  merged: 0,
  deploying: 0,
  completed: 0,
  failed: 0,
  timeout: 0,
  retryWait: 0,
  blocked: 0,
  cancelled: 0,
  templates: templates.length,
};
state.runtime = {
  activeSessions: [],
  activePullRequests: [],
  resourceLocks: [],
  lastReconciledAt: null,
};
state.quotas.date = null;
state.quotas.maxConcurrent = 1;
state.quotas.used = { newTasks: 0, corrections: 0, maintenance: 0, total: 0 };
state.lastEvent = null;
state.createdAt = now;
state.updatedAt = now;
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

const packagePath = "package.json";
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
packageJson.name = projectId;
packageJson.description = `${projectName} powered by Juleswhile`;
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

for (const file of [
  "docs/01_overview/juleswhile-smoke-test.md",
  "docs/01_overview/juleswhile-smoke-test-result.md",
  "docs/07_operations/live-jules-pilot-2026-06-29.md",
]) {
  rmSync(file, { force: true });
}
rmSync("dist", { recursive: true, force: true });

console.log(JSON.stringify({ projectId, projectName, repository, templates: templates.length }, null, 2));
