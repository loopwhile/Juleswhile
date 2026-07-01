import { promises as fs } from "node:fs";

import path from "node:path";

import process from "node:process";

import addFormatsImport from "ajv-formats";

import Ajv2020Import from "ajv/dist/2020.js";

import { JulesApiClient, JulesApiError } from "../scripts/jules-api.js";

import { loadTaskManifestWithSources } from "../scripts/task-manifest.js";

import {
	renderTaskRuntimePatches,
	writeFilesAtomically,
} from "../scripts/runtime-projection-repository.js";

import { buildTaskRuntimePatches } from "../scripts/task-runtime-synchronizer.js";

import {
	type GitHubCommentEvidence,
	type ProjectionInput,
	type SessionObservation,
	type TaskIndex,
	activeSessionNamesFromEvidence,
	projectRuntimeState,
} from "../scripts/project-state-projection.js";

import {
	fail,
	getRepository,
	parseArguments,
} from "./runtime-projection-cli.js";

import {
	listComments,
	listIssues,
	listOpenPullRequests,
} from "../infrastructure/github/runtime-projection-github-adapter.js";

const Ajv2020 = ("default" in Ajv2020Import
	? Ajv2020Import.default
	: Ajv2020Import) as unknown as typeof import("ajv/dist/2020.js").default;

const addFormats = ("default" in addFormatsImport
	? addFormatsImport.default
	: addFormatsImport) as unknown as typeof import("ajv-formats").default;

const PROJECT_GOAL_SCHEMA = "ops/schemas/project-goal.schema.json";

const PROJECT_STATE_SCHEMA = "ops/schemas/project-state.schema.json";

export function canonicalIssueNumbers(taskIndex: TaskIndex): number[] {
	return [
		...new Set(
			taskIndex.tasks
				.filter((task) => task.kind === "task")
				.map((task) => task.metadata?.issue_number)
				.filter((value): value is number => Number.isInteger(value)),
		),
	].sort((left, right) => left - right);
}

export async function observeSessions(
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

export async function validateProjectState(value: unknown): Promise<void> {
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

export async function runRuntimeProjection(argv: string[]): Promise<void> {
	const options = parseArguments(argv);

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
		sessionLookupErrors: sessionObservation.errors.length,
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
