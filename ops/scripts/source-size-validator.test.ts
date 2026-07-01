import assert from "node:assert/strict";
import test from "node:test";

import {
	validateSourceSize,
} from "./source-size-validator.js";
import {
	withSourceSizeFixture,
} from "./source-size-test-fixture.js";

test(
	"accepts a managed file at 500 lines",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				await fixture.writeManagedFile(
					"ops/scripts/small.ts",
					500,
				);
				await fixture.writeBaseline();

				const report =
					await fixture.validate();

				assert.deepEqual(
					report.errors,
					[],
				);
				assert.equal(
					report.summary.oversizedFiles,
					0,
				);
			},
		);
	},
);

test(
	"rejects a new oversized file without an exception",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				await fixture.writeManagedFile(
					"ops/scripts/new-large.ts",
					501,
				);
				await fixture.writeBaseline();

				const report =
					await fixture.validate();

				assert.equal(
					report.errors.some((error) =>
						error.message.includes(
							"without an exception",
						),
					),
					true,
				);
			},
		);
	},
);

test(
	"accepts an unchanged ratchet exception",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				const filePath =
					"ops/scripts/legacy.ts";

				await fixture.writeManagedFile(
					filePath,
					550,
				);
				await fixture.writeBaseline([
					{
						path: filePath,
						max_lines: 550,
					},
				]);

				const report =
					await fixture.validate({
						[filePath]: 550,
					});

				assert.deepEqual(
					report.errors,
					[],
				);
				assert.equal(
					report.summary.ratchetedFiles,
					1,
				);
			},
		);
	},
);

test(
	"accepts a reduced exception that remains oversized",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				const filePath =
					"ops/scripts/legacy.ts";

				await fixture.writeManagedFile(
					filePath,
					525,
				);
				await fixture.writeBaseline([
					{
						path: filePath,
						max_lines: 550,
					},
				]);

				const report =
					await fixture.validate({
						[filePath]: 550,
					});

				assert.deepEqual(
					report.errors,
					[],
				);
			},
		);
	},
);

test(
	"rejects growth beyond the ratchet maximum",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				const filePath =
					"ops/scripts/legacy.ts";

				await fixture.writeManagedFile(
					filePath,
					551,
				);
				await fixture.writeBaseline([
					{
						path: filePath,
						max_lines: 550,
					},
				]);

				const report =
					await fixture.validate({
						[filePath]: 550,
					});

				assert.equal(
					report.errors.some((error) =>
						error.message.includes(
							"exceeds ratchet maximum",
						),
					),
					true,
				);
			},
		);
	},
);

test(
	"requires exception removal at 500 lines",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				const filePath =
					"ops/scripts/legacy.ts";

				await fixture.writeManagedFile(
					filePath,
					500,
				);
				await fixture.writeBaseline([
					{
						path: filePath,
						max_lines: 550,
					},
				]);

				const report =
					await fixture.validate({
						[filePath]: 550,
					});

				assert.equal(
					report.errors.some((error) =>
						error.message.includes(
							"must be removed",
						),
					),
					true,
				);
			},
		);
	},
);

test(
	"committed Juleswhile Source Size Baseline passes",
	async () => {
		const report =
			await validateSourceSize();

		assert.deepEqual(
			report.errors,
			[],
		);
		assert.equal(
			report.summary.lineLimit,
			500,
		);
		assert.equal(
			report.summary.exceptions,
			report.summary.oversizedFiles,
		);
		assert.equal(
			report.summary.ratchetedFiles,
			report.summary.exceptions,
		);
	},
);
