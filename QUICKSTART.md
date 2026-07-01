# Juleswhile Portable Project Quick Start

This is the canonical setup path for starting a new Juleswhile-powered project from this repository.

The only permitted direct push to `main` is the initial repository seed created by this quickstart. After that seed, all project changes must go through GitHub Issues, Jules Sessions, Pull Requests, validation, and merge automation.

## 1. Clone And Reset Git History

```bash
export PROJECT_ID="ai-tech-blog"
export PROJECT_NAME="AI Tech Blog"
export GITHUB_OWNER="YOUR_GITHUB_ID"
export REPOSITORY="${GITHUB_OWNER}/${PROJECT_ID}"

git clone https://github.com/loopwhile/Juleswhile.git "$PROJECT_ID"
cd "$PROJECT_ID"
rm -rf .git
git init -b main
git status
```

Create the empty GitHub repository before the first push.

```bash
gh repo create "$REPOSITORY" --private --source . --remote origin
```

## 2. Bootstrap The Template Runtime

```bash
npm ci

export PROJECT_ID="ai-tech-blog"
export PROJECT_NAME="AI Tech Blog"
export REPOSITORY="${GITHUB_OWNER}/${PROJECT_ID}"

node ops/scripts/bootstrap-project.mjs --dry-run
node ops/scripts/bootstrap-project.mjs --apply

# 멱등성 확인: changed=false가 출력되어야 한다.
node ops/scripts/bootstrap-project.mjs --apply

npm run ci
git diff --check
git status
```

Bootstrap resets project-specific runtime state:

- Completed Juleswhile construction TASK History shards are removed.
- A new empty `ops/tasks/task-history.yaml` Runtime Manifest is created.
- Reusable TASK templates remain available but disabled.
- Goal, TASK Issue, Session, PR, lock, and quota evidence is cleared.
- Project ID, package metadata, and repository coordinates are updated.
- Core automation, content automation, and Netlify status checks remain disabled.
- Jules max concurrency remains `1` for the smoke phase.

## 3. Initial Main Seed

This is the one allowed direct `main` push.

```bash
git add .
git commit -m "chore: seed ${PROJECT_NAME} from Juleswhile"
git push -u origin main
```

Do not continue feature or control-plane work on `main` after this point.

## 4. GitHub And Jules Settings

Set GitHub Actions permissions:

```text
Settings -> Actions -> General -> Workflow permissions -> Read and write permissions
```

Allow the Jules GitHub App to access the new repository, then register the API key as a secret.

```bash
read -rsp "Jules API Key: " JULES_API_KEY
echo
printf '%s' "$JULES_API_KEY" | gh secret set JULES_API_KEY --repo "$REPOSITORY"
```

Select the exact Jules Source name from the API response.

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

## 5. Safe Initial Variables

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

The budget total is `100` daily Jules task slots. Keep concurrency at `1` until preflight, smoke validation, Jules Source verification, and Netlify deployment verification pass.

## 6. Netlify Connection

Connect the repository in Netlify:

```text
Production Branch: main
Build Command: npm run build
Publish Directory: dist
```

Register Netlify runtime configuration in GitHub without printing secret values.

```bash
gh secret set NETLIFY_AUTH_TOKEN --repo "$REPOSITORY"
gh secret set NETLIFY_SITE_ID --repo "$REPOSITORY"
gh variable set NETLIFY_STATUS_ENABLED --repo "$REPOSITORY" --body true
gh variable set NETLIFY_PRODUCTION_BRANCH --repo "$REPOSITORY" --body main
gh variable set NETLIFY_POLL_ATTEMPTS --repo "$REPOSITORY" --body 20
gh variable set NETLIFY_POLL_INTERVAL_SECONDS --repo "$REPOSITORY" --body 15
```

## 7. Control Plane Preflight

```bash
gh workflow run "00-control-plane-preflight.yml" \
  --repo "$REPOSITORY" \
  -f require_netlify=true \
  -f require_automation_disabled=true

gh run watch --repo "$REPOSITORY"
```

Preflight must confirm:

- The default branch is `main`.
- Required workflows, scripts, schemas, and TASK manifests exist.
- `JULES_API_KEY` exists.
- `JULES_SOURCE_NAME` matches the Jules Source.
- Netlify secrets and variables exist.
- Content automation is disabled.
- `JULES_MAX_CONCURRENCY` is `1`.
- `npm run ci` passes.

## 8. Enable Guarded Operation By PR

After preflight, create a normal Pull Request to enable committed runtime state.

```bash
git switch -c chore/enable-guarded-automation
node ops/scripts/task-state-transition.ts --help >/dev/null || true
```

The PR should set:

- `ops/state/project-state.json` status to `active`.
- Phase to `goal-intake`.
- `automation.enabled` to `true`.
- `automation.contentEnabled` to `false`.
- `automation.netlifyStatusEnabled` to `true`.
- `quotas.maxConcurrent` to `1`.

After the smoke TASK and Netlify deployment verification pass, a later human-approved PR may raise `JULES_MAX_CONCURRENCY` up to `15`. Do not raise the daily budget above the documented `100` total.
