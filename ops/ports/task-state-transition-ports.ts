import type {
	GitHubComment,
	GitHubIssue,
} from "../domain/task-state-transition/task-state-transition-contract.js";

export interface TaskStateTransitionGitHubPort {
	getIssue(issueNumber: number): Promise<GitHubIssue>;

	listComments(issueNumber: number): Promise<GitHubComment[]>;

	updateIssue(
		issueNumber: number,
		labels: string[],
		state: "open" | "closed",
	): Promise<void>;

	createComment(issueNumber: number, body: string): Promise<void>;
}
