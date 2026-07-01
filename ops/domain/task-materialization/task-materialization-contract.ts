export const TASK_INDEX_PATH = "ops/tasks/task-index.yaml";

export const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;

export const MANAGED_MARKER = "<!-- juleswhile:managed-task-issue -->";

export interface CliOptions {
	mode: "sync" | "instantiate";
	responseFile: string;
	dryRun: boolean;
	force: boolean;
	templateId?: string;
	instanceKey?: string;
	contentType?: string;
	topic?: string;
	periodKey?: string;
	timezone?: string;
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
	approval_policy: string;
	parallelizable: boolean;
	resource_locks: string[];
	conflicts_with: string[];
	retry_policy: {
		max_corrections: number;
		timeout_minutes: number;
	};
	stitch: {
		allowed: boolean;
		required?: boolean;
		expected_outputs?: string[];
	};
	recurrence?: {
		enabled: boolean;
		schedule: string;
		timezone: string;
		instance_id_strategy: string;
		max_instances_per_day: number;
	};
	metadata: {
		goal_issue_number?: number | null;
		issue_number?: number | null;
		created_at: string;
		updated_at: string;
		created_by: string;
		tags: string[];
		template_id?: string | null;
		instance_key?: string | null;
	};
}

export interface TaskIndex {
	schema_version: number;
	project_id: string;
	tasks: TaskContract[];
}

export interface GitHubIssue {
	number: number;
	title: string;
	body: string | null;
	state: "open" | "closed";
	html_url: string;
	pull_request?: unknown;
	labels: Array<
		| string
		| {
				name?: string;
		  }
	>;
}

export interface SyncResult {
	mode: "sync";
	created: number;
	updated: number;
	existing: number;
	skipped: number;
	dryRun: boolean;
	issues: Array<{
		taskId: string;
		issueNumber: number | null;
		action: "create" | "update" | "existing" | "skip";
		reason: string;
	}>;
	completedAt: string;
}

export interface InstantiateResult {
	mode: "instantiate";
	created: boolean;
	duplicate: boolean;
	dispatchable: boolean;
	taskId: string;
	issueNumber: number | null;
	templateId: string;
	instanceKey: string;
	reason: string;
	dryRun: boolean;
	completedAt: string;
}
