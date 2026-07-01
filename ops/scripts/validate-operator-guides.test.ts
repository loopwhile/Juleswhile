import assert from "node:assert/strict";
import test from "node:test";

import {
	assertInOrder,
	extractBashBlocks,
	validateForbiddenPatterns,
	validateOperatorGuides,
} from "./validate-operator-guides.js";

test("extractBashBlocks returns Bash and sh fences only", () => {
	const blocks =
		extractBashBlocks(
			[
				"```bash",
				"echo bash",
				"```",
				"",
				"```text",
				"not shell",
				"```",
				"",
				"```sh",
				"echo sh",
				"```",
			].join("\n"),
		);

	assert.deepEqual(
		blocks,
		[
			"echo bash",
			"echo sh",
		],
	);
});

test("assertInOrder accepts ordered markers", () => {
	assert.doesNotThrow(
		() =>
			assertInOrder(
				"alpha beta gamma",
				[
					"alpha",
					"beta",
					"gamma",
				],
				"ordered",
			),
	);
});

test("assertInOrder rejects missing or reversed markers", () => {
	assert.throws(
		() =>
			assertInOrder(
				"beta alpha",
				[
					"alpha",
					"beta",
				],
				"reversed",
			),
		/out of order|missing/u,
	);
});

test("committed Operator Guides satisfy repository contracts", () => {
	assert.doesNotThrow(
		() =>
			validateOperatorGuides(
				process.cwd(),
			),
	);
});


test("legacy read -rsp secret input is rejected", () => {
	assert.throws(
		() =>
			validateForbiddenPatterns(
				"guide.md",
				'read -rsp "Secret: " SECRET',
			),
		/explicit terminal binding/u,
	);
});

test("terminal-bound secret input is accepted", () => {
	assert.doesNotThrow(
		() =>
			validateForbiddenPatterns(
				"guide.md",
				[
					"printf 'Secret: ' >&2",
					"IFS= read -r -s SECRET </dev/tty",
				].join("\n"),
			),
	);
});
