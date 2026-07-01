import process from "node:process";

import type {
	GitHubIssue,
	TransitionDependencies,
	TransitionOptions,
	TransitionResult,
} from "../domain/task-state-transition/task-state-transition-contract.js";

import {
	buildComment,
	buildTransitionLabels,
	buildTransitionMarker,
	labelNames,
} from "../domain/task-state-transition/task-state-transition-policy.js";

import { getRepository, getToken } from "./task-state-transition-cli.js";

import {
	githubRequest,
	listComments,
} from "../infrastructure/github/task-state-transition-github-adapter.js";

import { writeJsonAtomic } from "../infrastructure/filesystem/json-output.js";

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

	const labels = buildTransitionLabels(labelNames(issue), options.mode);

	const issueState = options.mode === "completed" ? "closed" : "open";

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

	console.log(`TASK 상태 전이 완료: ${options.taskId} -> ${options.mode}`);

	return result;
}
