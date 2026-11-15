/**
 * BhojVayasta - Mobile Courier PWA Registration & Connectivity Module
 * File: js/pwa.js
 *
 * Implements:
 * 1. Progressive Service Worker registration with 'serviceWorker' in navigator guard
 * 2. Real-time online/offline connectivity event listeners
 * 3. Mobile courier connection status notification banner
 */

(function (global) {
  'use strict';

  let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let offlineBannerElement = null;

  function createOfflineBanner() {
    if (typeof document === 'undefined') return null;
    let banner = document.getElementById('bhoj-offline-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'bhoj-offline-banner';
      banner.className = 'fixed top-0 left-0 right-0 z-[9999] bg-[#C84B31] text-white text-xs font-mono py-1.5 px-4 text-center shadow-md transform -translate-y-full transition-transform duration-300 flex items-center justify-center gap-2';
      banner.innerHTML = `
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-2.829-6.364m2.829 6.364L3 21m6.364-15.536a9 9 0 016.364-2.829m-6.364 2.829L3 3m8.464 5.464a5 5 0 014.243 1.414m-4.243-1.414L7.05 12.707"/>
        </svg>
        <span>Offline Mode: Operating with cached maps and local dispatch storage.</span>
      `;
      document.body.appendChild(banner);
    }
    return banner;
  }

  function updateConnectivityUI(onlineStatus) {
    isOnline = onlineStatus;
    if (typeof document === 'undefined') return;
    const banner = offlineBannerElement || createOfflineBanner();
    if (banner) {
      if (!isOnline) {
        banner.classList.remove('-translate-y-full');
      } else {
        banner.classList.add('-translate-y-full');
      }
    }
  }

  function setupConnectivityListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', function () {
      updateConnectivityUI(true);
      if (global.BhojToast) {
        global.BhojToast.success('Connection restored. Courier sync active.');
      }
    });

    window.addEventListener('offline', function () {
      updateConnectivityUI(false);
      if (global.BhojToast) {
        global.BhojToast.warning('Network connection lost. Offline caching engaged.');
      }
    });
  }

  function registerServiceWorker() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
          .then(function (registration) {
            // Service worker successfully registered
          })
          .catch(function (error) {
            console.warn('[PWA] ServiceWorker registration failed:', error);
          });
      });
    }
  }

  function initPwa() {
    setupConnectivityListeners();
    registerServiceWorker();
    if (typeof document !== 'undefined') {
      offlineBannerElement = createOfflineBanner();
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        updateConnectivityUI(false);
      }
    }
  }

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPwa);
    } else {
      initPwa();
    }
  }

  // Public PWA API
  const BhojPWA = {
    isOnline: function () {
      return isOnline;
    },
    registerServiceWorker,
    updateConnectivityUI
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BhojPWA;
  }
  global.BhojPWA = BhojPWA;

})(typeof window !== 'undefined' ? window : global);
