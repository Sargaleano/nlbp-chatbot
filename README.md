# NLBP Chatbot Interview Prototype — Phase 1

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/60/Lumbar_region_in_human_skeleton.svg" alt="Location of the lumbar region in the human skeleton" width="180" />
</p>

<p align="center"><sub>
Image: <a href="https://es.wikipedia.org/wiki/Archivo:Lumbar_region_in_human_skeleton.svg">Lumbar region in human skeleton.svg</a>,
public domain, via Wikimedia Commons.
</sub></p>

A single-laptop research prototype for interviewing low back pain patients
through open, adaptive conversation and eliciting the same 7 clinical
domains as the self-reported items of the DN4-interview, for later
agreement analysis against DN4-interview-administered classification and a
blinded clinician reference standard.

**This is not a diagnostic device and is not intended for clinical use.**

## Screenshot

<p align="center">
  <img src="assets/images/screenshot-chat.png" alt="NLBP Chatbot patient interview screen" width="520" />
</p>

*The patient-facing interview screen — open conversation, no checklist, no diagnostic language.*

## 1. Before you start: operational security checklist

- [ ] **Full-disk encryption is enabled** on this laptop (BitLocker on
      Windows, FileVault on macOS). This software does not enable it for
      you — verify it yourself before any data collection.
- [ ] This laptop is used for **nothing else** during data collection.
- [ ] You have run `npm run setup` (see step 3) and written down the
      generated admin password — do not leave `.env` unset or edit it back
      to the `changeme` placeholder.
- [ ] You have decided and written down a **data retention period** for
      this study, with a calendar reminder to delete `data/sessions.db`
      (and any CSV exports) when that period ends. This software does not
      automate deletion — that is a researcher-managed policy.
- [ ] You understand that the mapping between study ID and patient
      identity is kept **entirely outside this software** (paper consent
      log or a separate spreadsheet held only by the PI). This app never
      stores patient name, ID number, date of birth, or contact
      information, anywhere.

## 2. Requirements

- Node.js **v22.13 or later** (this app uses the built-in `node:sqlite`
  module, which requires this version — check with `node --version`).
- An Anthropic API key.

## 3. Setup

```bash
npm install
npm run setup
```

`npm install` should complete with **no native compilation step**. If you
see anything mentioning `node-gyp`, Python, or a C++ compiler, something is
wrong — this app deliberately avoids `better-sqlite3` for exactly this
reason (see `lib/db.js`).

`npm run setup` creates your `.env` file for you:

- It asks for your Anthropic API key (you can leave it blank and fill it
  in later).
- It **generates a random admin password and prints it once** — write it
  down (this is the password whoever administers sessions will type in at
  `/admin`; the PI or a briefed research assistant). There is no
  multi-user support by design (see Section 2 of the specification this
  app was built from), so this single password is all anyone needs to
  access every session's transcript — treat it accordingly.
- It also generates a random session-cookie secret — no action needed
  there.
- Re-running `npm run setup` will ask before overwriting an existing
  `.env`, since that invalidates the current admin password.

If you'd rather set the password yourself instead of using the generated
one, edit `ADMIN_PASSWORD` in `.env` directly, or copy `.env.example` to
`.env` by hand and fill in all three values (`ANTHROPIC_API_KEY`,
`ADMIN_PASSWORD`, `SESSION_SECRET`).

### Changing the password or API key later

Two more commands, each of which touches only the one value named and
leaves everything else in `.env` — and the entire `data/sessions.db`
database — completely untouched:

```bash
npm run reset-password   # forgot the admin password, or want to rotate it
npm run set-api-key      # the Anthropic API key expired, was rotated, or was deleted from the PI's account
```

Both print the result to the console; restart the server afterward for
the change to take effect.

## 4. Running

```bash
npm start
```

The server binds **only to loopback addresses** (`127.0.0.1` and `::1`) —
it is not reachable from any other device on any network. Open:

- Admin dashboard: http://localhost:3000/admin
- Patient interview links are generated per-session from the dashboard.

The only outbound network call the app makes is to Anthropic's API.

## 5. Using it during a session

The admin dashboard UI is in Spanish (as is the patient-facing interview);
this section describes it in English for the technical reader. Screen
labels are given in quotes so they're easy to match against the running
app.

1. Log in at `/admin`.
2. Click **"Nuevo paciente"**, choosing whether consent will be captured
   on-screen by the patient, or was already captured on paper/verbally
   ("Ya se obtuvo en papel/verbalmente").
3. This generates two identifiers, shown together in the confirmation box:
   - A short **patient ID** (3 letters + 3 digits, e.g. `LBP482`) — write
     this down on your paper consent log or private spreadsheet next to
     the patient's real identity. This ID (and only this ID) is what links
     this software's records to a real patient, and that link lives
     entirely outside this software. It has its own copy button in the
     session table.
   - The full **interview link**, built around a long random session
     token. This token is what actually gates access to the patient's
     chat page (there is no password on the patient side), so it's
     intentionally long and is shown truncated in the session table for
     readability — the full value, and its own copy button, are always on
     that session's detail page ("Detalles").
4. Open the interview link on the laptop and hand it to the patient (or
   seat them at the already-open tab). You can also reopen it later from
   the dashboard's **"Iniciar"** / **"Reanudar"** button in the Acciones
   column of that session's row (opens in a new tab).
   - **External consent mode**: the chatbot's opening message appears
     immediately, with zero clicks.
   - **On-screen consent mode**: the patient sees the consent text, checks
     the box, and clicks once — that single action both records consent
     and starts the interview.
5. If the patient's tab is closed mid-interview, reopening the same link
   (or clicking "Reanudar" from the dashboard) resumes exactly where they
   left off — every turn is saved as it happens, and the model is always
   given the full conversation history, not a summary.
6. If the patient volunteers a red-flag symptom (see the specification's
   Section 1), the interview stops immediately and shows a fixed safety
   message asking them to alert you. This message is hard-coded and never
   generated by the model. Either way, once the interview ends, the chat
   input is replaced by a **"Cerrar"** button that closes the tab; if the
   browser blocks a script-driven close (normal for a tab the patient
   opened manually rather than one the admin opened via "Iniciar"), the
   button falls back to a plain "puede cerrar esta pestaña" message
   instead of silently doing nothing.
7. The dashboard's session list is bounded to a fixed-height, scrollable
   panel with a sticky column-header row, so a long and growing patient
   list scrolls within its own panel instead of pushing the page header,
   the "Nuevo paciente" box, and the footer summary out of view.
8. The **"Estado"** column shows the session's status (No iniciada / En
   curso / Completa / Alerta clínica) plus a progress bar, color-coded
   amber → green, and an "X/7 dominios" count of how many of the 7
   clinical domains have been resolved so far — a plain count of tracked
   data, not a diagnostic judgment.
9. The separate **"Inclusión"** column has a toggle switch, on by default,
   for whether that session is included in the CSV export. Flipping it off
   ("Excluida") is fully reversible and never deletes or alters the
   session's data — it only omits that row from the next export. The same
   toggle also appears on the detail page.
10. Use the dashboard's search box to find a session by patient ID or
    session ID once you have many sessions on file. The totals line below
    the table ("Total sesiones: N (no iniciadas: …, en curso: …,
    completadas: …, alerta clínica: …)") always reflects every session on
    file, independent of the current search filter.
11. After the interview, and after the DN4-interview has been administered
    separately and the blinded clinician reference is available, open the
    session's detail page ("Detalles") to review the full transcript and
    the **"Resumen DN4-interview"** panel, which has two side-by-side
    subpanels:
    - **Clínico**: the fields you fill in by hand — DN4 score (0–7),
      "Clasificación clínica", and notes, saved with "Guardar datos
      clínicos". This is the independent, blinded reference standard the
      study is validated against, and nothing here is ever pre-filled or
      suggested by the chatbot's own output.
    - **Chatbot**: a 0–7 sub-score (count of "yes" domains) is always
      shown. The classification itself is **not** computed automatically —
      click **"Generar evaluación con IA"** to have Claude analyze the
      full transcript and domain values and produce a tentative
      classification (neuropathic/nociceptive/ambiguous, the same
      vocabulary as the clinician's own dropdown) plus a written
      rationale. This is a genuine model call, not a fixed formula, so
      each generation consumes a small amount of API usage — it's cached
      per session (so reopening the page doesn't re-run it) and only
      recomputed if you click "Regenerar". The result stays hidden behind
      an eye icon by default and is never shown next to, or used to
      pre-fill, the clinician's own field, to avoid anchoring that
      supposedly-blinded judgment.
12. Use **"Exportar CSV"** on the dashboard for the full dataset (excluding
    any sessions currently toggled out of analysis) when ready for
    analysis. The export includes per-domain slot values, the clinician's
    reference fields, and — only for sessions where you've already clicked
    "Generar evaluación con IA" — the chatbot's AI-generated classification
    and its generation timestamp; sessions without a generated evaluation
    export with that column blank rather than triggering new API calls
    during export.
13. The **"Ayuda"** and **"Acerca de..."** links at the bottom of the
    dashboard (and on the detail page) open short reference dialogs: Ayuda
    covers on-screen actions and the `npm` commands; "Acerca de este
    software" describes NLBP, the DN4-interview (with authoritative
    references), the tool's purpose, and author/version/license — meant
    for anyone who clones this from GitHub to replicate or adapt the
    study, not just this deployment's own admin.

### Admin authentication note

The admin dashboard uses a single signed session cookie (set only after a
successful password login) to keep you logged in between page loads — this
is the "session-cookie-based login" called for in the specification, not
analytics or tracking, carries no patient data, and is only ever
transmitted to `localhost` since the app never binds beyond loopback. The
patient-facing interview page sets no cookie and has no login at all;
access there is gated purely by the length of its own session URL.

## 6. Backups (manual — this is not automated)

This software does not back up its own data. That is a deliberate choice,
not an oversight: automated backup destinations (cloud sync, network
shares) would conflict with the localhost-only, single-laptop design in
Section 2. Back up **the entire `data/` folder** (not just `sessions.db`
alone) yourself, on a plain schedule you set as part of your protocol —
for example, at the end of each day of data collection — to encrypted
external media, never to a cloud sync folder. Losing this folder means
losing every transcript and slot value collected so far, with no
recovery path, so treat this step as part of routine session wrap-up, not
an afterthought. This is a good candidate for its own checklist item in
the fuller user/technical guides.

## 7. What this software deliberately does not do

See Section 8 of the build specification. In short: no voice/ASR/TTS, no
cloud hosting, no multi-user roles, no automated data retention/deletion,
no trust or cost-effectiveness instrumentation. These are out of scope for
Phase 1.

## 8. Project layout

```
server.js            Express app: mounts public + admin routes, binds to localhost
lib/db.js             node:sqlite persistence (no native compilation), patient IDs, exclude toggle,
                        updated_at tracking, cached AI classification
lib/domains.js         7 DN4-interview domains + Spanish labels + red-flag list
lib/orchestrator.js     conversation turns, slot-tracking, hard-coded safety escalation,
                        admin-triggered exploratory classification (classifySession)
lib/adminAuth.js        single-password session-cookie login
lib/envUtil.js          shared .env read/update helper (used by setup/reset-password/set-api-key)
lib/setup.js            npm run setup -- first-time .env creation
lib/resetPassword.js    npm run reset-password -- rotate only the admin password
lib/setApiKey.js        npm run set-api-key -- rotate only the Anthropic API key
public/                 patient interview page (HTML/CSS/vanilla JS), Spanish-only UI
admin/                  admin login, dashboard (mini-database), session-detail ("ficha") pages,
                        shared "Acerca de..." (about.js) and "Ayuda" (help.js) modals, Spanish-only UI
data/sessions.db        SQLite database (git-ignored) -- back up the whole data/ folder, see Section 6
LICENSE                 MIT license (this project is meant to be published/forked on GitHub)
CONTRIBUTING.md         Contribution guidelines
.github/ISSUE_TEMPLATE/ Bug report and feature request templates
docs/                   User guide and technical specification (Spanish, .docx)
assets/images/          README images (screenshot, lumbar-region diagram)
```

## 9. Command reference (for the user/technical guides)

| Command | Effect | Touches `data/sessions.db`? |
|---|---|---|
| `npm install` | Installs dependencies (no native compilation) | No |
| `npm run setup` | First-time `.env` creation: prompts for API key, generates admin password + session secret | No |
| `npm run reset-password` | Regenerates only the admin password | No |
| `npm run set-api-key` | Updates only the Anthropic API key | No |
| `npm start` | Runs the server on `localhost` (loopback only) | Reads/writes normally |

## 10. Further documentation

Two fuller documents (Spanish) live under [`docs/`](./docs):

- [`guia-usuario-nlbp-chatbot.docx`](./docs/guia-usuario-nlbp-chatbot.docx) — user guide for the researcher/admin running sessions day to day.
- [`especificacion-tecnica-nlbp-chatbot.docx`](./docs/especificacion-tecnica-nlbp-chatbot.docx) — technical specification (architecture, data model, API, security) for anyone extending or auditing the code.

## 11. License

MIT — see [`LICENSE`](./LICENSE). Update the placeholder copyright holder in that file (and the
author/contact line in the app's "Acerca de este software" dialog) before publishing publicly.
