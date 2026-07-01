import type {
  GitHubCommentEvidence,
} from "./projection-contract.js";
import {
  parseTimestamp,
  readField,
} from "./projection-state-tools.js";

const QUOTA_LEDGER_MARKER =
  "<!-- juleswhile:quota-ledger -->";

export function projectQuotaUsage(
  commentsByIssue: Record<
    number,
    GitHubCommentEvidence[]
  >,
  currentQuotas: Record<string, unknown>,
): Record<string, unknown> {
  const events = Object.values(commentsByIssue)
    .flat()
    .map((comment) => {
      const body = comment.body ?? "";

      if (!body.includes(QUOTA_LEDGER_MARKER)) {
        return null;
      }

      const reservationKey =
        readField(body, "reservation_key");
      const status =
        readField(body, "status").toLowerCase();
      const category =
        readField(body, "category").toLowerCase();
      const date =
        readField(body, "date");

      if (
        reservationKey === "" ||
        ![
          "new",
          "correction",
          "maintenance",
        ].includes(category)
      ) {
        return null;
      }

      return {
        reservationKey,
        status,
        category,
        date,
        createdAt: comment.created_at,
      };
    })
    .filter(
      (
        event,
      ): event is NonNullable<typeof event> =>
        event !== null,
    )
    .sort(
      (left, right) =>
        parseTimestamp(left.createdAt) -
        parseTimestamp(right.createdAt),
    );

  const latestByReservation =
    new Map<string, (typeof events)[number]>();

  for (const event of events) {
    latestByReservation.set(
      event.reservationKey,
      event,
    );
  }

  const active = [
    ...latestByReservation.values(),
  ].filter((event) =>
    ["reserved", "committed"].includes(
      event.status,
    ),
  );

  const dates = active
    .map((event) => event.date)
    .filter((date) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date),
    )
    .sort();

  const projectedDate =
    dates.at(-1) ?? null;

  const currentDay =
    projectedDate === null
      ? []
      : active.filter(
          (event) =>
            event.date === projectedDate,
        );

  const used = {
    newTasks: currentDay.filter(
      (event) => event.category === "new",
    ).length,
    corrections: currentDay.filter(
      (event) =>
        event.category === "correction",
    ).length,
    maintenance: currentDay.filter(
      (event) =>
        event.category === "maintenance",
    ).length,
    total: currentDay.length,
  };

  return {
    ...currentQuotas,
    date: projectedDate,
    used,
  };
}
