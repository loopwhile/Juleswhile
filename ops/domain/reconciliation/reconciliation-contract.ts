export interface CliOptions {
	responseFile: string;
	taskIndexPath: string;
	staleDispatchingMinutes: number;
	staleRunningMinutes: number;
	staleValidatingMinutes: number;
	sessionTimeoutMinutes: number;
	maxCorrections: number;
	dryRun: boolean;
	apply: boolean;
}

export interface GitHubIssue {
	number: number;
	title: string;
	body: string | null;
	state: "open" | "closed";
	html_url: string;
	created_at: string;
	updated_at: string;
	pull_request?: unknown;
	labels: Array<
		| string
		| {
				name?: string;
		  }
	>;
}

export interface GitHubComment {
	body: string | null;
	created_at: string;
}

export interface GitHubPullRequest {
	number: number;
	state: "open" | "closed";
	merged: boolean;
	merged_at: string | null;
	html_url: string;
}

export interface RuntimeReservation {
	key: string;
	category: "new" | "correction" | "maintenance";
}

export interface TaskContract {
	id: string;
	title: string;
	retry_policy?: {
		max_corrections?: number;
	};
	metadata?: {
		issue_number?: number | null;
	};
}

export interface TaskIndex {
	tasks: TaskContract[];
}

export interface SessionMarker {
	name: string;
	id: string;
	url: string;
	state: string;
	createdAt: string;
}

export interface DispatchIntent {
	createdAt: string;
	reservationKey: string;
}

export interface ReconcileAction {
	issueNumber: number;
	taskId: string;
	action: string;
	reason: string;
	applied: boolean;
}

export interface ReconcileResult {
	dryRun: boolean;
	shouldScheduleNext: boolean;
	summary: {
		scanned: number;
		repaired: number;
		stuck: number;
		blocked: number;
		retried: number;
		incidents: number;
		sessions_checked: number;
		sessions_recovered: number;
		api_errors: number;
		unknown_states: number;
	};
	actions: ReconcileAction[];
	completedAt: string;
}
