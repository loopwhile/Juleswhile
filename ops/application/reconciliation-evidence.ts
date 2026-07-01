import type { JulesSession } from "../scripts/jules-api.js";

import type {
	DispatchIntent,
	GitHubComment,
	GitHubIssue,
	RuntimeReservation,
	SessionMarker,
	TaskContract,
} from "../domain/reconciliation/reconciliation-contract.js";

import {
	DISPATCH_INTENT_MARKER,
	DISPATCH_MARKER,
	DISPATCH_OUTCOME_MARKER,
	INCIDENT_MARKER_PREFIX,
	QUOTA_LEDGER_MARKER,
} from "../domain/reconciliation/reconciliation-policy.js";

export function getLabels(issue: GitHubIssue): Set<string> {
	return new Set(
		issue.labels
			.map((label) => {
				if (typeof label === "string") {
					return label;
				}

				return label.name ?? "";
			})
			.filter(Boolean),
	);
}

export function setLocalLabels(issue: GitHubIssue, labels: string[]): void {
	issue.labels = labels.map((name) => ({ name }));
}

export function getTaskId(issue: GitHubIssue): string | null {
	const body = issue.body ?? "";

	const markerMatch = body.match(
		/<!--\s*juleswhile:task-id:(TASK-[0-9]{3,})\s*-->/i,
	);

	if (markerMatch) {
		return markerMatch[1].toUpperCase();
	}

	if (!getLabels(issue).has("juleswhile:task")) {
		return null;
	}

	const titleMatch = issue.title.match(/\b(TASK-[0-9]{3,})\b/i);

	return titleMatch ? titleMatch[1].toUpperCase() : null;
}

export function ageMinutes(isoDate: string): number {
	const timestamp = Date.parse(isoDate);

	if (Number.isNaN(timestamp)) {
		return 0;
	}

	return (Date.now() - timestamp) / 60000;
}

export function hasAnyLabel(
	labels: Set<string>,
	candidates: Set<string>,
): boolean {
	return [...candidates].some((label) => labels.has(label));
}

export function findPullRequestNumber(
	issue: GitHubIssue,
	comments: GitHubComment[],
): number | null {
	const combined = [
		issue.body ?? "",
		...comments.map((comment) => comment.body ?? ""),
	].join("\n");

	const matches = [
		combined.match(/Pull Request:\s*#([0-9]+)/i),
		combined.match(/github\.com\/[^/\s]+\/[^/\s]+\/pull\/([0-9]+)/i),
	];

	for (const match of matches) {
		if (match) {
			return Number(match[1]);
		}
	}

	return null;
}

export function parseSessionMarkers(
	comments: GitHubComment[],
): SessionMarker[] {
	return comments
		.map((comment) => {
			const body = comment.body ?? "";

			if (!body.includes(DISPATCH_MARKER)) {
				return null;
			}

			const yamlName = parseLedgerField(body, "session_name");
			const yamlId = parseLedgerField(body, "session_id");
			const yamlUrl = parseLedgerField(body, "session_url");
			const yamlState = parseLedgerField(body, "state");
			const tableName =
				body.match(/\|\s*Session\s*\|\s*`([^`]+)`\s*\|/i)?.[1] ?? "";
			const tableId =
				body.match(/\|\s*Session ID\s*\|\s*`([^`]+)`\s*\|/i)?.[1] ?? "";
			const tableState =
				body.match(/\|\s*Session 상태\s*\|\s*`([^`]+)`\s*\|/i)?.[1] ?? "";
			const markdownUrl =
				body.match(/\[Jules Session 열기\]\(([^)]+)\)/i)?.[1] ?? "";

			const name = yamlName || tableName;
			const id = yamlId || tableId || name.split("/").at(-1) || "";

			if (name === "" && id === "") {
				return null;
			}

			return {
				name,
				id,
				url: yamlUrl || markdownUrl,
				state: yamlState || tableState || "UNKNOWN",
				createdAt: comment.created_at,
			};
		})
		.filter((marker): marker is SessionMarker => marker !== null)
		.sort(
			(left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
		);
}

export function latestDispatchIntent(
	comments: GitHubComment[],
): DispatchIntent | null {
	const intents = comments
		.map((comment) => {
			const body = comment.body ?? "";

			if (!body.includes(DISPATCH_INTENT_MARKER)) {
				return null;
			}

			return {
				createdAt: comment.created_at,
				reservationKey: parseLedgerField(body, "reservation_key"),
			};
		})
		.filter((intent): intent is DispatchIntent => intent !== null)
		.sort(
			(left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
		);

	return intents[0] ?? null;
}

export function extractPullRequestUrls(session: JulesSession): string[] {
	return session.outputs
		.map((output) => output.pullRequest?.url ?? "")
		.filter((url) => url !== "");
}

export function pullRequestNumberFromUrl(
	repository: string,
	url: string,
): number | null {
	const [owner, repo] = repository.split("/");
	const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = url.match(
		new RegExp(
			`^https://github\\.com/${escapedOwner}/${escapedRepo}/pull/([0-9]+)(?:[#?].*)?$`,
			"i",
		),
	);

	return match ? Number(match[1]) : null;
}

export function sessionTitle(
	taskId: string,
	task: TaskContract | undefined,
): string {
	return `[${taskId}] ${task?.title ?? ""}`.trim();
}

export function sessionMatchesRepository(
	session: JulesSession,
	repository: string,
): boolean {
	return (
		session.sourceContextRepository === "" ||
		session.sourceContextRepository === repository ||
		session.sourceContextRepository === `github/${repository}` ||
		session.sourceContextRepository === `sources/github/${repository}`
	);
}

export function incidentMarker(key: string): string {
	return `${INCIDENT_MARKER_PREFIX}${key} -->`;
}

export function hasCommentMarker(
	comments: GitHubComment[],
	marker: string,
): boolean {
	return comments.some((comment) => (comment.body ?? "").includes(marker));
}

export function correctionAttempts(comments: GitHubComment[]): number {
	return comments.filter((comment) =>
		(comment.body ?? "").includes("<!-- juleswhile:correction-attempt -->"),
	).length;
}

export function formatUtcDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function parseLedgerField(body: string, field: string): string {
	const match = body.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));

	return match?.[1]?.trim() ?? "";
}

export function latestMarkerAt(
	comments: GitHubComment[],
	marker: string,
): number {
	return Math.max(
		0,
		...comments
			.filter((comment) => (comment.body ?? "").includes(marker))
			.map((comment) => Date.parse(comment.created_at))
			.filter(Number.isFinite),
	);
}

export function latestResolvedDispatchOutcomeAt(
	comments: GitHubComment[],
): number {
	return Math.max(
		0,
		...comments
			.filter((comment) =>
				(comment.body ?? "").includes(DISPATCH_OUTCOME_MARKER),
			)
			.filter((comment) => {
				const status = parseLedgerField(comment.body ?? "", "status");

				return ["released", "failed", "reconciled"].includes(status);
			})
			.map((comment) => Date.parse(comment.created_at))
			.filter(Number.isFinite),
	);
}

export function hasUnresolvedDispatchIntent(
	comments: GitHubComment[],
): boolean {
	const latestIntentAt = latestMarkerAt(comments, DISPATCH_INTENT_MARKER);

	if (latestIntentAt === 0) {
		return false;
	}

	return (
		latestIntentAt > latestMarkerAt(comments, DISPATCH_MARKER) &&
		latestIntentAt > latestResolvedDispatchOutcomeAt(comments)
	);
}

export function latestActiveReservation(
	taskId: string,
	issueNumber: number,
	comments: GitHubComment[],
): RuntimeReservation | null {
	const events = comments
		.map((comment) => {
			const body = comment.body ?? "";

			if (!body.includes(QUOTA_LEDGER_MARKER)) {
				return null;
			}

			const parsedTaskId = parseLedgerField(body, "task_id").toUpperCase();
			const parsedIssueNumber = Number(parseLedgerField(body, "issue_number"));
			const key = parseLedgerField(body, "reservation_key");
			const status = parseLedgerField(body, "status");
			const category = parseLedgerField(body, "category");

			if (
				parsedTaskId !== taskId ||
				parsedIssueNumber !== issueNumber ||
				key === "" ||
				!["new", "correction", "maintenance"].includes(category)
			) {
				return null;
			}

			return {
				key,
				status,
				category: category as RuntimeReservation["category"],
				createdAt: comment.created_at,
			};
		})
		.filter(
			(
				event,
			): event is {
				key: string;
				status: string;
				category: RuntimeReservation["category"];
				createdAt: string;
			} => event !== null,
		)
		.sort(
			(left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
		);

	const latestByKey = new Map<string, (typeof events)[number]>();

	for (const event of events) {
		latestByKey.set(event.key, event);
	}

	const active = [...latestByKey.values()]
		.filter((event) => ["reserved", "committed"].includes(event.status))
		.sort(
			(left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
		);

	const latest = active[0];

	return latest
		? {
				key: latest.key,
				category: latest.category,
			}
		: null;
}
