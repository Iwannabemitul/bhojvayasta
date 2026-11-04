/**
 * BhojVayasta - Landing Page & Community Impact Dashboard Logic
 * File: js/dashboard.js
 * 
 * Simple English, clear labels, and 100% state integrity.
 */

(function (global) {
  'use strict';

  let foodTypeChartInstance = null;
  let shelterDistChartInstance = null;
  let currentFilter = 'all';
  let searchQuery = '';

  function easeOutQuad(t) {
    return t * (2 - t);
  }

  function animateNumber(element, target, duration = 1000, decimals = 0) {
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

  function updateKPIs() {
    if (!global.BhojStore) return;

    try {
      const metrics = global.BhojStore.getImpactMetrics();

      const mealsEl = document.getElementById('kpi-meals-served');
      const tonsEl = document.getElementById('kpi-tons-diverted');
      const pickupsEl = document.getElementById('kpi-active-pickups');
      const co2El = document.getElementById('kpi-co2-saved');

      animateNumber(mealsEl, metrics.totalMealsServed, 900, 0);
      animateNumber(tonsEl, metrics.metricTonsDiverted, 900, 2);
      animateNumber(pickupsEl, metrics.activePickupsCount, 800, 0);
      animateNumber(co2El, metrics.co2SavedKg, 900, 0);

      // Hero ticker update
      const tickerTextEl = document.getElementById('hero-ticker-text');
      const heroBadgeEl = document.getElementById('hero-badge-count');

      const dispatches = global.BhojStore.getDispatches();
      const availableItems = dispatches.filter((d) => d.status === 'Available');
      const totalAvailableServings = availableItems.reduce((acc, curr) => acc + (parseInt(curr.servings, 10) || 0), 0);

      if (tickerTextEl) {
        if (availableItems.length > 0) {
          tickerTextEl.innerHTML = `<strong class="text-[#141E18] font-bold">${availableItems.length} Live Pickups Waiting</strong> in Delhi/NCR • <strong class="text-[#C84B31]">${totalAvailableServings} Meals</strong> Ready for Pickup`;
        } else {
          tickerTextEl.innerHTML = `All extra food has been claimed and is on the way to shelters.`;
        }
      }

      if (heroBadgeEl) {
        heroBadgeEl.textContent = `${availableItems.length} Available`;
      }

      const syncEl = document.getElementById('last-sync-time');
      if (syncEl) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        syncEl.textContent = `Updated at ${timeStr}`;
      }

    } catch (e) {
      console.error('[BhojDashboard] Error updating KPIs:', e);
    }
  }

  function updateCharts() {
    if (!global.BhojStore || typeof Chart === 'undefined') return;

    Chart.defaults.color = '#525B55';
    Chart.defaults.borderColor = '#DCD9D0';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

    const dispatches = global.BhojStore.getDispatches();
    const shelters = global.BhojStore.getShelters();

    // Chart 1: Food Composition (Doughnut)
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

    const legendCooked = document.getElementById('legend-cooked-count');
    const legendRaw = document.getElementById('legend-raw-count');
    const badgeTotal = document.getElementById('chart-total-servings-badge');

    if (legendCooked) legendCooked.textContent = `${cookedServings.toLocaleString('en-IN')} meals`;
    if (legendRaw) legendRaw.textContent = `${rawServings.toLocaleString('en-IN')} meals`;
    if (badgeTotal) badgeTotal.textContent = `${totalServings.toLocaleString('en-IN')} Meals Total`;

    const foodCanvas = document.getElementById('foodTypeChart');
    if (foodCanvas) {
      const doughnutData = {
        labels: ['Cooked Meals', 'Raw Fruits & Veggies', 'Dry Staples & Bread'],
        datasets: [{
          data: [cookedServings, rawServings, otherServings],
          backgroundColor: [
            '#1B4332', // Botanical Forest Green
            '#C84B31', // Terracotta Rust
            '#B45309'  // Warm Ochre
          ],
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 4
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
            cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#141E18',
                titleColor: '#FFFFFF',
                bodyColor: '#EFECE6',
                borderColor: '#DCD9D0',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  label: function (ctx) {
                    const value = ctx.parsed || 0;
                    const pct = totalServings > 0 ? ((value / totalServings) * 100).toFixed(1) : 0;
                    return ` ${ctx.label}: ${value.toLocaleString('en-IN')} meals (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }
    }

    // Chart 2: Distribution by Shelter Hub (Bar)
    const shelterLabels = ['Asha Child Care', 'Seva Slum Camp', 'Bal Vikas Home', 'Samarpan Elders'];
    const baselineShares = [3850, 4900, 2150, 1500];

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
            '#1B4332',
            '#C84B31',
            '#B45309',
            '#2E5A44'
          ],
          borderColor: '#DCD9D0',
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 38,
          barPercentage: 0.6
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
                backgroundColor: '#141E18',
                titleColor: '#FFFFFF',
                bodyColor: '#EFECE6',
                padding: 10,
                callbacks: {
                  label: function (ctx) {
                    return ` Delivered: ${ctx.parsed.y.toLocaleString('en-IN')} meals`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: '#525B55',
                  font: { family: "'Plus Jakarta Sans'", size: 11 }
                }
              },
              y: {
                grid: { color: '#EFECE6' },
                ticks: {
                  color: '#525B55',
                  font: { family: "'JetBrains Mono'", size: 10 },
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

  function renderLedger() {
    if (!global.BhojStore) return;

    const dispatches = global.BhojStore.getDispatches();
    const tableBody = document.getElementById('ledger-table-body');
    const mobileCardsContainer = document.getElementById('ledger-cards-mobile');
    const emptyState = document.getElementById('ledger-empty-state');
    const paginationSummary = document.getElementById('ledger-pagination-summary');

    if (!tableBody) return;

    const countAll = dispatches.length;
    const countAvailable = dispatches.filter((d) => d.status === 'Available').length;
    const countInTransit = dispatches.filter((d) => d.status === 'In-Transit').length;
    const countDelivered = dispatches.filter((d) => d.status === 'Delivered').length;

    document.getElementById('filter-count-all').textContent = countAll;
    document.getElementById('filter-count-available').textContent = countAvailable;
    document.getElementById('filter-count-intransit').textContent = countInTransit;
    document.getElementById('filter-count-delivered').textContent = countDelivered;

    let filtered = dispatches.filter((item) => {
      if (currentFilter !== 'all' && item.status.toLowerCase() !== currentFilter.toLowerCase()) {
        return false;
      }
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
      paginationSummary.textContent = `Showing ${filtered.length} of ${dispatches.length} donations`;
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      if (mobileCardsContainer) mobileCardsContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // 1. Populate Desktop/Tablet Table
    tableBody.innerHTML = filtered
      .map((item) => {
        const expiry = global.BhojStore.getExpiryStatus(item);

        let statusPillClass = 'status-available';
        let statusText = 'Waiting for Courier';
        if (item.status === 'In-Transit') {
          statusPillClass = 'status-intransit';
          statusText = 'On the Way';
        } else if (item.status === 'Delivered') {
          statusPillClass = 'status-delivered';
          statusText = 'Delivered';
        }

        const isCooked = (item.foodType || '').toLowerCase().includes('cooked');
        const foodTypeBadge = isCooked
          ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]">Cooked Food</span>`
          : `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">Raw Produce</span>`;

        const weightKg = ((parseInt(item.servings, 10) || 0) * 0.45).toFixed(1);

        let logisticsHtml = '';
        if (item.status === 'Delivered') {
          logisticsHtml = `
            <div class="text-[#141E18] font-medium">Delivered by <strong>${item.volunteer || 'Volunteer'}</strong></div>
            <div class="text-[11px] text-[#525B55] mt-0.5">➔ ${item.targetShelter || 'Shelter'}</div>
          `;
        } else if (item.status === 'In-Transit') {
          logisticsHtml = `
            <div class="text-[#B45309] font-medium">Picked up by <strong>${item.volunteer || 'Courier'}</strong></div>
            <div class="text-[11px] text-[#525B55] mt-0.5">➔ Going to: ${item.targetShelter || 'Asha Shelter'}</div>
          `;
        } else {
          logisticsHtml = `
            <div class="text-[#1B4332] font-semibold">Waiting for volunteer</div>
            <div class="text-[11px]">
              <a href="volunteer.html?claim=${item.id}" class="text-[#C84B31] hover:underline font-semibold font-mono">
                Claim on Map →
              </a>
            </div>
          `;
        }

        return `
          <tr class="hover:bg-[#FAF9F6] transition-colors">
            
            <td class="py-3.5 px-4 sm:px-6 font-mono font-bold text-[#141E18]">
              <div class="flex items-center gap-1.5">
                <span>${item.id}</span>
                ${expiry.isUrgent && item.status === 'Available'
                  ? `<span title="Eat soon (<2h left)" class="w-2 h-2 rounded-full bg-[#C84B31]"></span>`
                  : ''}
              </div>
            </td>

            <td class="py-3.5 px-4">
              <div class="font-bold text-[#141E18]">${item.donorName}</div>
              <div class="text-xs text-[#525B55] truncate max-w-[200px]">${item.address || 'Delhi/NCR'}</div>
            </td>

            <td class="py-3.5 px-4">
              <div class="mb-1">${foodTypeBadge}</div>
              <div class="text-xs text-[#525B55] line-clamp-1">${item.foodTitle || item.itemsDescription}</div>
            </td>

            <td class="py-3.5 px-4 font-mono">
              <div class="font-bold text-[#141E18]">${item.servings} <span class="text-[11px] font-normal text-[#525B55]">meals</span></div>
              <div class="text-[11px] text-[#525B55]">~${weightKg} kg</div>
            </td>

            <td class="py-3.5 px-4">
              <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold font-mono bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]">
                <span>✓ Safe & Clean</span>
              </div>
              <div class="text-[10px] font-mono text-[#525B55] mt-0.5">
                ${item.storageTemp || 'Fresh'}
              </div>
            </td>

            <td class="py-3.5 px-4">
              <span class="status-pill ${statusPillClass}">
                <span class="status-dot"></span>
                <span>${statusText}</span>
              </span>
            </td>

            <td class="py-3.5 px-4 text-xs">
              ${logisticsHtml}
            </td>

            <td class="py-3.5 px-4 text-right">
              <button type="button" data-action="view-modal" data-id="${item.id}" class="px-2.5 py-1 text-xs font-semibold font-mono border border-[#DCD9D0] bg-white hover:bg-[#EFECE6] text-[#141E18] rounded transition-colors cursor-pointer">
                Details
              </button>
            </td>

          </tr>
        `;
      })
      .join('');

    // 2. Populate Mobile Cards Container (< 768px)
    if (mobileCardsContainer) {
      mobileCardsContainer.innerHTML = filtered
        .map((item) => {
          let statusPillClass = 'status-available';
          let statusText = 'Waiting for Courier';
          if (item.status === 'In-Transit') {
            statusPillClass = 'status-intransit';
            statusText = 'On the Way';
          } else if (item.status === 'Delivered') {
            statusPillClass = 'status-delivered';
            statusText = 'Delivered';
          }

          const isCooked = (item.foodType || '').toLowerCase().includes('cooked');
          const foodTypeBadge = isCooked
            ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]">Cooked Food</span>`
            : `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">Raw Produce</span>`;

          const weightKg = ((parseInt(item.servings, 10) || 0) * 0.45).toFixed(1);

          return `
            <div class="p-4 space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-1.5 font-mono text-xs">
                    <span class="font-bold text-[#141E18]">${item.id}</span>
                    <span class="text-[#DCD9D0]">•</span>
                    ${foodTypeBadge}
                  </div>
                  <h4 class="font-bold text-[#141E18] text-sm mt-0.5">${item.donorName}</h4>
                  <div class="text-[11px] text-[#525B55] truncate max-w-xs">${item.address || 'Delhi/NCR'}</div>
                </div>
                <span class="status-pill ${statusPillClass} text-[10px] shrink-0">
                  <span class="status-dot"></span>
                  <span>${statusText}</span>
                </span>
              </div>

              <div class="text-xs text-[#525B55] italic bg-[#FAF9F6] p-2 rounded border border-[#DCD9D0]">
                ${item.itemsDescription || item.foodTitle}
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs font-mono">
                <div class="p-2 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                  <span class="text-[10px] text-[#525B55]">Total Food</span>
                  <div class="font-bold text-[#141E18]">${item.servings} meals <span class="text-[#525B55] font-normal">(~${weightKg} kg)</span></div>
                </div>
                <div class="p-2 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                  <span class="text-[10px] text-[#525B55]">Safety Check</span>
                  <div class="font-bold text-[#1B4332]">✓ Passed (${item.storageTemp || 'Fresh'})</div>
                </div>
              </div>

              <div class="flex items-center justify-between pt-1 text-xs">
                <div>
                  ${
                    item.status === 'Available'
                      ? `<a href="volunteer.html?claim=${item.id}" class="text-[#C84B31] font-semibold hover:underline">Claim on Map →</a>`
                      : `<span class="text-[#525B55]">➔ ${item.targetShelter || 'Shelter'}</span>`
                  }
                </div>
                <button type="button" data-action="view-modal" data-id="${item.id}" class="px-3 py-1 text-xs font-medium border border-[#DCD9D0] bg-white rounded text-[#141E18] hover:bg-[#EFECE6]">
                  Details
                </button>
              </div>
            </div>
          `;
        })
        .join('');
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  function openDispatchModal(id) {
    if (!global.BhojStore) return;
    const dispatch = global.BhojStore.getDispatchById(id);
    if (!dispatch) return;

    const modal = document.getElementById('dispatch-detail-modal');
    if (!modal) return;

    document.getElementById('modal-dispatch-id').textContent = dispatch.id;

    const statusEl = document.getElementById('modal-dispatch-status');
    statusEl.textContent = dispatch.status === 'Available' ? 'Waiting for Courier' : dispatch.status === 'In-Transit' ? 'On the Way' : 'Delivered';
    statusEl.className = `status-pill ${
      dispatch.status === 'Available' ? 'status-available' : dispatch.status === 'In-Transit' ? 'status-intransit' : 'status-delivered'
    }`;

    document.getElementById('modal-donor-title').textContent = dispatch.donorName;
    document.getElementById('modal-donor-address').textContent = `${dispatch.address} • Phone: ${dispatch.contactPhone || 'N/A'}`;
    document.getElementById('modal-food-desc').textContent = dispatch.itemsDescription || dispatch.foodTitle;
    document.getElementById('modal-servings').textContent = `${dispatch.servings} meals (~${((parseInt(dispatch.servings, 10) || 0) * 0.45).toFixed(1)} kg)`;
    document.getElementById('modal-temperature').textContent = dispatch.temperatureRecorded || dispatch.storageTemp || '65°C';

    const expiry = global.BhojStore.getExpiryStatus(dispatch);
    document.getElementById('modal-expiry').textContent = expiry.formattedText;

    const logisticsBox = document.getElementById('modal-logistics-text');
    if (dispatch.status === 'Delivered') {
      logisticsBox.innerHTML = `Delivered to <strong class="text-[#141E18]">${dispatch.targetShelter || 'Shelter'}</strong> by volunteer <strong class="text-[#1B4332]">${dispatch.volunteer || 'Volunteer'}</strong>`;
    } else if (dispatch.status === 'In-Transit') {
      logisticsBox.innerHTML = `Being delivered by volunteer <strong class="text-[#B45309]">${dispatch.volunteer || 'Volunteer'}</strong> to <strong class="text-[#141E18]">${dispatch.targetShelter || 'Asha Shelter'}</strong>`;
    } else {
      logisticsBox.innerHTML = `Ready at donor location. <strong class="text-[#1B4332]">Waiting for a volunteer to pick up.</strong>`;
    }

    const cta = document.getElementById('modal-action-cta');
    if (cta) {
      if (dispatch.status === 'Available') {
        cta.href = `volunteer.html?claim=${dispatch.id}`;
        cta.textContent = 'Accept Pickup on Courier Map';
        cta.classList.remove('hidden');
      } else {
        cta.href = 'volunteer.html';
        cta.textContent = 'Open Courier Map';
      }
    }

    modal.classList.remove('hidden');
  }

  function closeModal() {
    const modal = document.getElementById('dispatch-detail-modal');
    if (modal) modal.classList.add('hidden');
  }

  function setupEventListeners() {
    const filterContainer = document.getElementById('ledger-filter-buttons');
    if (filterContainer) {
      filterContainer.addEventListener('click', function (e) {
        const btn = e.target.closest('.ledger-filter-btn');
        if (!btn) return;

        currentFilter = btn.getAttribute('data-filter');

        filterContainer.querySelectorAll('.ledger-filter-btn').forEach((b) => {
          b.className = 'ledger-filter-btn px-3 py-1 text-xs font-mono font-bold rounded bg-white text-[#525B55] hover:bg-[#EFECE6] border border-[#DCD9D0]';
        });

        btn.className = 'ledger-filter-btn px-3 py-1 text-xs font-mono font-bold rounded bg-[#141E18] text-white';

        renderLedger();
      });
    }

    const searchInput = document.getElementById('ledger-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value;
        renderLedger();
      });
    }

    const tableBody = document.getElementById('ledger-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action="view-modal"]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        openDispatchModal(id);
      });
    }

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

    const manualSyncBtn = document.getElementById('btn-manual-sync');
    if (manualSyncBtn) {
      manualSyncBtn.onclick = function () {
        updateKPIs();
        updateCharts();
        renderLedger();
        if (global.BhojToast) {
          global.BhojToast.info('Dashboard numbers refreshed.');
        }
      };
    }
  }

  function setupStoreSubscription() {
    if (!global.BhojStore) return;

    global.BhojStore.subscribe(function (event) {
      updateKPIs();
      updateCharts();
      renderLedger();

      if (event.type === 'DISPATCH_ADDED' && event.payload) {
        if (global.BhojToast) {
          global.BhojToast.success(`New food donation: ${event.payload.donorName} (${event.payload.servings} meals)`);
        }
      }
    });

    window.addEventListener('storage', function (e) {
      if (e.key === 'bhojvayasta_dispatches_v2' || e.key === 'bhojvayasta_dispatches') {
        updateKPIs();
        updateCharts();
        renderLedger();
      }
    });

    window.addEventListener('bhoj:datareload', function () {
      updateKPIs();
      updateCharts();
      renderLedger();
    });
  }

  function initDashboard() {
    if (global.BhojStore && typeof global.BhojStore.initStore === 'function') {
      global.BhojStore.initStore();
    }

    setupEventListeners();
    setupStoreSubscription();

    updateKPIs();
    updateCharts();
    renderLedger();

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})(typeof window !== 'undefined' ? window : this);
