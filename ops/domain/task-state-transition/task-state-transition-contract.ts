export type TransitionMode =
	| "deploying"
	| "completed"
	| "failed"
	| "verification-disabled";

export interface TransitionOptions {
	mode: TransitionMode;
	issueNumber: number;
	taskId: string;
	mergeSha: string;
	responseFile: string;
	prNumber: string;
	deployId: string;
	deployUrl: string;
	deployState: string;
	workflowUrl: string;
	dryRun: boolean;
}

export interface GitHubIssue {
	number: number;
	state: "open" | "closed";
	labels: Array<
		| string
		| {
				name?: string;
		  }
	>;
}

export interface GitHubComment {
	body: string | null;
}

export interface TransitionResult {
	mode: TransitionMode;
	issueNumber: number;
	taskId: string;
	mergeSha: string;
	labels: string[];
	issueState: "open" | "closed";
	marker: string;
	commentCreated: boolean;
	shouldDispatchNext: boolean;
	dryRun: boolean;
	completedAt: string;
}

export interface TransitionDependencies {
	fetchImpl?: typeof fetch;
	repository?: string;
	token?: string;
	apiBaseUrl?: string;
}

export const DEPLOYMENT_LABELS = new Set([
	"deployment:ready",
	"deployment:failed",
	"deployment:verification-disabled",
]);
