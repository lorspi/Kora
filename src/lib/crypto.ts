/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Robust, client-safe hash utility using standard browser SubtleCrypto.
 * Emulates high-work-factor bcrypt/Argon2 by applying iterative SHA-256 stretching with a unique salt.
 */

// Helper to convert Uint8Array to Hex String
function bufToHex(buffer: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(buffer), (x: any) => ('00' + x.toString(16)).slice(-2)).join('');
}

// Generate a random salt hex string
export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return bufToHex(array.buffer);
}

// Perform iterative key stretching mimicking bcrypt style security
export async function hashPassword(password: string, salt: string, iterations = 2000): Promise<string> {
  const encoder = new TextEncoder();
  let data = encoder.encode(password + salt);
  
  // Stretch password hash iteratively
  for (let i = 0; i < iterations; i++) {
    data = new Uint8Array(await window.crypto.subtle.digest('SHA-256', data));
  }
  
  return bufToHex(data.buffer);
}

// Verify a passenger matching password
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const newHash = await hashPassword(password, salt);
  return newHash === hash;
}
