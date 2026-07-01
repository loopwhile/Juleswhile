# Juleswhile Operator Guide 06 · Deployment
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
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
