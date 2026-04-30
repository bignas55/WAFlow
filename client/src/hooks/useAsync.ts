import { useState, useCallback } from "react";

interface UseAsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

/**
 * Hook for managing async operations with loading and error states
 * Useful for form submissions, API calls, and other async operations
 *
 * Example:
 *   const { isLoading, error, execute } = useAsync(async (email: string) => {
 *     await api.sendEmail(email);
 *   });
 *
 *   const handleSubmit = async (email) => {
 *     const result = await execute(email);
 *     if (result) alert("Success!");
 *   };
 */
export function useAsync<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>
): UseAsyncState<T> & {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
} {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setState({ data: null, error: null, isLoading: true });
      try {
        const result = await asyncFn(...args);
        setState({ data: result, error: null, isLoading: false });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ data: null, error, isLoading: false });
        return null;
      }
    },
    [asyncFn]
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}
