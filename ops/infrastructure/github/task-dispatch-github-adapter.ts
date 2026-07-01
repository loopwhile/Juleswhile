import process from "node:process";

import type {
	GitHubComment,
	GitHubIssue,
} from "../../domain/task-dispatch/task-dispatch-contract.js";

import { fail } from "../../domain/task-dispatch/task-dispatch-error.js";

const GITHUB_API_BASE_URL =
	process.env.GITHUB_API_URL ?? "https://api.github.com";

export async function githubRequest<T>(
	repository: string,
	route: string,
	options: RequestInit = {},
): Promise<T> {
	const token = process.env.GH_TOKEN;

	if (!token) {
		fail("GitHub 상태 확인에 필요한 GH_TOKEN이 없습니다.");
	}

	const response = await fetch(
		`${GITHUB_API_BASE_URL}/repos/${repository}${route}`,
		{
			...options,
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": `Juleswhile/${repository}`,
				...(options.headers ?? {}),
			},
		},
	);

	const body = await response.text();

	if (!response.ok) {
		let message = body;

		try {
			const parsed = JSON.parse(body) as {
				message?: unknown;
			};

			if (typeof parsed.message === "string") {
				message = parsed.message;
			}
		} catch {
			// Preserve the non-JSON response body.
		}

		fail(`GitHub API 요청 실패 HTTP ${response.status}: ${message}`);
	}

	if (body.trim() === "") {
		return undefined as T;
	}

	try {
		return JSON.parse(body) as T;
	} catch (error) {
		throw new Error("GitHub API 응답을 JSON으로 해석할 수 없습니다.", {
			cause: error,
		});
	}
}

export async function getTrackingIssue(
	repository: string,
	issueNumber: number,
): Promise<GitHubIssue> {
	const issue = await githubRequest<GitHubIssue>(
		repository,
		`/issues/${issueNumber}`,
	);

	if (issue.pull_request !== undefined) {
		fail(`#${issueNumber}는 TASK Issue가 아니라 Pull Request입니다.`);
	}

	if (issue.state !== "open") {
		fail(`TASK Issue #${issueNumber}가 열려 있지 않습니다.`);
	}

	return issue;
}

export async function getIssueComments(
	repository: string,
	issueNumber: number,
): Promise<GitHubComment[]> {
	const comments: GitHubComment[] = [];

	for (let page = 1; page <= 100; page += 1) {
		const batch = await githubRequest<GitHubComment[]>(
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

export async function comment(
	repository: string,
	issueNumber: number,
	body: string,
): Promise<void> {
	await githubRequest(repository, `/issues/${issueNumber}/comments`, {
		method: "POST",
		body: JSON.stringify({
			body,
		}),
	});
}
