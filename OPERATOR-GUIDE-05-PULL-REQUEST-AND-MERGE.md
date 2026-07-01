# Juleswhile Operator Guide 05 · Pull Request And Merge
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
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
export PR_NUMBER="123"

gh pr ready "$PR_NUMBER" \
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
  "repos/${REPOSITORY}/issues/${PR_NUMBER}/labels" \
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
  -f pr_number="$PR_NUMBER" \
  -f dry_run="false" \
  -f force="false"
```
직접 `gh pr merge`로 정책을 우회하지 않는다.
---
