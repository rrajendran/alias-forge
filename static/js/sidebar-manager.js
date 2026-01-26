/**
 * Sidebar Manager
 * Handles collapsible sidebar with titlebar toggle
 */

class SidebarManager {
  constructor() {
    this.sidebar = null;
    this.toggleButton = null;
    this.isCollapsed = false;
    this.storageKey = 'sidebar-collapsed';
    this.animationDuration = 250; // ms
  }

  /**
   * Initialize the sidebar
   */
  init() {
    this.sidebar = document.querySelector('.sidebar');
    this.toggleButton = document.getElementById('sidebarToggle');
    
    if (!this.toggleButton) {
      console.error('Sidebar toggle button not found');
      return;
    }
    
    this.restoreState();
    this.setupEventListeners();
    this.setupKeyboardSupport();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.toggleButton.addEventListener('click', () => {
      this.toggle();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  /**
   * Setup keyboard support
   */
  setupKeyboardSupport() {
    // Toggle with Cmd/Ctrl + B
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Toggle sidebar collapsed state
   */
  toggle() {
    this.isCollapsed = !this.isCollapsed;
    this.applyState();
    this.saveState();
  }

  /**
   * Apply the current state to the UI
   */
  applyState() {
    const sidebarResizer = document.querySelector('.sidebar-resizer');
    
    if (this.isCollapsed) {
      // Start hiding animation
      this.sidebar.classList.add('hiding');
      this.toggleButton.setAttribute('aria-expanded', 'false');
      this.toggleButton.classList.add('active');
      
      // Hide resizer
      if (sidebarResizer) {
        sidebarResizer.style.display = 'none';
      }
      
      // After animation completes, set display none
      setTimeout(() => {
        this.sidebar.classList.remove('hiding');
        this.sidebar.classList.add('hidden');
      }, this.animationDuration);
    } else {
      // Set display block first
      this.sidebar.classList.remove('hidden');
      this.sidebar.classList.add('showing');
      this.toggleButton.setAttribute('aria-expanded', 'true');
      this.toggleButton.classList.remove('active');
      
      // Force reflow to ensure display change is applied
      this.sidebar.offsetHeight;
      
      // Remove showing class to trigger animation
      setTimeout(() => {
        this.sidebar.classList.remove('showing');
      }, 10);
      
      // Show resizer after animation
      setTimeout(() => {
        if (sidebarResizer) {
          sidebarResizer.style.display = '';
        }
      }, this.animationDuration);
    }

    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('sidebar-toggle', {
      detail: { collapsed: this.isCollapsed }
    }));
  }

  /**
   * Save state to localStorage
   */
  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.isCollapsed));
    } catch (error) {
      console.error('Failed to save sidebar state:', error);
    }
  }

  /**
   * Restore state from localStorage
   */
  restoreState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved !== null) {
        this.isCollapsed = JSON.parse(saved);
        this.applyState();
      }
    } catch (error) {
      console.error('Failed to restore sidebar state:', error);
    }
  }

  /**
   * Handle window resize
   */
  handleResize() {
    // Auto-collapse on small screens
    if (window.innerWidth < 768 && !this.isCollapsed) {
      this.isCollapsed = true;
      this.applyState();
    }
  }

  /**
   * Expand sidebar
   */
  expand() {
    if (this.isCollapsed) {
      this.toggle();
    }
  }

  /**
   * Collapse sidebar
   */
  collapse() {
    if (!this.isCollapsed) {
      this.toggle();
    }
  }
}

// Initialize sidebar when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.sidebarManager = new SidebarManager();
    window.sidebarManager.init();
  });
} else {
  window.sidebarManager = new SidebarManager();
  window.sidebarManager.init();
}
