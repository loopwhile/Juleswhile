export interface GitHubLabel {
  name?: string;
}

export interface GitHubIssueEvidence {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<string | GitHubLabel>;
  pull_request?: unknown;
}

export interface GitHubCommentEvidence {
  body: string | null;
  created_at: string;
  updated_at?: string;
}

export interface GitHubPullRequestEvidence {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  created_at: string;
  updated_at: string;
  head: {
    sha: string;
  };
}

export interface SessionObservation {
  name: string;
  id: string;
  url: string;
  state: string;
  createTime: string;
  updateTime: string;
}

export interface TaskContract {
  kind: "task" | "template";
  id: string;
  status: string;
  enabled: boolean;
  resource_locks: string[];
  retry_policy?: {
    timeout_minutes?: number;
  };
  metadata?: {
    issue_number?: number | null;
  };
}

export interface TaskIndex {
  tasks: TaskContract[];
}

export interface ProjectionInput {
  repository: string;
  taskIndex: TaskIndex;
  currentState: Record<string, unknown>;
  issues: GitHubIssueEvidence[];
  commentsByIssue: Record<number, GitHubCommentEvidence[]>;
  pullRequests: GitHubPullRequestEvidence[];
  sessionsByName: Record<string, SessionObservation>;
  runUrl?: string | null;
  syncReason?: string;
  sessionLookupErrors?: number;
}

export interface ProjectionDrift {
  stateLabelConflicts: Array<{
    taskId: string;
    issueNumber: number;
    labels: string[];
    selectedStatus: string;
  }>;
  missingCanonicalIssues: Array<{
    taskId: string;
    issueNumber: number | null;
  }>;
  supersededIssues: Array<{
    number: number;
    title: string;
    stateLabels: string[];
  }>;
  manifestMismatches: Array<{
    taskId: string;
    issueNumber: number;
    manifestStatus: string;
    projectedStatus: string;
  }>;
  issueLifecycleMismatches: Array<{
    taskId: string;
    issueNumber: number;
    issueState: string;
    projectedStatus: string;
  }>;
}

export interface ProjectionResult {
  changed: boolean;
  observedAt: string;
  projectState: Record<string, unknown>;
  drift: ProjectionDrift;
}
