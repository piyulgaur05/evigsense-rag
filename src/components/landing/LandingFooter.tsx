import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
        <Link to="/" className="rounded-sm text-foreground" aria-label="Jyoma AI, home">
          <Logo className="text-[15px]" />
        </Link>
        <p className="font-mono text-[11px] text-muted-foreground sm:ml-auto">
          Runs on your hardware. No outbound calls.
        </p>
      </div>
    </footer>
  );
}
