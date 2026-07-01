import type {
	GitHubIssue,
	TaskIndex,
} from "../domain/task-materialization/task-materialization-contract.js";

export interface TaskMaterializationGitHubPort {
	listIssues(repository: string): Promise<GitHubIssue[]>;

	request<T>(
		repository: string,
		route: string,
		options?: RequestInit,
	): Promise<T>;
}

export interface TaskMaterializationManifestPort {
	readTaskIndex(): Promise<TaskIndex>;
}

export interface TaskMaterializationOutputPort {
	writeJson(filePath: string, value: unknown): Promise<void>;
}
