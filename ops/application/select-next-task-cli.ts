import process from "node:process";

import {
  TASK_ID_PATTERN,
  type CliOptions,
} from "../domain/task-selection/task-selection-contract.js";

export function fail(message: string): never {
  throw new Error(message);
}

export function requireValue(
  argv: string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];

  if (
    value === undefined ||
    value.startsWith("--")
  ) {
    fail(`${flag} 옵션에 값이 필요합니다.`);
  }

  return value;
}

export function parseInteger(
  value: string,
  field: string,
  minimum = 0,
): number {
  if (!/^[0-9]+$/.test(value)) {
    fail(`${field}는 정수여야 합니다.`);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum
  ) {
    fail(`${field} 값이 올바르지 않습니다.`);
  }

  return parsed;
}

export function parseArguments(
  argv: string[],
): CliOptions {
  let responseFile =
    process.env.RESPONSE_FILE ?? "";

  let maxConcurrency = 10;
  let newTaskBudget = 65;
  let correctionBudget = 20;
  let maintenanceBudget = 10;
  let reserveBudget = 5;
  let sourceTaskId: string | undefined;
  let dryRun = false;
  let reserve = false;

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const argument = argv[index];

    switch (argument) {
      case "--response-file": {
        responseFile = requireValue(
          argv,
          index,
          argument,
        );

        index += 1;
        break;
      }

      case "--max-concurrency": {
        maxConcurrency = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "max-concurrency",
          1,
        );

        index += 1;
        break;
      }

      case "--new-task-budget": {
        newTaskBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "new-task-budget",
        );

        index += 1;
        break;
      }

      case "--correction-budget": {
        correctionBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "correction-budget",
        );

        index += 1;
        break;
      }

      case "--maintenance-budget": {
        maintenanceBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "maintenance-budget",
        );

        index += 1;
        break;
      }

      case "--reserve-budget": {
        reserveBudget = parseInteger(
          requireValue(
            argv,
            index,
            argument,
          ),
          "reserve-budget",
        );

        index += 1;
        break;
      }

      case "--source-task-id": {
        sourceTaskId = requireValue(
          argv,
          index,
          argument,
        )
          .trim()
          .toUpperCase();

        index += 1;
        break;
      }

      case "--dry-run": {
        dryRun = true;
        break;
      }

      case "--reserve": {
        reserve = true;
        break;
      }

      default: {
        fail(
          `지원하지 않는 옵션입니다: ${argument}`,
        );
      }
    }
  }

  if (responseFile.trim() === "") {
    fail("--response-file이 필요합니다.");
  }

  if (
    sourceTaskId !== undefined &&
    sourceTaskId !== "" &&
    !TASK_ID_PATTERN.test(sourceTaskId)
  ) {
    fail(
      "source-task-id는 TASK-000 형식이어야 합니다.",
    );
  }

  if (maxConcurrency > 15) {
    fail(
      "max-concurrency는 15를 초과할 수 없습니다.",
    );
  }

  if (dryRun && reserve) {
    fail(
      "--dry-run과 --reserve는 동시에 사용할 수 없습니다.",
    );
  }

  if (!dryRun && !reserve) {
    fail(
      "--dry-run 또는 --reserve 중 하나가 필요합니다.",
    );
  }

  const allocatedBudget =
    newTaskBudget +
    correctionBudget +
    maintenanceBudget +
    reserveBudget;

  if (allocatedBudget > 1000) {
    fail(
      "입력된 일일 예산 합계가 비정상적으로 큽니다.",
    );
  }

  return {
    responseFile,
    maxConcurrency,
    newTaskBudget,
    correctionBudget,
    maintenanceBudget,
    reserveBudget,
    sourceTaskId:
      sourceTaskId === ""
        ? undefined
        : sourceTaskId,
    dryRun,
    reserve,
  };
}

export function getRepository(): string {
  const repository =
    process.env.REPOSITORY ??
    process.env.GITHUB_REPOSITORY ??
    "";

  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      repository,
    )
  ) {
    fail(
      "REPOSITORY 또는 GITHUB_REPOSITORY가 owner/repository 형식이어야 합니다.",
    );
  }

  return repository;
}
