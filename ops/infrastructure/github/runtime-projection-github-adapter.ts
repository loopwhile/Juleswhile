import process from "node:process";

import type {
	GitHubCommentEvidence,
	GitHubIssueEvidence,
	GitHubPullRequestEvidence,
} from "../../domain/projection/projection-contract.js";

import { fail } from "../../application/runtime-projection-cli.js";

const GITHUB_API_BASE_URL =
	process.env.GITHUB_API_URL ?? "https://api.github.com";

function getToken(): string {
	const token = process.env.GH_TOKEN;

	if (!token) {
		fail("GH_TOKEN이 필요합니다.");
	}

	return token;
}

export async function githubRequest<T>(
	repository: string,
	route: string,
): Promise<T> {
	const response = await fetch(
		`${GITHUB_API_BASE_URL}/repos/${repository}${route}`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${getToken()}`,
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": `Juleswhile/${repository}`,
			},
		},
	);

	const body = await response.text();

	if (!response.ok) {
		fail(`GitHub API 요청 실패 HTTP ${response.status}: ${body.slice(0, 500)}`);
	}

	return JSON.parse(body) as T;
}

export async function paginate<T>(
	repository: string,
	route: string,
): Promise<T[]> {
	const result: T[] = [];

	for (let page = 1; page <= 100; page += 1) {
		const separator = route.includes("?") ? "&" : "?";

		const batch = await githubRequest<T[]>(
			repository,
			`${route}${separator}per_page=100&page=${page}`,
		);

		result.push(...batch);

		if (batch.length < 100) {
			break;
		}
	}

	return result;
}

export async function listIssues(
	repository: string,
): Promise<GitHubIssueEvidence[]> {
	const issues = await paginate<GitHubIssueEvidence>(
		repository,
		"/issues?state=all",
	);

	return issues.filter((issue) => issue.pull_request === undefined);
}

export async function listComments(
	repository: string,
	issueNumber: number,
): Promise<GitHubCommentEvidence[]> {
	return paginate<GitHubCommentEvidence>(
		repository,
		`/issues/${issueNumber}/comments`,
	);
}

export async function listOpenPullRequests(
	repository: string,
): Promise<GitHubPullRequestEvidence[]> {
	return paginate<GitHubPullRequestEvidence>(repository, "/pulls?state=open");
}
