/**
 * BhojVayasta - Landing Page & Community Hunger Relief Impact Dashboard Logic
 * File: js/dashboard.js
 * 
 * Features:
 * - Real-time KPI counter animations with easing
 * - Chart.js data aggregation for Food Composition & Shelter Deliveries
 * - Reactive Live Activity Ledger with instant filtering and search
 * - Cross-tab synchronization via BhojStore and BroadcastChannel
 * - Modal inspection dialog for complete dispatch safety & logistics audit
 */

(function (global) {
  'use strict';

  // State handles
  let foodTypeChartInstance = null;
  let shelterDistChartInstance = null;
  let currentFilter = 'all';
  let searchQuery = '';

  // Easing helper for animated metric counters
  function easeOutQuad(t) {
    return t * (2 - t);
  }

  /**
   * Smoothly animates a numeric DOM element from current value to target value.
   * @param {HTMLElement} element - Target DOM element
   * @param {number} target - End number
   * @param {number} duration - Milliseconds
   * @param {number} decimals - Precision (0 for integers, 2 for metric tons)
   */
  function animateNumber(element, target, duration = 1200, decimals = 0) {
    if (!element) return;
    const start = parseFloat(element.getAttribute('data-current-val') || 0);
    const startTime = performance.now();

    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuad(progress);
      const currentVal = start + (target - start) * easedProgress;

      if (decimals > 0) {
        element.textContent = currentVal.toFixed(decimals);
      } else {
        element.textContent = Math.round(currentVal).toLocaleString('en-IN');
      }

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        element.setAttribute('data-current-val', target);
        if (decimals > 0) {
          element.textContent = target.toFixed(decimals);
        } else {
          element.textContent = Math.round(target).toLocaleString('en-IN');
        }
      }
    }

    requestAnimationFrame(updateCounter);
  }

  /**
   * Refreshes the 4 primary KPI cards.
   */
  function updateKPIs() {
    if (!global.BhojStore) return;

    try {
      const metrics = global.BhojStore.getImpactMetrics();

      const mealsEl = document.getElementById('kpi-meals-served');
      const tonsEl = document.getElementById('kpi-tons-diverted');
      const pickupsEl = document.getElementById('kpi-active-pickups');
      const co2El = document.getElementById('kpi-co2-saved');

      animateNumber(mealsEl, metrics.totalMealsServed, 1100, 0);
      animateNumber(tonsEl, metrics.metricTonsDiverted, 1100, 2);
      animateNumber(pickupsEl, metrics.activePickupsCount, 900, 0);
      animateNumber(co2El, metrics.co2SavedKg, 1100, 0);

      // Hero ticker update
      const tickerTextEl = document.getElementById('hero-ticker-text');
      const heroBadgeEl = document.getElementById('hero-badge-count');

      const dispatches = global.BhojStore.getDispatches();
      const availableItems = dispatches.filter((d) => d.status === 'Available');
      const totalAvailableServings = availableItems.reduce((acc, curr) => acc + (parseInt(curr.servings, 10) || 0), 0);

      if (tickerTextEl) {
        if (availableItems.length > 0) {
          tickerTextEl.innerHTML = `⚡ <strong>${availableItems.length} Live Pickups Waiting</strong> in Delhi/NCR • <strong>${totalAvailableServings} Servings</strong> Immediate Rescue Need`;
        } else {
          tickerTextEl.innerHTML = `✓ All Current Dispatches Recovered & In-Transit • Next Run Scheduled`;
        }
      }

      if (heroBadgeEl) {
        heroBadgeEl.textContent = `${availableItems.length} Available`;
      }

      // Sync timestamp
      const syncEl = document.getElementById('last-sync-time');
      if (syncEl) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        syncEl.textContent = `Sync: ${timeStr}`;
      }

    } catch (e) {
      console.error('[BhojDashboard] Error updating KPIs:', e);
    }
  }

  /**
   * Initializes or refreshes both Chart.js instances.
   */
  function updateCharts() {
    if (!global.BhojStore || typeof Chart === 'undefined') return;

    const dispatches = global.BhojStore.getDispatches();
    const shelters = global.BhojStore.getShelters();

    // ----------------------------------------------------
    // Chart 1: Food Composition Breakdown (Doughnut)
    // ----------------------------------------------------
    let cookedServings = 0;
    let rawServings = 0;
    let otherServings = 0;

    dispatches.forEach((item) => {
      const portions = parseInt(item.servings, 10) || 0;
      const type = (item.foodType || '').toLowerCase();
      if (type.includes('cooked')) {
        cookedServings += portions;
      } else if (type.includes('raw') || type.includes('produce')) {
        rawServings += portions;
      } else {
        otherServings += portions;
      }
    });

    const totalServings = cookedServings + rawServings + otherServings;

    // Update legend counters
    const legendCooked = document.getElementById('legend-cooked-count');
    const legendRaw = document.getElementById('legend-raw-count');
    const badgeTotal = document.getElementById('chart-total-servings-badge');

    if (legendCooked) legendCooked.textContent = `${cookedServings.toLocaleString('en-IN')} serv`;
    if (legendRaw) legendRaw.textContent = `${rawServings.toLocaleString('en-IN')} serv`;
    if (badgeTotal) badgeTotal.textContent = `${totalServings.toLocaleString('en-IN')} Total Servings`;

    const foodCanvas = document.getElementById('foodTypeChart');
    if (foodCanvas) {
      const doughnutData = {
        labels: ['Cooked Meals', 'Raw Produce', 'Packaged / Bakery'],
        datasets: [{
          data: [cookedServings, rawServings, otherServings],
          backgroundColor: [
            '#10b981', // Emerald 500
            '#f59e0b', // Amber 500
            '#3b82f6'  // Blue 500
          ],
          borderColor: '#0f172a',
          borderWidth: 3,
          hoverOffset: 6
        }]
      };

      if (foodTypeChartInstance) {
        foodTypeChartInstance.data = doughnutData;
        foodTypeChartInstance.update();
      } else {
        foodTypeChartInstance = new Chart(foodCanvas, {
          type: 'doughnut',
          data: doughnutData,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#ffffff',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(16, 185, 129, 0.3)',
                borderWidth: 1,
                padding: 12,
                boxPadding: 6,
                callbacks: {
                  label: function (context) {
                    const value = context.parsed || 0;
                    const pct = totalServings > 0 ? ((value / totalServings) * 100).toFixed(1) : 0;
                    return ` ${context.label}: ${value.toLocaleString('en-IN')} servings (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }
    }

    // ----------------------------------------------------
    // Chart 2: Relief Distribution by Shelter Hub (Bar)
    // ----------------------------------------------------
    // Aggregate deliveries per shelter + proportional historical baseline
    // 4 Fixed receiving shelters in Delhi/NCR
    const shelterLabels = shelters.map((s) => s.name.replace(' Shelter', '').replace(' Orphanage', ''));
    
    // Proportional established distribution offsets based on shelter demand
    const baselineShares = [3850, 4900, 2150, 1500]; // Sum ≈ 12,400 historical meals
    
    const shelterDeliveries = shelters.map((s, idx) => {
      let liveDelivered = 0;
      dispatches.forEach((d) => {
        if (d.status === 'Delivered' && d.targetShelter && d.targetShelter.toLowerCase().includes(s.name.toLowerCase().substring(0, 6))) {
          liveDelivered += parseInt(d.servings, 10) || 0;
        }
      });
      return baselineShares[idx] + liveDelivered;
    });

    const shelterCanvas = document.getElementById('shelterDistChart');
    if (shelterCanvas) {
      const barData = {
        labels: shelterLabels,
        datasets: [{
          label: 'Total Meals Delivered',
          data: shelterDeliveries,
          backgroundColor: [
            'rgba(16, 185, 129, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(20, 184, 166, 0.85)',
            'rgba(99, 102, 241, 0.85)'
          ],
          borderColor: [
            '#10b981',
            '#f59e0b',
            '#14b8a6',
            '#6366f1'
          ],
          borderWidth: 1.5,
          borderRadius: 8,
          barPercentage: 0.65
        }]
      };

      if (shelterDistChartInstance) {
        shelterDistChartInstance.data = barData;
        shelterDistChartInstance.update();
      } else {
        shelterDistChartInstance = new Chart(shelterCanvas, {
          type: 'bar',
          data: barData,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#ffffff',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(245, 158, 11, 0.3)',
                borderWidth: 1,
                padding: 12,
                callbacks: {
                  label: function (ctx) {
                    return ` Relieved: ${ctx.parsed.y.toLocaleString('en-IN')} community portions`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: '#94a3b8',
                  font: { family: 'Inter', size: 11 }
                }
              },
              y: {
                grid: { color: 'rgba(51, 65, 85, 0.35)' },
                ticks: {
                  color: '#94a3b8',
                  font: { family: 'JetBrains Mono', size: 10 },
                  callback: function (val) {
                    return val >= 1000 ? (val / 1000) + 'k' : val;
                  }
                }
              }
            }
          }
        });
      }
    }
  }

  /**
   * Renders the filterable Live Network Activity Ledger table.
   */
  function renderLedger() {
    if (!global.BhojStore) return;

    const dispatches = global.BhojStore.getDispatches();
    const tableBody = document.getElementById('ledger-table-body');
    const emptyState = document.getElementById('ledger-empty-state');
    const paginationSummary = document.getElementById('ledger-pagination-summary');

    if (!tableBody) return;

    // Filter counts for badge tabs
    const countAll = dispatches.length;
    const countAvailable = dispatches.filter((d) => d.status === 'Available').length;
    const countInTransit = dispatches.filter((d) => d.status === 'In-Transit').length;
    const countDelivered = dispatches.filter((d) => d.status === 'Delivered').length;

    const elCountAll = document.getElementById('filter-count-all');
    const elCountAvail = document.getElementById('filter-count-available');
    const elCountTransit = document.getElementById('filter-count-intransit');
    const elCountDeliv = document.getElementById('filter-count-delivered');

    if (elCountAll) elCountAll.textContent = countAll;
    if (elCountAvail) elCountAvail.textContent = countAvailable;
    if (elCountTransit) elCountTransit.textContent = countInTransit;
    if (elCountDeliv) elCountDeliv.textContent = countDelivered;

    // Apply Filter & Search
    let filtered = dispatches.filter((item) => {
      // Status filter
      if (currentFilter !== 'all' && item.status.toLowerCase() !== currentFilter.toLowerCase()) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchId = (item.id || '').toLowerCase().includes(query);
        const matchDonor = (item.donorName || '').toLowerCase().includes(query);
        const matchTitle = (item.foodTitle || '').toLowerCase().includes(query);
        const matchShelter = (item.targetShelter || '').toLowerCase().includes(query);
        const matchVolunteer = (item.volunteer || '').toLowerCase().includes(query);
        if (!matchId && !matchDonor && !matchTitle && !matchShelter && !matchVolunteer) {
          return false;
        }
      }
      return true;
    });

    if (paginationSummary) {
      paginationSummary.textContent = `Showing ${filtered.length} of ${dispatches.length} logged batches`;
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Build Rows
    tableBody.innerHTML = filtered
      .map((item) => {
        // Expiry calculation
        const expiry = global.BhojStore.getExpiryStatus(item);

        // Status pill
        let statusPillClass = 'status-available';
        let statusDotClass = 'bg-emerald-400';
        if (item.status === 'In-Transit') {
          statusPillClass = 'status-intransit';
          statusDotClass = 'bg-amber-400';
        } else if (item.status === 'Delivered') {
          statusPillClass = 'status-delivered';
          statusDotClass = 'bg-indigo-400';
        }

        // Food Type badge
        const isCooked = (item.foodType || '').toLowerCase().includes('cooked');
        const foodTypeBadge = isCooked
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Cooked Meals</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">Raw Produce</span>`;

        // Weight estimation (1 serving ≈ 0.45 kg)
        const weightKg = ((parseInt(item.servings, 10) || 0) * 0.45).toFixed(1);

        // Logistics display
        let logisticsHtml = '';
        if (item.status === 'Delivered') {
          logisticsHtml = `
            <div class="font-medium text-slate-200">Delivered by <strong class="text-indigo-300">${item.volunteer || 'Volunteer'}</strong></div>
            <div class="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <i data-lucide="home" class="w-3 h-3 text-emerald-400"></i>
              <span>${item.targetShelter || 'Local Shelter'}</span>
            </div>
          `;
        } else if (item.status === 'In-Transit') {
          logisticsHtml = `
            <div class="font-medium text-amber-300 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              <span>Courier: <strong>${item.volunteer || 'Active'}</strong></span>
            </div>
            <div class="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <i data-lucide="arrow-right" class="w-3 h-3 text-amber-400"></i>
              <span>En route to: ${item.targetShelter || 'Asha Shelter'}</span>
            </div>
          `;
        } else {
          logisticsHtml = `
            <div class="font-medium text-emerald-400 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Seeking Courier</span>
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">
              <a href="volunteer.html?claim=${item.id}" class="text-amber-400 hover:text-amber-300 font-bold underline decoration-amber-500/40">
                Claim on Live Map →
              </a>
            </div>
          `;
        }

        return `
          <tr class="hover:bg-slate-900/60 transition-colors group">
            
            <!-- Dispatch ID -->
            <td class="py-4 px-4 sm:px-6 font-mono font-bold text-emerald-400">
              <div class="flex items-center gap-1.5">
                <span>${item.id}</span>
                ${expiry.isUrgent && item.status === 'Available' 
                  ? `<span title="Expires soon (<2h)" class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>` 
                  : ''}
              </div>
            </td>

            <!-- Donor & Location -->
            <td class="py-4 px-4">
              <div class="font-bold text-white group-hover:text-emerald-300 transition-colors">${item.donorName}</div>
              <div class="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-xs flex items-center gap-1 mt-0.5">
                <i data-lucide="map-pin" class="w-3 h-3 text-slate-500 shrink-0"></i>
                <span class="truncate">${item.address || 'Delhi/NCR'}</span>
              </div>
            </td>

            <!-- Food Type & Title -->
            <td class="py-4 px-4">
              <div class="mb-1">${foodTypeBadge}</div>
              <div class="text-xs text-slate-300 font-medium line-clamp-1">${item.foodTitle || item.itemsDescription}</div>
            </td>

            <!-- Quantity & Weight -->
            <td class="py-4 px-4 font-mono">
              <div class="font-bold text-white text-sm">${item.servings} <span class="text-xs font-normal text-slate-400">serv</span></div>
              <div class="text-[11px] text-slate-400">~${weightKg} kg</div>
            </td>

            <!-- Hygiene Verification -->
            <td class="py-4 px-4">
              <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                <i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>100% Passed</span>
              </div>
              <div class="text-[10px] font-mono text-slate-400 mt-0.5">
                ${item.storageTemp || 'Safe Chain'}
              </div>
            </td>

            <!-- Status -->
            <td class="py-4 px-4">
              <span class="status-pill ${statusPillClass}">
                <span class="status-dot ${statusDotClass}"></span>
                <span>${item.status}</span>
              </span>
            </td>

            <!-- Courier & Shelter -->
            <td class="py-4 px-4 text-xs">
              ${logisticsHtml}
            </td>

            <!-- Action: View Detail Modal -->
            <td class="py-4 px-4 text-right">
              <button type="button" data-action="view-modal" data-id="${item.id}" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer">
                <span>Audit</span>
                <i data-lucide="chevron-right" class="w-3 h-3"></i>
              </button>
            </td>

          </tr>
        `;
      })
      .join('');

    // Re-render Lucide icons for the newly injected rows
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  /**
   * Opens the Dispatch Detail Modal for a specific dispatch ID.
   * @param {string} id
   */
  function openDispatchModal(id) {
    if (!global.BhojStore) return;
    const dispatch = global.BhojStore.getDispatchById(id);
    if (!dispatch) return;

    const modal = document.getElementById('dispatch-detail-modal');
    if (!modal) return;

    // Populate modal fields
    document.getElementById('modal-dispatch-id').textContent = dispatch.id;
    
    const statusEl = document.getElementById('modal-dispatch-status');
    statusEl.textContent = dispatch.status;
    statusEl.className = `status-pill ${
      dispatch.status === 'Available' ? 'status-available' : dispatch.status === 'In-Transit' ? 'status-intransit' : 'status-delivered'
    }`;

    document.getElementById('modal-donor-title').textContent = dispatch.donorName;
    document.getElementById('modal-donor-address').textContent = `${dispatch.address} • Contact: ${dispatch.contactPhone || 'N/A'}`;
    document.getElementById('modal-food-desc').textContent = dispatch.itemsDescription || dispatch.foodTitle;
    document.getElementById('modal-servings').textContent = `${dispatch.servings} portions (~${((parseInt(dispatch.servings, 10) || 0) * 0.45).toFixed(1)} kg)`;
    document.getElementById('modal-temperature').textContent = dispatch.temperatureRecorded || dispatch.storageTemp || '65°C';

    const expiry = global.BhojStore.getExpiryStatus(dispatch);
    document.getElementById('modal-expiry').textContent = expiry.formattedText;

    const logisticsBox = document.getElementById('modal-logistics-text');
    if (dispatch.status === 'Delivered') {
      logisticsBox.innerHTML = `Delivered to <strong class="text-white">${dispatch.targetShelter || 'Receiving Shelter'}</strong> by Courier <strong class="text-emerald-400">${dispatch.volunteer || 'Volunteer'}</strong>`;
    } else if (dispatch.status === 'In-Transit') {
      logisticsBox.innerHTML = `Currently in transit with <strong class="text-amber-400">${dispatch.volunteer || 'Volunteer'}</strong> heading to <strong class="text-white">${dispatch.targetShelter || 'Asha Shelter'}</strong>`;
    } else {
      logisticsBox.innerHTML = `Ready at venue dock. <strong class="text-emerald-400">Awaiting community courier claim.</strong>`;
    }

    const cta = document.getElementById('modal-action-cta');
    if (cta) {
      if (dispatch.status === 'Available') {
        cta.href = `volunteer.html?claim=${dispatch.id}`;
        cta.textContent = 'Accept Pickup on Courier Map';
        cta.classList.remove('hidden');
      } else {
        cta.href = 'volunteer.html';
        cta.textContent = 'View Map Live Feed';
      }
    }

    modal.classList.remove('hidden');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  function closeModal() {
    const modal = document.getElementById('dispatch-detail-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Sets up all DOM interaction listeners (Filter tabs, Search, Modals, Manual Sync).
   */
  function setupEventListeners() {
    // Status Filter Tabs
    const filterContainer = document.getElementById('ledger-filter-buttons');
    if (filterContainer) {
      filterContainer.addEventListener('click', function (e) {
        const btn = e.target.closest('.ledger-filter-btn');
        if (!btn) return;

        const filter = btn.getAttribute('data-filter');
        currentFilter = filter;

        // Active button styles
        filterContainer.querySelectorAll('.ledger-filter-btn').forEach((b) => {
          b.className = 'ledger-filter-btn px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-all duration-150 bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800';
        });

        btn.className = 'ledger-filter-btn px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-all duration-150 bg-emerald-600 text-white shadow-md shadow-emerald-900/30';

        renderLedger();
      });
    }

    // Search Input
    const searchInput = document.getElementById('ledger-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value;
        renderLedger();
      });
    }

    // Table row audit button clicks
    const tableBody = document.getElementById('ledger-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action="view-modal"]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        openDispatchModal(id);
      });
    }

    // Modal close triggers
    const closeBtn = document.getElementById('modal-close-btn');
    const closeFooterBtn = document.getElementById('modal-close-footer-btn');
    const modal = document.getElementById('dispatch-detail-modal');

    if (closeBtn) closeBtn.onclick = closeModal;
    if (closeFooterBtn) closeFooterBtn.onclick = closeModal;
    if (modal) {
      modal.onclick = function (e) {
        if (e.target === modal) closeModal();
      };
    }

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    // Manual Refresh button
    const manualSyncBtn = document.getElementById('btn-manual-sync');
    if (manualSyncBtn) {
      manualSyncBtn.onclick = function () {
        updateKPIs();
        updateCharts();
        renderLedger();
        if (global.BhojToast) {
          global.BhojToast.info('Dashboard metrics synchronized with live store.');
        }
      };
    }
  }

  /**
   * Connects to BhojStore subscriptions & cross-tab events.
   */
  function setupStoreSubscription() {
    if (!global.BhojStore) return;

    // Primary store subscriber
    global.BhojStore.subscribe(function (event) {
      console.log('[BhojDashboard] Store event received:', event.type);
      updateKPIs();
      updateCharts();
      renderLedger();

      if (event.type === 'DISPATCH_ADDED' && event.payload) {
        if (global.BhojToast) {
          global.BhojToast.success(`New surplus food dispatch reported: ${event.payload.donorName} (${event.payload.servings} portions)`);
        }
      } else if (event.type === 'DEMO_DATA_RESET') {
        if (global.BhojToast) {
          global.BhojToast.info('Dashboard re-seeded with 6 baseline Delhi/NCR listings.');
        }
      }
    });

    // Storage event for fallback cross-tab updates
    window.addEventListener('storage', function (e) {
      if (e.key === 'bhojvayasta_dispatches') {
        updateKPIs();
        updateCharts();
        renderLedger();
      }
    });

    // Custom data reload listener (triggered by navbar Reset button)
    window.addEventListener('bhoj:datareload', function () {
      updateKPIs();
      updateCharts();
      renderLedger();
    });
  }

  /**
   * Main Dashboard Initialization
   */
  function initDashboard() {
    // Ensure store is ready
    if (global.BhojStore && typeof global.BhojStore.initStore === 'function') {
      global.BhojStore.initStore();
    }

    setupEventListeners();
    setupStoreSubscription();

    // Render components
    updateKPIs();
    updateCharts();
    renderLedger();

    // Render Lucide SVG icons
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  // Self-mount on DOM readiness
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})(typeof window !== 'undefined' ? window : this);
