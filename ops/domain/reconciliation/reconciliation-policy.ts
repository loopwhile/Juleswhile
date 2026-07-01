export const TASK_ID_PATTERN = /^TASK-[0-9]{3,}$/;

export const ACTIVE_LABELS = new Set([
	"state:queued",
	"state:dispatching",
	"state:running",
	"state:pr-opened",
	"state:validating",
	"state:correcting",
	"state:merge-ready",
	"state:deploying",
]);

export const QUOTA_LEDGER_MARKER = "<!-- juleswhile:quota-ledger -->";

export const DISPATCH_MARKER = "<!-- juleswhile:task-dispatch -->";

export const DISPATCH_INTENT_MARKER = "<!-- juleswhile:dispatch-intent -->";

export const DISPATCH_OUTCOME_MARKER = "<!-- juleswhile:dispatch-outcome -->";

export const SESSION_RECONCILIATION_MARKER =
	"<!-- juleswhile:session-reconciliation -->";

export const INCIDENT_MARKER_PREFIX = "<!-- juleswhile:incident:";

export const ACTIVE_JULES_STATES = new Set([
	"QUEUED",
	"PLANNING",
	"IN_PROGRESS",
]);

export const HUMAN_INTERVENTION_JULES_STATES = new Set([
	"AWAITING_PLAN_APPROVAL",
	"AWAITING_USER_FEEDBACK",
	"PAUSED",
]);

export const TRANSIENT_API_ERROR_KINDS = new Set([
	"rate_limited",
	"server",
	"timeout",
	"network",
]);
