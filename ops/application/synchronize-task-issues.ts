import { MANAGED_MARKER } from "../domain/task-materialization/task-materialization-contract.js";

import type {
	CliOptions,
	GitHubIssue,
	SyncResult,
	TaskIndex,
} from "../domain/task-materialization/task-materialization-contract.js";

import { fail } from "../domain/task-materialization/task-materialization-error.js";

import { buildTaskIssueBody } from "../domain/task-materialization/task-issue-body-builder.js";

import {
	desiredLabels,
	getLabels,
	getTaskId,
	taskHash,
} from "../domain/task-materialization/task-issue-identity-policy.js";

import { githubRequest } from "../infrastructure/github/task-materialization-github-adapter.js";

export async function syncIssues(
	repository: string,
	taskIndex: TaskIndex,
	issues: GitHubIssue[],
	options: CliOptions,
): Promise<SyncResult> {
	const issueByNumber = new Map<number, GitHubIssue>(
		issues.map((issue) => [issue.number, issue]),
	);

	const issueMap = new Map<string, GitHubIssue>();

	for (const issue of issues) {
		const taskId = getTaskId(issue);

		if (taskId && !issueMap.has(taskId)) {
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
		completedAt: new Date().toISOString(),
	};

	for (const task of taskIndex.tasks) {
		if (task.kind !== "task") {
			continue;
		}

		const linkedIssueNumber = task.metadata.issue_number;

		let existing: GitHubIssue | undefined;

		if (linkedIssueNumber !== null && linkedIssueNumber !== undefined) {
			existing = issueByNumber.get(linkedIssueNumber);

			if (!existing) {
				fail(
					`${task.id}의 metadata.issue_number #${linkedIssueNumber}를 GitHub Issues에서 찾을 수 없습니다.`,
				);
			}

			const linkedTaskId = getTaskId(existing);

			if (linkedTaskId !== task.id) {
				fail(
					`${task.id}의 metadata.issue_number #${linkedIssueNumber}가 ` +
						`다른 TASK를 가리킵니다: ${linkedTaskId ?? "unknown"}`,
				);
			}
		} else {
			existing = issueMap.get(task.id);
		}

		const body = buildTaskIssueBody(task);

		const labels = desiredLabels(task);

		if (!existing) {
			if (!options.dryRun) {
				const created = await githubRequest<GitHubIssue>(
					repository,
					"/issues",
					{
						method: "POST",
						body: JSON.stringify({
							title: `[TASK] ${task.id} · ${task.title}`,
							body,
							labels,
						}),
					},
				);

				result.issues.push({
					taskId: task.id,
					issueNumber: created.number,
					action: "create",
					reason: "No managed Issue existed for this TASK.",
				});
			} else {
				result.issues.push({
					taskId: task.id,
					issueNumber: null,
					action: "create",
					reason: "Dry run: a managed TASK Issue would be created.",
				});
			}

			result.created += 1;
			continue;
		}

		if (!(existing.body ?? "").includes(MANAGED_MARKER)) {
			result.skipped += 1;

			result.issues.push({
				taskId: task.id,
				issueNumber: existing.number,
				action: "skip",
				reason: "An Issue exists but is not marked as Juleswhile-managed.",
			});

			continue;
		}

		const expectedHash = taskHash(task);

		const currentHash =
			(existing.body ?? "").match(
				/<!--\s*juleswhile:task-hash:([0-9a-f]{64})\s*-->/,
			)?.[1] ?? "";

		const currentLabels = getLabels(existing);

		const missingLabel = labels.some((label) => !currentLabels.has(label));

		if (currentHash === expectedHash && !missingLabel) {
			result.existing += 1;

			result.issues.push({
				taskId: task.id,
				issueNumber: existing.number,
				action: "existing",
				reason: "Managed Issue already matches the TASK contract.",
			});

			continue;
		}

		if (!options.dryRun) {
			const preservedLabels = [...currentLabels].filter(
				(label) =>
					!label.startsWith("state:") &&
					!label.startsWith("risk:") &&
					!label.startsWith("role:") &&
					!label.startsWith("type:") &&
					!label.startsWith("approval:"),
			);

			await githubRequest(repository, `/issues/${existing.number}`, {
				method: "PATCH",
				body: JSON.stringify({
					title: `[TASK] ${task.id} · ${task.title}`,
					body,
					labels: Array.from(new Set([...preservedLabels, ...labels])),
				}),
			});
		}

		result.updated += 1;

		result.issues.push({
			taskId: task.id,
			issueNumber: existing.number,
			action: "update",
			reason: options.dryRun
				? "Dry run: the managed Issue would be synchronized."
				: "The managed Issue was synchronized with the TASK contract.",
		});
	}

	return result;
}
