import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorBoundaryFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

/**
 * Fallback UI for error boundaries
 * Shows user-friendly error message with recovery options
 */
export function ErrorBoundaryFallback({
  error,
  resetErrorBoundary,
}: ErrorBoundaryFallbackProps) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        {/* Error Title */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 text-sm">
            We encountered an unexpected error. Don't worry, we've logged this issue.
          </p>
        </div>

        {/* Error Details (Dev only) */}
        {import.meta.env.DEV && (
          <div className="bg-gray-800/50 rounded-lg p-4 text-left space-y-2">
            <p className="text-xs text-gray-500 font-mono">Error Details:</p>
            <p className="text-xs text-red-400 font-mono break-words">
              {error.message}
            </p>
            {error.stack && (
              <details className="text-xs text-gray-400 cursor-pointer">
                <summary>Stack Trace</summary>
                <pre className="mt-2 text-[10px] overflow-auto max-h-32">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={resetErrorBoundary}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#25D366] hover:bg-[#20ba57] text-white font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          <button
            onClick={() => (window.location.href = "/")}
            className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>

        {/* Support Info */}
        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-500">
            If this problem persists, please contact support at{" "}
            <a
              href="mailto:support@waflow.io"
              className="text-[#25D366] hover:underline"
            >
              support@waflow.io
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline error state for components that shouldn't crash the page
 */
export function InlineError({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-400">{error}</p>
        {retry && (
          <button
            onClick={retry}
            className="text-xs text-red-300 hover:text-red-200 underline mt-2"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Loading skeleton placeholder
 */
export function SkeletonLoader({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

/**
 * Empty state component
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center">
      <Icon className="w-12 h-12 text-gray-600 mb-4" />
      <h3 className="text-lg font-semibold text-gray-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm text-[#25D366] hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
