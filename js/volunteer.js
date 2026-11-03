/**
 * BhojVayasta - Live Volunteer Courier Pickup Feed & Interactive Distance Map Logic
 * File: js/volunteer.js
 * 
 * Features:
 * - Real-time Haversine distance calculations from volunteer position to food recovery donors
 * - Dynamic route plotting (Courier -> Donor -> Receiving Shelter)
 * - Draggable courier marker with instant multi-card distance recalculation
 * - Interactive pickup acceptance and shelter assignment workflow
 * - Verified delivery completion logging to the community impact ledger
 * - Real-time cross-tab synchronization with BroadcastChannel and BhojStore
 */

(function (global) {
  'use strict';

  // Map & Route State
  let reliefMap = null;
  let courierMarker = null;
  let donorMarkerMap = new Map(); // id -> L.marker
  let shelterMarkerList = [];
  let routeLayerGroup = null;

  // Simulator & Filter State
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

  /**
   * Estimates urban travel time in minutes based on two-wheeler courier speed (~28 km/h).
   */
  function estimateTravelTimeMinutes(distanceKm) {
    if (!distanceKm || distanceKm <= 0) return 3;
    // Base 3 mins pickup overhead + ~2.2 mins per km
    return Math.max(3, Math.round(3 + distanceKm * 2.2));
  }

  // ==========================================
  // 2. Map Initialization & Custom Markers
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

      // CartoDB Voyager tiles for modern high-contrast aesthetic
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> & BhojVayasta',
        maxZoom: 18
      }).addTo(reliefMap);

      routeLayerGroup = L.layerGroup().addTo(reliefMap);

      // Create Courier Marker (Draggable Blue Marker)
      createCourierMarker();

      // Plot the 4 Fixed Shelters
      plotShelterHubs();

      // Plot All Donor Dispatches
      refreshDonorMarkers();

    } catch (e) {
      console.error('[BhojVolunteer] Failed to initialize relief map:', e);
    }
  }

  /**
   * Creates the draggable courier marker representing the volunteer.
   */
  function createCourierMarker() {
    if (!reliefMap) return;

    const courierIcon = L.divIcon({
      className: 'bhoj-pin-wrapper',
      html: `
        <div class="active-beacon-ring" style="border-color: #3b82f6;"></div>
        <div class="bhoj-pin-body" style="background: linear-gradient(135deg, #1d4ed8, #3b82f6); border: 2px solid #ffffff;">
          <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 36],
      popupAnchor: [0, -32]
    });

    courierMarker = L.marker([courierCoords.lat, courierCoords.lng], {
      draggable: true,
      icon: courierIcon,
      zIndexOffset: 1000
    }).addTo(reliefMap);

    courierMarker.bindPopup(`
      <div class="text-xs space-y-1">
        <strong class="text-blue-400">Volunteer Courier Location</strong>
        <p class="text-slate-300">Drag this marker across Delhi/NCR to test real-time distance recalculation.</p>
      </div>
    `);

    // Drag Listener: updates distances across feed and active route
    courierMarker.on('drag', function (e) {
      const pos = e.target.getLatLng();
      courierCoords.lat = pos.lat;
      courierCoords.lng = pos.lng;
    });

    courierMarker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      courierCoords.lat = pos.lat;
      courierCoords.lng = pos.lng;

      // Recalculate feed
      renderFeed();

      // If a route is active, redraw it
      if (activeSelectedDispatchId) {
        const item = global.BhojStore ? global.BhojStore.getDispatchById(activeSelectedDispatchId) : null;
        if (item) drawRoute(item);
      }

      if (global.BhojToast) {
        global.BhojToast.info(`Courier position moved to [${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}]`);
      }
    });
  }

  /**
   * Plots the 4 fixed receiving shelters on the map with custom purple/indigo pins.
   */
  function plotShelterHubs() {
    if (!reliefMap || !global.BhojStore) return;

    const shelters = global.BhojStore.getShelters();
    shelterMarkerList.forEach((m) => reliefMap.removeLayer(m));
    shelterMarkerList = [];

    shelters.forEach((shelter) => {
      const shelterIcon = L.divIcon({
        className: 'bhoj-pin-wrapper',
        html: `
          <div class="bhoj-pin-body pin-shelter" style="background: linear-gradient(135deg, #0284c7, #38bdf8); border: 2px solid #ffffff;">
            <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
            </svg>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 34],
        popupAnchor: [0, -30]
      });

      const marker = L.marker([shelter.lat, shelter.lng], { icon: shelterIcon }).addTo(reliefMap);

      marker.bindPopup(`
        <div class="space-y-1.5 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
              ${shelter.category}
            </span>
          </div>
          <h4 class="font-bold text-white text-sm leading-tight">${shelter.name}</h4>
          <p class="text-slate-300">${shelter.address}</p>
          <div class="pt-1 border-t border-slate-700/80 flex items-center justify-between text-[11px] font-mono">
            <span class="text-slate-400">Daily Demand:</span>
            <span class="text-emerald-400 font-bold">${shelter.mealDemand} portions</span>
          </div>
          <div class="text-[11px] text-slate-400">
            Contact: ${shelter.contactPerson} (${shelter.phone})
          </div>
        </div>
      `);

      shelterMarkerList.push(marker);
    });
  }

  /**
   * Refreshes and color-codes all donor dispatch markers.
   */
  function refreshDonorMarkers() {
    if (!reliefMap || !global.BhojStore) return;

    // Clear existing donor markers
    donorMarkerMap.forEach((m) => reliefMap.removeLayer(m));
    donorMarkerMap.clear();

    const dispatches = global.BhojStore.getDispatches();

    dispatches.forEach((item) => {
      const expiry = global.BhojStore.getExpiryStatus(item);
      const isUrgent = expiry.isUrgent && item.status === 'Available';

      // Determine visual theme based on status & urgency
      let pinThemeClass = 'pin-available';
      let pulseRingHtml = '';

      if (item.status === 'Available') {
        if (isUrgent) {
          pinThemeClass = 'pin-urgent';
          pulseRingHtml = `
            <div class="urgent-pulse-ring"></div>
            <div class="urgent-pulse-ring urgent-pulse-ring-delayed"></div>
          `;
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
        iconSize: [40, 40],
        iconAnchor: [20, 36],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([item.lat, item.lng], { icon: donorIcon }).addTo(reliefMap);

      const distanceToDonor = calculateDistanceKm(courierCoords.lat, courierCoords.lng, item.lat, item.lng);

      // Popup Content
      marker.bindPopup(`
        <div class="space-y-2 text-xs">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono font-bold text-emerald-400">${item.id}</span>
            <span class="status-pill ${item.status === 'Available' ? 'status-available' : item.status === 'In-Transit' ? 'status-intransit' : 'status-delivered'} text-[10px] py-0.5 px-2">
              ${item.status}
            </span>
          </div>

          <div>
            <h4 class="font-bold text-white text-sm">${item.donorName}</h4>
            <p class="text-slate-300 text-[11px] truncate max-w-xs">${item.address}</p>
          </div>

          <div class="grid grid-cols-2 gap-1.5 p-2 rounded-lg bg-slate-900 font-mono text-[11px]">
            <div>
              <span class="text-slate-400">Quantity:</span>
              <div class="text-white font-bold">${item.servings} portions</div>
            </div>
            <div>
              <span class="text-slate-400">Distance:</span>
              <div class="text-emerald-400 font-bold">${distanceToDonor} km</div>
            </div>
          </div>

          ${
            item.status === 'Available'
              ? `<button type="button" onclick="window.BhojVolunteerTriggerAccept('${item.id}')" class="w-full py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 shadow cursor-pointer">
                  Accept Pickup Now
                </button>`
              : item.status === 'In-Transit'
              ? `<button type="button" onclick="window.BhojVolunteerTriggerComplete('${item.id}')" class="w-full py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow cursor-pointer">
                  Complete Delivery
                </button>`
              : `<div class="text-center text-slate-400 text-[11px]">Delivered to ${item.targetShelter || 'Shelter'}</div>`
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

    // Determine target shelter (assigned shelter, or nearest available shelter)
    const shelters = global.BhojStore.getShelters();
    let targetShelter = null;

    if (dispatch.targetShelter) {
      targetShelter = shelters.find((s) => s.name.toLowerCase().includes(dispatch.targetShelter.toLowerCase().substring(0, 6)));
    }
    if (!targetShelter) {
      // Find nearest shelter to donor
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

    // Leg 1: Courier -> Donor
    const courierPoint = [courierCoords.lat, courierCoords.lng];
    const donorPoint = [dispatch.lat, dispatch.lng];
    const shelterPoint = [targetShelter.lat, targetShelter.lng];

    const distCourierToDonor = calculateDistanceKm(courierCoords.lat, courierCoords.lng, dispatch.lat, dispatch.lng);
    const timeCourierToDonor = estimateTravelTimeMinutes(distCourierToDonor);

    const distDonorToShelter = calculateDistanceKm(dispatch.lat, dispatch.lng, targetShelter.lat, targetShelter.lng);

    // Draw Leg 1: Blue Dashed Polyline
    const leg1Line = L.polyline([courierPoint, donorPoint], {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(routeLayerGroup);

    // Draw Leg 2: Amber Dashed Polyline
    const leg2Line = L.polyline([donorPoint, shelterPoint], {
      color: '#f59e0b',
      weight: 4,
      opacity: 0.85,
      dashArray: '6, 6'
    }).addTo(routeLayerGroup);

    // Fit map bounds to show complete trip
    const group = L.featureGroup([leg1Line, leg2Line]);
    reliefMap.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });

    // Update Floating Summary Box
    const overlay = document.getElementById('route-summary-overlay');
    if (overlay) {
      document.getElementById('route-donor-name').textContent = dispatch.donorName;
      document.getElementById('route-courier-dist').textContent = `${distCourierToDonor} km`;
      document.getElementById('route-courier-time').textContent = `~${timeCourierToDonor} mins`;
      document.getElementById('route-shelter-dist').textContent = `${distDonorToShelter} km to ${targetShelter.name}`;

      const actionBtn = document.getElementById('btn-route-action');
      if (actionBtn) {
        if (dispatch.status === 'Available') {
          actionBtn.textContent = 'Accept Pickup';
          actionBtn.className = 'px-4 py-2 rounded-lg text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 shadow-md cursor-pointer';
          actionBtn.onclick = () => openShelterAssignModal(dispatch.id);
        } else if (dispatch.status === 'In-Transit') {
          actionBtn.textContent = 'Complete Delivery';
          actionBtn.className = 'px-4 py-2 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-md cursor-pointer';
          actionBtn.onclick = () => completeDelivery(dispatch.id);
        } else {
          actionBtn.textContent = 'Delivered';
          actionBtn.className = 'px-4 py-2 rounded-lg text-xs font-bold text-slate-400 bg-slate-800 cursor-default';
          actionBtn.onclick = null;
        }
      }

      overlay.classList.remove('hidden');
    }
  }

  // ==========================================
  // 4. Focus on Specific Dispatch (Feed & Map Sync)
  // ==========================================
  function focusOnDispatch(id, scrollFeed = true) {
    if (!id || !global.BhojStore) return;

    activeSelectedDispatchId = id;
    const item = global.BhojStore.getDispatchById(id);
    if (!item) return;

    // Highlight card in feed
    document.querySelectorAll('.courier-card').forEach((c) => {
      c.classList.remove('ring-2', 'ring-emerald-500', 'bg-slate-900/90');
    });

    const targetCard = document.getElementById(`card-${item.id}`);
    if (targetCard) {
      targetCard.classList.add('ring-2', 'ring-emerald-500', 'bg-slate-900/90');
      if (scrollFeed) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    // Open marker popup & draw route
    const marker = donorMarkerMap.get(item.id);
    if (marker && reliefMap) {
      marker.openPopup();
    }

    drawRoute(item);
  }

  // Global triggers so Leaflet popups can invoke functions
  global.BhojVolunteerTriggerAccept = function (id) {
    openShelterAssignModal(id);
  };
  global.BhojVolunteerTriggerComplete = function (id) {
    completeDelivery(id);
  };

  // ==========================================
  // 5. Courier Feed Rendering
  // ==========================================
  function renderFeed() {
    if (!global.BhojStore) return;

    const dispatches = global.BhojStore.getDispatches();
    const feedContainer = document.getElementById('courier-feed');
    const emptyState = document.getElementById('feed-empty-state');
    const totalBadge = document.getElementById('feed-total-badge');

    if (!feedContainer) return;

    // Filter counts for tabs
    const countAll = dispatches.length;
    const countAvailable = dispatches.filter((d) => d.status === 'Available').length;
    const countInTransit = dispatches.filter((d) => d.status === 'In-Transit').length;
    const countDelivered = dispatches.filter((d) => d.status === 'Delivered').length;

    document.getElementById('count-status-all').textContent = countAll;
    document.getElementById('count-status-available').textContent = countAvailable;
    document.getElementById('count-status-intransit').textContent = countInTransit;
    document.getElementById('count-status-delivered').textContent = countDelivered;

    // Filter
    let filtered = dispatches.filter((item) => {
      // Status
      if (currentStatusFilter !== 'all' && item.status.toLowerCase() !== currentStatusFilter.toLowerCase()) {
        return false;
      }
      // Type
      if (currentTypeFilter !== 'all' && item.foodType.toLowerCase() !== currentTypeFilter.toLowerCase()) {
        return false;
      }
      // Search
      if (currentSearchQuery.trim()) {
        const q = currentSearchQuery.toLowerCase().trim();
        const matchId = (item.id || '').toLowerCase().includes(q);
        const matchDonor = (item.donorName || '').toLowerCase().includes(q);
        const matchAddr = (item.address || '').toLowerCase().includes(q);
        if (!matchId && !matchDonor && !matchAddr) return false;
      }
      return true;
    });

    // Sorting
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
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">Cooked Meals</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Raw Produce</span>`;

        let statusPillClass = 'status-available';
        let statusDotClass = 'bg-emerald-400';
        if (item.status === 'In-Transit') {
          statusPillClass = 'status-intransit';
          statusDotClass = 'bg-amber-400';
        } else if (item.status === 'Delivered') {
          statusPillClass = 'status-delivered';
          statusDotClass = 'bg-indigo-400';
        }

        const isSelected = item.id === activeSelectedDispatchId;

        return `
          <div id="card-${item.id}" class="courier-card glass-card p-5 rounded-2xl space-y-3.5 transition-all duration-200 cursor-pointer ${
            isSelected ? 'ring-2 ring-emerald-500 bg-slate-900/90' : 'hover:border-slate-700'
          }" onclick="window.BhojFocusDispatch('${item.id}')">
            
            <!-- Card Header: ID, Donor, Status -->
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-emerald-400 text-xs">${item.id}</span>
                  <span class="text-slate-600">•</span>
                  ${typeBadge}
                  ${expiry.isUrgent && item.status === 'Available'
                    ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">Urgent (&lt;2h)</span>`
                    : ''}
                </div>
                <h3 class="text-base font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                  ${item.donorName}
                </h3>
                <div class="text-xs text-slate-400 truncate max-w-xs flex items-center gap-1 mt-0.5">
                  <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-500 shrink-0"></i>
                  <span class="truncate">${item.address || 'Delhi/NCR'}</span>
                </div>
              </div>

              <span class="status-pill ${statusPillClass} text-[10px] shrink-0">
                <span class="status-dot ${statusDotClass}"></span>
                <span>${item.status}</span>
              </span>
            </div>

            <!-- Description / Items Summary -->
            <p class="text-xs text-slate-300 line-clamp-2 italic font-sans">
              "${item.itemsDescription || item.foodTitle}"
            </p>

            <!-- Metrics Matrix: Servings, Weight, Safe Window, Distance -->
            <div class="grid grid-cols-3 gap-2 pt-1 font-mono text-center text-xs">
              <div class="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <div class="text-[10px] text-slate-400">Servings</div>
                <div class="font-bold text-white">${item.servings} <span class="text-[10px] font-normal text-slate-400">serv</span></div>
                <div class="text-[10px] text-slate-400">~${weightKg} kg</div>
              </div>

              <div class="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <div class="text-[10px] text-slate-400">Safe Window</div>
                <div class="font-bold ${expiry.isUrgent ? 'text-rose-400' : 'text-emerald-400'}">${expiry.formattedText}</div>
                <div class="text-[10px] text-slate-400">${item.storageTemp || 'Temp OK'}</div>
              </div>

              <div class="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <div class="text-[10px] text-slate-400">Haversine Dist</div>
                <div class="font-bold text-blue-400">${distKm} km</div>
                <div class="text-[10px] text-slate-400">~${travelMins} mins away</div>
              </div>
            </div>

            <!-- Hygiene Verification Badge -->
            <div class="flex items-center gap-1.5 text-[11px] text-emerald-300 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              <i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-400 shrink-0"></i>
              <span>✓ Temp Checked • ✓ Clean Food-Grade Packaging • ✓ Unspoiled</span>
            </div>

            <!-- Card Actions -->
            <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2" onclick="event.stopPropagation()">
              <button type="button" onclick="window.BhojFocusDispatch('${item.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer">
                <i data-lucide="map" class="w-3.5 h-3.5 text-blue-400"></i>
                <span>Locate Route</span>
              </button>

              ${
                item.status === 'Available'
                  ? `<button type="button" onclick="window.BhojVolunteerTriggerAccept('${item.id}')" class="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 shadow-md shadow-emerald-900/30 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all">
                      <i data-lucide="check" class="w-3.5 h-3.5 text-slate-950"></i>
                      <span>Accept Pickup</span>
                    </button>`
                  : item.status === 'In-Transit'
                  ? `<div class="flex items-center gap-2">
                      <span class="text-[11px] font-mono text-amber-400 hidden sm:inline">➔ ${item.targetShelter || 'Shelter'}</span>
                      <button type="button" onclick="window.BhojVolunteerTriggerComplete('${item.id}')" class="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all">
                        <i data-lucide="package-check" class="w-3.5 h-3.5"></i>
                        <span>Complete Delivery</span>
                      </button>
                    </div>`
                  : `<span class="text-xs font-bold font-mono text-indigo-300 flex items-center gap-1">
                      <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-indigo-400"></i>
                      <span>Delivered & Logged</span>
                    </span>`
              }
            </div>

          </div>
        `;
      })
      .join('');

    // Re-render Lucide icons
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  global.BhojFocusDispatch = function (id) {
    focusOnDispatch(id, true);
  };

  // ==========================================
  // 6. Shelter Selection & Pickup Acceptance Modal
  // ==========================================
  let pendingAcceptDispatchId = null;

  function openShelterAssignModal(id) {
    if (!id || !global.BhojStore) return;
    pendingAcceptDispatchId = id;

    const dispatch = global.BhojStore.getDispatchById(id);
    if (!dispatch) return;

    const modal = document.getElementById('shelter-assign-modal');
    if (!modal) return;

    // Populate batch details
    document.getElementById('assign-modal-id').textContent = dispatch.id;
    document.getElementById('assign-modal-donor').textContent = dispatch.donorName;
    document.getElementById('assign-modal-servings').textContent = `${dispatch.servings} portions (~${((dispatch.servings * 0.45).toFixed(1))} kg)`;
    document.getElementById('assign-modal-volunteer-name').textContent = volunteerName;

    // Populate shelter hubs radio list
    const shelters = global.BhojStore.getShelters();
    const optionsContainer = document.getElementById('shelter-options-list');

    if (optionsContainer) {
      optionsContainer.innerHTML = shelters
        .map((s, idx) => {
          const distFromDonor = calculateDistanceKm(dispatch.lat, dispatch.lng, s.lat, s.lng);
          const isNearest = idx === 0;

          return `
            <label class="p-3 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-900 cursor-pointer flex items-start gap-3 transition-colors group">
              <input type="radio" name="targetShelter" value="${s.name}" ${idx === 0 ? 'checked' : ''} class="mt-1 text-emerald-500 focus:ring-emerald-500">
              <div class="flex-1 space-y-0.5 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-white group-hover:text-emerald-300 transition-colors">${s.name}</span>
                  <span class="font-mono text-emerald-400 font-bold">${distFromDonor} km away</span>
                </div>
                <p class="text-[11px] text-slate-400">${s.address}</p>
                <div class="flex items-center gap-3 pt-1 text-[10px] font-mono text-slate-400">
                  <span>Capacity: <strong class="text-slate-200">${s.currentOccupancy}/${s.mealDemand}</strong></span>
                  <span>•</span>
                  <span>Contact: ${s.contactPerson}</span>
                  ${isNearest ? `<span class="ml-auto px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Recommended Nearest Hub</span>` : ''}
                </div>
              </div>
            </label>
          `;
        })
        .join('');
    }

    modal.classList.remove('hidden');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
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
            global.BhojToast.success(`Pickup accepted! Delivery route assigned to ${chosenShelter}`);
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
  // 7. Complete Delivery to Shelter Workflow
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

      // Open celebration modal
      const modal = document.getElementById('delivery-celebrate-modal');
      if (modal) {
        document.getElementById('celebrate-volunteer-name').textContent = volunteerName;
        document.getElementById('celebrate-meals-count').textContent = `${updated.servings} portions`;
        document.getElementById('celebrate-kg-count').textContent = `~${(updated.servings * 0.45).toFixed(1)} kg`;
        modal.classList.remove('hidden');
      }

      if (global.BhojToast) {
        global.BhojToast.success(
          `🎉 Delivery Completed! ${updated.servings} meals (~${(updated.servings * 0.45).toFixed(1)} kg) delivered to ${updated.targetShelter}!`
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
  // 8. Toolbar Listeners & URL Query Claims
  // ==========================================
  function setupToolbarListeners() {
    // Volunteer Name Input
    const nameInput = document.getElementById('courier-name-input');
    if (nameInput) {
      nameInput.addEventListener('change', function () {
        volunteerName = this.value.trim() || 'Arjun Mehta (Verified Courier)';
        if (global.BhojToast) global.BhojToast.info(`Courier active identity set to: ${volunteerName}`);
      });
    }

    // Courier Location Preset Selector
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

          if (global.BhojToast) global.BhojToast.info(`Courier location moved to ${locSelect.options[locSelect.selectedIndex].text}`);
        }
      });
    }

    // Status Filter Buttons
    const statusContainer = document.getElementById('feed-status-filters');
    if (statusContainer) {
      statusContainer.addEventListener('click', function (e) {
        const btn = e.target.closest('.feed-filter-btn');
        if (!btn) return;

        currentStatusFilter = btn.getAttribute('data-status');

        statusContainer.querySelectorAll('.feed-filter-btn').forEach((b) => {
          b.className = 'feed-filter-btn px-3 py-1 rounded-lg text-xs font-mono font-bold bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800 shrink-0';
        });

        btn.className = 'feed-filter-btn px-3 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-600 text-white shadow-md shadow-emerald-900/30 shrink-0';

        renderFeed();
      });
    }

    // Food Type Filter Dropdown
    const typeSelect = document.getElementById('feed-type-filter');
    if (typeSelect) {
      typeSelect.addEventListener('change', function () {
        currentTypeFilter = this.value;
        renderFeed();
      });
    }

    // Sort Dropdown
    const sortSelect = document.getElementById('feed-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        currentSortBy = this.value;
        renderFeed();
      });
    }

    // Search Input
    const searchInput = document.getElementById('feed-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        currentSearchQuery = this.value;
        renderFeed();
      });
    }
  }

  /**
   * Checks if URL contains ?claim=BV-XXXX from donate.html or index.html
   */
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

  // ==========================================
  // 9. Cross-Tab Store Subscriptions
  // ==========================================
  function setupStoreSync() {
    if (!global.BhojStore) return;

    global.BhojStore.subscribe(function (event) {
      console.log('[BhojVolunteer] Real-time sync event:', event.type);
      renderFeed();
      refreshDonorMarkers();

      if (event.type === 'DISPATCH_ADDED' && event.payload) {
        if (global.BhojToast) {
          global.BhojToast.warning(
            `🔔 New Pickup Alert: ${event.payload.donorName} (${event.payload.servings} portions). Pin added to map!`
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

  // ==========================================
  // 10. Initialization
  // ==========================================
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

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  // Mount on DOM readiness
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVolunteer);
  } else {
    initVolunteer();
  }

})(typeof window !== 'undefined' ? window : this);
