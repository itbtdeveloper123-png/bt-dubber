import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-khmer select-none">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">មានបញ្ហាក្នុងការបង្ហាញផ្ទាំងនេះ</h2>
              <p className="text-xs text-slate-400 font-sans">
                {this.state.error?.message || 'Unexpected application error occurred.'}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-khmer flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>ផ្ទុកឡើងវិញ (Reload Studio)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
