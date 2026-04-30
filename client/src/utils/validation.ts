/**
 * Form Validation Utilities
 * Consistent validation across all forms
 */

// Email validation
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!isValidEmail(email)) return "Please enter a valid email address";
  return null;
}

// Password validation
export function validatePassword(password: string): string | null {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  if (!/[!@#$%^&*]/.test(password)) {
    return "Password must contain a special character (!@#$%^&*)";
  }
  return null;
}

// Name validation
export function validateName(name: string): string | null {
  if (!name) return "Name is required";
  if (name.length < 2) return "Name must be at least 2 characters";
  if (name.length > 100) return "Name must be less than 100 characters";
  return null;
}

// Phone validation
export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex =
    /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

export function validatePhone(phone: string): string | null {
  if (!phone) return "Phone number is required";
  if (!isValidPhoneNumber(phone)) return "Please enter a valid phone number";
  return null;
}

// URL validation
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateUrl(url: string): string | null {
  if (!url) return "URL is required";
  if (!isValidUrl(url)) return "Please enter a valid URL";
  return null;
}

// Number validation
export function validateNumber(
  value: string,
  min?: number,
  max?: number
): string | null {
  if (!value) return "This field is required";

  const num = parseFloat(value);
  if (isNaN(num)) return "Please enter a valid number";

  if (min !== undefined && num < min) return `Must be at least ${min}`;
  if (max !== undefined && num > max) return `Must be no more than ${max}`;

  return null;
}

// Date validation
export function validateDate(date: string): string | null {
  if (!date) return "Date is required";

  const d = new Date(date);
  if (isNaN(d.getTime())) return "Please enter a valid date";

  return null;
}

// Future date validation (for appointments, etc.)
export function validateFutureDate(date: string): string | null {
  const error = validateDate(date);
  if (error) return error;

  const d = new Date(date);
  if (d < new Date()) return "Please select a future date";

  return null;
}

// String length validation
export function validateLength(
  value: string,
  minLength?: number,
  maxLength?: number
): string | null {
  if (minLength && value.length < minLength) {
    return `Must be at least ${minLength} characters`;
  }

  if (maxLength && value.length > maxLength) {
    return `Must be no more than ${maxLength} characters`;
  }

  return null;
}

// Required field validation
export function validateRequired(
  value: string | number | boolean | null | undefined
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return "This field is required";
  }

  return null;
}

// File validation
export function validateFile(
  file: File | null,
  maxSizeMb: number = 10,
  allowedTypes: string[] = []
): string | null {
  if (!file) return "File is required";

  const maxSizeBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `File size must be less than ${maxSizeMb}MB`;
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return `File type must be one of: ${allowedTypes.join(", ")}`;
  }

  return null;
}

// Password match validation
export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }

  return null;
}

// Combine multiple validations
export function combineValidations(...validations: (string | null)[]): string | null {
  for (const error of validations) {
    if (error) return error;
  }
  return null;
}

// Validation result type
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate entire form
 */
export function validateForm(
  data: Record<string, any>,
  rules: Record<string, (value: any) => string | null>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [field, rule] of Object.entries(rules)) {
    const error = rule(data[field]);
    if (error) {
      errors[field] = error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
