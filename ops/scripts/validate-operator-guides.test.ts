import assert from "node:assert/strict";
import test from "node:test";

import {
	assertInOrder,
	extractBashBlocks,
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
