# WAFlow UI/UX Patterns & Components

This document covers all the new UI components and patterns added for production-grade stability and user experience.

## Components & Hooks Added

### 1. Error Boundaries & Error Handling

#### ErrorBoundary (React Class Component)
Catches runtime render errors and prevents app crashes.

```tsx
import { ErrorBoundary } from "@/components/ErrorBoundary";

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

#### ErrorBoundaryFallback
Pre-built fallback UI for error boundaries with action buttons.

```tsx
import { ErrorBoundaryFallback, InlineError, EmptyState } from "@/components/ErrorBoundaryFallback";

// Show full-page error
<ErrorBoundaryFallback 
  error={new Error("Something broke")}
  resetErrorBoundary={() => window.location.reload()}
/>

// Show inline error in a component
<InlineError 
  error="Failed to load data"
  retry={() => refetch()}
/>

// Show empty state with action
<EmptyState
  icon={Users}
  title="No users found"
  description="Create your first user to get started"
  action={{ label: "Create User", onClick: openModal }}
/>
```

#### PageWrapper
Wraps pages with error boundary, loading state, and error UI.

```tsx
import { PageWrapper } from "@/components/PageWrapper";

<PageWrapper
  isLoading={isLoading}
  error={error}
  onRetry={refetch}
  loadingText="Loading users..."
>
  <YourPageContent />
</PageWrapper>
```

### 2. Confirmation Dialogs

#### ConfirmDialog
For destructive actions (delete, cancel, disable).

```tsx
import { ConfirmDialog } from "@/components/ConfirmDialog";

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await api.deleteItem(id);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Delete</button>
      
      <ConfirmDialog
        isOpen={isOpen}
        type="danger"
        title="Delete Item"
        message="Are you sure? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={isLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsOpen(false)}
      />
    </>
  );
}
```

Types: `"danger"` (red), `"warning"` (yellow), `"info"` (blue)

### 3. Loading States

#### LoadingSpinner
Centered spinner for page/section loading.

```tsx
import { LoadingSpinner, TableSkeletonLoader, CardSkeletonLoader } from "@/components/LoadingSpinner";

// Full page spinner
<LoadingSpinner fullHeight text="Loading..." />

// Section spinner
<LoadingSpinner size="md" text="Fetching data..." />

// Table skeleton (while loading data)
<TableSkeletonLoader rows={5} columns={4} />

// Card skeleton
<CardSkeletonLoader />
```

### 4. Toast Notifications

#### useToast Hook
Global toast management for user feedback.

```tsx
import { useToast } from "@/hooks/useToast";
import { ToastContainer } from "@/components/Toast";

function MyPage() {
  const { toasts, success, error, info, removeToast } = useToast();

  const handleSave = async () => {
    try {
      await api.save(data);
      success("Changes saved!");
    } catch (err) {
      error("Failed to save changes");
    }
  };

  return (
    <>
      <button onClick={handleSave}>Save</button>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
```

### 5. Form State Management

#### useFormState Hook
Manages form submission loading, error, and success states.

```tsx
import { useFormState } from "@/hooks/useFormState";
import { FormSection } from "@/components/PageWrapper";

function MyForm() {
  const form = useFormState();
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    form.reset();
    
    try {
      form.setLoading(true);
      await api.submit({ email });
      form.setSuccess(true);
    } catch (err) {
      form.setError(err instanceof Error ? err.message : "Error");
    } finally {
      form.setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormSection isLoading={form.isLoading} error={form.error}>
        <input 
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          disabled={form.isLoading}
        />
        <button type="submit" disabled={form.isLoading}>
          {form.isLoading ? "Submitting..." : "Submit"}
        </button>
      </FormSection>
      {form.success && <p className="text-green-400">Success!</p>}
    </form>
  );
}
```

#### useAsync Hook
For standalone async operations with loading and error states.

```tsx
import { useAsync } from "@/hooks/useAsync";

function MyComponent() {
  const { isLoading, error, data, execute } = useAsync(
    async (id: number) => {
      const result = await api.fetchUser(id);
      return result;
    }
  );

  return (
    <div>
      <button onClick={() => execute(123)}>
        {isLoading ? "Loading..." : "Fetch User"}
      </button>
      {error && <p className="text-red-400">{error.message}</p>}
      {data && <p>{data.name}</p>}
    </div>
  );
}
```

### 6. Form Validation

#### Validation Utilities
Pre-built validators for common fields.

```tsx
import {
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validateUrl,
  validateNumber,
  validateDate,
  validateFutureDate,
  validateLength,
  validateRequired,
  validateFile,
  validatePasswordMatch,
  validateForm,
} from "@/utils/validation";

// Single field validation
const emailError = validateEmail("user@example.com"); // null if valid

// Form validation
const errors = validateForm(formData, {
  email: (v) => validateEmail(v),
  password: (v) => validatePassword(v),
  name: (v) => validateName(v),
});

if (!errors.isValid) {
  console.log(errors.errors); // { email: "Invalid email", ... }
}
```

## Integration Examples

### Complete Form with All Features

```tsx
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/useToast";
import { useFormState } from "@/hooks/useFormState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageWrapper, FormSection } from "@/components/PageWrapper";
import { Toast Container } from "@/components/Toast";
import { validateEmail, validatePassword, validateForm } from "@/utils/validation";

function UserCreatePage() {
  const { toasts, success, error, removeToast } = useToast();
  const form = useFormState();
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "", name: "" });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      success("User created successfully!");
      setFormData({ email: "", password: "", name: "" });
    },
    onError: (err) => error(err.message),
  });

  const handleValidation = () => {
    const errors = validateForm(formData, {
      email: validateEmail,
      password: validatePassword,
      name: (v) => !v ? "Name is required" : null,
    });
    
    setValidationErrors(errors.errors);
    return errors.isValid;
  };

  const handleSubmitClick = () => {
    if (handleValidation()) {
      setShowConfirm(true);
    }
  };

  const handleConfirmCreate = async () => {
    try {
      form.setLoading(true);
      await createMutation.mutateAsync(formData);
      setShowConfirm(false);
    } catch (err) {
      form.setError(err instanceof Error ? err.message : "Error");
    } finally {
      form.setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Create User</h1>
        
        <FormSection isLoading={form.isLoading} error={form.error}>
          <form onSubmit={(e) => { e.preventDefault(); handleSubmitClick(); }} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={form.isLoading}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white disabled:opacity-50"
              />
              {validationErrors.name && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={form.isLoading}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white disabled:opacity-50"
              />
              {validationErrors.email && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={form.isLoading}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white disabled:opacity-50"
              />
              {validationErrors.password && (
                <p className="text-red-400 text-xs mt-1">{validationErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={form.isLoading}
              className="w-full py-2 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-50 text-white font-medium rounded transition-colors"
            >
              {form.isLoading ? "Creating..." : "Create User"}
            </button>
          </form>
        </FormSection>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        type="info"
        title="Create User"
        message={`Create user account for ${formData.email}?`}
        confirmLabel="Create"
        cancelLabel="Cancel"
        isLoading={form.isLoading}
        onConfirm={handleConfirmCreate}
        onCancel={() => setShowConfirm(false)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </PageWrapper>
  );
}
```

## Best Practices

1. **Always wrap pages with ErrorBoundary** — Catches unexpected render errors
2. **Show loading states** — Use LoadingSpinner, TableSkeletonLoader, or form.isLoading
3. **Validate forms before submit** — Use validateForm utility, show errors inline
4. **Confirm destructive actions** — Use ConfirmDialog for delete/disable/cancel
5. **Provide user feedback** — Use Toast for success/error messages
6. **Handle error states gracefully** — Show InlineError with retry option
7. **Disable buttons during submit** — Prevent double-submission
8. **Show empty states** — Use EmptyState when no data to display

## Security Notes

- Validation runs on the client but always validate on the server too
- Use timing-safe comparison for sensitive strings (in security.ts)
- Sanitize all user input before sending to API
- Never expose sensitive data in error messages

---

For more details on each component, see inline JSDoc comments in the source files.
