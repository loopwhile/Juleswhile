export const TASK_INDEX_PATH =
  "ops/tasks/task-index.yaml";

export const TASK_ID_PATTERN =
  /^TASK-[0-9]{3,}$/;

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

export const EXECUTABLE_STATUSES =
  new Set([
    "READY",
    "RETRY_WAIT",
  ]);

export const COMPLETED_STATUSES =
  new Set([
    "COMPLETED",
    "MERGED",
  ]);

export const QUOTA_LEDGER_MARKER =
  "<!-- juleswhile:quota-ledger -->";

export const LEGACY_DISPATCH_MARKER =
  "<!-- juleswhile:task-dispatch -->";

export interface CliOptions {
  responseFile: string;
  maxConcurrency: number;
  newTaskBudget: number;
  correctionBudget: number;
  maintenanceBudget: number;
  reserveBudget: number;
  sourceTaskId?: string;
  dryRun: boolean;
  reserve: boolean;
}

export interface TaskContract {
  kind: "task" | "template";
  id: string;
  title: string;
  role: string;
  type: string;
  status: string;
  priority: "P0" | "P1" | "P2" | "P3";
  enabled: boolean;
  depends_on: string[];
  risk_level: string;
  approval_policy: string;
  parallelizable: boolean;
  resource_locks: string[];
  conflicts_with: string[];
  metadata: {
    issue_number?: number | null;
  };
}

export interface TaskIndex {
  schema_version: number;
  project_id: string;
  tasks: TaskContract[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
  labels: Array<
    | string
    | {
        name?: string;
      }
  >;
}

export interface GitHubComment {
  body?: string | null;
  created_at: string;
}

export interface Candidate {
  task: TaskContract;
  issue: GitHubIssue;
}

export interface RuntimeQuotaUsage {
  newTasks: number;
  corrections: number;
  maintenance: number;
  total: number;
}

export interface QuotaLedgerEvent {
  event: string;
  status: string;
  date: string;
  category:
    | "new"
    | "correction"
    | "maintenance";
  taskId: string;
  issueNumber: number;
  reservationKey: string;
  createdAt: string;
}

export interface SelectionSummary {
  total: number;
  ready: number;
  running: number;
  blocked: number;
  completed: number;
  missingIssue: number;
  dependencyBlocked: number;
  resourceBlocked: number;
  quotaBlocked: number;
}

export interface SelectionResult {
  selected: boolean;
  taskId: string;
  issueNumber: number | null;
  reason: string;
  dryRun: boolean;
  reserved: boolean;
  sourceTaskId: string | null;
  summary: SelectionSummary;
  evaluatedAt: string;
}
