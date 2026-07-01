# Juleswhile

Juleswhile은 GitHub Issues, Google Jules, GitHub Actions, Pull Requests, CI와 Netlify를 결합한 **이벤트 드리븐 AI 프로젝트 실행 템플릿**이다.

사용자가 Project Goal Issue를 작성하면 Planner가 목표를 검증 가능한 WBS와 TASK로 분해한다. 실행 가능한 TASK는 Jules Session 하나에 하나씩 전달되며, 결과는 임시 Branch와 Pull Request로 제출된다.

검증과 병합 정책을 통과한 결과만 `main`에 반영되고, Production 배포가 확인된 뒤 TASK가 완료된다.

## 실행 흐름

```text
Project Goal Issue
→ Planner Jules Session
→ PROJECT_GOAL.md / WBS / TASK Manifest
→ Planner Pull Request
→ PR Validation
→ Auto Merge
→ Next TASK Selector
→ TASK Issue
→ Quota Reservation
→ Dispatch Intent
→ Jules Session
→ TASK Pull Request
→ PR Validation
→ Auto Merge
→ Netlify Production 검증
→ TASK COMPLETED
→ 다음 READY TASK
```

비정상 상태와 고착 상태는 Reconciler와 Runtime State Projection이 복구한다.

## 핵심 계약

### One Session, One TASK

하나의 Jules Session은 하나의 TASK만 처리한다.

### One Permanent Branch

영구 Branch는 `main` 하나다. 실제 작업은 TASK별 임시 Branch에서 수행한다.

### Pull Request Only

초기 Template Seed 이후의 변경은 Pull Request를 통해서만 `main`에 반영한다.

### GitHub Is the Control Plane

GitHub Issues와 Pull Requests가 실제 Runtime 상태의 권위다.

### Jules Is the Worker

Jules는 할당된 TASK를 수행하지만 다음 TASK 선택, 병합 여부와 프로젝트 전체 상태를 임의로 결정하지 않는다.

### CI Is the Quality Gate

AI의 완료 주장과 검증된 완료를 구분한다.

### Production Is the Completion Gate

PR 병합만으로 TASK를 완료하지 않는다. Production 배포 확인 후 TASK를 `COMPLETED`로 전환한다.

### Guarded Autonomy

보안, 인증, 결제, 개인정보, 파괴적 데이터 변경, Secret, 유료 자원과 운영 인프라 변경은 사람 승인을 요구할 수 있다.

## 상태와 파일의 역할

| 항목 | 역할 |
|---|---|
| GitHub Goal Issue | 최상위 프로젝트 목표 |
| GitHub TASK Issue | TASK Runtime 상태와 운영 증거 |
| Pull Request | 작업 결과와 검증 경계 |
| `ops/tasks/task-index.yaml` | TASK 계약 Root Manifest |
| `ops/tasks/history/*.yaml` | 개별 TASK History Manifest |
| `ops/tasks/task-templates.yaml` | 재사용 TASK Template |
| `ops/state/project-state.json` | GitHub Runtime Evidence의 committed Projection |
| `PROJECT_GOAL.md` | 현재 프로젝트 목표의 committed snapshot |
| `AGENTS.md` | Jules와 AI Agent의 저장소 작업 계약 |

## 저장소 구조

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
├── docs/
├── ops/
│   ├── prompts/
│   ├── roles/
│   ├── schemas/
│   ├── scripts/
│   ├── state/
│   └── tasks/
│       ├── history/
│       ├── task-index.yaml
│       └── task-templates.yaml
├── AGENTS.md
├── PROJECT_GOAL.md
├── QUICKSTART.md
├── OPERATOR-GUIDE-01-OVERVIEW.md
└── package.json
```

`docs/`는 새 프로젝트에서 기획·설계·리서치 산출물이 들어가는 영역이다. Juleswhile Template의 운영 설명서는 프로젝트 루트의 `OPERATOR-GUIDE-*.md`가 담당한다.

## 새 프로젝트 시작

정식 Bootstrap 절차:

- [`QUICKSTART.md`](QUICKSTART.md)
- [`OPERATOR-GUIDE-01-OVERVIEW.md`](OPERATOR-GUIDE-01-OVERVIEW.md)

핵심 순서:

```text
Template Clone
→ 기존 Git 이력 제거
→ Bootstrap Runtime 초기화
→ 새 GitHub 저장소 Seed
→ Jules GitHub App 연결
→ Secret과 Variable 설정
→ Netlify 연결
→ Control Plane Preflight
→ Guarded Automation 활성화
→ Project Goal Issue 생성
```

초기 Seed Push 이후에는 직접 `main`에 Push하지 않는다.

## Workflow

| Workflow | 역할 |
|---|---|
| `00 · Control Plane Preflight` | Automation 활성화 전 필수 구성 검증 |
| `01 · Goal Intake` | Goal Issue 검증과 Planner Session 생성 |
| `02 · Dispatch Jules TASK` | TASK 하나를 Jules Session 하나에 전달 |
| `03 · PR Validation` | PR 계약, Scope, Schema, Test와 Build 검증 |
| `04 · Auto Merge` | 승인·검증·Exact Head 기반 병합 |
| `05 · Next TASK` | 다음 READY TASK 선택과 예약 |
| `06 · Reconciler` | 고착 상태, Session과 Projection 복구 |
| `07 · Content Schedule` | 승인된 반복 Content TASK 생성 |
| `08 · Netlify Status` | Production Deploy 확인과 TASK 완료 |
| `09 · Main Integrity Audit` | `main` 변경 경로 감사 |
| `10 · Runtime Projection Sync` | Runtime Evidence의 Static Projection 동기화 |

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

Draft PR은 Validation 대상이 아니다. 계약을 확인한 뒤 Ready로 전환한다.

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

## 로컬 검증

```bash
npm ci
npm run validate:schemas
npm run validate:task-graph
npm run validate:source-size
npm run validate:supply-chain
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run ci
git diff --check
```

## 자동화 중지

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

실행 중인 Jules Session과 열린 Pull Request는 별도로 확인한다. 완전 중지가 필요하면 해당 PR에 `do-not-merge`를 적용한다.

## Unknown Dispatch Outcome

Jules Session 생성 중 Timeout, Connection Reset, HTTP 408, HTTP 425 또는 HTTP 5xx가 발생하면 즉시 재Dispatch하지 않는다.

```text
Reconciler 확인
→ Quota Ledger 확인
→ Dispatch Intent 확인
→ Canonical Session Evidence 확인
→ Jules API Session 확인
→ 기존 Session 부재 확정
→ 재시도
```

중복 Session 방지가 빠른 재시도보다 우선한다.

## 운영 문서

- [`OPERATOR-GUIDE-01-OVERVIEW.md`](OPERATOR-GUIDE-01-OVERVIEW.md)
- [`QUICKSTART.md`](QUICKSTART.md)
- [`AGENTS.md`](AGENTS.md)
- [`PROJECT_GOAL.md`](PROJECT_GOAL.md)
- [`ops/tasks/task-index.yaml`](ops/tasks/task-index.yaml)
- [`ops/state/project-state.json`](ops/state/project-state.json)

## 안전 원칙

- Secret을 저장소, Issue, PR, 댓글, Workflow 입력과 로그에 기록하지 않는다.
- 검증 실패 기록을 삭제하거나 CI를 우회하지 않는다.
- 사람 승인이 필요한 작업을 자동 승인하지 않는다.
- Unknown Dispatch 결과에서 맹목적으로 재시도하지 않는다.
- Jules 결과를 검증 없이 Production 완료로 간주하지 않는다.
- `main`에는 승인되고 검증된 결과만 보관한다.
