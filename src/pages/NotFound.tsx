import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="px-5 py-6 sm:px-8">
        <Link to="/" className="inline-flex rounded-sm text-foreground" aria-label="Jyoma AI, home">
          <Logo className="text-[17px]" />
        </Link>
      </div>

      <main className="flex flex-1 items-center px-5 pb-24 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">404</p>
          <h1 className="font-display mt-4 text-[2.25rem] text-foreground">
            There is nothing at this address.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            The page you asked for does not exist. Check the link, or start again from the
            beginning.
          </p>
          <p className="mt-4 break-all font-mono text-[12px] text-muted-foreground">
            {location.pathname}
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
