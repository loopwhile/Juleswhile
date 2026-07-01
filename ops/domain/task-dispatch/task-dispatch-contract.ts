export const TASK_INDEX_PATH = "ops/tasks/task-index.yaml";

export const EXECUTE_PROMPT_PATH = "ops/prompts/execute-task.md";

export const VERIFY_PROMPT_PATH = "ops/prompts/verify-task.md";

export const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;

export const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const EXECUTABLE_STATUSES = new Set(["READY", "QUEUED", "RETRY_WAIT"]);

export const EXECUTION_APPROVAL_LABEL = "approval:human-approved";

export const DISPATCH_MARKER = "<!-- juleswhile:task-dispatch -->";

export const QUOTA_LEDGER_MARKER = "<!-- juleswhile:quota-ledger -->";

export const DISPATCH_INTENT_MARKER = "<!-- juleswhile:dispatch-intent -->";

export const DISPATCH_OUTCOME_MARKER = "<!-- juleswhile:dispatch-outcome -->";

export interface CliOptions {
	taskId: string;
	repository: string;
	responseFile: string;
	issueNumber?: number;
	dryRun: boolean;
	force: boolean;
}

export interface RetryPolicy {
	max_corrections: number;
	timeout_minutes: number;
}

export interface StitchPolicy {
	allowed: boolean;
	required?: boolean;
	expected_outputs?: string[];
}

export interface TaskMetadata {
	goal_issue_number?: number | null;
	issue_number?: number | null;
	created_at: string;
	updated_at: string;
	created_by: string;
	tags: string[];
	template_id?: string | null;
	instance_key?: string | null;
}

export interface TaskContract {
	kind: "task" | "template";
	id: string;
	title: string;
	role: string;
	type: string;
	status: string;
	priority: string;
	enabled: boolean;
	objective: string;
	depends_on: string[];
	inputs: string[];
	outputs: string[];
	acceptance_criteria: string[];
	allowed_paths: string[];
	forbidden_paths: string[];
	forbidden_actions: string[];
	validation_commands: string[];
	risk_level: string;
	approval_policy:
		| "automatic"
		| "reviewer"
		| "human"
		| "human-before-execution";
	parallelizable: boolean;
	resource_locks: string[];
	conflicts_with: string[];
	retry_policy: RetryPolicy;
	stitch: StitchPolicy;
	metadata: TaskMetadata;
}

export interface TaskIndex {
	schema_version: number;
	project_id: string;
	generated_at: string;
	updated_at: string;
	tasks: TaskContract[];
}

export interface GitHubIssue {
	number: number;
	title: string;
	body: string | null;
	state: string;
	html_url: string;
	pull_request?: unknown;
	labels: Array<
		| string
		| {
				name?: string;
		  }
	>;
}

export interface GitHubComment {
	body?: string | null;
	created_at?: string;
}

export interface ExistingSession {
	name: string;
	id: string;
	url: string;
	state: string;
}

export interface JulesSessionResponse {
	name?: unknown;
	id?: unknown;
	url?: unknown;
	state?: unknown;
	error?: {
		message?: unknown;
	};
	message?: unknown;
}

export interface RuntimeReservation {
	key: string;
	category: "new" | "correction" | "maintenance";
}

export interface DispatchResult {
	taskId: string;
	issueNumber: number | null;
	dispatched: boolean;
	dryRun: boolean;
	duplicate: boolean;
	reusedExistingSession: boolean;
	reason: string;
	session: ExistingSession;
	request: {
		title: string;
		source: string;
		startingBranch: "main";
		automationMode: "AUTO_CREATE_PR";
		requirePlanApproval: false;
	};
	validation: {
		taskStatus: string;
		role: string;
		taskType: string;
		riskLevel: string;
		approvalPolicy: string;
		roleFile: string;
		promptFile: string;
	};
	createdAt: string;
}
