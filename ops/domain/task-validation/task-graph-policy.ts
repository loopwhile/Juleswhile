import type { TaskContract } from "./task-validation-contract.js";

export function detectCycles(taskMap: Map<string, TaskContract>): string[] {
	const errors: string[] = [];

	const state = new Map<string, "unvisited" | "visiting" | "visited">();

	const stack: string[] = [];

	const visit = (taskId: string): void => {
		const currentState = state.get(taskId) ?? "unvisited";

		if (currentState === "visited") {
			return;
		}

		if (currentState === "visiting") {
			const cycleStart = stack.indexOf(taskId);

			const cycle = [...stack.slice(cycleStart), taskId];

			errors.push(`순환 의존성: ${cycle.join(" -> ")}`);

			return;
		}

		state.set(taskId, "visiting");

		stack.push(taskId);

		const task = taskMap.get(taskId);

		for (const dependency of task?.depends_on ?? []) {
			if (taskMap.has(dependency)) {
				visit(dependency);
			}
		}

		stack.pop();

		state.set(taskId, "visited");
	};

	for (const taskId of taskMap.keys()) {
		visit(taskId);
	}

	return errors;
}
