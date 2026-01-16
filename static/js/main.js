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
  sortDirection: "asc"
};

// ============================================
// Initialization
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await detectShell();
  await loadAliases(); // Will auto-load from shell
  setupEventListeners();
  applyTheme(state.settings.theme || "dark");
  updateStats();
});

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

function deleteAlias(id) {
  const alias = state.aliases.find(a => a.id === id);
  if (!alias) return;
  
  // Show custom confirmation dialog
  const message = `Are you sure you want to delete the alias "${alias.name}"?\n\nCommand: ${alias.command}`;
  
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
      const platformIcons = {
        darwin: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 2c-.3 0-.6.1-.9.2-.2.1-.5.2-.7.3-.2.1-.4.1-.6.1s-.4 0-.6-.1c-.2-.1-.5-.2-.7-.3-.3-.1-.6-.2-.9-.2-1.1 0-2 .6-2.6 1.5C3.7 4.4 3.5 5.4 3.5 6.5c0 1.1.2 2.2.7 3.1.5.9 1.2 1.7 2.1 2.3.4.3.9.5 1.4.5s1-.2 1.4-.5c.9-.6 1.6-1.4 2.1-2.3.5-.9.7-2 .7-3.1 0-1.1-.2-2.1-.7-3-.6-.9-1.5-1.5-2.7-1.5zm1.2 7.8c-.4.7-1 1.3-1.7 1.8-.3.2-.6.3-.9.3s-.6-.1-.9-.3c-.7-.5-1.3-1.1-1.7-1.8-.4-.7-.6-1.5-.6-2.3s.1-1.5.5-2.1c.4-.6.9-1 1.6-1 .2 0 .4 0 .6.1.2.1.4.2.6.2.2.1.4.1.6.1s.4 0 .6-.1c.2-.1.4-.2.6-.2.2-.1.4-.1.6-.1.7 0 1.2.4 1.6 1 .3.6.5 1.3.5 2.1s-.2 1.6-.6 2.3z"/><path d="M10 1c0 .3-.1.6-.2.8-.1.2-.3.4-.5.5-.2.1-.5.2-.8.2 0-.3.1-.6.2-.8.1-.2.3-.4.5-.5.2-.1.5-.2.8-.2z"/></svg>',
        linux: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1c-.9 0-1.6.4-2.1 1.1-.5.7-.7 1.6-.7 2.6 0 .5.1 1 .2 1.4.1.4.3.8.5 1.1L5 8.5c-.1.4 0 .8.2 1.1.2.3.5.5.9.5h.4c.2.5.5.9.9 1.2.4.3.9.5 1.5.5s1.1-.2 1.5-.5c.4-.3.7-.7.9-1.2h.4c.4 0 .7-.2.9-.5.2-.3.3-.7.2-1.1l-.9-1.3c.2-.3.4-.7.5-1.1.1-.4.2-.9.2-1.4 0-1-.2-1.9-.7-2.6C9.6 1.4 8.9 1 8 1zm0 1c.6 0 1.1.3 1.4.8.4.5.6 1.2.6 2.1 0 .4-.1.8-.2 1.2-.1.3-.2.6-.4.9l-.3.4.7 1c0 .2 0 .3-.1.4-.1.1-.2.2-.3.2h-.7l-.2.5c-.1.4-.3.7-.6.9-.3.2-.6.3-1 .3s-.7-.1-1-.3c-.3-.2-.5-.5-.6-.9l-.2-.5h-.7c-.1 0-.2-.1-.3-.2-.1-.1-.1-.2-.1-.4l.7-1-.3-.4c-.2-.3-.3-.6-.4-.9-.1-.4-.2-.8-.2-1.2 0-.9.2-1.6.6-2.1C6.9 2.3 7.4 2 8 2z"/><circle cx="7" cy="5.5" r=".8"/><circle cx="9" cy="5.5" r=".8"/></svg>',
        win32: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5l6-1v5.5H1V3.5zm7-1l7-1.5v7H8V2.5zM1 9h6v5.5l-6-1V9zm7 0h7v7l-7-1.5V9z"/></svg>'
      };
      const icon = platformIcons[shellInfo.platform] || '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l7 4v6l-7 4-7-4V5l7-4zm0 1.5L2.5 5.8v4.4L8 13.5l5.5-3.3V5.8L8 2.5z"/></svg>';
      shellBadge.innerHTML = `${icon} <span style="margin-left: 4px;">${shellInfo.defaultShell}</span>`;
      shellBadge.title = `Config: ${shellInfo.configPath}`;
    }
    
    console.log("Detected shell:", shellInfo);
  } catch (err) {
    console.error("Failed to detect shell:", err);
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
        <td colspan="6">
          <div class="empty-message">
            <p>No aliases found</p>
            <p class="empty-hint">Try adjusting your filters or create a new alias</p>
          </div>
        </td>
      </tr>
    `;
    renderPagination(0, 0);
    return;
  }

  tbody.innerHTML = paginatedAliases.map(alias => `
    <tr data-alias-id="${alias.id}">
      <td><strong>${escapeHtml(alias.name)}</strong></td>
      <td><code class="command-preview">${escapeHtml(alias.command || "")}</code></td>
      <td>${escapeHtml(alias.description || "")}</td>
      <td>${renderTags(alias.tags)}</td>
      <td>
        <input type="checkbox" class="alias-toggle" data-alias-id="${alias.id}" ${alias.enabled ? "checked" : ""}>
      </td>
      <td>
        <button class="icon-button btn-edit" data-alias-id="${alias.id}" title="Edit">✏️</button>
        <button class="icon-button btn-delete" data-alias-id="${alias.id}" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join("");
  
  // Add event delegation for alias actions
  setupAliasRowListeners();
  renderPagination(filteredAliases.length, totalPages);
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
      state.filterTag = e.target.dataset.tag;
      state.currentPage = 1;
      renderAliases();
      renderTagFilters();
    });
  });
}

function updateStats() {
  const totalEl = document.getElementById("stat-total");
  const enabledEl = document.getElementById("stat-enabled");
  
  if (totalEl) totalEl.textContent = state.aliases.length;
  if (enabledEl) enabledEl.textContent = state.aliases.filter(a => a.enabled).length;
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
        <svg width="16" height="16" viewBox="0 0 320 512" fill="currentColor">
          <path d="M267.5 440.6l-176-168c-9.4-9.4-9.4-24.6 0-33.9l176-168c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L142.1 256l159.4 151.5c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0zM19.5 440.6l-176-168c-9.4-9.4-9.4-24.6 0-33.9l176-168c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L-105.9 256l159.4 151.5c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0z"/>
        </svg>
      </button>
      <button class="pagination-btn" data-page="${state.currentPage - 1}" ${state.currentPage === 1 ? "disabled" : ""} title="Previous Page">
        <svg width="16" height="16" viewBox="0 0 320 512" fill="currentColor">
          <path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/>
        </svg>
      </button>
      <span class="pagination-text">Page ${state.currentPage} of ${totalPages}</span>
      <button class="pagination-btn" data-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? "disabled" : ""} title="Next Page">
        <svg width="16" height="16" viewBox="0 0 320 512" fill="currentColor">
          <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
        </svg>
      </button>
      <button class="pagination-btn" data-page="${totalPages}" ${state.currentPage === totalPages ? "disabled" : ""} title="Last Page">
        <svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor">
          <path d="M52.5 440.6l-176-168c-9.4-9.4-9.4-24.6 0-33.9l176-168c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L-72.9 256l159.4 151.5c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0zm256 0l-176-168c-9.4-9.4-9.4-24.6 0-33.9l176-168c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9L183.1 256l159.4 151.5c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0z"/>
        </svg>
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

// ============================================
// Theme Management
// ============================================
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.value = theme;
  }
  state.settings.theme = theme;
}

function toggleTheme() {
  const newTheme = state.settings.theme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
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

  // Import/Export
  document.getElementById("import-aliases").addEventListener("click", importAliasesFromShell);
  document.getElementById("export-aliases").addEventListener("click", exportAliasesToShell);

  // Theme toggle
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("change", (e) => {
      applyTheme(e.target.value);
      saveSettings();
    });
  }

  // Save settings
  const saveSettingsBtn = document.getElementById("save-settings");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", saveSettings);
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
    const target = e.target;
    
    // Edit button
    if (target.classList.contains("btn-edit")) {
      const aliasId = target.dataset.aliasId;
      editAlias(aliasId);
    }
    
    // Delete button
    if (target.classList.contains("btn-delete")) {
      const aliasId = target.dataset.aliasId;
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
  });
}

// Make functions available globally for inline event handlers
window.toggleAliasEnabled = toggleAliasEnabled;
window.editAlias = editAlias;
window.deleteAlias = deleteAlias;
window.goToPage = goToPage;
