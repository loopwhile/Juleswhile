# Juleswhile 운영자 가이드

## 1. 목적

이 문서는 Juleswhile 템플릿을 새로운 프로젝트에 적용하고, GitHub와 Google Jules를 이용해 실제 프로젝트를 운영하는 전체 절차를 설명한다.

완료 목표:

```text
Juleswhile 복제
→ Template Runtime 초기화
→ 새 GitHub 저장소 연결
→ Jules GitHub App 연결
→ Jules API Key와 Source 등록
→ Netlify 연결
→ Secret과 Variable 등록
→ 로컬 및 Workflow 검증
→ Guarded Automation 활성화
→ Project Goal Issue 생성
→ Planner가 WBS와 TASK 생성
→ Jules가 TASK를 하나씩 수행
→ PR Validation
→ Custom Auto Merge
→ Netlify Production 검증
→ TASK 완료
→ 다음 TASK 반복
```

---

# 2. 운영 모델

## 2.1 사람의 역할

운영자는 다음을 담당한다.

* 프로젝트 최상위 목표 정의
* 비용, 일정, 제품과 보안 정책 결정
* 민감 작업 승인
* Draft PR과 계약 위반 PR 검토
* BLOCKED TASK 해결
* Unknown Dispatch 결과 판단
* 자동화 중지와 재개
* 프로젝트 출시와 종료 판단

## 2.2 Jules의 역할

Jules는 할당된 TASK 안에서 다음을 수행한다.

* 프로젝트 기획
* 요구사항 분석
* 리서치
* 시스템과 데이터 설계
* UI/UX 설계
* 코드 구현
* 테스트 작성
* 검증 명령 실행
* 임시 브랜치 생성
* Pull Request 생성

Jules는 다음 TASK를 스스로 선택하지 않는다.

## 2.3 GitHub Actions의 역할

GitHub Actions는 다음을 담당한다.

* Goal Issue 감지
* Planner Session 생성
* TASK Issue 생성과 동기화
* 다음 TASK 선택
* Quota 예약
* Dispatch Intent 기록
* Jules Session 생성
* PR 계약과 품질 검증
* 자동 병합 정책 평가
* Production 배포 확인
* TASK 완료
* 고착 상태 복구
* Runtime State Projection
* main 무결성 감사

## 2.4 상태 권위

Runtime 상태의 권위는 GitHub Issues와 Pull Requests다.

```text
GitHub Issues / Pull Requests
        ↓
Runtime Evidence
        ↓
Reconciler
        ↓
ops/state/project-state.json
```

`ops/tasks/task-index.yaml`은 TASK 계약과 의존성 Manifest다.

---

# 3. 사전 준비

필수 계정:

* GitHub
* Google Jules
* Jules API 사용 가능 Google 계정
* Netlify

필수 로컬 도구:

```bash
git --version
gh --version
node --version
npm --version
jq --version
python3 --version
```

권장 버전:

```text
Node.js: 22 이상
npm: 10 이상
GitHub CLI: gh auth login 완료
```

로그인 확인:

```bash
gh auth status
```

---

# 4. 새 프로젝트 값 결정

```bash
export TEMPLATE_REPO="https://github.com/loopwhile/Juleswhile.git"

export PROJECT_DIR="my-project"
export PROJECT_ID="my-project"
export PROJECT_NAME="My Project"

export GITHUB_OWNER="YOUR_GITHUB_ID"
export GITHUB_REPO="my-project"
export REPOSITORY="${GITHUB_OWNER}/${GITHUB_REPO}"
```

규칙:

* `PROJECT_ID`: 소문자 영문, 숫자, 하이픈
* `PROJECT_DIR`: 로컬 폴더 이름
* `PROJECT_NAME`: 사용자에게 표시할 프로젝트 이름
* `REPOSITORY`: `OWNER/REPOSITORY`

---

# 5. 템플릿 복제와 Git 초기화

```bash
git clone "$TEMPLATE_REPO" "$PROJECT_DIR"
cd "$PROJECT_DIR"
```

기존 Git 이력 제거:

```bash
rm -rf .git

git init
git branch -M main
```

확인:

```bash
git status
git branch --show-current
```

예상:

```text
main
```

---

# 6. Bootstrap Runtime 초기화

Juleswhile 원본에는 Control Plane과 Production E2E 검증 기록이 들어 있다.

새 프로젝트에서는 반드시 다음을 초기화한다.

* 구축 검증 TASK
* Goal Issue 연결
* TASK Issue 연결
* Jules Session Evidence
* Active Pull Requests
* Resource Locks
* Quota 사용량
* Jules Source
* Runtime Projection
* Production Pilot 보고서
* Package 이름

직접 터미널에 `source`하지 말고 스크립트 파일로 실행한다.

```bash
cat > /tmp/bootstrap-juleswhile-project.sh <<'BASH'
#!/usr/bin/env bash

set -Eeuo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${PROJECT_NAME:?PROJECT_NAME is required}"
: "${GITHUB_OWNER:?GITHUB_OWNER is required}"
: "${GITHUB_REPO:?GITHUB_REPO is required}"
: "${REPOSITORY:?REPOSITORY is required}"

node <<'NODE'
import {
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  parse,
  stringify,
} from "yaml";

const now = new Date().toISOString();

const {
  PROJECT_ID: projectId,
  PROJECT_NAME: projectName,
  GITHUB_OWNER: owner,
  GITHUB_REPO: repo,
  REPOSITORY: repository,
} = process.env;

const taskPath = "ops/tasks/task-index.yaml";

const taskIndex = parse(
  readFileSync(taskPath, "utf8"),
);

const templates = (taskIndex.tasks ?? [])
  .filter((task) => task.kind === "template")
  .map((task) => ({
    ...task,
    status: "TEMPLATE",
    enabled: false,
    metadata: {
      ...(task.metadata ?? {}),
      goal_issue_number: null,
      issue_number: null,
      updated_at: now,
    },
  }));

taskIndex.project_id = projectId;
taskIndex.generated_at = now;
taskIndex.updated_at = now;
taskIndex.tasks = templates;

writeFileSync(
  taskPath,
  stringify(taskIndex, {
    lineWidth: 100,
  }),
  "utf8",
);

const statePath =
  "ops/state/project-state.json";

const state = JSON.parse(
  readFileSync(statePath, "utf8"),
);

state.projectId = projectId;
state.status = "bootstrap";
state.phase = "bootstrap";
state.primaryBranch = "main";

state.repository = {
  fullName: repository,
  htmlUrl:
    `https://github.com/${owner}/${repo}`,
  julesSourceName: null,
};

state.projectGoal = null;

state.automation = {
  enabled: false,
  contentEnabled: false,
  netlifyStatusEnabled: true,
  mode: "guarded",
  pausedReason:
    "Initial bootstrap. Enable automation only after GitHub, Jules and Netlify validation.",
};

state.taskSummary = {
  total: 0,
  draft: 0,
  ready: 0,
  queued: 0,
  dispatching: 0,
  running: 0,
  prOpened: 0,
  validating: 0,
  correcting: 0,
  mergeReady: 0,
  merged: 0,
  deploying: 0,
  completed: 0,
  failed: 0,
  timeout: 0,
  retryWait: 0,
  blocked: 0,
  cancelled: 0,
  templates: templates.length,
};

state.runtime = {
  activeSessions: [],
  activePullRequests: [],
  resourceLocks: [],
  lastReconciledAt: null,
};

state.quotas.date = null;
state.quotas.maxConcurrent = 1;
state.quotas.used = {
  newTasks: 0,
  corrections: 0,
  maintenance: 0,
  total: 0,
};

state.lastEvent = null;
state.createdAt = now;
state.updatedAt = now;

writeFileSync(
  statePath,
  `${JSON.stringify(state, null, 2)}\n`,
  "utf8",
);

const packagePath = "package.json";

const packageJson = JSON.parse(
  readFileSync(packagePath, "utf8"),
);

packageJson.name = projectId;
packageJson.description =
  `${projectName} project powered by Juleswhile.`;

writeFileSync(
  packagePath,
  `${JSON.stringify(packageJson, null, 2)}\n`,
  "utf8",
);
NODE

rm -f \
  docs/01_overview/juleswhile-smoke-test.md \
  docs/01_overview/juleswhile-smoke-test-result.md \
  docs/07_operations/live-jules-pilot-2026-06-29.md

rm -rf dist

npm ci
npm run ci

echo
echo "Bootstrap reset completed."
BASH

chmod +x /tmp/bootstrap-juleswhile-project.sh

bash /tmp/bootstrap-juleswhile-project.sh
```

검증:

```bash
git status
git diff --check
git diff --stat
npm run validate:task-graph
```

예상 TASK 상태:

```text
tasks: 0
templates: 1
ready: 0
blocked: 0
```

`PROJECT_GOAL.md`는 템플릿 상태를 유지한다.

실제 프로젝트 Goal은 Goal Issue와 Planner PR을 통해 작성된다.

---

# 7. 새 GitHub 저장소 생성

빈 저장소를 만든다.

```bash
gh repo create "$REPOSITORY" \
  --private \
  --description "$PROJECT_NAME"
```

Remote 연결:

```bash
git remote add origin \
  "https://github.com/${REPOSITORY}.git"
```

Bootstrap 초기 커밋:

```bash
git add .

git commit \
  -m "chore: initialize ${PROJECT_NAME} from Juleswhile"

git push -u origin main
```

이 초기 Push 이후부터는 변경을 Pull Request로 제출한다.

---

# 8. GitHub Actions 권한

GitHub 저장소에서 다음을 확인한다.

```text
Settings
→ Actions
→ General
→ Workflow permissions
```

필요 권한:

```text
Read and write permissions
```

Juleswhile Workflow는 다음 변경 권한이 필요하다.

* Issue 라벨
* Issue 댓글
* Pull Request 라벨
* Repository Dispatch
* Pull Request 병합
* 작업 브랜치 삭제
* TASK 완료 처리

---

# 9. Main 보호 정책

권장 규칙:

* Pull Request를 통한 변경
* Required Status Checks
* Force Push 금지
* Branch 삭제 금지
* 대화 해결 요구
* 병합 후 작업 브랜치 삭제

GitHub 요금제나 private repository 정책으로 서버 측 Ruleset 강제가 제한될 수 있다.

이 경우 `09 · Main Integrity Audit`는 탐지 통제 역할을 한다.

탐지 통제는 서버 측 차단과 동일하지 않다.

---

# 10. Jules GitHub App 연결

Jules 웹 앱에서 다음을 수행한다.

1. Jules 로그인
2. GitHub 연결
3. Jules GitHub App 설치
4. Repository Access 수정
5. 새 저장소 추가
6. Jules에서 저장소 확인
7. Jules가 `main`을 읽을 수 있는지 확인

API Key만 등록해도 GitHub 저장소 접근 권한이 자동으로 생기지는 않는다.

---

# 11. Jules API Key

Jules Settings에서 API Key를 생성한다.

터미널에서 임시 입력:

```bash
read -rsp "Jules API Key: " JULES_API_KEY
echo
```

GitHub Secret 등록:

```bash
printf '%s' "$JULES_API_KEY" |
  gh secret set JULES_API_KEY \
    --repo "$REPOSITORY"
```

등록 확인:

```bash
gh secret list \
  --repo "$REPOSITORY"
```

검증 후 로컬 변수 제거:

```bash
unset JULES_API_KEY
```

Secret 값이 다시 출력되지 않는 것이 정상이다.

---

# 12. Jules Source 확인

Source 이름을 추측하지 않는다.

```bash
curl \
  --fail \
  --silent \
  --show-error \
  --header "x-goog-api-key: ${JULES_API_KEY}" \
  "https://jules.googleapis.com/v1alpha/sources" |
  jq '
    .sources[]? | {
      name,
      githubRepo
    }
  '
```

예시:

```json
{
  "name": "sources/github/OWNER/REPOSITORY",
  "githubRepo": {
    "owner": "OWNER",
    "repo": "REPOSITORY"
  }
}
```

정확한 값을 등록한다.

```bash
gh variable set JULES_SOURCE_NAME \
  --repo "$REPOSITORY" \
  --body "sources/github/OWNER/REPOSITORY"
```

확인:

```bash
gh variable list \
  --repo "$REPOSITORY"
```

REST 확인:

```bash
gh api \
  "repos/${REPOSITORY}/actions/variables?per_page=100" |
  jq '
    .variables[]
    | select(.name == "JULES_SOURCE_NAME")
  '
```

---

# 13. Repository Variables

초기 안전값:

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set JULES_MAX_CONCURRENCY \
  --repo "$REPOSITORY" \
  --body "1"

gh variable set JULES_DAILY_NEW_TASK_BUDGET \
  --repo "$REPOSITORY" \
  --body "65"

gh variable set JULES_DAILY_CORRECTION_BUDGET \
  --repo "$REPOSITORY" \
  --body "20"

gh variable set JULES_DAILY_MAINTENANCE_BUDGET \
  --repo "$REPOSITORY" \
  --body "10"

gh variable set JULES_DAILY_RESERVE \
  --repo "$REPOSITORY" \
  --body "5"

gh variable set PR_MERGE_METHOD \
  --repo "$REPOSITORY" \
  --body "squash"

gh variable set ALLOW_FORK_PRS \
  --repo "$REPOSITORY" \
  --body "false"
```

Reconciler 기본값:

```bash
gh variable set STALE_DISPATCHING_MINUTES \
  --repo "$REPOSITORY" \
  --body "20"

gh variable set STALE_RUNNING_MINUTES \
  --repo "$REPOSITORY" \
  --body "180"

gh variable set STALE_VALIDATING_MINUTES \
  --repo "$REPOSITORY" \
  --body "60"

gh variable set SESSION_TIMEOUT_MINUTES \
  --repo "$REPOSITORY" \
  --body "240"

gh variable set DEFAULT_MAX_CORRECTIONS \
  --repo "$REPOSITORY" \
  --body "2"
```

확인:

```bash
gh variable list \
  --repo "$REPOSITORY"
```

GitHub CLI 버전에 따라 `gh variable get`이 없을 수 있다.

개별 값은 REST API로 확인한다.

```bash
VARIABLES_JSON="$(
  gh api \
    "repos/${REPOSITORY}/actions/variables?per_page=100"
)"

echo "$VARIABLES_JSON" |
  jq -r '
    .variables[]
    | {
        name,
        value
      }
  '
```

---

# 14. Netlify 연결

Netlify에서 다음을 수행한다.

1. 새 Project 생성
2. GitHub Provider 연결
3. 새 저장소 선택
4. Production Branch를 `main`으로 설정
5. Build Command 설정
6. Publish Directory 설정
7. 첫 Deploy 실행

기본 설정:

```text
Production Branch: main
Build Command: npm run build
Publish Directory: dist
```

GitHub Secrets:

```bash
gh secret set NETLIFY_AUTH_TOKEN \
  --repo "$REPOSITORY"

gh secret set NETLIFY_SITE_ID \
  --repo "$REPOSITORY"
```

Repository Variables:

```bash
gh variable set NETLIFY_STATUS_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"

gh variable set NETLIFY_PRODUCTION_BRANCH \
  --repo "$REPOSITORY" \
  --body "main"

gh variable set NETLIFY_POLL_ATTEMPTS \
  --repo "$REPOSITORY" \
  --body "20"

gh variable set NETLIFY_POLL_INTERVAL_SECONDS \
  --repo "$REPOSITORY" \
  --body "15"
```

성공 기준:

```text
main Push
→ Netlify Build
→ Production Deploy ready
→ Production URL 접근 가능
```

---

# 15. 로컬 검증

```bash
npm ci
npm run ci
git diff --check
git status
```

`npm run ci`에는 다음 검증이 포함된다.

* Biome lint
* Workflow supply-chain validation
* JSON Schema
* TASK graph
* TypeScript typecheck
* Unit tests
* Production build

---

# 16. Workflow Dry Run

## 16.1 Next TASK

```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

## 16.2 Reconciler

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

실행 확인:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --limit 10
```

---

# 17. Core Automation 활성화 기준

다음 조건을 모두 충족해야 한다.

* Jules GitHub App 저장소 접근 가능
* `JULES_API_KEY` Secret 존재
* `JULES_SOURCE_NAME` 정확
* Netlify Production 연결 성공
* `npm run ci` 성공
* 모든 외부 Action SHA pin
* State label conflict 없음
* Missing canonical TASK Issue 없음
* Unresolved Dispatch Intent 없음
* Duplicate Jules Session 없음
* Active Session 없음
* Active TASK PR 없음
* Resource Lock 없음
* Content Automation 비활성
* Max Concurrency 1

---

# 18. Committed Project State 활성화

Repository Variable만 활성화하고 committed state를 비활성 상태로 남기지 않는다.

새 브랜치에서 다음을 실행한다.

```bash
git switch -c chore/enable-guarded-automation
```

```bash
node <<'NODE'
import {
  readFileSync,
  writeFileSync,
} from "node:fs";

const path =
  "ops/state/project-state.json";

const state = JSON.parse(
  readFileSync(path, "utf8"),
);

state.status = "active";
state.phase = "goal-intake";

state.automation.enabled = true;
state.automation.contentEnabled = false;
state.automation.netlifyStatusEnabled = true;
state.automation.mode = "guarded";
state.automation.pausedReason = null;

state.quotas.maxConcurrent = 1;
state.updatedAt = new Date().toISOString();

writeFileSync(
  path,
  `${JSON.stringify(state, null, 2)}\n`,
  "utf8",
);
NODE
```

검증:

```bash
npm run ci
git diff --check
```

커밋하고 Pull Request를 생성한다.

Repository Variable은 해당 PR이 병합되고 Production 배포가 확인된 뒤 활성화한다.

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"

gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set JULES_MAX_CONCURRENCY \
  --repo "$REPOSITORY" \
  --body "1"
```

REST 검증:

```bash
gh api \
  "repos/${REPOSITORY}/actions/variables?per_page=100" |
  jq '
    [
      .variables[]
      | select(
          .name == "AUTOMATION_ENABLED" or
          .name == "CONTENT_AUTOMATION_ENABLED" or
          .name == "JULES_MAX_CONCURRENCY"
        )
    ]
  '
```

---

# 19. 활성화 후 Smoke Test

## 19.1 Next TASK no-op

READY TASK가 없는 상태에서 성공하고 아무 TASK도 Dispatch하지 않아야 한다.

```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="false" \
  -f force="false"
```

## 19.2 Reconciler apply

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="false" \
  -f force="false"
```

예상:

```text
State conflicts: 0
Missing canonical Issues: 0
Manifest mismatches: 0
Session lookup errors: 0
```

## 19.3 Content Schedule disabled no-op

```bash
gh workflow run "07-content-schedule.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="false" \
  -f force="false"
```

`CONTENT_AUTOMATION_ENABLED=false`이면 성공 상태의 no-op으로 종료되어야 한다.

---

# 20. Project Goal Issue

GitHub에서 다음으로 이동한다.

```text
Issues
→ New issue
→ Project Goal
```

제목:

```text
[GOAL] 프로젝트 목표
```

Goal Issue는 사람이 TASK 전체를 작성하는 문서가 아니다.

다음 경계와 결과를 정의한다.

* 무엇을 만들 것인가
* 누구를 위한 것인가
* 어떤 문제를 해결하는가
* 최종 산출물은 무엇인가
* 어떤 기능이 필수인가
* 무엇을 하지 않는가
* 어떤 기술·비용·일정 제한이 있는가
* 어떤 테스트를 통과해야 하는가
* 어떤 작업을 AI가 자동 수행할 수 있는가
* 어떤 작업에 사람 승인이 필요한가
* 어디에 배포하는가
* 어떤 위험이 있는가

Secret과 개인정보는 입력하지 않는다.

---

# 21. Planner 결과 검토

Planner는 다음 파일을 생성하거나 수정해야 한다.

* `PROJECT_GOAL.md`
* 프로젝트 개요
* 범위와 제외 범위
* WBS
* `ops/tasks/task-index.yaml`
* `ops/state/project-state.json`
* TASK 의존성
* 위험 요소
* 검증 계획

Planner PR 제목:

```text
[GOAL-N] Initialize project plan and TASK graph
```

Planner PR 본문:

```markdown
<!-- juleswhile:task-pr -->

Goal Issue: #N
```

검토 항목:

* Goal을 잘못 해석하지 않았는가
* 지나치게 큰 TASK가 없는가
* TASK dependency cycle이 없는가
* 허용 경로가 분리됐는가
* Resource Lock이 적절한가
* 민감 작업이 사람 승인으로 분류됐는가
* 검증 명령이 구체적인가
* 아직 실행하지 않은 TASK가 완료로 표시되지 않았는가

---

# 22. TASK PR 계약

TASK PR 제목:

```text
[TASK-123] TASK 제목
```

TASK PR 본문:

```markdown
<!-- juleswhile:task-pr -->

TASK Issue: #123
```

Draft PR은 PR Validation 대상이 아니다.

계약을 확인한 뒤 Ready로 전환한다.

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

---

# 23. PR Validation

`03 · PR Validation`은 다음을 확인한다.

* PR 제목 형식
* PR marker
* Goal 또는 TASK Issue 참조
* Base Branch `main`
* Fork 정책
* 변경 파일 존재
* Control Plane 변경
* 필수 파일 존재
* JSON Schema
* TASK graph
* TASK file scope
* Lint
* Typecheck
* Tests
* Build
* Secret 의심 패턴
* Git diff integrity

성공 라벨:

```text
juleswhile:managed
validation:passed
```

실패 라벨:

```text
validation:failed
```

Control Plane 변경:

```text
risk:control-plane
human-approval-required
```

---

# 24. 사람 승인

사람 승인이 필요한 PR은 다음 중 하나를 충족해야 한다.

* 실제 GitHub Review `APPROVED`
* `approval:owner-approved` 라벨

REST로 라벨 적용:

```bash
jq -n \
  '{labels:["approval:owner-approved"]}' |
gh api \
  --method POST \
  "repos/${REPOSITORY}/issues/<PR_NUMBER>/labels" \
  --input -
```

라벨은 실제 검토 후에만 적용한다.

---

# 25. Custom Auto Merge

병합 조건:

* PR OPEN
* Draft 아님
* Base Branch `main`
* PR marker 존재
* `juleswhile:managed`
* `validation:passed`
* 차단 라벨 없음
* Merge Conflict 없음
* 사람 승인 조건 충족
* Exact head SHA 일치

수동 재평가:

```bash
gh workflow run "04-auto-merge.yml" \
  --repo "$REPOSITORY" \
  -f pr_number="<PR_NUMBER>" \
  -f dry_run="false" \
  -f force="false"
```

직접 `gh pr merge`로 정책을 우회하지 않는다.

---

# 26. Production 완료 전이

TASK PR이 병합되면 즉시 완료하지 않고 `state:deploying`으로 전환한다.

```text
PR merged
→ state:deploying
→ Netlify Production 확인
→ state:completed
→ Issue closed
→ deployment:ready
```

Netlify Production 검증 실패 시 TASK는 완료하지 않는다.

---

# 27. Next TASK Selector

`05 · Next TASK`는 다음을 확인한다.

* READY TASK
* 의존성 충족
* 동시 실행 상한
* 일일 Jules 예산
* Resource Lock
* 충돌 TASK
* 기존 실행 Session
* 기존 TASK Issue
* 기존 Dispatch Evidence

실행 가능한 TASK 하나만 선택한다.

기본 동시 실행량은 `1`이다.

---

# 28. Unknown Dispatch Outcome

다음 오류는 결과가 불명확할 수 있다.

* Timeout
* Connection reset
* HTTP 408
* HTTP 425
* HTTP 5xx
* 응답 파싱 전 연결 종료

이 경우 절대로 즉시 재Dispatch하지 않는다.

필수 순서:

1. TASK Issue 댓글 확인
2. Quota reservation 상태 확인
3. Dispatch intent 확인
4. Dispatch outcome 확인
5. Canonical Session marker 확인
6. Jules API Session 조회
7. Reconciler Dry Run
8. 필요 시 Reconciler Apply

중복 Session보다 일시적 정지가 안전하다.

---

# 29. Reconciler

Dry Run:

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

Apply:

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="false" \
  -f force="false"
```

자동화가 비활성화된 상태에서 제한적으로 적용해야 한다면 원인을 확인한 뒤 `force=true`를 사용한다.

Reconciler 점검 항목:

* 오래된 `state:dispatching`
* 오래된 `state:running`
* 오래된 `state:validating`
* Jules Session 상태
* Session timeout
* Dispatch Intent
* Quota Ledger
* 중복 TASK Issue
* Runtime State Projection
* 다음 TASK 예약 필요 여부

---

# 30. Content Schedule

기본값:

```text
CONTENT_AUTOMATION_ENABLED=false
```

비활성 상태에서는 Schedule이 성공 no-op으로 끝나야 한다.

실제로 사용할 때 필요한 항목:

* 유효한 Content TASK Template
* `CONTENT_TASK_TEMPLATE_ID`
* 콘텐츠 유형
* 주제
* 기간 Key
* 중복 방지 정책
* 출처 정책
* 게시 승인 정책

활성화:

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

Core Automation과 별도로 관리한다.

---

# 31. 운영 상태 확인

최근 Workflow:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --limit 20
```

Goal Issues:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "juleswhile:goal" \
  --state all
```

TASK Issues:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "juleswhile:task" \
  --state all
```

실행 중 TASK:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "state:running" \
  --state open
```

차단 TASK:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "state:blocked" \
  --state open
```

열린 PR:

```bash
gh pr list \
  --repo "$REPOSITORY" \
  --state open
```

PR Check:

```bash
gh pr checks <PR_NUMBER> \
  --repo "$REPOSITORY"
```

Variables:

```bash
gh variable list \
  --repo "$REPOSITORY"
```

---

# 32. 자동화 중지

Core Automation 중지:

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

Content Schedule 중지:

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

주의:

* 실행 중 Jules Session은 계속 작업할 수 있다.
* 열린 PR Validation은 계속될 수 있다.
* 열린 PR Auto Merge를 막으려면 `do-not-merge`를 적용한다.

```bash
jq -n \
  '{labels:["do-not-merge"]}' |
gh api \
  --method POST \
  "repos/${REPOSITORY}/issues/<PR_NUMBER>/labels" \
  --input -
```

---

# 33. 자동화 재개

재개 전 확인:

* Unknown Dispatch 없음
* Active Session 파악
* 열린 PR 파악
* Resource Lock 파악
* Quota 남은 양 확인
* Reconciler Dry Run 성공

재개:

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

READY TASK가 있지만 이벤트가 없다면:

```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f source_task_id="" \
  -f dry_run="false" \
  -f force="false"
```

---

# 34. 장애 복구

## 34.1 Goal Intake 실패

주요 원인:

* 제목이 `[GOAL]`로 시작하지 않음
* `AUTOMATION_ENABLED=false`
* `JULES_API_KEY` 없음
* `JULES_SOURCE_NAME` 없음
* Jules App 저장소 권한 없음
* Source가 다른 저장소를 가리킴
* 기존 Planner Session 존재

## 34.2 TASK Dispatch 실패

주요 원인:

* TASK Issue 번호 불일치
* TASK가 READY가 아님
* Jules API Key 오류
* Source 오류
* 기존 Session 존재
* 미해결 Dispatch Intent 존재
* Quota 초과
* 동시성 초과
* Resource Lock 충돌

## 34.3 Draft PR

```bash
gh pr view <PR_NUMBER> \
  --repo "$REPOSITORY" \
  --json number,title,isDraft,body,files,url
```

계약 확인 후:

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

## 34.4 PR Validation 실패

```bash
gh pr checks <PR_NUMBER> \
  --repo "$REPOSITORY"
```

원칙:

* 실패한 검증을 삭제하지 않는다.
* CI를 우회하지 않는다.
* TASK 허용 범위를 넓혀 실패를 숨기지 않는다.
* 가능한 경우 동일 PR에서 수정한다.
* Correction 횟수 제한을 지킨다.

## 34.5 Auto Merge 차단

주요 차단 라벨:

```text
do-not-merge
state:blocked
security-review-required
merge:manual-only
validation:failed
human-approval-required
state:merge-blocked
```

## 34.6 Netlify 실패

확인 항목:

* Netlify Site ID
* Netlify Auth Token
* Production Branch
* Build Command
* Publish Directory
* Merge Commit과 Deploy Commit 일치
* Deploy 상태
* Build 로그

---

# 35. 일일 운영 체크리스트

```text
[ ] state:failed TASK가 없는가?
[ ] state:blocked TASK가 없는가?
[ ] 오래된 state:running TASK가 없는가?
[ ] 열린 Draft PR이 없는가?
[ ] validation:failed PR이 없는가?
[ ] state:merge-blocked PR이 없는가?
[ ] Unknown Dispatch Outcome이 없는가?
[ ] Netlify Production이 ready인가?
[ ] Jules 일일 사용량이 예산 안에 있는가?
[ ] main과 Production이 일치하는가?
[ ] Secret 노출 사고가 없는가?
[ ] Reconciler가 정상 실행됐는가?
```

---

# 36. 프로젝트 목표 변경

기존 목표를 파일에서 조용히 수정하지 않는다.

중대한 목표 변경은 새 Goal Issue로 작성한다.

```text
[GOAL] 기존 프로젝트에 새로운 목표 추가
```

명시할 내용:

* 기존 프로젝트와의 관계
* 변경 목표
* 영향 범위
* 마이그레이션
* 기존 TASK 취소 여부
* 새로운 위험
* 새로운 품질 기준
* 새로운 완료 조건

---

# 37. 프로젝트 종료

먼저 자동화를 중지한다.

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

확인:

```bash
gh pr list \
  --repo "$REPOSITORY" \
  --state open

gh issue list \
  --repo "$REPOSITORY" \
  --state open
```

최종 상태:

```json
{
  "status": "completed",
  "phase": "completed"
}
```

최종 변경도 Pull Request로 제출한다.

---

# 38. 정상 운영 완료 기준

```text
GitHub
- main 하나만 영구 브랜치
- Jules App 연결
- Actions 쓰기 권한
- Secret과 Variable 설정
- PR Validation 정상
- Custom Auto Merge 정상
- Main Integrity Audit 정상

Jules
- API Key 유효
- Source 유효
- 저장소 접근 가능
- One Session, One TASK
- 중복 Session 없음

Netlify
- GitHub 저장소 연결
- Production Branch main
- Build 성공
- Merge Commit과 Deploy Commit 일치

Automation
- AUTOMATION_ENABLED=true
- CONTENT_AUTOMATION_ENABLED=false 또는 명시적 활성화
- JULES_MAX_CONCURRENCY=1
- Goal Intake 정상
- TASK Dispatch 정상
- Next TASK 정상
- Reconciler 정상
- Content Schedule disabled no-op 정상

Project
- PROJECT_GOAL.md가 Goal Issue를 반영
- TASK Manifest 유효
- Runtime Projection 정합
- 완료 TASK Issue 종료
- Active Session, PR, Lock 정합
- main과 Production 일치
```

Juleswhile의 운영 목표:

```text
사람은 목표와 안전 경계를 정의한다.
Planner는 목표를 검증 가능한 TASK로 분해한다.
Jules는 TASK를 하나씩 수행한다.
GitHub Actions는 선택, 검증, 병합과 상태 전이를 통제한다.
Netlify는 main의 결과를 Production으로 보여준다.
실패하거나 결과가 불명확하면 시스템은 멈추고 사람에게 통제권을 돌려준다.
```
