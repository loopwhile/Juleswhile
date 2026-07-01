import assert from "node:assert/strict";
import test from "node:test";

import {
	withSourceSizeFixture,
} from "./source-size-test-fixture.js";

test(
	"rejects a stale exception for a deleted file",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				const filePath =
					"ops/scripts/deleted.ts";

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
							"does not exist",
						),
					),
					true,
				);
			},
		);
	},
);

test(
	"rejects an exception absent from the baseline SHA",
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
					await fixture.validate();

				assert.equal(
					report.errors.some((error) =>
						error.message.includes(
							"did not exist at baseline_sha",
						),
					),
					true,
				);
			},
		);
	},
);

test(
	"rejects an increased exception maximum",
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
						max_lines: 551,
					},
				]);

				const report =
					await fixture.validate({
						[filePath]: 550,
					});

				assert.equal(
					report.errors.some((error) =>
						error.message.includes(
							"does not match baseline count",
						),
					),
					true,
				);
			},
		);
	},
);

test(
	"rejects duplicate exception paths",
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
					{
						path: filePath,
						max_lines: 550,
					},
				]);

				await assert.rejects(
					fixture.validate({
						[filePath]: 550,
					}),
					/duplicate exception paths/u,
				);
			},
		);
	},
);

test(
	"rejects exception paths that are not sorted",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				const firstPath =
					"ops/scripts/a.ts";
				const secondPath =
					"ops/scripts/z.ts";

				await fixture.writeManagedFile(
					firstPath,
					550,
				);
				await fixture.writeManagedFile(
					secondPath,
					550,
				);
				await fixture.writeBaseline([
					{
						path: secondPath,
						max_lines: 550,
					},
					{
						path: firstPath,
						max_lines: 550,
					},
				]);

				await assert.rejects(
					fixture.validate({
						[firstPath]: 550,
						[secondPath]: 550,
					}),
					/must be path-sorted/u,
				);
			},
		);
	},
);

test(
	"rejects unsafe repository paths",
	async () => {
		await withSourceSizeFixture(
			async (fixture) => {
				await fixture.writeBaseline([
					{
						path: "../outside.ts",
						max_lines: 550,
					},
				]);

				await assert.rejects(
					fixture.validate(),
					/unsafe exception path/u,
				);
			},
		);
	},
);
