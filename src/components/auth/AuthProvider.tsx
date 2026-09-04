import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type ProcurementRole = Database["public"]["Enums"]["procurement_role"];

export type AuthContextValue = {
  /** True until the first identity load settles. Guards render nothing before then. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  appRoles: AppRole[];
  procurementRoles: ProcurementRole[];
  procurementPermissions: string[];
  isAdmin: boolean;
  /** Holds a procurement permission key, e.g. "finance.approve". */
  can: (permission: string) => boolean;
  hasProcurementRole: (role: ProcurementRole) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY = {
  appRoles: [] as AppRole[],
  procurementRoles: [] as ProcurementRole[],
  procurementPermissions: [] as string[],
};

/**
 * One place that knows who is signed in and what they may do.
 *
 * Before this, every screen called supabase.auth.getUser() for itself and
 * re-queried user_roles on mount. Procurement needs the identity in dozens of
 * components at once — the action bar alone gates on several permission keys —
 * so it is loaded once here and read from context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  // Guards against a slow response for a user who has since signed out.
  const loadedForUser = useRef<string | null>(null);

  const loadIdentity = useCallback(async (userId: string | null) => {
    if (!userId) {
      loadedForUser.current = null;
      setIdentity(EMPTY);
      setLoading(false);
      return;
    }

    loadedForUser.current = userId;

    // One failure must not blank the others: a stack without the procurement
    // migrations still has to render the document product.
    const [appRolesRes, procRolesRes, permsRes] = await Promise.allSettled([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("procurement_user_roles").select("role").eq("user_id", userId),
      supabase.rpc("procurement_my_permissions"),
    ]);

    if (loadedForUser.current !== userId) return;

    const rows = <T,>(res: PromiseSettledResult<{ data: T[] | null }>): T[] =>
      res.status === "fulfilled" ? (res.value.data ?? []) : [];

    setIdentity({
      appRoles: rows<{ role: AppRole }>(appRolesRes).map((r) => r.role),
      procurementRoles: rows<{ role: ProcurementRole }>(procRolesRes).map((r) => r.role),
      procurementPermissions: rows<{ permission: string }>(permsRes).map((r) => r.permission),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        return loadIdentity(data.session?.user?.id ?? null);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Token refreshes fire this too; only reload when the person changed.
      if (next?.user?.id !== loadedForUser.current) {
        setLoading(true);
        void loadIdentity(next?.user?.id ?? null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadIdentity]);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(identity.procurementPermissions);
    const isAdmin = identity.appRoles.includes("admin");
    return {
      loading,
      session,
      user: session?.user ?? null,
      appRoles: identity.appRoles,
      procurementRoles: identity.procurementRoles,
      procurementPermissions: identity.procurementPermissions,
      isAdmin,
      // The platform administrator is deliberately not a procurement wildcard
      // here — the database decides that, and proc_admin is seeded with every
      // key, so the two stay in step without a second source of truth.
      can: (permission: string) => permissions.has(permission),
      hasProcurementRole: (role: ProcurementRole) => identity.procurementRoles.includes(role),
      // Reads the session back rather than closing over it: a caller right after
      // signInWithPassword would otherwise refresh against the stale null one
      // and wipe the identity the auth listener is busy loading.
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await loadIdentity(data.session?.user?.id ?? null);
      },
    };
  }, [identity, loading, session, loadIdentity]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
