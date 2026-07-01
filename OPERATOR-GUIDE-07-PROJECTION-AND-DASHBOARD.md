# Juleswhile Operator Guide 07 · Projection And Dashboard
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
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
export PR_NUMBER="123"

gh pr checks "$PR_NUMBER" \
  --repo "$REPOSITORY"
```
Variables:
```bash
gh variable list \
  --repo "$REPOSITORY"
```
---
