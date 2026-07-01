import type {
	CliOptions,
	GitHubIssue,
	InstantiateResult,
	TaskContract,
	TaskIndex,
} from "../domain/task-materialization/task-materialization-contract.js";

import { fail } from "../domain/task-materialization/task-materialization-error.js";

import { buildInstanceProposalBody } from "../domain/task-materialization/task-issue-body-builder.js";

import {
	approvalLabel,
	getInstanceKey,
	getTaskId,
	riskLabel,
} from "../domain/task-materialization/task-issue-identity-policy.js";

import {
	nextTaskId,
	replacePlaceholders,
} from "../domain/task-materialization/task-instance-policy.js";

import { githubRequest } from "../infrastructure/github/task-materialization-github-adapter.js";

export async function instantiateTask(
	repository: string,
	taskIndex: TaskIndex,
	issues: GitHubIssue[],
	options: CliOptions,
): Promise<InstantiateResult> {
	const templateId = options.templateId as string;

	const instanceKey = options.instanceKey as string;

	const template = taskIndex.tasks.find((task) => task.id === templateId);

	if (!template) {
		fail(`${templateId} Template을 찾을 수 없습니다.`);
	}

	if (template.kind !== "template" || template.status !== "TEMPLATE") {
		fail(`${templateId}는 반복 TASK Template이 아닙니다.`);
	}

	const duplicateIssue = issues.find(
		(issue) => getInstanceKey(issue) === instanceKey,
	);

	if (duplicateIssue && !options.force) {
		return {
			mode: "instantiate",
			created: false,
			duplicate: true,
			dispatchable: false,
			taskId: getTaskId(duplicateIssue) ?? "",
			issueNumber: duplicateIssue.number,
			templateId,
			instanceKey,
			reason: "An Issue already exists for this recurring instance key.",
			dryRun: options.dryRun,
			completedAt: new Date().toISOString(),
		};
	}

	const taskId = nextTaskId(taskIndex, issues);

	const now = new Date().toISOString();

	const replacements = {
		topic: options.topic as string,
		period_key: options.periodKey as string,
		content_type: options.contentType as string,
		timezone: options.timezone as string,
		task_id: taskId,
	};

	const instance = replacePlaceholders(template, replacements) as TaskContract;

	instance.kind = "task";
	instance.id = taskId;
	instance.status = "DRAFT";
	instance.enabled = false;
	instance.title = `${options.contentType}: ${options.periodKey}`;

	instance.metadata = {
		...instance.metadata,
		issue_number: null,
		created_at: now,
		updated_at: now,
		created_by: "github-actions",
		template_id: templateId,
		instance_key: instanceKey,
		tags: Array.from(
			new Set([...(instance.metadata.tags ?? []), "scheduled-instance"]),
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

	const createdIssue = await githubRequest<GitHubIssue>(repository, "/issues", {
		method: "POST",
		body: JSON.stringify({
			title: `[TASK] ${taskId} · ${instance.title}`,
			body: buildInstanceProposalBody(instance, templateId, instanceKey),
			labels: [
				"juleswhile:task",
				"juleswhile:managed",
				"task:scheduled-content",
				"state:draft",
				riskLabel(instance.risk_level),
				approvalLabel(instance.approval_policy),
			],
		}),
	});

	return {
		mode: "instantiate",
		created: true,
		duplicate: false,
		dispatchable: false,
		taskId,
		issueNumber: createdIssue.number,
		templateId,
		instanceKey,
		reason:
			"A DRAFT recurring TASK proposal Issue was created. The TASK is not dispatchable until a Planner Pull Request adds it to task-index.yaml and changes its status to READY.",
		dryRun: false,
		completedAt: now,
	};
}
