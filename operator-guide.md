# Juleswhile 운영자 사용설명서

## 1. 문서 목적

이 문서는 Juleswhile을 새 프로젝트에 적용하고 실제 운영하는 전체 절차를 설명한다.

완료 목표:

```text
Juleswhile 복제
→ Template 상태 초기화
→ 새 GitHub 저장소 연결
→ Jules GitHub App 연결
→ Jules API Key 등록
→ Jules Source 등록
→ Netlify 연결
→ GitHub Secret 및 Variable 등록
→ 로컬 및 Workflow 검증
→ 자동화 활성화
→ Project Goal Issue 생성
→ Jules가 목표를 TASK로 분해
→ TASK를 순서대로 실행
→ PR 검증 및 병합
→ Netlify 배포
→ 다음 TASK 반복
```

---

# 2. 운영 모델

## 2.1 사람의 역할

운영자는 다음을 담당한다.

* 프로젝트의 최상위 목표 정의
* 비용, 보안, 일정, 제품 정책 결정
* 민감 작업 승인
* Draft PR과 계약 위반 PR 확인
* BLOCKED TASK 해결
* 자동화 중지 및 재개
* 최종 서비스 출시 판단

## 2.2 Jules의 역할

Jules는 다음을 담당한다.

* Planner TASK 수행
* 문서 작성
* 리서치
* 설계
* 코드 구현
* 테스트 작성
* 검증 명령 실행
* 임시 브랜치 생성
* Pull Request 생성

## 2.3 GitHub Actions의 역할

GitHub Actions는 다음을 담당한다.

* Goal Issue 감지
* Jules Session 생성
* TASK Issue 생성 및 동기화
* 다음 TASK 선택
* TASK 예약
* PR 검증
* 자동 병합 정책 평가
* TASK 완료 처리
* 다음 TASK 이벤트 생성
* 고착 상태 복구
* Netlify Production 상태 확인

---

# 3. 사전 준비

필수 계정:

* GitHub
* Google Jules
* Jules API 사용 가능한 Google 계정
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

권장:

```text
Node.js: 22 이상
npm: 10 이상
GitHub CLI 로그인 완료
```

GitHub CLI 로그인 확인:

```bash
gh auth status
```

로그인이 필요하면:

```bash
gh auth login
```

운영 보안 검증:

```bash
npm run validate:supply-chain
npm --silent run sbom:cyclonedx > dist/sbom.cdx.json
npm run build
npm run hash:artifacts
```

공급망 정책, Dependabot 처리 절차, GitHub Free private repository 제약,
main 직접 push 보완 통제는
[`docs/07_operations/operational-hardening.md`](docs/07_operations/operational-hardening.md)와
[`docs/07_operations/security-capability-matrix.md`](docs/07_operations/security-capability-matrix.md)를 기준으로 한다.

---

# 4. 새 프로젝트 값 결정

예시:

```bash
export TEMPLATE_REPO="https://github.com/loopwhile/Juleswhile.git"

export PROJECT_DIR="ai-toolwhile"
export PROJECT_ID="ai-toolwhile"
export PROJECT_NAME="AI Toolwhile"

export GITHUB_OWNER="loopwhile"
export GITHUB_REPO="ai-toolwhile"
export REPOSITORY="${GITHUB_OWNER}/${GITHUB_REPO}"
```

규칙:

* `PROJECT_ID`: 소문자 영문, 숫자, 하이픈
* `PROJECT_DIR`: 로컬 폴더 이름
* `GITHUB_REPO`: GitHub 저장소 이름
* `PROJECT_NAME`: 사람이 읽는 프로젝트 이름

---

# 5. Juleswhile 복제

```bash
git clone "$TEMPLATE_REPO" "$PROJECT_DIR"
cd "$PROJECT_DIR"
```

현재 원본 확인:

```bash
git remote -v
git log --oneline -5
```

---

# 6. 기존 Git 이력 제거

새 프로젝트는 Juleswhile 저장소의 Git 이력을 그대로 사용하지 않는다.

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

예상 결과:

```text
main
```

---

# 7. 새 프로젝트 Bootstrap 초기화

Juleswhile 원본에는 구축 검증용 Smoke Test 상태가 들어 있다.

새 프로젝트에서는 반드시 다음을 초기화한다.

* 기존 실행 TASK
* 기존 Goal 연결
* 기존 Project State
* Runtime Session
* Pull Request 상태
* Resource Lock
* 사용량 기록
* Smoke Test 결과 문서
* Jules Source
* Package 이름

환경값이 설정되어 있는지 확인:

```bash
printf '%s\n' \
  "$PROJECT_ID" \
  "$PROJECT_NAME" \
  "$GITHUB_OWNER" \
  "$GITHUB_REPO" \
  "$REPOSITORY"
```

아래 명령을 실행한다.

```bash
bash <<'BASH'
set -Eeuo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${PROJECT_NAME:?PROJECT_NAME is required}"
: "${GITHUB_OWNER:?GITHUB_OWNER is required}"
: "${GITHUB_REPO:?GITHUB_REPO is required}"
: "${REPOSITORY:?REPOSITORY is required}"

export PROJECT_ID
export PROJECT_NAME
export GITHUB_OWNER
export GITHUB_REPO
export REPOSITORY

node <<'NODE'
import {
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  parse,
  stringify,
} from "yaml";

const required = [
  "PROJECT_ID",
  "PROJECT_NAME",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "REPOSITORY",
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
}

const now = new Date().toISOString();

const projectId = process.env.PROJECT_ID;
const projectName = process.env.PROJECT_NAME;
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const repository = process.env.REPOSITORY;

const taskPath = "ops/tasks/task-index.yaml";

const taskIndex = parse(
  readFileSync(taskPath, "utf8"),
);

const templates = (taskIndex.tasks || [])
  .filter((task) => task.kind === "template")
  .map((task) => ({
    ...task,
    status: "TEMPLATE",
    enabled: false,
    metadata: {
      ...(task.metadata || {}),
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

const statePath = "ops/state/project-state.json";

const state = JSON.parse(
  readFileSync(statePath, "utf8"),
);

state.projectId = projectId;
state.status = "bootstrap";
state.phase = "bootstrap";
state.primaryBranch = "main";

state.repository = {
  fullName: repository,
  htmlUrl: `https://github.com/${owner}/${repo}`,
  julesSourceName: null,
};

state.projectGoal = null;

state.automation = {
  enabled: false,
  contentEnabled: false,
  netlifyStatusEnabled: true,
  mode: "guarded",
  pausedReason:
    "Initial project bootstrap. Enable automation only after GitHub, Jules and Netlify validation.",
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

console.log({
  projectId,
  projectName,
  repository,
  templates: templates.length,
});
NODE

cat > PROJECT_GOAL.md <<EOF
schema_version: 1
project_name: ${PROJECT_NAME}
project_type: pending-goal-intake
status: bootstrap
goal_issue_number: null
goal_issue_url: null
autonomy_mode: guarded
publishing_mode: review_required
primary_branch: main

# ${PROJECT_NAME} Project Goal

이 파일은 Project Goal Issue와 Planner Pull Request를 통해 갱신된다.

## Bootstrap 상태

- GitHub repository: \`${REPOSITORY}\`
- Primary branch: \`main\`
- Automation: disabled
- Goal Issue: not created
- Jules Source: not connected

## 운영 원칙

- Secret을 저장소에 기록하지 않는다.
- Jules 작업은 임시 브랜치와 Pull Request로 제출한다.
- 검증을 통과한 결과만 main에 병합한다.
- 민감하거나 파괴적인 작업은 사람 승인을 요구한다.
EOF

rm -f \
  docs/01_overview/juleswhile-smoke-test.md \
  docs/01_overview/juleswhile-smoke-test-result.md

npm ci
npm run ci

echo
echo "Bootstrap reset completed."
BASH
```

변경 확인:

```bash
git status
git diff --check
git diff --stat
```

TASK 확인:

```bash
npm run validate:task-graph
```

예상:

```text
tasks: 0
templates: 1
ready: 0
blocked: 0
```

---

# 8. 새 GitHub 저장소 생성

빈 저장소를 생성한다.

```bash
gh repo create "$REPOSITORY" \
  --private \
  --description "$PROJECT_NAME"
```

공개 저장소라면:

```bash
gh repo create "$REPOSITORY" \
  --public \
  --description "$PROJECT_NAME"
```

GitHub 웹에서 저장소를 미리 만들었다면 다음 단계로 진행한다.

---

# 9. GitHub Remote 연결

```bash
git remote add origin \
  "https://github.com/${REPOSITORY}.git"
```

확인:

```bash
git remote -v
```

초기 커밋:

```bash
git add .

git commit \
  -m "chore: initialize ${PROJECT_NAME} from Juleswhile"
```

Push:

```bash
git push -u origin main
```

확인:

```bash
gh repo view "$REPOSITORY"
```

---

# 10. GitHub Actions 권한 설정

GitHub 저장소에서 다음 위치를 확인한다.

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

Juleswhile Workflow는 다음 작업을 수행한다.

* Issue 라벨 변경
* Issue 댓글 작성
* Repository Dispatch 생성
* Pull Request 병합
* 작업 브랜치 삭제
* TASK 완료 처리

권한이 읽기 전용이면 자동 병합과 상태 변경이 실패한다.

---

# 11. GitHub Branch Ruleset 설정

대상 브랜치:

```text
main
```

권장 규칙:

* Pull Request를 통한 변경
* Required Status Checks
* 강제 Push 금지
* Branch 삭제 금지
* 대화 해결 요구
* 병합 후 작업 브랜치 자동 삭제

완전 자동 저위험 TASK 실행을 원하면 모든 PR에 일괄적인 사람 Review를 강제하지 않는다.

모든 PR에 1명 승인을 요구하면 자동 병합은 매번 멈춘다.

민감 작업은 Juleswhile 라벨 정책을 사용한다.

```text
human-approval-required
approval:owner-approved
risk:control-plane
do-not-merge
merge:manual-only
```

---

# 12. Jules GitHub App 연결

Jules 웹 앱에서 다음을 수행한다.

1. Jules 로그인
2. GitHub 연결
3. Jules GitHub App 설치
4. Repository Access 설정
5. 새 저장소 선택
6. Jules 저장소 목록에서 프로젝트 확인

API Key만 등록해도 GitHub 저장소 접근 권한이 자동으로 생기지는 않는다.

GitHub App이 해당 저장소에 접근할 수 있어야 한다.

확인 기준:

```text
Jules에서 새 저장소가 Source로 보인다.
Jules가 main 브랜치를 읽을 수 있다.
```

---

# 13. Jules API Key 생성

Jules Settings에서 API Key를 생성한다.

API Key는 생성 직후 안전한 장소에 보관한다.

다음 위치에 기록하지 않는다.

* `.env`를 Git에 Commit
* README
* Issue
* Pull Request
* 댓글
* Workflow log
* 채팅 메시지

터미널에서 임시로 입력:

```bash
read -rsp "Jules API Key: " JULES_API_KEY
echo
```

GitHub Secret 등록:

```bash
printf '%s' "$JULES_API_KEY" \
  | gh secret set JULES_API_KEY \
      --repo "$REPOSITORY"
```

등록 확인:

```bash
gh secret list \
  --repo "$REPOSITORY"
```

Secret 값이 출력되지 않는 것이 정상이다.

---

# 14. Jules Source 이름 확인

Source 이름을 추측하지 않는다.

Jules Sources API에서 반환된 정확한 `name`을 복사한다.

```bash
curl \
  --fail \
  --silent \
  --show-error \
  --header "x-goog-api-key: ${JULES_API_KEY}" \
  "https://jules.googleapis.com/v1alpha/sources" \
  | jq '
      .sources[]? | {
        name,
        githubRepo
      }
    '
```

예시:

```json
{
  "name": "sources/github/loopwhile/ai-toolwhile",
  "githubRepo": {
    "owner": "loopwhile",
    "repo": "ai-toolwhile"
  }
}
```

실제 API가 반환한 값을 설정한다.

```bash
export JULES_SOURCE_NAME="sources/github/OWNER/REPOSITORY"
```

Source 접근 검증:

```bash
curl \
  --fail \
  --silent \
  --show-error \
  --header "x-goog-api-key: ${JULES_API_KEY}" \
  "https://jules.googleapis.com/v1alpha/${JULES_SOURCE_NAME}" \
  | jq .
```

검증 후 로컬 변수에서 API Key 제거:

```bash
unset JULES_API_KEY
```

Repository Variable 등록:

```bash
gh variable set JULES_SOURCE_NAME \
  --repo "$REPOSITORY" \
  --body "$JULES_SOURCE_NAME"
```

확인:

```bash
gh variable get JULES_SOURCE_NAME \
  --repo "$REPOSITORY"
```

---

# 15. GitHub Repository Variables 설정

초기에는 자동화를 비활성화한다.

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set JULES_MAX_CONCURRENCY \
  --repo "$REPOSITORY" \
  --body "10"

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

---

# 16. Netlify 연결

Netlify에서 다음을 수행한다.

1. 새 Project 생성
2. GitHub Provider 연결
3. 새 저장소 선택
4. Production Branch를 `main`으로 설정
5. Build Command 설정
6. Publish Directory 설정
7. 첫 Deploy 실행

Juleswhile 기본 설정:

```text
Production Branch: main
Build Command: npm run build
Publish Directory: dist
```

프로젝트가 Next.js, Vite, Astro 등으로 변경되면 해당 프레임워크 설정으로 수정한다.

Netlify가 저장소에 접근할 수 있는지 확인한다.

성공 기준:

```text
main Push
→ Netlify Build 실행
→ Production Deploy ready
→ *.netlify.app URL 접근 가능
```

---

# 17. Netlify API Token과 Site ID 등록

Netlify에서 API Token과 Site ID를 확인한다.

GitHub Secret 등록:

```bash
gh secret set NETLIFY_AUTH_TOKEN \
  --repo "$REPOSITORY"

gh secret set NETLIFY_SITE_ID \
  --repo "$REPOSITORY"
```

Repository Variable:

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

확인:

```bash
gh secret list \
  --repo "$REPOSITORY"

gh variable list \
  --repo "$REPOSITORY"
```

---

# 18. 로컬 검증

```bash
npm ci
npm run ci
```

다음 단계가 모두 통과해야 한다.

```text
Biome lint
Schema validation
TASK graph validation
TypeScript typecheck
Build
```

Git 상태:

```bash
git diff --check
git status
```

변경이 있다면:

```bash
git add .

git commit \
  -m "chore: configure Juleswhile project bootstrap"

git push origin main
```

---

# 19. Workflow Dry Run

## 19.1 Next TASK Dry Run

아직 실행 TASK가 없으므로 선택 결과만 확인한다.

```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

최근 실행 확인:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --workflow "05-next-task.yml" \
  --limit 3
```

## 19.2 Reconciler Dry Run

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

확인:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --workflow "06-reconciler.yml" \
  --limit 3
```

실행 로그:

```bash
RUN_ID="$(
  gh run list \
    --repo "$REPOSITORY" \
    --workflow "06-reconciler.yml" \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId'
)"

gh run watch "$RUN_ID" \
  --repo "$REPOSITORY"
```

---

# 20. 자동화 활성화 전 Project State 동기화

Repository Variable만 활성화하고 committed state를 그대로 두지 않는다.

다음 명령으로 Project State를 활성화 상태로 변경한다.

```bash
node <<'NODE'
import {
  readFileSync,
  writeFileSync,
} from "node:fs";

const path = "ops/state/project-state.json";

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
```

커밋:

```bash
git add ops/state/project-state.json

git commit \
  -m "chore: enable guarded Juleswhile automation"

git push origin main
```

실제 Repository Variable 활성화:

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

확인:

```bash
gh variable get AUTOMATION_ENABLED \
  --repo "$REPOSITORY"
```

예상:

```text
true
```

---

# 21. Project Goal Issue 작성

GitHub 웹에서 다음으로 이동한다.

```text
Repository
→ Issues
→ New issue
→ Project Goal
```

제목:

```text
[GOAL] AI 도구 설명서 웹사이트 구축
```

## 21.1 작성 원칙

Goal Issue는 구현 TASK 목록을 사람이 전부 미리 작성하는 문서가 아니다.

다음 항목을 명확히 정의한다.

### 결과

최종적으로 무엇이 존재해야 하는가?

### 사용자

누가 어떤 상황에서 사용하는가?

### 문제

현재 어떤 불편이나 비용을 해결하는가?

### 범위

무엇을 만들어야 하는가?

### 제외 범위

무엇을 만들지 않는가?

### 제약

비용, 일정, 기술, 계정, 인프라 제한은 무엇인가?

### 품질

어떤 테스트를 통과해야 완료인가?

### 운영

어디에 배포하고 어떻게 관리하는가?

### 자동화

어떤 작업까지 AI가 자동 수행할 수 있는가?

### 위험

보안, 저작권, 정확성, 비용 위험은 무엇인가?

---

# 22. Project Goal Issue 전체 예시

## 프로젝트 이름

```text
AI Toolwhile
```

## 프로젝트 유형

```text
콘텐츠 웹사이트
```

## 최상위 목표

```text
ChatGPT, Claude, Gemini, Codex, Jules, Stitch, MCP 등
주요 AI 도구의 기능, 사용법, 비용 구조, 제한사항과 활용 사례를
한국어로 제공하는 반응형 웹사이트를 구축한다.

사용자는 AI 도구별 설명서, 비교표, 설정 방법, 실제 활용 사례를
검색하고 카테고리별로 탐색할 수 있어야 한다.

최종 결과는 Netlify Production URL에서 접근 가능해야 한다.
```

## 해결하려는 문제

```text
AI 도구 정보가 공식 문서, 블로그, 제품 화면과 커뮤니티에
분산되어 있어 사용자가 정확한 사용 방법과 최신 제한사항을
파악하기 어렵다.

검색 결과에는 오래된 정보와 비공식 추측이 섞여 있으며,
도구 간 비교 기준도 일관되지 않다.
```

## 대상 사용자

```text
- AI 도구를 처음 사용하는 비개발자
- ChatGPT, Gemini, Claude를 업무에 적용하려는 사용자
- Codex, Jules, MCP를 개발에 적용하려는 개발자
- AI 구독 상품과 도구를 비교하려는 1인 사업자
- 최신 AI 제품 변경사항을 추적하려는 사용자
```

## 기대 산출물

```text
- 프로젝트 개요와 콘텐츠 정책
- 정보 출처 및 검증 정책
- AI 도구 분류 체계
- 콘텐츠 데이터 구조
- 도구별 설명서 페이지
- 도구 비교 페이지
- 검색 및 필터 기능
- 반응형 웹 UI
- SEO 메타데이터
- 테스트
- 운영자 문서
- Netlify Production 배포
```

## 핵심 기능

```text
1. AI 도구 카테고리 탐색
2. 도구별 개요와 핵심 기능
3. 초기 설정 방법
4. 가격 및 사용량 정책 정리
5. 지원 모델 및 플랫폼 정리
6. 활용 사례
7. 공식 출처 표시
8. 도구 간 비교
9. 검색
10. 모바일 반응형 화면
11. 최근 업데이트 날짜 표시
12. 잘못된 정보 수정 절차
```

## 제약사항

```text
- GitHub 무료 계정 범위에서 운영한다.
- Google Jules 사용량 한도를 준수한다.
- 영구 브랜치는 main 하나만 사용한다.
- 모든 변경은 Pull Request로 제출한다.
- CI를 통과한 변경만 병합한다.
- Netlify에 배포한다.
- 별도 유료 데이터베이스는 초기 버전에서 사용하지 않는다.
- 인증, 결제, 회원 기능은 초기 버전에서 제외한다.
- Secret은 저장소에 기록하지 않는다.
```

## 데이터 및 정보 출처

```text
우선 출처:
- OpenAI 공식 문서와 공식 블로그
- Google Gemini 및 Jules 공식 문서
- Anthropic 공식 문서
- GitHub 공식 문서
- Netlify 공식 문서
- 제품 내 공식 릴리스 노트

보조 출처:
- 공식 GitHub 저장소
- 공식 발표 영상
- 신뢰할 수 있는 기술 매체

금지:
- 원문을 확인할 수 없는 재가공 글
- 작성 날짜가 없는 가격 정보
- 출처 없는 모델 성능 주장
- 커뮤니티 추측을 사실로 단정
```

## AI 팀 작업 범위

```text
- 프로젝트 기획
- 요구사항 분석
- 리서치
- 시스템 아키텍처
- 데이터 구조 설계
- UI/UX 설계
- Stitch MCP 디자인
- 프론트엔드 개발
- 테스트 및 QA
- 콘텐츠 생성
- 배포 및 운영 자동화
```

## 자동화 수준

```text
Guarded - 낮은 위험 TASK 자동 실행, 민감 작업 승인 필요
```

## 게시 및 배포 정책

```text
CI 통과 시 자동 배포
```

## 필수 품질 검증

```text
- 공식 출처 링크 존재
- 발행일과 확인일 구분
- 가격과 사용량 정보의 확인 날짜 표시
- TypeScript typecheck
- Markdown 또는 콘텐츠 스키마 검증
- Unit test
- Production build
- 내부 링크 검사
- 모바일 반응형 검사
- 비밀정보 노출 검사
- Netlify Production 배포 확인
```

## 제외 범위

```text
- 회원가입
- 유료 결제
- 사용자 개인정보 저장
- 자체 AI 모델 호스팅
- 공식 API를 이용한 자동 구매
- 광고 자동 집행
- 커뮤니티 게시판
- 출처 없는 AI 뉴스
```

## 예상 위험과 주의사항

```text
- AI 제품 가격과 사용량 정책 변경
- 공식 문서 URL 변경
- AI 생성 요약 오류
- 저작권 있는 원문 과다 인용
- Jules 사용량 초과
- Netlify Build 실패
- 비공식 정보를 사실로 게시할 위험
```

## 목표 일정

```text
2026-08-23
```

## 프로젝트 성공 조건

```text
- Goal Issue가 Planner Session을 생성한다.
- Planner가 WBS와 TASK Manifest를 생성한다.
- 모든 TASK에 입력, 출력, 허용 경로와 검증 기준이 정의된다.
- 최소 10개 AI 도구 페이지가 생성된다.
- 도구 비교 페이지가 존재한다.
- 검색과 카테고리 탐색이 작동한다.
- 모든 필수 CI가 통과한다.
- 모든 결과가 Pull Request로 제출된다.
- Netlify Production URL에서 사이트를 확인할 수 있다.
- 모바일과 데스크톱에서 정상 동작한다.
```

---

# 23. Goal Issue 제출 후 자동 흐름

`AUTOMATION_ENABLED=true` 상태에서 `[GOAL]` Issue를 열면 다음이 실행된다.

```text
01 · Goal Intake
```

Workflow는 다음을 확인한다.

* Issue가 열려 있는가?
* Pull Request가 아닌가?
* 제목이 `[GOAL]`로 시작하는가?
* 자동화가 활성화되어 있는가?
* 같은 Goal이 이미 Dispatch되지 않았는가?
* Jules API Key가 있는가?
* Jules Source가 설정되어 있는가?

통과하면 Planner Session을 생성한다.

Goal Issue 댓글에서 다음을 확인한다.

```text
Jules Session
Session ID
Session 상태
Session URL
```

---

# 24. Planner 결과 검토

Planner는 다음을 생성하거나 수정해야 한다.

* `PROJECT_GOAL.md`
* 프로젝트 개요 문서
* 범위 및 제외 범위
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

Planner PR 본문 필수값:

```markdown
<!-- juleswhile:task-pr -->

Goal Issue: #N
```

확인할 내용:

* 프로젝트 목표를 잘못 해석하지 않았는가?
* 지나치게 큰 TASK가 없는가?
* TASK 사이클이 없는가?
* 각 TASK의 허용 경로가 분리되어 있는가?
* 민감 작업에 사람 승인이 적용되는가?
* 품질 검증 명령이 구체적인가?
* 구현 TASK가 완료 상태로 잘못 지정되지 않았는가?

---

# 25. Draft Pull Request 처리

현재 Jules가 PR을 Draft로 생성할 수 있다.

Draft PR에서는 `03 · PR Validation`이 실행되지 않는다.

PR 상태 확인:

```bash
gh pr view <PR_NUMBER> \
  --repo "$REPOSITORY" \
  --json number,title,isDraft,body,files,url
```

PR 본문에 다음 마커가 있는지 확인한다.

TASK PR:

```markdown
<!-- juleswhile:task-pr -->

TASK Issue: #123
```

Planner PR:

```markdown
<!-- juleswhile:task-pr -->

Goal Issue: #1
```

필수 계약이 올바르면 Ready 상태로 전환한다.

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

그 후 `03 · PR Validation`이 실행된다.

---

# 26. PR 검증 흐름

`03 · PR Validation`은 다음을 확인한다.

* PR 제목 형식
* PR Marker
* Goal Issue 또는 TASK Issue 참조
* Base Branch가 `main`
* Fork 정책
* 변경 파일 존재
* Control Plane 변경 여부
* 필수 저장소 파일
* JSON Schema
* TASK Graph
* TASK 허용 경로
* Lint
* Typecheck
* Test
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

# 27. 자동 병합과 다음 TASK

PR Validation이 성공하면 `04 · Auto Merge`가 실행된다.

병합 조건:

* PR 상태가 OPEN
* Draft가 아님
* Base Branch가 main
* Juleswhile PR Marker 존재
* `juleswhile:managed`
* `validation:passed`
* 차단 라벨 없음
* Merge Conflict 없음
* 민감 변경 승인 충족

병합 후:

```text
TASK Issue → state:completed
TASK Issue → closed
PR branch → deleted
pr_merged event → emitted
```

그 후 `05 · Next TASK`가 실행된다.

`05 · Next TASK`는 다음을 확인한다.

* READY TASK
* 의존성 충족
* 동시 실행 상한
* 일일 Jules 예산
* Resource Lock
* 충돌 TASK
* 기존 실행 Session
* 기존 TASK Issue

실행 가능한 TASK 하나를 선택해 `02 · Dispatch Jules TASK`로 전달한다.

이 과정이 READY TASK가 없어질 때까지 반복된다.

---

# 28. 실제로 Jules가 계속 돌아가는 조건

다음 조건이 모두 만족되어야 한다.

```text
AUTOMATION_ENABLED=true
JULES_API_KEY 존재
JULES_SOURCE_NAME 유효
Goal 또는 READY TASK 존재
TASK 의존성 충족
사용량 예산 남음
동시 실행 슬롯 남음
PR 계약 정상
PR이 Draft가 아님
CI 통과
병합 정책 통과
```

다음 상태에서는 사람 개입이 필요하다.

```text
Draft PR
PR Marker 누락
TASK Issue 참조 누락
Goal Issue 참조 누락
validation:failed
state:blocked
state:merge-blocked
human-approval-required
Merge Conflict
Jules Session timeout
Netlify deploy failure
```

따라서 현재 구조는 다음과 같이 정의한다.

```text
연속 자동 실행 + 안전 경계에서 중지하는 Guarded Automation
```

무제한 무감독 실행이 아니다.

---

# 29. 운영 상태 확인 명령

## 최근 Workflow

```bash
gh run list \
  --repo "$REPOSITORY" \
  --limit 20
```

## Goal Issue

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "juleswhile:goal" \
  --state all
```

## TASK Issue

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "juleswhile:task" \
  --state all
```

## 실행 중 TASK

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "state:running" \
  --state open
```

## 차단 TASK

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "state:blocked" \
  --state open
```

## 열린 PR

```bash
gh pr list \
  --repo "$REPOSITORY" \
  --state open
```

## PR 검사

```bash
gh pr checks <PR_NUMBER> \
  --repo "$REPOSITORY"
```

## Repository Variables

```bash
gh variable list \
  --repo "$REPOSITORY"
```

## Secrets 이름

```bash
gh secret list \
  --repo "$REPOSITORY"
```

---

# 30. 자동화 중지

새 Goal과 다음 TASK 실행을 중지한다.

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

콘텐츠 스케줄만 중지:

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

주의:

* 이미 실행 중인 Jules Session은 계속 작업할 수 있다.
* 열린 PR의 Validation과 Auto Merge는 별도로 진행될 수 있다.
* 완전 중지가 필요하면 열린 PR에 `do-not-merge` 라벨을 추가한다.

```bash
gh pr edit <PR_NUMBER> \
  --repo "$REPOSITORY" \
  --add-label "do-not-merge"
```

`gh pr edit`가 Projects Classic GraphQL 오류를 발생시키면 REST를 사용한다.

```bash
jq -n \
  '{labels:["do-not-merge"]}' \
  | gh api \
      --method POST \
      "repos/${REPOSITORY}/issues/<PR_NUMBER>/labels" \
      --input -
```

---

# 31. 자동화 재개

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

READY TASK가 있지만 이벤트가 없는 경우 `05 · Next TASK`를 수동 실행한다.

```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f source_task_id="" \
  -f dry_run="false" \
  -f force="true"
```

---

# 32. Goal Intake 수동 실행

자동화가 꺼져 있을 때 특정 Goal Issue만 테스트할 수 있다.

```bash
gh workflow run "01-goal-intake.yml" \
  --repo "$REPOSITORY" \
  -f issue_number="<GOAL_ISSUE_NUMBER>" \
  -f force="false"
```

이미 처리된 Goal을 다시 실행:

```bash
gh workflow run "01-goal-intake.yml" \
  --repo "$REPOSITORY" \
  -f issue_number="<GOAL_ISSUE_NUMBER>" \
  -f force="true"
```

동일 Goal을 반복 실행하면 중복 Planner Session이나 중복 PR이 생길 수 있으므로 원인 확인 없이 `force=true`를 사용하지 않는다.

---

# 33. 특정 TASK 수동 Dispatch

```bash
gh workflow run "02-dispatch-jules.yml" \
  --repo "$REPOSITORY" \
  -f task_id="TASK-001" \
  -f issue_number="123" \
  -f dry_run="false" \
  -f force="true"
```

사용 조건:

* TASK Manifest 존재
* TASK Issue 존재
* Jules API Key 유효
* Jules Source 유효
* 중복 Session이 없음

---

# 34. Reconciler 사용

상태 변경 없이 점검:

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="true" \
  -f force="false"
```

실제 복구 적용:

```bash
gh workflow run "06-reconciler.yml" \
  --repo "$REPOSITORY" \
  -f dry_run="false" \
  -f force="true"
```

Reconciler가 확인하는 항목:

* 오래된 `state:dispatching`
* 오래된 `state:running`
* 오래된 `state:validating`
* Session timeout
* 중복 TASK Issue
* Session 기록 없는 예약
* 다음 TASK 예약 필요 여부

항상 Dry Run 결과를 먼저 확인한 뒤 Apply한다.

---

# 35. 장애 복구

## 35.1 Goal Intake 실패

확인:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --workflow "01-goal-intake.yml" \
  --limit 5
```

주요 원인:

* 제목이 `[GOAL]`로 시작하지 않음
* `AUTOMATION_ENABLED=false`
* `JULES_API_KEY` 없음
* `JULES_SOURCE_NAME` 없음
* Jules GitHub App 저장소 권한 없음
* Source가 다른 저장소를 가리킴

## 35.2 TASK Dispatch 실패

주요 원인:

* TASK Issue 번호 불일치
* GH_TOKEN 권한 부족
* Jules API Key 오류
* Source 이름 오류
* TASK가 READY가 아님
* 기존 Session 존재
* 예산 또는 동시성 제한

## 35.3 Draft PR에서 멈춤

```bash
gh pr view <PR_NUMBER> \
  --repo "$REPOSITORY" \
  --json isDraft,body,files
```

계약을 확인한 뒤:

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

## 35.4 PR Validation 실패

```bash
gh pr checks <PR_NUMBER> \
  --repo "$REPOSITORY"

gh run list \
  --repo "$REPOSITORY" \
  --workflow "03-pr-validation.yml" \
  --limit 5
```

원칙:

* 실패한 검증을 제거하지 않는다.
* Required Check를 우회하지 않는다.
* TASK 허용 범위를 넓혀서 실패를 숨기지 않는다.
* 같은 PR에서 수정한다.
* 보완 횟수 제한을 지킨다.

## 35.5 Auto Merge 차단

PR 라벨 확인:

```bash
gh pr view <PR_NUMBER> \
  --repo "$REPOSITORY" \
  --json labels,reviewDecision,mergeable,mergeStateStatus
```

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

## 35.6 Netlify 실패

확인:

```bash
gh run list \
  --repo "$REPOSITORY" \
  --workflow "08-netlify-status.yml" \
  --limit 5
```

확인 항목:

* Netlify Site ID
* Netlify Auth Token
* Production Branch
* Build Command
* Publish Directory
* Merge Commit과 Deploy Commit 일치
* Deploy 상태
* Build log

---

# 36. 일일 운영 체크리스트

```text
[ ] state:failed Issue가 없는가?
[ ] state:blocked TASK가 없는가?
[ ] 오래된 state:running TASK가 없는가?
[ ] 열린 Draft PR이 없는가?
[ ] validation:failed PR이 없는가?
[ ] state:merge-blocked PR이 없는가?
[ ] Netlify Production이 ready인가?
[ ] Jules 일일 사용량이 예산 안에 있는가?
[ ] main과 Production 결과가 일치하는가?
[ ] Secret 노출 사고가 없는가?
```

터미널:

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --state open

gh pr list \
  --repo "$REPOSITORY" \
  --state open

gh run list \
  --repo "$REPOSITORY" \
  --limit 20
```

---

# 37. 프로젝트 목표 변경

기존 목표를 조용히 파일에서 직접 수정하지 않는다.

중대한 목표 변경은 새 Goal Issue로 작성한다.

```text
[GOAL] 기존 서비스에 결제 기능 추가
```

Goal Issue에 다음을 명시한다.

* 기존 프로젝트와의 관계
* 변경 목표
* 영향 범위
* 마이그레이션 필요 여부
* 기존 TASK 취소 여부
* 새로운 위험
* 새로운 품질 기준

---

# 38. 프로젝트 종료

모든 자동화 중지:

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

마지막 Project State를 다음처럼 정리한다.

```json
{
  "status": "completed",
  "phase": "completed"
}
```

검증 및 커밋:

```bash
npm run ci

git add \
  PROJECT_GOAL.md \
  ops/tasks/task-index.yaml \
  ops/state/project-state.json

git commit \
  -m "chore: finalize project state"

git push origin main
```

---

# 39. 최종 운영 기준

Juleswhile이 정상 운영 중이라고 판단하는 조건:

```text
GitHub:
- main만 영구 브랜치
- Jules App 연결
- Actions 쓰기 권한
- Secret과 Variable 설정

Jules:
- API Key 유효
- Source 유효
- 저장소 접근 가능

Netlify:
- Git 저장소 연결
- Production Branch main
- Build 성공
- Production Deploy ready

Automation:
- AUTOMATION_ENABLED=true
- Goal Intake 정상
- TASK Dispatch 정상
- PR Validation 정상
- Auto Merge 정상
- Next TASK 정상
- Reconciler 정상

Project:
- Goal Issue 존재
- Planner PR 병합
- TASK Manifest 유효
- READY TASK 자동 실행
- 완료 TASK Issue 종료
- main과 Production 일치
```

Juleswhile의 자동화 목표는 다음이다.

```text
사람은 목표와 경계를 정의한다.
Planner는 목표를 검증 가능한 TASK로 분해한다.
Jules는 TASK를 하나씩 수행한다.
GitHub Actions는 검증, 병합, 다음 TASK를 통제한다.
Netlify는 main의 결과를 Production으로 보여준다.
안전 경계나 실패가 발생하면 시스템은 멈추고 사람에게 통제권을 돌려준다.
```
