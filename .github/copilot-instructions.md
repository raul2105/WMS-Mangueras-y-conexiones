# Copilot Instructions for WMS-SCMayher

## Context Priority
Read these files first, in this order:
1. `docs/ai/project-context.md`
2. `docs/ai/methodologies.md`
3. `docs/ai/aws-baselines.md`
4. `docs/ai/gcp-baselines.md`

## Source Rules
- Google Drive canonic docs are the global master source.
- `docs/ai/*` is the local operational mirror for this repo.
- Do not duplicate context already documented.

## Work Rules
- Prefer minimal, reversible, and verifiable changes.
- Evaluate and report: direct impact, indirect impact, and regression risk.
- Keep business behavior intact unless change request explicitly modifies it.
- Update local docs when operational behavior or risk profile changes.
- For AWS/GCP tasks, default to user-level operational guidance (practical, sequential, actionable).
- Avoid deep cloud architecture/theory unless explicitly requested.
- If deployment is required and safe, deploy directly; if blocked, report exact blocker and next minimum step.
- Keep Jira, GitHub, local state, and cloud deployment state synchronized and explicitly report discrepancies.

## Repo Reality Baseline
- Runtime and tests are PostgreSQL-first in this repository.
- Next.js App Router + TypeScript + Prisma are core stack constraints.
- Use canonical repo commands and validation gates defined in `docs/ai/project-context.md`.
