/**
 * Validation utilities for FMCG Distribution Suite
 * Provides comprehensive checks, auto-formatting, and precise user-facing error messages.
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  formatted?: string;
  value?: number;
}

/**
 * Standard Indian GSTIN Validation
 * Format: 15 characters
 * - 2 digits state code (01-38, 97, 99)
 * - 10 alphanumeric PAN (5 uppercase letters + 4 digits + 1 uppercase letter)
 * - 1 character entity code (1-9 or A-Z)
 * - 1 default character (usually 'Z' or alphanumeric)
 * - 1 check digit (alphanumeric)
 */
export const validateGSTIN = (gstin: string | null | undefined, isRequired: boolean = false): ValidationResult => {
  if (!gstin || typeof gstin !== 'string') {
    if (isRequired) {
      return {
        isValid: false,
        error: 'GSTIN is required for this entity.',
        formatted: ''
      };
    }
    return { isValid: true, formatted: '' };
  }

  // Remove spaces, hyphens, and convert to uppercase
  const cleaned = gstin.trim().replace(/[\s-]/g, '').toUpperCase();

  if (cleaned.length === 0) {
    if (isRequired) {
      return {
        isValid: false,
        error: 'GSTIN is required.',
        formatted: ''
      };
    }
    return { isValid: true, formatted: '' };
  }

  if (cleaned.length !== 15) {
    return {
      isValid: false,
      error: `GSTIN must be exactly 15 alphanumeric characters (currently ${cleaned.length}/15). Example: 27AAAAA0000A1Z5. (Leave empty if unregistered/composition).`,
      formatted: cleaned
    };
  }

  // Check state code (first 2 digits)
  const stateCode = cleaned.substring(0, 2);
  if (!/^\d{2}$/.test(stateCode)) {
    return {
      isValid: false,
      error: `Invalid State Code "${stateCode}" in GSTIN. The first 2 characters must be numeric digits representing the state (e.g., 27 for Maharashtra, 07 for Delhi).`,
      formatted: cleaned
    };
  }

  // Check PAN structure (characters 3-12: 5 letters, 4 digits, 1 letter)
  const panPart = cleaned.substring(2, 12);
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(panPart)) {
    return {
      isValid: false,
      error: `Invalid PAN structure "${panPart}" in GSTIN. Characters 3 to 12 must follow standard PAN format: 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F).`,
      formatted: cleaned
    };
  }

  // Check full 15-character GSTIN regex
  const fullGstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z|0-9A-Z]{1}[0-9A-Z]{1}$/;
  if (!fullGstinRegex.test(cleaned)) {
    return {
      isValid: false,
      error: `Invalid GSTIN format "${cleaned}". Must follow standard 15-character format: [State Code: 2 digits] + [PAN: 10 chars] + [Entity: 1 char] + [Z] + [Checksum: 1 char] (e.g., 27ABCDE1234F1Z5).`,
      formatted: cleaned
    };
  }

  return {
    isValid: true,
    formatted: cleaned
  };
};

/**
 * 10-Digit Mobile / Contact Number Validation
 */
export const validatePhoneNumber = (phone: string | null | undefined, isRequired: boolean = true): ValidationResult => {
  if (!phone || typeof phone !== 'string') {
    if (isRequired) {
      return {
        isValid: false,
        error: 'Contact Number is required as a unique identifier.',
        formatted: ''
      };
    }
    return { isValid: true, formatted: '' };
  }

  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (trimmed.length === 0) {
    if (isRequired) {
      return {
        isValid: false,
        error: 'Contact Number is required as a unique identifier.',
        formatted: ''
      };
    }
    return { isValid: true, formatted: '' };
  }

  // Check for letters or special characters
  if (/[^\d]/.test(trimmed)) {
    return {
      isValid: false,
      error: `Contact Number must contain only 10 numeric digits. Do not include country codes (+91), spaces, hyphens, or letters.`,
      formatted: digitsOnly.slice(0, 10)
    };
  }

  if (digitsOnly.length !== 10) {
    return {
      isValid: false,
      error: `Contact Number must be exactly 10 digits (currently ${digitsOnly.length}/10 digits). Example: 9876543210.`,
      formatted: digitsOnly.slice(0, 10)
    };
  }

  // Check for valid Indian mobile starting digit (6, 7, 8, 9)
  if (!/^[6-9]/.test(digitsOnly)) {
    return {
      isValid: false,
      error: `Invalid Indian Mobile Number: Must start with 6, 7, 8, or 9 (entered: "${digitsOnly}").`,
      formatted: digitsOnly
    };
  }

  return {
    isValid: true,
    formatted: digitsOnly
  };
};

/**
 * Store / Outlet Name Validation
 */
export const validateStoreName = (name: string | null | undefined): ValidationResult => {
  if (!name || typeof name !== 'string') {
    return {
      isValid: false,
      error: 'Outlet / Store Name is required.',
      formatted: ''
    };
  }

  const cleaned = name.trim();
  if (cleaned.length < 2) {
    return {
      isValid: false,
      error: 'Outlet / Store Name must be at least 2 characters long.',
      formatted: cleaned
    };
  }

  return {
    isValid: true,
    formatted: cleaned
  };
};

/**
 * Beat Route Validation
 */
export const validateBeatRoute = (beat: string | null | undefined): ValidationResult => {
  if (!beat || typeof beat !== 'string' || beat.trim().length === 0) {
    return {
      isValid: false,
      error: 'Beat Route is required. Please specify a valid route (e.g., Central Market Route).',
      formatted: 'Central Beat Route'
    };
  }

  return {
    isValid: true,
    formatted: beat.trim()
  };
};

/**
 * Credit Limit Validation
 */
export const validateCreditLimit = (limit: any): ValidationResult => {
  const num = Number(limit);
  if (isNaN(num) || num < 0) {
    return {
      isValid: false,
      error: 'Credit Limit must be a non-negative number in Rupees (e.g. 50000).',
      value: 0
    };
  }

  return {
    isValid: true,
    value: num
  };
};

/**
 * Payment Collection Amount Validation
 */
export const validatePaymentAmount = (amount: any): ValidationResult => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/,/g, ''));

  if (isNaN(num) || num <= 0) {
    return {
      isValid: false,
      error: 'Payment Amount must be a valid number greater than ₹0.',
      value: 0
    };
  }

  return {
    isValid: true,
    value: num
  };
};

/**
 * Payment Reference Number Validation
 */
export const validatePaymentReference = (
  ref: string | null | undefined,
  mode: string
): ValidationResult => {
  const cleaned = (ref || '').trim();

  if (mode !== 'CASH' && cleaned.length === 0) {
    return {
      isValid: false,
      error: `Payment Reference Number / UTR / Cheque Number is required for ${mode} transactions.`,
      formatted: ''
    };
  }

  return {
    isValid: true,
    formatted: cleaned
  };
};

/**
 * SKU Pricing Validation
 */
export const validateSKUPricing = (
  mrp: number,
  sellingPrice: number,
  landingCost: number
): ValidationResult => {
  if (isNaN(mrp) || mrp <= 0) {
    return {
      isValid: false,
      error: 'MRP (Maximum Retail Price) must be greater than ₹0.'
    };
  }

  if (isNaN(sellingPrice) || sellingPrice <= 0) {
    return {
      isValid: false,
      error: 'PTR (Selling Price to Retailer) must be greater than ₹0.'
    };
  }

  if (isNaN(landingCost) || landingCost < 0) {
    return {
      isValid: false,
      error: 'Landing Cost must be a positive number.'
    };
  }

  if (sellingPrice > mrp) {
    return {
      isValid: false,
      error: `Selling Price (PTR ₹${sellingPrice}) cannot exceed the Maximum Retail Price (MRP ₹${mrp}).`
    };
  }

  return { isValid: true };
};
