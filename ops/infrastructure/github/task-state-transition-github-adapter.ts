import type {
	GitHubComment,
	TransitionDependencies,
} from "../../domain/task-state-transition/task-state-transition-contract.js";

import { fail } from "../../domain/task-state-transition/task-state-transition-error.js";

export async function githubRequest<T>(
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

	return text.trim() === "" ? (undefined as T) : (JSON.parse(text) as T);
}

export async function listComments(
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
