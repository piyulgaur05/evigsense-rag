import { supabase } from "@/integrations/supabase/client";

export type SignatureKind = "drawn" | "typed" | "uploaded";

/** The signature a person reuses. Private to them — no policy exposes it. */
export type SavedSignature = {
  user_id: string;
  image: string;
  kind: SignatureKind;
  use_by_default: boolean;
  updated_at: string;
};

/** One signed decision, readable by anyone who can read the case. */
export type CaseSignature = {
  id: string;
  case_id: string;
  action_code: string;
  stage: string;
  signer_id: string;
  image: string;
  kind: SignatureKind;
  signed_at: string;
};

export async function fetchMySignature(): Promise<SavedSignature | null> {
  const { data, error } = await supabase
    .from("procurement_signatures")
    .select("user_id, image, kind, use_by_default, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as SavedSignature | null) ?? null;
}

/**
 * Keeps a signature for next time.
 *
 * Upserted on the user, so there is exactly one per person: a second saved
 * signature would only raise the question of which one is really theirs.
 * Replacing it does not touch anything already signed — `procurement_case_
 * signatures` holds its own copy of every image it recorded.
 */
export async function saveMySignature(args: {
  userId: string;
  image: string;
  kind: SignatureKind;
  useByDefault: boolean;
}): Promise<void> {
  const { error } = await supabase.from("procurement_signatures").upsert(
    {
      user_id: args.userId,
      image: args.image,
      kind: args.kind,
      use_by_default: args.useByDefault,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteMySignature(userId: string): Promise<void> {
  const { error } = await supabase
    .from("procurement_signatures")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function fetchCaseSignatures(caseId: string): Promise<CaseSignature[]> {
  const { data, error } = await supabase
    .from("procurement_case_signatures")
    .select("id, case_id, action_code, stage, signer_id, image, kind, signed_at")
    .eq("case_id", caseId)
    .order("signed_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as CaseSignature[]) ?? [];
}
