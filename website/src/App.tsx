import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { Home } from "@/pages/Home";
import { BlockDetail } from "@/pages/BlockDetail";
import { TransactionDetail } from "@/pages/TransactionDetail";
import { AddressDetail } from "@/pages/AddressDetail";
import { Transactions } from "@/pages/Transactions";
import { TopTokens } from "@/pages/TopTokens";
import { TokenTransfers } from "@/pages/TokenTransfers";
import { TokenDetail } from "@/pages/TokenDetail";
import { Blocks } from "@/pages/Blocks";
import { Whitepaper } from "@/pages/Whitepaper";
import { TokenFlow } from "@/pages/TokenFlow";
import { Dashboard } from "@/pages/Dashboard";
import { NetworkStatus } from "@/pages/NetworkStatus";
import { Charts } from "@/pages/Charts";
import { Saham } from "@/pages/Saham";
import { SahamDetail } from "@/pages/SahamDetail";
import { IPOSaham } from "@/pages/IPOSaham";
import { SmartContracts } from "@/pages/SmartContracts";

import { SBN } from "@/pages/SBN";
import { APBNWallet } from "@/pages/APBNWallet";
import { MintBurn } from "@/pages/MintBurn";
import { Miners } from "@/pages/Miners";
import { Mining } from "@/pages/Mining";
import { MinerMining } from "@/pages/MinerMining";
import { MinerWallet } from "@/pages/MinerWallet";
import { ApiDocs } from "@/pages/ApiDocs";
import { OracleCurrencyDetail } from "@/pages/OracleCurrencyDetail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 5000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/block/:blockNumber" component={BlockDetail} />
      <Route path="/tx/:hash" component={TransactionDetail} />
      <Route path="/address/:address" component={AddressDetail} />
      <Route path="/blocks" component={Blocks} />
      <Route path="/txs" component={Transactions} />
      <Route path="/tokens" component={TopTokens} />
      <Route path="/token-transfers" component={TokenTransfers} />
      <Route path="/token-flow" component={TokenFlow} />
      <Route path="/token/:symbol" component={TokenDetail} />
      <Route path="/oracle/:symbol" component={OracleCurrencyDetail} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/network" component={NetworkStatus} />
      <Route path="/charts" component={Charts} />
      <Route path="/whitepaper" component={Whitepaper} />
      <Route path="/saham" component={Saham} />
      <Route path="/saham/:kode" component={SahamDetail} />
      <Route path="/ipo" component={IPOSaham} />
      <Route path="/smart-contracts" component={SmartContracts} />

      <Route path="/sbn" component={SBN} />
      <Route path="/apbn-wallet" component={APBNWallet} />
      <Route path="/mint-burn" component={MintBurn} />
      <Route path="/miners" component={Miners} />

      <Route path="/mining" component={Mining} />
      <Route path="/miner-mining" component={MinerMining} />
      <Route path="/miner-wallet" component={MinerWallet} />
      <Route path="/api-docs" component={ApiDocs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
