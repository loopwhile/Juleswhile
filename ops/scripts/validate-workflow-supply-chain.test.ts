import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkflowSupplyChain } from "./validate-workflow-supply-chain.js";

test("workflow supply-chain validation passes for committed workflows", async () => {
	const report = await validateWorkflowSupplyChain();

	assert.deepEqual(report.errors, []);
	assert.equal(report.summary.workflowFiles >= 8, true);
	assert.equal(report.summary.externalUses > 0, true);
	assert.equal(
		report.summary.pinnedExternalUses,
		report.summary.externalUses,
	);
});
