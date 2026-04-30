import { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorBoundaryFallback } from "./ErrorBoundaryFallback";
import { LoadingSpinner } from "./LoadingSpinner";
import { InlineError } from "./ErrorBoundaryFallback";

interface PageWrapperProps {
  isLoading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  children: ReactNode;
  loadingText?: string;
}

/**
 * Wraps a page with error boundary, loading state, and error UI
 * Provides consistent error handling and loading feedback across all pages
 *
 * Example:
 *   <PageWrapper
 *     isLoading={isLoading}
 *     error={error}
 *     onRetry={refetch}
 *     loadingText="Loading data..."
 *   >
 *     <YourPageContent />
 *   </PageWrapper>
 */
export function PageWrapper({
  isLoading,
  error,
  onRetry,
  children,
  loadingText,
}: PageWrapperProps) {
  return (
    <ErrorBoundary fallback={<ErrorBoundaryFallback error={new Error("Page render failed")} resetErrorBoundary={() => window.location.reload()} />}>
      {isLoading && <LoadingSpinner fullHeight text={loadingText} />}

      {error && (
        <div className="p-6">
          <InlineError
            error={typeof error === "string" ? error : error?.message || "An unexpected error occurred"}
            retry={onRetry}
          />
        </div>
      )}

      {!isLoading && !error && children}
    </ErrorBoundary>
  );
}

/**
 * Wraps form sections with loading and error states
 */
export function FormSection({
  isLoading = false,
  error,
  children,
}: {
  isLoading?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${isLoading ? "opacity-50 pointer-events-none" : ""}`}>
      {error && (
        <div className="mb-4">
          <InlineError error={error} />
        </div>
      )}
      {children}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/30 rounded-lg">
          <div className="w-5 h-5 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
