#!/usr/bin/env node

import process from "node:process";

import {
  runSelectNextTask,
} from "../application/select-next-task-service.js";

runSelectNextTask(
  process.argv.slice(2),
).catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `다음 TASK 선택 실패: ${message}`,
  );

  process.exitCode = 1;
});
