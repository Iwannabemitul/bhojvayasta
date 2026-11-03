/**
 * BhojVayasta - Shared Dynamic Navigation Header & Footer Component
 * File: js/navbar.js
 * 
 * Automatically renders:
 * - Responsive, sticky, glassmorphic top navigation bar into #navbar-root
 * - Live dynamic available pickup badge connected to BhojStore
 * - Mobile drawer navigation with smooth toggle
 * - Active page link highlighting
 * - Demo state reset trigger for viva evaluation
 * - Global Toast Notification System (window.BhojToast)
 * - Comprehensive community footer into #footer-root
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
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none';
        document.body.appendChild(container);
      }
      return container;
    },

    /**
     * Show a custom styled toast notification
     * @param {string} message - Message text
     * @param {'success'|'warning'|'error'|'info'} type
     * @param {number} duration - Milliseconds
     */
    show(message, type = 'info', duration = 3500) {
      const container = this.ensureContainer();

      const toast = document.createElement('div');
      toast.className = `toast-item glass-card flex items-start gap-3 p-4 rounded-xl shadow-xl pointer-events-auto transition-all duration-300 transform translate-y-4 opacity-0 border-l-4 ${
        type === 'success'
          ? 'border-emerald-500 bg-slate-900/95 text-slate-100'
          : type === 'warning'
          ? 'border-amber-500 bg-slate-900/95 text-slate-100'
          : type === 'error'
          ? 'border-rose-500 bg-slate-900/95 text-slate-100'
          : 'border-blue-500 bg-slate-900/95 text-slate-100'
      }`;

      // Icon determination
      let iconSvg = '';
      if (type === 'success') {
        iconSvg = `<svg class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
      } else if (type === 'warning') {
        iconSvg = `<svg class="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
      } else if (type === 'error') {
        iconSvg = `<svg class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
      } else {
        iconSvg = `<svg class="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
      }

      toast.innerHTML = `
        ${iconSvg}
        <div class="flex-1 text-sm font-medium leading-snug">${message}</div>
        <button type="button" class="text-slate-400 hover:text-white transition-colors" aria-label="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      `;

      const closeBtn = toast.querySelector('button');
      closeBtn.onclick = () => removeToast(toast);

      container.appendChild(toast);

      // Trigger animation frame
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
      });

      function removeToast(el) {
        el.classList.add('opacity-0', 'translate-x-4');
        setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 250);
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

  // ==========================================
  // Path & Page Detection
  // ==========================================
  function getCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('donate.html') || path.includes('/donate')) {
      return 'donate';
    }
    if (path.endsWith('volunteer.html') || path.includes('/volunteer')) {
      return 'volunteer';
    }
    // Default to index / impact dashboard
    return 'index';
  }

  // ==========================================
  // Navigation Markup Generation
  // ==========================================
  function renderNavbar() {
    const navRoot = document.getElementById('navbar-root');
    if (!navRoot) return;

    const currentPage = getCurrentPage();

    // Query active available count safely
    let availableCount = 0;
    if (global.BhojStore && typeof global.BhojStore.getImpactMetrics === 'function') {
      try {
        const metrics = global.BhojStore.getImpactMetrics();
        availableCount = metrics.availablePickupsCount || 0;
      } catch (e) {
        console.warn('[BhojNav] Failed to read metrics:', e);
      }
    }

    const badgeMarkup = `
      <span id="nav-pickup-badge" class="nav-pickup-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-wide ${
        availableCount > 0 
          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse' 
          : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
      }">
        <span class="w-1.5 h-1.5 rounded-full ${availableCount > 0 ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-400'}"></span>
        <span class="badge-num">${availableCount}</span>
        <span class="hidden sm:inline text-[10px] uppercase font-semibold">Live</span>
      </span>
    `;

    navRoot.innerHTML = `
      <header class="sticky top-0 z-40 w-full glass-nav border-b border-emerald-900/30 backdrop-blur-md bg-slate-950/85 transition-all duration-300">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-20">
            
            <!-- Brand Logo & Identity -->
            <a href="index.html" class="flex items-center gap-3.5 group text-decoration-none">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30 group-hover:scale-105 transition-transform duration-200">
                <!-- Bhoj Food Bowl & Radiant Spark SVG -->
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 14c0 3.866 4.03 7 9 7s9-3.134 9-7" />
                </svg>
              </div>
              <div class="flex flex-col">
                <div class="flex items-center gap-2">
                  <span class="text-xl sm:text-2xl font-black tracking-tight text-white font-sans">
                    Bhoj<span class="text-emerald-400">Vayasta</span>
                  </span>
                  <span class="hidden md:inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded">
                    Delhi/NCR Network
                  </span>
                </div>
                <span class="text-[11px] sm:text-xs text-slate-400 font-medium tracking-normal -mt-0.5 hidden xs:block">
                  Surplus Food Recovery & Hunger Relief
                </span>
              </div>
            </a>

            <!-- Desktop Navigation Links -->
            <nav class="hidden lg:flex items-center gap-1.5" aria-label="Main Navigation">
              
              <!-- 1. Impact & Overview -->
              <a href="index.html" class="nav-link px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                currentPage === 'index'
                  ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 shadow-inner'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }">
                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <span>Impact & Overview</span>
              </a>

              <!-- 2. Report Surplus Food -->
              <a href="donate.html" class="nav-link px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                currentPage === 'donate'
                  ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 shadow-inner'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }">
                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
                <span>Report Surplus Food</span>
              </a>

              <!-- 3. Live Courier Feed & Map -->
              <a href="volunteer.html" class="nav-link px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                currentPage === 'volunteer'
                  ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 shadow-inner'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <span>Live Courier Map</span>
                ${badgeMarkup}
              </a>

            </nav>

            <!-- Right Actions: Demo Reset + Donate CTA -->
            <div class="hidden md:flex items-center gap-3">
              <!-- Reset Demo Data Viva Button -->
              <button id="btn-reset-demo" type="button" title="Reset seed state for live demo evaluation" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 bg-slate-800/70 hover:bg-slate-700/80 hover:text-amber-300 border border-slate-700/60 transition-all duration-200 cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                <span>Reset Demo Data</span>
              </button>

              <!-- Primary Action CTA -->
              <a href="donate.html" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-900/30 hover:shadow-emerald-700/40 active:scale-95 transition-all duration-200">
                <span>Dispatch Food</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                </svg>
              </a>
            </div>

            <!-- Mobile Hamburger Toggle Button -->
            <div class="flex items-center gap-2 lg:hidden">
              <a href="volunteer.html" class="p-2 text-amber-400 relative" title="Available Pickups">
                <span class="sr-only">Live Feed</span>
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                </svg>
                ${availableCount > 0 ? `<span class="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900 animate-ping"></span>` : ''}
              </a>

              <button id="mobile-menu-toggle" type="button" aria-expanded="false" aria-label="Toggle Navigation Menu" class="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/50 transition-colors">
                <svg id="hamburger-icon" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
                <svg id="close-icon" class="w-6 h-6 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

          </div>
        </div>

        <!-- Mobile Drawer Navigation -->
        <div id="mobile-menu" class="hidden lg:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl px-4 pt-3 pb-6 transition-all duration-300">
          <div class="flex flex-col gap-2">
            
            <a href="index.html" class="flex items-center justify-between px-4 py-3 rounded-xl text-base font-semibold ${
              currentPage === 'index'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-300 hover:bg-slate-900'
            }">
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                <span>Impact & Overview</span>
              </div>
              <span class="text-xs text-slate-500 font-mono">Member 1</span>
            </a>

            <a href="donate.html" class="flex items-center justify-between px-4 py-3 rounded-xl text-base font-semibold ${
              currentPage === 'donate'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-300 hover:bg-slate-900'
            }">
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                <span>Report Surplus Food</span>
              </div>
              <span class="text-xs text-slate-500 font-mono">Member 2</span>
            </a>

            <a href="volunteer.html" class="flex items-center justify-between px-4 py-3 rounded-xl text-base font-semibold ${
              currentPage === 'volunteer'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-300 hover:bg-slate-900'
            }">
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                <span>Live Courier Map</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold font-mono ${availableCount > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-400'}">
                ${availableCount} Pickups
              </span>
            </a>

            <div class="pt-3 border-t border-slate-800/80 flex flex-col gap-2 mt-1">
              <button id="mobile-btn-reset-demo" type="button" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-700/60 hover:text-amber-300">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                <span>Reset Demo Seed Data (Viva Testing)</span>
              </button>

              <a href="donate.html" class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-900/40">
                <span>Dispatch Surplus Food</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </a>
            </div>

          </div>
        </div>
      </header>
    `;

    // Attach interaction handlers
    attachNavbarEvents();
  }

  // ==========================================
  // Attach Event Handlers (Menu, Reset Buttons)
  // ==========================================
  function attachNavbarEvents() {
    // Mobile Hamburger Toggle
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const burgerIcon = document.getElementById('hamburger-icon');
    const closeIcon = document.getElementById('close-icon');

    if (toggleBtn && mobileMenu) {
      toggleBtn.onclick = function () {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !isExpanded);
        mobileMenu.classList.toggle('hidden');
        if (burgerIcon && closeIcon) {
          burgerIcon.classList.toggle('hidden');
          closeIcon.classList.toggle('hidden');
        }
      };
    }

    // Reset Demo Data Handlers (both desktop & mobile buttons)
    const handleReset = function () {
      const confirmReset = window.confirm(
        'BhojVayasta State Reset:\n\nDo you want to re-seed demo data with the 6 baseline Delhi/NCR listings?\n(This clears test dispatches and sets up the live demo state).'
      );

      if (confirmReset && global.BhojStore) {
        global.BhojStore.resetDemoData();
        BhojToast.success('Demo data restored! Delhi/NCR listings re-seeded.');
        updateBadge();

        // If on volunteer or index, dispatch custom event so view reloads without hard refresh
        window.dispatchEvent(new CustomEvent('bhoj:datareload'));
      }
    };

    const deskResetBtn = document.getElementById('btn-reset-demo');
    if (deskResetBtn) deskResetBtn.onclick = handleReset;

    const mobileResetBtn = document.getElementById('mobile-btn-reset-demo');
    if (mobileResetBtn) mobileResetBtn.onclick = handleReset;
  }

  // ==========================================
  // Dynamic Badge Updater
  // ==========================================
  function updateBadge() {
    if (!global.BhojStore) return;
    try {
      const metrics = global.BhojStore.getImpactMetrics();
      const count = metrics.availablePickupsCount || 0;

      // Update badge elements
      const badgeContainer = document.getElementById('nav-pickup-badge');
      if (badgeContainer) {
        const numSpan = badgeContainer.querySelector('.badge-num');
        if (numSpan) numSpan.textContent = count;

        if (count > 0) {
          badgeContainer.className =
            'nav-pickup-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse';
        } else {
          badgeContainer.className =
            'nav-pickup-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-wide bg-slate-700/50 text-slate-400 border border-slate-600/30';
        }
      }
    } catch (e) {
      console.warn('[BhojNav] Badge update error:', e);
    }
  }

  // ==========================================
  // Footer Markup Injection
  // ==========================================
  function renderFooter() {
    const footerRoot = document.getElementById('footer-root');
    if (!footerRoot) return;

    footerRoot.innerHTML = `
      <footer class="bg-slate-950 border-t border-slate-800/80 text-slate-300 mt-20 pt-16 pb-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-slate-800">
            
            <!-- Col 1: Brand & Purpose -->
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-md">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <span class="text-xl font-black text-white font-sans">
                  Bhoj<span class="text-emerald-400">Vayasta</span>
                </span>
              </div>
              <p class="text-sm text-slate-400 leading-relaxed">
                A community-driven hyper-local surplus food recovery platform. Connecting commercial dining halls, banquets, and retailers with nearby hunger relief shelters across Delhi/NCR.
              </p>
              <div class="flex items-center gap-2 pt-2">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Zero Hunger Network (SDG 2)
                </span>
              </div>
            </div>

            <!-- Col 2: Navigation Links -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">Platform Navigation</h4>
              <ul class="space-y-2 text-sm">
                <li>
                  <a href="index.html" class="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2">
                    <span class="text-emerald-500">›</span> Impact & Statistics Dashboard
                  </a>
                </li>
                <li>
                  <a href="donate.html" class="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2">
                    <span class="text-emerald-500">›</span> Dispatch Surplus Food (Donors)
                  </a>
                </li>
                <li>
                  <a href="volunteer.html" class="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2">
                    <span class="text-emerald-500">›</span> Live Courier Map & Pickups
                  </a>
                </li>
                <li>
                  <a href="javascript:void(0)" onclick="document.getElementById('btn-reset-demo')?.click()" class="text-amber-400/90 hover:text-amber-300 transition-colors flex items-center gap-2">
                    <span class="text-amber-400">↻</span> Re-seed Demo State (Viva Tool)
                  </a>
                </li>
              </ul>
            </div>

            <!-- Col 3: Food Safety & Hygiene Protocol -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">Safety & Hygiene Protocol</h4>
              <ul class="space-y-2 text-xs text-slate-400 leading-relaxed">
                <li class="flex items-start gap-2">
                  <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                  <span><strong>FSSAI Guidelines:</strong> Hot cooked food maintained &gt;65°C, dispatched within 4 hrs of cooking.</span>
                </li>
                <li class="flex items-start gap-2">
                  <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                  <span><strong>Sanitary Packaging:</strong> Sealed, food-grade biodegradable containers and insulated urns.</span>
                </li>
                <li class="flex items-start gap-2">
                  <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                  <span><strong>Direct Handover:</strong> Verified shelter coordinates & phone-authenticated drop-offs.</span>
                </li>
              </ul>
            </div>

            <!-- Col 4: Rapid Emergency Helpline -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">Relief Emergency Hub</h4>
              <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div class="text-xs text-slate-400 font-medium">Toll-Free Delhi/NCR Relief Desk:</div>
                <div class="text-lg font-black text-amber-400 font-mono tracking-wider">1800-BHOJ-RELIEF</div>
                <div class="text-[11px] text-slate-400">Available 24/7 for large commercial bulk surplus &gt; 500 meals.</div>
              </div>
              <div class="text-xs text-slate-400">
                Operating Hub: Connaught Place, New Delhi 110001
              </div>
            </div>

          </div>

          <!-- Bottom Bar -->
          <div class="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <div>
              &copy; 2026 BhojVayasta Community Food Network. Released for Educational & Community Demonstration.
            </div>
            <div class="flex items-center gap-4">
              <span class="inline-flex items-center gap-1.5 text-slate-400">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                Local NCR Node Active
              </span>
              <span>•</span>
              <a href="https://github.com" target="_blank" rel="noopener" class="hover:text-slate-200 transition-colors">
                Documentation & Architecture
              </a>
            </div>
          </div>

        </div>
      </footer>
    `;
  }

  // ==========================================
  // Initialization & Store Subscription
  // ==========================================
  function init() {
    renderNavbar();
    renderFooter();

    // Listen to BhojStore mutations for real-time badge updates
    if (global.BhojStore && typeof global.BhojStore.subscribe === 'function') {
      global.BhojStore.subscribe(function (event) {
        updateBadge();
      });
    }

    // Window storage listener in case of fallback
    window.addEventListener('storage', function () {
      updateBadge();
    });

    // Custom data reload listener
    window.addEventListener('bhoj:datareload', function () {
      updateBadge();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
