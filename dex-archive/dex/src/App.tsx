import { DEX } from "./pages/DEX";
import { Toaster } from "./components/ui/toaster";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <DEX />
      <Toaster />
    </ErrorBoundary>
  );
}
