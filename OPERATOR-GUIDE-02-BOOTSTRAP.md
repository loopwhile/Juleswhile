# Juleswhile Operator Guide 02 · Bootstrap
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
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
git init -b main
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
체크인된 Bootstrap 스크립트를 실행한다. 이 스크립트는 include-aware TASK Manifest를 사용하므로 문서에 별도 초기화 로직을 복제하지 않는다.
```bash
npm ci

node ops/scripts/bootstrap-project.mjs --dry-run
node ops/scripts/bootstrap-project.mjs --apply

# 멱등성 확인: changed=false가 출력되어야 한다.
node ops/scripts/bootstrap-project.mjs --apply

npm run ci
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
templates: 5
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
---
# 12. Jules Source 확인
Source 이름을 추측하지 않는다.
API 응답에서 현재 `GITHUB_OWNER`와 `GITHUB_REPO`가 정확히 일치하는 Source 하나를 선택한다.
```bash
SOURCES_JSON="$(
  curl \
    --fail \
    --silent \
    --show-error \
    --header "x-goog-api-key: ${JULES_API_KEY}" \
    "https://jules.googleapis.com/v1alpha/sources"
)"

JULES_SOURCE_NAME="$(
  jq -er \
    --arg owner "$GITHUB_OWNER" \
    --arg repo "$GITHUB_REPO" \
    '
      [
        .sources[]?
        | select(
            .githubRepo.owner == $owner
            and .githubRepo.repo == $repo
          )
        | .name
      ]
      | if length == 1
        then .[0]
        else error(
          "Expected exactly one matching Jules Source"
        )
        end
    ' <<<"$SOURCES_JSON"
)"

[[ "$JULES_SOURCE_NAME" == sources/* ]] || {
  echo "ERROR: Jules Source를 찾지 못했습니다." >&2
  exit 1
}

gh variable set JULES_SOURCE_NAME \
  --repo "$REPOSITORY" \
  --body "$JULES_SOURCE_NAME"
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
검증 후 로컬 변수 제거:
```bash
unset JULES_API_KEY
unset JULES_SOURCE_NAME
```
Secret 값이 다시 출력되지 않는 것이 정상이다.

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
