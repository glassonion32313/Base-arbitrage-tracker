import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ArbitrageScanner from "@/pages/arbitrage-scanner";
import AccountSettings from "@/pages/account-settings";
import SimpleLogin from "@/components/simple-login";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ArbitrageScanner} />
      <Route path="/account" component={AccountSettings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
