# Contributing to NLBP Chatbot

Thanks for your interest in this research prototype. It was built for a
specific Phase 1 study (see `README.md` and the technical specification
under `docs/`), so contributions that keep it easy to replicate or adapt
for similar studies are especially welcome.

## Reporting issues

Please include:
- What you expected to happen and what happened instead.
- Node.js version (`node --version`) and OS.
- Relevant terminal output — this app logs detailed error blocks
  (`=== ... ===`) to the console for anything involving the Anthropic API;
  please include one if applicable.

Never include a real `ANTHROPIC_API_KEY`, admin password, or any patient
data in an issue or pull request.

## Development setup

```bash
npm install
npm run setup
npm start
```

See `README.md` for the full setup and security checklist before running
this against real participants.

## Making changes

- Keep the patient-facing interview page and admin dashboard UI in
  Spanish — that's a deliberate choice for the study population, not an
  oversight.
- Keep the clinician's own reference fields (score, classification, notes)
  fully independent from anything the chatbot or an AI-generated
  evaluation produces — never pre-fill or suggest a value there. This is
  a methodological requirement (protecting the blinded reference
  standard), not just a UI preference.
- The red-flag safety escalation message is intentionally hard-coded
  (never model-generated) — keep it that way in `lib/orchestrator.js`.
- If you change the SQLite schema in `lib/db.js`, add a migration
  (`ALTER TABLE ... ADD COLUMN` guarded by `columnExists`) rather than
  assuming a fresh database, since existing deployments' data must
  survive an upgrade.
- This project deliberately avoids `better-sqlite3` in favor of Node's
  built-in `node:sqlite`, specifically to avoid a native-compilation step
  that breaks on machines without a C++ toolchain. Please don't
  reintroduce a native dependency without discussing it first.

## Pull requests

Small, focused PRs are easiest to review. Please describe what you tested
manually (there is no automated test suite yet) and confirm `npm install`
still completes with no native compilation step.

## License

By contributing, you agree your contributions will be licensed under the
project's MIT license (see `LICENSE`).
