import {
	DISPATCH_INTENT_MARKER,
	DISPATCH_MARKER,
	DISPATCH_OUTCOME_MARKER,
	QUOTA_LEDGER_MARKER,
} from "./task-dispatch-contract.js";

import type {
	ExistingSession,
	GitHubComment,
	RuntimeReservation,
	TaskContract,
} from "./task-dispatch-contract.js";

export function parseExistingSession(
	comments: GitHubComment[],
): ExistingSession | null {
	for (const comment of comments) {
		const body = comment.body ?? "";

		if (!body.includes(DISPATCH_MARKER)) {
			continue;
		}

		const nameMatch = body.match(/\|\s*Session\s*\|\s*`([^`]+)`\s*\|/i);

		const idMatch = body.match(/\|\s*Session ID\s*\|\s*`([^`]+)`\s*\|/i);

		const stateMatch = body.match(/\|\s*Session 상태\s*\|\s*`([^`]+)`\s*\|/i);

		const urlMatch = body.match(/\[Jules Session 열기\]\(([^)]+)\)/i);

		if (nameMatch && idMatch) {
			return {
				name: nameMatch[1],
				id: idMatch[1],
				url: urlMatch?.[1] ?? "",
				state: stateMatch?.[1] ?? "UNKNOWN",
			};
		}
	}

	return null;
}

export function formatUtcDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function parseLedgerField(body: string, field: string): string {
	const match = body.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));

	return match?.[1]?.trim() ?? "";
}

export function getTaskCategory(
	task: TaskContract,
): RuntimeReservation["category"] {
	if (task.type === "correction") {
		return "correction";
	}

	if (
		task.type === "maintenance" ||
		task.type === "operations" ||
		task.type === "deployment" ||
		task.role === "operations"
	) {
		return "maintenance";
	}

	return "new";
}

export function latestActiveReservation(
	task: TaskContract,
	issueNumber: number,
	comments: GitHubComment[],
): RuntimeReservation | null {
	const events = comments
		.map((comment) => {
			const body = comment.body ?? "";

			if (!body.includes(QUOTA_LEDGER_MARKER)) {
				return null;
			}

			const taskId = parseLedgerField(body, "task_id").toUpperCase();
			const parsedIssueNumber = Number(parseLedgerField(body, "issue_number"));
			const key = parseLedgerField(body, "reservation_key");
			const status = parseLedgerField(body, "status");
			const category = parseLedgerField(body, "category");

			if (
				taskId !== task.id ||
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
				createdAt: comment.created_at ?? "",
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

export function hasBlockingDispatchIntent(comments: GitHubComment[]): boolean {
	const latestSessionAt = Math.max(
		0,
		...comments
			.filter((comment) => (comment.body ?? "").includes(DISPATCH_MARKER))
			.map((comment) => Date.parse(comment.created_at ?? ""))
			.filter(Number.isFinite),
	);

	const latestOutcomeAt = Math.max(
		0,
		...comments
			.filter((comment) =>
				(comment.body ?? "").includes(DISPATCH_OUTCOME_MARKER),
			)
			.filter((comment) => {
				const status = parseLedgerField(comment.body ?? "", "status");

				return ["released", "failed", "reconciled"].includes(status);
			})
			.map((comment) => Date.parse(comment.created_at ?? ""))
			.filter(Number.isFinite),
	);

	const latestIntentAt = Math.max(
		0,
		...comments
			.filter((comment) =>
				(comment.body ?? "").includes(DISPATCH_INTENT_MARKER),
			)
			.map((comment) => Date.parse(comment.created_at ?? ""))
			.filter(Number.isFinite),
	);

	return latestIntentAt > latestSessionAt && latestIntentAt > latestOutcomeAt;
}
