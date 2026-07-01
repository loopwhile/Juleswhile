import { DEPLOYMENT_LABELS } from "./task-state-transition-contract.js";

import type {
	GitHubIssue,
	TransitionMode,
	TransitionOptions,
} from "./task-state-transition-contract.js";

export function labelNames(issue: GitHubIssue): string[] {
	return issue.labels
		.map((label) => (typeof label === "string" ? label : (label.name ?? "")))
		.filter(Boolean);
}

export function buildTransitionLabels(
	currentLabels: string[],
	mode: TransitionMode,
): string[] {
	const labels = currentLabels.filter(
		(label) => !label.startsWith("state:") && !DEPLOYMENT_LABELS.has(label),
	);

	switch (mode) {
		case "deploying":
			labels.push("state:deploying");
			break;

		case "completed":
			labels.push("state:completed", "deployment:ready");
			break;

		case "failed":
			labels.push("state:deployment-review", "deployment:failed");
			break;

		case "verification-disabled":
			labels.push("state:deploying", "deployment:verification-disabled");
			break;
	}

	return [...new Set(labels)].sort();
}

export function markerPart(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "unknown"
	);
}

export function buildTransitionMarker(
	options: Pick<
		TransitionOptions,
		"mode" | "mergeSha" | "deployId" | "deployState"
	>,
): string {
	switch (options.mode) {
		case "deploying":
			return `<!-- juleswhile:task-deploying:${options.mergeSha} -->`;

		case "completed":
			return `<!-- juleswhile:deployment-completed:${options.mergeSha}:${markerPart(options.deployId)} -->`;

		case "failed":
			return `<!-- juleswhile:deployment-failed:${options.mergeSha}:${markerPart(options.deployId || options.deployState)} -->`;

		case "verification-disabled":
			return `<!-- juleswhile:deployment-verification-disabled:${options.mergeSha} -->`;
	}
}

export function buildComment(
	options: TransitionOptions,
	marker: string,
): string {
	const lines = [marker, ""];

	switch (options.mode) {
		case "deploying":
			lines.push(
				"## TASK Production 배포 대기",
				"",
				`\`${options.taskId}\`의 Pull Request가 \`main\`에 병합됐습니다.`,
				"",
				`- Pull Request: #${options.prNumber || "unknown"}`,
				`- Merge Commit: \`${options.mergeSha}\``,
				"- 상태: `deploying`",
				"",
				"Netlify Production 배포 검증 전에는 TASK를 완료 처리하지 않습니다.",
			);
			break;

		case "completed":
			lines.push(
				"## Production 배포 검증 완료",
				"",
				`\`${options.taskId}\`의 Production 배포가 확인됐습니다.`,
				"",
				`- Merge Commit: \`${options.mergeSha}\``,
				`- Netlify Deploy: \`${options.deployId || "unknown"}\``,
				"- 상태: `completed`",
				`- 완료 시각: ${new Date().toISOString()}`,
			);

			if (options.deployUrl !== "") {
				lines.push("", `[Production 결과 확인](${options.deployUrl})`);
			}
			break;

		case "failed":
			lines.push(
				"## Production 배포 검증 실패",
				"",
				`\`${options.taskId}\`의 Production 배포를 확인하지 못했습니다.`,
				"",
				`- Merge Commit: \`${options.mergeSha}\``,
				`- Netlify Deploy: \`${options.deployId || "not-found"}\``,
				`- 상태: \`${options.deployState || "workflow-error"}\``,
				`- Workflow: ${options.workflowUrl || "unknown"}`,
				"",
				"Issue를 다시 열고 deployment review 상태로 전환했습니다.",
			);
			break;

		case "verification-disabled":
			lines.push(
				"## Production 배포 검증 비활성",
				"",
				`\`${options.taskId}\`의 Production 배포 검증이 비활성 상태입니다.`,
				"",
				`- Merge Commit: \`${options.mergeSha}\``,
				"- 상태: `deploying`",
				"",
				"배포 성공을 추정하지 않으며, 수동 Netlify 검증이 필요합니다.",
			);
			break;
	}

	return lines.join("\n");
}
