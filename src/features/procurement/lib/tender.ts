import type {
  CorrigendumCategory,
  EmdStatus,
  MsmeCategory,
  TenderMode,
  TenderStatus,
} from "../types";

/**
 * How the tender's coded columns read on screen.
 *
 * The database stores short lowercase tokens because that is what the CHECK
 * constraints and the guard compare against; nothing user-facing should ever
 * show one. Kept here rather than inline in the panel so the notice, the roster
 * and the corrigendum list all say the same words.
 */

export const TENDER_MODES: { value: TenderMode; label: string; hint: string }[] = [
  {
    value: "open",
    label: "Open",
    hint: "Advertised to anyone qualified to bid.",
  },
  {
    value: "limited",
    label: "Limited",
    hint: "Only the firms on the invitation list may bid.",
  },
  {
    value: "single",
    label: "Single source",
    hint: "One supplier, which has to be justified in writing.",
  },
  {
    value: "gem",
    label: "Government e-Marketplace",
    hint: "Floated on GeM; record the number GeM gives it.",
  },
  {
    value: "eprocurement",
    label: "e-Procurement portal",
    hint: "Floated on a public portal; record the number it gives.",
  },
];

export function tenderModeLabel(mode: string): string {
  return TENDER_MODES.find((entry) => entry.value === mode)?.label ?? mode;
}

/** A portal mode is one where somebody else's system holds the tender number. */
export function isPortalMode(mode: string): boolean {
  return mode === "gem" || mode === "eprocurement";
}

/** A restricted mode is one where the tender only goes to named firms. */
export function isRestrictedMode(mode: string): boolean {
  return mode === "limited" || mode === "single";
}

/**
 * The lifecycle, in order, as the strip across the top of the panel draws it.
 *
 * `bidding_open` and `floated` are separate rows in the database — a tender can
 * be published before its window opens — but they read as one step to somebody
 * looking at the file, so the strip folds them together.
 */
export const TENDER_LIFECYCLE: { key: TenderStatus[]; label: string }[] = [
  { key: ["draft"], label: "Drafting" },
  { key: ["ready"], label: "Ready to float" },
  { key: ["floated", "bidding_open"], label: "Floated" },
  { key: ["bidding_closed"], label: "Bidding closed" },
  { key: ["evaluation"], label: "With the committee" },
];

export const TENDER_STATUS_LABEL: Record<TenderStatus, string> = {
  draft: "Drafting",
  ready: "Ready to float",
  floated: "Floated, bidding not yet open",
  bidding_open: "Bidding open",
  bidding_closed: "Bidding closed",
  evaluation: "With the committee",
};

export const EMD_STATUS_LABEL: Record<EmdStatus, string> = {
  not_received: "Not received",
  received: "Received",
  exempt: "Exempt",
  returned: "Returned",
  forfeited: "Forfeited",
};

export const MSME_LABEL: Record<MsmeCategory, string> = {
  micro: "Micro",
  small: "Small",
  medium: "Medium",
  none: "Not registered",
};

export const CORRIGENDUM_CATEGORIES: {
  value: CorrigendumCategory;
  label: string;
  hint: string;
}[] = [
  {
    value: "schedule",
    label: "Schedule",
    hint: "Moves a date — most often the deadline for bids.",
  },
  {
    value: "technical",
    label: "Technical",
    hint: "Changes what is being bought or how it is specified.",
  },
  {
    value: "commercial",
    label: "Commercial",
    hint: "Changes the money: earnest money, fees, security, tax.",
  },
  {
    value: "administrative",
    label: "Administrative",
    hint: "A correction or a notice that leaves the terms alone.",
  },
];

export function corrigendumCategoryLabel(category: string): string {
  return CORRIGENDUM_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
}
