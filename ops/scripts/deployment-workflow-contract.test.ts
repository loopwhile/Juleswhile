import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function workflow(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("Auto Merge transitions TASK to deploying", async () => {
  const content = await workflow(
    ".github/workflows/04-auto-merge.yml",
  );

  assert(content.includes("Mark linked TASK Issue as deploying"));
  assert(content.includes("--mode deploying"));
  assert(!content.includes("- name: Complete linked TASK Issue"));
});

test("PR Validation publishes managed exact-head evidence", async () => {
  const content = await workflow(
    ".github/workflows/03-pr-validation.yml",
  );

  assert(
    content.includes('--arg managed "juleswhile:managed"'),
  );
  assert(
    content.includes("'{labels:[$managed,$result]}'"),
  );
  assert(
    content.includes(
      "<!-- juleswhile:validation-evidence -->",
    ),
  );
  assert(content.includes('echo "head_sha: ${HEAD_SHA}"'));
  assert(
    content.includes('echo "result: ${EVIDENCE_RESULT}"'),
  );
});

test("Auto Merge parses fenced validation evidence", async () => {
  const content = await workflow(
    ".github/workflows/04-auto-merge.yml",
  );

  assert(content.includes("fence=0"));
  assert(content.includes("if (fence == 0) {"));
  assert(content.includes("fence=1"));
  assert(
    content.includes(
      'if (sha != "" && result == "passed") {',
    ),
  );
});

test("Next TASK recognizes deployment_completed", async () => {
  const content = await workflow(
    ".github/workflows/05-next-task.yml",
  );

  assert(content.includes("- deployment_completed"));
  assert(content.includes("Skip TASK pr_merged before deployment"));
});

test("Netlify ready performs completed transition", async () => {
  const content = await workflow(
    ".github/workflows/08-netlify-status.yml",
  );

  assert(content.includes("--mode completed"));
  assert(content.includes('event_type: "deployment_completed"'));
});

test("Netlify failure performs deployment review transition", async () => {
  const content = await workflow(
    ".github/workflows/08-netlify-status.yml",
  );

  assert(content.includes("--mode failed"));
  assert(content.includes("--mode verification-disabled"));
});
test("Netlify workflow can dispatch deployment_completed", async () => {
  const content = await workflow(
    ".github/workflows/08-netlify-status.yml",
  );

  assert.match(
    content,
    /permissions:\s*\n\s+contents:\s+write\s*\n\s+issues:\s+write/,
  );
});
