import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  LogOut,
  User,
  Home,
  FileUp,
  FolderTree,
  Languages,
  MessageSquare,
  BarChart,
  Settings,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Upload", url: "/documents", icon: FileUp },
  { title: "Files", url: "/document-management", icon: FolderTree },
  { title: "Translate", url: "/translation-markdown", icon: Languages },
  { title: "Assistant", url: "/assistant", icon: MessageSquare },
  { title: "Analytics", url: "/analytics", icon: BarChart },
  { title: "Admin", url: "/admin", icon: Settings },
];

const linkBase =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";
const linkActive = "bg-primary/10 text-primary";

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  // Close the mobile drawer on any navigation, including programmatic ones.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // getSession() reads the cached session — no network round trip, unlike
    // getUser(). onAuthStateChange then keeps it current across login/logout.
    supabase.auth
      .getSession()
      .then(({ data }) => setEmail(data.session?.user?.email ?? null))
      .catch(() => setEmail(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logged out successfully");
      navigate("/");
    } catch (error) {
      toast.error("Failed to log out");
    }
  };

  return (
    <header className="sticky top-0 z-50 h-16 w-full border-b border-border bg-card">
      <div className="flex h-full items-center gap-2 px-4 lg:px-6">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <nav className="flex flex-col gap-1 p-4 pt-10">
              {items.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  className={`${linkBase} flex items-center gap-3`}
                  activeClassName={linkActive}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </NavLink>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <NavLink
          to="/dashboard"
          className="mr-4 flex shrink-0 items-center rounded-sm text-foreground"
        >
          <Logo className="text-[16px]" />
        </NavLink>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {items.map((item) => (
            <NavLink key={item.url} to={item.url} className={linkBase} activeClassName={linkActive}>
              {item.title}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-xs text-muted-foreground">Signed in as</span>
                <span className="block truncate text-sm font-medium">
                  {email ?? "Not signed in"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
