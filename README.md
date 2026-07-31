# Roaming Document Control Center — IR.21 / RAEX Diff & Approval Portal

A working prototype for **Step 1 (ingestion + diff checking)** and **Step 2 (agentic, domain-scoped
approval workflow)** of a telecom roaming document control system. Step 3 (customer steering/routing
based on operator relationships) is intentionally out of scope for this build.

## What it does

1. **Ingestion** — Operators submit IR.21 or RAEX documents in XML, XLSX, DOCX, or PDF format, either
   via **push** (proactive upload) or **heartbeat** (scheduled poll — modeled the same way in this
   prototype, distinguished by the `source` field on each version).
2. **Diff engine** — Every new version is parsed into a flat `field → value` map and compared
   field-by-field against the previous version. Every field is auto-categorized into one of six
   business domains (see below) with a severity (`critical` / `major` / `minor`).
3. **Agentic approval workflow** — For every diff, the portal builds an approval chain from whichever
   categories actually changed, and emails **only the relevant domain's changes** to that domain's
   approver (CTO, CFO, CMO, Legal Counsel, CISO, Roaming Ops Manager). Same-priority approvers run in
   parallel; later stages wait until the earlier stage fully clears. Each email contains one-click
   Approve/Reject magic links — no login required.
4. **Monitoring** — A full dashboard shows the document pipeline (Kanban), every diff, every approval
   step's status, a complete audit log, and an email log showing exactly what was sent to whom.

## Categories → approvers (defaults, editable in Settings)

| Category | Default role | Typical fields |
|---|---|---|
| Network/Technical | CTO | HLR/GT, signalling point code, GRX/IPX provider, APN, IOT contact |
| Security | CISO | Fraud contact, steering-of-roaming, CAMEL, encryption |
| Commercial | CMO | Roaming agreement type, partner tier, contract terms |
| Financial/Billing | CFO | Wholesale rates, currency, settlement contact |
| Legal/Compliance | Legal Counsel | Regulatory clauses, jurisdiction, signatories |
| Operations | Roaming Ops Manager | Contacts, effective dates, support hours |

## Project layout

```
ir21-portal/
├── backend/                  # Node/Express + SQLite app (this is what you run)
│   ├── server.js
│   ├── db.js                 # schema + seed data
│   ├── services/
│   │   ├── diffEngine.js     # field extraction + comparison
│   │   ├── categorize.js     # keyword → category/severity rules
│   │   ├── workflowEngine.js # approval chain builder + advancer
│   │   ├── emailService.js   # nodemailer, SMTP or simulated
│   │   └── parsers/          # xml / xlsx / docx / pdf → flat field map
│   ├── routes/                # REST API
│   ├── public/                 # frontend SPA (vanilla HTML/CSS/JS, no build step)
│   ├── .env.example
│   └── data/, uploads/         # created at runtime (gitignored)
└── sample-documents/          # ready-to-use IR21/RAEX v1→v2 pairs, one per format
    ├── raex-xml/OrangeFrance_RAEX_v1.xml, v2.xml
    ├── ir21-xlsx/TelefonicaEspana_IR21_v1.xlsx, v2.xlsx
    ├── ir21-docx/TMobileUS_IR21_v1.docx, v2.docx
    └── ir21-pdf/AirtelIndia_IR21_v1.pdf, v2.pdf
```

## Running it

```bash
cd backend
npm install
cp .env.example .env      # edit if you want real email — see below
node server.js
```

Open **http://localhost:4021**.

## Trying the demo end-to-end

1. **Operators** page → add an operator (or use one from the sample set — Orange France, Telefónica
   España, T-Mobile US, Airtel India — names match the sample documents).
2. **Settings** page → put in real email addresses for at least one or two categories (e.g. your own
   email as the "CTO" and "CFO" approver, for testing). Leave others blank if you don't have more
   addresses handy — the engine skips notifying roles with no email configured.
3. **Documents** page → upload the `_v1` file for an operator first (stored as the baseline, no diff
   yet), then upload the matching `_v2` file. The diff engine runs automatically and the approval
   workflow is created and (simulated- or real-)emailed immediately.
4. **Pipeline** page → watch the document move from "Pending workflow" → "In approval" → "Approved".
5. **Documents → open the document → view diff** → see every changed field, grouped by category, plus
   the live approval chain with each step's status.
6. **Approvals** page → see every approval step across every document.
7. **Audit & Email log** → see the full audit trail and preview exactly what was emailed to each
   approver — this is also how you verify the demo without needing real SMTP configured.
8. Click **Approve** or **Reject** in the email (or open the same link from the Email log preview) to
   advance the workflow — the next stage automatically fires its own emails once the current stage
   fully clears.

## Enabling real email delivery

The app ships in **simulated mode** by default: every approval email is fully generated and logged
(visible in **Audit & Email log**) but not actually delivered, so you can demo the complete workflow
with zero setup.

To send real email, edit `backend/.env` with SMTP credentials from any standard provider —
**SendGrid**, **AWS SES**, and **Postmark** are the common choices for this kind of transactional
workflow. Examples are commented in `.env.example`. Once `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are
set, the sidebar's mailer pill flips from "Simulated mode" to "SMTP live," and every subsequent
approval email is actually sent — including the Approve/Reject magic links, which POST back to
`PORTAL_BASE_URL` (set this to your real deployed URL, not `localhost`, once you're not running
locally).

## Push vs. heartbeat — what they actually mean, and how to try both

In real GSMA roaming-exchange systems, these are two different *directions* of automation:

- **Push** — the operator's own system calls your API the moment they publish a new document. No
  human fills out a form; their publishing workflow triggers an HTTP request to you directly.
- **Heartbeat** — the reverse: *your* system checks in on the operator's side on a schedule (an
  SFTP mailbox, a shared drive, an API endpoint) and pulls in whatever's new. Common when an
  operator's own systems can't push to you, so you poll them instead.

This portal simulates both, fully working, without needing a real operator's IT infrastructure:

**Push** is the `/api/documents/upload` endpoint — the same one the Documents page's upload form
calls. In production, an operator's system would call this directly with an API key instead of a
human clicking a button. Try it as a script would:
```bash
curl -X POST http://localhost:4021/api/documents/upload \
  -F "operator_id=<id>" -F "doc_type=RAEX" -F "source=push" \
  -F "file=@sample-documents/raex-xml/OrangeFrance_RAEX_v1.xml"
```

**Heartbeat** is a real background poller (`backend/services/heartbeatPoller.js`) that starts
automatically with the server. Every operator set to `ingest_mode: heartbeat` gets its own folder
at `backend/heartbeat-watch/<operator_id>/` (visible on the Dashboard's "Heartbeat poller" card, and
next to each heartbeat operator on the Operators page). Every `HEARTBEAT_INTERVAL_MS` (20 seconds by
default), the poller scans every heartbeat operator's folder and automatically ingests any file
that's new or has changed since the last scan — running it through the exact same diff + workflow
pipeline as a manual upload, tagged `source: heartbeat`.

**To try it with the sample data, no clicking required:**
1. Add an operator on the Operators page with **Ingest mode = Heartbeat** (e.g. "Orange France").
2. Copy its watch folder path from the table (or the Dashboard card).
3. In a terminal: `cp sample-documents/raex-xml/OrangeFrance_RAEX_v1.xml <that watch folder>/`
4. Wait up to 20 seconds (or click **Scan now** on the Dashboard) — the document appears on the
   Documents page automatically, stored as the baseline version. No upload button was clicked.
5. Now simulate the operator publishing an update: `cp sample-documents/raex-xml/OrangeFrance_RAEX_v2.xml <watch folder>/OrangeFrance_RAEX_v1.xml`
   (overwriting the same filename, the way a real operator's system would republish the same
   document with new content).
6. Within 20 seconds, the poller detects the file changed, runs the diff, and starts an approval
   workflow automatically — check the Pipeline page or the Audit log to watch it happen.

This is real automation, not a simulated animation — the poller is a genuine `setInterval` loop
reading the filesystem and calling the same ingestion code the manual upload button calls. In a real
deployment, `heartbeatPoller.js` is the file you'd modify to poll an SFTP server or REST endpoint
instead of a local folder — the rest of the pipeline (diff, categorize, route, email) doesn't change.

Config: `HEARTBEAT_ENABLED` (default `true`) and `HEARTBEAT_INTERVAL_MS` (default `20000`) in `.env`.
Each operator also has a **default document type** (IR21 or RAEX) used only for heartbeat ingestion,
since there's no upload form to pick it from — set it when adding the operator.

## Deleting data, and undo/redo

- **Delete an operator** (Operators page) — cascading delete: removes the operator and every
  document, version, diff, diff item, approval workflow, and approval step tied to it.
- **Delete a document** (Documents page) — cascading delete of that document's versions, diffs,
  diff items, workflows, and steps, without touching the operator.
- **Reset all data** (Settings page, "Danger zone") — wipes every operator, document, diff, and
  approval record in one click. Category → approver routing settings are kept.
- **Undo / Redo** (sidebar, bottom-left) — every delete or reset above is reversible **once**. This
  is a single-level undo, not a full history stack: doing a second destructive action overwrites
  the undo slot, so you can't chain "undo, undo, undo" back through several actions. The undo slot
  itself is stored in the SQLite database (`undo_slot` table), so it survives a server restart.
- Audit log and email log entries are never deleted by cascading deletes or reset — they're kept
  as an immutable historical record, and get their own "deleted"/"reset" entry logged when you use
  these features.

## Where your data is actually stored

Everything lives in two places inside `backend/`, both created automatically the first time you
run `node server.js` — no separate database software or account needed:

- `backend/data/ir21_portal.db` — a single **SQLite** file holding every table (operators,
  documents, diffs, approval steps, audit log, etc.). `better-sqlite3` (installed via
  `npm install`) opens or creates this file and runs the `CREATE TABLE IF NOT EXISTS` statements
  in `db.js` on every boot — safe to run repeatedly, it only adds tables that don't exist yet.
- `backend/uploads/` — every document you upload, saved as-is with a timestamp prefix.

To fully wipe everything by hand (outside the app's own Reset button), stop the server and delete
`backend/data/ir21_portal.db*` and the contents of `backend/uploads/`, then restart — the app
recreates a blank database with the default category-routing rules.

To inspect the database directly, use a free tool like **DB Browser for SQLite**
(https://sqlitebrowser.org) and open `backend/data/ir21_portal.db`.

## Notes on the diff engine

- **XML** (RAEX-style): every tag is flattened into a dotted path (`NetworkTechnical.HLR_GlobalTitle`).
- **XLSX**: expects one sheet per category, with column A = field label and column B = value (the
  sample files follow this convention exactly).
- **DOCX / PDF**: expects `SECTION HEADER` lines (short, all-caps, no colon) followed by
  `Field Name: value` lines — this mirrors how real IR.21 master documents and PDFs are laid out. The
  sample generator scripts in each `sample-documents/ir21-*/gen_*.{js,py}` folder show exactly how to
  produce documents in this format if you want to generate more test data.
- Every field is matched against a keyword list in `services/categorize.js` to assign a category and
  default severity — extend that file to tune categorization for your own document conventions.

## What's deliberately not built (Step 3)

The steering/routing decision — distributing customers to operators based on commercial terms and
relationship health — is out of scope here. The dashboard and audit log are structured so that data
(approved agreements, financial terms per operator) is already available if you build that as a
follow-on step.
