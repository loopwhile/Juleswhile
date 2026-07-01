import {
	CORRECTION_ID_PATTERN,
	DRAFT_ID_PATTERN,
	GOAL_ID_PATTERN,
	MAINTENANCE_ID_PATTERN,
	TASK_ID_PATTERN,
	TEMPLATE_ID_PATTERN,
} from "../domain/task-validation/task-validation-contract.js";

import type {
	CliOptions,
	TaskIndex,
	ValidationReport,
} from "../domain/task-validation/task-validation-contract.js";

import {
	matchesPattern,
	normalizePath,
} from "../domain/task-validation/task-path-policy.js";

import { readChangeList } from "../infrastructure/filesystem/task-validation-filesystem-adapter.js";

export async function validatePrScope(
	taskIndex: TaskIndex,
	options: CliOptions,
): Promise<ValidationReport> {
	const errors: string[] = [];
	const warnings: string[] = [];

	const taskId = options.taskId as string;

	const changeListPath = options.changeList as string;

	const content = await readChangeList(changeListPath);

	const changedFiles = content
		.split(/\r?\n/)
		.map(normalizePath)
		.filter(Boolean);

	if (changedFiles.length === 0) {
		errors.push("변경 파일 목록이 비어 있습니다.");
	}

	const protectedPatterns = [
		"AGENTS.md",
		".github/workflows/**",
		".github/ISSUE_TEMPLATE/**",
		".github/pull_request_template.md",
		"ops/schemas/**",
		"ops/scripts/**",
		"package.json",
		"package-lock.json",
		"netlify.toml",
	];

	if (TASK_ID_PATTERN.test(taskId)) {
		const task = taskIndex.tasks.find((item) => item.id === taskId);

		if (!task) {
			errors.push(`${taskId}를 TASK Manifest에서 찾을 수 없습니다.`);
		} else {
			for (const file of changedFiles) {
				const forbidden = task.forbidden_paths.some((pattern) =>
					matchesPattern(file, pattern),
				);

				if (forbidden) {
					errors.push(`${taskId}: 금지 경로가 변경됐습니다: ${file}`);

					continue;
				}

				const allowed = task.allowed_paths.some((pattern) =>
					matchesPattern(file, pattern),
				);

				if (!allowed) {
					errors.push(`${taskId}: 허용 범위 밖의 파일이 변경됐습니다: ${file}`);
				}
			}

			const protectedChange = changedFiles.filter((file) =>
				protectedPatterns.some((pattern) => matchesPattern(file, pattern)),
			);

			if (
				protectedChange.length > 0 &&
				!["human", "human-before-execution"].includes(task.approval_policy)
			) {
				errors.push(
					`${taskId}: 제어 평면 변경에는 사람 승인 정책이 필요합니다: ${protectedChange.join(", ")}`,
				);
			}
		}
	} else if (
		MAINTENANCE_ID_PATTERN.test(taskId) ||
		TEMPLATE_ID_PATTERN.test(taskId)
	) {
		const protectedChange = changedFiles.filter((file) =>
			protectedPatterns.some((pattern) => matchesPattern(file, pattern)),
		);

		if (protectedChange.length > 0) {
			warnings.push(
				`${taskId}: 제어 평면 변경이 포함되어 있습니다. 사람 승인이 필요합니다.`,
			);
		}
	} else if (GOAL_ID_PATTERN.test(taskId)) {
		const goalAllowedPatterns = [
			"PROJECT_GOAL.md",
			"docs/**",
			"ops/tasks/task-index.yaml",
			"ops/state/project-state.json",
		];

		for (const file of changedFiles) {
			if (
				!goalAllowedPatterns.some((pattern) => matchesPattern(file, pattern))
			) {
				errors.push(
					`${taskId}: Goal Intake PR의 허용 범위 밖 파일입니다: ${file}`,
				);
			}
		}
	} else if (CORRECTION_ID_PATTERN.test(taskId)) {
		for (const file of changedFiles) {
			const protectedChange = protectedPatterns.some((pattern) =>
				matchesPattern(file, pattern),
			);

			if (protectedChange) {
				errors.push(
					`${taskId}: Correction PR은 제어 평면을 수정할 수 없습니다: ${file}`,
				);
			}
		}

		warnings.push(
			"Correction PR의 세부 허용 경로는 원본 TASK와 Reviewer가 추가 검증해야 합니다.",
		);
	} else if (DRAFT_ID_PATTERN.test(taskId)) {
		warnings.push("Draft PR validation: 상세 범위 검증을 건너뜁니다.");
	} else {
		errors.push(`지원하지 않는 PR 식별자입니다: ${taskId}`);
	}

	return {
		mode: "pr-scope",
		errors,
		warnings,
		summary: {
			taskId,
			changedFiles: changedFiles.length,
			baseSha: options.baseSha ?? "",
			headSha: options.headSha ?? "",
		},
	};
}
