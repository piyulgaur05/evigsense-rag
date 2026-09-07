-- The action bar has shown every action a role and stage allow since the
-- foundation slice, whether or not that action's own guard would actually
-- let it through -- documented since as "a holding action's button never
-- disappears once it has already been pressed," and quietly true of every
-- guarded action, not only a holding one. Pressing "Forward for payment"
-- while a delivery is still open, or "Issue the purchase order" before a
-- delivery address is on file, does nothing but return the database's own
-- refusal message -- indistinguishable, from the action bar alone, from the
-- button being broken. This is what was reported directly: goods receipt's
-- own two-step close-then-forward flow looked like a single button that
-- silently failed.
--
-- The fix is generic, not goods-receipt-specific, because the same gap
-- exists on every other guarded action this session added: proposal.approve,
-- po.issue, pnc.agreed, payment.clear, all of them. One function resolves
-- every visible action's own gaps_function the same way
-- procurement_record_decision already resolves a guard_function --
-- to_regprocedure, called dynamically, skipped if it does not resolve -- and
-- hands the action bar something to greet the reader with before they press
-- anything at all.

CREATE OR REPLACE FUNCTION public.procurement_available_actions_with_gaps(_case_id UUID)
RETURNS TABLE (
  code                TEXT,
  stage               procurement_stage,
  action              procurement_action,
  label               TEXT,
  description         TEXT,
  permission          TEXT,
  target_stage        procurement_stage,
  entry_status        TEXT,
  requires_remarks    BOOLEAN,
  requires_signature  BOOLEAN,
  chair_only          BOOLEAN,
  guard_function      TEXT,
  gaps_function       TEXT,
  sort_order          INTEGER,
  gaps                TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row  public.procurement_stage_actions;
  _proc regprocedure;
  _gaps TEXT[];
BEGIN
  FOR _row IN
    SELECT * FROM public.procurement_available_actions(_case_id) ORDER BY sort_order, label
  LOOP
    _gaps := ARRAY[]::TEXT[];

    IF _row.gaps_function IS NOT NULL THEN
      _proc := to_regprocedure(_row.gaps_function || '(uuid)');
      -- Skipped in silence if the name or arity is wrong, the same
      -- tolerance the guard itself is resolved with -- a typo here should
      -- leave the button enabled, not break the whole action bar.
      IF _proc IS NOT NULL THEN
        -- format('%s', _proc) is not usable here: regprocedure's own text
        -- form already includes the argument types in parentheses, so
        -- appending "($1)" produces "name(uuid)($1)" -- a syntax error, not
        -- a call. The already-validated text name is what actually gets
        -- invoked; _proc exists only to prove that name safely resolves.
        EXECUTE format('SELECT %s($1)', _row.gaps_function) INTO _gaps USING _case_id;
        _gaps := COALESCE(_gaps, ARRAY[]::TEXT[]);
      END IF;
    END IF;

    code := _row.code;
    stage := _row.stage;
    action := _row.action;
    label := _row.label;
    description := _row.description;
    permission := _row.permission;
    target_stage := _row.target_stage;
    entry_status := _row.entry_status;
    requires_remarks := _row.requires_remarks;
    requires_signature := _row.requires_signature;
    chair_only := _row.chair_only;
    guard_function := _row.guard_function;
    gaps_function := _row.gaps_function;
    sort_order := _row.sort_order;
    gaps := _gaps;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.procurement_available_actions_with_gaps(UUID) TO authenticated;
