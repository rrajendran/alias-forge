/**
 * Theme Manager
 * Handles theme switching, persistence, and dynamic theme loading
 */

class ThemeManager {
  constructor() {
    this.themes = new Map();
    this.currentTheme = null;
    this.defaultTheme = 'sunset-glow';
    this.storageKey = 'app-theme-preference';
  }

  /**
   * Register a theme palette
   * @param {Object} theme - Theme configuration object
   */
  registerTheme(theme) {
    if (!theme.id || !theme.name || !theme.colors) {
      throw new Error('Invalid theme: must have id, name, and colors');
    }
    this.themes.set(theme.id, theme);
  }

  /**
   * Get all registered themes
   * @returns {Array} Array of theme objects
   */
  getThemes() {
    return Array.from(this.themes.values());
  }

  /**
   * Get current active theme
   * @returns {Object|null} Current theme object
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Apply a theme by ID
   * @param {string} themeId - Theme identifier
   */
  applyTheme(themeId) {
    const theme = this.themes.get(themeId);
    if (!theme) {
      console.warn(`Theme "${themeId}" not found. Using default.`);
      themeId = this.defaultTheme;
    }

    // Set data-theme attribute on body
    document.body.setAttribute('data-theme', themeId);
    
    // Store current theme
    this.currentTheme = this.themes.get(themeId);
    
    // Persist preference
    this.savePreference(themeId);
    
    // Emit theme change event
    this.dispatchThemeChange(themeId);
    
    console.log(`Applied theme: ${themeId}`);
  }

  /**
   * Save theme preference to storage
   * @param {string} themeId - Theme identifier
   */
  savePreference(themeId) {
    try {
      localStorage.setItem(this.storageKey, themeId);
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  }

  /**
   * Load saved theme preference
   * @returns {string|null} Saved theme ID or null
   */
  loadPreference() {
    try {
      return localStorage.getItem(this.storageKey);
    } catch (err) {
      console.error('Failed to load theme preference:', err);
      return null;
    }
  }

  /**
   * Initialize theme system
   */
  async init() {
    // Register default themes
    this.registerDefaultThemes();
    
    // Load saved preference or use default
    const savedTheme = this.loadPreference() || this.defaultTheme;
    
    // Apply the theme
    this.applyTheme(savedTheme);
    
    return this.currentTheme;
  }

  /**
   * Register default themes
   */
  registerDefaultThemes() {
    // Dark theme
    this.registerTheme({
      id: 'dark',
      name: 'Dark',
      type: 'dark',
      colors: {}
    });

    // Light theme
    this.registerTheme({
      id: 'light',
      name: 'Light',
      type: 'light',
      colors: {}
    });

    // Sunset Glow theme
    this.registerTheme({
      id: 'sunset-glow',
      name: 'Sunset Glow',
      type: 'light',
      colors: {}
    });

    // Forest Canopy theme
    this.registerTheme({
      id: 'forest-canopy',
      name: 'Forest Canopy',
      type: 'light',
      colors: {}
    });
  }

  /**
   * Dispatch theme change event
   * @param {string} themeId - Theme identifier
   */
  dispatchThemeChange(themeId) {
    const event = new CustomEvent('themechange', {
      detail: { themeId, theme: this.themes.get(themeId) }
    });
    window.dispatchEvent(event);
  }

  /**
   * Generate CSS file content for a theme
   * @param {Object} theme - Theme configuration
   * @returns {string} CSS content
   */
  generateThemeCSS(theme) {
    const camelToKebab = (str) => str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
    
    let css = `/**\n * Theme: ${theme.name}\n`;
    css += ` * Type: ${theme.type || 'custom'}\n`;
    css += ` * Generated: ${new Date().toISOString()}\n */\n\n`;
    css += `[data-theme="${theme.id}"] {\n`;
    
    for (const [key, value] of Object.entries(theme.colors)) {
      const varName = camelToKebab(key);
      css += `  --${varName}: ${value};\n`;
    }
    
    css += `}\n`;
    return css;
  }

  /**
   * Add a custom theme dynamically
   * @param {Object} themeConfig - Custom theme configuration
   */
  addCustomTheme(themeConfig) {
    // Validate theme config
    if (!themeConfig.id || !themeConfig.name || !themeConfig.colors) {
      throw new Error('Invalid theme configuration');
    }

    // Register theme
    this.registerTheme(themeConfig);

    // Generate CSS content
    const cssContent = this.generateThemeCSS(themeConfig);

    // Inject CSS into document
    const styleEl = document.createElement('style');
    styleEl.id = `theme-${themeConfig.id}`;
    styleEl.textContent = cssContent;
    document.head.appendChild(styleEl);

    console.log(`Custom theme "${themeConfig.name}" added successfully`);
  }
}

// Export singleton instance
const themeManager = new ThemeManager();
