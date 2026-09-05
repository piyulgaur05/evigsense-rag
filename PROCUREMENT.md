# Procurement

The procurement portal is a second product inside the same application. It carries a purchase from the moment somebody asks for something to the moment the invoice is cleared, through fourteen stages and sixteen roles, with every movement recorded.

It is reached from its own door on the landing page — not from the document workspace header — and it has its own sign-in, its own shell, and its own navigation. A person who only does procurement never sees the document workspace, and vice versa.

- **Branch:** `feat/procurement`
- **Backend:** Postgres in the existing self-hosted Supabase stack. No new service.
- **Migrations:** `supabase/migrations/20260903120000_procurement_foundation.sql` and the four slices after it.
- **Front end:** `src/features/procurement/` and `src/pages/procurement/`.

---

## 1. What is built, and what is not

**Built (the foundation slice).**

- The full fourteen-stage lifecycle as data, not code: stages, their order, their entry statuses, their timers, the legal moves between them, and every stage action, all stored as rows.
- The stage engine: one database function that validates a decision, moves the case, and writes the trail.
- Sixteen roles, twenty-five permissions, and the role-to-permission matrix.
- Row-level security on every table, with a single visibility predicate the whole schema shares.
- The portal: sign-in, a role-specific dashboard, queues, a register of all cases, a "waiting on you" worklist, the case file with a stage index, an action bar, a clarification thread, an audit trail, and case documents that ride the existing document ingest pipeline.
- The requisition stage in full: the requisition record, an itemised bill of quantities that prices itself, the budget ledger it is charged against, supporting documents on the case, and a completeness gate the database enforces before finance ever sees it.
- **Reading a bill of quantities out of a file** — a supplier's spreadsheet, a CSV, or a scope of work as a PDF — through the product's own model, offered back for review rather than written straight into the case.
- **Asking questions about a case.** Everything attached goes through the ordinary ingest pipeline, and the assistant answers over the case's own paperwork for anyone allowed to see the case.
- The case activity timeline — decisions, movements, questions, send-backs and paperwork on one rail, at every stage.
- `/procurement/insights`: pipeline, intake, spend, time at each desk, budget headroom and stage aging, all counted under the reader's own visibility.
- Demo accounts, one per role, seeded automatically.

**Not built yet (later slices of the plan).**

- The working detail of the stages after the requisition: tenders and bids, technical evaluation grids, quotations and the comparative statement, committee meetings and votes, negotiation rounds, proposals, purchase orders, goods receipt notes, payment recommendations. The stages exist and a case moves through all of them; each one currently shows the case summary and the requisition it came from rather than its own working form.
- `/procurement/admin`. Budget heads, lookups, roles and committee rosters are database work today.
- Digital signature capture. Actions that should carry a signature are flagged `requires_signature` in the data, and the flag is recorded, but nothing enforces it yet.
- Stage guards beyond the requisition. `procurement_stage_actions.guard_function` is wired and `mpr.submit` uses it; the later stages have no preconditions yet beyond permission and remarks.
- SLA escalation. `sla_hours` and `escalation_role` are stored per stage but nothing acts on them.

---

## 2. Getting in

| Where | What it is |
|---|---|
| `/` → the "procurement portal" band | The entry point on the landing page. Explains the ten-step chain and offers the door. |
| `/procurement/sign-in` | The portal's own sign-in. Public. Somebody already signed in is offered the portal rather than asked for a password again, and is told plainly if they hold no procurement desk. |
| `/procurement` | The portal dashboard, shaped by the role signed in. |
| `/procurement/register` | Every case the person is allowed to see, filterable. |
| `/procurement/inbox` | "Waiting on you" — open cases sitting at a stage this person can act on, oldest first. |
| `/procurement/queue/:queueKey` | One desk's queue. Twelve queue keys, listed in §5.4. |
| `/procurement/insights` | The pipeline in charts: workload, intake, spend, time at each desk, budget headroom, aging. |
| `/procurement/new` | Raise a requisition. Needs `mpr.create`. `?case=PC-…` reopens a draft in progress. |
| `/procurement/case/:caseNo` | The case file. |

Every route except the sign-in is wrapped in `RequirePermission`, which sends an unauthenticated visitor to `/procurement/sign-in` rather than to `/auth`.

After sign-in, a person holding exactly one role lands on that role's queue; anybody holding several roles, or the administrator, lands on `/procurement`. The mapping lives in `portalHome()` in `src/features/procurement/lib/portals.ts`.

---

## 3. The lifecycle

### 3.1 The chain

```mermaid
flowchart TD
    D[0 · Draft]
    M[1 · Requisition — MPR]
    F[2 · Finance]
    T[3 · Tender]
    E[4 · Technical evaluation — TEC]
    C[5 · Commercial evaluation]
    S[6 · Comparative statement — CST]
    P[7 · Purchase committee — DPC]
    N[8 · Negotiation — PNC]
    R[9 · Purchase proposal]
    O[10 · Purchase order]
    G[11 · Goods receipt]
    Y[12 · Payment recommendation]
    Z[13 · Closed]

    D -->|draft.submit| M
    M -->|mpr.submit| F
    F -->|finance.clear| T
    T -->|tender.to_tec| E
    T -->|tender.to_commercial| C
    E -->|tec.recommend| C
    C -->|commercial.to_cst| S
    S -->|cst.to_dpc| P
    P -->|dpc.to_pnc| N
    P -->|dpc.to_proposal| R
    N -->|pnc.agreed| R
    N -->|pnc.failed| Z
    R -->|proposal.approve| O
    O -->|po.issue| G
    G -->|grn.forward| Y
    Y -->|payment.clear| Z
```

### 3.2 The way back

Backward moves are not free. A case may only return along a path that exists as a row in `procurement_return_paths`, and only through an action that declares that target. There are thirteen such paths:

```mermaid
flowchart LR
    M[Requisition] -.->|mpr.return| D[Draft]
    F[Finance] -.->|finance.return| M
    E[TEC] -.->|tec.return| T[Tender]
    C[Commercial] -.->|commercial.return| E
    C -.-> T
    S[CST] -.->|cst.return| C
    S -.-> E
    S -.-> T
    P[DPC] -.->|dpc.return| C
    N[PNC] -.->|pnc.return| P
    R[Proposal] -.-> P
    R -.-> N
    Y[Payment] -.->|payment.return| G[Goods receipt]
```

Some of these paths are declared in the data but have no action wired to them yet — `cst → tec`, `cst → tender`, `purchase_proposal → dpc`, `purchase_proposal → pnc`, `mpr → draft`. They are legal moves that a later slice will offer a button for; today only the paths with an action code above can be taken through the portal.

Forward jumps of any distance are always allowed. `→ closed` is always allowed. Staying at the same stage is allowed, which is how a clarification works.

### 3.3 Rejection

Rejection is terminal and possible from six stages: finance, TEC, commercial, DPC, purchase proposal, and payment. It is not an ordinary transition. `procurement_reject_case()` parks the case back at the requisition stage with the status `Rejected`, sets `case_status = 'rejected'`, and writes who rejected it, when, at which stage, and why into `procurement_cases.rejection` as JSON. A rejected case is `open = false`, so no queue and no worklist picks it up again, but the requester can still open it and read the reason.

---

## 4. Stage by stage

Fourteen stages, from `procurement_stage_config`. "Timer" is the SLA in hours; nothing enforces it yet.

| # | Stage | Label | Status on arrival | Timer | Escalates to | Required |
|---|---|---|---|---|---|---|
| 0 | `draft` | Draft | Draft | — | — | yes |
| 1 | `mpr` | Requisition | Requisition raised | 72 h | Purchase head | yes |
| 2 | `finance` | Finance | Awaiting finance clearance | 72 h | Purchase head | yes |
| 3 | `tender` | Tender | Tender in preparation | 168 h | Purchase head | yes |
| 4 | `tec` | Technical evaluation | Technical evaluation underway | 120 h | TEC chairperson | yes |
| 5 | `commercial` | Commercial evaluation | Commercial evaluation underway | 120 h | Head of division | yes |
| 6 | `cst` | Comparative statement | Comparative statement under scrutiny | 72 h | Head of division | yes |
| 7 | `dpc` | Purchase committee | Before the purchase committee | 168 h | DPC chairman | yes |
| 8 | `pnc` | Negotiation | In negotiation | 168 h | PNC chairman | **optional** |
| 9 | `purchase_proposal` | Purchase proposal | Proposal under review | 120 h | Approving authority | yes |
| 10 | `purchase_order` | Purchase order | Purchase order in preparation | 72 h | PO officer | yes |
| 11 | `goods_receipt` | Goods receipt | Awaiting delivery | — | Stores and accounts | yes |
| 12 | `payment_recommendation` | Payment | Payment being processed | 120 h | Stores and accounts | yes |
| 13 | `closed` | Closed | Closed | — | — | yes |

### 4.1 Every action

All thirty-five moves, from `procurement_stage_actions`. "Remarks" means the engine refuses the action without them. "Sign" is the `requires_signature` flag — recorded, not yet enforced. "Chair" means only the chairperson of that stage's committee (or the procurement administrator) may take it.

| Code | At stage | Button | Permission | Moves to | Remarks | Sign | Chair |
|---|---|---|---|---|---|---|---|
| `draft.submit` | draft | Raise requisition | `mpr.create` | mpr | | | |
| `mpr.submit` † | mpr | Send for finance clearance | `mpr.create` | finance | | | |
| `finance.clear` | finance | Clear the budget | `finance.approve` | tender | ✓ | ✓ | |
| `finance.query` | finance | Ask the requester a question | `finance.approve` | — (holds) | ✓ | | |
| `finance.return` | finance | Return to the requester | `finance.reject` | mpr | ✓ | | |
| `finance.refuse` | finance | Refuse the budget | `finance.reject` | rejected | ✓ | ✓ | |
| `tender.to_tec` | tender | Hand off for technical evaluation | `tender.create` | tec | | | |
| `tender.to_commercial` | tender | Open commercially without evaluation | `tender.create` | commercial | ✓ | | |
| `tec.recommend` | tec | Recommend for commercial evaluation | `tec.chair` | commercial | ✓ | ✓ | ✓ |
| `tec.query` | tec | Seek clarification from a bidder | `tec.chair` | — (holds) | ✓ | | ✓ |
| `tec.return` | tec | Return to the tender desk | `tec.chair` | tender | ✓ | | ✓ |
| `tec.refuse` | tec | Reject all bids on technical grounds | `tec.chair` | rejected | ✓ | ✓ | ✓ |
| `commercial.to_cst` | commercial | Draw up the comparative statement | `commercial.evaluate` | cst | | | |
| `commercial.query` | commercial | Seek a commercial clarification | `commercial.evaluate` | — (holds) | ✓ | | |
| `commercial.return` | commercial | Return to technical evaluation | `commercial.evaluate` | tec | ✓ | | |
| `commercial.refuse` | commercial | Reject all bids | `commercial.evaluate` | rejected | ✓ | ✓ | |
| `cst.to_dpc` | cst | Place before the purchase committee | `commercial.evaluate` | dpc | | | |
| `cst.return` | cst | Reopen commercial evaluation | `commercial.evaluate` | commercial | ✓ | | |
| `dpc.to_pnc` | dpc | Refer for price negotiation | `dpc.chair` | pnc | ✓ | | ✓ |
| `dpc.to_proposal` | dpc | Approve and raise a purchase proposal | `dpc.chair` | purchase_proposal | ✓ | ✓ | ✓ |
| `dpc.query` | dpc | Seek clarification before deciding | `dpc.chair` | — (holds) | ✓ | | ✓ |
| `dpc.return` | dpc | Return to commercial evaluation | `dpc.chair` | commercial | ✓ | | ✓ |
| `dpc.refuse` | dpc | Reject the procurement | `dpc.reject` | rejected | ✓ | ✓ | ✓ |
| `pnc.agreed` | pnc | Conclude — agreement reached | `pnc.chair` | purchase_proposal | ✓ | ✓ | ✓ |
| `pnc.return` | pnc | Refer back to the purchase committee | `pnc.chair` | dpc | ✓ | | ✓ |
| `pnc.failed` | pnc | Close — negotiation failed | `pnc.chair` | closed | ✓ | ✓ | ✓ |
| `proposal.approve` | purchase_proposal | Approve and raise the purchase order | `proposal.approve` | purchase_order | ✓ | ✓ | |
| `proposal.revise` | purchase_proposal | Return for revision | `proposal.approve` | — (holds) | ✓ | | |
| `proposal.refuse` | purchase_proposal | Reject the proposal | `proposal.approve` | rejected | ✓ | ✓ | |
| `po.issue` | purchase_order | Issue the purchase order | `po.issue` | goods_receipt | | ✓ | |
| `grn.forward` | goods_receipt | Forward for payment | `grn.create` | payment_recommendation | | | |
| `payment.clear` | payment_recommendation | Approve payment and close | `payment.process` | closed | ✓ | ✓ | |
| `payment.hold` | payment_recommendation | Hold the payment | `payment.process` | — (holds) | ✓ | | |
| `payment.return` | payment_recommendation | Return to stores | `payment.process` | goods_receipt | ✓ | | |
| `payment.refuse` | payment_recommendation | Refuse the payment | `payment.process` | rejected | ✓ | ✓ | |

† `mpr.submit` is the one action carrying a guard: `procurement_guard_requisition_ready` refuses it unless the case has a title, a department, a needed-by date and an estimated cost above zero. Everything else is checked by permission and remarks alone.

An action with no target stage holds the case where it is and changes its status label — `Awaiting a reply from the requester`, `Awaiting a bidder clarification`, `Payment on hold`, and so on. Actions of kind `send_back` and `request_clarification` also open a thread on the case, so the person it was sent to sees the question, not just a status.

### 4.2 What happens at each stage

**Draft.** The requester opens the case: a title, a department, an estimated value, and a justification. The case gets a reference of the form `PC-2026-0001` from `procurement_next_ref()`. Nobody else is involved yet.

**Requisition (MPR).** The requisition proper — bill of quantities, budget head, supporting documents. The requester submits it to finance. *(The BoQ and budget-head forms arrive with a later slice; today the stage carries the case summary and its attachments.)*

**Finance.** The finance officer decides whether the budget head can carry the purchase. Clearing it requires remarks and is flagged for signature. They may instead ask the requester a question (the case stays at finance), return it for correction (back to the requisition), or refuse it outright (terminal).

**Tender.** The purchase officer prepares the notice inviting tender, invites vendors, records bids, and closes bidding. They then either hand the case to the technical evaluation committee, or — for a purchase that does not warrant technical evaluation — open it commercially straight away, with remarks explaining why.

**Technical evaluation (TEC).** Members judge each bid against the tender's own specification and record findings. Only the chairperson moves the case on, and only with remarks. The chair may recommend qualified bids for commercial evaluation, seek a clarification from a bidder, return the case to the tender desk, or reject all bids on technical grounds.

**Commercial evaluation.** The head of division approves the format for opening commercial bids; the commercial team prices the bids against the bill of quantities and ranks them. The team then draws up the comparative statement, seeks a clarification, returns the case to technical evaluation, or rejects all bids.

**Comparative statement (CST).** The statement is scrutinised and locked before the case is listed for the committee. It can be reopened for correction, which sends the case back to commercial evaluation.

**Purchase committee (DPC).** The committee sits, votes and records a resolution. The chairman then either refers the case for price negotiation, or approves it and sends it for a purchase proposal; both need remarks. The chairman may also hold the case for a clarification, return it to commercial evaluation, or reject the procurement.

**Negotiation (PNC).** The only optional stage. The negotiation committee runs rounds against the committee's mandate. The chairman concludes with an agreement (the case goes to purchase proposal), refers the case back to the purchase committee, or closes it as a failed negotiation.

**Purchase proposal.** The approving authority clears the proposal before an order can be raised against it, returns it for revision, or rejects it.

**Purchase order.** The PO officer raises the order from the approved proposal and issues it to the vendor. Issuing it opens the goods receipt.

**Goods receipt.** Stores records what arrived, what was inspected, and what was accepted, then forwards the accepted quantities to the payment desk.

**Payment recommendation.** Accounts prices the invoice against the accepted quantities, applies any penalty deduction, and recommends payment. Approving the payment closes the case. The desk may also hold the payment, return the case to stores for a receipt correction, or refuse payment.

**Closed.** End of the line. `case_status` becomes `closed` and `closed_at` is stamped.

---

### 4.3 The requisition stage in detail

The requisition is where a case gets its substance, so it is the one stage with a form of its own. It lives on one scrolling page — `/procurement/new` for a fresh one, the case file for one that came back — rather than a step wizard, because a requester rarely learns the facts in the order a wizard insists on.

**Opening a draft.** A title and a department are all it takes. The case number (`PC-2026-0001`) comes back immediately, because nothing can be attached to a case that does not exist yet. The draft is visible to its author and the procurement administrator, nobody else, and `?case=PC-…` reopens it after leaving.

**What is needed.** Title, why it is needed, department, material category, procurement type, priority, cost centre, delivery point, the date it is needed by, and any delivery or installation note the vendor will need. Everything but the title and department is optional at this point; the gate in front of finance says which of them stop the case moving.

**The bill of quantities.** An editable table: item, specification, quantity, unit, HSN code, estimated rate. The line amount is computed by the database (`quantity × rate`), never by the browser, so a client cannot disagree with the arithmetic. The bill is optional — a service or a lump-sum job has none, and forcing one only produces a single line reading "the work".

**The money.** A budget head is picked from the live ledger, which shows what each head has left after every case already charged to it. The estimated value comes either from the bill total or from a figure typed by hand; the choice is recorded as `cost_source`, and a trigger keeps `procurement_cases.estimated_cost` equal to whichever was chosen. Choosing the bill is only offered once at least one line carries a rate. If the value exceeds what the head has left, the shortfall is named on the page — it does not block the case, because a budget revision is a finance decision, not a form validation.

**Supporting documents.** Uploads go through the product's ordinary ingest pipeline: the file lands in `documents`, joins the processing queue, is OCR'd and indexed, and is then linked to the case with the part it plays (`Cost estimate`, `Bill of quantities`, `Drawing`, and so on). That is why a case attachment is answerable by the assistant without a second pipeline.

**Reading the bill out of a file.** Most requesters are handed the items rather than typing them: a supplier's quotation as a spreadsheet, a CSV export, an engineer's scope of work as a PDF. **Read items from a file** does two things with one pick:

1. The file is attached to the case like any other document — stored, queued, read, indexed, and answerable by the assistant.
2. Its items come back as draft lines.

A spreadsheet or CSV is parsed in the browser and its own cells are sent to the model, which is far better evidence than a rendering of the same table; a PDF or Word file is read from the text the ingest pipeline produced, and if the queue has not finished, the panel says so and offers a retry rather than returning an empty bill. The model returns item, specification, quantity, unit, HSN code and per-unit rate; totals, taxes and page furniture are ignored.

**Nothing is written without being shown.** The result appears as a table with what the model made of the file, and the requester chooses **Use these items**, **Add to the bill**, or discards it. An extraction that saved itself would be worse than retyping, because nobody would check it. Rates in Indian formatting (`1,25,000`, `₹ 40,00,000`) are parsed to plain numbers; anything the model could not read comes back empty rather than guessed.

**The gate.** `procurement_requisition_gaps(case)` lists what is still missing — a title, a department, a needed-by date, a cost above zero — and the page shows it as a live checklist. All four are enforced by the database in `procurement_guard_requisition_ready`, so no client can put an incomplete requisition in front of finance.

**Documents are optional.** A requisition for a service or a lump-sum job may have nothing to attach, so paperwork is suggested, never demanded: the portal says nothing is attached and that finance will ask if they need something. This was a deliberate reversal — an earlier version listed documents as a gap and quietly blocked exactly those cases.

**Raising it.** One button does two recorded things: `draft.submit` raises the case out of draft, then `mpr.submit` puts it to finance. Both go through the engine and both appear in the trail, so a single act by the requester is still two honest entries.

### 4.4 The activity timeline

`procurement_case_activity(case)` merges four sources into one reverse-chronological trail — decisions from `procurement_case_events`, movements from `procurement_stage_history`, questions and send-backs from `procurement_clarifications`, and paperwork from `procurement_case_documents` — each with who did it, when, at which stage, and the remarks they left. The interleaving happens in the database rather than in the browser.

The portal draws it as one component on the case file, and it is the same component at every stage: a tender's activity and a payment's activity are the same shape of fact. Gaps between entries are shown as elapsed time ("4 days later"), which is what makes a stalled case visible without reading timestamps.

### 4.5 Asking about a case

Every file attached to a case rides the product's ordinary ingest — stored, OCR'd where needed, chunked and embedded — so a case's paperwork is already searchable the moment it finishes processing. **Ask about this case** puts the existing assistant in front of it, scoped to that case.

The scoping matters and is not a filter in the browser. The archive's own search (`search_documents_by_embedding`) is limited to chunks the asker uploaded, which is right for a personal archive and wrong for a case file: a finance officer asking about a requisition is asking about a file the requester attached. `procurement_search_case_chunks(case, user, embedding, …)` searches the documents linked to one case, checks `procurement_can_view_case` first, and returns nothing at all to somebody outside the case. `rag-assistant` takes a `caseId` and uses it instead of the personal search; everything downstream — reranking, citations, conversation history — is unchanged.

The panel shows how much is ready (`procurement_case_document_readiness`), polls while anything is still being read, offers three opening questions so nobody faces an empty box, and cites the documents each answer came from.

## 5. Roles, permissions and desks

### 5.1 The sixteen roles

| Role | Demo account | Portal title | Step |
|---|---|---|---|
| `proc_admin` | `admin@jyoma.ai` | Administration | all |
| `purchase_head` | `head@jyoma.ai` | Oversight (read-only) | all |
| `requester` | `requester@jyoma.ai` | Requisitions | 1 |
| `finance_user` | `finance@jyoma.ai` | Budget clearance | 2 |
| `purchase_officer` | `tender@jyoma.ai` | Tendering | 3 |
| `tec_chairman` | `tec.chair@jyoma.ai` | Technical evaluation — chair | 4 |
| `tec_member` | `tec.member@jyoma.ai` | Technical evaluation | 4 |
| `head_of_division` | `hod@jyoma.ai` | Divisional approvals | 5 |
| `commercial_team` | `commercial@jyoma.ai` | Commercial evaluation | 5 |
| `dpc_chairman` | `dpc.chair@jyoma.ai` | Purchase committee — chair | 6 |
| `dpc_member` | `dpc.member@jyoma.ai` | Purchase committee | 6 |
| `pnc_chairman` | `pnc.chair@jyoma.ai` | Price negotiation — chair | 7 |
| `pnc_member` | `pnc.member@jyoma.ai` | Price negotiation | 7 |
| `management_approver` | `approver@jyoma.ai` | Approving authority | 8 |
| `po_officer` | `po@jyoma.ai` | Purchase orders | 9 |
| `receipt_payment_officer` | `payments@jyoma.ai` | Stores & accounts | 10 |

### 5.2 The twenty-five permissions

`view_self`, `mpr.create`, `mpr.view`, `oversight.view`, `finance.approve`, `finance.reject`, `tender.create`, `tec.evaluate`, `tec.chair`, `commercial.evaluate`, `commercial.opening.approve`, `dpc.approve`, `dpc.reject`, `dpc.chair`, `pnc.negotiate`, `pnc.chair`, `proposal.draft`, `proposal.approve`, `po.issue`, `grn.create`, `payment.process`, `master_data.manage`, `manage_users`, `upload_docs`, `docs.upload`.

### 5.3 Who holds what

| Role | Permissions |
|---|---|
| `proc_admin` | all twenty-five |
| `purchase_head` | `view_self`, `mpr.view`, `oversight.view` |
| `requester` | `view_self`, `mpr.create`, `mpr.view`, `upload_docs`, `docs.upload` |
| `finance_user` | `view_self`, `mpr.view`, `finance.approve`, `finance.reject` |
| `purchase_officer` | `view_self`, `mpr.view`, `tender.create`, `proposal.draft`, `upload_docs`, `docs.upload` |
| `tec_chairman` | `view_self`, `mpr.view`, `tec.evaluate`, `tec.chair`, `upload_docs`, `docs.upload` |
| `tec_member` | `view_self`, `mpr.view`, `tec.evaluate`, `upload_docs`, `docs.upload` |
| `head_of_division` | `view_self`, `mpr.view`, `commercial.opening.approve` |
| `commercial_team` | `view_self`, `mpr.view`, `commercial.evaluate` |
| `dpc_chairman` | `view_self`, `mpr.view`, `dpc.approve`, `dpc.reject`, `dpc.chair` |
| `dpc_member` | `view_self`, `mpr.view`, `dpc.approve`, `dpc.reject` |
| `pnc_chairman` | `view_self`, `mpr.view`, `pnc.negotiate`, `pnc.chair` |
| `pnc_member` | `view_self`, `mpr.view`, `pnc.negotiate` |
| `management_approver` | `view_self`, `mpr.view`, `proposal.approve` |
| `po_officer` | `view_self`, `mpr.view`, `po.issue` |
| `receipt_payment_officer` | `view_self`, `mpr.view`, `grn.create`, `payment.process`, `upload_docs`, `docs.upload` |

Note that `head_of_division` holds `commercial.opening.approve` but not `commercial.evaluate`, so it can approve bid opening and sign off the statement but cannot move the case on. Only `commercial_team` (and the administrator) can.

### 5.4 The twelve queues

`requisitions` (draft, mpr) · `finance` (finance) · `tender` (tender) · `technical` (tec) · `commercial` (commercial, cst) · `opening` (commercial, cst — for the head of division) · `committee` (dpc) · `negotiation` (pnc) · `proposals` (purchase_proposal) · `orders` (purchase_order) · `receipts` (goods_receipt) · `payments` (payment_recommendation).

Each queue names the permission that opens it, so the navigation only shows the queues a person can actually use. Somebody holding several roles gets the pooled set. A person with more than two queues gets them collapsed into a "Queues" menu rather than a long row of links.

### 5.5 Which desk each role sits at

`procurement_role_stages` records the stage a role owns. This is what case visibility is derived from (§6):

`finance_user` → finance · `purchase_officer` → tender · `tec_chairman`, `tec_member` → tec · `head_of_division`, `commercial_team` → commercial · `dpc_chairman`, `dpc_member` → dpc · `pnc_chairman`, `pnc_member` → pnc · `management_approver` → purchase_proposal · `po_officer` → purchase_order · `receipt_payment_officer` → goods_receipt.

The requester is deliberately absent: they see their own cases, not everybody's.

---

## 6. Who can see a case

One predicate decides, and every case-scoped policy in the schema calls it. A person can see a case when **any** of these is true:

1. They raised it (`requester_id`), or they opened it (`created_by`).
2. They are a platform administrator (`has_role(uid, 'admin')`).
3. They are the procurement administrator (`proc_admin`).
4. They hold `oversight.view` — this is the purchase head's read-everything role.
5. **A role they hold sits at or before the stage the case has reached.** The finance officer sees a case from finance onward; the PO officer sees it from the purchase order onward; nobody sees a case that has not reached their desk yet.
6. They sit on a committee constituted on that case (TEC, DPC or PNC), regardless of stage.

Rule 5 is the one worth remembering: visibility travels forward with the case. A payments officer cannot see a case still at tender. A requester can always see their own, at any stage.

The predicate exists in two shapes that cannot drift apart, because the second is defined in terms of the first:

- `procurement_can_view_case_row(user, case_id, requester_id, created_by, stage)` — takes the row's own columns. This is what the `procurement_cases` SELECT policy uses. It has to take the columns rather than re-read the row, otherwise `INSERT ... RETURNING` fails: the row being inserted is not visible to a sub-select in its own statement, so the policy would evaluate false and refuse every insert that asks for its own row back.
- `procurement_can_view_case(user, case_id)` — the id-taking wrapper, used by the child tables.

---

## 7. The data model

Fifteen tables. The reference tables are what make the workflow data-driven: the legal moves are rows, not a `switch` statement, so changing the workflow is a migration and not a rewrite.

**Reference data** (readable by anyone signed in, writable only by the administrator)

| Table | Holds |
|---|---|
| `procurement_stage_config` | The fourteen stages: sequence, label, entry status, mandatory, SLA hours, escalation role. |
| `procurement_return_paths` | The thirteen legal backward moves. |
| `procurement_permissions` | The twenty-five permission keys and their labels. |
| `procurement_role_permissions` | The role-to-permission matrix, 88 pairs. |
| `procurement_role_stages` | Which desk each role sits at. |
| `procurement_stage_actions` | The thirty-five moves: code, stage, action kind, label, description, permission, target stage, entry status, `requires_remarks`, `requires_signature`, `chair_only`, `guard_function`, sort order. |
| `procurement_lookups` | Departments, categories, cost centres, procurement types, priorities, units, warehouses. |
| `procurement_ref_counters` | Backs `procurement_next_ref()`, which issues `PC-YYYY-NNNN`. |

**The case spine**

| Table | Holds |
|---|---|
| `procurement_cases` | One row per case: `case_no`, title, stage, status label, case status (`open`/`rejected`/`closed`), department, requester, estimated cost, currency, awarded vendor, rejection JSON, `closed_at`. |
| `procurement_case_events` | Append-only audit. Written by the engine, never by the client. |
| `procurement_stage_history` | Every movement: from stage, to stage, status label, remarks, actor, timestamp. |
| `procurement_clarifications` | Threads. `kind` is `question` or `send_back`; threaded through `parent_id`; resolvable. |
| `procurement_case_documents` | What role a document plays in a case. The file itself lives in the existing `public.documents` table and goes through the normal ingest, OCR and embedding pipeline, so a case attachment is searchable like any other document. Twenty-two document types, from "Notice inviting tender" to "Payment recommendation". |
| `procurement_user_roles` | Role grants, in their own table — the same anti-privilege-escalation shape as the app's `user_roles`. |
| `procurement_committees`, `procurement_committee_members` | TEC, DPC and PNC rosters. Members carry `is_chair`, voting rights, attendance, findings, conflict-of-interest and a signature timestamp. |

**The requisition**

| Table | Holds |
|---|---|
| `procurement_requisitions` | One row per case: justification, needed-by date, priority, category, procurement type, cost centre, delivery point, budget head, `cost_source` (`boq` or `manual`), the manual figure, and any delivery note. |
| `procurement_boq_lines` | The itemised bill: line number, item, specification, quantity, unit, HSN code, estimated rate, and `line_amount` as a generated column. Unique per case and line number. |
| `procurement_budget_heads` | The ledger: name, code, fiscal year, department, category, allocated amount, active. Unique on name and fiscal year. |
| `procurement_budget_commitments` | Explicit claims against a head — `commitment`, `spend` or `release`. Live cases commit automatically (see below); this table is for everything the case value does not already say. |

Headroom is not stored. `procurement_budget_committed(head)` adds up the estimated value of every live case charged to that head — anything not rejected and past draft — plus the explicit ledger rows, and `procurement_budget_available(head)` subtracts that from the allocation. A draft has not asked for the money yet; a rejected case has given it back.

---

## 8. The engine

### 8.1 What a decision does

Everything goes through `procurement_record_decision(_case_id, _action_code, _remarks, _payload)`. In order:

1. Load the case. Not found → error.
2. Remember the stage it is at now. *(This matters: the update later overwrites it, and an earlier version of this function recorded the destination as the origin because of exactly that.)*
3. Look the action up in `procurement_stage_actions` **by code and by the stage the case is at**. An action that does not belong to this stage is refused — this is what stops a client replaying a stale button.
4. Check the caller holds the action's permission.
5. If the action requires remarks, refuse empty ones.
6. If the action is chair-only, require that the caller chairs that stage's committee — or is the procurement administrator.
7. If the action names a guard function, call it with `(case_id, payload)` and refuse a false answer. *(None are set yet.)*
8. Apply it: a `reject` calls `procurement_reject_case()`; anything with a target stage calls `procurement_advance_stage()`; anything else leaves the case where it is.
9. A `send_back` or a `request_clarification` opens a clarification row addressed from the origin stage to the target.
10. Write the audit event, stamped with the origin stage.

### 8.2 The other functions

| Function | Does |
|---|---|
| `procurement_advance_stage(case, to, status, remarks)` | The only thing that writes `cases.stage`. Locks the row, checks visibility, checks the transition is legal, applies the destination's entry status, closes the case if the destination is `closed`, and writes the stage history. |
| `procurement_transition_allowed(from, to)` | True for `→ closed`, for staying put, for any forward move, and for a declared return path. False otherwise. |
| `procurement_reject_case(case, remarks)` | Terminal rejection. See §3.3. |
| `procurement_available_actions(case)` | What the signed-in person may do on this case right now. Drives the action bar. |
| `procurement_may_take_action(user, case, stage, action)` | Permission plus the chair rule. Shared by the action bar and the worklist so they cannot disagree. |
| `procurement_my_worklist()` | Open cases the caller can see, sitting at a stage where at least one action is available to them, oldest first. |
| `procurement_stage_counts()` | One row per stage: open cases and total value, under the caller's own visibility. Counted in the database rather than in the browser. |
| `has_procurement_role`, `has_procurement_permission`, `procurement_my_permissions` | RBAC helpers. The last is what the front end loads once at sign-in to drive `can()`. |
| `is_procurement_committee_member`, `is_procurement_committee_chair` | Committee membership. |
| `procurement_role_reaches_stage(user, stage)` | Rule 5 of §6. |
| `procurement_next_ref(prefix)` | `PC-2026-0001` and friends. |
| `procurement_log_event(...)` | Writes the audit row. |
| `procurement_boq_total(case)` | Sums the generated line amounts. |
| `procurement_sync_case_cost(case)` | Keeps `cases.estimated_cost` equal to the requisition's chosen cost source. Fired by triggers on both the requisition and its lines, so the case value is never typed twice. |
| `procurement_budget_committed`, `procurement_budget_available`, `procurement_budget_ledger` | The budget ledger and its arithmetic. |
| `procurement_guard_requisition_ready(case, payload)` | The gate in front of finance, called by the engine as `mpr.submit`'s guard. |
| `procurement_requisition_gaps(case)` | The same rules, as a list of what is still missing, for the portal to show before the button is pressed. |
| `procurement_case_activity(case)` | The merged activity timeline. |
| `procurement_search_case_chunks(case, user, embedding, threshold, count)` | Case-scoped retrieval for the assistant, behind the case visibility check. |
| `procurement_case_document_readiness(case)` | How many of a case's documents are indexed, still being read, or failed. |
| `procurement_headline_metrics()` | Open, closed and rejected counts, open and awarded value, average cycle days, cases past their timer. |
| `procurement_stage_aging()` | Per open case: how long it has sat at its current stage, against that stage's SLA, and whether it has breached. |
| `procurement_monthly_flow(months)` | Cases opened and closed per month, with the value opened. |
| `procurement_department_spend()` | Cases and estimated value per department. |
| `procurement_cycle_time()` | Average hours actually spent at each stage, measured from the stage history. |

All of them are `SECURITY DEFINER` with `SET search_path = public`, following the app's existing convention.

---

## 9. The front end

```
src/components/auth/
  AuthProvider.tsx        session, app roles, procurement roles, permission set, can()
  ProtectedRoute.tsx      ProtectedRoute + RequirePermission

src/features/procurement/
  types.ts
  api/        cases.ts, lookups.ts, documents.ts, requisition.ts,
              insights.ts, boq-import.ts, assistant.ts
  hooks/      useProcurement.ts — react-query keys and hooks
  lib/        portals.ts (roles → desks, queues, the ten-step chain)
              stages.ts (a one-line brief per stage)
              format.ts (₹ with en-IN grouping, lakh/crore short form, dates, ages)
  components/ PortalLayout, StageIndex, StageActionBar, StageBadge,
              CaseRegisterTable, ClarificationThread, CaseDocuments,
              CaseTimeline, RequisitionEditor, BoqEditor, BoqImport,
              CaseAssistant
  components/charts/
              Charts.tsx  — CategoryBars, FlowChart, MeterRow
              palette.ts  — the validated chart colours, light and dark
  stages/     StageWorkPanel.tsx    — the per-stage centre panel
              RequisitionPanel.tsx  — the requisition, editable at draft and
                                      requisition, read-only thereafter

src/pages/procurement/
  ProcurementSignIn, ProcurementHome, ProcurementRegister,
  ProcurementQueue, ProcurementInbox, ProcurementCase, ProcurementNew,
  ProcurementInsights
```

The case file puts the stage index down the left, the current stage's work panel in the centre, and documents, clarifications and the activity timeline alongside. The requisition sits under the work panel at every stage — editable while the case is still the requester's, read-only once it has moved on, because finance decides against it and the tender is written from it.

Two edge functions serve the portal: `supabase/functions/extract-boq` reads a bill of quantities out of a file and returns it for review, and the existing `rag-assistant` gained a `caseId` that swaps the personal search for the case-scoped one. Neither writes to a case.

**Chart colours are validated, not chosen by eye.** `components/charts/palette.ts` carries two categorical hues per theme — the product's blue and an ochre — checked with the `dataviz` skill's validator for lightness band, chroma, contrast against the card surface, and colourblind separation (worst adjacent pair ΔE 30.2 in light, 26.5 in dark, against a floor of 8). Magnitude charts use the blue alone and label every bar, so nothing depends on colour to be read. The `--signal` cyan never appears: `index.css` reserves it for values the machine derived, and a count of cases is not one. The action bar renders whatever `procurement_available_actions()` returned, and forces a remarks field when the action demands one — but the database is the thing that enforces it, not the form.

---

## 10. Testing

### 10.1 Bring the stack up

```bash
cd jyoma-ai

# 1. Start Supabase (Postgres, GoTrue, PostgREST, Kong, Studio).
docker compose --project-directory docker -f docker/docker-compose.yml up -d

# 2. Apply migrations. Idempotent — safe to re-run.
#    This also seeds the app users and the procurement demo accounts.
npm run migrate

# 3. If the stack was already migrated, seed the procurement accounts alone.
npm run seed:procurement

# 4. Run the app.
npm run dev          # http://localhost:8080
```

### 10.2 The accounts

Every account below uses the password `ChangeMe!2026` (that is `SEED_DEFAULT_PASSWORD` in `docker/.env`; change it before exposing the stack anywhere).

| Sign in as | Role | Lands on |
|---|---|---|
| `admin@jyoma.ai` | `proc_admin` (plus platform `admin`) | `/procurement` — every queue |
| `head@jyoma.ai` | `purchase_head` | `/procurement` — read-only, every case |
| `requester@jyoma.ai` | `requester` | `/procurement` |
| `finance@jyoma.ai` | `finance_user` | `/procurement/queue/finance` |
| `tender@jyoma.ai` | `purchase_officer` | `/procurement/queue/tender` |
| `tec.chair@jyoma.ai` | `tec_chairman` | `/procurement/queue/technical` |
| `tec.member@jyoma.ai` | `tec_member` | `/procurement/queue/technical` |
| `hod@jyoma.ai` | `head_of_division` | `/procurement/queue/opening` |
| `commercial@jyoma.ai` | `commercial_team` | `/procurement/queue/commercial` |
| `dpc.chair@jyoma.ai` | `dpc_chairman` | `/procurement/queue/committee` |
| `dpc.member@jyoma.ai` | `dpc_member` | `/procurement/queue/committee` |
| `pnc.chair@jyoma.ai` | `pnc_chairman` | `/procurement/queue/negotiation` |
| `pnc.member@jyoma.ai` | `pnc_member` | `/procurement/queue/negotiation` |
| `approver@jyoma.ai` | `management_approver` | `/procurement/queue/proposals` |
| `po@jyoma.ai` | `po_officer` | `/procurement/queue/orders` |
| `payments@jyoma.ai` | `receipt_payment_officer` | `/procurement/queue/receipts` |

The three original app accounts (`admin@`, `moderator@`, `user@`) still work for the document workspace and are unchanged. `moderator@` and `user@` hold no procurement role, which makes them the right accounts for testing that the portal turns somebody away politely.

### 10.3 Automated checks

Two scripts, both non-destructive — the SQL one runs inside a transaction it rolls back.

```bash
npm run check:procurement       # SQL-level: policies and the engine, via psql
npm run check:procurement:api   # REST-level: real sign-ins through Kong/PostgREST
```

`check:procurement` impersonates users by setting `request.jwt.claims`, opens a probe case, and asserts the visibility and transition rules hold. `check:procurement:api` signs in as the seeded users for real and walks a case from draft to tender, asserting along the way that:

- the requester can open a case and raise it, and it reaches finance with the status `Awaiting finance clearance`;
- an incomplete requisition is refused by the stage guard, and `procurement_requisition_gaps` names what is missing;
- once the requisition and its bill of quantities are saved, the case value equals the bill total — the trigger, not the client, decides it;
- an action the caller has no permission for is refused by the database;
- the case appears in the right person's worklist;
- the payments desk cannot see a case still at tender;
- a finance send-back returns the case to the requisition **and** opens a `send_back` clarification;
- after clearance the case is at tender;
- the purchase head can see the case but has no actions available on it.

Both should end with every assertion passing and a non-zero exit only on failure.

### 10.4 Before the committee stages: constitute the committees

Chair-only actions (`tec.recommend`, `dpc.to_pnc`, `dpc.to_proposal`, `pnc.agreed`, and their siblings) require the caller to be the **chairperson of a committee constituted on that specific case**. The seed does not constitute committees, because committees belong to a case, not to the system. The screens that constitute them arrive with a later slice.

So you have two ways to test the committee stages:

**Either** drive them as `admin@jyoma.ai`, who holds `proc_admin` and bypasses the chair check.

**Or** constitute the three committees on your test case first. Run this once, with your case number substituted:

```sql
-- psql -h localhost -p 54322 -U postgres -d postgres
DO $$
DECLARE
  _case UUID;
  _kind procurement_committee_kind;
  _committee UUID;
  _chair UUID;
  _member UUID;
BEGIN
  SELECT id INTO _case FROM public.procurement_cases WHERE case_no = 'PC-2026-0001';

  FOREACH _kind IN ARRAY ARRAY['tec','dpc','pnc']::procurement_committee_kind[] LOOP
    INSERT INTO public.procurement_committees (case_id, kind, name)
    VALUES (_case, _kind, upper(_kind::text) || ' for ' || 'PC-2026-0001')
    ON CONFLICT (case_id, kind, cycle) DO NOTHING;

    SELECT id INTO _committee FROM public.procurement_committees
     WHERE case_id = _case AND kind = _kind AND cycle = 1;

    SELECT id INTO _chair  FROM auth.users WHERE email = _kind::text || '.chair@jyoma.ai';
    SELECT id INTO _member FROM auth.users WHERE email = _kind::text || '.member@jyoma.ai';

    INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair, designation)
    VALUES (_committee, _chair, true, 'Chairperson')
    ON CONFLICT (committee_id, user_id) DO UPDATE SET is_chair = true;

    IF _member IS NOT NULL THEN
      INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair, designation)
      VALUES (_committee, _member, false, 'Member')
      ON CONFLICT (committee_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
```

The `tec.chair@` / `dpc.chair@` / `pnc.chair@` email pattern is what makes the loop work. Once the rows exist, the chair's action bar shows the chair-only buttons and the case appears in their worklist.

### 10.5 The walkthrough

Sign out between steps — the fastest way is a private window per role, or the sign-out in the portal header. Every step says who signs in, what to do, and what should happen.

---

**Step 0 — the door.**
Open `http://localhost:8080/`, scroll to the *procurement portal* band, and press **Enter the procurement portal**. You should land on `/procurement/sign-in`, a page that explains the ten-step chain before asking for a password. Confirm the document workspace header carries no procurement link — the portal is deliberately a separate entrance.

**Step 0b — somebody with no desk.**
Sign in as `user@jyoma.ai`. Expect: signed in successfully, but told plainly that the account holds no procurement desk, and not dropped into a broken dashboard.

---

**Step 1 — raise the requisition.** *(`requester@jyoma.ai`)*

Go to **Raise a requisition** (`/procurement/new`). Give it a title — `Spectrum analyser, 26.5 GHz, for the RF laboratory` (six characters minimum, or the form objects) — pick `Electronics & Instrumentation`, and press **Open the draft**.

Expect: the page becomes the requisition itself, headed `DRAFT · PC-2026-0001`; a checklist at the top says what is still missing (a needed-by date, a cost above zero, a document); the **Raise and send for finance clearance** button is disabled.

Now fill it in:

1. **What is needed** — a justification, a category, a procurement type, a priority, and a **needed by** date some weeks out.
2. **Bill of quantities** — either way round:
   - *By hand:* press **Add an item** and enter `Spectrum analyser, 26.5 GHz`, quantity `1`, unit `Nos.`, rate `4000000`. Add a second line — `Calibration kit, 3.5 mm`, quantity `2`, rate `125000`. Expect the bill total to read `₹42,50,000`.
   - *From a file:* press **Read items from a file** and pick a spreadsheet or CSV of items (see §10.9 for one to paste). Expect a toast saying the file was attached, then — after up to a minute, since it is a model call — a review table of what was read. Press **Use these items** and confirm they land in the bill with their rates. Confirm the file also appears under **Supporting documents** and moves to `indexed`.
3. **The money** — pick the budget head `Laboratory Equipment`, and confirm the select shows how much it has left. Choose **The bill total**; the "raising this for" figure should follow it. Try picking a head with less headroom than the bill and confirm the shortfall line appears.
4. **Supporting documents** — optional. Attach any PDF and choose the type `Cost estimate`. Expect it to appear in the list and to move through `queued → reading → indexed` as the ordinary pipeline picks it up. It should also be visible in the document workspace at `/documents`, because it is the same document. Then confirm the opposite: with nothing attached at all, the checklist stays empty and the case can still be raised — paperwork is suggested, not demanded.

Press **Save the requisition**. Expect a toast naming the case, the checklist to empty, and the raise button to become available.

Check the arithmetic held: reopen the case and confirm the header value is `₹42,50,000` — the figure came from the bill, not from anything typed into a cost box.

Press **Raise and send for finance clearance**. Expect: the case lands on `/procurement/case/PC-2026-0001` at stage **Finance**, status `Awaiting finance clearance`; the activity timeline carries two new entries, `Raise requisition` (draft → requisition) and `Send for finance clearance` (requisition → finance); the case leaves your worklist.

*Also worth trying:* press **Raise and send** before filling anything in. The button is disabled in the portal, and if you call the action directly the database refuses it with `This case is not ready for "Send for finance clearance"`.

---

**Step 2 — the budget decision.** *(`finance@jyoma.ai`)*

You land on `/procurement/queue/finance`. Expect the case to be there, and to be in **Waiting on you**.

First test the send-back. Press **Return to the requester**, remarks `Cost estimate is missing the annual maintenance component.` Expect: stage back to **Requisition**, status `Returned for correction`; a `send_back` thread on the case carrying your remarks.

Sign in as `requester@jyoma.ai` again, read the thread, press **Send for finance clearance**. The case is back at finance.

Back as `finance@jyoma.ai`, press **Clear the budget** with remarks `Head EI-CAP-2026 has the headroom; cleared.` (remarks are compulsory here — try it empty first and confirm the database refuses it). Expect: stage **Tender**, status `Tender in preparation`.

---

**Step 3 — the tender.** *(`tender@jyoma.ai`)*

Landing queue `/procurement/queue/tender`, case present. Press **Hand off for technical evaluation**. Expect: stage **Technical evaluation**, status `Technical evaluation underway`.

*(The alternative route, **Open commercially without evaluation**, needs remarks and skips straight to commercial. Worth testing on a second case.)*

---

**Step 4 — technical evaluation.** *(`tec.member@jyoma.ai`, then `tec.chair@jyoma.ai`)*

As `tec.member@`: the case is visible in `/procurement/queue/technical`, and the action bar shows **no** move-the-case buttons. That is correct — members record findings, the chair decides.

As `tec.chair@`: with the committee constituted (§10.4) the chair-only buttons appear. Press **Recommend for commercial evaluation** with remarks `Two bids meet the specification; the third fails the frequency range.` Expect: stage **Commercial evaluation**, status `Commercial evaluation underway`.

Without a committee, the button is absent and calling the action directly is refused with `Only the chairperson can take this decision`. That is the check working, not a bug.

---

**Step 5 — commercial evaluation.** *(`hod@jyoma.ai`, then `commercial@jyoma.ai`)*

As `hod@`: the case is in `/procurement/queue/opening`. The head of division holds `commercial.opening.approve` and not `commercial.evaluate`, so there is nothing here to move the case with. Correct.

As `commercial@`: press **Draw up the comparative statement**. Expect: stage **Comparative statement**, status `Comparative statement under scrutiny`.

Then press **Place before the purchase committee**. Expect: stage **Purchase committee**, status `Before the purchase committee`.

*(Worth testing on the way: **Reopen commercial evaluation** from CST, which returns the case to commercial with remarks.)*

---

**Step 6 — the purchase committee.** *(`dpc.member@jyoma.ai`, then `dpc.chair@jyoma.ai`)*

As `dpc.member@`: the case is visible in `/procurement/queue/committee`; no chair-only buttons.

As `dpc.chair@`: press **Refer for price negotiation** with remarks `L1 is 8% above the estimate; refer for negotiation.` Expect: stage **Negotiation**, status `In negotiation`.

*(The other route, **Approve and raise a purchase proposal**, skips negotiation entirely — negotiation is the one optional stage.)*

---

**Step 7 — negotiation.** *(`pnc.chair@jyoma.ai`)*

Press **Conclude — agreement reached** with remarks `Vendor agreed to ₹46,20,000 with 24-month warranty.` Expect: stage **Purchase proposal**, status `Proposal under review`.

---

**Step 8 — the proposal.** *(`approver@jyoma.ai`)*

Queue `/procurement/queue/proposals`. Press **Approve and raise the purchase order** with remarks. Expect: stage **Purchase order**, status `Purchase order in preparation`.

---

**Step 9 — the order.** *(`po@jyoma.ai`)*

Queue `/procurement/queue/orders`. Press **Issue the purchase order** (no remarks required). Expect: stage **Goods receipt**, status `Awaiting delivery`.

---

**Step 10 — receipt and payment.** *(`payments@jyoma.ai`)*

Queue `/procurement/queue/receipts`. Press **Forward for payment**. Expect: stage **Payment**, status `Payment being processed`.

Move to the payments queue and press **Approve payment and close** with remarks. Expect: stage **Closed**, status `Closed`, `case_status = closed`, `closed_at` stamped, the action bar empty, and the case gone from every worklist.

---

**Step 11 — the charts.** *(any account; `head@jyoma.ai` sees everything)*

Open `/procurement/insights`. Expect:

- **Five headline tiles** — open cases, open value, closed, average cycle, past their timer.
- **Where the work is** — one bar per stage that has open cases, each labelled with its count. The longest bar should reach the right edge of the plot.
- **Opened and closed** — twelve months, two series on one scale, with a legend. **Show the numbers** swaps the chart for the same data as a table.
- **Value by department** — bars labelled in lakhs and crores.
- **Time at each desk** — a meter per stage that a case has actually passed through, against that stage's SLA hours. A stage that has taken longer than its timer draws in the destructive colour.
- **Budget headroom** — committed against allocated for each head. After the walkthrough above, `Laboratory Equipment` should show the case's value as committed.
- **Oldest in the queue** — the eight longest-waiting open cases, with `over` beside anything past its timer.

Then sign in as `requester@jyoma.ai` and open the same page. Every number should be smaller: the functions count under the reader's own visibility, so a requester sees their own cases and nothing else. That difference is the check — if both roles see the same totals, the visibility predicate is not being applied.

---

**Step 12 — read the trail.** *(`head@jyoma.ai`)*

Sign in as the purchase head. Expect: every case visible, including this one; the case file readable end to end; **no** action buttons anywhere. Open the case and confirm the **Activity** timeline has one entry per action taken above — decisions, movements, the clarification thread and every document attached — each with who did it, the stage it happened at, the remarks, and the gap since the previous entry. The stage history should read as a clean chain — draft, requisition, finance, requisition (the send-back), finance, tender, technical evaluation, commercial, comparative statement, purchase committee, negotiation, purchase proposal, purchase order, goods receipt, payment, closed.

### 10.6 Rejection

On a second case, drive it to finance and press **Refuse the budget** as `finance@jyoma.ai` with remarks. Expect:

- the case shows stage **Requisition** with status `Rejected`;
- `case_status` is `rejected`, so it appears in nobody's worklist;
- `procurement_cases.rejection` carries who, when, at which stage, and the remarks;
- the requester can still open it and read why.

The same shape applies to `tec.refuse`, `commercial.refuse`, `dpc.refuse`, `proposal.refuse` and `payment.refuse`.

### 10.7 Things that should fail

These are as much a part of the test as the happy path. Each should be refused by the database, not merely hidden by the interface — so the honest way to test them is to call the function directly rather than to look for a missing button.

| Try | Expected |
|---|---|
| `payments@` opening a case still at tender | Not visible at all; the register does not list it |
| `head@` calling `procurement_record_decision` | `You do not hold <permission>` |
| `tec.member@` calling `tec.recommend` | `You do not hold tec.chair` |
| `tec.chair@` calling `tec.recommend` with no committee on the case | `Only the chairperson can take this decision` |
| `finance@` calling `finance.clear` with empty remarks | `Remarks are required for "Clear the budget"` |
| `requester@` calling `mpr.submit` on a requisition with no needed-by date or no cost | `This case is not ready for "Send for finance clearance"` |
| `requester@` editing the requisition after it reached finance | Refused by policy — the requisition is editable only at draft and requisition |
| `finance@` editing another department's bill of quantities | Refused by policy — only the requester (or the procurement admin) may write it |
| Anyone calling `mpr.submit` on a case at tender | `mpr.submit is not available while the case is at tender` |
| Anyone `UPDATE`ing `procurement_cases.stage` directly through the API | Refused by policy; stage only moves through the engine |
| `user@` opening `/procurement` | Redirected to the portal sign-in, then told the account holds no desk |
| `payments@` asking the assistant about a case still at tender | An answer saying it found nothing, and an empty source list — the retrieval function returns no rows outside the case's readers |

A convenient way to run one of these by hand:

```sql
-- psql, impersonating a user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
SELECT * FROM public.procurement_record_decision(
  '<case-uuid>', 'finance.clear', NULL);
```

### 10.8 Starting over

```sql
-- Wipes the cases and everything hanging off them — requisitions, bills of
-- quantities, documents links, clarifications and the trail all cascade.
-- Leaves reference data, budget heads, roles and accounts alone.
TRUNCATE public.procurement_cases CASCADE;
```

To re-seed the demo accounts after that, `npm run seed:procurement` — it is idempotent and leaves existing users alone.

---

### 10.9 The file reader and the case assistant

**Reading a bill out of a file.** Save this as `boq.csv` (tab or comma separated both work) and feed it to **Read items from a file** on a draft:

```
S.No,Description of item,Specification,Qty,Unit,HSN,Rate (INR)
1,Vector network analyser,"20 GHz, 2-port, with calibration",1,Nos.,9030,"40,00,000"
2,Calibration kit,"3.5 mm, male-female",2,Nos.,9030,"1,25,000"
3,Phase-stable test cables,"1 m, 26.5 GHz",4,Nos.,8544,"18,000"
,Sub total,,,,,"42,97,000"
,GST 18%,,,,,"7,73,460"
```

Expect exactly three lines back — the sub-total and GST rows are not items and must not appear — with rates `4000000`, `125000` and `18000`, the Indian comma formatting parsed away. Expect a note saying what was read. Expect nothing to be written until you press **Use these items**.

A PDF or Word file takes the other path: it is attached, and the reader waits on the ingest pipeline. If the queue has not finished, expect *"… is still being read. Try again in a moment."* and a **Try again** button, not an empty bill.

The call is a model reading a long prompt and can take the better part of a minute against a remote endpoint; the button says so while it runs.

**Asking about a case.** Attach a document with facts in it — delivery weeks, warranty months, payment terms — to a case, wait for `indexed`, then open the case file and use **Ask about this case**:

- Ask as the requester who attached it. Expect an answer citing the document by title.
- Sign in as `finance@jyoma.ai`, open the same case, ask the same thing. Expect the same answer, cited. This is the check that matters: the ordinary archive search is scoped to the asker's own uploads, so an answer here proves the case-scoped retrieval is being used.
- Sign in as `payments@jyoma.ai` while the case is still at finance or tender. Expect an answer saying it found nothing, and no sources — the case is not theirs to read.
- Confirm the readiness line: attach a second file and watch the panel go from "1 document" to "1 document … 1 more still being read" and back, without a page refresh.


## 11. Known limits

- **Signatures are flagged, not captured.** Fourteen actions carry `requires_signature = true`; nothing yet asks for one or blocks the action without it.
- **Only the requisition has a stage guard.** `mpr.submit` is guarded; every later action is checked by permission and remarks alone, so the preconditions for, say, a commercial decision are not enforced yet.
- **Documents are optional by design.** Nothing requires paperwork on a requisition — a service or a lump-sum job may have none. If your organisation wants a hard rule, it belongs in `procurement_guard_requisition_ready`, not in the portal.
- **A read bill is a draft, not a fact.** `extract-boq` is a model reading a file; it is shown for review and never written on its own, but a requester who accepts it without looking will put the model's arithmetic on the case. Rates and quantities deserve a glance.
- **The case assistant answers from what has been indexed.** A file attached a moment ago is not yet answerable, which the panel says; and a document the pipeline failed to read is silently absent from answers rather than flagged in them.
- **Stages after the requisition are summaries.** Each shows the case, the requisition it came from, and its decisions; the stage's own working data — bids, evaluations, quotations, orders — arrives with later slices.
- **Budget commitments are derived, not posted.** Headroom is computed from live case values rather than written as ledger entries at each approval, so there is no record of when a commitment was made, only what it is now.
- **Some declared return paths have no button.** `mpr → draft`, `cst → tec`, `cst → tender`, `purchase_proposal → dpc`, `purchase_proposal → pnc` are legal in the data but not offered anywhere yet.
- **The receipt and payment officer's desk is registered as goods receipt only.** They hold `payment.process` and can act at the payment stage, but visibility is derived from goods receipt onward — which is the same thing in practice, since payment comes after.
- **No SLA enforcement.** Timers and escalation roles are stored and displayed; nothing escalates.
- **No admin screen.** Role assignment, lookups, budget heads and committee rosters are database work today.
