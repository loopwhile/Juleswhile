# Juleswhile

GitHub Issues, Google Jules, GitHub Actions, Pull Requests, CI와 Netlify를 결합한 **이벤트 드리븐 AI 프로젝트 실행 템플릿**이다.

사용자가 GitHub에 프로젝트 목표를 작성하면 Juleswhile은 목표를 검증 가능한 WBS와 TASK로 분해하고, 실행 가능한 TASK를 Google Jules Session에 하나씩 전달한다.

각 TASK 결과는 임시 브랜치와 Pull Request로 제출된다. PR 계약, 스키마, 테스트, 빌드와 병합 정책을 통과한 결과만 `main`에 반영되며, Netlify Production 배포가 확인된 뒤 TASK가 완료된다.

---

## 현재 검증 상태

Juleswhile Control Plane과 실제 Production 실행 경로는 검증을 완료했다.

```text
Control Plane                 구축 완료
Goal → Planner                검증 완료
TASK Manifest                 검증 완료
Next TASK Selector            검증 완료
Jules API Dispatch            검증 완료
Quota Reservation / Ledger    검증 완료
Duplicate Session Protection  검증 완료
PR Validation                 검증 완료
Custom Auto Merge             검증 완료
Netlify Production Tracking   검증 완료
Reconciler                    검증 완료
Runtime State Projection      검증 완료
Production E2E Pilot          검증 완료
```

현재 기본 운영 기준:

```text
Core Automation:      true
Content Automation:   false
Autonomy Mode:        guarded
Max Concurrency:      1
Permanent Branch:     main
State Authority:      GitHub Issues and Pull Requests
```

현재 저장소의 구축 검증 TASK는 다음 상태다.

```text
TASK total:       9
TASK completed:   9
TASK ready:       0
Active Sessions:  0
Active PRs:       0
Resource Locks:   0
```

---

## 검증된 전체 실행 흐름

```text
[GOAL] Issue
→ 01 · Goal Intake
→ Planner Jules Session
→ PROJECT_GOAL.md / WBS / TASK Manifest
→ Planner Pull Request
→ 03 · PR Validation
→ 04 · Auto Merge
→ main
→ 05 · Next TASK
→ TASK Issue 생성 또는 동기화
→ Quota Reservation
→ Dispatch Intent
→ 02 · Dispatch Jules TASK
→ Jules Session
→ TASK Pull Request
→ 03 · PR Validation
→ 04 · Auto Merge
→ main
→ 08 · Netlify Status
→ Production 검증
→ TASK Issue COMPLETED
→ 05 · Next TASK
→ 다음 READY TASK 반복
```

오래되거나 비정상적인 상태는 `06 · Reconciler`가 점검한다.

---

## 핵심 운영 원칙

### One Session, One TASK

하나의 Jules Session은 하나의 TASK만 처리한다.

### One Permanent Branch

영구 브랜치는 `main` 하나만 사용한다.

Jules와 운영자는 TASK별 임시 브랜치에서 작업하고 Pull Request로 결과를 제출한다.

### Pull Request Only

정상 운영이 시작된 이후에는 검증되지 않은 결과를 `main`에 직접 Push하지 않는다.

### GitHub Is the Control Plane

다음 항목이 프로젝트 제어 평면을 구성한다.

* GitHub Goal Issue
* GitHub TASK Issue
* Pull Request
* GitHub Actions
* TASK Manifest
* Runtime State Projection
* Quota Ledger
* Canonical Session Evidence

### Jules Is the Worker

Jules는 할당된 TASK를 수행한다.

Jules가 다음 TASK, 프로젝트 전체 상태, 병합 여부를 임의로 결정하지 않는다.

### CI Is the Quality Gate

AI가 작업을 완료했다고 주장하는 것과 검증된 완료를 구분한다.

### Production Is the Completion Gate

PR 병합만으로 TASK를 완료하지 않는다.

Netlify Production 배포가 확인된 뒤 TASK Issue를 `state:completed`로 전환한다.

### Guarded Autonomy

낮은 위험의 TASK는 자동 실행할 수 있지만 다음 작업은 사람 승인을 요구할 수 있다.

* 인증·인가 정책
* 결제 및 환불
* 개인정보와 사용자 데이터 삭제
* 파괴적 데이터베이스 변경
* Secret과 Credential 변경
* 도메인과 운영 인프라 변경
* 유료 자원 생성
* 보안 정책 변경
* 법률·의료·금융 결과 확정

---

## 상태 권위와 파일의 역할

### GitHub Issues와 Pull Requests

실제 Runtime 상태의 권위다.

예:

* TASK가 실행 중인지
* PR이 열려 있는지
* Production 배포가 완료됐는지
* TASK가 완료됐는지
* Canonical Jules Session이 존재하는지

### `ops/tasks/task-index.yaml`

TASK 계약과 의존성 그래프의 committed Manifest다.

### `ops/state/project-state.json`

GitHub Runtime 증거를 기반으로 생성한 committed Projection이다.

### `PROJECT_GOAL.md`

현재 프로젝트 목표의 committed snapshot이다.

새 프로젝트를 시작하기 전에는 템플릿이며, Goal Issue와 Planner PR을 통해 실제 프로젝트 내용으로 교체한다.

---

## 저장소 구조

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── project-goal.yml
│   └── workflows/
│       ├── 01-goal-intake.yml
│       ├── 02-dispatch-jules.yml
│       ├── 03-pr-validation.yml
│       ├── 04-auto-merge.yml
│       ├── 05-next-task.yml
│       ├── 06-reconciler.yml
│       ├── 07-content-schedule.yml
│       ├── 08-netlify-status.yml
│       └── 09-main-integrity-audit.yml
├── docs/
├── ops/
│   ├── roles/
│   ├── schemas/
│   ├── scripts/
│   ├── state/
│   │   └── project-state.json
│   └── tasks/
│       └── task-index.yaml
├── AGENTS.md
├── PROJECT_GOAL.md
├── README.md
├── operator-guide.md
└── package.json
```

---

## 새 프로젝트 빠른 시작

전체 절차는 [`operator-guide.md`](operator-guide.md)를 따른다.

### 1. 환경값 결정

```bash
export TEMPLATE_REPO="https://github.com/loopwhile/Juleswhile.git"

export PROJECT_DIR="my-project"
export PROJECT_ID="my-project"
export PROJECT_NAME="My Project"

export GITHUB_OWNER="YOUR_GITHUB_ID"
export GITHUB_REPO="my-project"
export REPOSITORY="${GITHUB_OWNER}/${GITHUB_REPO}"
```

권장 규칙:

```text
PROJECT_ID:   소문자 영문, 숫자, 하이픈
PROJECT_DIR:  로컬 디렉터리 이름
PROJECT_NAME: 사람이 읽는 프로젝트 이름
REPOSITORY:   OWNER/REPOSITORY
```

### 2. 템플릿 복제

```bash
git clone "$TEMPLATE_REPO" "$PROJECT_DIR"
cd "$PROJECT_DIR"
```

### 3. 기존 Git 이력 제거

```bash
rm -rf .git

git init
git branch -M main
```

### 4. Bootstrap 초기화

Juleswhile 원본 저장소에는 Production E2E 검증 기록이 포함되어 있다.

새 프로젝트에서는 다음 항목을 초기화해야 한다.

* Juleswhile 구축 검증 TASK
* 기존 Goal 연결
* Runtime Session
* Pull Request Projection
* Resource Lock
* Quota 사용량
* Production Pilot 보고서
* Repository 이름
* Jules Source
* Package 이름

정확한 초기화 명령은 [`operator-guide.md`](operator-guide.md)의 **Bootstrap 초기화** 절을 사용한다.

### 5. 새 GitHub 저장소 연결

GitHub에서 README나 `.gitignore`를 자동 생성하지 않은 빈 저장소를 만든다.

```bash
gh repo create "$REPOSITORY" \
  --private \
  --description "$PROJECT_NAME"
```

```bash
git remote add origin \
  "https://github.com/${REPOSITORY}.git"

git add .
git commit -m "chore: initialize project from Juleswhile"
git push -u origin main
```

초기 Bootstrap Push 이후부터는 Pull Request 흐름을 사용한다.

### 6. Jules 연결

1. Jules 웹 앱에서 GitHub를 연결한다.
2. Jules GitHub App의 Repository Access에 새 저장소를 추가한다.
3. Jules API Key를 생성한다.
4. Jules Sources API에서 정확한 Source 이름을 확인한다.
5. Source가 새 저장소를 가리키는지 확인한다.

Source 이름 예시:

```text
sources/github/OWNER/REPOSITORY
```

Source 이름을 추측하지 말고 API가 반환한 값을 그대로 사용한다.

### 7. GitHub Secrets

필수:

```bash
gh secret set JULES_API_KEY \
  --repo "$REPOSITORY"
```

Netlify Production 상태 확인 사용 시:

```bash
gh secret set NETLIFY_AUTH_TOKEN \
  --repo "$REPOSITORY"

gh secret set NETLIFY_SITE_ID \
  --repo "$REPOSITORY"
```

Secret 값은 다음 위치에 작성하지 않는다.

* 저장소 파일
* Issue
* Pull Request
* 댓글
* Workflow 입력
* Workflow 로그
* 채팅 메시지

### 8. Repository Variables

초기에는 자동화를 비활성화한다.

```bash
gh variable set JULES_SOURCE_NAME \
  --repo "$REPOSITORY" \
  --body "sources/github/OWNER/REPOSITORY"

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

초기 운영은 반드시 동시 실행량 `1`로 시작한다.

여러 번의 Production Pilot과 Reconciler 검증을 통과한 뒤에만 동시 실행량을 높인다.

Variable 확인:

```bash
gh variable list \
  --repo "$REPOSITORY"
```

REST API로 값 확인:

```bash
gh api \
  "repos/${REPOSITORY}/actions/variables?per_page=100" |
  jq '.variables[] | {
    name,
    value
  }'
```

### 9. Netlify 연결

기본 설정:

```text
Production Branch: main
Build Command: npm run build
Publish Directory: dist
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

### 10. 로컬 검증

```bash
npm ci
npm run ci
```

다음 항목이 모두 통과해야 한다.

* Biome lint
* Workflow supply-chain validation
* JSON Schema validation
* TASK graph validation
* TypeScript typecheck
* Unit tests
* Production build

### 11. Workflow Dry Run

Next TASK:

```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

Reconciler:

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

### 12. Core Automation 활성화

다음 조건을 모두 충족한 뒤 활성화한다.

* GitHub Actions 쓰기 권한 확인
* Jules API Key 등록
* Jules Source 검증
* Netlify 연결 검증
* `npm run ci` 통과
* 열린 TASK Session 없음
* 열린 TASK PR 없음
* Resource Lock 없음
* 중복 Session 없음
* 미해결 Dispatch Intent 없음
* Content Automation 비활성
* 최대 동시 실행량 1

먼저 `ops/state/project-state.json`의 committed 상태를 PR로 갱신한 뒤 Repository Variable을 활성화한다.

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

Content Automation은 반복 콘텐츠 템플릿을 실제로 사용할 때만 활성화한다.

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

사용하지 않을 때는 반드시 `false`를 유지한다.

### 13. Project Goal Issue 생성

GitHub에서 다음 Issue Form을 선택한다.

```text
Issues
→ New issue
→ Project Goal
```

제목 형식:

```text
[GOAL] 프로젝트 목표
```

Goal Issue에는 다음을 구체적으로 작성한다.

* 프로젝트 이름
* 프로젝트 유형
* 최상위 목표
* 해결하려는 문제
* 대상 사용자
* 기대 산출물
* 핵심 기능
* 기술·비용·일정 제약
* 정보 출처 정책
* AI 팀 작업 범위
* 자동화 수준
* 게시 및 배포 정책
* 필수 품질 검증
* 제외 범위
* 예상 위험
* 목표 일정
* 검증 가능한 성공 조건

Secret, Token, 비밀번호와 개인정보는 작성하지 않는다.

---

## Pull Request 계약

TASK PR 본문:

```markdown
<!-- juleswhile:task-pr -->

TASK Issue: #123
```

Planner PR 본문:

```markdown
<!-- juleswhile:task-pr -->

Goal Issue: #1
```

Draft PR은 검증되지 않는다.

계약을 확인한 뒤 Ready로 전환한다.

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

---

## Workflow 목록

| Workflow                    | 역할                                  |
| --------------------------- | ----------------------------------- |
| `01 · Goal Intake`          | Goal Issue를 검증하고 Planner Session 생성 |
| `02 · Dispatch Jules TASK`  | TASK 하나를 Jules Session 하나에 전달       |
| `03 · PR Validation`        | PR 계약, 스키마, 범위, 테스트와 빌드 검증          |
| `04 · Auto Merge`           | 병합 정책 평가와 exact-head 병합             |
| `05 · Next TASK`            | 다음 READY TASK 선택과 예약                |
| `06 · Reconciler`           | 고착 상태, Session 상태와 Projection 복구    |
| `07 · Content Schedule`     | 승인된 반복 콘텐츠 TASK 생성                  |
| `08 · Netlify Status`       | Production Deploy 상태 확인과 TASK 완료    |
| `09 · Main Integrity Audit` | `main` Push와 PR 병합 경로 감사            |

---

## 자동화 중지

Core Automation 중지:

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

Content Automation 중지:

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

주의:

* 이미 실행 중인 Jules Session은 계속 작업할 수 있다.
* 열린 PR의 Validation과 Auto Merge는 별도로 진행될 수 있다.
* 완전 중지가 필요하면 열린 PR에 `do-not-merge`를 적용한다.

---

## 상태 확인

최근 Workflow:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --limit 20
```

열린 TASK:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "juleswhile:task" \
  --state open
```

실행 중 TASK:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "state:running" \
  --state open
```

열린 PR:

```bash
gh pr list \
  --repo "$REPOSITORY" \
  --state open
```

Variables:

```bash
gh variable list \
  --repo "$REPOSITORY"
```

Secret 이름:

```bash
gh secret list \
  --repo "$REPOSITORY"
```

---

## Unknown Dispatch Outcome 원칙

Jules Session 생성 중 timeout, connection reset, HTTP 408, HTTP 425 또는 HTTP 5xx가 발생하면 같은 TASK를 즉시 다시 Dispatch하지 않는다.

다음 순서를 따른다.

1. Reconciler 실행
2. Quota Ledger 확인
3. Dispatch Intent 확인
4. Canonical Session marker 확인
5. Jules API Session 조회
6. 기존 Session이 없다는 사실이 확정된 뒤에만 재시도

Unknown 결과에서는 중복 Session 방지가 우선이다.

---

## 로컬 명령

```bash
npm ci
npm run lint
npm run validate:supply-chain
npm run validate:schemas
npm run validate:task-graph
npm run typecheck
npm test
npm run build
npm run ci
```

---

## 상세 문서

* [`operator-guide.md`](operator-guide.md)

  * 새 프로젝트 Bootstrap
  * GitHub, Jules와 Netlify 연결
  * 자동화 활성화
  * Goal Issue 작성
  * PR 검증과 병합
  * 모니터링
  * Reconciler
  * 장애 복구
  * 중지와 재개

* [`AGENTS.md`](AGENTS.md)

  * Jules와 AI Agent의 저장소 작업 규칙

* [`PROJECT_GOAL.md`](PROJECT_GOAL.md)

  * 새 프로젝트 Goal snapshot 템플릿

* [`ops/tasks/task-index.yaml`](ops/tasks/task-index.yaml)

  * TASK 계약과 의존성 Manifest

* [`ops/state/project-state.json`](ops/state/project-state.json)

  * Runtime State Projection

* [`docs/07_operations/operational-hardening.md`](docs/07_operations/operational-hardening.md)

  * Actions 공급망, 권한과 운영 보안

* [`docs/07_operations/security-capability-matrix.md`](docs/07_operations/security-capability-matrix.md)

  * 보안 통제와 플랫폼 제약

---

## 안전 원칙

* Secret을 저장소에 커밋하지 않는다.
* Issue와 PR에 Token을 붙여 넣지 않는다.
* CI를 우회하지 않는다.
* 실패한 검증 기록을 삭제하지 않는다.
* 민감 작업을 자동 승인하지 않는다.
* Unknown Dispatch 결과에서 재시도하지 않는다.
* Jules 결과를 검증 없이 Production으로 간주하지 않는다.
* `main`에는 승인되고 검증된 결과만 보관한다.
