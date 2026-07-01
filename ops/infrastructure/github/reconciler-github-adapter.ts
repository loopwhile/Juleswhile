import process from "node:process";

import type {
	CliOptions,
	GitHubComment,
	GitHubIssue,
	GitHubPullRequest,
} from "../../domain/reconciliation/reconciliation-contract.js";

import {
	getLabels,
	setLocalLabels,
} from "../../application/reconciliation-evidence.js";

import { fail } from "../../application/reconciliation-cli.js";

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

export async function listComments(
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

async function ensureLabel(
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

export async function replaceStateLabels(
	repository: string,
	issue: GitHubIssue,
	nextState: string,
	options: CliOptions,
): Promise<void> {
	const labels = [...getLabels(issue)];

	const nextLabels = Array.from(
		new Set([
			...labels.filter((label) => !label.startsWith("state:")),
			nextState,
		]),
	);

	setLocalLabels(issue, nextLabels);

	if (options.dryRun) {
		return;
	}

	await githubRequest(repository, `/issues/${issue.number}`, {
		method: "PATCH",
		body: JSON.stringify({
			labels: nextLabels,
		}),
	});
}

export async function comment(
	repository: string,
	issueNumber: number,
	body: string,
	options: CliOptions,
): Promise<void> {
	if (options.dryRun) {
		return;
	}

	await githubRequest(repository, `/issues/${issueNumber}/comments`, {
		method: "POST",
		body: JSON.stringify({
			body,
		}),
	});
}

export async function closeIssue(
	repository: string,
	issue: GitHubIssue,
	options: CliOptions,
): Promise<void> {
	issue.state = "closed";

	if (options.dryRun) {
		return;
	}

	await githubRequest(repository, `/issues/${issue.number}`, {
		method: "PATCH",
		body: JSON.stringify({
			state: "closed",
			state_reason: "completed",
		}),
	});
}

export async function createIncident(
	repository: string,
	title: string,
	body: string,
	options: CliOptions,
): Promise<void> {
	if (options.dryRun) {
		return;
	}

	await githubRequest(repository, "/issues", {
		method: "POST",
		body: JSON.stringify({
			title: `[INCIDENT] ${title}`,
			body,
			labels: ["incident", "state:investigating"],
		}),
	});
}

export async function ensureLabels(
	repository: string,
	options: CliOptions,
): Promise<void> {
	if (options.dryRun) {
		return;
	}

	const labels = [
		["state:ready", "0E8A16", "TASK can be selected"],
		["state:retry-wait", "FBCA04", "TASK is waiting for retry"],
		["state:blocked", "D73A4A", "TASK requires intervention"],
		["state:running", "1D76DB", "TASK has an active Jules Session"],
		["state:pr-opened", "5319E7", "TASK produced a Pull Request"],
		["state:completed", "0E8A16", "TASK is completed"],
		["incident", "B60205", "Operational incident"],
		["state:investigating", "D93F0B", "Incident is under investigation"],
	] as const;

	for (const [name, color, description] of labels) {
		await ensureLabel(repository, name, color, description);
	}
}

export async function getPullRequest(
	repository: string,
	pullRequestNumber: number,
): Promise<GitHubPullRequest> {
	return githubRequest<GitHubPullRequest>(
		repository,
		`/pulls/${pullRequestNumber}`,
	);
}
