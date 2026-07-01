#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse, stringify } from "yaml";

const TEMPLATE_REPOSITORY = "loopwhile/Juleswhile";
const TASK_INDEX_PATH = "ops/tasks/task-index.yaml";
const TASK_TEMPLATE_PATH = "ops/tasks/task-templates.yaml";
const TASK_HISTORY_PATH = "ops/tasks/task-history.yaml";
const TASK_HISTORY_DIRECTORY = "ops/tasks/history";
const PROJECT_STATE_PATH = "ops/state/project-state.json";
const PACKAGE_PATH = "package.json";
const PACKAGE_LOCK_PATH = "package-lock.json";
const DOCS_PATH = "docs";
const DIST_PATH = "dist";

function fail(message) {
	throw new Error(message);
}

function required(name) {
	const value = process.env[name]?.trim();

	if (!value) {
		fail(`${name} is required`);
	}

	return value;
}

function parseMode(argv) {
	if (argv.includes("--help")) {
		console.log(
			[
				"Usage:",
				"  node ops/scripts/bootstrap-project.mjs --dry-run",
				"  node ops/scripts/bootstrap-project.mjs --apply",
			].join("\n"),
		);
		process.exit(0);
	}

	const dryRun = argv.includes("--dry-run");
	const apply = argv.includes("--apply");

	if (dryRun === apply) {
		fail("Exactly one of --dry-run or --apply is required");
	}

	const unknown = argv.filter(
		(argument) => argument !== "--dry-run" && argument !== "--apply",
	);

	if (unknown.length > 0) {
		fail(`Unknown Bootstrap argument: ${unknown.join(", ")}`);
	}

	return {
		dryRun,
		apply,
		mode: apply ? "apply" : "dry-run",
	};
}

function validateProjectId(projectId) {
	if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(projectId)) {
		fail(
			"PROJECT_ID must be 3-64 lowercase letters, numbers, or hyphens",
		);
	}
}

function validateRepository(repository) {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
		fail("REPOSITORY must use owner/repository format");
	}
}

function assertRepositoryShape() {
	const requiredPaths = [
		"AGENTS.md",
		"PROJECT_GOAL.md",
		"QUICKSTART.md",
		TASK_INDEX_PATH,
		PROJECT_STATE_PATH,
		PACKAGE_PATH,
		PACKAGE_LOCK_PATH,
	];

	for (const requiredPath of requiredPaths) {
		if (!existsSync(requiredPath)) {
			fail(`Required Juleswhile Template path is missing: ${requiredPath}`);
		}
	}
}

function normalizedRemoteRepository(remoteUrl) {
	const normalized = remoteUrl.trim().replace(/\.git$/u, "");
	const match = normalized.match(
		/github\.com[/:]([^/:\s]+)\/([^/\s]+)$/u,
	);

	if (!match) {
		return null;
	}

	return `${match[1]}/${match[2]}`;
}

function originRepository() {
	const result = spawnSync(
		"git",
		["remote", "get-url", "origin"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		},
	);

	if (result.status !== 0) {
		return null;
	}

	return normalizedRemoteRepository(result.stdout);
}

function assertSafeApplyTarget(repository) {
	const origin = originRepository();

	if (!origin) {
		return;
	}

	if (origin.toLowerCase() === TEMPLATE_REPOSITORY.toLowerCase()) {
		fail(
			"Bootstrap --apply is prohibited in the Juleswhile Template source repository",
		);
	}

	if (origin.toLowerCase() !== repository.toLowerCase()) {
		fail(
			`REPOSITORY does not match origin: expected=${origin}, received=${repository}`,
		);
	}
}

function normalizeInclude(includePath) {
	const normalized = includePath.replaceAll("\\", "/");

	if (
		normalized.startsWith("/") ||
		normalized.startsWith("../") ||
		normalized.includes("/../") ||
		normalized === ".." ||
		normalized.trim() === ""
	) {
		fail(`Unsafe TASK include path: ${includePath}`);
	}

	return normalized;
}

function collectTasks(filePath, seen = new Set()) {
	const absolutePath = path.resolve(filePath);

	if (seen.has(absolutePath)) {
		fail(`Cyclic TASK include detected: ${filePath}`);
	}

	if (!existsSync(absolutePath)) {
		if (path.basename(absolutePath) === "task-history.yaml") {
			return [];
		}

		fail(`Included TASK Manifest does not exist: ${filePath}`);
	}

	seen.add(absolutePath);

	const manifest = parse(readFileSync(absolutePath, "utf8"));
	const ownTasks = Array.isArray(manifest?.tasks) ? manifest.tasks : [];
	const includes = Array.isArray(manifest?.includes)
		? manifest.includes
		: [];

	const includedTasks = includes.flatMap((includePath) =>
		collectTasks(
			path.join(
				path.dirname(absolutePath),
				normalizeInclude(includePath),
			),
			seen,
		),
	);

	seen.delete(absolutePath);

	return [...ownTasks, ...includedTasks];
}

function validTimestamp(value) {
	if (
		typeof value !== "string" ||
		!Number.isFinite(Date.parse(value))
	) {
		return null;
	}

	return new Date(value).toISOString();
}

function stableBootstrapTimestamp(state, projectId, repository) {
	const explicit = process.env.BOOTSTRAP_TIMESTAMP?.trim();

	if (explicit) {
		const parsed = validTimestamp(explicit);

		if (!parsed) {
			fail("BOOTSTRAP_TIMESTAMP must be an ISO-8601 timestamp");
		}

		return parsed;
	}

	if (
		state.projectId === projectId &&
		state.status === "bootstrap" &&
		state.repository?.fullName === repository
	) {
		const existing = validTimestamp(state.createdAt);

		if (existing) {
			return existing;
		}
	}

	return new Date().toISOString();
}

function yamlContent(value) {
	return stringify(value, {
		lineWidth: 100,
	});
}

function jsonContent(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function currentContent(filePath) {
	if (!existsSync(filePath)) {
		return null;
	}

	return readFileSync(filePath, "utf8");
}

function directoryHasEntries(directory) {
	return (
		existsSync(directory) &&
		readdirSync(directory).length > 0
	);
}

function writeAtomic(filePath, content) {
	mkdirSync(path.dirname(filePath), {
		recursive: true,
	});

	const temporary = `${filePath}.${process.pid}.tmp`;

	writeFileSync(temporary, content, "utf8");
	renameSync(temporary, filePath);
}

function bootstrapDigest(projectId, repository, templates) {
	const evidence = {
		projectId,
		repository,
		runtimeTasks: [],
		templates: templates
			.map((task) => task.id)
			.sort(),
	};

	return `sha256:${createHash("sha256")
		.update(JSON.stringify(evidence))
		.digest("hex")}`;
}

function main() {
	const options = parseMode(process.argv.slice(2));
	const projectId = required("PROJECT_ID");
	const projectName = required("PROJECT_NAME");
	const repository = required("REPOSITORY");

	validateProjectId(projectId);
	validateRepository(repository);
	assertRepositoryShape();

	if (options.apply) {
		assertSafeApplyTarget(repository);
	}

	const [owner, repositoryName] = repository.split("/");
	const sourceTaskIndex = parse(
		readFileSync(TASK_INDEX_PATH, "utf8"),
	);
	const sourceState = JSON.parse(
		readFileSync(PROJECT_STATE_PATH, "utf8"),
	);
	const sourcePackage = JSON.parse(
		readFileSync(PACKAGE_PATH, "utf8"),
	);
	const sourcePackageLock = JSON.parse(
		readFileSync(PACKAGE_LOCK_PATH, "utf8"),
	);

	const timestamp = stableBootstrapTimestamp(
		sourceState,
		projectId,
		repository,
	);

	const templates = collectTasks(TASK_INDEX_PATH)
		.filter((task) => task.kind === "template")
		.map((task) => ({
			...task,
			status: "TEMPLATE",
			enabled: false,
			metadata: {
				...(task.metadata ?? {}),
				goal_issue_number: null,
				issue_number: null,
				updated_at: timestamp,
			},
		}))
		.sort((left, right) => left.id.localeCompare(right.id));

	const taskIndex = structuredClone(sourceTaskIndex);

	taskIndex.project_id = projectId;
	taskIndex.generated_at = timestamp;
	taskIndex.updated_at = timestamp;
	taskIndex.includes = [
		"task-templates.yaml",
		"task-history.yaml",
	];
	taskIndex.tasks = [];

	const taskTemplates = {
		tasks: templates,
	};

	const taskHistory = {
		tasks: [],
	};

	const state = structuredClone(sourceState);

	state.projectId = projectId;
	state.status = "bootstrap";
	state.phase = "bootstrap";
	state.primaryBranch = "main";
	state.repository = {
		fullName: repository,
		htmlUrl: `https://github.com/${owner}/${repositoryName}`,
		julesSourceName: null,
	};
	state.projectGoal = null;
	state.automation = {
		enabled: false,
		contentEnabled: false,
		netlifyStatusEnabled: false,
		mode: "guarded",
		pausedReason:
			"Bootstrap incomplete. Run 00 · Control Plane Preflight before activation.",
	};
	state.taskSummary = {
		total: 0,
		draft: 0,
		ready: 0,
		queued: 0,
		dispatching: 0,
		running: 0,
		prOpened: 0,
		validating: 0,
		correcting: 0,
		mergeReady: 0,
		merged: 0,
		deploying: 0,
		completed: 0,
		failed: 0,
		timeout: 0,
		retryWait: 0,
		blocked: 0,
		cancelled: 0,
		templates: templates.length,
	};
	state.runtime = {
		activeSessions: [],
		activePullRequests: [],
		resourceLocks: [],
		lastReconciledAt: null,
	};
	state.quotas = {
		...state.quotas,
		date: null,
		maxConcurrent: 1,
		used: {
			newTasks: 0,
			corrections: 0,
			maintenance: 0,
			total: 0,
		},
	};
	state.lastEvent = null;
	state.createdAt = timestamp;
	state.updatedAt = timestamp;
	state.projection = {
		status: "stale",
		observedAt: timestamp,
		generatedAt: timestamp,
		evidenceDigest: bootstrapDigest(
			projectId,
			repository,
			templates,
		),
		source: "github-runtime-evidence",
		workflowRunUrl: null,
		syncReason: "bootstrap",
		drift: {
			stateLabelConflicts: 0,
			missingCanonicalIssues: 0,
			supersededIssues: 0,
			manifestMismatches: 0,
			issueLifecycleMismatches: 0,
			sessionLookupErrors: 0,
		},
	};

	const packageJson = structuredClone(sourcePackage);

	packageJson.name = projectId;
	packageJson.description = `${projectName} powered by Juleswhile`;

	const packageLock = structuredClone(sourcePackageLock);

	packageLock.name = projectId;

	if (
		packageLock.packages &&
		typeof packageLock.packages === "object" &&
		packageLock.packages[""] &&
		typeof packageLock.packages[""] === "object"
	) {
		packageLock.packages[""].name = projectId;
	}

	const desiredFiles = new Map([
		[TASK_INDEX_PATH, yamlContent(taskIndex)],
		[TASK_TEMPLATE_PATH, yamlContent(taskTemplates)],
		[TASK_HISTORY_PATH, yamlContent(taskHistory)],
		[PROJECT_STATE_PATH, jsonContent(state)],
		[PACKAGE_PATH, jsonContent(packageJson)],
		[PACKAGE_LOCK_PATH, jsonContent(packageLock)],
	]);

	const writes = [...desiredFiles]
		.filter(
			([filePath, content]) =>
				currentContent(filePath) !== content,
		)
		.map(([filePath]) => filePath);

	const removals = [
		TASK_HISTORY_DIRECTORY,
		DIST_PATH,
	].filter((target) => existsSync(target));

	if (directoryHasEntries(DOCS_PATH)) {
		removals.push(DOCS_PATH);
	}

	const directories = [];

	if (!existsSync(DOCS_PATH)) {
		directories.push(DOCS_PATH);
	}

	const changed =
		writes.length > 0 ||
		removals.length > 0 ||
		directories.length > 0;

	const result = {
		mode: options.mode,
		changed,
		projectId,
		projectName,
		repository,
		templates: templates.length,
		writes,
		removals,
		directories,
		runtime: {
			projectGoal: null,
			tasks: 0,
			completedTasks: 0,
			activeSessions: 0,
			activePullRequests: 0,
			resourceLocks: 0,
			quotaUsage: 0,
			projectionStatus: "stale",
		},
	};

	if (options.dryRun) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	for (const [filePath, content] of desiredFiles) {
		if (currentContent(filePath) !== content) {
			writeAtomic(filePath, content);
		}
	}

	rmSync(TASK_HISTORY_DIRECTORY, {
		recursive: true,
		force: true,
	});
	rmSync(DIST_PATH, {
		recursive: true,
		force: true,
	});

	if (directoryHasEntries(DOCS_PATH)) {
		rmSync(DOCS_PATH, {
			recursive: true,
			force: true,
		});
	}

	mkdirSync(DOCS_PATH, {
		recursive: true,
	});

	console.log(JSON.stringify(result, null, 2));
}

try {
	main();
} catch (error) {
	const message =
		error instanceof Error
			? error.message
			: String(error);

	console.error(`ERROR: ${message}`);
	process.exitCode = 1;
}
