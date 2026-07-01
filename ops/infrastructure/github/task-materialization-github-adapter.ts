import process from "node:process";

import type { GitHubIssue } from "../../domain/task-materialization/task-materialization-contract.js";

import { fail } from "../../domain/task-materialization/task-materialization-error.js";

const GITHUB_API_BASE_URL =
	process.env.GITHUB_API_URL ?? "https://api.github.com";

export function getToken(): string {
	const token = process.env.GH_TOKEN;

	if (!token) {
		fail("GH_TOKEN이 필요합니다.");
	}

	return token;
}

export async function githubRequest<T>(
	repository: string,
	route: string,
	options: RequestInit = {},
): Promise<T> {
	const response = await fetch(
		`${GITHUB_API_BASE_URL}/repos/${repository}${route}`,
		{
			...options,
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${getToken()}`,
				"Content-Type": "application/json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": `Juleswhile/${repository}`,
				...(options.headers ?? {}),
			},
		},
	);

	const text = await response.text();

	if (!response.ok) {
		let message = text;

		try {
			const parsed = JSON.parse(text) as {
				message?: unknown;
			};

			if (typeof parsed.message === "string") {
				message = parsed.message;
			}
		} catch {
			// Preserve response text.
		}

		fail(`GitHub API 요청 실패 HTTP ${response.status}: ${message}`);
	}

	if (text.trim() === "") {
		return undefined as T;
	}

	return JSON.parse(text) as T;
}

export async function listIssues(repository: string): Promise<GitHubIssue[]> {
	const result: GitHubIssue[] = [];

	for (let page = 1; page <= 100; page += 1) {
		const batch = await githubRequest<GitHubIssue[]>(
			repository,
			`/issues?state=all&per_page=100&page=${page}`,
		);

		result.push(...batch.filter((issue) => issue.pull_request === undefined));

		if (batch.length < 100) {
			break;
		}
	}

	return result;
}

export async function ensureLabel(
	repository: string,
	name: string,
	color: string,
	description: string,
): Promise<void> {
	const encodedName = encodeURIComponent(name);

	try {
		await githubRequest(repository, `/labels/${encodedName}`);
	} catch {
		await githubRequest(repository, "/labels", {
			method: "POST",
			body: JSON.stringify({
				name,
				color,
				description,
			}),
		});
	}
}

export async function ensureBaseLabels(repository: string): Promise<void> {
	const labels = [
		["juleswhile:task", "0052CC", "Juleswhile executable TASK"],
		["juleswhile:managed", "0052CC", "Managed by Juleswhile workflows"],
		["task:scheduled-content", "1D76DB", "Recurring scheduled content TASK"],
		["state:draft", "D4C5F9", "TASK definition is not executable yet"],
		["state:ready", "0E8A16", "TASK can be selected for execution"],
		["state:blocked", "D73A4A", "TASK requires intervention"],
		["risk:low", "C2E0C6", "Low-risk TASK"],
		["risk:medium", "FBCA04", "Medium-risk TASK"],
		["risk:high", "D93F0B", "High-risk TASK"],
		["risk:critical", "B60205", "Critical-risk TASK"],
	] as const;

	for (const [name, color, description] of labels) {
		await ensureLabel(repository, name, color, description);
	}
}
