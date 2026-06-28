import assert from "node:assert/strict";
import test from "node:test";

import { inspectDiff } from "./verify-repository-integrity.js";

const sensitiveNames = {
	julesApiKey: "JULES_API_KEY",
	netlifyAuthToken: "NETLIFY_AUTH_TOKEN",
};

function diffFor(lines: string[]): string {
	return [
		"diff --git a/example b/example",
		"--- a/example",
		"+++ b/example",
		"@@ -1,0 +1,1 @@",
		...lines.map((line) => `+${line}`),
	].join("\n");
}

test("repository integrity allows safe secret references and documentation", () => {
	const violations = inspectDiff(
		diffFor([
			`${sensitiveNames.julesApiKey}: \${{ secrets.JULES_API_KEY }}`,
			`${sensitiveNames.netlifyAuthToken}: \${{ secrets.NETLIFY_AUTH_TOKEN }}`,
			"const key = process.env.JULES_API_KEY;",
			"const token = process.env.NETLIFY_AUTH_TOKEN;",
			"curl --header \"Authorization: Bearer ${NETLIFY_AUTH_TOKEN}\"",
			"if [[ -z \"${JULES_API_KEY:-}\" ]]; then",
			"Documentation mentions JULES_API_KEY and NETLIFY_AUTH_TOKEN.",
			`${sensitiveNames.julesApiKey}: placeholder-value-that-is-long-enough`,
			`${sensitiveNames.netlifyAuthToken}=dummy-token-value-that-is-long-enough`,
		]),
	);

	assert.deepEqual(violations, []);
});

test("repository integrity blocks private key bodies", () => {
	const violations = inspectDiff(
		diffFor([
			`-----BEGIN ${"RSA"} PRIVATE KEY-----`,
			`-----BEGIN ${"EC"} PRIVATE KEY-----`,
			`-----BEGIN ${"OPENSSH"} PRIVATE KEY-----`,
		]),
	);

	assert.equal(violations.length, 3);
	assert(
		violations.every((violation) => violation.kind === "private-key"),
	);
});

test("repository integrity blocks long literal sensitive assignments", () => {
	const violations = inspectDiff(
		diffFor([
			`${sensitiveNames.julesApiKey}: "jules_live_abcdefghijklmnopqrstuvwxyz123456"`,
			`${sensitiveNames.netlifyAuthToken}=netlify_live_abcdefghijklmnopqrstuvwxyz123456`,
			`process.env.${sensitiveNames.julesApiKey} = "jules_live_abcdefghijklmnopqrstuvwxyz123456";`,
			`const ${sensitiveNames.netlifyAuthToken} = "netlify_live_abcdefghijklmnopqrstuvwxyz123456";`,
			`${"GENERIC"}_API_KEY=generic_live_abcdefghijklmnopqrstuvwxyz123456`,
		]),
	);

	assert.equal(violations.length, 5);
	assert(
		violations.every((violation) => violation.kind === "hardcoded-secret"),
	);
});
