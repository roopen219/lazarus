/**
 * Lazarus Side Panel
 * Main UI controller - flat chronological list for quick access
 */

import { DateTime } from 'luxon';
import { isPINInitialized, initializePIN, validatePIN, resetPIN } from '../utils/crypto.js';
import {
  getAllEntriesFlat,
  deleteEntryById,
  getStorageStats,
} from '../utils/storage.js';

// ============================================
// State
// ============================================

let isAuthenticated = false;
let allEntries = []; // Cache of all entries for search

// ============================================
// DOM Elements
// ============================================

const viewAuth = document.getElementById('view-auth');
const viewVault = document.getElementById('view-vault');
const authError = document.getElementById('auth-error');
const welcomeContent = document.getElementById('welcome-content');
const featuresSection = document.getElementById('features-section');
const confirmPinSection = document.getElementById('confirm-pin-section');
const confirmError = document.getElementById('confirm-error');
const pinInputs = document.querySelectorAll('.pin-digit[data-pin-index]');
const confirmInputs = document.querySelectorAll('.pin-digit[data-confirm-index]');

const searchInput = document.getElementById('search-input');
const listContainer = document.getElementById('list-container');
const emptyState = document.getElementById('empty-state');
const entriesList = document.getElementById('entries-list');
const storageStats = document.getElementById('storage-stats');
const entryCount = document.getElementById('entry-count');

const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsStorageUsed = document.getElementById('settings-storage-used');
const settingsStorageBar = document.getElementById('settings-storage-bar');
const resetPinBtn = document.getElementById('reset-pin-btn');
const clearDataBtn = document.getElementById('clear-data-btn');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const toastIcon = document.getElementById('toast-icon');

// ============================================
// Utilities
// ============================================

function formatRelativeTime(timestamp) {
  const dt = DateTime.fromMillis(timestamp);
  const diff = DateTime.now().diff(dt, ['days', 'hours', 'minutes']).toObject();
  
  if (diff.days > 0) {
    return diff.days === 1 ? 'yesterday' : `${Math.floor(diff.days)}d ago`;
  }
  if (diff.hours > 0) {
    return `${Math.floor(diff.hours)}h ago`;
  }
  if (diff.minutes > 1) {
    return `${Math.floor(diff.minutes)}m ago`;
  }
  return 'just now';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(message, isSuccess = true) {
  toastMessage.textContent = message;
  toast.classList.toggle('toast-success', isSuccess);
  toastIcon.innerHTML = isSuccess 
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>';
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch {
    showToast('Failed to copy', false);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncateText(text, maxLength = 120) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

/**
 * Smart truncation: show beginning and end of text with ellipsis in middle
 * Targets roughly 5 lines of display (~250 chars for narrow panel)
 */
function smartTruncate(text, maxLength = 250) {
  if (text.length <= maxLength) return { truncated: text, isTruncated: false };
  
  // Show more of the beginning, less of the end
  const startLength = Math.floor(maxLength * 0.65);
  const endLength = Math.floor(maxLength * 0.25);
  
  const start = text.slice(0, startLength).trim();
  const end = text.slice(-endLength).trim();
  
  return {
    truncated: `${start} … ${end}`,
    isTruncated: true,
    full: text
  };
}

/**
 * Get favicon URL for a host
 */
function getFaviconUrl(host) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

// ============================================
// PIN Handling
// ============================================

let setupPin = '';
let isSetupMode = false;

function getPinValue(inputs) {
  return Array.from(inputs).map(i => i.value).join('');
}

function clearPinInputs(inputs) {
  inputs.forEach(input => input.value = '');
  inputs[0]?.focus();
}

function setupPinInputs(inputs, onComplete) {
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value;
      if (!/^\d*$/.test(value)) {
        e.target.value = '';
        return;
      }
      if (value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
      const pin = getPinValue(inputs);
      if (pin.length === 4) onComplete(pin);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        inputs[index - 1].focus();
      }
    });
    
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text');
      const digits = paste.replace(/\D/g, '').slice(0, 4);
      digits.split('').forEach((digit, i) => {
        if (inputs[i]) inputs[i].value = digit;
      });
      if (digits.length === 4) onComplete(digits);
      else if (digits.length > 0) inputs[Math.min(digits.length, inputs.length - 1)].focus();
    });
  });
}

async function handlePinComplete(pin) {
  if (isSetupMode) {
    setupPin = pin;
    confirmPinSection.classList.remove('hidden');
    authHint.textContent = 'Confirm your PIN';
    clearPinInputs(confirmInputs);
    confirmInputs[0].focus();
  } else {
    const isValid = await validatePIN(pin);
    if (isValid) {
      isAuthenticated = true;
      showVault();
    } else {
      authError.classList.remove('hidden');
      clearPinInputs(pinInputs);
      setTimeout(() => authError.classList.add('hidden'), 2000);
    }
  }
}

async function handleConfirmPinComplete(pin) {
  if (pin !== setupPin) {
    confirmError.classList.remove('hidden');
    clearPinInputs(confirmInputs);
    setTimeout(() => confirmError.classList.add('hidden'), 2000);
    return;
  }
  await initializePIN(pin);
  isAuthenticated = true;
  showVault();
}

// ============================================
// Views
// ============================================

async function showAuth() {
  const hasPin = await isPINInitialized();
  
  if (hasPin) {
    isSetupMode = false;
    welcomeContent.querySelector('h2').textContent = 'Enter PIN';
    welcomeContent.querySelector('p').textContent = 'to view saved form fields.';
    featuresSection.classList.add('hidden');
  } else {
    isSetupMode = true;
    welcomeContent.querySelector('h2').textContent = 'Set a PIN';
    welcomeContent.querySelector('p').textContent = 'to save your form data.';
    featuresSection.classList.remove('hidden');
  }
  
  confirmPinSection.classList.add('hidden');
  viewAuth.classList.remove('hidden');
  viewVault.classList.add('hidden');
  clearPinInputs(pinInputs);
  clearPinInputs(confirmInputs);
  // Delay focus to ensure DOM transition completes
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pinInputs[0]?.focus();
    });
  });
}

async function showVault() {
  viewAuth.classList.add('hidden');
  viewVault.classList.remove('hidden');
  searchInput.value = '';
  await loadEntries();
  await updateStats();
}

// ============================================
// Entries List
// ============================================

async function loadEntries() {
  allEntries = await getAllEntriesFlat();
  renderEntries(allEntries);
}

function renderEntries(entries) {
  if (entries.length === 0) {
    emptyState.classList.remove('hidden');
    entriesList.innerHTML = '';
    entryCount.textContent = '0 entries';
    return;
  }
  
  emptyState.classList.add('hidden');
  entryCount.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  
  const truncateLabel = (label, max = 20) => label.length > max ? label.slice(0, max) + '…' : label;
  
  entriesList.innerHTML = entries.map((entry, index) => {
    const { truncated, isTruncated } = smartTruncate(entry.text);
    return `
    <div class="timeline-entry group" data-entry-index="${index}">
      <div class="flex items-start gap-3">
        <img 
          src="${getFaviconUrl(entry.host)}" 
          alt="" 
          class="w-4 h-4 rounded flex-shrink-0 mt-0.5 bg-slate-800"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="timeline-dot hidden"></div>
        <div class="flex-1 min-w-0 pb-4">
          <div class="flex items-center gap-2 mb-0.5 relative">
            <span class="text-[11px] text-slate-500 truncate flex-1">${escapeHtml(truncateLabel(entry.label))} · ${escapeHtml(entry.host)}</span>
            <span class="text-[10px] text-slate-600 group-hover:opacity-0 w-16 text-right">${formatRelativeTime(entry.timestamp)}</span>
            <div class="absolute right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button class="copy-btn p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-emerald-400 transition-colors" data-entry-index="${index}" title="Copy">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                </svg>
              </button>
              <button class="delete-btn p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors" data-entry-index="${index}" title="Delete">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
          <p class="entry-text text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words ${isTruncated ? 'cursor-pointer' : ''}" 
             data-truncated="${escapeHtml(truncated)}" 
             data-full="${escapeHtml(entry.text)}"
             data-expanded="false"
             data-is-truncated="${isTruncated}">${escapeHtml(truncated)}</p>
        </div>
      </div>
    </div>
  `;
  }).join('');
  
  // Bind copy buttons
  entriesList.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.entryIndex);
      const entry = entries[index];
      if (entry) copyToClipboard(entry.text);
    });
  });
  
  // Bind delete buttons
  entriesList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.entryIndex);
      const entry = entries[index];
      if (entry) {
        await deleteEntryById(entry.id);
        await loadEntries();
        await updateStats();
        showToast('Deleted');
      }
    });
  });
  
  // Bind text expand/collapse
  entriesList.querySelectorAll('.entry-text').forEach(textEl => {
    if (textEl.dataset.isTruncated !== 'true') return;
    
    textEl.addEventListener('click', (e) => {
      const isExpanded = textEl.dataset.expanded === 'true';
      
      if (isExpanded) {
        textEl.textContent = textEl.dataset.truncated;
        textEl.dataset.expanded = 'false';
      } else {
        textEl.textContent = textEl.dataset.full;
        textEl.dataset.expanded = 'true';
      }
    });
  });
}

// ============================================
// Search
// ============================================

function handleSearch() {
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    renderEntries(allEntries);
    return;
  }
  
  const filtered = allEntries.filter(entry => 
    entry.text.toLowerCase().includes(query) ||
    entry.label.toLowerCase().includes(query) ||
    entry.host.toLowerCase().includes(query)
  );
  
  renderEntries(filtered);
}

// ============================================
// Settings Panel
// ============================================

async function openSettings() {
  const stats = await getStorageStats();
  settingsStorageUsed.textContent = formatBytes(stats.bytesInUse);
  settingsStorageBar.style.width = `${Math.min(stats.percentage, 100)}%`;
  settingsPanel.classList.add('open');
}

function closeSettings() {
  settingsPanel.classList.remove('open');
}

async function updateStats() {
  const stats = await getStorageStats();
  storageStats.textContent = `${stats.percentage.toFixed(1)}% storage`;
}

// ============================================
// Storage Change Listener (Real-time updates)
// ============================================

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.lazarus_data && isAuthenticated) {
    // Refresh the entries list when storage changes
    loadEntries().then(() => {
      updateStats();
    });
  }
});

// ============================================
// Event Listeners
// ============================================

setupPinInputs(pinInputs, handlePinComplete);
setupPinInputs(confirmInputs, handleConfirmPinComplete);

searchInput.addEventListener('input', handleSearch);

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);

resetPinBtn.addEventListener('click', async () => {
  if (confirm('Reset your PIN?')) {
    await resetPIN();
    isAuthenticated = false;
    closeSettings();
    showAuth();
    showToast('PIN reset');
  }
});

clearDataBtn.addEventListener('click', async () => {
  if (confirm('Delete ALL saved data? This cannot be undone.')) {
    await chrome.storage.local.remove(['lazarus_data']);
    closeSettings();
    await loadEntries();
    await updateStats();
    showToast('All data cleared');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (settingsPanel.classList.contains('open')) closeSettings();
  }
});

// ============================================
// Init
// ============================================

async function init() {
  await showAuth();
}

init();
