/**
 * Main Renderer Process Script
 * Handles UI interactions and communication with main process
 * 
 * SECURITY: This script runs in a sandboxed renderer with no direct Node.js access
 * All main process communication goes through window.api exposed via preload
 */

// ============================================
// State Management
// ============================================
const state = {
  aliases: [],
  settings: {},
  currentShell: null,
  currentPlatform: null,
  currentTab: "aliases",
  editingAlias: null,
  filterTag: "all",
  searchQuery: "",
  // Pagination
  currentPage: 1,
  pageSize: 10,
  // Sorting
  sortColumn: "name",
  sortDirection: "asc",
  // Bulk selection
  selectedAliases: new Set(),
  // Dialog callbacks
  dialogCallback: null
};

// Sidebar element reference (initialized on DOMContentLoaded)
let sidebarEl = null;
const DEFAULT_SIDEBAR_WIDTH = 280;

// ============================================
// Initialization
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize theme system first
  await initThemeSystem();
  await loadSettings();
  await detectShell();
  await loadAliases(); // Will auto-load from shell
  setupEventListeners();
  updateStats();
  // Remove the startup loader once initial UI is ready
  hideStartupLoader();
  // Initialize sidebar width from saved settings
  sidebarEl = document.querySelector('.sidebar');
  const initWidth = (state.settings.sidebarWidth !== undefined && state.settings.sidebarWidth !== null) ? state.settings.sidebarWidth : DEFAULT_SIDEBAR_WIDTH;
  if (sidebarEl) {
    sidebarEl.style.width = initWidth + 'px';
  }
  // Wire up the resizer now that the sidebar exists
  initSidebarResizer();
  // Initialize tooltips
  initTooltips();
});

// Simple tooltip implementation for elements with data-tooltip
function initTooltips() {
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  document.body.appendChild(tooltipEl);

  let showTimer = null;

  function showTooltip(text, x, y) {
    tooltipEl.textContent = text;
    const rect = tooltipEl.getBoundingClientRect();
    let left = x - rect.width / 2;
    if (left < 8) left = 8;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = (y - rect.height - 12) + 'px';
    tooltipEl.classList.add('show');
  }

  function hideTooltip() {
    tooltipEl.classList.remove('show');
    tooltipEl.textContent = '';
  }

  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
      const text = el.getAttribute('data-tooltip');
      if (!text) return;
      const rect = el.getBoundingClientRect();
      showTimer = setTimeout(() => showTooltip(text, rect.left + rect.width / 2, rect.top), 250);
    });
    el.addEventListener('mouseleave', () => {
      clearTimeout(showTimer);
      hideTooltip();
    });
    el.addEventListener('focus', (e) => {
      const rect = el.getBoundingClientRect();
      showTooltip(el.getAttribute('data-tooltip'), rect.left + rect.width / 2, rect.top);
    });
    el.addEventListener('blur', hideTooltip);
  });
}

// ============================================
// Settings Management
// ============================================
async function loadSettings() {
  try {
    state.settings = await window.api.settings.load();
    // Apply page size from settings
    if (state.settings.pageSize) {
      state.pageSize = state.settings.pageSize;
    }
    console.log("Settings loaded:", state.settings);
  } catch (err) {
    console.error("Failed to load settings:", err);
    showToast("Failed to load settings", "error");
  }
}

async function saveSettings() {
  try {
    await window.api.settings.save(state.settings);
    showToast("Settings saved successfully", "success");
  } catch (err) {
    console.error("Failed to save settings:", err);
    showToast("Failed to save settings", "error");
  }
}

// ============================================
// Alias Management
// ============================================
async function loadAliases() {
  try {
    // Load saved aliases from storage
    console.log("Loading aliases from storage...");
    const data = await window.api.aliases.load();
    state.aliases = data.aliases || [];
    
    console.log(`Loaded ${state.aliases.length} saved aliases`);
    
    renderAliases();
    renderTagFilters();
    updateStats();
  } catch (err) {
    console.error("Failed to load aliases:", err);
    showToast("Failed to load aliases", "error");
  }
}

async function saveAliases() {
  try {
    await window.api.aliases.save({
      aliases: state.aliases
    });
    return true;
  } catch (err) {
    console.error("Failed to save aliases:", err);
    showToast("Failed to save aliases", "error");
    return false;
  }
}

async function exportAliasesToShell() {
  try {
    if (!state.currentShell) {
      showToast("Shell not detected", "error");
      return;
    }
    
    const result = await window.api.aliases.export(state.aliases, state.currentShell);
    
    if (result.success) {
      showToast(`Aliases exported to ${result.path}`, "success");
      return true;
    } else {
      showToast("Failed to export aliases: " + result.error, "error");
      return false;
    }
  } catch (err) {
    console.error("Failed to export aliases:", err);
    showToast("Failed to export aliases", "error");
    return false;
  }
}

async function importAliasesFromShell() {
  try {
    if (!state.currentShell) {
      showToast("Shell not detected", "error");
      return;
    }
    
    const result = await window.api.aliases.import(state.currentShell);
    
    if (result.success && result.aliases.length > 0) {
      // Merge imported aliases with existing ones (avoid duplicates by name)
      const existingNames = new Set(state.aliases.map(a => a.name));
      const newAliases = result.aliases.filter(a => !existingNames.has(a.name));
      
      if (newAliases.length > 0) {
        state.aliases = [...state.aliases, ...newAliases];
        await saveAliases();
        renderAliases();
        renderTagFilters();
        updateStats();
        showToast(`Imported ${newAliases.length} new aliases`, "success");
      } else {
        showToast(`All ${result.aliases.length} aliases already loaded`, "info");
      }
    } else if (result.success) {
      showToast("No new aliases found to import", "info");
    } else {
      showToast("Failed to import aliases: " + result.error, "error");
    }
  } catch (err) {
    console.error("Failed to import aliases:", err);
    showToast("Failed to import aliases", "error");
  }
}

async function importAliasesFromFile() {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate the imported data
        const validation = validateImportData(data);
        
        if (validation.valid.length === 0 && validation.invalid.length > 0) {
          // All imports failed
          showValidationErrorDialog(validation, false);
          return;
        }
        
        if (validation.invalid.length > 0) {
          // Some imports failed - show dialog with exit/continue options
          showValidationErrorDialog(validation, true);
          return;
        }
        
        // All valid - proceed with import
        await processValidAliases(validation.valid);
        
      } catch (err) {
        console.error("Failed to parse import file:", err);
        showToast("Invalid JSON file format", "error");
      }
    };
    
    input.click();
  } catch (err) {
    console.error("Failed to import from file:", err);
    showToast("Failed to import from file", "error");
  }
}

async function exportAliasesToFile() {
  try {
    const data = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      aliases: state.aliases
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `alias-forge-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${state.aliases.length} aliases to file`, "success");
  } catch (err) {
    console.error("Failed to export to file:", err);
    showToast("Failed to export to file", "error");
  }
}

function deleteAlias(id) {
  const alias = state.aliases.find(a => a.id === id);
  if (!alias) return;
  
  // Show custom confirmation dialog - only show alias name
  const message = `Are you sure you want to delete the alias "${alias.name}"?`;
  
  if (!confirm(message)) {
    return;
  }
  
  state.aliases = state.aliases.filter(a => a.id !== id);
  saveAliases().then(success => {
    if (success) {
      exportAliasesToShell();
      renderAliases();
      renderTagFilters();
      updateStats();
      showToast(`Deleted alias "${alias.name}"`, "success");
    }
  });
}

// ============================================
// Shell Detection
// ============================================
async function detectShell() {
  try {
    const shellInfo = await window.api.shell.detect();
    state.currentShell = shellInfo.defaultShell;
    state.currentPlatform = shellInfo.platform;
    
    // Update UI
    const shellBadge = document.getElementById("shell-badge");
    if (shellBadge) {
      // Use simple unicode glyphs for platform badges to keep them lightweight
      const platformIcons = {
        darwin: '', // Apple logo (private use glyph, may render on macOS)
        linux: '🐧',
        win32: '⊞' // Windows box-like glyph
      };
      const icon = platformIcons[shellInfo.platform] || '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l7 4v6l-7 4-7-4V5l7-4zm0 1.5L2.5 5.8v4.4L8 13.5l5.5-3.3V5.8L8 2.5z"/></svg>';
      const glyph = platformIcons[shellInfo.platform] || '◻';
      shellBadge.innerHTML = `<span class="platform-glyph">${glyph}</span><span style="margin-left: 6px;">${shellInfo.defaultShell}</span>`;
      shellBadge.title = `Config: ${shellInfo.configPath}`;
      // Make the shell badge clickable to filter by shell and show aliases
      shellBadge.style.cursor = 'pointer';
      shellBadge.addEventListener('click', () => {
        state.filterTag = 'all';
        state.currentPage = 1;
        renderAliases();
        switchTab('aliases');
        document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'aliases'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === 'aliases-pane'));
      });
    }
    
    console.log("Detected shell:", shellInfo);
  } catch (err) {
    console.error("Failed to detect shell:", err);
  }
}

// Hide startup loader once app initialization completes
function hideStartupLoader() {
  const loader = document.getElementById('startup-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 300);
  }
}

// ============================================
// UI Rendering
// ============================================
function renderAliases() {
  const tbody = document.getElementById("alias-table-body");
  
  // Filter aliases
  let filteredAliases = state.aliases;
  
  // Filter by tag
  if (state.filterTag && state.filterTag !== "all") {
    filteredAliases = filteredAliases.filter(alias => 
      alias.tags && alias.tags.includes(state.filterTag)
    );
  }
  
  // Filter by search
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filteredAliases = filteredAliases.filter(alias =>
      alias.name.toLowerCase().includes(query) ||
      alias.command?.toLowerCase().includes(query) ||
      alias.description?.toLowerCase().includes(query)
    );
  }
  
  // Sort aliases
  filteredAliases = sortAliases(filteredAliases);
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredAliases.length / state.pageSize);
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = startIndex + state.pageSize;
  const paginatedAliases = filteredAliases.slice(startIndex, endIndex);
  
  if (filteredAliases.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="7">
          <div class="empty-message">
            <p>No aliases found</p>
            <p class="empty-hint">Try adjusting your filters or create a new alias</p>
          </div>
        </td>
      </tr>
    `;
    renderPagination(0, 0);
    updateBulkActionsUI();
    return;
  }

  tbody.innerHTML = paginatedAliases.map(alias => `
    <tr data-alias-id="${alias.id}">
      <td class="checkbox-col">
        <input type="checkbox" class="row-checkbox" data-alias-id="${alias.id}" ${state.selectedAliases.has(alias.id) ? "checked" : ""}>
      </td>
      <td><strong>${escapeHtml(alias.name)}</strong></td>
      <td><code class="command-preview">${escapeHtml(alias.command || "")}</code></td>
      <td>${escapeHtml(alias.description || "")}</td>
      <td>${renderTags(alias.tags)}</td>
      <td>
        <input type="checkbox" class="alias-toggle" data-alias-id="${alias.id}" ${alias.enabled ? "checked" : ""}>
      </td>
      <td>
        <button class="icon-button btn-edit" data-alias-id="${alias.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-button btn-delete" data-alias-id="${alias.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </td>
    </tr>
  `).join("");
  
  // Add event delegation for alias actions
  setupAliasRowListeners();
  renderPagination(filteredAliases.length, totalPages);
  updateBulkActionsUI();
  updateSelectAllCheckbox();
}

function renderTags(tags) {
  if (!tags || tags.length === 0) return "";
  return tags.map(tag => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
}

function sortAliases(aliases) {
  const sorted = [...aliases];
  
  sorted.sort((a, b) => {
    let aVal, bVal;
    
    switch (state.sortColumn) {
      case "name":
        aVal = a.name || "";
        bVal = b.name || "";
        break;
      case "command":
        aVal = a.command || "";
        bVal = b.command || "";
        break;
      case "description":
        aVal = a.description || "";
        bVal = b.description || "";
        break;
      case "enabled":
        aVal = a.enabled ? 1 : 0;
        bVal = b.enabled ? 1 : 0;
        break;
      default:
        aVal = a.name || "";
        bVal = b.name || "";
    }
    
    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (aVal < bVal) return state.sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return state.sortDirection === "asc" ? 1 : -1;
    return 0;
  });
  
  return sorted;
}

function renderTagFilters() {
  const tagFilters = document.getElementById("tag-filters");
  if (!tagFilters) return;
  
  // Collect all unique tags
  const allTags = new Set();
  state.aliases.forEach(alias => {
    if (alias.tags) {
      alias.tags.forEach(tag => allTags.add(tag));
    }
  });
  
  const tags = ["all", ...Array.from(allTags).sort()];
  
  tagFilters.innerHTML = tags.map(tag => {
    const count = tag === "all" ? state.aliases.length : 
      state.aliases.filter(a => a.tags && a.tags.includes(tag)).length;
    const active = state.filterTag === tag ? "active" : "";
    
    return `<button class="tag-chip ${active}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} (${count})</button>`;
  }).join("");
  
  // Re-attach event listeners
  document.querySelectorAll(".tag-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      const target = e.currentTarget;
      state.filterTag = target.dataset.tag;
      state.currentPage = 1;
      renderAliases();
      renderTagFilters();
      // Ensure aliases tab is visible
      switchTab('aliases');
      document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'aliases'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === 'aliases-pane'));
    });
  });
}

function updateStats() {
  const totalEl = document.getElementById("stat-total");
  const enabledEl = document.getElementById("stat-enabled");
  const duplicatesEl = document.getElementById("stat-duplicates");
  
  if (totalEl) totalEl.textContent = state.aliases.length;
  if (enabledEl) enabledEl.textContent = state.aliases.filter(a => a.enabled).length;
  if (duplicatesEl) duplicatesEl.textContent = getDuplicateCount();
}

function renderPagination(totalItems, totalPages) {
  const paginationContainer = document.getElementById("pagination");
  if (!paginationContainer) return;
  
  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    return;
  }
  
  const startItem = totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
  const endItem = Math.min(state.currentPage * state.pageSize, totalItems);
  
  let html = `
    <div class="pagination-info">
      ${startItem}-${endItem} of ${totalItems}
    </div>
    <div class="pagination-controls">
      <button class="pagination-btn" data-page="1" ${state.currentPage === 1 ? "disabled" : ""} title="First Page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 17L6 12l5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 17L13 12l5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="pagination-btn" data-page="${state.currentPage - 1}" ${state.currentPage === 1 ? "disabled" : ""} title="Previous Page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="pagination-text">Page ${state.currentPage} of ${totalPages}</span>
      <button class="pagination-btn" data-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? "disabled" : ""} title="Next Page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="pagination-btn" data-page="${totalPages}" ${state.currentPage === totalPages ? "disabled" : ""} title="Last Page">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 18l6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 18l6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
  
  paginationContainer.innerHTML = html;
  
  // Add event listeners to pagination buttons
  paginationContainer.querySelectorAll(".pagination-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const page = parseInt(e.target.dataset.page);
      if (!isNaN(page)) {
        goToPage(page);
      }
    });
  });
}

// Initialize draggable sidebar resizer (call after DOM is ready)
function initSidebarResizer() {
  const resizer = document.getElementById('sidebar-resizer');
  if (!resizer || !sidebarEl) return;

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  const minW = 160;
  const maxW = 520;

  function onPointerMove(e) {
    if (!isDragging) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
    if (clientX === undefined) return;
    let newWidth = startWidth + (clientX - startX);
    newWidth = Math.max(minW, Math.min(maxW, newWidth));
    sidebarEl.style.width = newWidth + 'px';
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove('resizing');
    // persist the width
    const finalWidth = parseInt(sidebarEl.style.width, 10) || DEFAULT_SIDEBAR_WIDTH;
    state.settings.sidebarWidth = finalWidth;
    saveSettings();
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchend', onPointerUp);
  }

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = sidebarEl.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
  });

  // Touch support
  resizer.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].clientX;
    startWidth = sidebarEl.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  });

  // Double-click to reset to default width
  resizer.addEventListener('dblclick', (e) => {
    const defaultW = DEFAULT_SIDEBAR_WIDTH;
    sidebarEl.style.width = defaultW + 'px';
    state.settings.sidebarWidth = defaultW;
    saveSettings();
  });
}

// ============================================
// Theme Management
// ============================================

/**
 * Initialize theme system
 */
async function initThemeSystem() {
  try {
    // Initialize theme manager
    await themeManager.init();
    
    // Populate theme dropdown
    initThemeSelector();
    
    // Apply saved theme from settings or current theme
    const savedTheme = state.settings.theme || themeManager.loadPreference() || 'dark';
    themeManager.applyTheme(savedTheme);
    
    // Listen to theme changes
    window.addEventListener('themechange', (e) => {
      console.log('Theme changed to:', e.detail.themeId);
      state.settings.theme = e.detail.themeId;
    });
  } catch (err) {
    console.error('Failed to initialize theme system:', err);
    // Fallback to old system
    applyTheme(state.settings.theme || 'dark');
  }
}

/**
 * Initialize theme dropdown selector
 */
function initThemeSelector() {
  const themeSelect = document.getElementById('theme-select');
  if (!themeSelect) return;

  // Populate dropdown with available themes
  const themes = themeManager.getThemes();
  themeSelect.innerHTML = themes.map(theme => `
    <option value="${theme.id}" ${themeManager.getCurrentTheme()?.id === theme.id ? 'selected' : ''}>
      ${theme.name}
    </option>
  `).join('');

  // Handle theme selection
  themeSelect.addEventListener('change', (e) => {
    const themeId = e.target.value;
    themeManager.applyTheme(themeId);
    state.settings.theme = themeId;
    saveSettings();
    
    // Show success message
    const themeName = themes.find(t => t.id === themeId)?.name;
    showToast(`Theme changed to ${themeName}`, 'success');
  });
}

/**
 * Legacy theme application (kept for backwards compatibility)
 */
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.value = theme;
  }
  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    themeSelect.value = theme;
  }
  state.settings.theme = theme;
}

function toggleTheme() {
  const newTheme = state.settings.theme === "dark" ? "light" : "dark";
  themeManager.applyTheme(newTheme);
  saveSettings();
}

// ============================================
// Modal Management
// ============================================
function openModal(mode = "create", aliasData = null) {
  const modal = document.getElementById("alias-modal");
  const title = document.getElementById("modal-title");
  
  if (mode === "edit" && aliasData) {
    title.textContent = "Edit Alias";
    populateModalFields(aliasData);
    state.editingAlias = aliasData.id;
  } else {
    title.textContent = "New Alias";
    resetModalFields();
    state.editingAlias = null;
  }
  
  modal.classList.add("open");
}

function closeModal() {
  const modal = document.getElementById("alias-modal");
  modal.classList.remove("open");
  state.editingAlias = null;
}

function populateModalFields(alias) {
  document.getElementById("alias-name").value = alias.name || "";
  document.getElementById("alias-description").value = alias.description || "";
  document.getElementById("alias-tags").value = (alias.tags || []).join(", ");
  document.getElementById("alias-command").value = alias.command || "";
}

function resetModalFields() {
  document.getElementById("alias-name").value = "";
  document.getElementById("alias-description").value = "";
  document.getElementById("alias-tags").value = "";
  document.getElementById("alias-command").value = "";
}

function saveAliasFromModal() {
  const name = document.getElementById("alias-name").value.trim();
  const command = document.getElementById("alias-command").value.trim();
  const description = document.getElementById("alias-description").value.trim();
  const tags = document.getElementById("alias-tags").value.split(",").map(t => t.trim()).filter(t => t);
  
  if (!name) {
    showToast("Alias name is required", "error");
    return;
  }
  
  if (!command) {
    showToast("Command is required", "error");
    return;
  }
  
  const aliasData = {
    id: state.editingAlias || generateId(),
    name,
    command,
    description,
    tags,
    enabled: true,
    source: "user"
  };

  if (state.editingAlias) {
    // Update existing alias
    const index = state.aliases.findIndex(a => a.id === state.editingAlias);
    if (index !== -1) {
      state.aliases[index] = aliasData;
    }
  } else {
    // Add new alias
    state.aliases.push(aliasData);
  }
  
  saveAliases().then(success => {
    if (success) {
      exportAliasesToShell();
      renderAliases();
      renderTagFilters();
      updateStats();
      showToast(state.editingAlias ? "Alias updated" : "Alias created", "success");
    }
  });

  closeModal();
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      const tabName = e.target.dataset.tab;
      switchTab(tabName);
    });
  });

  // Platform filters
  document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
      e.target.classList.add("active");
      state.currentPlatform = e.target.dataset.platform;
      renderAliases();
    });
  });

  // Platform tabs in modal
  document.querySelectorAll(".platform-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      const platform = e.target.dataset.platformTab;
      switchPlatformTab(platform);
    });
  });

  // Modal controls
  document.getElementById("add-alias").addEventListener("click", () => openModal("create"));
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-alias").addEventListener("click", closeModal);
  document.getElementById("save-alias").addEventListener("click", saveAliasFromModal);

  // Import/Export dropdown toggles
  const importBtn = document.getElementById("import-btn");
  const importMenu = document.getElementById("import-menu");
  const exportBtn = document.getElementById("export-btn");
  const exportMenu = document.getElementById("export-menu");
  
  if (importBtn && importMenu) {
    importBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      importMenu.classList.toggle("show");
      exportMenu?.classList.remove("show");
    });
  }
  
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle("show");
      importMenu?.classList.remove("show");
    });
  }
  
  // Import/Export actions
  document.getElementById("import-from-shell")?.addEventListener("click", () => {
    importMenu?.classList.remove("show");
    importAliasesFromShell();
  });
  
  document.getElementById("import-from-file")?.addEventListener("click", () => {
    importMenu?.classList.remove("show");
    importAliasesFromFile();
  });
  
  document.getElementById("export-to-shell")?.addEventListener("click", () => {
    exportMenu?.classList.remove("show");
    exportAliasesToShell();
  });
  
  document.getElementById("export-to-file")?.addEventListener("click", () => {
    exportMenu?.classList.remove("show");
    exportAliasesToFile();
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (importMenu && importBtn && !importBtn.contains(e.target) && !importMenu.contains(e.target)) {
      importMenu.classList.remove("show");
    }
    if (exportMenu && exportBtn && !exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
      exportMenu.classList.remove("show");
    }
  });

  // Sidebar settings button removed — no sticky settings button in sidebar

  // Theme toggle (legacy support)
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("change", (e) => {
      themeManager.applyTheme(e.target.value);
      state.settings.theme = e.target.value;
      saveSettings();
    });
  }

  // Save settings
  const saveSettingsBtn = document.getElementById("save-settings");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", saveSettings);
  }

  // Check for updates button
  const checkUpdatesBtn = document.getElementById("check-updates-btn");
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener("click", async () => {
      const updateStatus = document.getElementById("update-status");
      const updateMessage = document.getElementById("update-message");
      const icon = checkUpdatesBtn.querySelector('i');
      
      // Show loading state
      checkUpdatesBtn.disabled = true;
      icon.classList.add('fa-spin');
      updateStatus.style.display = 'block';
      updateMessage.textContent = 'Checking for updates...';
      updateMessage.style.color = 'var(--fg-secondary)';
      
      try {
        // Request update check via IPC
        const result = await window.api.invoke('updater:check');
        
        if (result.updateAvailable) {
          updateMessage.innerHTML = `
            <div style="color: var(--accent-primary); font-weight: 600;">
              <i class="fas fa-circle-check"></i> Update available: v${result.version}
            </div>
            <div style="color: var(--fg-secondary); margin-top: 4px; font-size: 12px;">
              ${result.releaseNotes || 'New version available for download'}
            </div>
          `;
        } else {
          updateMessage.innerHTML = `
            <div style="color: var(--fg-primary);">
              <i class="fas fa-circle-check"></i> You're running the latest version
            </div>
          `;
        }
      } catch (error) {
        updateMessage.innerHTML = `
          <div style="color: var(--error-fg);">
            <i class="fas fa-circle-xmark"></i> Failed to check for updates
          </div>
          <div style="color: var(--fg-secondary); margin-top: 4px; font-size: 12px;">
            ${error.message || 'Please try again later'}
          </div>
        `;
      } finally {
        checkUpdatesBtn.disabled = false;
        icon.classList.remove('fa-spin');
      }
    });
  }

  // Search
  document.getElementById("alias-search").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    state.currentPage = 1; // Reset to first page on search
    renderAliases();
  });
  
  // Sortable headers
  document.querySelectorAll(".sortable").forEach(header => {
    header.addEventListener("click", (e) => {
      const column = e.target.closest(".sortable").dataset.sort;
      if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortColumn = column;
        state.sortDirection = "asc";
      }
      updateSortIndicators();
      renderAliases();
    });
  });
  
  // Page size
  const pageSizeInput = document.getElementById("page-size");
  if (pageSizeInput) {
    pageSizeInput.value = state.pageSize;
    pageSizeInput.addEventListener("change", (e) => {
      const newSize = parseInt(e.target.value);
      if (newSize > 0 && newSize <= 100) {
        state.pageSize = newSize;
        state.currentPage = 1;
        state.settings.pageSize = newSize;
        renderAliases();
      }
    });
  }

  // Close modal on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });
  
  // Pagination event delegation
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".pagination-btn");
    if (btn && !btn.disabled) {
      const page = parseInt(btn.dataset.page);
      if (page) {
        state.currentPage = page;
        renderAliases();
      }
    }
  });
  
  // Setup alias row event listeners (edit, delete, toggle)
  setupAliasRowListeners();
  
  // Select all checkbox
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", toggleSelectAll);
  }
  
  // Bulk actions dropdown toggle
  const bulkActionsBtn = document.getElementById("bulk-actions-btn");
  const bulkActionsMenu = document.getElementById("bulk-actions-menu");
  if (bulkActionsBtn && bulkActionsMenu) {
    bulkActionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      bulkActionsMenu.classList.toggle("show");
    });
    
    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!bulkActionsBtn.contains(e.target) && !bulkActionsMenu.contains(e.target)) {
        bulkActionsMenu.classList.remove("show");
      }
    });
  }
  
  // Bulk actions menu items
  if (bulkActionsMenu) {
    bulkActionsMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (item) {
        const action = item.dataset.action;
        handleBulkAction(action);
      }
    });
  }
  
  // Confirmation dialog buttons
  const confirmationCancel = document.getElementById("confirmation-cancel");
  const confirmationConfirm = document.getElementById("confirmation-confirm");
  if (confirmationCancel) {
    confirmationCancel.addEventListener("click", hideConfirmationDialog);
  }
  if (confirmationConfirm) {
    confirmationConfirm.addEventListener("click", () => {
      if (state.dialogCallback) {
        state.dialogCallback();
      }
    });
  }
  
  // Update tags dialog buttons and input
  const bulkTagsCancel = document.getElementById("bulk-tags-cancel");
  const updateTagsClose = document.getElementById("update-tags-close");
  const bulkTagInput = document.getElementById("bulk-tag-input");
  
  if (bulkTagsCancel) {
    bulkTagsCancel.addEventListener("click", hideUpdateTagsDialog);
  }
  if (updateTagsClose) {
    updateTagsClose.addEventListener("click", hideUpdateTagsDialog);
  }
  
  if (bulkTagInput) {
    // Update autocomplete on input
    bulkTagInput.addEventListener("input", (e) => {
      showTagAutocomplete(e.target.value, "tag-autocomplete-dropdown");
    });
    
    // Handle Enter key
    bulkTagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const tag = e.target.value.trim();
        if (tag) {
          addBulkTag(tag);
          hideTagAutocomplete("tag-autocomplete-dropdown");
        }
      } else if (e.key === "Escape") {
        hideTagAutocomplete("tag-autocomplete-dropdown");
      }
    });
  }
  
  // Close autocomplete when clicking outside
  document.addEventListener("click", (e) => {
    const autocomplete = document.getElementById("tag-autocomplete-dropdown");
    const input = document.getElementById("bulk-tag-input");
    if (autocomplete && input && !autocomplete.contains(e.target) && !input.contains(e.target)) {
      hideTagAutocomplete("tag-autocomplete-dropdown");
    }
    
    const aliasAutocomplete = document.getElementById("alias-tag-autocomplete-dropdown");
    const aliasInput = document.getElementById("alias-tags");
    if (aliasAutocomplete && aliasInput && !aliasAutocomplete.contains(e.target) && !aliasInput.contains(e.target)) {
      hideTagAutocomplete("alias-tag-autocomplete-dropdown");
    }
  });
  
  // Alias modal tags autocomplete
  const aliasTagsInput = document.getElementById("alias-tags");
  let selectedAutocompleteIndex = -1;
  
  if (aliasTagsInput) {
    aliasTagsInput.addEventListener("input", (e) => {
      const value = e.target.value;
      // Get the current word being typed (after last comma)
      const lastCommaIndex = value.lastIndexOf(",");
      const currentWord = lastCommaIndex >= 0 ? value.substring(lastCommaIndex + 1).trim() : value.trim();
      selectedAutocompleteIndex = -1;
      showTagAutocomplete(currentWord, "alias-tag-autocomplete-dropdown");
    });
    
    aliasTagsInput.addEventListener("keydown", (e) => {
      const dropdown = document.getElementById("alias-tag-autocomplete-dropdown");
      const items = dropdown?.querySelectorAll(".autocomplete-item");
      
      if (dropdown && items && items.length > 0 && dropdown.classList.contains("show")) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          selectedAutocompleteIndex = (selectedAutocompleteIndex + 1) % items.length;
          updateAutocompleteSelection(items, selectedAutocompleteIndex);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          selectedAutocompleteIndex = selectedAutocompleteIndex <= 0 ? items.length - 1 : selectedAutocompleteIndex - 1;
          updateAutocompleteSelection(items, selectedAutocompleteIndex);
        } else if (e.key === "Enter" && selectedAutocompleteIndex >= 0) {
          e.preventDefault();
          const selectedItem = items[selectedAutocompleteIndex];
          const tag = selectedItem.dataset.tag;
          insertTagInAliasModal(tag);
          hideTagAutocomplete("alias-tag-autocomplete-dropdown");
          selectedAutocompleteIndex = -1;
          // Keep focus in input
          aliasTagsInput.focus();
        } else if (e.key === "Escape") {
          hideTagAutocomplete("alias-tag-autocomplete-dropdown");
          selectedAutocompleteIndex = -1;
        }
      } else if (e.key === "Escape") {
        hideTagAutocomplete("alias-tag-autocomplete-dropdown");
        selectedAutocompleteIndex = -1;
      }
    });
  }
  
  // Update prefix dialog buttons
  const bulkPrefixCancel = document.getElementById("bulk-prefix-cancel");
  const bulkPrefixConfirm = document.getElementById("bulk-prefix-confirm");
  if (bulkPrefixCancel) {
    bulkPrefixCancel.addEventListener("click", hideUpdatePrefixDialog);
  }
  if (bulkPrefixConfirm) {
    bulkPrefixConfirm.addEventListener("click", bulkUpdatePrefix);
  }
  
  // Validation error dialog buttons
  const validationErrorClose = document.getElementById("validation-error-close");
  const validationExit = document.getElementById("validation-exit");
  const validationContinue = document.getElementById("validation-continue");
  
  if (validationErrorClose) {
    validationErrorClose.addEventListener("click", hideValidationErrorDialog);
  }
  
  if (validationExit) {
    validationExit.addEventListener("click", () => {
      hideValidationErrorDialog();
      showToast("Import cancelled", "info");
    });
  }
  
  if (validationContinue) {
    validationContinue.addEventListener("click", async () => {
      if (state.pendingImportValidation && state.pendingImportValidation.valid.length > 0) {
        hideValidationErrorDialog();
        await processValidAliases(state.pendingImportValidation.valid);
      }
    });
  }
  
  // Close dialogs on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideConfirmationDialog();
      hideUpdateTagsDialog();
      hideUpdatePrefixDialog();
      hideValidationErrorDialog();
      closeModal();
    }
  });
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  // Update tab panes
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.toggle("active", pane.id === `${tabName}-pane`);
  });

  state.currentTab = tabName;
}

function switchPlatformTab(platform) {
  // Update platform tab buttons
  document.querySelectorAll(".platform-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.platformTab === platform);
  });

  // Update platform panes
  document.querySelectorAll(".platform-pane").forEach(pane => {
    pane.classList.toggle("active", pane.id === `${platform}-pane`);
  });
}

// ============================================
// Utility Functions
// ============================================
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");
  
  toastMessage.textContent = message;
  toast.classList.add("show");
  
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function generateId() {
  return `alias-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function toggleAliasEnabled(id, enabled) {
  const alias = state.aliases.find(a => a.id === id);
  if (alias) {
    alias.enabled = enabled;
    saveAliases().then(success => {
      if (success) {
        exportAliasesToShell();
        updateStats();
      }
    });
  }
}

function editAlias(id) {
  const alias = state.aliases.find(a => a.id === id);
  if (!alias) {
    showToast("Alias not found", "error");
    return;
  }
  
  state.editingAlias = alias.id;
  openModal("edit", alias);
}

function goToPage(page) {
  const totalPages = Math.ceil(getFilteredAliases().length / state.pageSize);
  if (page >= 1 && page <= totalPages) {
    state.currentPage = page;
    renderAliases();
  }
}

function getFilteredAliases() {
  let filteredAliases = state.aliases;
  
  if (state.filterTag && state.filterTag !== "all") {
    filteredAliases = filteredAliases.filter(alias => 
      alias.tags && alias.tags.includes(state.filterTag)
    );
  }
  
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filteredAliases = filteredAliases.filter(alias =>
      alias.name.toLowerCase().includes(query) ||
      alias.command?.toLowerCase().includes(query) ||
      alias.description?.toLowerCase().includes(query)
    );
  }
  
  return filteredAliases;
}

function getSelectedFilteredAliases() {
  const filteredAliases = getFilteredAliases();
  const filteredIds = new Set(filteredAliases.map(a => a.id));
  
  // Return only selected aliases that are in the filtered list
  return Array.from(state.selectedAliases).filter(id => filteredIds.has(id));
}

function hasActiveFilter() {
  return (state.filterTag && state.filterTag !== "all") || (state.searchQuery && state.searchQuery.trim());
}

function updateSortIndicators() {
  document.querySelectorAll(".sortable").forEach(header => {
    const column = header.dataset.sort;
    header.classList.remove("sort-asc", "sort-desc");
    if (column === state.sortColumn) {
      header.classList.add(`sort-${state.sortDirection}`);
    }
  });
}

function setupAliasRowListeners() {
  // Event delegation for alias table
  const tbody = document.getElementById("alias-table-body");
  if (!tbody) return;
  
  // Remove old listeners
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  
  // Add new listeners with event delegation
  newTbody.addEventListener("click", (e) => {
    // Check if clicked element or its parent is a button
    const editBtn = e.target.closest(".btn-edit");
    const deleteBtn = e.target.closest(".btn-delete");
    
    // Edit button
    if (editBtn) {
      const aliasId = editBtn.dataset.aliasId;
      editAlias(aliasId);
    }
    
    // Delete button
    if (deleteBtn) {
      const aliasId = deleteBtn.dataset.aliasId;
      deleteAlias(aliasId);
    }
  });
  
  // Toggle checkbox
  newTbody.addEventListener("change", (e) => {
    if (e.target.classList.contains("alias-toggle")) {
      const aliasId = e.target.dataset.aliasId;
      const enabled = e.target.checked;
      toggleAliasEnabled(aliasId, enabled);
    }
    
    // Row checkbox
    if (e.target.classList.contains("row-checkbox")) {
      const aliasId = e.target.dataset.aliasId;
      if (e.target.checked) {
        state.selectedAliases.add(aliasId);
      } else {
        state.selectedAliases.delete(aliasId);
      }
      updateBulkActionsUI();
      updateSelectAllCheckbox();
    }
  });
}

// ============================================
// Bulk Selection Functions
// ============================================
function updateBulkActionsUI() {
  const bulkActionsContainer = document.getElementById("bulk-actions-container");
  const bulkSelectionCount = document.getElementById("bulk-selection-count");
  
  if (!bulkActionsContainer || !bulkSelectionCount) return;
  
  const selectedCount = state.selectedAliases.size;
  
  if (selectedCount > 0) {
    bulkActionsContainer.style.display = "flex";
    bulkSelectionCount.textContent = `${selectedCount} selected`;
  } else {
    bulkActionsContainer.style.display = "none";
    // Close dropdown if open
    const dropdownMenu = document.getElementById("bulk-actions-menu");
    if (dropdownMenu) {
      dropdownMenu.classList.remove("show");
    }
  }
}

function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  if (!selectAllCheckbox) return;
  
  // Check against ALL filtered aliases, not just visible ones
  const allFilteredAliases = getFilteredAliases();
  const allIds = allFilteredAliases.map(a => a.id);
  
  if (allIds.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    return;
  }
  
  const selectedCount = allIds.filter(id => state.selectedAliases.has(id)).length;
  
  if (selectedCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedCount === allIds.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

function getCurrentPageAliases() {
  let filteredAliases = getFilteredAliases();
  filteredAliases = sortAliases(filteredAliases);
  const startIndex = (state.currentPage - 1) * state.pageSize;
  const endIndex = startIndex + state.pageSize;
  return filteredAliases.slice(startIndex, endIndex);
}

function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  // Get ALL filtered aliases across all pages, not just current page
  const allFilteredAliases = getFilteredAliases();
  const allIds = allFilteredAliases.map(a => a.id);
  
  if (selectAllCheckbox.checked) {
    // Select all aliases across all pages
    allIds.forEach(id => state.selectedAliases.add(id));
  } else {
    // Deselect all aliases
    allIds.forEach(id => state.selectedAliases.delete(id));
  }
  
  renderAliases();
}

// ============================================
// Dialog Functions
// ============================================
function showConfirmationDialog(title, message, callback) {
  const dialog = document.getElementById("confirmation-dialog");
  const titleEl = document.getElementById("confirmation-title");
  const messageEl = document.getElementById("confirmation-message");
  
  if (!dialog || !titleEl || !messageEl) return;
  
  titleEl.textContent = title;
  messageEl.textContent = message;
  state.dialogCallback = callback;
  
  dialog.classList.add("show");
}

function hideConfirmationDialog() {
  const dialog = document.getElementById("confirmation-dialog");
  if (dialog) {
    dialog.classList.remove("show");
  }
  state.dialogCallback = null;
}

function showUpdateTagsDialog() {
  const dialog = document.getElementById("update-tags-dialog");
  const input = document.getElementById("bulk-tag-input");
  
  if (!dialog || !input) return;
  
  input.value = "";
  
  // Collect all tags from selected filtered aliases
  const selectedIds = getSelectedFilteredAliases();
  const tagCounts = {};
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias && alias.tags) {
      alias.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  // Display tags (common tags shown)
  renderBulkTags(tagCounts, selectedIds.length);
  
  dialog.classList.add("show");
  
  // Focus input
  setTimeout(() => input.focus(), 100);
}

function hideUpdateTagsDialog() {
  const dialog = document.getElementById("update-tags-dialog");
  const autocomplete = document.getElementById("tag-autocomplete-dropdown");
  if (dialog) {
    dialog.classList.remove("show");
  }
  if (autocomplete) {
    autocomplete.classList.remove("show");
  }
}

function renderBulkTags(tagCounts, totalAliases) {
  const container = document.getElementById("bulk-tags-display");
  if (!container) return;
  
  const tags = Object.keys(tagCounts).sort();
  
  if (tags.length === 0) {
    container.innerHTML = '<span class="empty-tags-message">No common tags</span>';
    return;
  }
  
  container.innerHTML = tags.map(tag => {
    const count = tagCounts[tag];
    const isCommon = count === totalAliases;
    const title = isCommon ? `${tag} (in all ${totalAliases} aliases)` : `${tag} (in ${count} of ${totalAliases} aliases)`;
    return `
      <span class="tag-item" title="${escapeHtml(title)}" style="${!isCommon ? 'opacity: 0.7;' : ''}">
        <span>${escapeHtml(tag)}</span>
        <button class="tag-remove" data-tag="${escapeHtml(tag)}" title="Remove from all selected aliases">&times;</button>
      </span>
    `;
  }).join('');
  
  // Add event listeners for remove buttons
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = btn.dataset.tag;
      removeBulkTag(tag);
    });
  });
}

function showUpdatePrefixDialog() {
  const dialog = document.getElementById("update-prefix-dialog");
  const input = document.getElementById("bulk-prefix-input");
  const currentPrefixInfo = document.getElementById("current-prefix-info");
  const currentPrefixValue = document.getElementById("current-prefix-value");
  const replaceCheckbox = document.getElementById("replace-prefix-checkbox");
  
  if (!dialog || !input) return;
  
  input.value = "";
  if (replaceCheckbox) replaceCheckbox.checked = true;
  
  // Detect common prefix from selected filtered aliases
  const selectedIds = getSelectedFilteredAliases();
  const aliases = selectedIds.map(id => state.aliases.find(a => a.id === id)).filter(a => a);
  
  if (aliases.length > 0) {
    const commonPrefix = findCommonPrefix(aliases.map(a => a.name));
    
    if (commonPrefix && currentPrefixInfo && currentPrefixValue) {
      currentPrefixValue.textContent = commonPrefix;
      currentPrefixInfo.style.display = "block";
      input.placeholder = `e.g., ${commonPrefix}, new_prefix_`;
    } else if (currentPrefixInfo) {
      currentPrefixInfo.style.display = "none";
    }
  }
  
  dialog.classList.add("show");
  setTimeout(() => input.focus(), 100);
}

function hideUpdatePrefixDialog() {
  const dialog = document.getElementById("update-prefix-dialog");
  if (dialog) {
    dialog.classList.remove("show");
  }
}

function findCommonPrefix(names) {
  if (names.length === 0) return "";
  if (names.length === 1) {
    // Extract potential prefix (letters followed by underscore or dash)
    const match = names[0].match(/^([a-zA-Z]+[_-])/);
    return match ? match[1] : "";
  }
  
  // Find common prefix among all names
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    while (names[i].indexOf(prefix) !== 0) {
      prefix = prefix.substring(0, prefix.length - 1);
      if (prefix === "") return "";
    }
  }
  
  // Only return if it looks like a prefix (ends with _ or -)
  if (prefix.match(/[_-]$/)) {
    return prefix;
  }
  
  // Or if it's followed by _ or - in all names
  const hasDelimiter = names.every(name => name.length > prefix.length && /[_-]/.test(name[prefix.length]));
  if (hasDelimiter) {
    return prefix + names[0][prefix.length];
  }
  
  return "";
}

function bulkUpdatePrefix() {
  const input = document.getElementById("bulk-prefix-input");
  const replaceCheckbox = document.getElementById("replace-prefix-checkbox");
  const currentPrefixValue = document.getElementById("current-prefix-value");
  
  const newPrefix = input ? input.value.trim() : "";
  const shouldReplace = replaceCheckbox ? replaceCheckbox.checked : false;
  const currentPrefix = currentPrefixValue ? currentPrefixValue.textContent : "";
  
  // If no new prefix and no current prefix detected, show error
  if (!newPrefix && !currentPrefix) {
    showToast("Please enter a prefix", "error");
    return;
  }
  
  // If empty prefix with current prefix detected, this means remove the prefix
  const shouldRemovePrefix = !newPrefix && currentPrefix;
  
  const selectedIds = getSelectedFilteredAliases();
  let updateCount = 0;
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias) {
      if (shouldRemovePrefix && alias.name.startsWith(currentPrefix)) {
        // Remove the current prefix
        alias.name = alias.name.substring(currentPrefix.length);
        updateCount++;
      } else if (newPrefix) {
        if (shouldReplace && currentPrefix && alias.name.startsWith(currentPrefix)) {
          // Replace existing prefix
          alias.name = newPrefix + alias.name.substring(currentPrefix.length);
        } else {
          // Add new prefix
          alias.name = newPrefix + alias.name;
        }
        updateCount++;
      }
    }
  });
  
  const filterNote = hasActiveFilter() ? " (from filtered list)" : "";
  
  if (updateCount > 0) {
    saveAliases().then(success => {
      if (success) {
        exportAliasesToShell();
        renderAliases();
        let action;
        if (shouldRemovePrefix) {
          action = "Removed prefix from";
        } else if (shouldReplace && currentPrefix) {
          action = "Updated prefix for";
        } else {
          action = "Added prefix to";
        }
        showToast(`${action} ${updateCount} alias${updateCount > 1 ? 'es' : ''}${filterNote}`, "success");
      }
    });
  }
  
  hideUpdatePrefixDialog();
}

// ============================================
// Bulk Actions
// ============================================
function bulkDeleteAliases() {
  const selectedIds = getSelectedFilteredAliases();
  const count = selectedIds.length;
  
  if (count === 0) return;
  
  const filterNote = hasActiveFilter() ? " (from filtered list)" : "";
  const message = `Are you sure you want to delete ${count} alias${count > 1 ? 'es' : ''}${filterNote}? This action cannot be undone.`;
  
  showConfirmationDialog("Delete Aliases", message, () => {
    const idsToDelete = new Set(selectedIds);
    state.aliases = state.aliases.filter(a => !idsToDelete.has(a.id));
    selectedIds.forEach(id => state.selectedAliases.delete(id));
    
    saveAliases().then(success => {
      if (success) {
        exportAliasesToShell();
        renderAliases();
        renderTagFilters();
        updateStats();
        showToast(`Deleted ${count} alias${count > 1 ? 'es' : ''}${filterNote}`, "success");
      }
    });
    
    hideConfirmationDialog();
  });
}

function bulkEnableAliases() {
  const selectedIds = getSelectedFilteredAliases();
  
  if (selectedIds.length === 0) return;
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias) {
      alias.enabled = true;
    }
  });
  
  const filterNote = hasActiveFilter() ? " (from filtered list)" : "";
  
  saveAliases().then(success => {
    if (success) {
      exportAliasesToShell();
      renderAliases();
      updateStats();
      showToast(`Enabled ${selectedIds.length} alias${selectedIds.length > 1 ? 'es' : ''}${filterNote}`, "success");
    }
  });
}

function bulkDisableAliases() {
  const selectedIds = getSelectedFilteredAliases();
  
  if (selectedIds.length === 0) return;
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias) {
      alias.enabled = false;
    }
  });
  
  const filterNote = hasActiveFilter() ? " (from filtered list)" : "";
  
  saveAliases().then(success => {
    if (success) {
      exportAliasesToShell();
      renderAliases();
      updateStats();
      showToast(`Disabled ${selectedIds.length} alias${selectedIds.length > 1 ? 'es' : ''}${filterNote}`, "success");
    }
  });
}

function addBulkTag(tagName) {
  if (!tagName || !tagName.trim()) return;
  
  const tag = tagName.trim();
  const selectedIds = getSelectedFilteredAliases();
  let addCount = 0;
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias) {
      if (!alias.tags) {
        alias.tags = [];
      }
      // Add tag if not already present
      if (!alias.tags.includes(tag)) {
        alias.tags.push(tag);
        addCount++;
      }
    }
  });
  
  const filterNote = hasActiveFilter() ? " (in filtered list)" : "";
  
  if (addCount > 0) {
    saveAliases().then(success => {
      if (success) {
        exportAliasesToShell();
        renderAliases();
        renderTagFilters();
        showToast(`Added "${tag}" to ${addCount} alias${addCount > 1 ? 'es' : ''}${filterNote}`, "success");
        
        // Refresh tag display
        const tagCounts = {};
        selectedIds.forEach(id => {
          const alias = state.aliases.find(a => a.id === id);
          if (alias && alias.tags) {
            alias.tags.forEach(t => {
              tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
          }
        });
        renderBulkTags(tagCounts, selectedIds.length);
      }
    });
  } else {
    showToast(`Tag "${tag}" already exists in all selected aliases${filterNote}`, "info");
  }
  
  // Clear input
  const input = document.getElementById("bulk-tag-input");
  if (input) input.value = "";
}

function removeBulkTag(tagName) {
  const selectedIds = getSelectedFilteredAliases();
  let removeCount = 0;
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias && alias.tags) {
      const index = alias.tags.indexOf(tagName);
      if (index > -1) {
        alias.tags.splice(index, 1);
        removeCount++;
      }
    }
  });
  
  const filterNote = hasActiveFilter() ? " (from filtered list)" : "";
  
  if (removeCount > 0) {
    saveAliases().then(success => {
      if (success) {
        exportAliasesToShell();
        renderAliases();
        renderTagFilters();
        showToast(`Removed "${tagName}" from ${removeCount} alias${removeCount > 1 ? 'es' : ''}${filterNote}`, "success");
        
        // Refresh tag display
        const tagCounts = {};
        selectedIds.forEach(id => {
          const alias = state.aliases.find(a => a.id === id);
          if (alias && alias.tags) {
            alias.tags.forEach(t => {
              tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
          }
        });
        renderBulkTags(tagCounts, selectedIds.length);
      }
    });
  }
}

function getAllExistingTags() {
  const tagsSet = new Set();
  state.aliases.forEach(alias => {
    if (alias.tags) {
      alias.tags.forEach(tag => tagsSet.add(tag));
    }
  });
  return Array.from(tagsSet).sort();
}

function showTagAutocomplete(query, dropdownId = "tag-autocomplete-dropdown") {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  
  const allTags = getAllExistingTags();
  const normalizedQuery = query.toLowerCase().trim();
  
  // Only show autocomplete when user is typing
  if (!normalizedQuery) {
    dropdown.classList.remove("show");
    return;
  }
  
  // Filter tags by query
  const matchingTags = allTags.filter(tag => tag.toLowerCase().includes(normalizedQuery));
  
  if (matchingTags.length === 0) {
    dropdown.innerHTML = `
      <div class="autocomplete-item" data-tag="${escapeHtml(query)}">
        <svg class="autocomplete-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>Create "${escapeHtml(query)}"</span>
      </div>
    `;
  } else {
    dropdown.innerHTML = matchingTags.slice(0, 10).map(tag => `
      <div class="autocomplete-item" data-tag="${escapeHtml(tag)}">
        <svg class="autocomplete-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="7" cy="7" r="1" fill="currentColor"/>
        </svg>
        <span>${escapeHtml(tag)}</span>
      </div>
    `).join('');
    
    // Add "create new" option if query doesn't exactly match
    if (!matchingTags.includes(query)) {
      dropdown.innerHTML += `
        <div class="autocomplete-item" data-tag="${escapeHtml(query)}">
          <svg class="autocomplete-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5v14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>Create "${escapeHtml(query)}"</span>
        </div>
      `;
    }
    
    if (matchingTags.length > 10) {
      dropdown.innerHTML += '<div class="autocomplete-hint">Showing 10 of ' + matchingTags.length + ' matches</div>';
    }
  }
  dropdown.classList.add("show");
  
  // Add click handlers
  dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      const tag = item.dataset.tag;
      if (dropdownId === "tag-autocomplete-dropdown") {
        addBulkTag(tag);
      } else if (dropdownId === "alias-tag-autocomplete-dropdown") {
        insertTagInAliasModal(tag);
      }
      dropdown.classList.remove("show");
      
      // Keep focus in the input after selection
      if (dropdownId === "alias-tag-autocomplete-dropdown") {
        const aliasTagsInput = document.getElementById("alias-tags");
        setTimeout(() => aliasTagsInput?.focus(), 0);
      } else {
        const bulkTagsInput = document.getElementById("bulk-tag-input");
        setTimeout(() => bulkTagsInput?.focus(), 0);
      }
    });
  });
}

function hideTagAutocomplete(dropdownId = "tag-autocomplete-dropdown") {
  const dropdown = document.getElementById(dropdownId);
  if (dropdown) {
    dropdown.classList.remove("show");
  }
}

function insertTagInAliasModal(tag) {
  const input = document.getElementById("alias-tags");
  if (!input) return;
  
  const currentValue = input.value.trim();
  const tags = currentValue ? currentValue.split(",").map(t => t.trim()).filter(t => t) : [];
  
  // Add tag if not already present
  if (!tags.includes(tag)) {
    tags.push(tag);
    input.value = tags.join(", ");
  }
  
  // Keep cursor at the end and maintain focus
  setTimeout(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, 0);
}

function updateAutocompleteSelection(items, selectedIndex) {
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      item.classList.remove("selected");
    }
  });
}

function validateImportData(data) {
  const validation = {
    valid: [],
    invalid: [],
    duplicates: []
  };
  
  // Check if data has aliases array
  if (!data || typeof data !== "object") {
    validation.invalid.push({ error: "Invalid file format: Not a valid JSON object", line: 0 });
    return validation;
  }
  
  const aliases = data.aliases || [];
  
  if (!Array.isArray(aliases)) {
    validation.invalid.push({ error: "Invalid file format: 'aliases' must be an array", line: 0 });
    return validation;
  }
  
  if (aliases.length === 0) {
    validation.invalid.push({ error: "No aliases found in file", line: 0 });
    return validation;
  }
  
  // Get existing alias names for duplicate detection
  const existingNames = new Set(state.aliases.map(a => a.name));
  
  aliases.forEach((alias, index) => {
    const errors = [];
    
    // Required field validation
    if (!alias.name || typeof alias.name !== "string" || !alias.name.trim()) {
      errors.push("Missing or invalid 'name' field");
    }
    
    if (!alias.id || typeof alias.id !== "string") {
      errors.push("Missing or invalid 'id' field");
    }
    
    // Check for duplicates
    if (alias.name && existingNames.has(alias.name)) {
      validation.duplicates.push({
        name: alias.name,
        line: index + 1
      });
      return; // Skip duplicates
    }
    
    // Optional field type validation
    if (alias.tags !== undefined && !Array.isArray(alias.tags)) {
      errors.push("'tags' must be an array");
    }
    
    if (alias.enabled !== undefined && typeof alias.enabled !== "boolean") {
      errors.push("'enabled' must be a boolean");
    }
    
    if (errors.length > 0) {
      validation.invalid.push({
        alias: alias.name || `Alias #${index + 1}`,
        line: index + 1,
        errors: errors
      });
    } else {
      // Ensure required fields have defaults
      validation.valid.push({
        ...alias,
        enabled: alias.enabled !== undefined ? alias.enabled : true,
        tags: alias.tags || [],
        description: alias.description || "",
        profile: alias.profile || "default"
      });
    }
  });
  
  return validation;
}

function showValidationErrorDialog(validation, canContinue) {
  const dialog = document.getElementById("validation-error-dialog");
  const summary = document.getElementById("validation-summary");
  const errorsContainer = document.getElementById("validation-errors");
  const continueBtn = document.getElementById("validation-continue");
  
  if (!dialog || !summary || !errorsContainer) return;
  
  // Build summary
  let summaryHTML = `<div class="validation-stats">`;
  
  if (validation.valid.length > 0) {
    summaryHTML += `<p class="validation-stat success"><strong>${validation.valid.length}</strong> aliases are valid and can be imported</p>`;
  }
  
  if (validation.duplicates.length > 0) {
    summaryHTML += `<p class="validation-stat warning"><strong>${validation.duplicates.length}</strong> duplicates skipped (already exist)</p>`;
  }
  
  if (validation.invalid.length > 0) {
    summaryHTML += `<p class="validation-stat error"><strong>${validation.invalid.length}</strong> aliases failed validation</p>`;
  }
  
  summaryHTML += `</div>`;
  summary.innerHTML = summaryHTML;
  
  // Build error details
  let errorsHTML = "";
  
  if (validation.duplicates.length > 0) {
    errorsHTML += `<div class="validation-section"><h4>Duplicates (Skipped)</h4><ul class="validation-list">`;
    validation.duplicates.forEach(dup => {
      errorsHTML += `<li><code>${escapeHtml(dup.name)}</code> - already exists</li>`;
    });
    errorsHTML += `</ul></div>`;
  }
  
  if (validation.invalid.length > 0) {
    errorsHTML += `<div class="validation-section"><h4>Validation Errors</h4><ul class="validation-list">`;
    validation.invalid.forEach(item => {
      errorsHTML += `<li><strong>${escapeHtml(item.alias)}</strong> (line ${item.line})<ul>`;
      item.errors.forEach(err => {
        errorsHTML += `<li>${escapeHtml(err)}</li>`;
      });
      errorsHTML += `</ul></li>`;
    });
    errorsHTML += `</ul></div>`;
  }
  
  errorsContainer.innerHTML = errorsHTML;
  
  // Show/hide continue button based on whether there are valid aliases
  if (continueBtn) {
    continueBtn.style.display = canContinue && validation.valid.length > 0 ? "block" : "none";
  }
  
  // Store validation data for continue action
  state.pendingImportValidation = validation;
  
  dialog.classList.add("show");
}

function hideValidationErrorDialog() {
  const dialog = document.getElementById("validation-error-dialog");
  if (dialog) {
    dialog.classList.remove("show");
  }
  state.pendingImportValidation = null;
}

async function processValidAliases(validAliases) {
  if (!validAliases || validAliases.length === 0) {
    showToast("No valid aliases to import", "info");
    return;
  }
  
  // Add valid aliases to state
  state.aliases = [...state.aliases, ...validAliases];
  
  // Save and update UI
  const success = await saveAliases();
  if (success) {
    renderAliases();
    renderTagFilters();
    updateStats();
    showToast(`Successfully imported ${validAliases.length} alias${validAliases.length > 1 ? 'es' : ''}`, "success");
  } else {
    showToast("Failed to save imported aliases", "error");
  }
}

function bulkAddPrefix() {
  const input = document.getElementById("bulk-prefix-input");
  const prefix = input ? input.value.trim() : "";
  
  if (!prefix) {
    showToast("Please enter a prefix", "error");
    return;
  }
  
  const selectedIds = Array.from(state.selectedAliases);
  
  selectedIds.forEach(id => {
    const alias = state.aliases.find(a => a.id === id);
    if (alias) {
      alias.name = prefix + alias.name;
    }
  });
  
  saveAliases().then(success => {
    if (success) {
      exportAliasesToShell();
      renderAliases();
      showToast(`Added prefix to ${selectedIds.length} alias${selectedIds.length > 1 ? 'es' : ''}`, "success");
    }
  });
  
  hideAddPrefixDialog();
}

function getDuplicateCount() {
  const seen = new Map();
  let duplicateCount = 0;
  
  state.aliases.forEach(alias => {
    const key = `${alias.name}|${alias.command || ''}`;
    if (seen.has(key)) {
      duplicateCount++;
    } else {
      seen.set(key, true);
    }
  });
  
  return duplicateCount;
}

function findDuplicates() {
  const seen = new Map();
  const duplicates = [];
  
  state.aliases.forEach(alias => {
    const key = `${alias.name}|${alias.command || ''}`;
    if (seen.has(key)) {
      duplicates.push(alias.id);
    } else {
      seen.set(key, alias.id);
    }
  });
  
  return duplicates;
}

function bulkRemoveDuplicates() {
  const duplicateIds = findDuplicates();
  
  if (duplicateIds.length === 0) {
    showToast("No duplicates found", "info");
    return;
  }
  
  const message = `Found ${duplicateIds.length} duplicate alias${duplicateIds.length > 1 ? 'es' : ''} (same name and command). Remove them?`;
  
  showConfirmationDialog(
    "Remove Duplicates",
    message,
    () => {
      // Close the confirmation dialog
      hideConfirmationDialog();
      
      // Keep track of removed count
      const initialLength = state.aliases.length;
      
      // Remove duplicates
      state.aliases = state.aliases.filter(alias => !duplicateIds.includes(alias.id));
      
      const removedCount = initialLength - state.aliases.length;
      
      saveAliases().then(success => {
        if (success) {
          exportAliasesToShell();
          renderAliases();
          renderTagFilters();
          updateStats();
          showToast(`Removed ${removedCount} duplicate alias${removedCount > 1 ? 'es' : ''}`, "success");
        }
      });
    }
  );
}

function handleBulkAction(action) {
  // Close dropdown
  const dropdownMenu = document.getElementById("bulk-actions-menu");
  if (dropdownMenu) {
    dropdownMenu.classList.remove("show");
  }
  
  switch (action) {
    case "delete":
      bulkDeleteAliases();
      break;
    case "enable":
      bulkEnableAliases();
      break;
    case "disable":
      bulkDisableAliases();
      break;
    case "update-tags":
      showUpdateTagsDialog();
      break;
    case "update-prefix":
      showUpdatePrefixDialog();
      break;
    case "remove-duplicates":
      bulkRemoveDuplicates();
      break;
      break;
  }
}

// Make functions available globally for inline event handlers
window.toggleAliasEnabled = toggleAliasEnabled;
window.editAlias = editAlias;
window.deleteAlias = deleteAlias;
window.goToPage = goToPage;
