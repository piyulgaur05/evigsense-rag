import type { ProcurementStage } from "../types";

/**
 * What each stage is for, in the words a reader of the case file needs. The
 * database owns the ordering, the labels and the entry status; this is the
 * explanatory copy that belongs with the screen rather than with the data.
 */
export const STAGE_BRIEF: Record<ProcurementStage, string> = {
  draft: "The case has been opened but not yet raised.",
  mpr: "What is needed, in what quantity, against which budget head, and by when.",
  finance: "Whether the budget head can carry this purchase, and at what cost centre.",
  tender:
    "The notice inviting tender, how it is floated, who is invited, and any corrigendum issued before bidding closes.",
  tec: "Whether each bid meets the technical requirement, judged against the tender's own specification.",
  commercial:
    "Bids opened on price, each line matched against the bill of quantities, and the evaluated cost worked out.",
  cst: "The comparative statement: every qualified bid side by side, with L1 identified and the file scrutinised.",
  dpc: "The purchase committee sits, votes, and records a resolution on how to proceed.",
  pnc: "Price negotiation with the recommended vendor, round by round, against the committee's mandate.",
  purchase_proposal:
    "The proposal put to the approving authority: recommended vendor, negotiated value, terms and budget position.",
  purchase_order: "The order itself — line pricing, terms, issue to the vendor, and any amendment.",
  goods_receipt:
    "What arrived against the order, what was accepted, and anything short, damaged or rejected.",
  payment_recommendation:
    "The invoice against accepted quantities, less any penalty, and the amount recommended for release.",
  closed: "The case is finished. Nothing further is expected.",
};
