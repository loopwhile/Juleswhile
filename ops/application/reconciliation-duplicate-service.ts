import type {
	CliOptions,
	GitHubIssue,
	ReconcileResult,
} from "../domain/reconciliation/reconciliation-contract.js";

import { getTaskId } from "./reconciliation-evidence.js";

import {
	comment,
	createIncident,
	replaceStateLabels,
} from "../infrastructure/github/reconciler-github-adapter.js";

export function groupTaskIssues(
	taskIssues: GitHubIssue[],
): Map<string, GitHubIssue[]> {
	const groups = new Map<string, GitHubIssue[]>();

	for (const issue of taskIssues) {
		const taskId = getTaskId(issue) as string;

		const group = groups.get(taskId) ?? [];

		group.push(issue);

		groups.set(taskId, group);
	}

	return groups;
}

export async function reconcileDuplicateTaskIssues(
	repository: string,
	groups: Map<string, GitHubIssue[]>,
	options: CliOptions,
	result: ReconcileResult,
): Promise<void> {
	for (const [taskId, group] of groups) {
		if (group.length <= 1) {
			continue;
		}

		const ordered = [...group].sort(
			(left, right) => left.number - right.number,
		);

		const canonical = ordered[0];

		for (const duplicate of ordered.slice(1)) {
			if (duplicate.state !== "open") {
				continue;
			}

			result.summary.incidents += 1;
			result.summary.blocked += 1;

			result.actions.push({
				issueNumber: duplicate.number,
				taskId,
				action: "block-duplicate",
				reason: `Duplicate TASK Issue. Canonical Issue is #${canonical.number}.`,
				applied: options.apply,
			});

			await replaceStateLabels(repository, duplicate, "state:blocked", options);

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
				`- Duplicate Issues: ${ordered
					.slice(1)
					.map((issue) => `#${issue.number}`)
					.join(", ")}`,
				"",
				"Dispatcher idempotency와 Issue materialization 상태를 확인하십시오.",
			].join("\n"),
			options,
		);
	}
}
