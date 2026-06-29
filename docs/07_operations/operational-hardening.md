# Operational Hardening

Updated: 2026-06-29

## SHA Pinning Policy

All external GitHub Actions in `.github/workflows/**` must use immutable 40-character commit SHAs.

Allowed:

- `uses: ./local-action`
- `uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7`

Not allowed:

- `uses: actions/checkout@v7`
- `uses: actions/setup-node@main`
- `uses: owner/action@latest`

Validation:

```bash
npm run validate:supply-chain
```

When updating an action:

1. Resolve the intended tag using `git ls-remote`.
2. Use the final commit SHA, not an annotated tag object.
3. Keep the original version as a YAML comment.
4. Run `npm run validate:supply-chain` and `npm run ci`.

## Workflow Permission Policy

Default workflow permissions should be empty or minimal. Job-level permissions should be used when one job needs broader access than the rest of the workflow.

Expected patterns:

- Read-only validation: `contents: read`
- Issue state updates: `issues: write`
- PR merge automation: `contents: write`, `pull-requests: write`, `issues: write`
- Actions status lookup: `actions: read`
- OIDC: only when artifact attestation or deployment explicitly requires it

`permissions: write-all` is prohibited by `npm run validate:supply-chain`.

## Checkout And Shell Hardening

Checkout steps that do not push code must set:

```yaml
persist-credentials: false
```

Shell steps should use:

```bash
set -Eeuo pipefail
```

Untrusted GitHub input such as Issue bodies, PR titles, labels, `workflow_dispatch` inputs, and `repository_dispatch` payloads must be passed through `env`, JSON files, or argument arrays. Do not interpolate those values directly into a shell script body.

## Dependabot PR Handling

Dependabot is configured for:

- npm
- GitHub Actions

Dependabot PRs are not Jules TASK PRs and must not be auto-merged by the Juleswhile custom auto-merge flow.

Review requirements:

- Confirm the author is exactly `dependabot[bot]`.
- For npm updates, confirm changed files are limited to `package.json` and `package-lock.json` unless separately justified.
- For GitHub Actions updates, confirm workflow and Dependabot files only.
- Run `npm run ci` and `npm run validate:supply-chain`.
- Keep `approval:owner-approved` off until a human review is complete.

## SBOM, Audit, And Hash Evidence

Generate a CycloneDX SBOM:

```bash
npm --silent run sbom:cyclonedx > dist/sbom.cdx.json
```

Generate package-lock and build artifact hashes after `npm run build`:

```bash
npm run hash:artifacts
```

Run dependency audit:

```bash
npm audit
```

TASK-008 baseline audit on 2026-06-29 reported zero vulnerabilities after `npm ci`.

## Direct Push Response

Main direct-push enforcement is not available through repository rulesets or branch protection on the current private repository plan. The active control is detective:

- `09 - Main Integrity Audit` checks `main` pushes.
- Commits associated with merged PRs pass.
- Owner direct pushes are recorded as allowed by current policy.
- Unauthorized direct pushes create an incident issue and fail the workflow.

This must not be documented as server-side branch protection.

## Core Automation Activation Criteria

Core automation can be enabled only after all of the following are true:

- TASK-008 is completed in production.
- TASK-009 live pilot is completed in production.
- `npm run ci` passes on latest `main`.
- `npm run validate:supply-chain` passes.
- External Actions are all full SHA pinned.
- No lifecycle label conflicts exist.
- No missing canonical TASK issues exist.
- No unresolved dispatch intent exists.
- No duplicate Jules Session exists.
- Active sessions, active PRs, and resource locks are empty.
- Netlify Production is successful.

When enabled:

- Core automation: true
- Content automation: false
- Mode: guarded
- Max parallel tasks: 1

## Unknown Dispatch Outcome

If Jules Session creation returns timeout, connection reset, HTTP 408, HTTP 425, or HTTP 5xx, do not dispatch again blindly.

Required response:

1. Run reconciliation.
2. Check quota ledger committed/released state.
3. Check dispatch intent comments.
4. Check canonical Session marker count.
5. Keep the TASK blocked until the unknown outcome is resolved.

## Rollback

Rollback is PR-based unless emergency owner intervention is required.

Preferred rollback:

1. Create a correction TASK or incident.
2. Revert the problematic PR on a branch.
3. Run full validation.
4. Merge through the normal PR path.

Emergency owner direct push remains technically possible, but it must be followed by incident documentation and a projection rebuild.
