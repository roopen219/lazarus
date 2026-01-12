/**
 * Lazarus Background Service Worker
 * Handles throttled saves, Levenshtein diffing, and storage management
 */

import { throttle } from 'lodash-es';
import levenshtein from 'fast-levenshtein';
import { getFieldData, saveFieldData } from '../utils/storage.js';

// Throttle configuration
const THROTTLE_MS = 1000;
const SIGNIFICANT_CHANGE_THRESHOLD = 10;

// Map of throttled save functions per field
const throttledSavers = new Map();

/**
 * Generate a unique key for a field
 * @param {string} host
 * @param {string} path
 * @param {string} selector
 * @returns {string}
 */
function getFieldKey(host, path, selector) {
  return `${host}::${path}::${selector}`;
}

/**
 * Process a captured input
 * @param {Object} data
 */
async function processInput(data) {
  const { host, path, selector, label, value, timestamp } = data;
  
  try {
    // Get existing field data
    const existingData = await getFieldData(host, path, selector);
    
    let isSignificantChange = true;
    
    if (existingData?.versions?.length > 0) {
      // Get the most recent version's text
      const lastVersion = existingData.versions[existingData.versions.length - 1];
      const lastText = lastVersion.text || '';
      
      // Calculate Levenshtein distance
      const distance = levenshtein.get(lastText, value);
      
      // Determine if this is a significant change
      isSignificantChange = distance >= SIGNIFICANT_CHANGE_THRESHOLD;
    }
    
    // Save the field data
    await saveFieldData({
      host,
      path,
      selector,
      label,
      text: value,
      timestamp,
      isSignificantChange,
    });
    
  } catch (error) {
    console.error('[Lazarus] Error processing input:', error);
  }
}

/**
 * Get or create a throttled saver for a specific field
 * @param {string} fieldKey
 * @returns {Function}
 */
function getThrottledSaver(fieldKey) {
  if (!throttledSavers.has(fieldKey)) {
    // Create a throttled function for this field
    // leading: true = save immediately on first call
    // trailing: true = save final value after typing stops
    const throttledFn = throttle(
      (data) => processInput(data),
      THROTTLE_MS,
      { leading: true, trailing: true }
    );
    throttledSavers.set(fieldKey, throttledFn);
  }
  return throttledSavers.get(fieldKey);
}

/**
 * Handle incoming messages from content scripts
 * @param {Object} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 */
function handleMessage(message, sender, sendResponse) {
  if (message.type !== 'INPUT_CAPTURED') {
    return;
  }
  
  const { host, path, selector } = message.payload;
  const fieldKey = getFieldKey(host, path, selector);
  
  // Get the throttled saver for this field and call it
  const throttledSave = getThrottledSaver(fieldKey);
  throttledSave(message.payload);
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(handleMessage);

// Handle side panel opening via action click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  // May not be supported in all contexts
});

console.log('[Lazarus] Background service worker initialized');
