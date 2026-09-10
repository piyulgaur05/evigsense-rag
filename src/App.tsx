import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RequirePermission } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentManagement from "./pages/DocumentManagement";
import Assistant from "./pages/Assistant";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import Sign from "./pages/Sign";
import Logs from "./pages/Logs";
import DocumentChat from "./pages/DocumentChat";
import ProcurementSignIn from "./pages/procurement/ProcurementSignIn";
import ProcurementHome from "./pages/procurement/ProcurementHome";
import ProcurementRegister from "./pages/procurement/ProcurementRegister";
import ProcurementQueue from "./pages/procurement/ProcurementQueue";
import ProcurementInbox from "./pages/procurement/ProcurementInbox";
import ProcurementCase from "./pages/procurement/ProcurementCase";
import ProcurementNew from "./pages/procurement/ProcurementNew";
import ProcurementInsights from "./pages/procurement/ProcurementInsights";
import ProcurementAdmin from "./pages/procurement/ProcurementAdmin";

import TranslationMarkdown from "./pages/TranslationMarkdown";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/document-management" element={<DocumentManagement />} />
          <Route path="/translation-markdown" element={<TranslationMarkdown />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/sign" element={<Sign />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/document-chat/:documentId" element={<DocumentChat />} />

          {/* Procurement portal. A separate way into the product with its own
              door, its own shell and its own nav — reached from the landing
              page, not from the document workspace header. */}
          <Route path="/procurement/sign-in" element={<ProcurementSignIn />} />
          <Route
            path="/procurement"
            element={
              <RequirePermission permission="mpr.view" signInPath="/procurement/sign-in">
                <ProcurementHome />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/register"
            element={
              <RequirePermission permission="mpr.view" signInPath="/procurement/sign-in">
                <ProcurementRegister />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/inbox"
            element={
              <RequirePermission permission="mpr.view" signInPath="/procurement/sign-in">
                <ProcurementInbox />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/queue/:queueKey"
            element={
              <RequirePermission permission="mpr.view" signInPath="/procurement/sign-in">
                <ProcurementQueue />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/insights"
            element={
              <RequirePermission permission="mpr.view" signInPath="/procurement/sign-in">
                <ProcurementInsights />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/new"
            element={
              <RequirePermission permission="mpr.create" signInPath="/procurement/sign-in">
                <ProcurementNew />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/case/:caseNo"
            element={
              <RequirePermission permission="mpr.view" signInPath="/procurement/sign-in">
                <ProcurementCase />
              </RequirePermission>
            }
          />
          <Route
            path="/procurement/admin"
            element={
              <RequirePermission
                permission={["master_data.manage", "budget.manage", "vendor.manage"]}
                signInPath="/procurement/sign-in"
              >
                <ProcurementAdmin />
              </RequirePermission>
            }
          />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
