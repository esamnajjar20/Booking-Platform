import crypto from 'crypto';

/**
 * Utility: sleep/delay helper
 * Used to pause execution in async flows (e.g., retries, backoff strategies)
 */
export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates a cryptographically secure random string
 *
 * Why crypto.randomBytes?
 * - Provides CSPRNG (Cryptographically Secure Pseudo-Random Number Generator)
 * - Safer than Math.random for tokens, identifiers, or security-related values
 *
 * Example use cases:
 * - temporary IDs
 * - verification codes
 * - secure tokens
 */
export const generateSecureRandomString = (length: number = 8) => {
  return crypto
    .randomBytes(Math.ceil(length / 2)) // generate enough bytes for hex encoding
    .toString('hex')                    // convert to hexadecimal string
    .slice(0, length);                 // trim to requested length
};

/**
 * Backward compatibility alias
 * Kept to avoid breaking existing code that used the old function name
 *
 * NOTE:
 * Prefer using generateSecureRandomString going forward for clarity
 */
export const generateRandomString = generateSecureRandomString;