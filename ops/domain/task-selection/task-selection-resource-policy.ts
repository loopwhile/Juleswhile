import type {
  Candidate,
  TaskContract,
} from "./task-selection-contract.js";

export function sharesResourceLock(
  task: TaskContract,
  activeTasks: TaskContract[],
): boolean {
  const taskLocks =
    new Set(task.resource_locks ?? []);

  for (const activeTask of activeTasks) {
    if (
      task.conflicts_with.includes(
        activeTask.id,
      ) ||
      activeTask.conflicts_with.includes(
        task.id,
      )
    ) {
      return true;
    }

    for (
      const lock of
      activeTask.resource_locks ?? []
    ) {
      if (taskLocks.has(lock)) {
        return true;
      }
    }

    if (
      !task.parallelizable ||
      !activeTask.parallelizable
    ) {
      return true;
    }
  }

  return false;
}

export function priorityValue(
  priority: TaskContract["priority"],
): number {
  switch (priority) {
    case "P0":
      return 0;

    case "P1":
      return 1;

    case "P2":
      return 2;

    case "P3":
      return 3;
  }
}

export function numericTaskId(
  taskId: string,
): number {
  return Number(
    taskId.replace("TASK-", ""),
  );
}

export function compareCandidates(
  left: Candidate,
  right: Candidate,
): number {
  const priorityDifference =
    priorityValue(left.task.priority) -
    priorityValue(right.task.priority);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return (
    numericTaskId(left.task.id) -
    numericTaskId(right.task.id)
  );
}
