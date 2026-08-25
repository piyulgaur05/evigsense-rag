import { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen w-full bg-background">
      <AppHeader />
      <main>{children}</main>
    </div>
  );
};
