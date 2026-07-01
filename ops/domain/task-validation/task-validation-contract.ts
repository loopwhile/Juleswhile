export const DEFAULT_TASK_INDEX = "ops/tasks/task-index.yaml";

export const DEFAULT_PROJECT_STATE = "ops/state/project-state.json";

export const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;

export const GOAL_ID_PATTERN = /^GOAL-[0-9]+$/;

export const CORRECTION_ID_PATTERN = /^CORRECTION-[A-Z0-9-]+$/;

export const MAINTENANCE_ID_PATTERN = /^MAINTENANCE$/;

export const TEMPLATE_ID_PATTERN = /^TEMPLATE$/;

export const DRAFT_ID_PATTERN = /^DRAFT$/;

export const COMPLETED_STATUSES = new Set(["COMPLETED", "MERGED"]);

export interface CliOptions {
	mode: "graph" | "pr-scope";
	taskIndexPath: string;
	taskId?: string;
	changeList?: string;
	baseSha?: string;
	headSha?: string;
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
	validation_commands: string[];
	risk_level: string;
	approval_policy: string;
	parallelizable: boolean;
	resource_locks: string[];
	conflicts_with: string[];
	recurrence?: {
		enabled: boolean;
	};
}

export interface TaskIndex {
	schema_version: number;
	project_id: string;
	tasks: TaskContract[];
}

export interface ValidationReport {
	mode: string;
	errors: string[];
	warnings: string[];
	summary: Record<string, number | string>;
}

export interface ProjectState {
	taskSummary: {
		total: number;
		draft: number;
		ready: number;
		queued: number;
		dispatching: number;
		running: number;
		prOpened: number;
		validating: number;
		correcting: number;
		mergeReady: number;
		merged: number;
		deploying: number;
		completed: number;
		failed: number;
		timeout: number;
		retryWait: number;
		blocked: number;
		cancelled: number;
		templates: number;
	};
}
