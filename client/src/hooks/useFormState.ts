import { useState, useCallback } from "react";

interface FormState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

/**
 * Hook for managing form submission state
 * Handles loading, error, and success states for form operations
 *
 * Example:
 *   const form = useFormState();
 *
 *   const handleSubmit = async (data: FormData) => {
 *     form.reset();
 *     try {
 *       form.setLoading(true);
 *       await api.submitForm(data);
 *       form.setSuccess(true);
 *     } catch (err) {
 *       form.setError(err instanceof Error ? err.message : "Unknown error");
 *     } finally {
 *       form.setLoading(false);
 *     }
 *   };
 */
export function useFormState() {
  const [state, setState] = useState<FormState>({
    isLoading: false,
    error: null,
    success: false,
  });

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, success: false }));
  }, []);

  const setSuccess = useCallback((success: boolean) => {
    setState(prev => ({ ...prev, success, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      success: false,
    });
  }, []);

  return {
    ...state,
    setLoading,
    setError,
    setSuccess,
    reset,
  };
}
