# Juleswhile Operator Guide 03 · Runtime Operations
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
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
node --input-type=module <<'NODE'
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
