import React from 'react';
import { AlertTriangle, RefreshCw, Home, LogOut, Trash2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      showDetails: false,
      copied: false 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled render error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleClearCacheAndReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      // Clear cookies if possible
      document.cookie.split(';').forEach((c) => {
        document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });
    } catch (e) {
      console.warn('Could not clear local storage:', e);
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/login';
  };

  handleCopyError = () => {
    const errorText = [
      `Error: ${this.state.error?.name || 'Error'}: ${this.state.error?.message || 'Unknown error'}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `Stack: ${this.state.error?.stack || 'No stack'}`,
      `Component Stack: ${this.state.errorInfo?.componentStack || 'No component stack'}`
    ].join('\n\n');

    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'An unexpected rendering error occurred.';
      const errorStack = this.state.error?.stack || '';

      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#f8f9fa',
          color: '#202124',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              margin: '0 auto 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle style={{ width: '32px', height: '32px' }} />
            </div>

            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#0f172a',
              marginBottom: '0.5rem'
            }}>
              Something went wrong
            </h1>

            <p style={{
              fontSize: '0.875rem',
              color: '#64748b',
              marginBottom: '1.25rem',
              lineHeight: 1.6
            }}>
              An unexpected error occurred while rendering this interface. Your data is safe. You can reload, clear cached state, or return to login.
            </p>

            {/* Error Message Box */}
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.85rem 1rem',
              backgroundColor: '#fef2f2',
              borderRadius: '10px',
              border: '1px solid #fecaca',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>
                  Error Details:
                </span>
              </div>
              <p style={{
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                color: '#b91c1c',
                marginTop: '0.35rem',
                wordBreak: 'break-word',
                fontWeight: 600
              }}>
                {errorMsg}
              </p>
            </div>

            {/* Expandable Technical Stack Trace */}
            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
              <button
                type="button"
                onClick={() => this.setState(p => ({ showDetails: !p.showDetails }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 0
                }}
              >
                {this.state.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{this.state.showDetails ? 'Hide Technical Stack' : 'Show Technical Stack'}</span>
              </button>

              {this.state.showDetails && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  borderRadius: '8px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {errorStack || 'No stack trace available.'}
                </div>
              )}
            </div>

            {/* Main Action Buttons */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.6rem',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  backgroundColor: '#1a73e8',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(26, 115, 232, 0.2)'
                }}
              >
                <RefreshCw size={15} />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer'
                }}
              >
                <Home size={15} />
                <span>Return to Home</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyError}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer'
                }}
              >
                {this.state.copied ? <Check size={15} style={{ color: '#16a34a' }} /> : <Copy size={15} />}
                <span>{this.state.copied ? 'Copied!' : 'Copy Error'}</span>
              </button>
            </div>

            {/* Clear Local Cache & Reset Session - Emergency Out */}
            <div style={{
              borderTop: '1px solid #f1f5f9',
              paddingTop: '0.85rem',
              marginTop: '0.85rem'
            }}>
              <button
                type="button"
                onClick={this.handleClearCacheAndReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#dc2626',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  cursor: 'pointer'
                }}
                title="Clears saved session tokens, cookies and local storage to escape render loops"
              >
                <Trash2 size={13} />
                <span>Clear Cache & Reset Session (Escape Loop)</span>
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
