/**
 * Lazarus Crypto Utilities
 * Uses Web Crypto API for PIN hashing and validation
 */

const HASH_ALGORITHM = 'SHA-256';
const SALT_KEY = 'lazarus_salt';

/**
 * Generate a random salt
 * @returns {Uint8Array}
 */
function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Convert ArrayBuffer to hex string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Hash a PIN with a salt
 * @param {string} pin - The 4-digit PIN
 * @param {Uint8Array} salt - The salt to use
 * @returns {Promise<string>} - Hex encoded hash
 */
async function hashWithSalt(pin, salt) {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  
  // Combine salt and PIN
  const combined = new Uint8Array(salt.length + pinData.length);
  combined.set(salt);
  combined.set(pinData, salt.length);
  
  const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, combined);
  return bufferToHex(hashBuffer);
}

/**
 * Initialize a new PIN
 * @param {string} pin - The 4-digit PIN to set
 * @returns {Promise<void>}
 */
export async function initializePIN(pin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  
  const salt = generateSalt();
  const hash = await hashWithSalt(pin, salt);
  
  await chrome.storage.local.set({
    [SALT_KEY]: bufferToHex(salt),
    hashed_pin: hash,
  });
}

/**
 * Validate a PIN against stored hash
 * @param {string} pin - The PIN to validate
 * @returns {Promise<boolean>}
 */
export async function validatePIN(pin) {
  const result = await chrome.storage.local.get([SALT_KEY, 'hashed_pin']);
  
  if (!result[SALT_KEY] || !result.hashed_pin) {
    return false;
  }
  
  const salt = hexToBuffer(result[SALT_KEY]);
  const hash = await hashWithSalt(pin, salt);
  
  return hash === result.hashed_pin;
}

/**
 * Check if a PIN has been initialized
 * @returns {Promise<boolean>}
 */
export async function isPINInitialized() {
  const result = await chrome.storage.local.get(['hashed_pin']);
  return !!result.hashed_pin;
}

/**
 * Reset the PIN (for settings - requires current PIN validation first)
 * @returns {Promise<void>}
 */
export async function resetPIN() {
  await chrome.storage.local.remove([SALT_KEY, 'hashed_pin']);
}
