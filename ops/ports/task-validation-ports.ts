import type {
	ProjectState,
	TaskIndex,
} from "../domain/task-validation/task-validation-contract.js";

export interface TaskValidationFileSystemPort {
	readTaskIndex(filePath: string): Promise<TaskIndex>;

	readProjectState(): Promise<ProjectState>;

	roleFileExists(role: string): Promise<boolean>;

	readChangeList(filePath: string): Promise<string>;
}
