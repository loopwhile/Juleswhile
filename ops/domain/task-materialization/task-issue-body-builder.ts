import { stringify as stringifyYaml } from "yaml";

import { MANAGED_MARKER } from "./task-materialization-contract.js";

import type { TaskContract } from "./task-materialization-contract.js";

import { taskHash } from "./task-issue-identity-policy.js";

export function buildTaskIssueBody(task: TaskContract): string {
	const contractYaml = stringifyYaml(task, {
		indent: 2,
		lineWidth: 100,
	}).trim();

	return [
		MANAGED_MARKER,
		`<!-- juleswhile:task-id:${task.id} -->`,
		`<!-- juleswhile:task-hash:${taskHash(task)} -->`,
		"",
		`# ${task.id} · ${task.title}`,
		"",
		"## TASK 정보",
		"",
		`- Role: \`${task.role}\``,
		`- Type: \`${task.type}\``,
		`- Status: \`${task.status}\``,
		`- Priority: \`${task.priority}\``,
		`- Risk: \`${task.risk_level}\``,
		`- Approval: \`${task.approval_policy}\``,
		"",
		"## 목표",
		"",
		task.objective,
		"",
		"## 완료 조건",
		"",
		...task.acceptance_criteria.map((criterion) => `- [ ] ${criterion}`),
		"",
		"## TASK Contract",
		"",
		"```yaml",
		contractYaml,
		"```",
		"",
		"이 Issue는 `ops/tasks/task-index.yaml`에서 자동 실체화됐습니다.",
		"구조화된 TASK 계약의 최종 기준은 `main`의 Manifest입니다.",
	].join("\n");
}

export function buildInstanceProposalBody(
	task: TaskContract,
	templateId: string,
	instanceKey: string,
): string {
	const contractYaml = stringifyYaml(task, {
		indent: 2,
		lineWidth: 100,
	}).trim();

	return [
		MANAGED_MARKER,
		`<!-- juleswhile:task-id:${task.id} -->`,
		`<!-- juleswhile:template-id:${templateId} -->`,
		`<!-- juleswhile:instance-key:${instanceKey} -->`,
		"",
		`# ${task.id} · ${task.title}`,
		"",
		"## 반복 TASK 실체화 제안",
		"",
		`- Template: \`${templateId}\``,
		`- Instance key: \`${instanceKey}\``,
		"- Status: `DRAFT`",
		"",
		"이 Issue는 정기 콘텐츠 Template에서 생성된 TASK 제안입니다.",
		"",
		"안전한 실행을 위해 다음 절차가 필요합니다.",
		"",
		"1. Planner가 이 계약을 검토합니다.",
		"2. `ops/tasks/task-index.yaml`에 TASK를 추가하는 PR을 생성합니다.",
		"3. Schema와 TASK Graph 검증을 통과합니다.",
		"4. PR이 `main`에 병합됩니다.",
		"5. Issue가 `state:ready`로 전환된 후 Jules에 전달됩니다.",
		"",
		"## 제안 TASK Contract",
		"",
		"```yaml",
		contractYaml,
		"```",
	].join("\n");
}
