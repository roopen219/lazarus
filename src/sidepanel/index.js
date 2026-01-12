/**
 * Lazarus Side Panel
 * Main UI controller using Mithril.js - flat chronological list for quick access
 */

import Fuse from 'fuse.js';
import { DateTime } from 'luxon';
import m from 'mithril';
import { initializePIN, isPINInitialized, resetPIN, validatePIN } from '../utils/crypto.js';
import {
  deleteEntryById,
  getAllEntriesFlat,
  getStorageStats,
} from '../utils/storage.js';

// Fuse.js configuration for fuzzy search
const FUSE_OPTIONS = {
  keys: [
    { name: 'text', weight: 0.6 },
    { name: 'label', weight: 0.3 },
    { name: 'host', weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
};

let fuseIndex = null;

// ============================================
// State
// ============================================

const state = {
  isAuthenticated: false,
  isSetupMode: false,
  setupPin: '',
  allEntries: [],
  filteredEntries: [],
  searchQuery: '',
  storageStats: { bytesInUse: 0, percentage: 0 },
  settingsOpen: false,
  toast: { visible: false, message: '', isSuccess: true },
  authError: false,
  confirmError: false,
  showConfirmPin: false,
  expandedEntries: new Set(),
  // Virtual scroll state
  scrollTop: 0,
  containerHeight: 400,
  // PIN input state (persisted across renders)
  pinValues: ['', '', '', ''],
  confirmPinValues: ['', '', '', ''],
};

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
  state.toast = { visible: true, message, isSuccess };
  m.redraw();
  setTimeout(() => {
    state.toast.visible = false;
    m.redraw();
  }, 2500);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch {
    showToast('Failed to copy', false);
  }
}

function truncateLabel(label, max = 20) {
  return label.length > max ? label.slice(0, max) + '…' : label;
}

function smartTruncate(text, maxLength = 250) {
  if (text.length <= maxLength) return { truncated: text, isTruncated: false };
  
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

function getFaviconUrl(host) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

// ============================================
// Data Loading
// ============================================

async function loadEntries() {
  state.allEntries = await getAllEntriesFlat();
  state.filteredEntries = state.allEntries;
  fuseIndex = new Fuse(state.allEntries, FUSE_OPTIONS);
  m.redraw();
}

async function updateStats() {
  state.storageStats = await getStorageStats();
  m.redraw();
}

let searchDebounceTimer = null;
const SEARCH_DEBOUNCE_MS = 150;

function handleSearch(query) {
  state.searchQuery = query;
  
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  
  searchDebounceTimer = setTimeout(() => {
    const trimmedQuery = query.trim();
    
    if (!trimmedQuery) {
      state.filteredEntries = state.allEntries;
    } else if (fuseIndex) {
      const results = fuseIndex.search(trimmedQuery);
      state.filteredEntries = results.map(result => result.item);
    } else {
      const lowerQuery = trimmedQuery.toLowerCase();
      state.filteredEntries = state.allEntries.filter(entry =>
        entry.text.toLowerCase().includes(lowerQuery) ||
        entry.label.toLowerCase().includes(lowerQuery) ||
        entry.host.toLowerCase().includes(lowerQuery)
      );
    }
    m.redraw();
  }, SEARCH_DEBOUNCE_MS);
}

// ============================================
// Storage Change Listener
// ============================================

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.lazarus_data && state.isAuthenticated) {
    loadEntries().then(() => updateStats());
  }
});

// ============================================
// Icons (SVG as Mithril vnodes)
// ============================================

const Icons = {
  settings: () => m('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.5', d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }),
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.5', d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' }),
  ]),
  search: () => m('svg', { class: 'w-4 h-4 text-slate-600', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' })
  ),
  back: () => m('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 19l-7-7 7-7' })
  ),
  copy: () => m('svg', { class: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3' })
  ),
  delete: () => m('svg', { class: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
  ),
  empty: () => m('svg', { class: 'w-8 h-8 text-slate-600', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.5', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
  ),
  check: () => m('svg', { class: 'w-4 h-4 text-emerald-400', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M5 13l4 4L19 7' })
  ),
  x: () => m('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    m('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M6 18L18 6M6 6l12 12' })
  ),
};

// ============================================
// Components
// ============================================

function createPinInputHandlers(valuesKey, onComplete) {
  return {
    handleInput(index, e) {
      const value = e.target.value;
      if (!/^\d*$/.test(value)) {
        e.target.value = '';
        return;
      }
      state[valuesKey][index] = value;
      
      if (value && index < 3) {
        const inputs = e.target.parentElement.querySelectorAll('input');
        inputs[index + 1]?.focus();
      }
      
      const pin = state[valuesKey].join('');
      if (pin.length === 4) {
        onComplete(pin);
        state[valuesKey] = ['', '', '', ''];
      }
      m.redraw();
    },
    
    handleKeydown(index, e) {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        const inputs = e.target.parentElement.querySelectorAll('input');
        inputs[index - 1]?.focus();
      }
    },
    
    handlePaste(e) {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text');
      const digits = paste.replace(/\D/g, '').slice(0, 4);
      const inputs = e.target.parentElement.querySelectorAll('input');
      
      digits.split('').forEach((digit, i) => {
        if (inputs[i]) {
          inputs[i].value = digit;
          state[valuesKey][i] = digit;
        }
      });
      
      if (digits.length === 4) {
        onComplete(digits);
        state[valuesKey] = ['', '', '', ''];
      } else if (digits.length > 0) {
        inputs[Math.min(digits.length, 3)]?.focus();
      }
      m.redraw();
    }
  };
}

// PIN Input Component
const PinInput = {
  oncreate(vnode) {
    if (vnode.attrs.autofocus) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          vnode.dom.querySelector('input')?.focus();
        });
      });
    }
  },
  view(vnode) {
    const { onComplete, error, errorMessage, valuesKey } = vnode.attrs;
    const handlers = createPinInputHandlers(valuesKey, onComplete);
    const values = state[valuesKey];
    
    return m('div', { class: 'flex items-center gap-2' }, [
      m('div', { class: 'pin-container' }, [0, 1, 2, 3].map(i =>
        m('input', {
          class: 'pin-digit',
          type: 'password',
          maxlength: 1,
          inputmode: 'numeric',
          pattern: '[0-9]',
          autocomplete: 'off',
          value: values[i],
          oninput: (e) => handlers.handleInput(i, e),
          onkeydown: (e) => handlers.handleKeydown(i, e),
          onpaste: handlers.handlePaste,
        })
      )),
      error && m('p', { class: 'text-red-400 text-xs' }, errorMessage || 'Incorrect'),
    ]);
  }
};

// Auth View Component
const AuthView = {
  oninit() {
    isPINInitialized().then(hasPin => {
      state.isSetupMode = !hasPin;
      m.redraw();
    });
  },
  view() {
    const handlePinComplete = async (pin) => {
      if (state.isSetupMode) {
        state.setupPin = pin;
        state.showConfirmPin = true;
        m.redraw();
        // Focus confirm input after render
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.querySelector('#confirm-pin-section input')?.focus();
          });
        });
      } else {
        const isValid = await validatePIN(pin);
        if (isValid) {
          state.isAuthenticated = true;
          await loadEntries();
          await updateStats();
        } else {
          state.authError = true;
          state.pinValues = ['', '', '', ''];
          setTimeout(() => { state.authError = false; m.redraw(); }, 2000);
        }
        m.redraw();
      }
    };
    
    const handleConfirmComplete = async (pin) => {
      if (pin !== state.setupPin) {
        state.confirmError = true;
        state.confirmPinValues = ['', '', '', ''];
        setTimeout(() => { state.confirmError = false; m.redraw(); }, 2000);
        m.redraw();
        return;
      }
      await initializePIN(pin);
      state.isAuthenticated = true;
      await loadEntries();
      await updateStats();
      m.redraw();
    };
    
    return m('div', { class: 'flex-1 flex flex-col p-5' }, [
      m('h1', { class: 'text-[10px] font-medium text-slate-600 uppercase tracking-[0.2em] mb-8' }, 'Lazarus'),
      
      // Welcome content
      m('div', { class: 'mb-8' }, [
        m('h2', { class: 'text-[22px] font-normal text-slate-200 leading-tight' }, 
          state.isSetupMode ? 'Set a PIN' : 'Enter PIN'),
        m('p', { class: 'text-[22px] font-normal text-slate-500 leading-tight' },
          state.isSetupMode ? 'to save your form data.' : 'to view saved form fields.'),
      ]),
      
      // Features (only on setup)
      state.isSetupMode && m('div', { class: 'mb-6' }, [
        m('p', { class: 'text-slate-600 text-[13px] leading-relaxed max-w-[240px] mb-4' },
          'Everything you type is saved locally. Crash, refresh, accidental close — come back here.'),
        m('div', { class: 'flex items-center gap-4 text-[11px] text-slate-600' }, 
          ['Automatic', 'Local-only', 'Private'].map(feature =>
            m('span', { class: 'flex items-center gap-1.5' }, [
              m('span', { class: 'w-1 h-1 rounded-full bg-emerald-600' }),
              feature,
            ])
          )
        ),
      ]),
      
      // PIN input
      m('div', [
        m(PinInput, { 
          onComplete: handlePinComplete, 
          error: state.authError,
          valuesKey: 'pinValues',
          autofocus: true,
        }),
      ]),
      
      // Confirm PIN (for setup)
      state.showConfirmPin && m('div', { class: 'mt-4', id: 'confirm-pin-section' }, [
        m('p', { class: 'text-slate-500 text-xs mb-2' }, 'Confirm PIN'),
        m(PinInput, { 
          onComplete: handleConfirmComplete, 
          error: state.confirmError,
          errorMessage: "Doesn't match",
          valuesKey: 'confirmPinValues',
        }),
      ]),
    ]);
  }
};

// Entry Item Component
const EntryItem = {
  onbeforeupdate(vnode, old) {
    // Only re-render if entry data or expanded state actually changed
    const { entry } = vnode.attrs;
    const oldEntry = old.attrs.entry;
    const isExpanded = state.expandedEntries.has(entry.id);
    const wasExpanded = state.expandedEntries.has(oldEntry.id);
    return entry.id !== oldEntry.id || 
           entry.timestamp !== oldEntry.timestamp || 
           isExpanded !== wasExpanded;
  },
  view(vnode) {
    const { entry, index, isFirst } = vnode.attrs;
    const { truncated, isTruncated } = smartTruncate(entry.text);
    const isExpanded = state.expandedEntries.has(entry.id);
    
    const handleCopy = (e) => {
      e.stopPropagation();
      copyToClipboard(entry.text);
    };
    
    const handleDelete = async (e) => {
      e.stopPropagation();
      await deleteEntryById(entry.id);
      await loadEntries();
      await updateStats();
      showToast('Deleted');
    };
    
    const handleTextClick = () => {
      if (!isTruncated) return;
      if (isExpanded) {
        state.expandedEntries.delete(entry.id);
      } else {
        state.expandedEntries.add(entry.id);
      }
      m.redraw();
    };
    
    return m('div', { class: 'timeline-entry group', 'data-entry-index': index }, [
      m('div', { class: 'flex items-start gap-3' }, [
        // Favicon
        m('img', {
          src: getFaviconUrl(entry.host),
          alt: '',
          class: 'w-4 h-4 rounded flex-shrink-0 mt-0.5 bg-slate-800',
          onerror: (e) => {
            e.target.style.display = 'none';
            e.target.nextElementSibling.style.display = 'flex';
          }
        }),
        // Fallback dot
        m('div', { 
          class: 'timeline-dot hidden' + (isFirst ? ' bg-emerald-600 border-emerald-900' : '')
        }),
        
        // Content
        m('div', { class: 'flex-1 min-w-0 pb-4' }, [
          // Header row
          m('div', { class: 'flex items-center gap-2 mb-0.5 relative' }, [
            m('span', { class: 'text-[11px] text-slate-500 truncate flex-1' }, 
              `${truncateLabel(entry.label)} · ${entry.host}`),
            m('span', { class: 'text-[10px] text-slate-600 group-hover:opacity-0 w-16 text-right' },
              formatRelativeTime(entry.timestamp)),
            // Action buttons
            m('div', { class: 'absolute right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity' }, [
              m('button', { 
                class: 'copy-btn p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-emerald-400 transition-colors',
                onclick: handleCopy, 
                title: 'Copy' 
              }, Icons.copy()),
              m('button', { 
                class: 'delete-btn p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors',
                onclick: handleDelete, 
                title: 'Delete' 
              }, Icons.delete()),
            ]),
          ]),
          // Text content
          m('p', {
            class: 'entry-text text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words' + (isTruncated ? ' cursor-pointer' : ''),
            'data-is-truncated': isTruncated.toString(),
            'data-expanded': isExpanded.toString(),
            onclick: handleTextClick,
          }, isExpanded ? entry.text : truncated),
        ]),
      ]),
    ]);
  }
};

// ============================================
// Virtual Scroll Component (Simple Custom)
// ============================================

const ESTIMATED_ITEM_HEIGHT = 85;
const BUFFER_SIZE = 100; // Large buffer for smooth scrolling
const SCROLL_THRESHOLD = ESTIMATED_ITEM_HEIGHT / 2; // Only update when scrolled by half an item

// Track last rendered state to avoid unnecessary redraws
let lastRenderedScrollTop = 0;
let lastItemCount = 0;

const VirtualList = {
  oncreate(vnode) {
    state.containerHeight = vnode.dom.clientHeight || 400;
  },
  
  onupdate(vnode) {
    const newHeight = vnode.dom.clientHeight;
    if (newHeight && newHeight !== state.containerHeight) {
      state.containerHeight = newHeight;
    }
  },
  
  view(vnode) {
    const { items, renderItem, emptyState } = vnode.attrs;
    const itemCount = items.length;
    
    if (itemCount === 0) {
      lastRenderedScrollTop = 0;
      lastItemCount = 0;
      return m('div', { class: 'flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 relative z-0' }, emptyState);
    }
    
    // Reset tracking if item count changed (search, new data, etc.)
    if (itemCount !== lastItemCount) {
      lastRenderedScrollTop = state.scrollTop;
      lastItemCount = itemCount;
    }
    
    const totalHeight = itemCount * ESTIMATED_ITEM_HEIGHT;
    const visibleCount = Math.ceil(state.containerHeight / ESTIMATED_ITEM_HEIGHT);
    const startIndex = Math.max(0, Math.floor(state.scrollTop / ESTIMATED_ITEM_HEIGHT) - BUFFER_SIZE);
    const endIndex = Math.min(itemCount, startIndex + visibleCount + BUFFER_SIZE * 2);
    
    const visibleItems = items.slice(startIndex, endIndex);
    const offsetY = startIndex * ESTIMATED_ITEM_HEIGHT;
    
    // Update tracking
    lastRenderedScrollTop = state.scrollTop;
    
    return m('div', { 
      class: 'flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 relative z-0',
      onscroll: (e) => {
        const newScrollTop = e.target.scrollTop;
        
        // Only redraw if scrolled enough to potentially change visible items
        if (Math.abs(newScrollTop - lastRenderedScrollTop) >= SCROLL_THRESHOLD) {
          state.scrollTop = newScrollTop;
          m.redraw();
        }
      },
    }, [
      m('div', { 
        style: { height: `${totalHeight}px`, position: 'relative' } 
      }, [
        m('div', { 
          style: { 
            transform: `translateY(${offsetY}px)`,
          } 
        }, visibleItems.map((item, i) => renderItem(item, startIndex + i))),
      ]),
    ]);
  }
};

// Entries List Component
const EntriesList = {
  view() {
    const entries = state.filteredEntries;
    
    const emptyState = m('div', { class: 'flex-1 flex flex-col items-center justify-center py-16' }, [
      m('div', { class: 'empty-state-icon' }, Icons.empty()),
      m('h3', { class: 'text-base font-medium text-slate-300 mb-1' }, 'No saved text yet'),
      m('p', { class: 'text-slate-600 text-sm text-center max-w-[200px]' },
        'Start typing in any form. Lazarus saves automatically.'),
    ]);
    
    return m(VirtualList, {
      items: entries,
      emptyState,
      renderItem: (entry, index) => m(EntryItem, { 
        key: entry.id, 
        entry, 
        index, 
        isFirst: index === 0 
      }),
    });
  }
};

// Vault View Component
const VaultView = {
  view() {
    return m('div', { class: 'flex-1 flex flex-col min-h-0' }, [
      // Header
      m('header', { class: 'header-blur sticky top-0 z-20 px-3 py-2' }, [
        m('div', { class: 'flex items-center justify-between mb-2' }, [
          m('h1', { class: 'text-xs font-semibold text-slate-100 uppercase tracking-[0.2em]' }, 'Lazarus'),
          m('button', {
            class: 'btn-icon -mr-1',
            onclick: () => { state.settingsOpen = true; },
            'aria-label': 'Settings',
          }, Icons.settings()),
        ]),
        // Search
        m('div', { class: 'relative' }, [
          m('div', { class: 'absolute left-3 top-1/2 -translate-y-1/2' }, Icons.search()),
          m('input', {
            class: 'search-input',
            type: 'text',
            placeholder: 'Search...',
            value: state.searchQuery,
            oninput: (e) => handleSearch(e.target.value),
          }),
        ]),
      ]),
      
      // Content
      m(EntriesList),
      
      // Footer
      m('footer', { class: 'flex-shrink-0 px-4 py-2 border-t border-slate-800/50 bg-slate-950' }, [
        m('div', { class: 'flex items-center justify-between text-xs text-slate-600' }, [
          m('span', `${state.storageStats.percentage.toFixed(1)}% storage`),
          m('span', `${state.filteredEntries.length} ${state.filteredEntries.length === 1 ? 'entry' : 'entries'}`),
        ]),
      ]),
    ]);
  }
};

// Settings Panel Component
const SettingsPanel = {
  view() {
    const handleResetPin = async () => {
      if (confirm('Reset your PIN?')) {
        await resetPIN();
        state.isAuthenticated = false;
        state.settingsOpen = false;
        state.showConfirmPin = false;
        state.setupPin = '';
        state.pinValues = ['', '', '', ''];
        state.confirmPinValues = ['', '', '', ''];
        showToast('PIN reset');
      }
    };
    
    const handleClearData = async () => {
      if (confirm('Delete ALL saved data? This cannot be undone.')) {
        await chrome.storage.local.remove(['lazarus_data']);
        state.settingsOpen = false;
        await loadEntries();
        await updateStats();
        showToast('All data cleared');
      }
    };
    
    return m('div', { class: 'slide-panel' + (state.settingsOpen ? ' open' : '') }, [
      m('header', { class: 'header-blur px-4 py-3 flex items-center gap-3' }, [
        m('button', {
          class: 'btn-icon -ml-2',
          onclick: () => { state.settingsOpen = false; },
          'aria-label': 'Back',
        }, Icons.back()),
        m('h2', { class: 'text-base font-medium text-slate-100' }, 'Settings'),
      ]),
      
      m('div', { class: 'flex-1 overflow-y-auto p-4 space-y-4' }, [
        // Storage
        m('div', { class: 'card p-4' }, [
          m('h3', { class: 'text-sm font-medium text-slate-300 mb-3' }, 'Storage'),
          m('div', { class: 'space-y-2' }, [
            m('div', { class: 'flex justify-between text-sm' }, [
              m('span', { class: 'text-slate-500' }, 'Used'),
              m('span', { class: 'text-slate-300' }, formatBytes(state.storageStats.bytesInUse)),
            ]),
            m('div', { class: 'w-full h-1.5 bg-slate-800 rounded-full overflow-hidden' }, [
              m('div', { 
                class: 'h-full bg-emerald-600 rounded-full transition-all duration-300',
                style: { width: `${Math.min(state.storageStats.percentage, 100)}%` }
              }),
            ]),
          ]),
        ]),
        
        // Security
        m('div', { class: 'card p-4' }, [
          m('h3', { class: 'text-sm font-medium text-slate-300 mb-3' }, 'Security'),
          m('button', { class: 'btn-ghost w-full justify-center', onclick: handleResetPin }, 'Reset PIN'),
        ]),
        
        // Danger Zone
        m('div', { class: 'card p-4 border-red-900/30' }, [
          m('h3', { class: 'text-sm font-medium text-slate-300 mb-3' }, 'Danger Zone'),
          m('button', { class: 'btn-danger w-full justify-center', onclick: handleClearData }, 'Clear All Data'),
          m('p', { class: 'text-slate-600 text-xs mt-2 text-center' }, 'Permanently deletes all saved form data'),
        ]),
        
        // About
        m('div', { class: 'text-center pt-4 pb-8' }, [
          m('p', { class: 'text-slate-600 text-xs' }, 'Lazarus v1.0.0'),
        ]),
      ]),
    ]);
  }
};

// Toast Component
const Toast = {
  view() {
    const classes = ['toast'];
    if (state.toast.visible) classes.push('visible');
    if (state.toast.isSuccess) classes.push('toast-success');
    
    return m('div', { class: classes.join(' ') }, [
      state.toast.isSuccess ? Icons.check() : Icons.x(),
      m('span', state.toast.message),
    ]);
  }
};

// Main App Component
const App = {
  view() {
    return [
      state.isAuthenticated ? m(VaultView) : m(AuthView),
      m(SettingsPanel),
      m(Toast),
    ];
  }
};

// ============================================
// Keyboard Events
// ============================================

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.settingsOpen) {
    state.settingsOpen = false;
    m.redraw();
  }
});

// ============================================
// Init
// ============================================

m.mount(document.getElementById('app'), App);
