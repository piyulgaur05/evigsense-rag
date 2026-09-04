import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z
    .string()
    .min(1, "Enter your email address")
    .email("That does not look like an email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

/** Supabase speaks in status strings. Say what the person can do about it. */
function readableAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password do not match an account. Check both and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "This account has not been confirmed yet. Ask an administrator to confirm it.";
  }
  if (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("not found") ||
    m.includes("service unavailable")
  ) {
    return "Cannot reach the Jyoma server. Check that it is running, then try again.";
  }
  // Anything that arrives as a raw payload rather than a sentence is not worth
  // showing verbatim — GoTrue and the gateway both do this when they are down.
  if (message.trim().startsWith("{") || !message.includes(" ")) {
    return "Could not sign in. Try again, and tell your administrator if it keeps happening.";
  }
  return message;
}

const ledger = [
  ["model", "qwen3.5-35b + lm studio"],
  ["index", "postgres + pgvector"],
  ["egress", "self-hosted only"],
];

/** A ruled field on a printed form: label in the margin, rule under the value. */
const fieldRow = "group grid gap-1.5 sm:grid-cols-[6.5rem_1fr] sm:items-baseline sm:gap-4";
const marginLabel =
  "font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors group-focus-within:text-signal";
// Focus shows twice over: the rule thickens to signal and the margin label
// lights up, so the boxless field still has an unmistakable focused state.
const ruledInput = cn(
  "h-10 rounded-none border-0 border-b border-input bg-transparent px-0 text-[15px]",
  "placeholder:text-muted-foreground/60",
  "focus-visible:border-signal focus-visible:ring-0 focus-visible:ring-offset-0",
  "focus-visible:border-b-2 focus-visible:pb-[1px]",
);

const Auth = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) throw error;

      if (data.session) {
        toast.success("Welcome back!");
        navigate("/dashboard");
      }
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : String(error ?? "");
      const message = readableAuthError(raw || "Failed to sign in");
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink text-ink-foreground">
      {/* Thin bar on the ink field */}
      <header className="flex items-center gap-3 px-5 py-5 sm:px-8">
        <Link to="/" className="rounded-sm text-ink-foreground" aria-label="Jyoma AI, home">
          <Logo className="text-[16px]" />
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle className="text-ink-foreground hover:bg-white/10 hover:text-ink-foreground" />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-ink-foreground/80 hover:bg-white/10 hover:text-ink-foreground"
          >
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to home
            </Link>
          </Button>
        </div>
      </header>

      {/* One sheet of paper on the desk */}
      <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lift">
          {/* The same document bar the landing hero uses */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            <span className="font-mono text-[11px] text-foreground">sign-in</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              session &middot; local
            </span>
          </div>

          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <h1 className="font-display text-[2rem] text-foreground">Sign in</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Use the account your administrator set up for you.
            </p>
            {typeof window !== "undefined" &&
              /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && (
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
                  Local seed: <span className="text-foreground">admin@jyoma.ai</span>
                  {" / "}
                  <span className="text-foreground">ChangeMe!2026</span>
                </p>
              )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8">
              {formError && (
                <div
                  role="alert"
                  className="mb-6 border-l-2 border-destructive bg-destructive/10 px-4 py-3 text-[13px] leading-relaxed text-foreground"
                >
                  {formError}
                </div>
              )}

              <div className="space-y-6">
                <div className={fieldRow}>
                  <Label htmlFor="email" className={marginLabel}>
                    Email
                  </Label>
                  <div>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@example.com"
                      className={ruledInput}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "email-error" : undefined}
                      {...register("email")}
                    />
                    {errors.email && (
                      <p id="email-error" className="mt-2 text-[13px] text-destructive">
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className={fieldRow}>
                  <Label htmlFor="password" className={marginLabel}>
                    Password
                  </Label>
                  <div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className={cn(ruledInput, "pr-10")}
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "password-error" : undefined}
                        onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
                        {...register("password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-0 top-0 flex h-10 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p id="password-error" className="mt-2 text-[13px] text-destructive">
                        {errors.password.message}
                      </p>
                    )}
                    {capsLock && !errors.password && (
                      <p className="mt-2 text-[13px] text-muted-foreground">Caps Lock is on.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-9 flex items-center gap-4 border-t border-border pt-6">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Accounts are created by an administrator.
                </p>
                <Button type="submit" size="lg" className="ml-auto" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* The perimeter, restated as a footer rule */}
      <footer className="border-t border-white/10 px-5 py-4 sm:px-8">
        <dl className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1.5">
          {ledger.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
                {label}
              </dt>
              <dd className="font-mono text-[12px] text-ink-foreground/70">{value}</dd>
            </div>
          ))}
        </dl>
      </footer>
    </div>
  );
};

export default Auth;
