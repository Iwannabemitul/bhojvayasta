/**
 * BhojVayasta - Shared Dynamic Navigation Header & Footer Component
 * File: js/navbar.js
 * 
 * Theme: Warm Editorial & Civic Logistics
 * Canvas: #F7F5F0 | Borders: #DCD9D0 | Ink: #141E18 | Accent: #C84B31 & #1B4332
 */

(function (global) {
  'use strict';

  // ==========================================
  // Global Toast Notification Helper
  // ==========================================
  const BhojToast = {
    ensureContainer() {
      let container = document.getElementById('bhoj-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'bhoj-toast-container';
        container.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm pointer-events-none';
        document.body.appendChild(container);
      }
      return container;
    },

    show(message, type = 'info', duration = 3500) {
      const container = this.ensureContainer();

      const toast = document.createElement('div');
      toast.className = `toast-item card-surface flex items-start gap-3 p-4 rounded shadow-lg pointer-events-auto transition-all duration-300 transform translate-y-3 opacity-0 border-l-4 ${
        type === 'success'
          ? 'border-l-[#1B4332] bg-white text-[#141E18]'
          : type === 'warning'
          ? 'border-l-[#B45309] bg-white text-[#141E18]'
          : type === 'error'
          ? 'border-l-[#C84B31] bg-white text-[#141E18]'
          : 'border-l-[#0284C7] bg-white text-[#141E18]'
      }`;

      let iconColor = type === 'success' ? '#1B4332' : type === 'warning' ? '#B45309' : type === 'error' ? '#C84B31' : '#0284C7';

      toast.innerHTML = `
        <div class="w-4 h-4 mt-0.5 shrink-0" style="color: ${iconColor};">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${
              type === 'success'
                ? 'M5 13l4 4L19 7'
                : type === 'warning'
                ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                : type === 'error'
                ? 'M6 18L18 6M6 6l12 12'
                : 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
            }"></path>
          </svg>
        </div>
        <div class="flex-1 text-xs font-medium leading-snug text-[#141E18]">${message}</div>
        <button type="button" class="text-[#525B55] hover:text-[#141E18] text-xs p-1 ml-1" aria-label="Close">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      `;

      const closeBtn = toast.querySelector('button');
      closeBtn.onclick = () => removeToast(toast);

      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-3', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
      });

      function removeToast(el) {
        el.classList.add('opacity-0', 'translate-x-3');
        setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 200);
      }

      const timer = setTimeout(() => removeToast(toast), duration);
      toast.addEventListener('mouseenter', () => clearTimeout(timer));
    },

    success(msg) { this.show(msg, 'success'); },
    warning(msg) { this.show(msg, 'warning'); },
    error(msg) { this.show(msg, 'error'); },
    info(msg) { this.show(msg, 'info'); }
  };

  global.BhojToast = BhojToast;

  function getCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('donate.html') || path.includes('/donate')) return 'donate';
    if (path.endsWith('volunteer.html') || path.includes('/volunteer')) return 'volunteer';
    return 'index';
  }

  // ==========================================
  // Render Dynamic Navigation Header
  // ==========================================
  function renderNavbar() {
    const navRoot = document.getElementById('navbar-root');
    if (!navRoot) return;

    // Apply Sticky Root Pattern from EXAMPLES.md
    navRoot.className = 'sticky top-0 z-50 w-full bg-[#F7F5F0]/95 backdrop-blur-md border-b border-[#DCD9D0]';

    const currentPage = getCurrentPage();

    let availableCount = 0;
    if (global.BhojStore && typeof global.BhojStore.getImpactMetrics === 'function') {
      try {
        const metrics = global.BhojStore.getImpactMetrics();
        availableCount = metrics.availablePickupsCount || 0;
      } catch (e) {
        console.warn('[BhojNav] Metrics query error:', e);
      }
    }

    const badgeMarkup = `
      <span id="nav-pickup-badge" class="font-mono text-[11px] px-1.5 py-0.5 rounded ${
        availableCount > 0
          ? 'bg-[#FEF3C7] text-[#B45309] border border-[#F59E0B]/40'
          : 'bg-[#EFECE6] text-[#525B55] border border-[#DCD9D0]'
      }">
        <span class="badge-num">${availableCount}</span> LIVE
      </span>
    `;

    navRoot.innerHTML = `
      <header class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        <!-- Brand Identity -->
        <a href="index.html" class="flex items-center gap-2.5 shrink-0 text-decoration-none">
          <span class="font-display text-xl font-bold tracking-tight text-[#141E18]">
            Bhoj<span class="text-[#C84B31]">Vayasta</span>
          </span>
          <span class="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 bg-[#EFECE6] text-[#525B55] border border-[#DCD9D0] rounded">
            Delhi/NCR • Punjab Corridor
          </span>
        </a>

        <!-- Desktop Navigation Links (Single-Line Editorial Tabs) -->
        <nav class="hidden md:flex items-center gap-6" aria-label="Main Navigation">
          <a href="index.html" class="whitespace-nowrap py-5 text-sm font-semibold transition-colors ${
            currentPage === 'index'
              ? 'text-[#141E18] border-b-2 border-[#C84B31]'
              : 'text-[#525B55] hover:text-[#141E18] border-b-2 border-transparent'
          }">
            Impact Dashboard
          </a>

          <a href="donate.html" class="whitespace-nowrap py-5 text-sm font-semibold transition-colors ${
            currentPage === 'donate'
              ? 'text-[#141E18] border-b-2 border-[#C84B31]'
              : 'text-[#525B55] hover:text-[#141E18] border-b-2 border-transparent'
          }">
            Donate Food
          </a>

          <a href="volunteer.html" class="whitespace-nowrap py-5 text-sm font-semibold transition-colors flex items-center gap-2 ${
            currentPage === 'volunteer'
              ? 'text-[#141E18] border-b-2 border-[#C84B31]'
              : 'text-[#525B55] hover:text-[#141E18] border-b-2 border-transparent'
          }">
            <span>Volunteer Map</span>
            ${badgeMarkup}
          </a>
        </nav>

        <!-- Right Utility Actions -->
        <div class="hidden sm:flex items-center gap-3 shrink-0">
          <button id="btn-reset-demo" type="button" title="Reset sample data for testing" class="whitespace-nowrap font-mono text-xs text-[#525B55] hover:text-[#141E18] px-2.5 py-1.5 border border-[#DCD9D0] bg-white rounded cursor-pointer transition-colors">
            Reset Demo
          </button>

          <a href="donate.html" class="whitespace-nowrap text-xs font-semibold uppercase tracking-wider bg-[#C84B31] hover:bg-[#A83820] text-white px-4 py-2 rounded transition-colors shadow-sm">
            Donate Food
          </a>
        </div>

        <!-- Mobile Menu Toggle Button -->
        <div class="flex items-center gap-2 md:hidden">
          <a href="volunteer.html" class="font-mono text-xs text-[#B45309] bg-[#FEF3C7] border border-[#F59E0B]/40 px-2 py-1 rounded">
            ${availableCount} Live
          </a>
          <button id="mobile-menu-toggle" type="button" aria-expanded="false" aria-label="Toggle Navigation Menu" class="p-2 border border-[#DCD9D0] rounded bg-white text-[#141E18]">
            <svg id="hamburger-icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            <svg id="close-icon" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

      </header>

      <!-- Mobile Dropdown Drawer -->
      <div id="mobile-menu" class="hidden md:hidden border-t border-[#DCD9D0] bg-[#F7F5F0] px-4 py-4 space-y-2">
        <a href="index.html" class="block py-2 text-sm font-semibold ${currentPage === 'index' ? 'text-[#C84B31]' : 'text-[#141E18]'}">
          Impact Dashboard
        </a>
        <a href="donate.html" class="block py-2 text-sm font-semibold ${currentPage === 'donate' ? 'text-[#C84B31]' : 'text-[#141E18]'}">
          Donate Food
        </a>
        <a href="volunteer.html" class="flex items-center justify-between py-2 text-sm font-semibold ${currentPage === 'volunteer' ? 'text-[#C84B31]' : 'text-[#141E18]'}">
          <span>Volunteer Map</span>
          <span class="font-mono text-xs bg-[#FEF3C7] text-[#B45309] px-2 py-0.5 border border-[#F59E0B]/30 rounded">${availableCount} Live</span>
        </a>
        <div class="pt-3 border-t border-[#DCD9D0] flex flex-col gap-2">
          <button id="mobile-btn-reset-demo" type="button" class="w-full text-center py-2 text-xs font-mono border border-[#DCD9D0] bg-white text-[#525B55]">
            Reset Demo Data
          </button>
          <a href="donate.html" class="w-full text-center py-2.5 text-xs font-semibold uppercase tracking-wider bg-[#C84B31] text-white rounded">
            Donate Food
          </a>
        </div>
      </div>
    `;

    attachNavbarEvents();
  }

  function attachNavbarEvents() {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const burgerIcon = document.getElementById('hamburger-icon');
    const closeIcon = document.getElementById('close-icon');

    if (toggleBtn && mobileMenu) {
      toggleBtn.onclick = function () {
        const isHidden = mobileMenu.classList.contains('hidden');
        if (isHidden) {
          mobileMenu.classList.remove('hidden');
          if (burgerIcon) burgerIcon.classList.add('hidden');
          if (closeIcon) closeIcon.classList.remove('hidden');
        } else {
          mobileMenu.classList.add('hidden');
          if (burgerIcon) burgerIcon.classList.remove('hidden');
          if (closeIcon) closeIcon.classList.add('hidden');
        }
      };
    }

    const handleReset = function () {
      const confirmReset = window.confirm(
        'Reset BhojVayasta Demo?\n\nThis will restore the 6 original sample listings in Delhi/NCR.'
      );

      if (confirmReset && global.BhojStore) {
        global.BhojStore.resetDemoData();
        BhojToast.success('Demo data restored! Sample listings re-seeded.');
        updateBadge();
        window.dispatchEvent(new CustomEvent('bhoj:datareload'));
      }
    };

    const deskResetBtn = document.getElementById('btn-reset-demo');
    if (deskResetBtn) deskResetBtn.onclick = handleReset;

    const mobileResetBtn = document.getElementById('mobile-btn-reset-demo');
    if (mobileResetBtn) mobileResetBtn.onclick = handleReset;
  }

  function updateBadge() {
    if (!global.BhojStore) return;
    try {
      const metrics = global.BhojStore.getImpactMetrics();
      const count = metrics.availablePickupsCount || 0;

      const badgeContainer = document.getElementById('nav-pickup-badge');
      if (badgeContainer) {
        const numSpan = badgeContainer.querySelector('.badge-num');
        if (numSpan) numSpan.textContent = count;
      }
    } catch (e) {
      console.warn('[BhojNav] Badge update error:', e);
    }
  }

  // ==========================================
  // Render Dynamic Footer (Warm Editorial System)
  // ==========================================
  function renderFooter() {
    const footerRoot = document.getElementById('footer-root');
    if (!footerRoot) return;

    footerRoot.innerHTML = `
      <footer class="border-t border-[#DCD9D0] bg-white text-[#141E18] mt-20 pt-16 pb-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div class="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-[#DCD9D0]">
            
            <!-- Col 1: Identity -->
            <div class="space-y-3 md:col-span-1">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 bg-[#1B4332] text-white flex items-center justify-center font-mono text-xs font-bold rounded">BV</div>
                <span class="font-display text-lg font-bold text-[#141E18]">BhojVayasta</span>
              </div>
              <p class="text-xs text-[#525B55] leading-relaxed">
                Connecting wedding banquets, office cafeterias, and grocery stores with nearby child care homes and community shelters across Delhi/NCR in support of Zero Hunger.
              </p>
            </div>

            <!-- Col 2: Navigation -->
            <div class="space-y-2 text-xs">
              <div class="font-mono uppercase font-bold text-[#525B55] tracking-wider mb-2">Quick Links</div>
              <div><a href="index.html" class="text-[#525B55] hover:text-[#C84B31]">Impact Dashboard</a></div>
              <div><a href="donate.html" class="text-[#525B55] hover:text-[#C84B31]">Donate Extra Food</a></div>
              <div><a href="volunteer.html" class="text-[#525B55] hover:text-[#C84B31]">Volunteer Pickup Map</a></div>
              <div><a href="javascript:void(0)" onclick="document.getElementById('btn-reset-demo')?.click()" class="text-[#B45309] hover:underline">Reset Demo Data</a></div>
            </div>

            <!-- Col 3: Food Safety & Hygiene -->
            <div class="space-y-2 text-xs">
              <div class="font-mono uppercase font-bold text-[#525B55] tracking-wider mb-2">Food Safety Standards</div>
              <p class="text-[#525B55] leading-relaxed">
                Hot meals are kept at safe temperatures (&gt;60°C) and sealed in clean food-grade packaging before being handed over to registered shelters.
              </p>
              <div class="font-mono text-[11px] text-[#1B4332] font-semibold">
                Protected by Good Samaritan Law
              </div>
            </div>

            <!-- Col 4: Helpline Desk -->
            <div class="space-y-2 text-xs">
              <div class="font-mono uppercase font-bold text-[#525B55] tracking-wider mb-2">Need Help?</div>
              <div class="p-3 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                <div class="font-mono text-[10px] text-[#525B55] uppercase">Toll-Free Helpline:</div>
                <div class="font-mono text-base font-bold text-[#141E18]">1800-BHOJ-RELIEF</div>
              </div>
              <div class="text-[11px] text-[#525B55]">
                Central Hub: Connaught Place, New Delhi 110001
              </div>
            </div>

          </div>

          <!-- Bottom Row -->
          <div class="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#525B55]">
            <div>
              &copy; 2026 BhojVayasta — Surplus Food Recovery & Relief Network.
            </div>
            <div class="font-mono text-[11px] text-[#525B55]">
              Active across Delhi, Noida, and Gurugram.
            </div>
          </div>

        </div>
      </footer>
    `;
  }

  function init() {
    renderNavbar();
    renderFooter();

    if (global.BhojStore && typeof global.BhojStore.subscribe === 'function') {
      global.BhojStore.subscribe(function () {
        updateBadge();
      });
    }

    window.addEventListener('storage', updateBadge);
    window.addEventListener('bhoj:datareload', updateBadge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
