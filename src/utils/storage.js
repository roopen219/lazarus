/**
 * Lazarus Storage Utilities
 * Handles data persistence with LRU eviction for quota management
 */

const STORAGE_KEY = 'lazarus_data';
const MAX_STORAGE_BYTES = 5 * 1024 * 1024; // 5MB
const SAFETY_MARGIN = 0.9; // Start evicting at 90% capacity
const MAX_VERSIONS_PER_FIELD = 10;

/**
 * Get all stored data
 * @returns {Promise<Object>}
 */
export async function getAllData() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] || {};
}

/**
 * Save all data
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function saveAllData(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/**
 * Get data for a specific field
 * @param {string} host
 * @param {string} path
 * @param {string} selector
 * @returns {Promise<Object|null>}
 */
export async function getFieldData(host, path, selector) {
  const data = await getAllData();
  return data[host]?.[path]?.[selector] || null;
}

/**
 * Save field data with version management
 * @param {Object} params
 * @param {string} params.host
 * @param {string} params.path
 * @param {string} params.selector
 * @param {string} params.label
 * @param {string} params.text
 * @param {number} params.timestamp
 * @param {boolean} params.isSignificantChange
 * @returns {Promise<void>}
 */
export async function saveFieldData({ host, path, selector, label, text, timestamp, isSignificantChange }) {
  // Check storage quota first
  await ensureStorageSpace();
  
  const data = await getAllData();
  
  // Initialize nested structure
  if (!data[host]) data[host] = {};
  if (!data[host][path]) data[host][path] = {};
  
  const fieldData = data[host][path][selector] || {
    label: label,
    lastUpdated: timestamp,
    versions: [],
  };
  
  // Update label if provided
  if (label) {
    fieldData.label = label;
  }
  
  fieldData.lastUpdated = timestamp;
  
  if (isSignificantChange || fieldData.versions.length === 0) {
    // Add new version
    fieldData.versions.push({
      ts: timestamp,
      text: text,
    });
    
    // Trim to max versions
    if (fieldData.versions.length > MAX_VERSIONS_PER_FIELD) {
      fieldData.versions = fieldData.versions.slice(-MAX_VERSIONS_PER_FIELD);
    }
  } else {
    // Update existing version timestamp and text
    if (fieldData.versions.length > 0) {
      fieldData.versions[fieldData.versions.length - 1].ts = timestamp;
      fieldData.versions[fieldData.versions.length - 1].text = text;
    }
  }
  
  data[host][path][selector] = fieldData;
  await saveAllData(data);
}

/**
 * Delete a specific field
 * @param {string} host
 * @param {string} path
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function deleteField(host, path, selector) {
  const data = await getAllData();
  
  if (data[host]?.[path]?.[selector]) {
    delete data[host][path][selector];
    
    // Clean up empty paths
    if (Object.keys(data[host][path]).length === 0) {
      delete data[host][path];
    }
    
    // Clean up empty hosts
    if (Object.keys(data[host]).length === 0) {
      delete data[host];
    }
    
    await saveAllData(data);
  }
}

/**
 * Delete an entire domain's data
 * @param {string} host
 * @returns {Promise<void>}
 */
export async function deleteDomain(host) {
  const data = await getAllData();
  
  if (data[host]) {
    delete data[host];
    await saveAllData(data);
  }
}

/**
 * Get storage statistics
 * @returns {Promise<{bytesInUse: number, percentage: number}>}
 */
export async function getStorageStats() {
  const bytesInUse = await chrome.storage.local.getBytesInUse([STORAGE_KEY]);
  return {
    bytesInUse,
    percentage: (bytesInUse / MAX_STORAGE_BYTES) * 100,
  };
}

/**
 * Find the oldest domain by last updated timestamp
 * @param {Object} data
 * @returns {string|null}
 */
function findOldestDomain(data) {
  let oldestDomain = null;
  let oldestTime = Infinity;
  
  for (const [host, paths] of Object.entries(data)) {
    for (const [path, fields] of Object.entries(paths)) {
      for (const [selector, fieldData] of Object.entries(fields)) {
        if (fieldData.lastUpdated < oldestTime) {
          oldestTime = fieldData.lastUpdated;
          oldestDomain = host;
        }
      }
    }
  }
  
  return oldestDomain;
}

/**
 * Ensure storage space by evicting LRU domains
 * @returns {Promise<void>}
 */
async function ensureStorageSpace() {
  const stats = await getStorageStats();
  
  if (stats.percentage < SAFETY_MARGIN * 100) {
    return; // Plenty of space
  }
  
  const data = await getAllData();
  let evicted = 0;
  
  // Evict oldest domains until we're under the threshold
  while (stats.percentage >= SAFETY_MARGIN * 100 && evicted < 10) {
    const oldestDomain = findOldestDomain(data);
    
    if (!oldestDomain) break;
    
    delete data[oldestDomain];
    evicted++;
    
    // Recalculate (estimate based on removed data)
    const newStats = await getStorageStats();
    if (newStats.percentage < SAFETY_MARGIN * 100) break;
  }
  
  if (evicted > 0) {
    await saveAllData(data);
    console.log(`[Lazarus] Evicted ${evicted} domains to free storage space`);
  }
}

/**
 * Get all versions as a flat chronological list (newest first)
 * Each version is a separate entry for easy search and recovery
 * @returns {Promise<Array<{id: string, host: string, path: string, selector: string, label: string, timestamp: number, text: string}>>}
 */
export async function getAllEntriesFlat() {
  const data = await getAllData();
  const entries = [];
  
  for (const [host, paths] of Object.entries(data)) {
    for (const [path, fields] of Object.entries(paths)) {
      for (const [selector, fieldData] of Object.entries(fields)) {
        const versions = fieldData.versions || [];
        const label = fieldData.label || 'Untitled';
        
        // Add each version as a separate entry
        versions.forEach((version, versionIndex) => {
          entries.push({
            // Unique ID includes version index
            id: `${host}|${path}|${selector}|${versionIndex}`,
            host,
            path,
            selector,
            label,
            timestamp: version.ts,
            text: version.text || '',
          });
        });
      }
    }
  }
  
  // Sort by timestamp, newest first
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Parse an entry ID back into host, path, selector, versionIndex
 * @param {string} id
 * @returns {{host: string, path: string, selector: string, versionIndex: number}}
 */
export function parseEntryId(id) {
  const parts = id.split('|');
  const versionIndex = parseInt(parts.pop(), 10);
  const host = parts[0];
  const path = parts[1];
  const selector = parts.slice(2).join('|');
  return { host, path, selector, versionIndex };
}

/**
 * Delete a specific version by its ID
 * If it's the last version, deletes the entire field
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteEntryById(id) {
  const { host, path, selector, versionIndex } = parseEntryId(id);
  const data = await getAllData();
  
  const fieldData = data[host]?.[path]?.[selector];
  if (!fieldData?.versions) return;
  
  // Remove the specific version
  fieldData.versions.splice(versionIndex, 1);
  
  // If no versions left, delete the entire field
  if (fieldData.versions.length === 0) {
    delete data[host][path][selector];
    
    // Clean up empty paths
    if (Object.keys(data[host][path]).length === 0) {
      delete data[host][path];
    }
    
    // Clean up empty hosts
    if (Object.keys(data[host]).length === 0) {
      delete data[host];
    }
  } else {
    // Update lastUpdated to the most recent remaining version
    const latestVersion = fieldData.versions[fieldData.versions.length - 1];
    fieldData.lastUpdated = latestVersion.ts;
  }
  
  await chrome.storage.local.set({ lazarus_data: data });
}
