import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-[#111318] text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full p-8 rounded-2xl bg-[#171B24] border border-[#2D3342] shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-[#232834] text-[#A6ABB8] flex items-center justify-center mx-auto mb-4 border border-[#3A4254]">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2 text-[#F2F4F8]">Something went wrong</h2>
            <p className="text-xs text-[#8B91A0] mb-6">
              An unexpected display issue occurred. You can reload the application or reset stored preferences.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#2D3342] hover:bg-[#3A4254] text-[#F2F4F8] transition-colors"
              >
                Reload Application
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('sdoc_tab');
                    localStorage.removeItem('sdoc_token');
                  } catch {}
                  window.location.href = '/';
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors"
              >
                Reset & Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
