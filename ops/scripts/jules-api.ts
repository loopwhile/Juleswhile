const DEFAULT_JULES_API_BASE_URL =
  "https://jules.googleapis.com/v1alpha";

const DEFAULT_TIMEOUT_MS = 30_000;

export type JulesApiErrorKind =
  | "auth"
  | "not_found"
  | "rate_limited"
  | "server"
  | "timeout"
  | "network"
  | "invalid_response"
  | "unknown";

export class JulesApiError extends Error {
  readonly kind: JulesApiErrorKind;
  readonly status?: number;

  constructor(
    message: string,
    kind: JulesApiErrorKind,
    status?: number,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "JulesApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface JulesPullRequestOutput {
  url: string;
}

export interface JulesSessionOutput {
  pullRequest?: JulesPullRequestOutput;
}

export interface JulesSession {
  name: string;
  id: string;
  url: string;
  title: string;
  state: string;
  createTime: string;
  updateTime: string;
  sourceContextRepository: string;
  outputs: JulesSessionOutput[];
  raw: Record<string, unknown>;
}

export interface ListJulesSessionsResult {
  sessions: JulesSession[];
  pages: number;
}

export interface JulesApiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface JulesListResponse {
  sessions?: unknown;
  nextPageToken?: unknown;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function normalizeSessionName(sessionIdOrName: string): string {
  const trimmed = sessionIdOrName.trim();

  if (trimmed.startsWith("sessions/")) {
    return trimmed;
  }

  return `sessions/${encodeURIComponent(trimmed)}`;
}

function sessionIdFromName(name: string): string {
  return name.split("/").at(-1)?.trim() ?? "";
}

function readSessionOutput(
  value: unknown,
): JulesSessionOutput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const pullRequest = value.pullRequest;

  if (!isRecord(pullRequest)) {
    return undefined;
  }

  const url = readOptionalString(pullRequest.url);

  return url === ""
    ? undefined
    : {
        pullRequest: {
          url,
        },
      };
}

export function parseJulesSession(value: unknown): JulesSession {
  if (!isRecord(value)) {
    throw new JulesApiError(
      "Jules Session response is not an object.",
      "invalid_response",
    );
  }

  const name = readOptionalString(value.name);
  const id = readOptionalString(value.id) || sessionIdFromName(name);

  if (name === "" && id === "") {
    throw new JulesApiError(
      "Jules Session response is missing name and id.",
      "invalid_response",
    );
  }

  const outputs = Array.isArray(value.outputs)
    ? value.outputs
        .map(readSessionOutput)
        .filter(
          (output): output is JulesSessionOutput =>
            output !== undefined,
        )
    : [];

  const sourceContext = isRecord(value.sourceContext)
    ? value.sourceContext
    : {};

  const repository =
    readOptionalString(sourceContext.repository) ||
    readOptionalString(sourceContext.repo) ||
    readOptionalString(sourceContext.githubRepository);

  return {
    name: name || `sessions/${id}`,
    id,
    url: readOptionalString(value.url),
    title: readOptionalString(value.title),
    state: readOptionalString(value.state) || "UNKNOWN",
    createTime: readOptionalString(value.createTime),
    updateTime: readOptionalString(value.updateTime),
    sourceContextRepository: repository,
    outputs,
    raw: value,
  };
}

function classifyStatus(status: number): JulesApiErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 404) {
    return "not_found";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status >= 500) {
    return "server";
  }

  return "unknown";
}

function apiMessage(
  status: number,
  body: string,
): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: unknown;
      };
      message?: unknown;
    };

    const message =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : "";

    if (message !== "") {
      return `Jules API HTTP ${status}: ${message}`;
    }
  } catch {
    // Keep the sanitized status-only fallback.
  }

  return `Jules API HTTP ${status}`;
}

export class JulesApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JulesApiClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.JULES_API_KEY ?? "";
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ??
        process.env.JULES_API_BASE_URL ??
        DEFAULT_JULES_API_BASE_URL,
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getSession(sessionIdOrName: string): Promise<JulesSession> {
    return parseJulesSession(
      await this.request(
        `/${normalizeSessionName(sessionIdOrName)}`,
      ),
    );
  }

  async listSessions(): Promise<ListJulesSessionsResult> {
    const sessions: JulesSession[] = [];
    let pageToken = "";
    let pages = 0;

    do {
      const search = new URLSearchParams({
        pageSize: "100",
      });

      if (pageToken !== "") {
        search.set("pageToken", pageToken);
      }

      const parsed = (await this.request(
        `/sessions?${search.toString()}`,
      )) as JulesListResponse;

      if (!isRecord(parsed)) {
        throw new JulesApiError(
          "Jules ListSessions response is not an object.",
          "invalid_response",
        );
      }

      if (
        parsed.sessions !== undefined &&
        !Array.isArray(parsed.sessions)
      ) {
        throw new JulesApiError(
          "Jules ListSessions response has invalid sessions.",
          "invalid_response",
        );
      }

      sessions.push(
        ...(parsed.sessions ?? []).map(parseJulesSession),
      );

      pageToken =
        typeof parsed.nextPageToken === "string"
          ? parsed.nextPageToken
          : "";
      pages += 1;
    } while (pageToken !== "");

    return {
      sessions,
      pages,
    };
  }

  private async request(route: string): Promise<unknown> {
    if (this.apiKey.trim() === "") {
      throw new JulesApiError(
        "JULES_API_KEY is required for Jules API lookup.",
        "auth",
        401,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${route}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-Goog-Api-Key": this.apiKey,
        },
      });

      const body = await response.text();

      if (!response.ok) {
        throw new JulesApiError(
          apiMessage(response.status, body),
          classifyStatus(response.status),
          response.status,
        );
      }

      try {
        return body.trim() === "" ? {} : JSON.parse(body);
      } catch (error) {
        throw new JulesApiError(
          "Jules API response is not valid JSON.",
          "invalid_response",
          response.status,
          error,
        );
      }
    } catch (error) {
      if (error instanceof JulesApiError) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        throw new JulesApiError(
          "Jules API request timed out.",
          "timeout",
          undefined,
          error,
        );
      }

      throw new JulesApiError(
        "Jules API network request failed.",
        "network",
        undefined,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
