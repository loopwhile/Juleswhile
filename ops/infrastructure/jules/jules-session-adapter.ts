import process from "node:process";

import { classifyJulesCreateFailure } from "../../scripts/session-dispatch-atomicity.js";

import type {
	ExistingSession,
	JulesSessionResponse,
} from "../../domain/task-dispatch/task-dispatch-contract.js";

import { fail } from "../../domain/task-dispatch/task-dispatch-error.js";

const JULES_API_BASE_URL =
	process.env.JULES_API_BASE_URL ?? "https://jules.googleapis.com/v1alpha";

export function readString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		fail(`필수 문자열 필드가 올바르지 않습니다: ${field}`);
	}

	return value.trim();
}

export function getApiErrorMessage(
	response: JulesSessionResponse,
	rawBody: string,
): string {
	const nestedMessage = response.error?.message;

	if (typeof nestedMessage === "string") {
		return nestedMessage;
	}

	if (typeof response.message === "string") {
		return response.message;
	}

	return rawBody.slice(0, 2000);
}

export class JulesSessionCreationError extends Error {
	readonly outcome: "failed" | "unknown";

	constructor(message: string, outcome: "failed" | "unknown", cause?: unknown) {
		super(message, { cause });
		this.name = "JulesSessionCreationError";
		this.outcome = outcome;
	}
}

export async function createJulesSession(
	request: Record<string, unknown>,
): Promise<ExistingSession> {
	const apiKey = process.env.JULES_API_KEY;

	if (!apiKey) {
		fail("JULES_API_KEY가 설정되지 않았습니다.");
	}

	const controller = new AbortController();

	const timeout = setTimeout(() => controller.abort(), 45000);

	let response: Response;

	try {
		response = await fetch(`${JULES_API_BASE_URL}/sessions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": apiKey,
			},
			body: JSON.stringify(request),
			signal: controller.signal,
		});
	} catch (error) {
		throw new JulesSessionCreationError(
			"Jules API Session 생성 요청에 실패했습니다.",
			"unknown",
			error,
		);
	} finally {
		clearTimeout(timeout);
	}

	const rawBody = await response.text();

	let parsed: JulesSessionResponse = {};

	if (rawBody.trim() !== "") {
		try {
			parsed = JSON.parse(rawBody) as JulesSessionResponse;
		} catch (error) {
			if (!response.ok) {
				throw new JulesSessionCreationError(
					`Jules API 요청 실패 HTTP ${response.status}: ${rawBody.slice(0, 2000)}`,
					classifyJulesCreateFailure(response.status),
					error,
				);
			}

			throw new JulesSessionCreationError(
				"Jules API 성공 응답을 JSON으로 해석할 수 없습니다.",
				"unknown",
				error,
			);
		}
	}

	if (!response.ok) {
		throw new JulesSessionCreationError(
			`Jules API 요청 실패 HTTP ${response.status}: ${getApiErrorMessage(parsed, rawBody)}`,
			classifyJulesCreateFailure(response.status),
		);
	}

	let name: string;

	try {
		name = readString(parsed.name, "session.name");
	} catch (error) {
		throw new JulesSessionCreationError(
			"Jules API 응답에서 Session 이름을 확인할 수 없습니다.",
			"unknown",
			error,
		);
	}

	const id =
		typeof parsed.id === "string" && parsed.id.trim() !== ""
			? parsed.id.trim()
			: (name.split("/").at(-1) ?? "");

	if (id === "") {
		throw new JulesSessionCreationError(
			"Jules API 응답에서 Session ID를 확인할 수 없습니다.",
			"unknown",
		);
	}

	return {
		name,
		id,
		url: typeof parsed.url === "string" ? parsed.url : "",
		state: typeof parsed.state === "string" ? parsed.state : "QUEUED",
	};
}
