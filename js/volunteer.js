/**
 * BhojVayasta - Live Volunteer Courier Pickup Feed & Interactive Distance Map Logic
 * File: js/volunteer.js
 * 
 * Theme: Warm Editorial & Civic Logistics
 * Preserves 100% of Haversine distance math, BhojStore state & BroadcastChannel sync
 */

(function (global) {
  'use strict';

  let reliefMap = null;
  let courierMarker = null;
  let donorMarkerMap = new Map();
  let shelterMarkerList = [];
  let routeLayerGroup = null;

  let courierCoords = { lat: 28.6139, lng: 77.2090 }; // Connaught Place default
  let volunteerName = 'Arjun Mehta (Verified Courier)';
  let currentStatusFilter = 'all';
  let currentTypeFilter = 'all';
  let currentSortBy = 'nearest';
  let currentSearchQuery = '';
  let activeSelectedDispatchId = null;

  // ==========================================
  // 1. Haversine Distance Formula (km)
  // ==========================================
  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  }

  function estimateTravelTimeMinutes(distanceKm) {
    if (!distanceKm || distanceKm <= 0) return 3;
    return Math.max(3, Math.round(3 + distanceKm * 2.2));
  }

  // ==========================================
  // 2. Map Initialization (Key-Free OpenStreetMap)
  // ==========================================
  function initReliefMap() {
    const mapEl = document.getElementById('relief-map');
    if (!mapEl || typeof L === 'undefined') return;

    try {
      reliefMap = L.map('relief-map', {
        center: [courierCoords.lat, courierCoords.lng],
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: true
      });

      // Key-Free OpenStreetMap Standard Tiles with Warm CSS Filter
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
      }).addTo(reliefMap);

      routeLayerGroup = L.layerGroup().addTo(reliefMap);

      createCourierMarker();
      plotShelterHubs();
      refreshDonorMarkers();

    } catch (e) {
      console.error('[BhojVolunteer] Failed to initialize relief map:', e);
    }
  }

  function createCourierMarker() {
    if (!reliefMap) return;

    const courierIcon = L.divIcon({
      className: 'bhoj-pin-wrapper',
      html: `
        <div class="bhoj-pin-body" style="background: #1d4ed8; border: 2px solid #FFFFFF;">
          <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 32],
      popupAnchor: [0, -30]
    });

    courierMarker = L.marker([courierCoords.lat, courierCoords.lng], {
      draggable: true,
      icon: courierIcon,
      zIndexOffset: 1000
    }).addTo(reliefMap);

    courierMarker.bindPopup(`
      <div class="text-xs space-y-1">
        <strong class="text-[#1d4ed8]">Courier Location</strong>
        <p class="text-[#525B55]">Drag this pin anywhere in Delhi/NCR to test live Haversine distance recalculation.</p>
      </div>
    `);

    courierMarker.on('drag', function (e) {
      const pos = e.target.getLatLng();
      courierCoords.lat = pos.lat;
      courierCoords.lng = pos.lng;
    });

    courierMarker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      courierCoords.lat = pos.lat;
      courierCoords.lng = pos.lng;

      renderFeed();

      if (activeSelectedDispatchId) {
        const item = global.BhojStore ? global.BhojStore.getDispatchById(activeSelectedDispatchId) : null;
        if (item) drawRoute(item);
      }

      if (global.BhojToast) {
        global.BhojToast.info(`Courier position moved to [${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}]`);
      }
    });
  }

  function plotShelterHubs() {
    if (!reliefMap || !global.BhojStore) return;

    const shelters = global.BhojStore.getShelters();
    shelterMarkerList.forEach((m) => reliefMap.removeLayer(m));
    shelterMarkerList = [];

    shelters.forEach((shelter) => {
      const shelterIcon = L.divIcon({
        className: 'bhoj-pin-wrapper',
        html: `
          <div class="bhoj-pin-body pin-shelter">
            <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
            </svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 30],
        popupAnchor: [0, -28]
      });

      const marker = L.marker([shelter.lat, shelter.lng], { icon: shelterIcon }).addTo(reliefMap);

      marker.bindPopup(`
        <div class="space-y-1 text-xs">
          <span class="font-mono text-[10px] uppercase font-bold text-[#0284C7] px-1.5 py-0.5 bg-[#F0F9FF] border border-[#BAE6FD] rounded">
            ${shelter.category}
          </span>
          <h4 class="font-bold text-[#141E18] text-sm mt-1">${shelter.name}</h4>
          <p class="text-[#525B55]">${shelter.address}</p>
          <div class="pt-1 border-t border-[#DCD9D0] flex items-center justify-between text-[11px] font-mono">
            <span class="text-[#525B55]">Daily Demand:</span>
            <span class="text-[#1B4332] font-bold">${shelter.mealDemand} portions</span>
          </div>
        </div>
      `);

      shelterMarkerList.push(marker);
    });
  }

  function refreshDonorMarkers() {
    if (!reliefMap || !global.BhojStore) return;

    donorMarkerMap.forEach((m) => reliefMap.removeLayer(m));
    donorMarkerMap.clear();

    const dispatches = global.BhojStore.getDispatches();

    dispatches.forEach((item) => {
      const expiry = global.BhojStore.getExpiryStatus(item);
      const isUrgent = expiry.isUrgent && item.status === 'Available';

      let pinThemeClass = 'pin-available';
      let pulseRingHtml = '';

      if (item.status === 'Available') {
        if (isUrgent) {
          pinThemeClass = 'pin-urgent';
          pulseRingHtml = `<div class="urgent-pulse-ring"></div>`;
        } else {
          pinThemeClass = 'pin-available';
        }
      } else if (item.status === 'In-Transit') {
        pinThemeClass = 'pin-intransit';
      } else {
        pinThemeClass = 'pin-delivered';
      }

      const donorIcon = L.divIcon({
        className: 'bhoj-pin-wrapper',
        html: `
          ${pulseRingHtml}
          <div class="bhoj-pin-body ${pinThemeClass}">
            <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 32],
        popupAnchor: [0, -30]
      });

      const marker = L.marker([item.lat, item.lng], { icon: donorIcon }).addTo(reliefMap);

      const distanceToDonor = calculateDistanceKm(courierCoords.lat, courierCoords.lng, item.lat, item.lng);

      marker.bindPopup(`
        <div class="space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono font-bold text-[#141E18]">${item.id}</span>
            <span class="status-pill ${item.status === 'Available' ? 'status-available' : item.status === 'In-Transit' ? 'status-intransit' : 'status-delivered'} text-[10px] py-0.5 px-1.5">
              ${item.status}
            </span>
          </div>

          <div>
            <h4 class="font-bold text-[#141E18] text-sm">${item.donorName}</h4>
            <p class="text-[#525B55] text-[11px] truncate max-w-xs">${item.address}</p>
          </div>

          <div class="grid grid-cols-2 gap-1 p-2 rounded bg-[#F7F5F0] border border-[#DCD9D0] font-mono text-[11px]">
            <div>
              <span class="text-[#525B55]">Quantity:</span>
              <div class="text-[#141E18] font-bold">${item.servings} portions</div>
            </div>
            <div>
              <span class="text-[#525B55]">Distance:</span>
              <div class="text-[#1B4332] font-bold">${distanceToDonor} km</div>
            </div>
          </div>

          ${
            item.status === 'Available'
              ? `<button type="button" onclick="window.BhojVolunteerTriggerAccept('${item.id}')" class="w-full py-1.5 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#C84B31] hover:bg-[#A83820] cursor-pointer">
                  Accept Pickup Now
                </button>`
              : item.status === 'In-Transit'
              ? `<button type="button" onclick="window.BhojVolunteerTriggerComplete('${item.id}')" class="w-full py-1.5 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#B45309] hover:bg-[#92400e] cursor-pointer">
                  Complete Delivery
                </button>`
              : `<div class="text-center text-[#525B55] font-mono text-[11px]">Delivered to ${item.targetShelter || 'Shelter'}</div>`
          }
        </div>
      `);

      marker.on('click', function () {
        focusOnDispatch(item.id, false);
      });

      donorMarkerMap.set(item.id, marker);
    });
  }

  // ==========================================
  // 3. Routing (Courier -> Donor -> Shelter)
  // ==========================================
  function drawRoute(dispatch) {
    if (!reliefMap || !routeLayerGroup || !global.BhojStore) return;

    routeLayerGroup.clearLayers();

    const shelters = global.BhojStore.getShelters();
    let targetShelter = null;

    if (dispatch.targetShelter) {
      targetShelter = shelters.find((s) => s.name.toLowerCase().includes(dispatch.targetShelter.toLowerCase().substring(0, 6)));
    }
    if (!targetShelter) {
      let minShelterDist = Infinity;
      shelters.forEach((s) => {
        const d = calculateDistanceKm(dispatch.lat, dispatch.lng, s.lat, s.lng);
        if (d < minShelterDist) {
          minShelterDist = d;
          targetShelter = s;
        }
      });
    }

    if (!targetShelter) targetShelter = shelters[0];

    const courierPoint = [courierCoords.lat, courierCoords.lng];
    const donorPoint = [dispatch.lat, dispatch.lng];
    const shelterPoint = [targetShelter.lat, targetShelter.lng];

    const distCourierToDonor = calculateDistanceKm(courierCoords.lat, courierCoords.lng, dispatch.lat, dispatch.lng);
    const timeCourierToDonor = estimateTravelTimeMinutes(distCourierToDonor);
    const distDonorToShelter = calculateDistanceKm(dispatch.lat, dispatch.lng, targetShelter.lat, targetShelter.lng);

    // Leg 1: Blue dashed polyline (Courier -> Donor)
    const leg1Line = L.polyline([courierPoint, donorPoint], {
      color: '#1d4ed8',
      weight: 3.5,
      opacity: 0.85,
      dashArray: '6, 6'
    }).addTo(routeLayerGroup);

    // Leg 2: Terracotta dashed polyline (Donor -> Shelter)
    const leg2Line = L.polyline([donorPoint, shelterPoint], {
      color: '#C84B31',
      weight: 3.5,
      opacity: 0.85,
      dashArray: '6, 6'
    }).addTo(routeLayerGroup);

    const group = L.featureGroup([leg1Line, leg2Line]);
    reliefMap.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 14 });

    const overlay = document.getElementById('route-summary-overlay');
    if (overlay) {
      document.getElementById('route-donor-name').textContent = dispatch.donorName;
      document.getElementById('route-courier-dist').textContent = `${distCourierToDonor} km`;
      document.getElementById('route-courier-time').textContent = `${timeCourierToDonor} mins`;
      document.getElementById('route-shelter-dist').textContent = `Donor ➔ ${targetShelter.name}: ${distDonorToShelter} km`;

      const actionBtn = document.getElementById('btn-route-action');
      if (actionBtn) {
        if (dispatch.status === 'Available') {
          actionBtn.textContent = 'Accept Pickup';
          actionBtn.className = 'btn-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider shrink-0 cursor-pointer';
          actionBtn.onclick = () => openShelterAssignModal(dispatch.id);
        } else if (dispatch.status === 'In-Transit') {
          actionBtn.textContent = 'Complete Delivery';
          actionBtn.className = 'px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#B45309] hover:bg-[#92400e] shrink-0 cursor-pointer';
          actionBtn.onclick = () => completeDelivery(dispatch.id);
        } else {
          actionBtn.textContent = 'Delivered';
          actionBtn.className = 'btn-secondary px-4 py-2 text-xs font-semibold text-[#525B55] shrink-0 cursor-default';
          actionBtn.onclick = null;
        }
      }

      overlay.classList.remove('hidden');
    }
  }

  function focusOnDispatch(id, scrollFeed = true) {
    if (!id || !global.BhojStore) return;

    activeSelectedDispatchId = id;
    const item = global.BhojStore.getDispatchById(id);
    if (!item) return;

    document.querySelectorAll('.courier-card').forEach((c) => {
      c.classList.remove('bg-[#F0FDF4]', 'border-l-4', 'border-l-[#1B4332]');
    });

    const targetCard = document.getElementById(`card-${item.id}`);
    if (targetCard) {
      targetCard.classList.add('bg-[#F0FDF4]', 'border-l-4', 'border-l-[#1B4332]');
      if (scrollFeed) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    const marker = donorMarkerMap.get(item.id);
    if (marker && reliefMap) {
      marker.openPopup();
    }

    drawRoute(item);
  }

  global.BhojVolunteerTriggerAccept = function (id) {
    openShelterAssignModal(id);
  };
  global.BhojVolunteerTriggerComplete = function (id) {
    completeDelivery(id);
  };
  global.BhojFocusDispatch = function (id) {
    focusOnDispatch(id, true);
  };

  // ==========================================
  // 4. Courier Feed Rendering
  // ==========================================
  function renderFeed() {
    if (!global.BhojStore) return;

    const dispatches = global.BhojStore.getDispatches();
    const feedContainer = document.getElementById('courier-feed');
    const emptyState = document.getElementById('feed-empty-state');
    const totalBadge = document.getElementById('feed-total-badge');

    if (!feedContainer) return;

    const countAll = dispatches.length;
    const countAvailable = dispatches.filter((d) => d.status === 'Available').length;
    const countInTransit = dispatches.filter((d) => d.status === 'In-Transit').length;
    const countDelivered = dispatches.filter((d) => d.status === 'Delivered').length;

    document.getElementById('count-status-all').textContent = countAll;
    document.getElementById('count-status-available').textContent = countAvailable;
    document.getElementById('count-status-intransit').textContent = countInTransit;
    document.getElementById('count-status-delivered').textContent = countDelivered;

    let filtered = dispatches.filter((item) => {
      if (currentStatusFilter !== 'all' && item.status.toLowerCase() !== currentStatusFilter.toLowerCase()) {
        return false;
      }
      if (currentTypeFilter !== 'all' && item.foodType.toLowerCase() !== currentTypeFilter.toLowerCase()) {
        return false;
      }
      if (currentSearchQuery.trim()) {
        const q = currentSearchQuery.toLowerCase().trim();
        const matchId = (item.id || '').toLowerCase().includes(q);
        const matchDonor = (item.donorName || '').toLowerCase().includes(q);
        const matchAddr = (item.address || '').toLowerCase().includes(q);
        if (!matchId && !matchDonor && !matchAddr) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const distA = calculateDistanceKm(courierCoords.lat, courierCoords.lng, a.lat, a.lng);
      const distB = calculateDistanceKm(courierCoords.lat, courierCoords.lng, b.lat, b.lng);

      if (currentSortBy === 'nearest') {
        return distA - distB;
      } else if (currentSortBy === 'urgent') {
        const expA = new Date(a.expiryTime || a.createdAt).getTime();
        const expB = new Date(b.expiryTime || b.createdAt).getTime();
        return expA - expB;
      } else if (currentSortBy === 'servings') {
        return (parseInt(b.servings, 10) || 0) - (parseInt(a.servings, 10) || 0);
      }
      return 0;
    });

    if (totalBadge) {
      totalBadge.textContent = `${filtered.length} Displayed`;
    }

    if (filtered.length === 0) {
      feedContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    feedContainer.innerHTML = filtered
      .map((item) => {
        const distKm = calculateDistanceKm(courierCoords.lat, courierCoords.lng, item.lat, item.lng);
        const travelMins = estimateTravelTimeMinutes(distKm);
        const expiry = global.BhojStore.getExpiryStatus(item);
        const weightKg = ((parseInt(item.servings, 10) || 0) * 0.45).toFixed(1);

        const isCooked = (item.foodType || '').toLowerCase().includes('cooked');
        const typeBadge = isCooked
          ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]">Cooked Meals</span>`
          : `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">Raw Produce</span>`;

        let statusPillClass = 'status-available';
        if (item.status === 'In-Transit') statusPillClass = 'status-intransit';
        if (item.status === 'Delivered') statusPillClass = 'status-delivered';

        const isSelected = item.id === activeSelectedDispatchId;

        return `
          <div id="card-${item.id}" class="courier-card p-4 sm:p-5 space-y-3 transition-colors cursor-pointer bg-white ${
            isSelected ? 'bg-[#F0FDF4] border-l-4 border-l-[#1B4332]' : 'hover:bg-[#FAF9F6]'
          }" onclick="window.BhojFocusDispatch('${item.id}')">
            
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-[#141E18] text-xs">${item.id}</span>
                  <span class="text-[#DCD9D0]">•</span>
                  ${typeBadge}
                  ${expiry.isUrgent && item.status === 'Available'
                    ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF2F2] text-[#C84B31] border border-[#FCA5A5]">Urgent (&lt;2h)</span>`
                    : ''}
                </div>
                <h3 class="text-sm sm:text-base font-bold text-[#141E18] mt-1">
                  ${item.donorName}
                </h3>
                <div class="text-xs text-[#525B55] truncate max-w-xs mt-0.5">
                  ${item.address || 'Delhi/NCR'}
                </div>
              </div>

              <span class="status-pill ${statusPillClass} text-[10px] shrink-0">
                <span class="status-dot"></span>
                <span>${item.status}</span>
              </span>
            </div>

            <p class="text-xs text-[#525B55] line-clamp-2 italic font-sans">
              "${item.itemsDescription || item.foodTitle}"
            </p>

            <div class="grid grid-cols-3 gap-2 font-mono text-center text-xs">
              <div class="p-2 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                <div class="text-[10px] text-[#525B55]">Servings</div>
                <div class="font-bold text-[#141E18]">${item.servings}</div>
                <div class="text-[10px] text-[#525B55]">~${weightKg} kg</div>
              </div>

              <div class="p-2 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                <div class="text-[10px] text-[#525B55]">Safe Window</div>
                <div class="font-bold ${expiry.isUrgent ? 'text-[#C84B31]' : 'text-[#1B4332]'}">${expiry.formattedText}</div>
                <div class="text-[10px] text-[#525B55]">${item.storageTemp || 'Temp OK'}</div>
              </div>

              <div class="p-2 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                <div class="text-[10px] text-[#525B55]">Haversine</div>
                <div class="font-bold text-[#1d4ed8]">${distKm} km</div>
                <div class="text-[10px] text-[#525B55]">~${travelMins} mins</div>
              </div>
            </div>

            <div class="text-[11px] font-mono text-[#1B4332] bg-[#E8F3EE] border border-[#A3C9B8] px-2 py-1 rounded">
              ✓ Temp Checked • ✓ Clean Food-Grade Packaging • ✓ Unspoiled
            </div>

            <div class="pt-2 border-t border-[#DCD9D0] flex items-center justify-between gap-2" onclick="event.stopPropagation()">
              <button type="button" onclick="window.BhojFocusDispatch('${item.id}')" class="px-3 py-1.5 rounded text-xs font-semibold font-mono border border-[#DCD9D0] bg-white hover:bg-[#EFECE6] text-[#141E18] transition-colors cursor-pointer">
                Locate Route
              </button>

              ${
                item.status === 'Available'
                  ? `<button type="button" onclick="window.BhojVolunteerTriggerAccept('${item.id}')" class="btn-primary px-4 py-1.5 text-xs uppercase tracking-wider cursor-pointer">
                      Accept Pickup
                    </button>`
                  : item.status === 'In-Transit'
                  ? `<div class="flex items-center gap-2">
                      <span class="text-[11px] font-mono text-[#B45309] hidden sm:inline">➔ ${item.targetShelter || 'Shelter'}</span>
                      <button type="button" onclick="window.BhojVolunteerTriggerComplete('${item.id}')" class="px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#B45309] hover:bg-[#92400e] cursor-pointer">
                        Complete Delivery
                      </button>
                    </div>`
                  : `<span class="text-xs font-mono font-bold text-[#525B55]">
                      ✓ Delivered & Logged
                    </span>`
              }
            </div>

          </div>
        `;
      })
      .join('');
  }

  // ==========================================
  // 5. Shelter Assignment & Acceptance Modal
  // ==========================================
  let pendingAcceptDispatchId = null;

  function openShelterAssignModal(id) {
    if (!id || !global.BhojStore) return;
    pendingAcceptDispatchId = id;

    const dispatch = global.BhojStore.getDispatchById(id);
    if (!dispatch) return;

    const modal = document.getElementById('shelter-assign-modal');
    if (!modal) return;

    document.getElementById('assign-modal-id').textContent = dispatch.id;
    document.getElementById('assign-modal-donor').textContent = dispatch.donorName;
    document.getElementById('assign-modal-servings').textContent = `${dispatch.servings} portions (~${((dispatch.servings * 0.45).toFixed(1))} kg)`;
    document.getElementById('assign-modal-volunteer-name').textContent = volunteerName;

    const shelters = global.BhojStore.getShelters();
    const optionsContainer = document.getElementById('shelter-options-list');

    if (optionsContainer) {
      optionsContainer.innerHTML = shelters
        .map((s, idx) => {
          const distFromDonor = calculateDistanceKm(dispatch.lat, dispatch.lng, s.lat, s.lng);
          const isNearest = idx === 0;

          return `
            <label class="p-3 rounded border border-[#DCD9D0] bg-[#FAF9F6] hover:bg-white cursor-pointer flex items-start gap-3 transition-colors">
              <input type="radio" name="targetShelter" value="${s.name}" ${idx === 0 ? 'checked' : ''} class="mt-1 accent-[#1B4332]">
              <div class="flex-1 space-y-0.5 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-[#141E18]">${s.name}</span>
                  <span class="font-mono text-[#1B4332] font-bold">${distFromDonor} km away</span>
                </div>
                <p class="text-[11px] text-[#525B55]">${s.address}</p>
                <div class="flex items-center gap-3 pt-1 text-[10px] font-mono text-[#525B55]">
                  <span>Capacity: <strong class="text-[#141E18]">${s.currentOccupancy}/${s.mealDemand}</strong></span>
                  <span>•</span>
                  <span>Contact: ${s.contactPerson}</span>
                  ${isNearest ? `<span class="ml-auto px-1.5 py-0.5 rounded bg-[#E8F3EE] text-[#1B4332] font-bold">Nearest Hub</span>` : ''}
                </div>
              </div>
            </label>
          `;
        })
        .join('');
    }

    modal.classList.remove('hidden');
  }

  function setupShelterAssignModal() {
    const modal = document.getElementById('shelter-assign-modal');
    const closeBtn = document.getElementById('modal-shelter-close');
    const cancelBtn = document.getElementById('btn-cancel-shelter-assign');
    const confirmBtn = document.getElementById('btn-confirm-pickup');

    function close() {
      if (modal) modal.classList.add('hidden');
      pendingAcceptDispatchId = null;
    }

    if (closeBtn) closeBtn.onclick = close;
    if (cancelBtn) cancelBtn.onclick = close;

    if (confirmBtn) {
      confirmBtn.onclick = function () {
        if (!pendingAcceptDispatchId || !global.BhojStore) return;

        const selectedRadio = document.querySelector('input[name="targetShelter"]:checked');
        const chosenShelter = selectedRadio ? selectedRadio.value : 'Asha Child Care Shelter';

        try {
          const updated = global.BhojStore.updateStatus(
            pendingAcceptDispatchId,
            'In-Transit',
            volunteerName,
            chosenShelter
          );

          close();

          if (global.BhojToast) {
            global.BhojToast.success(`Pickup accepted! Route plotted to ${chosenShelter}`);
          }

          renderFeed();
          refreshDonorMarkers();
          focusOnDispatch(updated.id, true);

        } catch (e) {
          console.error('[BhojVolunteer] Error accepting pickup:', e);
          if (global.BhojToast) global.BhojToast.error('Failed to accept pickup.');
        }
      };
    }
  }

  // ==========================================
  // 6. Complete Delivery Workflow
  // ==========================================
  function completeDelivery(id) {
    if (!id || !global.BhojStore) return;

    const dispatch = global.BhojStore.getDispatchById(id);
    if (!dispatch) return;

    try {
      const updated = global.BhojStore.updateStatus(
        id,
        'Delivered',
        volunteerName,
        dispatch.targetShelter || 'Asha Child Care Shelter'
      );

      const modal = document.getElementById('delivery-celebrate-modal');
      if (modal) {
        document.getElementById('celebrate-volunteer-name').textContent = volunteerName;
        document.getElementById('celebrate-meals-count').textContent = `${updated.servings} serv`;
        document.getElementById('celebrate-kg-count').textContent = `~${(updated.servings * 0.45).toFixed(1)} kg`;
        modal.classList.remove('hidden');
      }

      if (global.BhojToast) {
        global.BhojToast.success(
          `Delivery complete! ${updated.servings} meals handed over to ${updated.targetShelter}.`
        );
      }

      renderFeed();
      refreshDonorMarkers();
      drawRoute(updated);

    } catch (e) {
      console.error('[BhojVolunteer] Error completing delivery:', e);
      if (global.BhojToast) global.BhojToast.error('Failed to complete delivery.');
    }
  }

  function setupCelebrationModal() {
    const modal = document.getElementById('delivery-celebrate-modal');
    const dismissBtn = document.getElementById('btn-celebrate-dismiss');

    if (dismissBtn && modal) {
      dismissBtn.onclick = () => modal.classList.add('hidden');
    }
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      };
    }
  }

  // ==========================================
  // 7. Toolbar & URL Query Handlers
  // ==========================================
  function setupToolbarListeners() {
    const nameInput = document.getElementById('courier-name-input');
    if (nameInput) {
      nameInput.addEventListener('change', function () {
        volunteerName = this.value.trim() || 'Arjun Mehta (Verified Courier)';
        if (global.BhojToast) global.BhojToast.info(`Active courier identity: ${volunteerName}`);
      });
    }

    const locSelect = document.getElementById('courier-location-select');
    if (locSelect) {
      locSelect.addEventListener('change', function () {
        const parts = this.value.split(',');
        if (parts.length === 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          courierCoords.lat = lat;
          courierCoords.lng = lng;

          if (courierMarker && reliefMap) {
            courierMarker.setLatLng([lat, lng]);
            reliefMap.panTo([lat, lng]);
          }

          renderFeed();

          if (activeSelectedDispatchId && global.BhojStore) {
            const item = global.BhojStore.getDispatchById(activeSelectedDispatchId);
            if (item) drawRoute(item);
          }
        }
      });
    }

    const statusContainer = document.getElementById('feed-status-filters');
    if (statusContainer) {
      statusContainer.addEventListener('click', function (e) {
        const btn = e.target.closest('.feed-filter-btn');
        if (!btn) return;

        currentStatusFilter = btn.getAttribute('data-status');

        statusContainer.querySelectorAll('.feed-filter-btn').forEach((b) => {
          b.className = 'feed-filter-btn px-3 py-1 rounded text-xs font-mono font-bold bg-white text-[#525B55] hover:bg-[#EFECE6] border border-[#DCD9D0] shrink-0';
        });

        btn.className = 'feed-filter-btn px-3 py-1 rounded text-xs font-mono font-bold bg-[#141E18] text-white shrink-0';

        renderFeed();
      });
    }

    const typeSelect = document.getElementById('feed-type-filter');
    if (typeSelect) {
      typeSelect.addEventListener('change', function () {
        currentTypeFilter = this.value;
        renderFeed();
      });
    }

    const sortSelect = document.getElementById('feed-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        currentSortBy = this.value;
        renderFeed();
      });
    }

    const searchInput = document.getElementById('feed-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        currentSearchQuery = this.value;
        renderFeed();
      });
    }
  }

  function checkUrlClaim() {
    const params = new URLSearchParams(window.location.search);
    const claimId = params.get('claim') || params.get('id');

    if (claimId && global.BhojStore) {
      const item = global.BhojStore.getDispatchById(claimId);
      if (item) {
        setTimeout(() => {
          focusOnDispatch(item.id, true);
          if (item.status === 'Available') {
            openShelterAssignModal(item.id);
          }
        }, 500);
      }
    }
  }

  function setupStoreSync() {
    if (!global.BhojStore) return;

    global.BhojStore.subscribe(function (event) {
      renderFeed();
      refreshDonorMarkers();

      if (event.type === 'DISPATCH_ADDED' && event.payload) {
        if (global.BhojToast) {
          global.BhojToast.warning(
            `🔔 New Pickup: ${event.payload.donorName} (${event.payload.servings} portions). Pin added to map.`
          );
        }
      }
    });

    window.addEventListener('storage', function (e) {
      if (e.key === 'bhojvayasta_dispatches') {
        renderFeed();
        refreshDonorMarkers();
      }
    });

    window.addEventListener('bhoj:datareload', function () {
      renderFeed();
      refreshDonorMarkers();
    });
  }

  function initVolunteer() {
    if (global.BhojStore && typeof global.BhojStore.initStore === 'function') {
      global.BhojStore.initStore();
    }

    initReliefMap();
    setupToolbarListeners();
    setupShelterAssignModal();
    setupCelebrationModal();
    setupStoreSync();

    renderFeed();
    checkUrlClaim();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVolunteer);
  } else {
    initVolunteer();
  }

})(typeof window !== 'undefined' ? window : this);
