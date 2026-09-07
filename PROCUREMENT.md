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
- Sixteen roles, twenty-six permissions, and the role-to-permission matrix.
- Row-level security on every table, with a single visibility predicate the whole schema shares.
- The portal: sign-in, a role-specific dashboard, queues, a register of all cases, a "waiting on you" worklist, the case file with a stage index, an action bar, a clarification thread, an audit trail, and case documents that ride the existing document ingest pipeline.
- The requisition stage in full: the requisition record, an itemised bill of quantities that prices itself, the budget ledger it is charged against, supporting documents on the case, and a completeness gate the database enforces before finance ever sees it.
- **Reading a bill of quantities out of a file** — a supplier's spreadsheet, a CSV, or a scope of work as a PDF — through the product's own model, offered back for review rather than written straight into the case.
- **Asking questions about a case.** Everything attached goes through the ordinary ingest pipeline, and the assistant answers over the case's own paperwork for anyone allowed to see the case.
- The case activity timeline — decisions, movements, questions, send-backs and paperwork on one rail, at every stage.
- `/procurement/insights`: pipeline, intake, spend, time at each desk, budget headroom and stage aging, all counted under the reader's own visibility.
- Digital signatures on the sixteen actions that need one, refused by the engine when absent, with a reusable signature per signer.
- The tender stage in full: the tender record and its lifecycle, the vendor register, the invitation list, a published bill of quantities frozen at floating, the roster of recorded bids with their earnest money, corrigenda that can be issued and withdrawn, a notice generated from a frozen snapshot and filed on the case, and a gate the database enforces before the committee sees anything.
- The technical evaluation stage in full: a committee that constitutes itself the moment a case arrives, a four-item governance checklist shared by the whole committee, an unsigned per-member reading of every bid (score, compliance, a qualified verdict), a computed consensus a chair can weigh members against, an on-request AI-suggested reading of a bidder's own papers against the tender's requirements that a member can accept or override, and the chair's own separate, unsigned final qualification call — the one thing that gates recommending the case for commercial evaluation, which is itself the signed action.
- `/procurement/admin`: the master data behind every requisition — the seven lookup lists, the budget ledger and the vendor register — editable in the portal instead of in `psql`.
- The commercial evaluation stage in full: bids opened by the head of division's own signed decision, priced item by item against the published bill with the evaluated cost derived rather than typed, a ranking on a switchable basis, an item-wise comparison the reference this process was studied from never renders, and a gate the database enforces before the comparative statement is drawn up.
- The comparative statement in full: compiled on arrival, a scrutiny checklist for the record, a recommendation that must justify any departure from the computed L1, a competent authority's clearance for an override or an award over the estimate, the head of division's sign-off, and a lock that freezes an immutable, versioned snapshot — reopening supersedes a version rather than editing it.
- The price negotiation stage in full: a negotiation record seeded on arrival against the purchase committee's own recommended bidder, a stated mandate before anything can be put to that vendor, one round of bargaining open at a time with a ceiling on the committee's own counter-offer, a stated reason required to settle above what the vendor itself offered, and an agreement that is recorded as its own figure alongside the locked comparative statement rather than overwriting it.
- The purchase proposal stage in full: a decision packet seeded on arrival — the negotiated vendor, the original evaluated cost against the negotiated price if negotiation ran, the terms, and the purchase officer's own written recommendation — gating the approving authority's decision.
- The purchase order stage in full: an order seeded from the approved proposal with its own priced lines, a model-drafted set of clause paragraphs a purchase officer can accept into the record, a gate before issuing, the vendor's response recorded on their behalf, amendments to an issued order logged with a reason, and a signed order generated as a filed PDF carrying every signature on the case's own trail.
- The goods receipt stage in full: a receipt seeded from the issued order's own lines, one delivery cycle open at a time with accepted/rejected quantities and a reasoned discrepancy where one exists, the next cycle reopening automatically while a balance remains, and forwarding to payment gated on the current cycle being closed rather than on full quantity.
- The payment recommendation stage in full: a recommendation seeded against what goods receipt accepted, a computed recommended amount after any penalty deduction, and a gate requiring a real invoice on file before payment can be cleared and the case closed.
- Demo accounts, one per role, seeded automatically.

**Not built yet (later slices of the plan).**

- The purchase committee's own resolution as a record of its own. `dpc.to_pnc` and `dpc.to_proposal` still carry it as a plain remark rather than a structured vote — the one stage left with no working detail of its own, now that every stage from the requisition through payment recommendation has one.
- Goods receipt's own inspection/QA step. The reference's schema anticipates a separate inspector's verdict distinct from whoever recorded receipt; its own real workflow never exercises it (forwarding to payment there explicitly marks inspection "Skipped"), so it was left out here rather than built and then wired to nothing.
- Splitting "approve the proposal" from "raise the purchase order" into two steps by two roles, the way the reference actually does it (a draft PO staged, then a separate PO officer issues it). `proposal.approve` here still moves straight to `purchase_order` in one press.
- The other three AI features specified for the commercial desk (§11) are still not migrated; the purchase order's own clause-drafting feature is the second AI feature actually built, after reading a bill of quantities out of a file.
- The three AI features designed for the commercial desk — reading a price schedule out of a bidder's file, a price-reasonableness and anomaly review, and a drafted scrutiny note — are specified but not migrated; a manual paste-based schedule reader stands in for the first.
- Role assignment. Master data has a screen now; who holds which desk is still database work.
- Case-specific committee rosters. TEC, DPC and PNC all now constitute themselves org-wide on arrival (§4.5); a roster scoped to the case's own department or category is still database work.
- Stage guards beyond the requisition, the tender, technical evaluation, commercial evaluation and the comparative statement. `procurement_stage_actions.guard_function` is wired and `mpr.submit`, `tender.to_tec`, `tender.to_commercial`, `tec.recommend`, `commercial.to_cst` and `cst.to_dpc` use it; the purchase committee onward has no preconditions yet beyond permission and remarks.
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
| `/procurement/admin` | Master data: the seven lookup lists and the budget heads. Needs `master_data.manage`, so only the procurement administrator sees the link. |

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

Backward moves are not free. A case may only return along a path that exists as a row in `procurement_return_paths`, and only through an action that declares that target. There are fourteen such paths:

```mermaid
flowchart LR
    M[Requisition] -.->|mpr.return| D[Draft]
    F[Finance] -.->|finance.return| M
    T -.->|tender.return| M
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

All thirty-six moves, from `procurement_stage_actions`. "Remarks" means the engine refuses the action without them. "Sign" is the `requires_signature` flag — the engine refuses the action without a signature (§7.3). "Chair" means only the chairperson of that stage's committee (or the procurement administrator) may take it.

| Code | At stage | Button | Permission | Moves to | Remarks | Sign | Chair |
|---|---|---|---|---|---|---|---|
| `draft.submit` | draft | Raise requisition | `mpr.create` | mpr | | | |
| `mpr.submit` † | mpr | Send for finance clearance | `mpr.create` | finance | | | |
| `finance.clear` | finance | Clear the budget | `finance.approve` | tender | ✓ | ✓ | |
| `finance.query` | finance | Ask the requester a question | `finance.approve` | — (holds) | ✓ | | |
| `finance.return` | finance | Return to the requester | `finance.reject` | mpr | ✓ | | |
| `finance.refuse` | finance | Refuse the budget | `finance.reject` | rejected | ✓ | ✓ | |
| `tender.to_tec` † | tender | Hand off for technical evaluation | `tender.create` | tec | | ✓ | |
| `tender.to_commercial` † | tender | Open commercially without evaluation | `tender.create` | commercial | ✓ | ✓ | |
| `tender.return` | tender | Return to the requester | `tender.create` | mpr | ✓ | | |
| `tec.recommend` † | tec | Recommend for commercial evaluation | `tec.chair` | commercial | ✓ | ✓ | ✓ |
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

† The four actions carrying a guard. `procurement_guard_requisition_ready` refuses `mpr.submit` unless the case has a title, a department, a needed-by date and an estimated cost above zero. `procurement_guard_tender_ready` refuses both ways out of the tender desk unless the tender has a reference number and a deadline, has satisfied whatever its mode obliged, has had bidding closed, and carries at least one recorded bid with an amount against it. `procurement_guard_tec_ready` refuses `tec.recommend` unless the chair has marked at least one bidder qualified — it does not require every member to have submitted a reading first, and it does not check the checklist. Everything else is checked by permission and remarks alone.

Floating a tender, closing bidding and issuing a corrigendum are **not** in this table. They move the tender, not the case, so they are database functions rather than stage actions — see §4.4. A member's technical evaluation is the same shape of exception: it is a record on file, not a case transition, so it is `procurement_submit_tec_evaluation` rather than a row here — see §4.5. `tec.recommend` itself stays in the table above, signature and all, since that one *is* the transition.

An action with no target stage holds the case where it is and changes its status label — `Awaiting a reply from the requester`, `Awaiting a bidder clarification`, `Payment on hold`, and so on. Actions of kind `send_back` and `request_clarification` also open a thread on the case, so the person it was sent to sees the question, not just a status.

### 4.2 What happens at each stage

**Draft.** The requester opens the case: a title, a department, an estimated value, and a justification. The case gets a reference of the form `PC-2026-0001` from `procurement_next_ref()`. Nobody else is involved yet.

**Requisition (MPR).** The requisition proper — bill of quantities, budget head, supporting documents. The requester submits it to finance. *(The BoQ and budget-head forms arrive with a later slice; today the stage carries the case summary and its attachments.)*

**Finance.** The finance officer decides whether the budget head can carry the purchase. Clearing it requires remarks and is flagged for signature. They may instead ask the requester a question (the case stays at finance), return it for correction (back to the requisition), or refuse it outright (terminal).

**Tender.** The purchase officer sets the tender up — its reference, how it is being floated, the dates, the earnest money and fees — and floats it. Floating publishes a copy of the requisition's bill of quantities and freezes the notice. The tender itself goes out somewhere else, on a portal or by hand; the officer records the firms that bid and what they quoted, then closes bidding. Anything that changes after the notice has gone out is a corrigendum. They then either hand the case to the technical evaluation committee, or — for a purchase that does not warrant technical evaluation — open it commercially straight away, with remarks explaining why. Either move is refused until the tender is actually ready (§4.4). A requisition that turns out to be wrong can be sent back to the requester before anything is floated.

**Technical evaluation (TEC).** Each member reads every bid — its papers, a score, a compliance call, a qualified verdict, remarks — and signs it; a member's reading never touches the case, it is one row the chair can weigh against the others. Only the chairperson moves the case on, and only with remarks. The chair's own final qualification call on each bidder is separate from any member's and is what the recommend action reads: it can be made independently of whether every member has submitted, mirroring the assumption that a case should not stall on a committee member who never logs in. The chair may recommend qualified bids for commercial evaluation (refused until at least one bidder is marked qualified — §4.5), seek a clarification from a bidder, return the case to the tender desk, or reject all bids on technical grounds.

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

**Supporting documents.** Uploads go through the product's ordinary ingest pipeline: the file lands in `documents`, joins the processing queue, is OCR'd and indexed, and is then linked to the case with the part it plays (`Cost estimate`, `Bill of quantities`, `Drawing`, and so on). That is why a case attachment is answerable by the assistant without a second pipeline. What the file *is* is guessed from the stage and corrected afterwards, never asked for first — see §7.2.

**Reading the bill out of a file.** Most requesters are handed the items rather than typing them: a supplier's quotation as a spreadsheet, a CSV export, an engineer's scope of work as a PDF. **Read items from a file** does two things with one pick:

1. The file is attached to the case like any other document — stored, queued, read, indexed, and answerable by the assistant.
2. Its items come back as draft lines.

A spreadsheet or CSV is parsed in the browser and its own cells are sent to the model, which is far better evidence than a rendering of the same table; a PDF or Word file is read from the text the ingest pipeline produced, and if the queue has not finished, the panel says so and offers a retry rather than returning an empty bill. The model returns item, specification, quantity, unit, HSN code and per-unit rate; totals, taxes and page furniture are ignored.

**Nothing is written without being shown.** The result appears as a table with what the model made of the file, and the requester chooses **Use these items**, **Add to the bill**, or discards it. An extraction that saved itself would be worse than retyping, because nobody would check it. Rates in Indian formatting (`1,25,000`, `₹ 40,00,000`) are parsed to plain numbers; anything the model could not read comes back empty rather than guessed.

**The gate.** Four things: a title, a department, a needed-by date, a cost above zero. All four are enforced by the database in `procurement_guard_requisition_ready`, so no client can put an incomplete requisition in front of finance, and `procurement_requisition_gaps(case)` returns the same four as a list.

**Saying so on screen.** The gaps function reads committed rows, so a checklist driven by it alone only moves when the requester next presses Save — which is exactly when they have stopped looking at it. The same four rules therefore also live in `lib/requisitionChecks.ts`, evaluated against the unsaved form, and that copy is what paints the page:

- A checklist at the top counts what is left and lists it. **Each row is a button that scrolls to the field and focuses it**, because the page is four sections long and naming "the date it is needed by" without saying where it lives is what made the form feel unfinishable.
- Every required control carries a `needed` chip and a red border while empty, and a green tick once filled. Colour never carries it alone — there is a word or an icon beside every use, since red-against-green is the one pair a colourblind reader cannot separate. `--ok` was added to the design system for this; it is not `--signal`, which stays reserved for what the machine found.
- Each step's header shows `2 to fill in` or a green `done`. Optional steps show nothing rather than a tick they have not earned.
- The raise bar names the outstanding items instead of saying "finish the items listed above".

The client copy decides what is painted; the database still decides whether the case moves. If they disagree — an unsaved edit, or a client rule that has drifted from the guard — the checklist says so and points at Save, so nobody meets a refusal from the engine without a reason.

**Documents are optional.** A requisition for a service or a lump-sum job may have nothing to attach, so paperwork is suggested, never demanded: the portal says nothing is attached and that finance will ask if they need something. This was a deliberate reversal — an earlier version listed documents as a gap and quietly blocked exactly those cases.

**Raising it.** One button does two recorded things: `draft.submit` raises the case out of draft, then `mpr.submit` puts it to finance. Both go through the engine and both appear in the trail, so a single act by the requester is still two honest entries.

### 4.4 The tender stage in detail

**The vendor register comes first.** A bid points at a row in `procurement_vendors` rather than carrying a typed name, and the name is unique. That is the whole reason the register exists: matching firms by name across stages makes "Meridian Instruments" and "Meridian Instruments Pvt Ltd" the same supplier by luck, and nothing counted afterwards can be trusted. A vendor is never deleted — bidder and invitee rows reference it `ON DELETE RESTRICT` — so the register offers retiring and barring instead, and says so.

**The lifecycle.** A tender moves `draft → ready → floated → bidding open → bidding closed`. Those moves are database functions, not stage actions, because they move the *tender* and leave the case where it is. Three reasons they are functions rather than plain writes, and the same three apply to any later slice tempted to skip them:

1. The transitions are constrained, and a `CHECK` cannot see the old row. One function per transition keeps the precondition next to the stamp it writes.
2. They have to be auditable. `procurement_case_activity` reads `procurement_case_events`; a direct `UPDATE ... SET status = 'floated'` writes no event and the tender's whole life is invisible on the timeline. A trigger could log it but could not capture remarks.
3. They are multi-table. Floating publishes the bill and freezes the notice; a corrigendum writes the amendment and mutates the bill.

The split, in one line: **row-level security for the fields, functions for the transitions.**

**How it is floated.** `mode` records the route — open, limited, single source, GeM, an e-procurement portal — and what the officer picks decides what else is obliged: a portal mode needs the number that portal gave the tender, a limited or single-source mode needs an invitation list, and a single source needs a written justification. There are deliberately no value thresholds anywhere: which mode a given estimate obliges is policy that differs by organisation and by year, so the portal records the choice and validates its consequences rather than pretending to know the rule.

**The published bill is a snapshot, not a view.** `procurement_tender_items` is a copy of the requisition's bill, taken at floating. Once a bidder has quoted against line 3, line 3 has to mean forever what it meant then; the requisition is still correctable in principle, and a change to what bidders were shown has to be a numbered, dated event rather than something a reader can only spot by noticing the total moved. The freeze needs no trigger — the write policy on the snapshot only matches while the tender is `draft` or `ready`, and `procurement_issue_corrigendum` is `SECURITY DEFINER` and so is not subject to it. The roster closes the same way when bidding does.

**The notice.** Floating writes `notice_snapshot`: every field the printed notice states, as of that moment. Nothing re-renders it from the tender's live columns, which is the point — a notice issued on the 3rd must not change because the tender was edited on the 5th. "File it on the case" renders the snapshot to a PDF and pushes it through `attachDocumentToCase`, the same path an uploaded scan takes, flagged `is_generated`. So the notice is stored, OCR'd, embedded and answerable by the case assistant like any other paper on the file. It is the first thing in the product to set `is_generated`, which had been a column with no producer since the foundation.

**Bids are recorded, not submitted.** There is no bidder-facing door, so the portal makes no sealed-bid promise it could not keep. The tender goes out on a portal or by hand and the purchase officer enters what came back: the firm, its reference, the amount, the tax rate, the earnest money and its settlement, and the terms quoted. `bid_amount_gross` is a generated column, so "did they quote inclusive of tax?" is arithmetic rather than an argument three stages later. The roster is a list and not a ranking — nothing here sorts by amount or names a lowest bidder, because bids only become comparable once the committee has said which ones qualify and the comparative statement has brought them to the same terms.

**A bid brings its own papers.** A bid is a claim — this firm can do the work, holds these registrations, has done it before — and the certificates backing it arrive in the same envelope, so they are recorded in the same act. The **Record a bid** form carries a papers section: files chosen there are held until the insert returns an id, then attached to the new row, and the roster opens on it so the officer can see them land. Editing an existing bid attaches immediately, since there is already a row to attach to. Each bidder row also expands to its own document list, and anything filed either way is an ordinary case document carrying one extra column, `procurement_case_documents.bidder_id`. Same bucket, same ingest, same OCR, same embeddings; the attribution is the only new thing.

That attribution is what makes the technical evaluation answerable. Asked across a whole case, *"does this firm hold a valid electrical licence?"* retrieves the licence a **different** bidder sent and answers yes — confidently, and wrongly. `procurement_search_case_chunks` therefore takes an optional `_bidder_id`, and **Ask about this bid** points the case assistant at one firm's submission alone, so an absent certificate looks absent. On a qualification question that is the difference between a gap and a false clearance.

The roster shows how much of each submission has been read and says so plainly, because a half-indexed bundle gives thin answers and a reader who cannot see that will mistake *not yet read* for *not provided*. Papers stay attachable after bidding closes and after the case moves on — a clarification a firm sends during the evaluation has to go on the file, and refusing it would only push the paper somewhere the assistant cannot reach. Removing a bidder does not delete their papers; the foreign key is `ON DELETE SET NULL`, so the documents stay on the case attributed to nobody, which is the honest record of what happened.

`procurement_bid_submissions(case)` puts each firm, its bid status and its document counts in one row. It is deliberately not an evaluation and carries no score: turning a submission into a per-requirement verdict is the technical evaluation slice, and it will read this.

**The hand-off closes bidding.** Whichever way the case leaves the desk, bidding shuts on the way out — which is what `tender.to_tec` has described itself as doing since the foundation migration. An earlier version of this slice guarded the action on bidding *already* being closed, so the officer pressed the button the description told them to press, signed it, and was refused for not having pressed a different button first. The explicit **Close bidding** control stays, because shutting the roster early is a real thing to want while chasing a missing amount or verifying earnest money; it is a convenience, not a toll gate.

It is an `AFTER UPDATE OF stage` trigger on the case rather than a step inside the two actions, because `procurement_advance_stage` is the only thing that writes `cases.stage` — so it catches every way out of the desk, including one a later slice adds and the administrator moving a case by hand. The automatic close is logged like any other, so the trail still shows when the roster shut.

**Both ways out are signed.** Whichever is taken, a set of bids stops being the purchase officer's working list and becomes the record a committee decides on — the same kind of act as finance clearing a budget or the authority approving a proposal, both of which have always been signed. The tender desk was the only exception and there was no principle behind it. `tender.return` stays unsigned: sending a requisition back for correction commits nobody to anything.

**Corrigenda.** The only way a floated tender changes. Each is numbered within its tender (it gets cited by number in correspondence), categorised as schedule, technical, commercial or administrative, and carries what the tender looked like before it — which is what makes withdrawing one possible. Only the most recent can be withdrawn, because reversing an earlier amendment underneath a later one would restore a state nobody was ever notified of. An amendment that moves the published value sets `needs_finance_review`. Recording that a bidder was told is a row in `procurement_corrigendum_notices`; the telling itself happens elsewhere, and nothing in this slice sends email.

**The gate.** `procurement_guard_tender_ready` refuses both ways out of the desk until bidding has actually happened: a reference number, a deadline, whatever the mode obliged, bidding closed, at least one recorded bid, and an amount against every one of them. `procurement_tender_gaps` lists what is missing, and `src/features/procurement/lib/tenderChecks.ts` mirrors the same rules against the unsaved form so the checklist moves as the officer types. The two must not drift — same arrangement, and the same warning, as the requisition's.

### 4.5 The technical evaluation stage in detail

**Two roles, two different writes.** A member's own reading of a bid — score, compliance, a qualified verdict, remarks — never touches the case; it is one row in `procurement_tec_evaluations`, keyed on `(bidder_id, member_id)`, and a member who reconsiders resubmits rather than appending a second row. The chair's own qualification call lives on the bidder itself (`procurement_bidders.tec_qualified`), separate from any member's row, visible to everyone, and it alone is what `procurement_guard_tec_ready` reads. Neither waits on the other: the chair can qualify a bidder before any member has scored it, and a member can score a bid the chair already decided on, purely for the record.

**A member's reading is written through a function rather than a table write — but it is not signed.** `procurement_tec_evaluations` carries no client-writable row-level security policy at all: the table is read-only from the API, and the only way to put a row in it is `procurement_submit_tec_evaluation`, `SECURITY DEFINER`, which checks the caller holds `tec.evaluate` or `tec.chair` and then upserts the row. It does *not* require a signature, on reflection: the reading does not move the case, only the chair's separate qualification call does that, and `tec.recommend` already carries its own required signature (and has since the foundation). Signing every reading was ceremony with nothing riding on it; there is nothing to get wrong about a missing RLS policy here regardless, because there is deliberately no policy to be missing.

**Every committee stage now constitutes itself.** Chair-only actions check both the stage's own chair permission and `is_procurement_committee_chair()` — the second reads an actual `procurement_committees` row for that case, and a chair who held every permission the engine asked for would still see an empty action bar the moment that row did not exist, indistinguishable from the engine being broken. TEC was the first stage fixed this way, and DPC and PNC followed once each became a stage this product expects to be driven entirely through its own screens rather than from a `psql` prompt: the moment a case arrives at `tec`, `dpc` or `pnc`, a trigger constitutes a one-cycle committee and seats every org-wide holder of that stage's chair role (as chair) and member role. That is a real, stated limit shared by all three — a large organisation with several TEC chairs, or several divisions each running their own DPC, would want a committee scoped to the case's own department or category, not every chair in the org — but it is the same shape of limit case-specific role assignment already carries everywhere else in this product, and it is what actually lets a chair press a button instead of asking someone to run SQL.

**The chair's call is a function too, for a narrower reason.** `procurement_bidders.tec_qualified` is a field, not a transition, so in principle it could sit under an ordinary row-level security write policy the way the tender's own columns do. It does not, because a column-scoped policy does not exist in Postgres — a policy is row-level, and the bidder row already carries fields other roles legitimately write (the bid amount, at the tender desk). `procurement_set_bidder_qualification` is the narrow function that exists instead: it checks `tec.chair`, checks the case is actually at this desk, and writes exactly those four columns. The existing bidder write policy already stops matching once the case leaves the tender stage, so a plain client `UPDATE` at this point changes nothing regardless — checked directly in both test scripts, because "changes nothing" is exactly the failure mode that bit this project before and deserves an assertion, not an assumption.

**The checklist is a plain field.** Four fixed questions — do the specs match the requisition, are the mandatory documents in, is delivery feasible, is eligibility verified — seeded onto the case the moment it reaches `tec` (a trigger, backfilled once for any case already there when the migration ran). Shared by the whole committee, editable under an ordinary row-level security policy scoped to `tec.evaluate` or `tec.chair` while the case sits at this desk. It is there for the record, not for the gate: neither the checklist nor a full house of member submissions is required before the chair can qualify a bidder and recommend.

**Consensus is computed, never stored.** `procurement_tec_case_consensus(case)` aggregates `procurement_tec_evaluations` per bidder — how many members have scored it, their average, how many called it qualified, and the percentage — fresh on every read, the same reasoning as `procurement_tender_summary`: a stored rollup would drift the moment a member resubmitted.

**The gate.** `procurement_guard_tec_ready` refuses `tec.recommend` until at least one bidder carries `tec_qualified = true`. That is the only hard rule, deliberately: it does not require every member to have submitted a reading, and it does not require the checklist to be clean — both are the chair's judgement, not the engine's.

**An AI suggestion is a starting point, never a vote.** "Ask the assistant" (`supabase/functions/tec-ai-evaluate`) builds the requirement side of the judgement from the tender's eligibility and scope fields, the published bill, *and* the text of whatever case documents were filed with no bidder attached — because the real qualification criteria very often lives only in an uploaded PDF from the requisition stage, not retyped into the tender's own fields. Judging bidders against a blank eligibility box because the officer never retyped the PDF into it would silently throw away the one document that actually states the rule. It then retrieves that one bidder's own excerpts the same way `procurement_search_case_chunks` does for "Ask about this bid", and asks the chat model for a score, a compliance call, a qualified verdict and the evidence behind each. **Ask the assistant for every bid**, beside the section heading, runs this once per bidder in sequence — never in parallel, since one remote endpoint gains nothing from a burst of concurrent calls — and reports which bidders it could not read (no papers, or papers still being read) rather than silently skipping them. Three things keep any of this from ever quietly becoming a decision:

1. **It lands in its own table**, `procurement_tec_ai_suggestions` — one row per bidder, never in `procurement_tec_evaluations`. Mixing a model's guess into a member's row would make an override indistinguishable from an original reading.
2. **Nothing that decides whether the case can move reads it.** `procurement_guard_tec_ready` looks at `tec_qualified` alone, and that column is set only by a human, signed action.
3. **It only ever fills an unsent draft, never a signed one.** The score, compliance and verdict land in "my reading" the moment a fresh suggestion comes back — but only while the member has nothing signed yet, so asking again after a reading is already on file cannot silently overwrite it. "Use this as my starting point" stays available on the suggestion itself for pulling it in deliberately at any other time. Either way nothing is submitted: the member still edits, still writes their own remarks, and still signs, the same as if they had typed the numbers themselves.

It refuses rather than guesses when there is nothing to work from: no papers filed, papers still being read, or a tender with no eligibility, scope or bill text to check against. The model is told to mark a requirement "unclear" or "not_met" when the excerpts do not address it — never "met" from silence — and `enable_thinking: false` is set the same way `translate-document` sets it, because Qwen3.5 otherwise reasons at length in plain prose that both burns the token budget and leaves nothing but chatter for the response parser.

### 4.6 The commercial evaluation stage in detail

Two of the limits stated since the tender slice were one limit: a bidder carried a single lump amount, so nothing could compare two bids line by line, and `procurement_tender_summary.lowest_bid` was never a ranking. This is the slice that closes both, by pricing each bid against the published bill and deriving an evaluated cost nobody has to compute by hand.

**Seeded on arrival, never repaired on read.** The moment a case reaches `commercial`, a trigger creates one `procurement_commercial` row and one `procurement_commercial_quotes` row per bidder still `received`, carrying across the tender desk's own `bid_amount` and `gst_pct` as a starting point. That is the whole of what arrival does. Nothing here re-derives a stale price on every read the way self-healing designs elsewhere do -- a read is a read, and the officer's own save is the only thing that changes a quote.

**The evaluated cost is arithmetic, not a number typed once and trusted forever.** `procurement_commercial_quotes` carries `base_price`, `gst_pct`, `freight`, `other_charges`, `discount` and a `loading_amount` with a mandatory `loading_note` -- a loading with no stated reason is refused outright, by a `CHECK` constraint, not a form validation. `gst_amount`, `taxable_value` and `evaluated_cost` are all `GENERATED` columns: tax is charged on the base price alone, never on freight or other charges, and "did they quote inclusive of tax?" is arithmetic rather than an argument three stages later -- the same reasoning `procurement_bidders.bid_amount_gross` has carried since the tender slice.

**Pricing is item-wise, and a generated column enforces "the published quantity wins."** `procurement_quote_lines` carries one row per bidder per published bill line, and its `quantity` is copied from `procurement_tender_items` by a trigger -- never accepted from the caller -- so a bidder's own stated quantity can only ever be *evidence* (`quoted_quantity`), never an input to the arithmetic. `procurement_record_quote_schedule(quote, lines, source, stated_total)` reads a whole sheet in one transaction: it matches each row to a published line by id, then by exact name, then by substring containment, and raises whatever does not reconcile as one of seven issue codes -- `unmatched_row`, `missing_line`, `missing_rate` (the two errors), `quantity_mismatch`, `amount_mismatch`, `duplicate_line` and `total_mismatch` (warnings, shown but not blocking). When a rate is absent but an amount is given, the rate is derived as `amount / quantity`; when a submitted amount disagrees with quantity times rate, the generated column's arithmetic wins, not the sheet's. Only once **every** published line carries a rate does the schedule's own total override the bidder's lump `base_price` -- a partly priced sheet leaves the typed figure alone, because a half-priced schedule is not yet a price.

**A corrigendum can outlive the schedule that was priced against it.** `procurement_issue_corrigendum` amends the published bill by deleting and re-inserting `procurement_tender_items`, so `procurement_quote_lines` deliberately carries no foreign key to it -- an `ON DELETE CASCADE` there would silently destroy every firm's priced schedule the moment a deadline was extended. Instead the line's identity is copied in at write time and a stale schedule is a visible, reportable state: `procurement_commercial_gaps` names it as *"A price schedule read against the bill as it now stands, since a corrigendum changed it"* rather than letting it fail silently or vanish.

**The ranking is computed on read, never stored.** `procurement_commercial_ranking(case)` is the one place L1 is decided, on whichever basis the case has chosen -- `evaluated_cost` by default, or `base_price`, or a `weighted_score` blending price, delivery and warranty (`0.50` times price plus `0.25` times delivery plus `0.25` times warranty), computed from the integers already on `procurement_bidders` rather than parsed out of free text. A bid is eligible to be ranked only once it is priced, called compliant or conditionally compliant, and not disqualified -- read as `tec_qualified IS DISTINCT FROM false`, not `= true`, because a case that skipped technical evaluation entirely (`tender.to_commercial`) carries `NULL` on every bidder, and reading that as a disqualification would make the whole skip route unusable. Ineligible bids sort last with a stated reason rather than disappearing. `procurement_commercial_line_comparison(case)` is the same idea per published line: the cross-bidder matrix the reference this process was studied from never renders, because it prices bidders as a single lump sum. An item's own cheapest rate need not belong to the bidder who is L1 overall -- that is the reason the matrix exists, not a curiosity of the data.

**Reasonableness is one check, against the estimate the bidders actually quoted against.** `procurement_commercial_reasonableness(case)` reads `procurement_tenders.estimated_value` -- the published bill's total, frozen at floating -- grossed up by the tender's own `gst_pct`, and compares it to the computed L1's evaluated cost. There is no last-purchase-price and no market-rate benchmark anywhere in this schema; the position is `within`, `over`, or `no_estimate`, and it says which.

**The head of division has something to press.** `commercial.opening_approve` and `commercial.opening_return` are ordinary stage actions -- holding the case, not moving it -- on `commercial.opening.approve`, the permission this role has held since the foundation with nothing to spend it on. Their write is not a table a client can reach: `procurement_commercial_approval_from_event()` is a trigger on `procurement_case_events` that turns the decision into a row in `procurement_commercial_approvals`, because a holding action leaves no `cases.stage` change for the usual `AFTER UPDATE OF stage` hook to catch, and `procurement_record_decision` writes no table but the audit trail. The approval is keyed on the commercial record's own `revision`, which is what lets a reopened case's sign-offs disappear for free -- the new revision simply has no row.

**The gate.** `procurement_commercial_gaps` refuses `commercial.to_cst` until the opening is approved, at least one bid is priced, every received bid carries a compliance call, and no schedule has gone stale under a corrigendum.

### 4.7 The comparative statement in detail

The statement is not a table of its own figures. It is the frozen record of what the commercial desk had already worked out, at the moment a human certified it -- which is why locking it is the interesting part, not compiling it.

**Compiled on arrival, as a draft that computes.** The moment a case reaches `cst`, a trigger opens `procurement_cst_versions` at `version = 1`, `status = 'draft'`, and seeds `procurement_cst_scrutiny` with five fixed questions -- arithmetic verified, taxes and loadings consistent, terms brought to par, the estimate comparison recorded, deviations documented -- the same shape as the TEC committee's checklist, and for the same reason: on file, not the gate. A draft version answers every read fresh from `procurement_commercial_ranking` and the schedule; nothing about it is stored until it locks.

**The recommendation is made here, and DPC inherits it rather than originating it.** `procurement_commercial_record_recommendation` writes one live row per case plus an append-only history entry for every change -- previous vendor, new vendor, previous reason, new reason, who, when. Recommending anyone other than the computed L1 is refused by a table `CHECK` constraint, not only by the function that writes it: it needs a reason from a fixed category (delivery lead time, lifecycle cost benefit, OEM support, risk mitigation, technical or warranty superiority, non-responsiveness, budget excess, or other) and at least ten characters of justification. An award above the approved estimate -- override or not -- additionally requires a competent authority's clearance, `procurement_approve_cst_authority`, before the case can reach the committee; that clearance is its own approval kind, deliberately not folded into the routine sign-off, because signing off on a departure from L1 is a distinct assertion and should not be a side effect of a press about something else.

**The lock is what actually freezes the statement, and it happens after the case has already moved.** `cst.to_dpc` carries a guard and signature like any other hand-off, but the freeze itself -- `procurement_cst_lock` -- runs from an `AFTER UPDATE OF stage` trigger once the case has already reached `dpc`, the same "single chokepoint" shape as the tender desk's own bidding-close. That ordering means the lock function cannot ask whether the case is "at" `cst`, because by the time it runs the case is honestly no longer there; it instead looks for a live draft version to freeze, and trusts that the guard already refused the hand-off if there was nothing worth freezing. What gets written into `snapshot` is everything a reader must be able to see without re-deriving it later: every bidder's full figures, the item-wise matrix, the reasonableness position, the recommendation with its justification, and both sign-offs -- with names resolved at freeze time, because a vendor or a signer can be renamed afterwards and the statement must not silently re-render under a new one.

**Reopening supersedes a version; it does not edit one.** `procurement_commercial_reopen` (reason mandatory) marks the live version `superseded`, opens the next as a fresh draft, unlocks the quotes for correction, and retires every sign-off -- because each is keyed on the version it was given against, a new version simply starts with none. The recommendation's own history survives a reopen; only the live pointer moves. A case returned from `dpc` or from `cst.signoff_return` reopens automatically, from the same `AFTER UPDATE OF stage` trigger that seeds the statement in the first place, so an administrator moving a case by hand triggers the identical behaviour as a chair's own return.

**The gate.** `procurement_cst_gaps` refuses `cst.to_dpc` until a recommendation is on file, any departure from L1 is justified, any required authority clearance is recorded, and the head of division has signed the statement off (`cst.signoff`, itself a signed action). `cst.to_dpc` stays unsigned deliberately -- the statement it carries is already signed, and signing the hand-off again would be ceremony over the same fact twice.

### 4.8 The price negotiation stage in detail

Three stage actions (`pnc.agreed`, `pnc.return`, `pnc.failed`) existed from the foundation slice with nothing behind them — a chair's signature on an empty stage. This slice gives the desk something to actually negotiate over, built from the same three domain facts a fourteen-stage regulated purchase process settles regardless of which product implements it: negotiation targets one named vendor, it runs in bounded rounds rather than a free-for-all, and its result sits beside the comparative statement rather than inside it.

**Seeded on arrival, against one vendor.** The moment a case reaches `pnc`, a trigger creates one `procurement_negotiations` row targeting the purchase committee's own recommended bidder — or, if the committee's resolution named nobody in particular, the computed L1 — with `opening_offer` snapshotted from that bidder's evaluated cost at that moment, so a round always has something fixed to bargain against even if the comparative statement is later reopened. A case that returns to `pnc` a second time (`dpc.return` from here, then `dpc.to_pnc` again) keeps its mandate and its round history and simply flips back to `open`; only a negotiation that was returned rather than concluded does that; one that already reached agreement or failure never resets.

**Nothing opens without a stated mandate.** `procurement_save_negotiation_mandate` records why the committee is negotiating and at least one objective; `procurement_open_negotiation_round` refuses to open the first round until both are on file. This is the one piece of the negotiation record that is not a plain per-round fact — it is the committee's own standing brief for the whole negotiation, set once and revisable, not re-argued every round.

**One round open at a time, with a ceiling on the counter and on the close.** `procurement_negotiation_rounds` carries the vendor's offer, the committee's counter, and — once closed — the settled figure for that round, plus whatever else moved alongside price (delivery days, payment terms, warranty months) and a free-text note of the discussion. A partial unique index refuses a second open round outright; a `CHECK` constraint refuses a counter-offer above the vendor's own current offer, because a "counter" asking for more than the vendor is already asking is not a negotiation; and closing a round above the vendor's own offer — accepting an increase, say for added scope — is still possible but only with a stated `override_reason`, enforced both by the closing function and by a second `CHECK` constraint underneath it. These are plain committee records, not signed decisions: the signature sits on `pnc.agreed`, `pnc.return` and `pnc.failed` themselves, the same division this schema draws everywhere between a committee's own working notes and the transition that acts on them — which is also why neither table carries a client write policy at all; every write goes through the RPCs above, the same reasoning as `procurement_quote_lines` and `procurement_cst_scrutiny`.

**Agreement is read from the rounds, not typed again.** `pnc.agreed`'s guard (`procurement_pnc_agreement_gaps`) refuses to let the case move until the mandate is on file, no round is left open, and at least one closed round carries a settled figure. On the action itself, a trigger on `procurement_case_events` reads the last such round and writes its figure and terms onto `procurement_negotiations` as `final_price` and the matching `final_*` columns, alongside who concluded it and when. This does **not** touch the locked comparative statement — `procurement_cst_versions` stays exactly what the committee evaluated; the negotiated price is a separate, later fact a purchase proposal would read next to the original L1 figure, not in place of it. `pnc.return` and `pnc.failed` write the negotiation's own `status` (`returned`, `failed`) and nothing else — a return leaves the round history intact for the next attempt, and a failure is terminal, matching the case closing outright.

**None of this is the reference's own shape.** Studying how the process this workflow is modelled on runs its own negotiation committee surfaced the three facts above — one vendor, bounded rounds with a counter-offer ceiling, and a result recorded apart from the statement — but none of its field names, screens, multi-round discussion arrays, document templates or committee-mandate wording carried over. What is here is those three facts, expressed in this schema's own tables and this schema's own gate/guard convention.

### 4.9 The purchase proposal stage in detail

Three bare actions (`proposal.approve`, `proposal.revise`, `proposal.refuse`) existed from the foundation slice, gated only by permission and remarks — the approving authority saw the case summary and the requisition, never the figure they were actually deciding on. Checking the reference process this workflow is modelled on confirmed the shape already chosen at the foundation stage: a single generic approving role (`management_approver`/`proposal.approve`), not a value-based hierarchy — the reference has no delegation-of-financial-power tiering either, so this was never a gap relative to it. What the reference does have that this slice was missing is content: a proposal there is a decision packet, not a bare gate.

**Seeded on arrival, from whichever bidder was actually negotiated.** The moment a case reaches `purchase_proposal`, a trigger creates one `procurement_purchase_proposals` row, targeting whoever `procurement_negotiations` was actually run against if a negotiation record exists (win or lose the case still records who was negotiated with), falling back to the commercial desk's own award recommendation, then to the computed L1, for a case that skipped negotiation entirely (`dpc.to_proposal` directly). `original_evaluated_cost` is snapshotted from the comparative statement's own ranking; `negotiated_price` is left `NULL` unless a negotiation actually reached agreement, so a case with no negotiation shows one figure, not a blank second one.

**One field, not two.** `recommendation_note` is the purchase officer's own written case for the vendor and price — the same lesson the comparative statement's recommendation form already learned about not asking for the same explanation in a "justification" box and a "remarks" box both. `procurement_save_proposal` is the only writer; the table carries no client write policy at all, the same reasoning as `procurement_cst_scrutiny` and the negotiation tables.

**The gate.** `procurement_proposal_gaps` refuses `proposal.approve` until a recommendation is on file. Nothing else is checked — there is no second sign-off, no value threshold, and no split between "approve" and "raise the purchase order" the way the reference actually does it (see the limit below).

### 4.10 The purchase order stage in detail

One bare action (`po.issue`) existed from the foundation slice, checked by permission and remarks alone. Checking the reference process this workflow is modelled on surfaced three domain facts, and one genuine AI feature distinct from a fixed template:

**Seeded on arrival, from the approved proposal.** The moment a case reaches `purchase_order`, a trigger creates one `procurement_purchase_orders` row — a fresh `PO-2026-0001`-style reference from `procurement_next_ref`, the recommended vendor and the order value carried in from `procurement_purchase_proposals`, and payment/delivery/warranty defaults copied across so nothing is typed twice. Line items are seeded once from the awarded bidder's own priced schedule (`procurement_quote_lines`) when they priced item by item; a bidder who was priced as a lump sum gets a single line carrying the proposal's own figure, because there is nothing item-wise on file to copy.

**A genuine LLM-drafting feature, kept apart from the record it drafts for.** The reference has exactly this shape as a distinct feature from its own transactional PO fields: given the vendor, the amount and whatever terms are already on file, a model drafts the payment-terms paragraph, the delivery/execution-schedule paragraph, the warranty-and-inspection paragraph, and a special-conditions paragraph — grounded only in what is already recorded, never inventing a commercial term nobody agreed to. `po-ai-draft` (the edge function) writes to `procurement_po_ai_drafts`, its own table; nothing that gates `po.issue` reads it, and a draft only ever reaches the order's own fields when the purchase officer presses "Use this" on a specific clause — the same discipline this schema already holds the TEC committee's AI suggestion to.

**The gate.** `procurement_po_gaps` refuses `po.issue` until a delivery date, a delivery address, payment terms, and at least one order line are on file.

**Issuing, and what happens after.** `po.issue` is a signed action like any other hand-off; a trigger on `procurement_case_events` flips the order to `issued` and stamps who and when. Two things follow that have no equivalent anywhere earlier in this schema: the vendor's response is recorded on their behalf (`procurement_record_po_vendor_ack` — acknowledged, accepted or rejected, with a note), because there is no bidder-facing door for a vendor to record it themselves; and an issued order can be amended (`procurement_amend_po` — price, date or terms, with a mandatory reason), logged to `procurement_po_amendments` and bumping the order's `version`, the same corrigendum shape a floated tender notice already uses. Both are deliberately checked against the case's *visibility*, not against it still being "at" `purchase_order` — a vendor's acknowledgement or an amendment naturally happens after `po.issue` has already moved the case on to goods receipt.

**The signed order, as a document rather than a screen.** Once issued, "Generate the signed order" (`lib/purchaseOrderPdf.ts`) renders the order — terms, line items, total — followed by **every signature on the case's own trail**, not only `po.issue`'s: finance clearing the budget, the technical and commercial committees, the comparative statement's sign-off, negotiation's agreement, the approving authority, and the issue itself, each with the signer's name, the procurement role they held at the moment they signed (`procurement_case_signatures_named`, resolving both server-side — RLS holds neither a name nor a role readable directly), and their actual mark. It goes through the same ingest path an uploaded scan takes, filed as a generated document on the case, so it is searchable and answerable by the case assistant like any other paper on the file. Rendered client-side with jsPDF, the same reasoning `noticeToPdf` already carries: no extra service, and the officer sees exactly what they are about to file before they file it. jsPDF's built-in font carries no ₹ glyph — both this and the tender notice render money as "Rs." rather than a silently substituted stray character.

### 4.11 The goods receipt stage in detail

Three bare actions existed from the foundation slice, checked by permission and remarks alone. Checking the reference process this workflow is modelled on surfaced a shape worth keeping — receiving in rounds, no full-quantity requirement to move on — and one thing worth skipping: a separate inspection/QA verdict the reference's own schema anticipates but its actual workflow never exercises (forwarding to payment there explicitly marks inspection "Skipped"). Building that here would have been the same unused shape twice.

**Seeded on arrival, from the issued order's own lines.** The moment a case reaches `goods_receipt`, a trigger opens `procurement_goods_receipts` at cycle 1 and copies every line from `procurement_po_lines` — item, unit, rate, ordered quantity — into `procurement_grn_lines`. Nothing is retyped from the order.

**Receiving happens in cycles, one open at a time.** A partial unique index allows only one `open` cycle per case, the same shape price negotiation's own rounds already use. Per line, per cycle: what was delivered, what was accepted, what was rejected. Accepted plus rejected can never exceed delivered (a table `CHECK`, not a form validation), and rejecting anything needs a stated `discrepancy_reason` — a line simply not yet delivered this cycle is not a discrepancy, only an actual rejection is.

**Closing a cycle reopens the next one automatically, exactly the reference's own reopening rule.** `grn.close_cycle` (a new holding action) is guarded on every delivered line being fully classified and at least one line actually delivered. On success, a trigger closes the cycle and — if any line's cumulative accepted quantity still falls short of what was ordered — opens the next cycle, carrying `previously_accepted_qty` forward per line so nothing has to be re-summed from history. A cycle where every line reached its full ordered quantity does not reopen.

**Forwarding to payment needs the cycle closed, not the order complete.** The reference's own rule: a short receipt can be forwarded exactly like a complete one. `procurement_grn_forward_gaps` (now wired onto the existing `grn.forward` action) asks only that the latest cycle not still be `open` — nothing about quantities. `procurement_grn_summary` is the rollup a reader (and a future payment slice) actually wants: grouped by line rather than by cycle, so "how much of this line has been accepted in total" never means summing history by hand.

### 4.12 The payment recommendation stage in detail

Four bare actions existed from the foundation slice. Checking the reference process this workflow is modelled on found this its thinnest module by its own evidence: no three-way match against the purchase order, no statutory deduction or bank-detail field anywhere, no enforced separation between whoever recommends and whoever clears despite role names that suggest one, and clearing payment closes the case as a direct side effect with no separate completion record. None of that reads as a gap to close — it is what the reference itself does — so none of it was built here either.

**Seeded on arrival, against what goods receipt actually accepted.** The moment a case reaches `payment_recommendation`, a trigger sums `procurement_grn_summary`'s accepted value across every line and every cycle into `procurement_payment_recommendations.accepted_value`, and defaults `invoice_amount` to the same figure as a starting point the officer can correct — a real invoice can legitimately differ (freight, a rounding difference, a charge this schema does not model), so a mismatch is shown, never treated as an error.

**One computed figure, the one thing the reference's own module gets right.** `recommended_amount` is a generated column: invoice amount less a penalty deduction, and a table `CHECK` refuses a deduction larger than the invoice itself — a bound the reference does not enforce.

**The gate.** `procurement_payment_gaps` refuses `payment.clear` until an invoice number, an invoice date and a positive invoice amount are on file. `payment.clear` itself is unchanged: signed, and its own `target_stage` (`closed`) is what ends the case — the same direct closure the reference uses, just gated on an invoice actually being on record first.

**"Generate the invoice" files the recommendation as a document, and can draft its own note.** The one piece of this stage that is prose rather than a figure — the recommendation note — can be drafted by the product's own model (`payment-ai-draft`), grounded only in the vendor, the accepted value, and the invoice figures already on file, and landing in its own table (`procurement_payment_ai_drafts`) nothing that gates `payment.clear` ever reads, the same discipline the purchase order's own AI drafting holds. Pressing "Generate the invoice" saves the recommendation and renders it — the invoice detail, the accepted value it is weighed against, the computed recommended amount, and the remarks (typed by hand, or accepted from the draft) — to a PDF filed on the case through the same ingest path an uploaded scan takes, so it is searchable and answerable by the case assistant like any other paper on the file.

### 4.13 The activity timeline

`procurement_case_activity(case)` merges four sources into one reverse-chronological trail — decisions from `procurement_case_events`, movements from `procurement_stage_history`, questions and send-backs from `procurement_clarifications`, and paperwork from `procurement_case_documents` — each with who did it, when, at which stage, and the remarks they left. The interleaving happens in the database rather than in the browser.

The portal draws it as one component on the case file, and it is the same component at every stage: a tender's activity and a payment's activity are the same shape of fact. Gaps between entries are shown as elapsed time ("4 days later"), which is what makes a stalled case visible without reading timestamps.

### 4.14 Asking about a case

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

### 5.2 The twenty-six permissions

`view_self`, `mpr.create`, `mpr.view`, `oversight.view`, `finance.approve`, `finance.reject`, `tender.create`, `tec.evaluate`, `tec.chair`, `commercial.evaluate`, `commercial.opening.approve`, `dpc.approve`, `dpc.reject`, `dpc.chair`, `pnc.negotiate`, `pnc.chair`, `proposal.draft`, `proposal.approve`, `po.issue`, `grn.create`, `payment.process`, `master_data.manage`, `vendor.manage`, `manage_users`, `upload_docs`, `docs.upload`.

### 5.3 Who holds what

| Role | Permissions |
|---|---|
| `proc_admin` | all twenty-six |
| `purchase_head` | `view_self`, `mpr.view`, `oversight.view` |
| `requester` | `view_self`, `mpr.create`, `mpr.view`, `upload_docs`, `docs.upload` |
| `finance_user` | `view_self`, `mpr.view`, `finance.approve`, `finance.reject` |
| `purchase_officer` | `view_self`, `mpr.view`, `tender.create`, `vendor.manage`, `proposal.draft`, `upload_docs`, `docs.upload` |
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

Thirty-two tables. The reference tables are what make the workflow data-driven: the legal moves are rows, not a `switch` statement, so changing the workflow is a migration and not a rewrite.

**Reference data** (readable by anyone signed in, writable only by the administrator)

| Table | Holds |
|---|---|
| `procurement_stage_config` | The fourteen stages: sequence, label, entry status, mandatory, SLA hours, escalation role. |
| `procurement_return_paths` | The fourteen legal backward moves. |
| `procurement_permissions` | The twenty-six permission keys and their labels. |
| `procurement_role_permissions` | The role-to-permission matrix, 90 pairs. |
| `procurement_role_stages` | Which desk each role sits at. |
| `procurement_stage_actions` | The thirty-six moves: code, stage, action kind, label, description, permission, target stage, entry status, `requires_remarks`, `requires_signature`, `chair_only`, `guard_function`, `gaps_function`, sort order. |
| `procurement_lookups` | Departments, categories, cost centres, procurement types, priorities, units, warehouses. |
| `procurement_ref_counters` | Backs `procurement_next_ref()`, which issues `PC-YYYY-NNNN`. |

**The case spine**

| Table | Holds |
|---|---|
| `procurement_cases` | One row per case: `case_no`, title, stage, status label, case status (`open`/`rejected`/`closed`), department, requester, estimated cost, currency, awarded vendor (a foreign key into the register since the tender slice; nothing writes it until the order), rejection JSON, `closed_at`. |
| `procurement_case_events` | Append-only audit. Written by the engine, never by the client. |
| `procurement_stage_history` | Every movement: from stage, to stage, status label, remarks, actor, timestamp. |
| `procurement_clarifications` | Threads. `kind` is `question` or `send_back`; threaded through `parent_id`; resolvable. |
| `procurement_case_documents` | What role a document plays in a case. The file itself lives in the existing `public.documents` table and goes through the normal ingest, OCR and embedding pipeline, so a case attachment is searchable like any other document. Twenty-two document types, from "Notice inviting tender" to "Payment recommendation". `is_generated` marks paperwork the portal produced rather than a person uploaded; the tender notice is the first thing to set it. `bidder_id` attributes a document to one firm's bid — nullable, because most paperwork belongs to the case rather than to any bidder, and `ON DELETE SET NULL` so removing a bidder cannot destroy what they sent. |
| `procurement_signatures` | One reusable signature per person. Private to its owner; no other policy reads it. |
| `procurement_case_signatures` | One row per signed decision: case, action, stage, signer, its own copy of the image, and when. Read-only to every client — written solely by the engine. |
| `procurement_user_roles` | Role grants, in their own table — the same anti-privilege-escalation shape as the app's `user_roles`. |
| `procurement_committees`, `procurement_committee_members` | TEC, DPC and PNC rosters. Members carry `is_chair`, voting rights, attendance, findings, conflict-of-interest and a signature timestamp. All three constitute themselves org-wide on arrival at their stage (§4.5). |

**The requisition**

| Table | Holds |
|---|---|
| `procurement_requisitions` | One row per case: justification, needed-by date, priority, category, procurement type, cost centre, delivery point, budget head, `cost_source` (`boq` or `manual`), the manual figure, and any delivery note. |
| `procurement_boq_lines` | The itemised bill: line number, item, specification, quantity, unit, HSN code, estimated rate, and `line_amount` as a generated column. Unique per case and line number. |
| `procurement_budget_heads` | The ledger: name, code, fiscal year, department, category, allocated amount, active. Unique on name and fiscal year. |
| `procurement_budget_commitments` | Explicit claims against a head — `commitment`, `spend` or `release`. Live cases commit automatically (see below); this table is for everything the case value does not already say. |

**The tender**

| Table | Holds |
|---|---|
| `procurement_vendors` | The register: name (unique), registration number, GST and PAN, MSME category, contact, address, whether it is in use, and whether it is barred and why. Organisation-wide, not case data. |
| `procurement_tenders` | One row per case: reference, mode, portal reference and URL, single-source justification, scope and eligibility, the lifecycle status, every date from publication to the opening of price bids, earnest money and fees, the frozen `notice_snapshot` and the document it was filed as, and the stamps the lifecycle functions write. |
| `procurement_tender_invitees` | Who was asked. Only obliged for a limited or single-source tender, and the guard enforces that rather than the schema. |
| `procurement_tender_items` | The published bill, copied from the requisition at floating. Mirrors `procurement_boq_lines` and keeps `source_line_id` with no foreign key, so the snapshot survives the requisition line being deleted. |
| `procurement_bidders` | The roster: firm, reference, amount, tax rate, `bid_amount_gross` as a generated column, earnest money and how it was settled, the terms quoted, and whether the bid stands. `case_id` is denormalised from the tender and kept honest by a trigger, because every policy in this schema is written against it. |
| `procurement_corrigenda` | Amendments: serial number within the tender, category, reason, before and after snapshots, the value moved, whether finance has to look again, and its own frozen notice. |
| `procurement_corrigendum_notices` | That a bidder was told, and by what means. A record of a notification sent elsewhere — nothing here sends anything. |

**The technical evaluation committee**

| Table | Holds |
|---|---|
| `procurement_tec_checklist` | Four fixed governance questions per case — specs against the requisition, mandatory documents, delivery feasibility, eligibility — shared by the whole committee. Seeded the moment a case reaches `tec`. |
| `procurement_tec_evaluations` | One row per bidder per member: score, compliance call, qualified verdict, remarks, when. Unsigned — `signature_id` stays `NULL` unless a caller sends one, which nothing in the product does. No client write policy at all — every row is written by `procurement_submit_tec_evaluation`. |
| `procurement_tec_ai_suggestions` | One suggested reading per bidder — score, compliance call, qualified verdict, a summary and cited evidence, which model produced it, when. Also no client write policy; written only by `procurement_record_tec_ai_suggestion`, called from the `tec-ai-evaluate` edge function. Nothing that gates a decision reads this table. |

The chair's own qualification call is not a fifth table — it is four columns on `procurement_bidders` (`tec_qualified`, `tec_note`, `tec_decided_by`, `tec_decided_at`), written only by `procurement_set_bidder_qualification`.

**The commercial desk**

| Table | Holds |
|---|---|
| `procurement_commercial` | One row per case: the ranking basis in force, and whether the quotes are still `draft` or `locked` behind a comparative statement. Seeded the moment a case reaches `commercial`. |
| `procurement_commercial_quotes` | One row per bidder: base price, GST rate, freight, other charges, discount, a stated loading and its reason, and the compliance call — with `gst_amount`, `taxable_value` and `evaluated_cost` all generated columns. `base_price` is overridden by the priced schedule only once every published line carries a rate. |
| `procurement_quote_lines` | One row per bidder per published bill line: the rate quoted, with `quantity` copied from the published line by a trigger and `line_amount` a generated column, so "the published quantity wins" and "the arithmetic wins over a stated amount" are both structural. No client write policy — every write goes through `procurement_record_quote_schedule`, which runs the matching rules the table itself cannot enforce. |
| `procurement_commercial_approvals` | The head of division's sign-offs — bid opening, the statement, and the competent authority's clearance — one live row per kind per revision. No client write policy at all; written only by a trigger on `procurement_case_events` when the corresponding stage action fires. |

**The comparative statement**

| Table | Holds |
|---|---|
| `procurement_cst_versions` | One row per version of the statement for a case. A `draft` computes everything fresh; a `locked` or `superseded` version reads only its own frozen `snapshot`. At most one non-superseded version per case. No client write policy at all. |
| `procurement_cst_scrutiny` | Five fixed questions per version — arithmetic, taxes and loadings, terms brought to par, the estimate comparison, deviations — shared by the desk, for the record rather than the gate. |
| `procurement_commercial_recommendations` | The one live recommendation per case: outcome, recommended bidder, the computed L1 at the time, the justification for any departure from it, and whether a competent authority's clearance is required. Enforced partly by a table `CHECK`: a row that departs from L1 without a category and ten characters of text cannot exist. No client write policy — recording it and writing its history are one act. |
| `procurement_commercial_recommendation_history` | Append-only: every change to the recommendation, who made it, and what it changed from and to. No client write policy. |

**Price negotiation**

| Table | Holds |
|---|---|
| `procurement_negotiations` | One row per case, seeded on arrival at `pnc` against the purchase committee's recommended bidder (or the computed L1): the mandate (reason, instructions, objectives), `status` (`open`, `agreed`, `failed`, `returned`), and — once concluded — the settled price and terms. No client write policy at all; every write goes through the RPCs in §4.8. |
| `procurement_negotiation_rounds` | One row per round: the vendor's offer, the committee's counter, and, once closed, the settled figure and whatever terms moved alongside it. A partial unique index allows only one `open` round per case; `CHECK` constraints refuse a counter above the vendor's offer and a close above it without a stated `override_reason`. No client write policy at all. |

**Purchase proposal**

| Table | Holds |
|---|---|
| `procurement_purchase_proposals` | One row per case, seeded on arrival: the recommended bidder, the original evaluated cost and the negotiated price (`NULL` if negotiation never ran), the terms, and the purchase officer's own `recommendation_note`. No client write policy at all; every write goes through `procurement_save_proposal`. |

**Purchase order**

| Table | Holds |
|---|---|
| `procurement_purchase_orders` | One row per case, seeded on arrival: the PO number, the vendor and value carried from the proposal, delivery/payment/warranty terms, `status` (`draft`/`issued`), `version`, and the vendor's own response recorded on their behalf. No client write policy at all. |
| `procurement_po_lines` | One row per order line, seeded once from the awarded bidder's own priced schedule, or a single lump line when they never priced item by item. No client write policy. |
| `procurement_po_amendments` | Every change made to an issued order, with a reason and what moved from what to what — the same corrigendum shape a floated tender notice already uses. No client write policy. |
| `procurement_po_ai_drafts` | The model's drafted clause text for one order — payment terms, delivery/execution schedule, warranty and inspection, special conditions — for the purchase officer to review. Regenerated in place; never blended into `procurement_purchase_orders` on its own. |

**Goods receipt**

| Table | Holds |
|---|---|
| `procurement_goods_receipts` | One row per delivery cycle, seeded on arrival: `cycle`, `status` (`open`/`closed`/`forwarded`). At most one `open` cycle per case. No client write policy at all. |
| `procurement_grn_lines` | One published order line, one cycle: ordered/previously-accepted/delivered/accepted/rejected quantities, a discrepancy reason where one exists, and a generated `accepted_value`. No client write policy; every write goes through `procurement_save_grn_line`. |

**Payment recommendation**

| Table | Holds |
|---|---|
| `procurement_payment_recommendations` | One row per case, seeded on arrival: the accepted value goods receipt recorded, the invoice number/date/amount, a penalty deduction, a generated `recommended_amount`, voucher detail, and `status` (`pending`/`cleared`). No client write policy at all. |
| `procurement_payment_ai_drafts` | The model's drafted recommendation note for one payment. Regenerated in place; never blended into `procurement_payment_recommendations` on its own. |

Headroom is not stored. `procurement_budget_committed(head)` adds up the estimated value of every live case charged to that head — anything not rejected and past draft — plus the explicit ledger rows, and `procurement_budget_available(head)` subtracts that from the allocation. A draft has not asked for the money yet; a rejected case has given it back.

### 7.1 Editing the master data

`/procurement/admin` is the screen behind `master_data.manage`. It edits the three tables the portal cannot be used without — `procurement_lookups`, `procurement_budget_heads` and `procurement_vendors` — and nothing else. Before it existed, a fresh deployment could not raise a case without a database client, which is the one gap that made the portal unusable out of the box.

**The seven lists.** Departments, material categories, cost centres, procurement types, priorities, units of measure and delivery points are all one table keyed by `kind`. The screen turns a `kind` into a page from `src/features/procurement/lib/masterData.ts`, which also records where each list is read — a rename here re-labels historic cases, because a case points at the entry rather than keeping a copy of its name, and the person renaming it cannot see that from the admin screen.

**Retire, don't delete.** Deactivating an entry (`active = false`) hides it from every picker — `fetchLookups()` filters on `active`, the admin screen deliberately does not — while leaving the cases that already name it intact. Deleting is offered too, because entries do get created by mistake, but every foreign key into `procurement_lookups` is `ON DELETE SET NULL`: the delete confirmation counts the rows that still point at the entry across all nine of those columns and says how many fields will go blank.

**Pasting a list.** Master data arrives as a spreadsheet column far more often than it is typed one row at a time, so each list takes a paste — one entry per line, an optional code after a tab or comma. `(kind, name)` is unique, so names already on the list are filtered out before the insert rather than failing it, and re-pasting a longer list adds only what is new.

**Vendors** get their own tab rather than a `kind` in the lookup table, because a firm is not a name in a list: it has a registration number, a tax identifier, a contact and a standing. Forcing it into the lookup shape would have broken the counting, the bulk paste and the delete-usage check every other list here relies on. There is no delete at all — bidder and invitee rows reference a vendor `ON DELETE RESTRICT`, precisely so that tidying the register cannot rewrite what happened on a tender three years ago. Retiring takes a firm out of the pickers; barring records why it is out, and shows the reason beside it. Writing the register needs `vendor.manage`, which the purchase officer holds; reading it needs nothing, because a roster whose vendor names cannot be resolved renders as blank identifiers at every stage downstream.

**Budget heads** carry name, code, fiscal year, an optional department and category, and the allocation. Committed and available are not editable and not stored: they come from `procurement_budget_ledger()`, derived from the live cases charged to the head. Heads are only ever retired, never deleted, so the ledger keeps adding up.

**Not on this screen.** Stage configuration is reference data the engine validates against — editing the order of the stages or the moves between them from a dialog is a schema change wearing a form's clothes, so it stays a migration. Role assignment and committee rosters are still database work.

### 7.2 Paperwork belongs to the case, not to the stage

A case carries one file for its whole life. The requester's estimate, the tender document, the evaluation report, the committee minutes, the purchase order and the invoice all sit in `procurement_case_documents` against the same `case_id`, each stamped with the `stage` it arrived at.

**Who sees it.** The SELECT policy on that table is `procurement_can_view_case(auth.uid(), case_id)` — the same predicate as everything else in §6. There is no per-stage filter. A tender officer opening the case reads the requester's estimate; a payments officer reads the tender and the minutes. `documents` carries a matching policy so the file itself opens, not just the link row.

**Who can ask about it.** All of it, for anyone who can see the case: `procurement_search_case_chunks` is scoped to the case, not to the asker's own uploads. Whichever desk attached a file, the next desk can put a question to it.

**Who can add.** Attaching needs `upload_docs` plus case visibility. Today that is the requester, the purchase officer, both TEC roles, the receipt/payment officer and the administrator. Finance, commercial, both committees, the approving authority and the PO officer can read every document but cannot add one — a deliberate default, and a `procurement_role_permissions` row away from changing if a committee needs to file its own minutes.

**What a document is called.** `doc_type` is a note about the part the paper plays in *this case*, not a property of the file. It used to be chosen from a twenty-two-item dropdown *before* the attach button would do anything, which made a taxonomy decision the price of putting a file on the case. Now the stage supplies a default — requisition → `Requisition`, tender → `Tender document`, DPC → `Committee resolution`, and so on, from `STAGE_DEFAULT_DOC_TYPE` — and the row can be relabelled afterwards by whoever attached it (or by the administrator). That relabel needed an UPDATE policy the table never had; `20260906090000_procurement_case_document_retype.sql` adds it, scoped exactly like the DELETE policy.

The panel groups by stage in workflow order and marks the current one, so the file visibly accumulates as the case moves rather than reading as one flat list somebody might mistake for their own.

### 7.3 Signatures

Fourteen actions carry `requires_signature`. The flag used to be decoration — the engine read it, recorded nothing and let the decision through. It is now enforced.

**Two tables, deliberately apart.** `procurement_signatures` holds one signature per person, the one they reuse; `procurement_case_signatures` holds one row per signed decision. A saved signature is a convenience the signer controls and may replace at any time. A case signature is evidence: written once, never updated, and holding **its own copy of the image**, so replacing a saved signature cannot retrospectively alter what was signed.

**Who can see what.** A saved signature is visible to nobody but its owner — the administrator included, because it is a reusable credential rather than case evidence. A case signature reads under the ordinary case-visibility predicate: anyone who can open the case sees every mark on it, which is the whole point of signing.

**Nobody can forge or erase one.** `procurement_case_signatures` has a SELECT policy and no INSERT, UPDATE or DELETE policy at all. Its only writer is `procurement_record_decision`, which is `SECURITY DEFINER` and therefore bypasses RLS. A client cannot write a signature row directly, and cannot remove one either.

**The engine demands it.** Inside `procurement_record_decision`, after the guard and **before the case moves** — a case must not advance and then fail to be signed:

```
IF _act.requires_signature THEN
  _sig := _payload -> 'signature';
  IF _sig IS NULL OR btrim(_sig ->> 'image') = '' THEN
    RAISE EXCEPTION '"%" has to be signed', _act.label;
```

The signature travels as `{"signature": {"image": "data:image/png;…", "kind": "drawn"}}` in the `_payload` the function already took. It is stripped back out (`_payload - 'signature'`) before the audit event is written and replaced with `signature_id`, so the trail points at the signature rather than carrying 30 KB of base64 in every event row.

**On screen.** A modal, opened over the action bar after the confirmation — signing is a deliberate act, and a pad living permanently in the page invites a scribble in passing. Buttons for signed actions carry a pen icon so nobody meets the request mid-flow.

- **A first signature** gets the pad (draw, type or upload) and a ticked **Keep this signature and use it by default next time**. It is saved *before* the decision is recorded, so a refusal from the engine does not also lose the mark just drawn.
- **A returning signer** is shown their signature and signs in one press. A finance officer clearing six budgets in a morning should not draw their name six times. **Sign differently this once** opens the pad without overwriting what was saved, and **Forget this signature** removes it.

Signatures appear on the case file in their own panel, on a white plate — signatures are drawn in black ink and would vanish against the dark theme.

**Two things the shared `SignaturePad` needed before it worked in a dialog.** It was written for a page, and both faults were invisible rather than loud:

- It created the pad once, guarded on `!signaturePadRef.current`, and never reset the ref. Radix unmounts dialog content on close, so the second open produced a fresh `<canvas>` while the ref still held a pad bound to the detached one — **every stroke went somewhere nobody could see**. The wrapper is `bg-white`, so a dead pad still looked exactly like a working one. It now builds and tears down one pad per mounted canvas, and sizes itself with a `ResizeObserver` rather than a single measurement at mount, which a dialog's entrance animation can catch at zero width.
- The typed preview drew its name in the inherited foreground colour on a `bg-white` plate. On the light theme that is black on white; on the dark theme it is near-white on white — invisible. It is `text-black` now, explicitly, because the plate is always paper.

The pad's paper stays white in both themes deliberately: the PNG it produces is shown back on a white plate and belongs in printed paperwork, so a signature drawn on a dark ground would invert. The guide line and "sign above the line" hint are DOM overlays above the canvas, not drawn onto it — `clear()` fills the bitmap with opaque white, and anything painted on the canvas would end up baked into the saved signature.

**Decisions taken before this slice have no signature row**, and nothing is backfilled. Those decisions stand as they were taken; the gap is the honest record.

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
7. If the action names a guard function, call it with `(case_id, payload)` and refuse a false answer. When the action also names a `gaps_function`, the refusal quotes it — *"Hand off for technical evaluation" still needs: A tender reference number; At least one recorded bid.* Being told only "this case is not ready", from an action bar, after signing, with the checklist scrolled off screen, is indistinguishable from the button doing nothing — which is exactly how it was reported. *(`mpr.submit`, `tender.to_tec` and `tender.to_commercial` carry one.)* The guard is resolved with `to_regprocedure(guard || '(uuid,jsonb)')` and **skipped silently if that does not resolve**, so a guard whose name or arity is wrong leaves the gate open without complaining — worth an explicit check whenever one is added.
8. If the action requires a signature, take it out of the payload, refuse an absent one, and write the `procurement_case_signatures` row. Before anything moves — a case must not advance and then fail to be signed. See §7.3.
9. Apply it: a `reject` calls `procurement_reject_case()`; anything with a target stage calls `procurement_advance_stage()`; anything else leaves the case where it is.
10. A `send_back` or a `request_clarification` opens a clarification row addressed from the origin stage to the target.
11. Write the audit event, stamped with the origin stage, with the signature's id rather than its image.

### 8.2 The other functions

| Function | Does |
|---|---|
| `procurement_advance_stage(case, to, status, remarks)` | The only thing that writes `cases.stage`. Locks the row, checks visibility, checks the transition is legal, applies the destination's entry status, closes the case if the destination is `closed`, and writes the stage history. |
| `procurement_transition_allowed(from, to)` | True for `→ closed`, for staying put, for any forward move, and for a declared return path. False otherwise. |
| `procurement_reject_case(case, remarks)` | Terminal rejection. See §3.3. |
| `procurement_available_actions(case)` | What the signed-in person may do on this case right now. |
| `procurement_available_actions_with_gaps(case)` | The same rows, each carrying its own `gaps_function`'s output (resolved dynamically the same way a guard is, skipped in silence if it does not resolve). What the action bar actually renders — a non-empty `gaps` disables the button and becomes its tooltip. |
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
| `procurement_guard_tender_ready(case, payload)` | The gate in front of the committee, called as the guard on both ways out of the tender desk. |
| `procurement_tender_gaps(case)` | The same rules as a list, for the tender checklist. |
| `procurement_publish_boq(case)` | Copies the requisition's bill into the tender's snapshot. Refuses once the tender is floated. |
| `procurement_float_tender(case, remarks)` | Checks the mode's own requirements, publishes the bill, freezes the notice, stamps who floated it and when, and logs it. |
| `procurement_close_bidding(case, remarks)` | Shuts the roster and logs how many bids were on file. |
| `procurement_issue_corrigendum(case, payload)` | Numbers the amendment, captures before and after, applies it to the bill or the deadline, flags a value change for finance, and freezes its notice — all in one transaction. |
| `procurement_revoke_corrigendum(id, reason)` | Puts back what the most recent amendment changed. Only the most recent, because reversing an earlier one underneath a later one restores a state nobody was notified of. |
| `procurement_submit_tec_evaluation(bidder, score, compliance, qualified, remarks, signature)` | A member's reading of one bid. Refuses without `tec.evaluate`/`tec.chair`, upserts on `(bidder, member)`. Unsigned — `signature` is accepted but never required; the reading does not move the case. |
| `procurement_set_bidder_qualification(bidder, qualified, note)` | The chair's own final call, separate from any member's. Refuses without `tec.chair`. |
| `procurement_tec_constitute_committee(case)` | Seeds a one-cycle TEC committee for the case from every org-wide `tec_chairman` (chair) / `tec_member` holder. Called by the same trigger that seeds the checklist, so a case never reaches `tec` without one. |
| `procurement_dpc_constitute_committee(case)`, `procurement_pnc_constitute_committee(case)` | The same, for the purchase committee and price negotiation — one org-wide `dpc_chairman`/`dpc_member` or `pnc_chairman`/`pnc_member` committee, seeded by a trigger the moment a case arrives at that stage. |
| `procurement_tec_case_consensus(case)` | Per bidder: how many members scored it, their average, how many called it qualified, and the percentage. Computed on read. |
| `procurement_guard_tec_ready(case, payload)` | The gate in front of commercial evaluation, called as `tec.recommend`'s guard: at least one bidder marked qualified by the chair. |
| `procurement_tec_gaps(case)` | The same rule as a list, for the readiness checklist. |
| `procurement_record_tec_ai_suggestion(bidder, score, compliance, qualified, summary, evidence, model)` | Writes the AI-suggested reading for one bidder. Checks `tec.evaluate`/`tec.chair` the same as a human's own reading, but carries no signature — it is a suggestion, not a decision. Called only from `tec-ai-evaluate`. |
| `procurement_commercial_seed(case)` | Idempotent. Creates the case's `procurement_commercial` row and one `procurement_commercial_quotes` row per received bidder, carrying across the bid amount and tax rate as a starting point. Fired by a trigger on arrival; never repairs a read. |
| `procurement_save_quote(bidder, base, gst_pct, freight, other, discount, loading, loading_note, compliance, source, remarks)` | Upserts one bidder's commercial reading. A loading with no stated note is refused by a table `CHECK`, not by this function. |
| `procurement_record_quote_schedule(quote, lines, source, stated_total)` | Reads a whole price schedule against the published bill in one transaction: matches by id, then name, then containment; derives a rate from a stated amount where needed; raises the seven issue codes; and only overrides the bidder's lump price once every published line is priced. |
| `procurement_set_ranking_basis(case, basis)` | Changes which figure L1 is read off. An event, logged, not a silent preference. |
| `procurement_commercial_ranking(case)` | The ranking, computed on read: every bidder's derived figures, eligibility, the weighted score if that is the basis, and the rank. |
| `procurement_commercial_line_comparison(case)` | The cross-bidder, item-wise matrix — one row per published line per bidder, with that line's own cheapest rate flagged. |
| `procurement_commercial_reasonableness(case)` | The one reasonableness check: the frozen published estimate, grossed up by its own tax rate, against the computed L1's evaluated cost. |
| `procurement_guard_commercial_ready(case, payload)` | The gate in front of the comparative statement, called as `commercial.to_cst`'s guard. |
| `procurement_commercial_gaps(case)` | The same rules as a list, for the commercial desk's checklist. |
| `procurement_commercial_record_recommendation(case, outcome, bidder, reason, text, remarks)` | Records the desk's recommendation and appends a history row. Refuses a departure from the computed L1 without a category and real justification text — enforced again by a table `CHECK`, so the rule cannot be routed around. |
| `procurement_approve_cst_authority(case, remarks)` | The competent authority's clearance for an award that departs from L1 or exceeds the estimate — its own approval kind, not folded into the routine sign-off. |
| `procurement_cst_compile(case)` | Opens the next draft version and seeds its scrutiny checklist. Idempotent; fired on arrival at `cst`. |
| `procurement_save_cst_scrutiny(case, item_key, status, remarks)` | One of the five fixed scrutiny questions, for the record. |
| `procurement_cst_build_snapshot(case)` | Assembles everything a locked statement freezes — every bidder's figures, the matrix, the reasonableness position, the recommendation, both sign-offs, every name resolved at that moment. Called at lock and never again. |
| `procurement_cst_lock(case)` | Freezes the live draft into a locked version. Runs from a trigger once the case has already reached `dpc`, so it cannot itself require the case to still be "at" `cst`. |
| `procurement_commercial_reopen(case, reason)` | Supersedes the live statement version, opens the next as a fresh draft, unlocks the quotes, and retires every sign-off — each is keyed on the version it was given against, so a new version starts with none. |
| `procurement_guard_cst_ready(case, payload)` | The gate in front of the purchase committee, called as `cst.to_dpc`'s guard. |
| `procurement_cst_gaps(case)` | The same rules as a list, for the statement's checklist. |
| `procurement_pnc_seed(case)` | Idempotent. Targets the purchase committee's recommended bidder (or the computed L1), snapshots the opening offer, and creates the case's `procurement_negotiations` row. Fired by a trigger on arrival at `pnc`; flips a `returned` negotiation back to `open` rather than seeding a second one. |
| `procurement_save_negotiation_mandate(case, reason, instructions, objectives)` | Records why the committee is negotiating and what it is negotiating for. Required before a round can open. |
| `procurement_open_negotiation_round(case, vendor_offer, counter, delivery_days, payment_terms, warranty_months, notes)` | Opens the next round. Refused before the mandate is on file, while another round is still open, or if the counter exceeds the vendor's own offer. |
| `procurement_update_negotiation_round(round, …)` | Edits the currently open round as the discussion moves — the vendor's offer, the counter, and the terms alongside them. |
| `procurement_close_negotiation_round(round, final_offer, override_reason, …)` | Settles the round. Refused above the vendor's own offer without a stated `override_reason`. |
| `procurement_pnc_agreement_gaps(case)` | The gate in front of `pnc.agreed`: the mandate, at least one objective, no round left open, and a closed round carrying a settled figure. |
| `procurement_guard_pnc_agreed(case, payload)` | `pnc.agreed`'s guard, wired onto the stage action row rather than seeded with one at the foundation. |
| `procurement_proposal_seed(case)` | Idempotent. Targets whoever price negotiation actually ran against (or the commercial recommendation, or the computed L1), snapshots the evaluated cost and, if negotiation reached agreement, the negotiated price and terms. Fired by a trigger on arrival at `purchase_proposal`. |
| `procurement_save_proposal(case, recommendation_note)` | Writes the purchase officer's own recommendation. Refuses off-desk or without `proposal.draft`. |
| `procurement_proposal_gaps(case)` | The gate in front of `proposal.approve`: a recommendation on file. |
| `procurement_guard_proposal_ready(case, payload)` | `proposal.approve`'s guard, wired onto the stage action row rather than seeded with one at the foundation. |
| `procurement_po_seed(case)` | Idempotent. Creates the order from the approved proposal — vendor, value, terms — and copies the awarded bidder's priced schedule into `procurement_po_lines`, or a single lump line if they never priced item by item. Fired by a trigger on arrival at `purchase_order`. |
| `procurement_save_po(case, delivery_date, delivery_address, billing_address, payment_terms, delivery_terms, special_conditions, warranty_months, penalty_clause)` | Edits the draft. Refuses once the order has been issued. |
| `procurement_po_gaps(case)` | The gate in front of `po.issue`: a delivery date, a delivery address, payment terms, and at least one line. |
| `procurement_guard_po_ready(case, payload)` | `po.issue`'s guard, wired onto the stage action row rather than seeded with one at the foundation. |
| `procurement_record_po_vendor_ack(case, status, note)` | Records the vendor's response on their behalf. Checked against case visibility, not against the case still being "at" `purchase_order` — this is meant to be called after `po.issue` has already moved the case on. |
| `procurement_amend_po(case, reason, delivery_date, delivery_terms, special_conditions, total_value)` | Amends an issued order: logs what changed and why to `procurement_po_amendments`, and bumps `version`. Refuses a draft (there is nothing to amend yet, only to correct) and refuses no stated reason. |
| `procurement_record_po_ai_draft(case, payment_terms_draft, delivery_terms_draft, warranty_clause_draft, special_conditions_draft, model)` | Writes the model's drafted clause text. Checks `po.issue` the same as a human's own edit, but carries no signature — it is a suggestion, not a decision. Called only from `po-ai-draft`. |
| `procurement_case_signatures_named(case)` | Every signature on a case with the signer's name (`profiles`) and the procurement role they held at the moment they signed (the matching `procurement_case_events` row) resolved server-side — neither is something RLS lets a client join for itself. Feeds the signed order PDF's own signature block. |
| `procurement_grn_seed(case)` | Idempotent. Opens cycle 1 and copies every line from `procurement_po_lines` into `procurement_grn_lines`. Fired by a trigger on arrival at `goods_receipt`. |
| `procurement_save_grn_line(line, delivered_qty, accepted_qty, rejected_qty, discrepancy_reason)` | Records one line for the current open cycle. Table `CHECK`s (not this function) refuse classifying more than was delivered, accepting more cumulatively than was ordered, or a rejection with no reason. |
| `procurement_grn_summary(case)` | The rollup grouped by line rather than by cycle: total delivered/accepted/rejected and accepted value across every cycle, and whether the line is fully received. |
| `procurement_grn_close_cycle_gaps(case)` | The gate in front of `grn.close_cycle`: at least one line delivered, and every delivered line fully classified as accepted or rejected. |
| `procurement_guard_grn_close_ready(case, payload)` | `grn.close_cycle`'s guard. |
| `procurement_grn_forward_gaps(case)` | The gate in front of `grn.forward`: the latest cycle not still open. No quantity rule. |
| `procurement_guard_grn_forward_ready(case, payload)` | `grn.forward`'s guard, wired onto the stage action row rather than seeded with one at the foundation. |
| `procurement_payment_seed(case)` | Idempotent. Sums `procurement_grn_summary`'s accepted value into `accepted_value`, and defaults `invoice_amount` to it. Fired by a trigger on arrival at `payment_recommendation`. |
| `procurement_save_payment_recommendation(case, invoice_number, invoice_date, invoice_amount, penalty_deductions, voucher_number, voucher_date, remarks)` | Records the invoice. A table `CHECK`, not this function, refuses a deduction larger than the invoice itself. |
| `procurement_payment_gaps(case)` | The gate in front of `payment.clear`: an invoice number, an invoice date, and a positive invoice amount. |
| `procurement_guard_payment_ready(case, payload)` | `payment.clear`'s guard, wired onto the stage action row rather than seeded with one at the foundation. |
| `procurement_record_payment_ai_draft(case, recommendation_note, model)` | Writes the model's drafted recommendation note. Checks `payment.process` the same as a human's own edit, but carries no signature — a suggestion, not a decision. Called only from `payment-ai-draft`. |
| `procurement_build_notice(tender)` | Assembles the notice payload. Called at floating and at each corrigendum, and never again. |
| `procurement_tender_summary(case)`, `procurement_tender_boq_total(tender)` | What the tender panel reads in one round trip. `lowest_bid` is the lowest amount recorded and never a ranking. |
| `procurement_bid_submissions(case)` | Each firm, its bid status, and how many of its papers have been read. Not an evaluation and not a score. |
| `procurement_bid_document_readiness(case)` | Per-bidder ingest progress, so the roster can say what is still being read. |
| `procurement_search_case_chunks(case, user, embedding, …, bidder)` | Case-scoped retrieval, optionally narrowed to one bidder's own submission. |
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
              insights.ts, boq-import.ts, assistant.ts, masterData.ts,
              signatures.ts, tender.ts, vendors.ts, tec.ts (also calls the
              tec-ai-evaluate edge function), commercial.ts, cst.ts,
              negotiation.ts, proposal.ts, purchaseOrder.ts (also calls the
              po-ai-draft edge function), goodsReceipt.ts, payment.ts (also
              calls the payment-ai-draft edge function)
              signatures.ts (also resolves signer name and role for the
              signed order PDF)
  hooks/      useProcurement.ts — react-query keys and hooks
  lib/        portals.ts (roles → desks, queues, the ten-step chain)
              stages.ts (a one-line brief per stage)
              format.ts (₹ with en-IN grouping, lakh/crore short form, dates, ages)
              masterData.ts (the lookup catalogue and the paste parser)
              formChecks.ts (counting, painting and jumping to a missing field)
              requisitionChecks.ts (the requisition guard's rules, client-side)
              tenderChecks.ts (the tender guard's rules, client-side)
              tecChecks.ts (the tec guard's one rule, client-side)
              tender.ts (how the tender's coded columns read on screen)
              tenderNotice.ts (the notice snapshot, and rendering it to a PDF)
              purchaseOrderPdf.ts (the order and its signatures, rendered to a PDF)
              paymentRecommendationPdf.ts (the invoice and recommendation, rendered to a PDF)
              tec.ts (the checklist and evaluation labels, and the consensus tier)
              commercial.ts (compliance, issue-code and reasonableness labels)
              commercialChecks.ts (the commercial guard's rules, client-side)
              cstChecks.ts (the cst guard's rules, client-side)
              negotiationChecks.ts (the pnc agreement guard's rules, client-side)
              proposalChecks.ts (the proposal guard's one rule, client-side)
              poChecks.ts (the purchase order guard's rules, client-side)
              grnChecks.ts (the close-cycle guard's rules, client-side)
              paymentChecks.ts (the payment guard's rules, client-side)
  components/ PortalLayout, StageIndex, StageActionBar, StageBadge,
              CaseRegisterTable, ClarificationThread, CaseDocuments,
              CaseTimeline, RequisitionEditor, BoqEditor, BoqImport,
              CaseAssistant, ReadinessChecklist, DecisionSignature,
              CaseSignatures, FormSection, TenderNotice, BidderRoster,
              CorrigendumList, VendorPanel, VendorPicker, TecEvaluationRow,
              QuoteScheduleImport (unused as of this slice — no button opens
              it, though procurement_record_quote_schedule behind it still
              works), ComparativeMatrix, GeneratedDocuments (what a stage's
              own "Generate…" button has filed, inline in the panel that
              generated it, reusing CaseDocuments' own ingest-status display)
  components/charts/
              Charts.tsx  — CategoryBars, FlowChart, MeterRow
              palette.ts  — the validated chart colours, light and dark
  stages/     StageWorkPanel.tsx    — the per-stage centre panel; dispatches on
                                      stage through STAGE_PANELS, which is empty
                                      for the eleven stages with no form yet
              RequisitionPanel.tsx  — the requisition, editable at draft and
                                      requisition, read-only thereafter
              TenderPanel.tsx       — the tender desk: setup, dates, money, the
                                      published bill, the notice, the roster,
                                      corrigenda
              TecPanel.tsx          — the technical evaluation desk: the
                                      checklist, and one row per bidder with
                                      their papers, an AI-suggested reading,
                                      the consensus, a member's own reading,
                                      and the chair's call
              CommercialPanel.tsx   — the commercial desk: the reasonableness
                                      position, the ranking, the item-wise
                                      matrix, and one card per bidder for
                                      pricing and the compliance call
              CstPanel.tsx          — the comparative statement: the scrutiny
                                      checklist, the recommendation, and the
                                      version history a reopen leaves behind
              PncPanel.tsx          — price negotiation: the mandate, the
                                      round-by-round bargaining record, and
                                      the readiness checklist in front of
                                      "agreement reached"
              ProposalPanel.tsx     — purchase proposal: the recommended
                                      vendor, the original evaluated cost
                                      against the negotiated price, and the
                                      purchase officer's own recommendation
              PurchaseOrderPanel.tsx — the purchase order: seeded line items,
                                      delivery/payment/warranty terms, the
                                      model-drafted clause text, issuing, the
                                      vendor's recorded response, and
                                      amendments to an issued order
              GoodsReceiptPanel.tsx — goods receipt: the current open
                                      delivery cycle's lines, the rollup
                                      across every cycle, and earlier
                                      deliveries' own history
              PaymentPanel.tsx      — payment recommendation: the accepted
                                      value, the invoice, and the computed
                                      recommended amount

src/pages/procurement/
  ProcurementSignIn, ProcurementHome, ProcurementRegister,
  ProcurementQueue, ProcurementInbox, ProcurementCase, ProcurementNew,
  ProcurementInsights, ProcurementAdmin
```

Master data adds `api/masterData.ts` (the CRUD, plus the usage count the delete
confirmation needs) and `lib/masterData.ts` (the category catalogue and the paste
parser). Its mutations invalidate the whole `procurement` query tree rather than
their own key: a renamed department shows on the register, the insights page and
every open case file, each of which caches it separately. Every tender mutation
does the same, and for the same reason — the gaps, the summary, the checklist,
the action bar's availability and the case row all read the tender and each
caches separately, so a narrower invalidation leaves the officer recording the
last bid while the handoff button stays greyed out.

**The readiness checklist is shared.** `formChecks.ts` holds the counting, the
red ring and the jump-to-field; `requisitionChecks.ts` and `tenderChecks.ts`
hold only their own stage's rules, each mirroring its guard. The tender's
mode-conditional rules are left out of the list entirely when the mode does not
oblige them, rather than shown as already satisfied — an open tender is not a
portal tender with two boxes ticked for free, and the count says so as the mode
changes.

**The tender goes read-only the moment the case moves.** Its write policies stop
matching at that point, and a table with row-level security and no policy that
matches updates zero rows while reporting success. A Save button that appears to
work and changes nothing is worse than one that is not there, so `TenderPanel`
reads the same predicate the policies use.

**The centre panel dispatches on stage.** `StageWorkPanel` renders the case summary, then whichever stage panel is registered in `STAGE_PANELS` for the stage being read, then the requisition. Nothing is registered for twelve of the fourteen stages, and that is the normal case: a stage with no working form of its own should show nothing rather than an empty frame promising a form that does not exist. The requisition stays last on purpose — what this desk is doing, then what it is doing it against.

The case file puts the stage index down the left, the current stage's work panel in the centre, and documents, clarifications and the activity timeline alongside. The requisition sits under the work panel at every stage — editable while the case is still the requester's, read-only once it has moved on, because finance decides against it and the tender is written from it.

**Which stage you are looking at follows the case.** `ProcurementCase` keeps the reader's pick as `selected`, where `null` means "wherever the case is"; clicking a stage in the index pins it, and the pin is dropped whenever the case's own stage changes. Getting this wrong is not subtle from the outside: an earlier version copied the stage into state on first load and never let go, so taking a decision left the header and the index showing the new stage while the work panel still showed the old one and the action bar had disappeared — indistinguishable from a page that had failed to refresh, and only a reload cleared it. Every query on the page is invalidated by `useStageDecision` under the `procurement` key prefix, so the data was never the problem.

Three edge functions serve the portal: `supabase/functions/extract-boq` reads a bill of quantities out of a file and returns it for review; the existing `rag-assistant` gained a `caseId` that swaps the personal search for the case-scoped one; and `supabase/functions/tec-ai-evaluate` proposes a technical reading for one bidder, on request, writing only to `procurement_tec_ai_suggestions` — never to a bidder's own record or a member's evaluation.

**Chart colours are validated, not chosen by eye.** `components/charts/palette.ts` carries two categorical hues per theme — the product's blue and an ochre — checked with the `dataviz` skill's validator for lightness band, chroma, contrast against the card surface, and colourblind separation (worst adjacent pair ΔE 30.2 in light, 26.5 in dark, against a floor of 8). Magnitude charts use the blue alone and label every bar, so nothing depends on colour to be read. The `--signal` cyan never appears: `index.css` reserves it for values the machine derived, and a count of cases is not one. The action bar renders whatever `procurement_available_actions()` returned, and forces a remarks field when the action demands one — but the database is the thing that enforces it, not the form.

---

## 10. Testing

### 10.1 Bring the stack up

```bash
# 1. Start Supabase (Postgres, GoTrue, PostgREST, Kong, Studio).
docker compose --project-directory docker -f docker/docker-compose.yml up -d

# 2. Apply migrations, then seed the three app accounts. Idempotent.
#    Use bootstrap, not `npm run migrate`: the latter needs psql on the host,
#    which a Windows box generally does not have. Bootstrap runs the same
#    ledger logic through `docker exec` against the db container instead.
npm run bootstrap

# 3. Seed the sixteen procurement accounts and their roles. Separate step —
#    bootstrap does not create them, and without it every account, admin
#    included, is told it holds no procurement desk.
npm run seed:procurement

# 4. Run the app.
npm run dev          # http://localhost:8080
```

If the portal says **"This account has no desk"** for an account that should hold
one, the procurement migrations have not been applied — check
`select version from public.schema_migrations order by version desc limit 5;` for
the `2026090*_procurement_*` files, then run the two commands above.

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

`check:procurement` impersonates users by setting `request.jwt.claims`, opens a probe case, and asserts the visibility and transition rules hold — twenty-seven assertions, including that the tender desk's write actually matches a row, that generated columns cannot be written, that the published bill and the roster shut when they should, that a corrigendum still gets through after they have, that the technical evaluation committee's checklist, unsigned member readings, and the chair's own qualification call all behave, that the TEC committee constitutes itself so the chair actually sees `tec.recommend`, and that an AI suggestion can only be written through its own function.

Neither script needs `psql` on the host. `npm run check:procurement` calls it directly; on a machine without it, pipe the same file through the container:

```bash
docker exec -i jyoma-postgres psql -U postgres -d postgres -f - < scripts/check-procurement.sql
``` `check:procurement:api` signs in as the seeded users for real and walks a case from draft to tender, asserting along the way that:

- the requester can open a case and raise it, and it reaches finance with the status `Awaiting finance clearance`;
- an incomplete requisition is refused by the stage guard, and `procurement_requisition_gaps` names what is missing;
- once the requisition and its bill of quantities are saved, the case value equals the bill total — the trigger, not the client, decides it;
- an action the caller has no permission for is refused by the database;
- the case appears in the right person's worklist;
- the payments desk cannot see a case still at tender;
- a finance send-back returns the case to the requisition **and** opens a `send_back` clarification;
- after clearance the case is at tender;
- the vendor register is readable by the tender desk, and a GeM tender with no portal number is flagged by `procurement_tender_gaps`;
- an unfloated tender with no bids cannot reach the committee;
- floating opens bidding, freezes the notice and carries the published bill into it;
- the published bill refuses ordinary writes once floated, and editing the tender afterwards leaves the issued notice alone;
- a bid's gross amount is derived by the database, and the roster closes when bidding does;
- a requester's write to the tender matches no rows — asserted on the rows returned, not on the absence of an error, which is the precise shape of a policy bug that has bitten this project before;
- each bid's papers are attributed to that bid and to no other, and an active document counts as read;
- the hand-off to the committee is refused unsigned, leaves a signature on the case when signed, and closes bidding on the way out without anyone pressing **Close bidding**;
- a refused decision names the gaps rather than only saying the case is not ready;
- with nothing outstanding the case reaches technical evaluation, and its checklist is already seeded;
- a committee member can submit a technical reading with no signature at all, a requester cannot submit one at all;
- only the chair can make the final qualification call — a member is refused, and a direct write to `tec_qualified` afterwards changes nothing;
- once a bidder is qualified, `tec.recommend`'s guard and its gaps list agree there is nothing left outstanding, the computed consensus reads the one member's reading back correctly, and the chair actually sees `tec.recommend` on the action bar because the TEC committee constituted itself on arrival;
- an AI suggestion can only be written through `procurement_record_tec_ai_suggestion`, never by a direct insert or by someone without a committee seat — the `tec-ai-evaluate` edge function itself needs a live model round trip and is exercised by hand (§10.9);
- the purchase head can see the case but has no actions available on it.

Both should end with every assertion passing and a non-zero exit only on failure.

### 10.4 The committees constitute themselves

Chair-only actions (`tec.recommend`, `dpc.to_pnc`, `dpc.to_proposal`, `pnc.agreed`, and their siblings) require the caller to be the **chairperson of a committee constituted on that specific case**. All three committee stages now seed one the moment a case arrives — a trigger on `procurement_cases` fires for `tec`, `dpc` and `pnc` alike, seating every org-wide holder of that stage's chair role (as chair) and member role — see §4.5. There is nothing to run by hand: `tec.chair@jyoma.ai`, `dpc.chair@jyoma.ai` and `pnc.chair@jyoma.ai` each already see their stage's chair-only actions the moment a case reaches that desk, and each appears in their own worklist.

This is org-wide, not case-scoped — every TEC chair in the organisation sits on every case's TEC committee, and the same for DPC and PNC. A committee scoped to the case's own department or category is still database work, the same stated limit as everywhere else case-specific role assignment carries in this product (§11).

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

Expect: the page becomes the requisition itself, headed `DRAFT · PC-2026-0001`; a red-bordered checklist at the top reads **2 of 4 still to fill in** and names them; step 1 shows `1 to fill in` and step 3 shows `1 to fill in`; the needed-by and value fields carry a red border and a `needed` chip; the **Raise and send for finance clearance** button is disabled and says what is outstanding.

Press the checklist's **Say when it is needed by** row: the page should scroll to that field and focus it. Fill it in and watch that row go green with a tick, step 1 flip to `done`, and the count drop to `1 of 4` — all without saving. That is the whole point of the client-side copy of the rules; the database still decides whether the case actually moves.

Now fill it in:

1. **What is needed** — a justification, a category, a procurement type, a priority, and a **needed by** date some weeks out.
2. **Bill of quantities** — either way round:
   - *By hand:* press **Add an item** and enter `Spectrum analyser, 26.5 GHz`, quantity `1`, unit `Nos.`, rate `4000000`. Add a second line — `Calibration kit, 3.5 mm`, quantity `2`, rate `125000`. Expect the bill total to read `₹42,50,000`.
   - *From a file:* press **Read items from a file** and pick a spreadsheet or CSV of items (see §10.9 for one to paste). Expect a toast saying the file was attached, then — after up to a minute, since it is a model call — a review table of what was read. Press **Use these items** and confirm they land in the bill with their rates. Confirm the file also appears under **Supporting documents** and moves to `indexed`.
3. **The money** — pick the budget head `Laboratory Equipment`, and confirm the select shows how much it has left. Choose **The bill total**; the "raising this for" figure should follow it. Try picking a head with less headroom than the bill and confirm the shortfall line appears.
4. **Supporting documents** — optional. Press **Add a document** and pick any PDF: one click, no type to choose first. It should appear under the `Requisition` heading, typed `Requisition` because that is the stage, and move through `queued → reading → indexed`. Change its type on the row to `Cost estimate` and confirm it sticks after a refresh. It should also be visible in the document workspace at `/documents`, because it is the same document. Then confirm the opposite: with nothing attached at all, the checklist stays empty and the case can still be raised — paperwork is suggested, not demanded.

Press **Save the requisition**. Expect a toast naming the case, the checklist to empty, and the raise button to become available.

Check the arithmetic held: reopen the case and confirm the header value is `₹42,50,000` — the figure came from the bill, not from anything typed into a cost box.

Press **Raise and send for finance clearance**. Expect: the case lands on `/procurement/case/PC-2026-0001` at stage **Finance**, status `Awaiting finance clearance`; the activity timeline carries two new entries, `Raise requisition` (draft → requisition) and `Send for finance clearance` (requisition → finance); the case leaves your worklist.

*Also worth trying:* press **Raise and send** before filling anything in. The button is disabled in the portal, and if you call the action directly the database refuses it with `This case is not ready for "Send for finance clearance"`.

---

**Step 2 — the budget decision.** *(`finance@jyoma.ai`)*

You land on `/procurement/queue/finance`. Expect the case to be there, and to be in **Waiting on you**.

First test the send-back. Press **Return to the requester**, remarks `Cost estimate is missing the annual maintenance component.` Expect: stage back to **Requisition**, status `Returned for correction`; a `send_back` thread on the case carrying your remarks.

Sign in as `requester@jyoma.ai` again, read the thread, press **Send for finance clearance**. The case is back at finance.

Back as `finance@jyoma.ai`, press **Clear the budget** with remarks `Head EI-CAP-2026 has the headroom; cleared.` (remarks are compulsory here — try it empty first and confirm the database refuses it).

This is the first signed action in the walkthrough, so the button carries a pen icon and the confirmation says you will be asked to sign. Confirm, and expect the signing modal: a pad, and **Keep this signature and use it by default next time** already ticked. Draw something and press **Clear the budget**.

Expect: stage **Tender**, status `Tender in preparation`, and a **Signed** panel on the case file showing the mark against *Clear the budget*. Take a second signed action later as the same account and expect the modal to offer that signature rather than an empty pad.

Worth proving the gate is not in the browser: call the action directly with no signature and expect `"Clear the budget" has to be signed`.

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<finance-uuid>","role":"authenticated"}';
SELECT * FROM public.procurement_record_decision('<case-uuid>', 'finance.clear', 'Cleared.');
```

---

**Step 3 — the tender.** *(`tender@jyoma.ai`)*

Landing queue `/procurement/queue/tender`, case present. Open it: the tender panel sits under the case summary, and the checklist at the top says what is still missing.

1. **Set it up.** Reference `NIT/2026/014`, mode **Open**, a scope line, a deadline for bids a week out. Press **Save the tender**. The checklist should go green except for floating, closing and the bids.
2. **Try to hand it off anyway.** The action bar still offers **Hand off for technical evaluation**; pressing it is refused, and the refusal names what is missing — *"still needs: The tender to be floated; At least one recorded bid"* — because the guard reads committed state, not the form.
3. **Publish the bill and float it.** Press **Copy from the requisition**, then **Float the tender**. Expect the lifecycle strip to move to **Floated**, a **What went out** section to appear, and the timeline to gain *Tender NIT/2026/014 floated*.
4. **Check the notice is frozen.** Change the eligibility text and save. The notice section must not change. Then press **File it on the case** — the notice appears under case documents as a generated PDF and starts processing, and a minute later the case assistant can answer questions about it.
5. **Record the bids.** Two firms from the register, with amounts and a tax rate. The **With tax** column is worked out by the database; it cannot be typed.
6. **File each firm's papers.** Attach the certificate bundle in the **Record a bid** form itself, or expand an existing bidder row and attach there. Wait for **reading** to clear, then press **Ask about this bid** and ask something only that firm's papers could answer. Ask the same question with the scope cleared: the whole-case answer will happily quote the *other* firm's certificate, which is exactly the confusion the scoping exists to prevent.
7. **Amend something.** Issue a schedule corrigendum extending the deadline. It gets number 1, and the roster reopens if it had closed.
8. **Hand off for technical evaluation.** You will be asked to sign it. Bidding closes on the way out, so there is no need to close it first — press **Close bidding** only if you want the roster shut before you are ready to move the case. Expect: stage **Technical evaluation**, status `Technical evaluation underway`, the signature on the case, and the tender panel now read-only — though each bid's papers can still be added to.

*(Try a **GeM** tender on a second case: the checklist should demand the portal's own number, and floating should be refused without it. The alternative route out, **Open commercially without evaluation**, needs remarks and skips straight to commercial.)*

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
| `dpc.chair@` calling `dpc.to_pnc` before the case has actually reached `dpc` | `dpc.to_pnc is not available while the case is at %` — a committee exists org-wide the moment any case reaches the stage, so this now fails on the stage check rather than the chair check |
| `tec.chair@` calling `tec.recommend` before any bidder is qualified | `"Recommend for commercial evaluation" still needs: At least one bidder marked qualified by the chair` |
| `tec.member@` calling `procurement_set_bidder_qualification` | `You do not hold tec.chair` |
| `requester@` calling `procurement_submit_tec_evaluation` | `You do not hold tec.evaluate` |
| Anyone `UPDATE`ing `procurement_bidders.tec_qualified` directly | Zero rows changed — the tender's own write policy stops matching once the case leaves that stage, and nothing else grants it |
| `INSERT`ing into `procurement_tec_evaluations` through the API | Refused — the table has no write policy at all; only `procurement_submit_tec_evaluation` writes it |
| `requester@` calling `procurement_record_tec_ai_suggestion` | `You do not hold tec.evaluate` |
| `INSERT`ing into `procurement_tec_ai_suggestions` through the API | Refused — no write policy at all; only `procurement_record_tec_ai_suggestion` writes it |
| `finance@` calling `finance.clear` with empty remarks | `Remarks are required for "Clear the budget"` |
| `requester@` calling `mpr.submit` on a requisition with no needed-by date or no cost | `This case is not ready for "Send for finance clearance"` |
| `finance@` calling `finance.clear` with no signature in the payload | `"Clear the budget" has to be signed` |
| Anyone `INSERT`ing into `procurement_case_signatures` through the API | Refused — the table has no INSERT policy; only the engine writes it |
| `admin@` reading another account's row in `procurement_signatures` | Returns nothing — a saved signature is private to its owner |
| `tender@` calling `tender.to_tec` on a tender with no reference number | `"Hand off for technical evaluation" still needs: A tender reference number` — the refusal names the gap, it does not merely say "not ready" |
| `tender@` calling `tender.to_tec` before bidding is closed | **Allowed** — the hand-off closes bidding itself. Check `procurement_tenders.status` afterwards |
| `tender@` floating a GeM tender with no `portal_reference` | `A tender floated on a portal needs that portal's own number` |
| `tender@` floating a single-source tender with no justification | `A single-source tender needs a written justification` |
| `tender@` `INSERT`ing into `procurement_tender_items` after floating | Refused — the write policy only matches while the tender is `draft` or `ready` |
| `tender@` recording a bid after `procurement_close_bidding` | Refused the same way — the roster shuts with bidding |
| Anyone writing `line_amount` or `bid_amount_gross` | Refused — both are generated columns |
| `requester@` `UPDATE`ing `procurement_tenders` | Zero rows changed. **Assert on the row count, not on an error**: an update no policy matches reports success and changes nothing |
| Editing a tender after floating, then re-reading `notice_snapshot` | Unchanged — an issued notice is frozen |
| Withdrawing a corrigendum that is not the most recent | `Only the most recent corrigendum can be revoked` |
| Deleting a vendor that has bid on anything | Refused by the foreign key — retire or bar it instead |
| `tender@` calling `tender.to_tec` with no signature in the payload | `"Hand off for technical evaluation" has to be signed` |
| Removing a bidder who had papers filed | The bidder goes; the documents stay on the case with `bidder_id` cleared |
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

**Asking the assistant to suggest a technical reading.** With a case at `tec` and a bidder carrying at least one indexed document, sign in as `tec.member@jyoma.ai` or `tec.chair@jyoma.ai`, open the bidder's row, and press **Ask the assistant** in the cyan panel.

- Expect the button to be disabled with a tooltip if the bidder has no papers filed at all.
- Expect a `pending` message rather than a guess if the papers are still being read, or if the tender has no eligibility, scope or bill text to check against.
- Otherwise expect, after roughly ten to twenty seconds against a remote model: a score, a compliance call, a verdict, two or three sentences of summary, and a short list of evidence rows, each with a met/not-met/unclear mark. Every "met" should be traceable to something the excerpts actually say — if a requirement is not addressed anywhere in the bidder's papers, its finding should read "not_met" or "unclear", never "met".
- If nothing has been recorded yet, expect "my reading" on the left to fill in with the suggested score, compliance and verdict the moment the suggestion comes back — and nothing to be submitted; **Submit my reading** is still a separate press, and it needs no signature. If a reading is already recorded, expect the fields to stay as recorded; press **Use this as my starting point** to pull the new suggestion in deliberately.
- Confirm the suggestion is *not* what `procurement_guard_tec_ready` reads: pressing **Ask the assistant** alone, with no chair action taken, must not make `tec.recommend` available.

**Sending a case on from TEC.** Sign in as `tec.chair@jyoma.ai` on a case at `tec` and qualify at least one bidder. Expect `tec.recommend` to already be sitting in the action bar at the bottom of the page — no manual committee setup needed, per §4.5. Press it, write remarks, and expect to be asked to sign, the same as any other signed decision; confirm the case lands at `commercial` afterwards. Confirm `tec.member@jyoma.ai` never sees `tec.recommend`, `tec.query`, `tec.return` or `tec.refuse` at all — those stay chair-only regardless of committee membership.

### 10.10 Price negotiation

Get a case to `pnc` (`dpc.to_pnc` as `dpc.chair@jyoma.ai`, or the migration's own backfill on a case already there), then sign in as `pnc.chair@jyoma.ai` or `pnc.member@jyoma.ai` — both see the desk, only the chair sees `pnc.agreed`, `pnc.return` and `pnc.failed`.

- Expect the vendor and the opening offer already filled in — the recommended bidder from the comparative statement, or the computed L1, at its evaluated cost. No setup screen, the same as TEC's committee.
- Try **Open a round** before saving a mandate. Expect it disabled, and the readiness checklist naming the mandate and the objective as outstanding.
- Save a mandate with a reason and at least one objective, then open a round with the vendor's offer and a counter above it. Expect the save refused — a counter cannot exceed the vendor's own current offer — with the reason stated plainly.
- Open a round with a counter at or below the vendor's offer. Try opening a second round while the first is still open; expect it refused until the first closes.
- Close the round with a settled figure above the vendor's own offer and no reason. Expect it refused. Add a reason and it should go through.
- With a round closed on a lower figure, expect the readiness checklist to go green and `pnc.agreed` to appear on the action bar. Press it, sign, and confirm the case reaches `purchase_proposal`, `procurement_negotiations.status` reads `agreed`, and the locked comparative statement's own snapshot has not changed — the negotiated figure sits beside it, not in place of it.

### 10.11 The purchase order

Get a case to `purchase_order` (`proposal.approve` as `approver@jyoma.ai` with a recommendation on file, or the migration's own backfill on a case already there), then sign in as `po@jyoma.ai`.

- Expect the vendor, the order value and at least one line already filled in — copied from the approved proposal and its priced schedule, no setup screen.
- Expect `po.issue` absent from the action bar, and the readiness checklist naming the delivery date, address and payment terms as outstanding.
- Press **Draft the clauses**. Expect it to take up to a minute against a remote endpoint, then four paragraphs to appear — payment terms, delivery terms, a warranty clause, and special conditions — each grounded in whatever is already on the order. Press **Use this** on one and confirm the field below it fills in; confirm nothing is written to the order itself until **Save the order** is pressed.
- Fill in a delivery date, a delivery address and payment terms (by hand, or from the draft), save, and confirm `po.issue` appears and the checklist goes green.
- Press `po.issue`, sign, and confirm the case reaches `goods_receipt` and the order reads `issued` with who and when.
- Record the vendor's response (acknowledged / accepted / rejected) and confirm it shows on the order. Confirm this is purely informational — nothing about the case's progress depends on it.
- Amend the order with a new delivery date and a reason. Confirm the version increments and the amendment appears in the order's own history. Try amending with no reason typed; expect it refused.
- Once issued, press **Generate the signed order**. Confirm it downloads as a filed, generated document on the case (visible in Paperwork, and to the case assistant once indexed) with the order's own terms and lines, followed by every signature on the case's whole trail — not only `po.issue`'s — each with the signer's name, the role they held, and their actual mark.

### 10.12 Goods receipt

Get a case to `goods_receipt` (`po.issue` as `po@jyoma.ai`, or the migration's own backfill on a case already there), then sign in as `payments@jyoma.ai`.

- Expect a delivery already open, with one line per order line — item, unit, rate, ordered quantity — no setup screen.
- Try **Close this delivery** with nothing recorded. Expect it refused, naming "at least one line actually delivered."
- Record a delivery on one line: deliver 5, accept 4, reject 1, with no reason. Expect the save refused. Add a reason and it should go through.
- Try recording accepted 4 and rejected 2 against a delivery of 5. Expect it refused — accepted plus rejected cannot exceed delivered.
- Leave the order's other line(s) short of their own ordered quantity and press **Close this delivery**. Expect it to succeed, and a second delivery cycle to open automatically, carrying forward what has already been accepted per line.
- Try `grn.forward` while the second cycle is still open. Expect it refused — a delivery still being recorded blocks forwarding, regardless of quantity.
- Bring every line to its full ordered quantity across cycles, close the final cycle (expect no third cycle to open), then press `grn.forward`. Confirm the case reaches `payment_recommendation` without ever having been asked for a full single delivery.

### 10.13 Payment recommendation

Get a case to `payment_recommendation` (`grn.forward` as `payments@jyoma.ai`, or the migration's own backfill on a case already there). Same account owns this desk too.

- Expect the accepted value already filled in from goods receipt, and the invoice amount defaulted to the same figure — no setup screen.
- Expect `payment.clear` absent from the action bar, and the readiness checklist naming the invoice number, date and amount as outstanding.
- Try recording a penalty deduction larger than the invoice amount. Expect it refused.
- Record a real invoice number, date and amount. Press **Draft the recommendation**; expect it to take up to a minute against a remote endpoint, then a short note to appear grounded in the figures already on the record. Press **Use this** and confirm it fills the remarks field; confirm nothing is written until you generate.
- Press **Generate the invoice**. Confirm it saves the recommendation, recomputes the recommended amount as invoice less deduction, and files a document on the case (visible in Paperwork, and to the case assistant once indexed) with the invoice detail and the remarks. Confirm the checklist goes green.
- Press `payment.clear`, sign, and confirm the case reaches `closed` (case status `closed` too) and the recommendation reads `cleared` with who and when.

### 10.14 Master data

Sign in as `admin@jyoma.ai` and open **Master data** in the header (`/procurement/admin`).

- Add a department by typing a name and pressing **Add**. Then open `/procurement/new` and confirm it is in the department picker — the mutation invalidates the whole procurement tree, so no refresh should be needed.
- **Paste a list** into material categories: three lines, then paste the same three plus a fourth. Expect *"Added 1, skipped 3 already on the list"* rather than a unique-constraint error.
- **Retire** an entry. It should vanish from the requisition's picker while still reading as `retired` on the admin screen, and any case already naming it should still show the name.
- Press the delete icon on an entry a case uses. Expect the confirmation to name how many records point at it and to say the field will be left blank; on one nothing uses, expect *"Nothing points at this entry."*
- Add a budget head with an allocation, then charge a requisition to it. Come back and confirm **Committed** and **Left** have moved — those two columns are read from `procurement_budget_ledger()`, never typed.
- On the **Vendors** tab, add a firm, retire it, and confirm it disappears from the picker on a tender while the tab still lists it. Bar another with a reason and confirm the reason shows beside it. There is no delete button anywhere, which is deliberate.
- Sign in as `finance@jyoma.ai`: no **Master data** link in the header, and opening `/procurement/admin` directly should bounce. Finance does hold `finance.approve`, so the budget-head *policy* would let it write; the route is gated on `master_data.manage`, which it does not hold.

## 11. Known limits

- **Signatures are captured, not certified.** Fourteen actions are signed and the engine refuses them unsigned, but a drawn mark is not a cryptographic signature: there is no key, no certificate and no tamper seal on the surrounding record. It proves who was at the keyboard as well as a paper signature proves who held the pen, and no better.
- **Nothing is backfilled.** Decisions taken before signing was enforced carry no signature row.
- **A holding action's button never disappears once it has already been pressed.** `commercial.opening_approve`, `cst.generate`, `cst.po_approve`, `cst.finance_approve` and `cst.signoff` are all idempotent when pressed again after they have already succeeded — nothing is undone or duplicated — but nothing removes the button from the bar once its own job is done. This is a narrower gap than it used to be: see the next point.
- **The action bar now greys out a not-yet-ready action instead of letting it fail silently on press.** Reported directly: pressing "Forward for payment" while a delivery cycle was still open did nothing but return the database's refusal, indistinguishable from a broken button. `procurement_available_actions_with_gaps` resolves every visible action's own `gaps_function` the same way `procurement_record_decision` resolves a guard — dynamically, via `to_regprocedure`, skipped in silence if the name does not resolve — and the action bar disables a button whose gaps are non-empty, with the gaps themselves in the tooltip. This covers every guarded action generically (`proposal.approve`, `po.issue`, `pnc.agreed`, `grn.close_cycle`, `grn.forward`, `payment.clear`, and any future one), not goods receipt specifically. What it does not cover: an action with no `gaps_function` at all (the purchase committee's own actions, `payment.hold`/`return`/`refuse`) still shows as pressable with no readiness signal, because there is no gate to read — that is a real absence of a guard, not a UI gap.
- **Every stage from the requisition through payment recommendation now has a stage guard except the purchase committee itself.** `mpr.submit`, `tender.to_tec`, `tender.to_commercial`, `tec.recommend`, `commercial.to_cst`, `cst.to_dpc`, `pnc.agreed`, `proposal.approve`, `po.issue`, `grn.close_cycle`, `grn.forward` and `payment.clear` are guarded; `dpc.to_pnc` and `dpc.to_proposal` are checked by permission and remarks alone. A guard whose `(uuid, jsonb)` signature does not resolve is skipped silently, so every migration that adds one now ends with an explicit `to_regprocedure` assertion — the commercial, cst, negotiation, proposal, purchase order, goods receipt and payment migrations are the first to actually check this instead of only warning about it.
- **Documents are optional by design.** Nothing requires paperwork on a requisition — a service or a lump-sum job may have none. If your organisation wants a hard rule, it belongs in `procurement_guard_requisition_ready`, not in the portal.
- **A read bill is a draft, not a fact.** `extract-boq` is a model reading a file; it is shown for review and never written on its own, but a requester who accepts it without looking will put the model's arithmetic on the case. Rates and quantities deserve a glance.
- **The case assistant answers from what has been indexed.** A file attached a moment ago is not yet answerable, which the panel says; and a document the pipeline failed to read is silently absent from answers rather than flagged in them.
- **The purchase committee is the one stage left as a summary.** It shows the case, the requisition it came from, and its decisions; the committee's own resolution is a remark on `dpc.to_pnc` or `dpc.to_proposal`, not a record of its own.
- **Payment recommendation has no three-way match, no statutory deduction, and no bank/beneficiary detail — matching the reference's own module, not a gap relative to it.** The recommended amount is invoice less a flat penalty deduction; nothing checks it against the purchase order's own value or the accepted value beyond showing both side by side. There is no due date, no partial-payment concept distinct from a hold, and no security-deposit or bank-guarantee release tied to closing — none of these exist in the reference's own payment module either.
- **Clearing payment closes the case directly, with no separate completion record.** The reference does the same — approval sets a status and transitions the case, nothing more. A voucher number and date can be recorded, but nothing here generates one automatically or moves any money; actual payment happens entirely outside this system.
- **Goods receipt has no inspection/QA step of its own, matching the reference's own actual behaviour rather than its unused schema.** Whoever holds `grn.create` records delivered, accepted and rejected quantities directly; there is no second, separate verdict from an inspector.
- **A discrepancy is a recorded fact, not a procedural trigger.** Rejecting a quantity needs a reason, but nothing here generates a debit note, a short-supply notice to the vendor, or any other downstream action from it — the same as the reference's own module.
- **Goods receipt cycles are keyed on published line number, not on a stable per-line identity.** If a purchase order's own lines were ever edited after receiving began (they currently cannot be, since `procurement_purchase_orders` refuses edits once issued), a reopened cycle's carried-forward figures would be keyed on `line_no` matching, the same limit `procurement_quote_lines` already documents for a corrigendum.
- **The purchase proposal does not split "approve" from "raise the purchase order."** The reference stages a draft purchase order on approval and has a separate PO officer issue it; here `proposal.approve` moves straight to `purchase_order` in one press, and the order itself is seeded fresh on arrival rather than inheriting a draft the proposal step already created.
- **A purchase proposal seeded before negotiation ran keeps reading that way even if a later return sends the case back through negotiation.** The seed is idempotent and never repaired on a later read, the same convention as every other seed-on-entry trigger — see `purchase_proposal → pnc` in the return-paths-with-no-button list below.
- **The purchase order's and the payment recommendation's AI-drafted text are grounded only in figures already on file, and can be wrong the same way any model output can be.** `po-ai-draft` and `payment-ai-draft` are both told not to invent a payment percentage, a discount, or a penalty rate that was not given to them, but each is still a model reading a short prompt, not a lookup — pressing "Use this" without reading it puts the model's wording, not just its arithmetic, into the record.
- **"Generate the invoice" produces an internal recommendation document, not the vendor's own invoice.** The button reflects what the officer typed against the invoice already in hand (its number, date, amount) plus the computed recommended figure — it does not, and could not, fabricate the vendor's actual commercial instrument.
- **An issued order's amendment only covers price, delivery date, delivery terms and special conditions.** `procurement_amend_po` does not cover a change of vendor, a change to the line items themselves, or a change to payment terms or warranty — those would need a fresh order, the same as a tender corrigendum cannot change who is bidding.
- **The vendor's acknowledgement is informational, not a gate.** Recording "rejected" does not block, return, or otherwise affect the case — there is no logic anywhere that reads `vendor_ack_status` except the panel that displays it.
- **`po_officer` held no document-upload permission at all until this slice.** Every other stage-owning role that files paperwork of its own (the requester, the tender/tec trio, receipt and payment) already held `upload_docs`/`docs.upload`; the purchase order desk was the one left out, discovered when the signed order PDF's own "file this on the case" step failed outright. Fixed by `20260911210000_procurement_po_officer_upload.sql` — worth remembering if a future role is added and only granted the permission its own primary action needs.
- **There is no bidder-facing door, and no sealed-bid guarantee.** The tender is floated elsewhere and the purchase officer records what came back. Nothing stops a bid being entered, edited or removed before bidding closes, and the portal should not be described as if it received bids itself.
- **The notice is generated but not floated.** Filing it on the case is where this slice stops: nothing publishes it to a portal, emails it, or tells a bidder anything. `procurement_corrigendum_notices` records that somebody was told, by whatever means; it does not do the telling.
- **The technical evaluation stops at score, compliance and a verdict — there is no line-by-line spec matrix.** A member's reading of a bid is one score, one compliance call and one qualified flag for the whole submission; nothing compares each published bill line against what a bidder actually quoted, the way the comparative statement will for price. Building that matrix from `procurement_tender_items` is future work, not a gap in what shipped — the checklist and the per-member reading are what this slice promises, and both are real.
- **The AI suggestion is one call per bidder, on request — never a whole roster, and never on its own.** A member presses "Ask the assistant" and the same retrieval "Ask about this bid" does turns into a proposed score instead of an answer to a typed question. It refuses rather than guesses when a bidder's papers are not indexed yet, and it never runs by itself when a case reaches this desk — a model call has a real cost, and papers may still be mid-ingest.
- **A qualification can be reversed at any time before the case leaves the desk, including after `tec.recommend` has fired once and been undone by a return.** There is no `evaluationLocked`-style freeze once the recommend action succeeds; the guard is checked at the moment of the decision, not enforced as a standing constraint on the bidder row afterward.
- **Nothing checks that a firm actually sent anything.** A bid with no papers at all passes the tender gate; the guard counts bids and amounts, not attachments. That is deliberate for now — a limited tender for a known supplier may legitimately carry none — but it means "no certificate on file" and "no requirement for one" look the same.
- **Bids are still recorded at the tender desk as one amount.** The commercial desk now supports pricing item by item against the published bill, and a bidder's `procurement_bidders.bid_amount` is only ever the tender officer's own starting figure — but nothing forces a schedule; a lump sum priced by hand at the commercial desk is a legitimate, fully supported path, and `procurement_tender_summary.lowest_bid` at the tender desk itself is still not a ranking and must not be shown as one.
- **Pre-bid queries are not modelled separately.** The clarification thread is internal; a question from a bidder has nowhere of its own to live, and the pre-bid meeting is a date and a venue rather than a record with minutes.
- **A corrigendum that moves the money only raises a flag.** `needs_finance_review` is set and shown; nothing routes the case back to finance or blocks the handoff on it.
- **Budget commitments are derived, not posted.** Headroom is computed from live case values rather than written as ledger entries at each approval, so there is no record of when a commitment was made, only what it is now.
- **Some declared return paths have no button.** `mpr → draft`, `cst → tec`, `cst → tender`, `purchase_proposal → dpc`, `purchase_proposal → pnc` are legal in the data but not offered anywhere yet.
- **Every auto-constituted committee is org-wide, not case-scoped.** TEC, DPC and PNC each seat every holder of that stage's chair and member roles, not the people actually assigned to that case's department or category (§4.5) — the same shape of limit case-specific role assignment already carries everywhere else, but worth knowing before assuming a chair on one case is meant to see every other.
- **The receipt and payment officer's desk is registered as goods receipt only.** They hold `payment.process` and can act at the payment stage, but visibility is derived from goods receipt onward — which is the same thing in practice, since payment comes after.
- **No SLA enforcement.** Timers and escalation roles are stored and displayed; nothing escalates.
- **The admin screen stops at master data.** Lookups, budget heads and vendors are editable at `/procurement/admin`; role assignment and committee rosters are still database work, and the stage configuration is deliberately left as a migration.
- **Deleting a lookup entry blanks the field on the cases that used it.** Every foreign key into `procurement_lookups` is `ON DELETE SET NULL`. The confirmation counts what will be affected and pushes you towards retiring instead, but it does not refuse.
- **The requisition's, the tender's and technical evaluation's rules are each written twice.** `procurement_guard_requisition_ready`, `procurement_guard_tender_ready` and `procurement_guard_tec_ready` decide; `lib/requisitionChecks.ts`, `lib/tenderChecks.ts` and `lib/tecChecks.ts` paint. Change one without the other and the form goes green on a case the engine will still refuse — the checklist notices the disagreement and says so, but the duplication is real and there is no test holding the two together.
- **The commercial and cst guards join the same duplication.** `procurement_guard_commercial_ready` and `procurement_guard_cst_ready` decide; `lib/commercialChecks.ts` and `lib/cstChecks.ts` paint. Same shape, same risk, same mitigation — the `ReadinessChecklist` says so when the two disagree.
- **No currency conversion, no price escalation, no net-present-value of payment terms, and no last-purchase-price or market-rate benchmark.** The evaluated cost is base price, tax, freight, other charges, a discount and one stated loading; the only reasonableness check is against the estimate the bidders themselves quoted against. An organisation that needs any of the above has to add it as a further named loading with its own stated reason, or as a further slice.
- **Negotiation has no reasonableness re-check of its own.** `procurement_commercial_reasonableness` runs once, at the commercial desk, against the estimate; nothing re-compares a negotiated `final_price` to that same estimate, or to anything else, before `pnc.agreed` accepts it. A committee could settle above the estimate the desk itself flagged as unreasonable and nothing here would say so.
- **Negotiation has no numeric mandate ceiling.** The committee's counter cannot exceed the vendor's own current offer, and settling above it needs a stated reason — but there is no "the committee may not go above ₹X without further approval" style threshold, the way `procurement_commercial_recommendations` gates an award over the estimate on a competent authority's clearance. A stated reason is not the same as a check.
- **A negotiated agreement is not yet read anywhere downstream.** `procurement_negotiations.final_price` and its terms are written and visible on the case, but the purchase proposal stage has no working form of its own yet (see above) to actually read them into an order.
- **The commercial desk's file-based schedule reader lost its button.** `procurement_record_quote_schedule` still reads a whole priced sheet against the published bill in one transaction, and `QuoteScheduleImport.tsx` still calls it — but nothing in `CommercialPanel` renders it any more, so an item-wise schedule can currently only be entered by typing each line's rate by hand, or written directly through the RPC.
- **The estimate a bid is measured against assumes one tax basis.** `procurement_commercial_reasonableness` reads the tender's own `estimated_value` and `gst_pct`; a requisition with no tender-stage estimate falls back to the bare case value with no tax applied at all, and says so as `no_estimate` or `estimate_source: 'requisition'` rather than guessing a rate.
- **The weighted-score ranking basis needs delivery and warranty on every eligible bid.** `procurement_commercial_ranking` computes it from `procurement_bidders.delivery_days` and `warranty_months`; a bid missing either is still ranked on evaluated cost or base price, but switching the whole case to the weighted basis with a gap in either field would silently zero that bidder's missing component rather than exclude them — worth a stated rule if this basis sees real use.
- **A departure from L1 is justified with free text against a fixed category, not verified against anything.** The database enforces that a category was picked and that the text clears ten characters; it does not and cannot judge whether the justification is actually true. That is, and stays, a human decision.
- **There is no split award.** `procurement_commercial_line_comparison` computes an item-wise L1 so a reader can see that the cheapest firm overall is not always the cheapest firm on every line, but recommending different firms for different lines is not offered anywhere — one recommendation, one bidder, per case.
- **A reopened comparative statement does not reach back into the purchase committee.** If DPC has already acted on a locked v1 and the desk reopens it as v2 with a materially different recommendation, nothing here archives or resets a DPC resolution the way the reference this process was studied from does — there is no DPC resolution table yet for it to reach into. `procurement_commercial_reopen` says as much in its own comment rather than pretending to handle a case it cannot.
- **`extract-quote-schedule`, the price-reasonableness review, and the drafted scrutiny note are not built.** The commercial and cst slices ship the schema, the guards, and a manual paste-based schedule reader (`QuoteScheduleImport`, mirroring `BoqImport`'s review-before-write shape but without a model behind it); the three AI features `procurement_commercial_ai_price_extractions`, `procurement_commercial_ai_price_reviews` and `procurement_cst_ai_note` were designed for are documented in the implementation plan but not yet migrated, and there is no edge function for any of them yet. The case assistant's existing `caseId`/`bidderId` scoping already works unchanged at both desks.
- **Six desks can read every document on a case but cannot add one.** Finance, commercial, both committees, the approving authority and the PO officer hold no `upload_docs`. Reading, opening and asking the assistant all work; attaching does not. Change it with a `procurement_role_permissions` row if a committee needs to file its own minutes.
