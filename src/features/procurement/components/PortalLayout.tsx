import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, User } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { LogoMark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { QUEUES, ROLE_NAMES, resolvePortal } from "../lib/portals";

const linkBase =
  "whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
const linkActive = "bg-primary/10 text-primary";

/**
 * The procurement portal's own shell.
 *
 * It is a separate way into the product, not a tab of the document app: its own
 * door on the landing page, its own sign-in, its own header. The nav is built
 * from the desks the signed-in account actually holds, so a finance officer and
 * a stores clerk see different portals behind the same URL.
 */
export function PortalLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, procurementRoles, can } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const portal = resolvePortal(procurementRoles);
  const roleLabel = procurementRoles.length
    ? procurementRoles.map((role) => ROLE_NAMES[role]).join(" · ")
    : "No desk assigned";

  // Four fixed links, then the desks. An administrator holds all twelve
  // queues, which is more than a header row can carry, so they live in a menu
  // rather than pushing everything else off the end.
  const primary = [
    { title: "Dashboard", to: "/procurement", end: true },
    { title: "Waiting on you", to: "/procurement/inbox", end: false },
    { title: "Register", to: "/procurement/register", end: false },
    { title: "Insights", to: "/procurement/insights", end: false },
  ];

  const queues = (portal?.queues ?? [])
    .map((key) => QUEUES[key])
    .filter((queue) => can(queue.permission))
    .map((queue) => ({ title: queue.name, to: `/procurement/queue/${queue.key}`, end: false }));

  // Up to two desks sit in the bar; more than that and they collapse into the menu.
  const inlineQueues = queues.length <= 2 ? queues : [];
  const menuQueues = queues.length <= 2 ? [] : queues;
  const links = [...primary, ...inlineQueues];

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out");
      navigate("/procurement/sign-in");
    } catch {
      toast.error("Could not sign out");
    }
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="flex h-16 items-center gap-2 px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="flex flex-col gap-1 p-4 pt-10">
                {[...primary, ...queues].map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={linkBase}
                    activeClassName={linkActive}
                  >
                    {link.title}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <NavLink
            to="/procurement"
            end
            className="mr-4 flex shrink-0 items-center gap-2 rounded-sm text-foreground"
          >
            <LogoMark className="h-6 w-6" />
            <span className="inline-flex flex-col leading-none">
              <span className="font-display text-[15px]">Jyoma</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                procurement
              </span>
            </span>
          </NavLink>

          <nav className="hidden flex-1 items-center gap-0.5 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={linkBase}
                activeClassName={linkActive}
              >
                {link.title}
              </NavLink>
            ))}

            {menuQueues.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className={cn(linkBase, "h-auto gap-1")}>
                    Queues
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    your desks
                  </DropdownMenuLabel>
                  {menuQueues.map((link) => (
                    <DropdownMenuItem key={link.to} onClick={() => navigate(link.to)}>
                      {link.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden max-w-[16rem] truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground 2xl:inline">
              {roleLabel}
            </span>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="truncate font-normal">
                  <span className="block text-[13px] text-foreground">{user?.email}</span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {roleLabel}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                  Document workspace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
