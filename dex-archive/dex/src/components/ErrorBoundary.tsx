import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">🦅</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">GarudaChain Explorer</h1>
            <p className="text-gray-600 mb-4">
              Tidak dapat terhubung ke API server. Pastikan backend berjalan di server lokal.
            </p>
            <p className="text-sm text-gray-400 mb-6 font-mono break-all">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[#8B0000] text-white rounded-lg hover:bg-[#6B0000] transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
