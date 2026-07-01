import type {
	ExistingSession,
	GitHubComment,
	GitHubIssue,
} from "../domain/task-dispatch/task-dispatch-contract.js";

export interface TaskDispatchGitHubPort {
	getTrackingIssue(
		repository: string,
		issueNumber: number,
	): Promise<GitHubIssue>;

	getIssueComments(
		repository: string,
		issueNumber: number,
	): Promise<GitHubComment[]>;

	comment(repository: string, issueNumber: number, body: string): Promise<void>;
}

export interface JulesSessionPort {
	createSession(request: Record<string, unknown>): Promise<ExistingSession>;
}

export interface TaskDispatchFileSystemPort {
	pathExists(filePath: string): Promise<boolean>;

	writeJsonAtomic(filePath: string, value: unknown): Promise<void>;
}
