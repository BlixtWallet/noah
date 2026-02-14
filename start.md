# Agent Start Guide

Use this file as the first-step runbook for autonomous work in this repository.

## 1) First orientation

1. Read `AGENTS.md` fully.
2. Check current branch and working tree:
   - `git status --short --branch`
3. If the tree is dirty, do not revert unrelated user changes.

## 2) Environment boot

1. Install deps if needed:
   - `just install`
2. Optional Nix shell (recommended):
   - `nix develop`

## 3) Pick the correct validation path

- Client task:
  - Do not start Android/iOS simulators or emulators locally.
  - Validate with static checks: `just check`
- Server task:
  - Validate with local checks: `cargo fmt --check` and `cargo test`
- Integration/regtest task:
  - Only run `just setup-everything` if explicitly requested by the user.

## 4) Safe implementation protocol

1. Locate existing implementation before adding new files.
2. Keep changes local to the relevant layer:
   - UI/hooks/lib in `client/src`
   - API handlers in `server/src/routes`
   - SQL in `server/src/db`
3. Preserve existing auth, middleware, and background coordination behavior.
4. Reuse existing wrappers/hooks for wallet and server interactions.

## 5) Verification before commit

Run the smallest valid check set for the changed surface:

- Client-only edits:
  - `bun client check`
- Server-only edits:
  - `cargo fmt --check`
  - `cargo test`
- Cross-cutting edits:
  - both sets above

If server payload types changed, verify generated TS contract changes in:

- `client/src/types/serverTypes.ts`

## 6) Commit and PR protocol

1. Create a feature branch prefixed with `codex/`.
2. Commit with a concise descriptive message.
3. Push branch and open PR with:
   - what changed
   - why
   - validation commands run
   - any risks/follow-ups
4. After opening PR, monitor status checks:
   - `gh pr checks --watch`

## 7) Stop conditions

Pause and ask for clarification if:

- requested behavior conflicts with security/auth model,
- required environment secrets/services are missing,
- task needs destructive git actions.
