/**
 * Lazarus Content Script
 * Zero-overhead form monitoring using pure event delegation
 * 
 * Design: Single event listener with capture phase to intercept all input events
 * No MutationObserver, no DOM scanning, no overhead
 */

// Types to ignore
const IGNORED_TYPES = new Set(['password', 'hidden', 'submit', 'button', 'file', 'image', 'reset']);

// Sensitive autocomplete values (credit cards, banking, auth)
const SENSITIVE_AUTOCOMPLETE = new Set([
  'cc-name', 'cc-given-name', 'cc-additional-name', 'cc-family-name',
  'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type',
  'transaction-currency', 'transaction-amount',
  'new-password', 'current-password', 'one-time-code',
]);

// Patterns in field names/ids that indicate sensitive data
const SENSITIVE_NAME_PATTERNS = /\b(password|passwd|pwd|pin|cvv|cvc|csc|ccv|credit.?card|card.?number|cc.?num|security.?code|expir|exp.?date|exp.?month|exp.?year|ssn|social.?security|routing|account.?num|bank|otp|2fa|totp|verification.?code|auth.?code)\b/i;

/**
 * Generate a stable selector for an element
 * Uses heuristics: id > name > aria-label > placeholder > path from nearest ID
 * @param {HTMLElement} element
 * @returns {string}
 */
function generateStableSelector(element) {
  // Priority 1: ID
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  
  // Priority 2: Name attribute (for form elements)
  if (element.name) {
    const tagName = element.tagName.toLowerCase();
    return `${tagName}[name="${CSS.escape(element.name)}"]`;
  }
  
  // Priority 3: Aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return `[aria-label="${CSS.escape(ariaLabel)}"]`;
  }
  
  // Priority 4: Placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    const tagName = element.tagName.toLowerCase();
    return `${tagName}[placeholder="${CSS.escape(placeholder)}"]`;
  }
  
  // Priority 5: Path relative to nearest ancestor with ID
  return generatePathFromNearestId(element);
}

/**
 * Generate a path from the nearest ancestor with an ID
 * @param {HTMLElement} element
 * @returns {string}
 */
function generatePathFromNearestId(element) {
  const path = [];
  let current = element;
  
  while (current && current !== document.documentElement) {
    const tagName = current.tagName.toLowerCase();
    
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    
    // Add index among siblings of same type
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
      : [];
    
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      path.unshift(`${tagName}:nth-of-type(${index})`);
    } else {
      path.unshift(tagName);
    }
    
    current = current.parentElement;
  }
  
  return path.join(' > ') || element.tagName.toLowerCase();
}

/**
 * Extract a human-readable label for a field
 * @param {HTMLElement} element
 * @returns {string}
 */
function extractLabel(element) {
  // Check for associated label
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.textContent) {
      return label.textContent.trim().slice(0, 50);
    }
  }
  
  // Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.slice(0, 50);
  }
  
  // Check placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    return placeholder.slice(0, 50);
  }
  
  // Check name attribute
  if (element.name) {
    // Convert camelCase or snake_case to readable format
    return element.name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .trim()
      .slice(0, 50);
  }
  
  // Check parent label
  const parentLabel = element.closest('label');
  if (parentLabel?.textContent) {
    // Remove the input's own text
    const text = parentLabel.textContent.replace(element.value || '', '').trim();
    if (text) return text.slice(0, 50);
  }
  
  return 'Untitled Field';
}

/**
 * Extract text value from an element
 * @param {HTMLElement} element
 * @returns {string|null}
 */
function extractValue(element) {
  // Standard form elements
  if ('value' in element && typeof element.value === 'string') {
    return element.value;
  }
  
  // ContentEditable elements (Gmail, Notion, Slack, etc.)
  if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
    return element.innerText || element.textContent || '';
  }
  
  return null;
}

/**
 * Check if an element contains sensitive data (passwords, credit cards, etc.)
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isSensitiveField(element) {
  // Check autocomplete attribute
  const autocomplete = element.getAttribute('autocomplete');
  if (autocomplete && SENSITIVE_AUTOCOMPLETE.has(autocomplete.toLowerCase())) {
    return true;
  }
  
  // Check name attribute for sensitive patterns
  const name = element.name || '';
  if (SENSITIVE_NAME_PATTERNS.test(name)) {
    return true;
  }
  
  // Check id attribute for sensitive patterns
  const id = element.id || '';
  if (SENSITIVE_NAME_PATTERNS.test(id)) {
    return true;
  }
  
  // Check aria-label for sensitive patterns
  const ariaLabel = element.getAttribute('aria-label') || '';
  if (SENSITIVE_NAME_PATTERNS.test(ariaLabel)) {
    return true;
  }
  
  // Check placeholder for sensitive patterns
  const placeholder = element.getAttribute('placeholder') || '';
  if (SENSITIVE_NAME_PATTERNS.test(placeholder)) {
    return true;
  }
  
  return false;
}

/**
 * Check if an element should be monitored
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function shouldMonitor(element) {
  if (!element || !element.tagName) return false;
  
  const tagName = element.tagName.toLowerCase();
  
  // Standard inputs
  if (tagName === 'input') {
    const type = (element.type || 'text').toLowerCase();
    if (IGNORED_TYPES.has(type)) return false;
    // Additional check for sensitive fields
    if (isSensitiveField(element)) return false;
    return true;
  }
  
  // Textareas - check for sensitive content
  if (tagName === 'textarea') {
    return !isSensitiveField(element);
  }
  
  // ContentEditable elements - check for sensitive content
  if (element.isContentEditable) {
    return !isSensitiveField(element);
  }
  
  // ARIA textbox role (for custom implementations)
  if (element.getAttribute('role') === 'textbox') {
    return !isSensitiveField(element);
  }
  
  return false;
}

/**
 * Handle input events
 * @param {InputEvent} event
 */
function handleInput(event) {
  // Use composedPath to pierce Shadow DOM
  const target = event.composedPath()[0];
  
  if (!shouldMonitor(target)) {
    return;
  }
  
  const value = extractValue(target);
  
  // Ignore empty or very short values
  if (!value || value.length < 3) {
    return;
  }
  
  const selector = generateStableSelector(target);
  const label = extractLabel(target);
  
  // Get current page info
  const host = window.location.hostname;
  const path = window.location.pathname;
  
  // Send to background worker
  chrome.runtime.sendMessage({
    type: 'INPUT_CAPTURED',
    payload: {
      host,
      path,
      selector,
      label,
      value,
      timestamp: Date.now(),
    },
  }).catch(() => {
    // Extension context may be invalidated, ignore silently
  });
}

// Attach single event listener with capture phase
// capture: true - ensures we catch events before stopPropagation can block them
// passive: true - indicates we won't call preventDefault, allowing browser optimizations
window.addEventListener('input', handleInput, { capture: true, passive: true });

// Log initialization (dev only)
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[Lazarus] Content script initialized');
}
