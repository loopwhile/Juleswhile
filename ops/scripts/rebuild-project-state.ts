#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import addFormatsImport from "ajv-formats";
import Ajv2020Import from "ajv/dist/2020.js";

import { JulesApiClient, JulesApiError } from "./jules-api.js";
import { loadTaskManifestWithSources } from "./task-manifest.js";
import {
	renderTaskRuntimePatches,
	writeFilesAtomically,
} from "./runtime-projection-repository.js";
import { buildTaskRuntimePatches } from "./task-runtime-synchronizer.js";

const Ajv2020 = ("default" in Ajv2020Import
	? Ajv2020Import.default
	: Ajv2020Import) as unknown as typeof import("ajv/dist/2020.js").default;

const addFormats = ("default" in addFormatsImport
	? addFormatsImport.default
	: addFormatsImport) as unknown as typeof import("ajv-formats").default;

import {
	type GitHubCommentEvidence,
	type GitHubIssueEvidence,
	type GitHubPullRequestEvidence,
	type ProjectionInput,
	type SessionObservation,
	type TaskIndex,
	activeSessionNamesFromEvidence,
	projectRuntimeState,
} from "./project-state-projection.js";

const DEFAULT_TASK_INDEX = "ops/tasks/task-index.yaml";

const DEFAULT_PROJECT_STATE = "ops/state/project-state.json";

const PROJECT_GOAL_SCHEMA = "ops/schemas/project-goal.schema.json";

const PROJECT_STATE_SCHEMA = "ops/schemas/project-state.schema.json";

const TASK_DISPATCH_MARKER = "<!-- juleswhile:task-dispatch -->";

const GITHUB_API_BASE_URL =
	process.env.GITHUB_API_URL ?? "https://api.github.com";

interface CliOptions {
	responseFile: string;
	taskIndexPath: string;
	projectStatePath: string;
	dryRun: boolean;
	apply: boolean;
}

function fail(message: string): never {
	throw new Error(message);
}

function requireValue(argv: string[], index: number, flag: string): string {
	const value = argv[index + 1];

	if (value === undefined || value.startsWith("--")) {
		fail(`${flag} 옵션에 값이 필요합니다.`);
	}

	return value;
}

function parseArguments(argv: string[]): CliOptions {
	let responseFile = process.env.RESPONSE_FILE ?? "";

	let taskIndexPath = DEFAULT_TASK_INDEX;

	let projectStatePath = DEFAULT_PROJECT_STATE;

	let dryRun = false;
	let apply = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		switch (argument) {
			case "--response-file": {
				responseFile = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--task-index": {
				taskIndexPath = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--project-state": {
				projectStatePath = requireValue(argv, index, argument);

				index += 1;
				break;
			}

			case "--dry-run": {
				dryRun = true;
				break;
			}

			case "--apply": {
				apply = true;
				break;
			}

			default: {
				fail(`지원하지 않는 옵션입니다: ${argument}`);
			}
		}
	}

	if (responseFile.trim() === "") {
		fail("--response-file이 필요합니다.");
	}

	if (dryRun === apply) {
		fail("--dry-run 또는 --apply 중 하나만 지정해야 합니다.");
	}

	return {
		responseFile,
		taskIndexPath,
		projectStatePath,
		dryRun,
		apply,
	};
}

function getRepository(): string {
	const repository =
		process.env.REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? "";

	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
		fail(
			"REPOSITORY 또는 GITHUB_REPOSITORY가 owner/repository 형식이어야 합니다.",
		);
	}

	return repository;
}

function getToken(): string {
	const token = process.env.GH_TOKEN;

	if (!token) {
		fail("GH_TOKEN이 필요합니다.");
	}

	return token;
}

async function githubRequest<T>(repository: string, route: string): Promise<T> {
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

async function paginate<T>(repository: string, route: string): Promise<T[]> {
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

async function listIssues(repository: string): Promise<GitHubIssueEvidence[]> {
	const issues = await paginate<GitHubIssueEvidence>(
		repository,
		"/issues?state=all",
	);

	return issues.filter((issue) => issue.pull_request === undefined);
}

async function listComments(
	repository: string,
	issueNumber: number,
): Promise<GitHubCommentEvidence[]> {
	return paginate<GitHubCommentEvidence>(
		repository,
		`/issues/${issueNumber}/comments`,
	);
}

async function listOpenPullRequests(
	repository: string,
): Promise<GitHubPullRequestEvidence[]> {
	return paginate<GitHubPullRequestEvidence>(repository, "/pulls?state=open");
}

function canonicalIssueNumbers(taskIndex: TaskIndex): number[] {
	return [
		...new Set(
			taskIndex.tasks
				.filter((task) => task.kind === "task")
				.map((task) => task.metadata?.issue_number)
				.filter((value): value is number => Number.isInteger(value)),
		),
	].sort((left, right) => left - right);
}

async function observeSessions(
	names: string[],
	apply: boolean,
): Promise<{
	sessionsByName: Record<string, SessionObservation>;
	errors: Array<{
		sessionName: string;
		kind: string;
		message: string;
	}>;
}> {
	const sessionsByName: Record<string, SessionObservation> = {};

	const errors: Array<{
		sessionName: string;
		kind: string;
		message: string;
	}> = [];

	if (names.length === 0) {
		return {
			sessionsByName,
			errors,
		};
	}

	const apiKey = process.env.JULES_API_KEY ?? "";

	if (apiKey.trim() === "") {
		const message =
			"활성 Session 증거가 있지만 JULES_API_KEY가 없어 Jules 상태를 검증할 수 없습니다.";

		if (apply) {
			fail(message);
		}

		for (const sessionName of names) {
			errors.push({
				sessionName,
				kind: "auth",
				message,
			});
		}

		return {
			sessionsByName,
			errors,
		};
	}

	const client = new JulesApiClient();

	for (const sessionName of names) {
		try {
			const session = await client.getSession(sessionName);

			sessionsByName[sessionName] = {
				name: session.name,
				id: session.id,
				url: session.url,
				state: session.state,
				createTime: session.createTime,
				updateTime: session.updateTime,
			};
		} catch (error) {
			const kind = error instanceof JulesApiError ? error.kind : "unknown";

			const message = error instanceof Error ? error.message : String(error);

			errors.push({
				sessionName,
				kind,
				message,
			});
		}
	}

	if (apply && errors.length > 0) {
		fail("Jules Session 조회 오류가 있어 마지막 유효 Projection을 보존합니다.");
	}

	return {
		sessionsByName,
		errors,
	};
}

async function validateProjectState(value: unknown): Promise<void> {
	const [goalSchema, stateSchema] = await Promise.all([
		fs.readFile(PROJECT_GOAL_SCHEMA, "utf8"),
		fs.readFile(PROJECT_STATE_SCHEMA, "utf8"),
	]);

	const parsedGoalSchema = JSON.parse(goalSchema) as object;

	const parsedStateSchema = JSON.parse(stateSchema) as {
		$id?: string;
	};

	const ajv = new Ajv2020({
		allErrors: true,
		strict: false,
		allowUnionTypes: true,
	});

	addFormats(ajv);

	ajv.addSchema(parsedGoalSchema);
	ajv.addSchema(parsedStateSchema);

	if (
		typeof parsedStateSchema.$id !== "string" ||
		parsedStateSchema.$id.trim() === ""
	) {
		fail(`${PROJECT_STATE_SCHEMA}에 유효한 $id가 없습니다.`);
	}

	const valid = ajv.validate(parsedStateSchema.$id, value);

	if (!valid) {
		fail(
			`생성된 project-state가 Schema를 통과하지 못했습니다: ${ajv.errorsText(
				ajv.errors,
				{
					separator: "\n",
				},
			)}`,
		);
	}
}

async function writeJsonAtomic(
	filePath: string,
	value: unknown,
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), {
		recursive: true,
	});

	const temporary = `${filePath}.${process.pid}.tmp`;

	await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");

	await fs.rename(temporary, filePath);
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));

	const repository = getRepository();

	const loadedTaskManifest = await loadTaskManifestWithSources(
		options.taskIndexPath,
	);

	const taskIndex = loadedTaskManifest.manifest as unknown as TaskIndex;

	const currentState = JSON.parse(
		await fs.readFile(options.projectStatePath, "utf8"),
	) as Record<string, unknown>;

	const issues = await listIssues(repository);

	const issueNumbers = canonicalIssueNumbers(taskIndex);

	const commentEntries = await Promise.all(
		issueNumbers.map(
			async (issueNumber) =>
				[issueNumber, await listComments(repository, issueNumber)] as const,
		),
	);

	const commentsByIssue = Object.fromEntries(commentEntries) as Record<
		number,
		GitHubCommentEvidence[]
	>;

	const pullRequests = await listOpenPullRequests(repository);

	const sessionNames = activeSessionNamesFromEvidence(
		taskIndex,
		issues,
		commentsByIssue,
	);

	const sessionObservation = await observeSessions(sessionNames, options.apply);

	const input: ProjectionInput = {
		repository,
		taskIndex,
		currentState,
		issues,
		commentsByIssue,
		pullRequests,
		sessionsByName: sessionObservation.sessionsByName,
		runUrl: process.env.WORKFLOW_RUN_URL ?? null,
		syncReason:
		  process.env.PROJECTION_SYNC_REASON ??
		  process.env.GITHUB_EVENT_NAME ??
		  "runtime-projection-sync",
		sessionLookupErrors:
		  sessionObservation.errors.length,
	};

	const projection = projectRuntimeState(input);

	await validateProjectState(projection.projectState);

	const taskRuntimePatches = buildTaskRuntimePatches(taskIndex, issues);

	const taskManifestMutations = await renderTaskRuntimePatches(
		loadedTaskManifest,
		taskRuntimePatches,
	);

	const overallChanged = projection.changed || taskRuntimePatches.length > 0;

	const projectionMutations = [...taskManifestMutations];

	if (overallChanged) {
		projectionMutations.push({
			filePath: options.projectStatePath,
			content: `${JSON.stringify(projection.projectState, null, 2)}\n`,
		});
	}

	if (options.apply && projectionMutations.length > 0) {
		await writeFilesAtomically(projectionMutations);
	}

	const response = {
		dryRun: options.dryRun,
		apply: options.apply,
		changed: overallChanged,
		projectStateChanged: projection.changed,
		taskManifestChanged: taskRuntimePatches.length > 0,
		taskRuntimePatches,
		mutations: projectionMutations.map((mutation) =>
			path.relative(process.cwd(), mutation.filePath),
		),
		observedAt: projection.observedAt,
		taskSummary: projection.projectState.taskSummary,
		runtime: projection.projectState.runtime,
		quotas: projection.projectState.quotas,
		drift: projection.drift,
		sessionLookupErrors: sessionObservation.errors,
		files: {
			projectState: options.projectStatePath,
			taskIndex: options.taskIndexPath,
		},
	};

	await writeJsonAtomic(options.responseFile, response);

	console.log(
		`Runtime State Projection 완료: changed=${overallChanged}, taskPatches=${taskRuntimePatches.length}`,
	);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);

	console.error(`Runtime State Projection 실패: ${message}`);

	process.exitCode = 1;
});
