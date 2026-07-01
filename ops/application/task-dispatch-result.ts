import type {
	CliOptions,
	DispatchResult,
	ExistingSession,
	TaskContract,
} from "../domain/task-dispatch/task-dispatch-contract.js";

export function createResult(
	options: CliOptions,
	task: TaskContract,
	sourceName: string,
	roleFile: string,
	promptFile: string,
	session: ExistingSession,
	overrides: Partial<
		Pick<
			DispatchResult,
			"dispatched" | "dryRun" | "duplicate" | "reusedExistingSession" | "reason"
		>
	>,
): DispatchResult {
	return {
		taskId: task.id,
		issueNumber: options.issueNumber ?? task.metadata.issue_number ?? null,
		dispatched: overrides.dispatched ?? false,
		dryRun: overrides.dryRun ?? options.dryRun,
		duplicate: overrides.duplicate ?? false,
		reusedExistingSession: overrides.reusedExistingSession ?? false,
		reason: overrides.reason ?? "",
		session,
		request: {
			title: `[${task.id}] ${task.title}`,
			source: sourceName,
			startingBranch: "main",
			automationMode: "AUTO_CREATE_PR",
			requirePlanApproval: false,
		},
		validation: {
			taskStatus: task.status,
			role: task.role,
			taskType: task.type,
			riskLevel: task.risk_level,
			approvalPolicy: task.approval_policy,
			roleFile,
			promptFile,
		},
		createdAt: new Date().toISOString(),
	};
}
