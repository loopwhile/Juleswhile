import type {
  ProjectionInput,
} from "./projection-contract.js";

export function readField(
  body: string,
  field: string,
): string {
  const match = body.match(
    new RegExp(`^${field}:\\s*(.*)$`, "im"),
  );

  return match?.[1]?.trim() ?? "";
}

export function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export function maxObservedAt(
  input: ProjectionInput,
): string {
  const timestamps: number[] = [];

  const add = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }

    const parsed = parseTimestamp(value);

    if (parsed > 0) {
      timestamps.push(parsed);
    }
  };

  add(input.currentState.createdAt);
  add(input.currentState.updatedAt);

  for (const issue of input.issues) {
    add(issue.created_at);
    add(issue.updated_at);
  }

  for (const comments of Object.values(
    input.commentsByIssue,
  )) {
    for (const comment of comments) {
      add(comment.created_at);
      add(comment.updated_at);
    }
  }

  for (const pullRequest of input.pullRequests) {
    add(pullRequest.created_at);
    add(pullRequest.updated_at);
  }

  for (const session of Object.values(
    input.sessionsByName,
  )) {
    add(session.createTime);
    add(session.updateTime);
  }

  const latest = Math.max(...timestamps, 0);

  if (latest === 0) {
    throw new Error(
      "Projection에 사용할 유효한 관측 시간이 없습니다.",
    );
  }

  return new Date(latest).toISOString();
}

export function semanticState(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const clone = structuredClone(value);

  Reflect.deleteProperty(clone, "updatedAt");
  Reflect.deleteProperty(clone, "lastEvent");

  const runtime = clone.runtime;

  if (
    typeof runtime === "object" &&
    runtime !== null &&
    !Array.isArray(runtime)
  ) {
    Reflect.deleteProperty(
      runtime as Record<string, unknown>,
      "lastReconciledAt",
    );
  }

  const projection = clone.projection;

  if (
    typeof projection === "object" &&
    projection !== null &&
    !Array.isArray(projection)
  ) {
    const record =
      projection as Record<string, unknown>;

    Reflect.deleteProperty(
      record,
      "observedAt",
    );
    Reflect.deleteProperty(
      record,
      "generatedAt",
    );
    Reflect.deleteProperty(
      record,
      "evidenceDigest",
    );
    Reflect.deleteProperty(
      record,
      "workflowRunUrl",
    );
    Reflect.deleteProperty(
      record,
      "syncReason",
    );
  }

  return clone;
}

function canonicalValue(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      )
        .sort(([left], [right]) =>
          left.localeCompare(right),
        )
        .map(([key, entry]) => [
          key,
          canonicalValue(entry),
        ]),
    );
  }

  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(
    canonicalValue(value),
  );
}
