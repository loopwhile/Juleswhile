import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = ".github/workflows/10-runtime-projection-sync.yml";

async function workflow(): Promise<string> {
	return readFile(WORKFLOW, "utf8");
}

test("Runtime Projection Workflow has event and schedule recovery triggers", async () => {
	const content = await workflow();

	assert.match(content, /repository_dispatch:/);

	assert.match(content, /deployment_completed/);

	assert.match(content, /reconcile_ready/);

	assert.match(content, /issues:/);

	assert.match(content, /pull_request:/);

	assert.match(content, /cron:\s*"\*\/15 \* \* \* \*"/);

	assert.match(content, /workflow_dispatch:/);
});

test("Runtime Projection Workflow prevents recursive Projection runs", async () => {
	const content = await workflow();

	assert.match(
		content,
		/github\.event\.pull_request\.head\.ref == 'automation\/runtime-projection'/,
	);

	assert.match(
		content,
		/github\.event\.client_payload\.task_id == 'MAINTENANCE'/,
	);

	assert.match(content, /group:\s*runtime-projection-sync/);

	assert.match(content, /cancel-in-progress:\s*false/);
});

test("Runtime Projection Workflow permits only static Projection paths", async () => {
	const content = await workflow();

	assert.match(content, /ops\/state\/project-state\.json/);

	assert.match(content, /ops\/tasks\/task-history\.yaml/);

	assert.match(content, /Runtime Projection changed a forbidden path/);
});

test("Runtime Projection Workflow maintains at most one PR", async () => {
	const content = await workflow();

	assert.match(content, /gh pr list/);

	assert.match(content, /PR_COUNT="\$\{#OPEN_PRS\[@\]\}"/);

	assert.match(content, /Multiple Runtime Projection PRs are open/);

	assert.match(content, /juleswhile:runtime-projection-pr/);

	assert.match(content, /--force-with-lease/);
});

test("Runtime Projection Workflow validates exact head before Auto Merge", async () => {
	const content = await workflow();

	assert.match(content, /npm run ci/);

	assert.match(content, /juleswhile:validation-evidence/);

	assert.match(content, /head_sha: \$\{HEAD_SHA\}/);

	assert.match(content, /result: passed/);

	assert.match(content, /event_type "pr_validation_passed"/);

	assert.match(content, /task_id "MAINTENANCE"/);
});

test("Runtime Projection Workflow never pushes directly to main", async () => {
	const content = await workflow();

	assert.match(content, /HEAD:refs\/heads\/\$\{PROJECTION_BRANCH\}/);

	assert.doesNotMatch(content, /git push[^\n]*HEAD:refs\/heads\/main/);

	assert.doesNotMatch(content, /git push[^\n]*origin main/);
});

test("Runtime Projection Workflow does not persist checkout credentials", async () => {
	const content = await workflow();

	assert.match(content, /persist-credentials:\s*false/);

	assert.doesNotMatch(content, /persist-credentials:\s*true/);

	assert.match(content, /gh auth setup-git/);
});

test("Runtime Projection Workflow avoids deprecated gh pr edit GraphQL path", async () => {
	const content = await workflow();

	assert.doesNotMatch(content, /gh pr edit/);

	assert.match(content, /repos\/\$\{REPOSITORY\}\/pulls\/\$\{PR_NUMBER\}/);

	assert.match(content, /--method PATCH/);
});
