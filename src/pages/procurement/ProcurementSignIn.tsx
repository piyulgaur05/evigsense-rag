import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { WORKFLOW_STEPS, portalHome } from "@/features/procurement/lib/portals";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("That does not look like an email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

function readableAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password do not match an account. Check both and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "This account has not been confirmed yet. Ask an administrator to confirm it.";
  }
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("service unavailable")) {
    return "Cannot reach the server. Check that it is running, then try again.";
  }
  if (message.trim().startsWith("{") || !message.includes(" ")) {
    return "Could not sign in. Try again, and tell your administrator if it keeps happening.";
  }
  return message;
}

/**
 * The portal's own door.
 *
 * Separate from /auth on purpose: this is a different product for a different
 * set of people, and the page has to say what the portal is before asking for a
 * password. An account already signed in is offered the portal rather than made
 * to type its password again — and told plainly when it holds no desk.
 */
export default function ProcurementSignIn() {
  const navigate = useNavigate();
  const { loading, session, procurementRoles } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signedInJustNow, setSignedInJustNow] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  // The roles arrive a moment after the session does; wait for them before
  // deciding where a fresh sign-in lands.
  useEffect(() => {
    if (!signedInJustNow || loading) return;
    if (!procurementRoles.length) return;
    navigate(portalHome(procurementRoles), { replace: true });
  }, [signedInJustNow, loading, procurementRoles, navigate]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) throw error;
      // The provider's auth listener picks the new session up and loads the
      // roles; calling refresh() here as well would race it.
      setSignedInJustNow(true);
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : String(error ?? "");
      const message = readableAuthError(raw || "Failed to sign in");
      setFormError(message);
      toast.error(message);
    }
  };

  const alreadyIn = Boolean(session) && !loading;
  const hasDesk = procurementRoles.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-ink text-ink-foreground">
      <header className="flex items-center gap-3 px-5 py-5 sm:px-8">
        <Link to="/" className="rounded-sm text-ink-foreground" aria-label="Jyoma AI, home">
          <Logo className="text-[16px]" />
        </Link>
        <div className="ml-auto">
          <ThemeToggle className="text-ink-foreground hover:bg-white/10 hover:text-ink-foreground" />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-5 pb-16 sm:px-8 lg:grid-cols-[1.05fr_minmax(0,26rem)]">
        {/* What the portal is, said before the password is asked for. */}
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
            procurement portal
          </p>
          <h1 className="font-display mt-5 text-[clamp(2.1rem,4.2vw,3rem)] leading-tight">
            Requisition to payment,
            <br />
            on one case file.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-foreground/70">
            Ten desks, one chain of custody. Every decision is signed, timed and attributed, and
            the file carries its own record from the day it is raised to the day it is paid.
          </p>

          <ol className="mt-10 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {WORKFLOW_STEPS.map((step) => (
              <li key={step.step} className="flex items-baseline gap-3">
                <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-signal">
                  {String(step.step).padStart(2, "0")}
                </span>
                <span className="text-[13px] text-ink-foreground/85">{step.name}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          {alreadyIn && hasDesk ? (
            <>
              <h2 className="font-display text-[1.35rem]">You are already signed in</h2>
              <p className="mt-2 text-[14px] text-ink-foreground/70">
                Continue into the portal as this account, or sign out to use another.
              </p>
              <Button className="mt-6 w-full" onClick={() => navigate(portalHome(procurementRoles))}>
                Open the portal
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="mt-2 w-full text-ink-foreground hover:bg-white/10 hover:text-ink-foreground"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </Button>
            </>
          ) : alreadyIn && !hasDesk ? (
            <>
              <h2 className="font-display text-[1.35rem]">This account has no desk</h2>
              <p className="mt-2 text-[14px] text-ink-foreground/70">
                You are signed in, but no procurement role has been assigned to this account. An
                administrator can grant one.
              </p>
              <Button
                variant="outline"
                className="mt-6 w-full border-white/20 bg-transparent text-ink-foreground hover:bg-white/10 hover:text-ink-foreground"
                onClick={() => navigate("/dashboard")}
              >
                Go to the document workspace
              </Button>
              <Button
                variant="ghost"
                className="mt-2 w-full text-ink-foreground hover:bg-white/10 hover:text-ink-foreground"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign in as someone else
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <h2 className="font-display text-[1.35rem]">Sign in</h2>
              <p className="mt-2 text-[14px] text-ink-foreground/70">
                Use the account your administrator set up for you.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email" className="text-[13px] text-ink-foreground/80">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    {...register("email")}
                    className="mt-1.5 border-white/15 bg-white/5 text-[14px] text-ink-foreground placeholder:text-ink-foreground/40"
                  />
                  {errors.email && (
                    <p className="mt-1.5 text-[12px] text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password" className="text-[13px] text-ink-foreground/80">
                    Password
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      {...register("password")}
                      className="border-white/15 bg-white/5 pr-10 text-[14px] text-ink-foreground placeholder:text-ink-foreground/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-foreground/60 hover:text-ink-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-[12px] text-destructive">{errors.password.message}</p>
                  )}
                </div>
              </div>

              {formError && (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {formError}
                </p>
              )}

              <Button type="submit" className="mt-6 w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enter the portal
              </Button>

              <p className="mt-4 text-center text-[12px] text-ink-foreground/50">
                Looking for the document workspace?{" "}
                <Link to="/auth" className="underline hover:text-ink-foreground">
                  Sign in there
                </Link>
                .
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
