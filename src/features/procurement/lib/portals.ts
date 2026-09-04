import type { ProcurementRole, ProcurementStage } from "../types";

/**
 * Each role opens the portal onto its own desk: a title that says whose desk it
 * is, the step it owns in the ten-step chain, the queues it can reach, and the
 * counts worth seeing first.
 */

export type QueueKey =
  | "requisitions"
  | "finance"
  | "tender"
  | "technical"
  | "commercial"
  | "opening"
  | "committee"
  | "negotiation"
  | "proposals"
  | "orders"
  | "receipts"
  | "payments";

export type QueueDef = {
  key: QueueKey;
  name: string;
  /** Which stages a case must be at to appear in this queue. */
  stages: ProcurementStage[];
  permission: string;
  blurb: string;
};

export const QUEUES: Record<QueueKey, QueueDef> = {
  requisitions: {
    key: "requisitions",
    name: "Requisitions",
    stages: ["draft", "mpr"],
    permission: "mpr.view",
    blurb: "Indents raised, and those returned for correction.",
  },
  finance: {
    key: "finance",
    name: "Budget clearance",
    stages: ["finance"],
    permission: "finance.approve",
    blurb: "Requisitions waiting on a budget decision.",
  },
  tender: {
    key: "tender",
    name: "Tenders",
    stages: ["tender"],
    permission: "tender.create",
    blurb: "Notices in preparation, floated, and closed for evaluation.",
  },
  technical: {
    key: "technical",
    name: "Technical evaluation",
    stages: ["tec"],
    permission: "tec.evaluate",
    blurb: "Bids before the technical evaluation committee.",
  },
  commercial: {
    key: "commercial",
    name: "Commercial evaluation",
    stages: ["commercial", "cst"],
    permission: "commercial.evaluate",
    blurb: "Priced bids, comparative statements, and L1.",
  },
  opening: {
    key: "opening",
    name: "Bid opening approvals",
    stages: ["commercial", "cst"],
    permission: "commercial.opening.approve",
    blurb: "Formats to approve before commercial bids are opened, and statements to sign off.",
  },
  committee: {
    key: "committee",
    name: "Purchase committee",
    stages: ["dpc"],
    permission: "dpc.approve",
    blurb: "Cases listed for the committee, and resolutions adopted.",
  },
  negotiation: {
    key: "negotiation",
    name: "Price negotiation",
    stages: ["pnc"],
    permission: "pnc.negotiate",
    blurb: "Cases referred for negotiation against a committee mandate.",
  },
  proposals: {
    key: "proposals",
    name: "Purchase proposals",
    stages: ["purchase_proposal"],
    permission: "proposal.approve",
    blurb: "Proposals put to the approving authority.",
  },
  orders: {
    key: "orders",
    name: "Purchase orders",
    stages: ["purchase_order"],
    permission: "po.issue",
    blurb: "Orders to raise, issue and amend.",
  },
  receipts: {
    key: "receipts",
    name: "Goods receipt",
    stages: ["goods_receipt"],
    permission: "grn.create",
    blurb: "Deliveries to record, inspect and accept.",
  },
  payments: {
    key: "payments",
    name: "Receipt & payment",
    stages: ["payment_recommendation"],
    permission: "payment.process",
    blurb: "Invoices against accepted quantities, and payment clearance.",
  },
};

export type PortalAction = {
  label: string;
  to: string;
  permission: string;
  primary?: boolean;
};

export type PortalDef = {
  title: string;
  subtitle: string;
  /** Position in the ten-step chain. 0 for the roles that span all of it. */
  step: number;
  stage: string;
  /** Queues this role's nav offers, in order. */
  queues: QueueKey[];
  /** Stages whose counts this role cares about, in order. */
  counters: ProcurementStage[];
  actions: PortalAction[];
  /** Where the portal lands this role after sign-in. */
  home: string;
};

const ALL_QUEUES: QueueKey[] = [
  "requisitions", "finance", "tender", "technical", "commercial", "opening",
  "committee", "negotiation", "proposals", "orders", "receipts", "payments",
];

const REGISTER: PortalAction = { label: "Open the register", to: "/procurement/register", permission: "mpr.view" };
const WORKLIST: PortalAction = { label: "Waiting on you", to: "/procurement/inbox", permission: "mpr.view", primary: true };

export const PORTALS: Record<ProcurementRole, PortalDef> = {
  proc_admin: {
    title: "Administration",
    subtitle: "The whole pipeline, every desk, and the settings behind them.",
    step: 0,
    stage: "All stages",
    queues: ALL_QUEUES,
    counters: ["mpr", "finance", "tender", "tec", "commercial", "dpc", "purchase_order", "closed"],
    actions: [WORKLIST, { label: "Raise a requisition", to: "/procurement/new", permission: "mpr.create" }, REGISTER],
    home: "/procurement",
  },
  purchase_head: {
    title: "Oversight",
    subtitle: "Every case, where it is, and how long it has been there. No decisions from here.",
    step: 0,
    stage: "All stages",
    queues: ALL_QUEUES,
    counters: ["mpr", "finance", "tender", "tec", "commercial", "dpc", "purchase_order", "closed"],
    actions: [REGISTER],
    home: "/procurement",
  },
  requester: {
    title: "Requisitions",
    subtitle: "Raise an indent and follow it through the pipeline.",
    step: 1,
    stage: "Requisition",
    queues: ["requisitions"],
    counters: ["draft", "mpr", "finance", "closed"],
    actions: [
      { label: "Raise a requisition", to: "/procurement/new", permission: "mpr.create", primary: true },
      { label: "My requisitions", to: "/procurement/queue/requisitions", permission: "mpr.view" },
    ],
    home: "/procurement",
  },
  finance_user: {
    title: "Budget clearance",
    subtitle: "Decide whether the budget head can carry a purchase, and record why.",
    step: 2,
    stage: "Finance",
    queues: ["finance"],
    counters: ["finance", "tender", "closed"],
    actions: [
      { label: "Clearance queue", to: "/procurement/queue/finance", permission: "finance.approve", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/finance",
  },
  purchase_officer: {
    title: "Tendering",
    subtitle: "Float the notice, invite vendors, record bids, and close for evaluation.",
    step: 3,
    stage: "Tender",
    queues: ["requisitions", "tender"],
    counters: ["finance", "tender", "tec"],
    actions: [
      { label: "Tender queue", to: "/procurement/queue/tender", permission: "tender.create", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/tender",
  },
  tec_chairman: {
    title: "Technical evaluation — chair",
    subtitle: "Read the members' findings, settle the committee position, and move the case on.",
    step: 4,
    stage: "Technical evaluation",
    queues: ["requisitions", "technical"],
    counters: ["tender", "tec", "commercial"],
    actions: [
      { label: "Evaluation queue", to: "/procurement/queue/technical", permission: "tec.evaluate", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/technical",
  },
  tec_member: {
    title: "Technical evaluation",
    subtitle: "Judge each bid against the tender's own specification and record your finding.",
    step: 4,
    stage: "Technical evaluation",
    queues: ["requisitions", "technical"],
    counters: ["tender", "tec"],
    actions: [
      { label: "Evaluation queue", to: "/procurement/queue/technical", permission: "tec.evaluate", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/technical",
  },
  head_of_division: {
    title: "Divisional approvals",
    subtitle: "Approve the format for opening commercial bids, and sign off the comparative statement.",
    step: 5,
    stage: "Commercial evaluation",
    queues: ["requisitions", "opening"],
    counters: ["commercial", "cst", "dpc"],
    actions: [
      { label: "Approval queue", to: "/procurement/queue/opening", permission: "commercial.opening.approve", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/opening",
  },
  commercial_team: {
    title: "Commercial evaluation",
    subtitle: "Price the bids against the bill of quantities, rank them, and draw up the statement.",
    step: 5,
    stage: "Commercial evaluation",
    queues: ["requisitions", "commercial"],
    counters: ["tec", "commercial", "cst", "dpc"],
    actions: [
      { label: "Commercial queue", to: "/procurement/queue/commercial", permission: "commercial.evaluate", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/commercial",
  },
  dpc_chairman: {
    title: "Purchase committee — chair",
    subtitle: "Convene the sitting, take the vote, and record the resolution.",
    step: 6,
    stage: "Purchase committee",
    queues: ["requisitions", "committee"],
    counters: ["cst", "dpc", "pnc", "purchase_proposal"],
    actions: [
      { label: "Committee queue", to: "/procurement/queue/committee", permission: "dpc.approve", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/committee",
  },
  dpc_member: {
    title: "Purchase committee",
    subtitle: "Read the case put before the committee and cast your vote.",
    step: 6,
    stage: "Purchase committee",
    queues: ["requisitions", "committee"],
    counters: ["dpc", "pnc"],
    actions: [
      { label: "Committee queue", to: "/procurement/queue/committee", permission: "dpc.approve", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/committee",
  },
  pnc_chairman: {
    title: "Price negotiation — chair",
    subtitle: "Convene the rounds, put the counter offer, and sign the outcome.",
    step: 7,
    stage: "Negotiation",
    queues: ["requisitions", "negotiation"],
    counters: ["dpc", "pnc", "purchase_proposal"],
    actions: [
      { label: "Negotiation queue", to: "/procurement/queue/negotiation", permission: "pnc.negotiate", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/negotiation",
  },
  pnc_member: {
    title: "Price negotiation",
    subtitle: "Sit in the rounds and record the committee's position.",
    step: 7,
    stage: "Negotiation",
    queues: ["requisitions", "negotiation"],
    counters: ["pnc"],
    actions: [
      { label: "Negotiation queue", to: "/procurement/queue/negotiation", permission: "pnc.negotiate", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/negotiation",
  },
  management_approver: {
    title: "Approving authority",
    subtitle: "Clear the purchase proposal before an order is raised against it.",
    step: 8,
    stage: "Purchase proposal",
    queues: ["requisitions", "proposals"],
    counters: ["pnc", "purchase_proposal", "purchase_order"],
    actions: [
      { label: "Proposal queue", to: "/procurement/queue/proposals", permission: "proposal.approve", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/proposals",
  },
  po_officer: {
    title: "Purchase orders",
    subtitle: "Raise the order from an approved proposal, issue it, and keep it amended.",
    step: 9,
    stage: "Purchase order",
    queues: ["proposals", "orders"],
    counters: ["purchase_proposal", "purchase_order", "goods_receipt"],
    actions: [
      { label: "Order queue", to: "/procurement/queue/orders", permission: "po.issue", primary: true },
      REGISTER,
    ],
    home: "/procurement/queue/orders",
  },
  receipt_payment_officer: {
    title: "Stores & accounts",
    subtitle: "Record what arrived, what was accepted, and what is owed against it.",
    step: 10,
    stage: "Receipt & payment",
    queues: ["orders", "receipts", "payments"],
    counters: ["purchase_order", "goods_receipt", "payment_recommendation", "closed"],
    actions: [
      { label: "Goods receipt queue", to: "/procurement/queue/receipts", permission: "grn.create", primary: true },
      { label: "Payment queue", to: "/procurement/queue/payments", permission: "payment.process" },
    ],
    home: "/procurement/queue/receipts",
  },
};

/** The ten-step chain, for the portal header's "you are step N of 10" rail. */
export const WORKFLOW_STEPS = [
  { step: 1, name: "Requisition", role: "Requester" },
  { step: 2, name: "Budget clearance", role: "Finance" },
  { step: 3, name: "Tender", role: "Purchase officer" },
  { step: 4, name: "Technical evaluation", role: "TEC" },
  { step: 5, name: "Commercial evaluation", role: "Head of division, commercial team" },
  { step: 6, name: "Purchase committee", role: "DPC" },
  { step: 7, name: "Negotiation", role: "PNC" },
  { step: 8, name: "Purchase proposal", role: "Approving authority" },
  { step: 9, name: "Purchase order", role: "PO officer" },
  { step: 10, name: "Receipt & payment", role: "Stores and accounts" },
];

/**
 * Someone may hold more than one role. Take the portal of the earliest desk
 * they own — that is the one they open the day at — and pool the queues so the
 * nav still shows everything they can reach.
 */
export function resolvePortal(roles: ProcurementRole[]): PortalDef | null {
  const held = roles.filter((role) => role in PORTALS);
  if (!held.length) return null;

  const admin = held.find((role) => role === "proc_admin");
  const primary = admin
    ? PORTALS.proc_admin
    : held.map((role) => PORTALS[role]).sort((a, b) => a.step - b.step)[0];

  if (held.length === 1 || admin) return primary;

  const queues = new Set<QueueKey>();
  const counters = new Set<ProcurementStage>();
  const actions: PortalAction[] = [];
  for (const role of held) {
    for (const queue of PORTALS[role].queues) queues.add(queue);
    for (const stage of PORTALS[role].counters) counters.add(stage);
    for (const action of PORTALS[role].actions) {
      if (!actions.some((a) => a.to === action.to)) actions.push(action);
    }
  }

  return {
    ...primary,
    title: "Procurement",
    subtitle: "You hold more than one desk. Everything you can reach is below.",
    queues: [...queues],
    counters: [...counters],
    actions,
  };
}

export const ROLE_NAMES: Record<ProcurementRole, string> = {
  proc_admin: "Administrator",
  purchase_head: "Purchase head",
  requester: "Requester",
  finance_user: "Finance officer",
  purchase_officer: "Purchase officer",
  tec_chairman: "TEC chairperson",
  tec_member: "TEC member",
  head_of_division: "Head of division",
  commercial_team: "Commercial team",
  dpc_chairman: "DPC chairman",
  dpc_member: "DPC member",
  pnc_chairman: "PNC chairman",
  pnc_member: "PNC member",
  management_approver: "Approving authority",
  po_officer: "Purchase order officer",
  receipt_payment_officer: "Stores & accounts",
};

/** Where sign-in lands someone: a single-desk role goes straight to its queue. */
export function portalHome(roles: ProcurementRole[]): string {
  const portal = resolvePortal(roles);
  if (!portal) return "/procurement";
  return roles.length === 1 && !roles.includes("proc_admin") ? portal.home : "/procurement";
}
