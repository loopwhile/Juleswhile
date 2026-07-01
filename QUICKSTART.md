# Juleswhile Portable Project Quick Start

이 문서는 새 프로젝트에 Juleswhile을 적용할 때 사용하는 **정식 설치 순서**다.

`git clone → rm -rf .git → git init → git push origin main` 방식은 사용하지 않는다. 새 저장소의 `main`은 GitHub Template Repository가 생성하고, 프로젝트별 초기화 변경은 Bootstrap Pull Request로 반영한다.

## 1. 새 저장소 생성

```bash
export PROJECT_ID="ai-tech-blog"
export PROJECT_NAME="AI Tech Blog"
export GITHUB_OWNER="YOUR_GITHUB_ID"
export REPOSITORY="${GITHUB_OWNER}/${PROJECT_ID}"

gh repo create "$REPOSITORY" \
  --template loopwhile/Juleswhile \
  --private \
  --clone

cd "$PROJECT_ID"
git status
git branch --show-current
```

예상 브랜치는 `main`이고, `origin/main`은 이미 존재한다. 이 단계에서 로컬 `main`을 직접 Push하지 않는다.

## 2. Bootstrap 브랜치 생성

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c "bootstrap/${PROJECT_ID}"
```

## 3. Template Runtime 초기화

```bash
npm ci

export PROJECT_ID="ai-tech-blog"
export PROJECT_NAME="AI Tech Blog"
export REPOSITORY="${GITHUB_OWNER}/${PROJECT_ID}"

node ops/scripts/bootstrap-project.mjs
npm run ci
git diff --check
git status
```

초기화 결과:

- Juleswhile 구축 TASK 제거
- 반복 TASK Template만 유지
- Goal·TASK Issue 연결 제거
- Session·PR·Lock·Quota Evidence 초기화
- 프로젝트 ID와 저장소 주소 변경
- Core Automation 비활성
- Netlify 완료 검증 비활성

## 4. Bootstrap PR 생성

```bash
git add .
git commit -m "chore: bootstrap ${PROJECT_NAME} from Juleswhile"
git push -u origin "bootstrap/${PROJECT_ID}"

gh pr create \
  --repo "$REPOSITORY" \
  --base main \
  --head "bootstrap/${PROJECT_ID}" \
  --title "[TEMPLATE] Bootstrap ${PROJECT_NAME}" \
  --body "Bootstrap project-specific Juleswhile runtime state."
```

Bootstrap PR은 Control Plane 변경이므로 Validation 통과 후 `human-approval-required`가 적용된다. 실제 Diff를 검토한 뒤 승인한다.

```bash
PR_NUMBER="$(gh pr view --repo "$REPOSITORY" --json number --jq .number)"

gh pr review "$PR_NUMBER" \
  --repo "$REPOSITORY" \
  --approve
```

자기 PR을 GitHub Review로 승인할 수 없는 저장소에서는 검토 후 명시적 Owner Approval 라벨을 사용한다.

```bash
jq -n '{labels:["approval:owner-approved"]}' |
  gh api \
    --method POST \
    "repos/${REPOSITORY}/issues/${PR_NUMBER}/labels" \
    --input -
```

Custom Auto Merge가 Bootstrap PR을 병합한다. 직접 `gh pr merge`로 우회하지 않는다.

## 5. GitHub와 Jules 설정

GitHub Actions 권한:

```text
Settings → Actions → General → Workflow permissions
Read and write permissions
```

Jules GitHub App에서 새 저장소 접근을 허용한 뒤 API Key를 등록한다.

```bash
read -rsp "Jules API Key: " JULES_API_KEY
echo
printf '%s' "$JULES_API_KEY" | gh secret set JULES_API_KEY --repo "$REPOSITORY"
```

Source 이름은 API 결과에서 정확히 선택한다.

```bash
JULES_SOURCE_NAME="$({
  curl --fail --silent --show-error \
    -H "x-goog-api-key: ${JULES_API_KEY}" \
    "https://jules.googleapis.com/v1alpha/sources"
} | jq -r \
  --arg owner "$GITHUB_OWNER" \
  --arg repo "$PROJECT_ID" \
  '.sources[] | select(.githubRepo.owner == $owner and .githubRepo.repo == $repo) | .name' \
  | head -1)"

[[ "$JULES_SOURCE_NAME" == sources/* ]] || {
  echo "Jules Source not found" >&2
  exit 1
}

gh variable set JULES_SOURCE_NAME --repo "$REPOSITORY" --body "$JULES_SOURCE_NAME"
unset JULES_API_KEY
```

## 6. 안전한 초기 Variables

```bash
gh variable set AUTOMATION_ENABLED --repo "$REPOSITORY" --body false
gh variable set CONTENT_AUTOMATION_ENABLED --repo "$REPOSITORY" --body false
gh variable set JULES_MAX_CONCURRENCY --repo "$REPOSITORY" --body 1
gh variable set JULES_DAILY_NEW_TASK_BUDGET --repo "$REPOSITORY" --body 65
gh variable set JULES_DAILY_CORRECTION_BUDGET --repo "$REPOSITORY" --body 20
gh variable set JULES_DAILY_MAINTENANCE_BUDGET --repo "$REPOSITORY" --body 10
gh variable set JULES_DAILY_RESERVE --repo "$REPOSITORY" --body 5
gh variable set DEFAULT_MAX_CORRECTIONS --repo "$REPOSITORY" --body 2
gh variable set PR_MERGE_METHOD --repo "$REPOSITORY" --body squash
gh variable set ALLOW_FORK_PRS --repo "$REPOSITORY" --body false
```

## 7. Netlify 연결

Netlify에서 저장소를 연결한다.

```text
Production Branch: main
Build Command: npm run build
Publish Directory: dist
```

GitHub에 Secret과 Variable을 등록한다.

```bash
gh secret set NETLIFY_AUTH_TOKEN --repo "$REPOSITORY"
gh secret set NETLIFY_SITE_ID --repo "$REPOSITORY"
gh variable set NETLIFY_STATUS_ENABLED --repo "$REPOSITORY" --body true
gh variable set NETLIFY_PRODUCTION_BRANCH --repo "$REPOSITORY" --body main
gh variable set NETLIFY_POLL_ATTEMPTS --repo "$REPOSITORY" --body 20
gh variable set NETLIFY_POLL_INTERVAL_SECONDS --repo "$REPOSITORY" --body 15
```

## 8. Control Plane Preflight

Automation을 활성화하기 전에 반드시 실행한다.

```bash
gh workflow run "00-control-plane-preflight.yml" \
  --repo "$REPOSITORY" \
  -f require_netlify=true \
  -f require_automation_disabled=true

gh run watch --repo "$REPOSITORY"
```

Preflight는 다음을 확인한다.

- 기본 브랜치가 `main`
- Squash Merge 허용
- 필수 Workflow와 Script 존재
- `JULES_API_KEY` 존재
- `JULES_SOURCE_NAME`이 실제 Jules Source와 일치
- Netlify Secret과 Variable 존재
- Content Automation 비활성
- 최대 동시 Session 1
- `npm run ci` 성공

## 9. Committed State 활성화 PR

```bash
git switch main
git pull --ff-only origin main
git switch -c chore/enable-guarded-automation

node <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const path = "ops/state/project-state.json";
const state = JSON.parse(readFileSync(path, "utf8"));
state.status = "active";
state.phase = "goal-intake";
state.automation.enabled = true;
state.automation.contentEnabled = false;
state.automation.netlifyStatusEnabled = true;
state.automation.mode = "guarded";
state.automation.pausedReason = null;
state.quotas.maxConcurrent = 1;
state.updatedAt = new Date().toISOString();
writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
NODE

npm run ci
git diff --check
git add ops/state/project-state.json
git commit -m "chore: enable guarded Juleswhile automation"
git push -u origin chore/enable-guarded-automation

gh pr create \
  --repo "$REPOSITORY" \
  --base main \
  --head chore/enable-guarded-automation \
  --title "[MAINTENANCE] Enable guarded Juleswhile automation" \
  --body "Enable guarded runtime state after Control Plane Preflight passed."
```

검토·승인·자동 병합·Netlify 배포가 끝난 다음 Repository Variable을 활성화한다.

```bash
gh variable set AUTOMATION_ENABLED --repo "$REPOSITORY" --body true
```

## 10. 최초 Goal Issue

GitHub에서 `Project Goal` Issue Form으로 `[GOAL]` Issue를 생성한다.

정상 루프:

```text
Goal Issue
→ Planner Jules Session
→ Planner PR
→ PR metadata normalization
→ PR Validation
→ Validation 실패: bounded CI Correction Session
→ Validation 성공: explicit pr_validation_passed event
→ Custom Auto Merge
→ explicit pr_merged event
→ TASK Issues materialize
→ Next TASK selection
→ Jules TASK Session
→ 반복
```

## 11. 장애 판정 기준

- Draft PR: Validation Workflow가 자동으로 Ready 상태와 canonical metadata를 정규화한다.
- CI 실패: `03 · CI Correction`이 동일 PR 브랜치 기준으로 최대 보완 횟수까지 Jules Session을 생성한다.
- CI 성공 후 미병합: `04 · Auto Merge` Run과 PR의 `state:merge-blocked` 라벨을 확인한다.
- Goal PR 병합 후 TASK Issue 없음: `05 · Next TASK` Run의 `Synchronize TASK Issues` 단계 확인.
- TASK PR 병합 후 다음 TASK 없음: Production 배포 검증이 완료됐는지 확인한다. TASK PR은 Merge 직후가 아니라 Netlify 완료 후 다음 TASK로 넘어간다.

## 절대 금지

- 새 프로젝트 초기화를 위해 로컬 `main`을 직접 Push
- CI를 우회하는 직접 Merge
- 실패 테스트 삭제 또는 약화
- Unknown Dispatch Outcome에서 즉시 재Dispatch
- Preflight 전 `AUTOMATION_ENABLED=true`
