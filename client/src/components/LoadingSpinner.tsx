import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  fullHeight?: boolean;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

/**
 * Centered loading spinner component
 * Use for full-page or section loading states
 */
export function LoadingSpinner({
  size = "md",
  text = "Loading...",
  fullHeight = false,
}: LoadingSpinnerProps) {
  const containerClass = fullHeight ? "min-h-screen" : "h-48";

  return (
    <div className={`${containerClass} flex flex-col items-center justify-center gap-3`}>
      <Loader2 className={`${sizeClasses[size]} text-[#25D366] animate-spin`} />
      {text && <p className="text-gray-400 text-sm">{text}</p>}
    </div>
  );
}

/**
 * Table row skeleton loaders
 * Shows placeholder rows while data loads
 */
export function TableSkeletonLoader({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 bg-gray-800/30 rounded-lg">
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-6 bg-gray-700/50 rounded flex-1 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Card skeleton loader
 * Shows placeholder while card data loads
 */
export function CardSkeletonLoader() {
  return (
    <div className="bg-gray-800/30 rounded-lg p-6 space-y-4">
      <div className="h-8 bg-gray-700/50 rounded w-1/3 animate-pulse" />
      <div className="space-y-2">
        <div className="h-4 bg-gray-700/50 rounded w-full animate-pulse" />
        <div className="h-4 bg-gray-700/50 rounded w-5/6 animate-pulse" />
      </div>
    </div>
  );
}
