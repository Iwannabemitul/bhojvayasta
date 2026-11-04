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
  let gpsAccuracyCircle = null;

  let courierCoords = { lat: 31.2554, lng: 75.7050 }; // LPU Campus / Phagwara Highway default
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

      // Reliable Key-Free Map Tiles: Esri World Street Map (Enterprise CDN, No API key, No 403 blocks on file:/// or localhost)
      const primaryTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &bull; Map &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
      });

      primaryTiles.on('tileerror', function (err) {
        if (err && err.tile && err.coords) {
          // Automatic fallback to OpenStreetMap France mirror
          err.tile.src = `https://a.tile.openstreetmap.fr/osmfr/${err.coords.z}/${err.coords.x}/${err.coords.y}.png`;
        }
      });

      primaryTiles.addTo(reliefMap);

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

    // Precision Anchored SVG Navigation Arrow with Pulsing Radar Ring
    const courierIcon = L.divIcon({
      className: 'bhoj-pin-wrapper',
      html: `
        <div class="courier-radar-ring"></div>
        <div class="bhoj-courier-pin-body">
          <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });

    courierMarker = L.marker([courierCoords.lat, courierCoords.lng], {
      draggable: true,
      icon: courierIcon,
      zIndexOffset: 1000
    }).addTo(reliefMap);

    courierMarker.bindPopup(`
      <div class="text-xs space-y-1">
        <strong class="text-[#1d4ed8]">Your Courier Position</strong>
        <p class="text-[#525B55]">Drag this pin anywhere or click "Use My Live GPS" to track local relief logistics.</p>
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

      if (gpsAccuracyCircle && reliefMap) {
        reliefMap.removeLayer(gpsAccuracyCircle);
        gpsAccuracyCircle = null;
      }

      const gpsCoordsText = document.getElementById('gps-coords-text');
      if (gpsCoordsText) {
        gpsCoordsText.textContent = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} • Custom Position (Dragged)`;
      }

      renderFeed();
      refreshDonorMarkers();

      if (activeSelectedDispatchId) {
        const item = global.BhojStore ? global.BhojStore.getDispatchById(activeSelectedDispatchId) : null;
        if (item) drawRoute(item);
      }

      if (global.BhojToast) {
        global.BhojToast.info(`Courier moved to [${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}]`);
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
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const marker = L.marker([shelter.lat, shelter.lng], { icon: shelterIcon }).addTo(reliefMap);

      marker.bindPopup(`
        <div class="space-y-1 text-xs">
          <div class="flex items-center justify-between gap-1">
            <span class="font-mono text-[10px] uppercase font-bold text-[#0284C7] px-1.5 py-0.5 bg-[#F0F9FF] border border-[#BAE6FD] rounded">
              ${shelter.category}
            </span>
            <span class="font-mono text-[9px] text-[#525B55]">${shelter.region || 'Regional Hub'}</span>
          </div>
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
      // 1. Context-Aware Filter Gate: Only show pins matching active status & food type filters
      if (currentStatusFilter !== 'all' && item.status.toLowerCase() !== currentStatusFilter.toLowerCase()) {
        return;
      }
      if (currentTypeFilter !== 'all' && item.foodType.toLowerCase() !== currentTypeFilter.toLowerCase()) {
        return;
      }

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

      const distanceToDonor = calculateDistanceKm(courierCoords.lat, courierCoords.lng, item.lat, item.lng);

      // Precision Centered DivIcon with Floating Information Mini-Badge
      const donorIcon = L.divIcon({
        className: 'bhoj-pin-wrapper',
        html: `
          ${pulseRingHtml}
          <div class="bhoj-pin-badge">${item.servings} serv • ${distanceToDonor} km</div>
          <div class="bhoj-pin-body ${pinThemeClass}">
            <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const marker = L.marker([item.lat, item.lng], { icon: donorIcon }).addTo(reliefMap);

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
              <div class="text-[#141E18] font-bold">${item.servings} servings</div>
            </div>
            <div>
              <span class="text-[#525B55]">Distance:</span>
              <div class="text-[#1B4332] font-bold">${distanceToDonor} km</div>
            </div>
          </div>

          ${
            item.status === 'Available'
              ? `<button type="button" onclick="window.BhojVolunteerTriggerAccept('${item.id}')" class="w-full py-1.5 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#C84B31] hover:bg-[#A83820] cursor-pointer">
                  I'll Pick This Up
                </button>`
              : item.status === 'In-Transit'
              ? `<button type="button" onclick="window.BhojVolunteerTriggerComplete('${item.id}')" class="w-full py-1.5 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#B45309] hover:bg-[#92400e] cursor-pointer">
                  Mark as Delivered
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

    // Update the dynamic legend to reflect current filter counts and active status
    if (activeSelectedDispatchId) {
      const selectedItem = global.BhojStore.getDispatchById(activeSelectedDispatchId);
      if (selectedItem) {
        drawRoute(selectedItem);
      } else {
        updateDynamicLegend();
      }
    } else {
      updateDynamicLegend();
    }
  }

  // ==========================================
  // 3. Routing (OSRM Real Street-Level Routing)
  // ==========================================
  async function drawRoute(dispatch) {
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

    let distCourierToDonor = calculateDistanceKm(courierCoords.lat, courierCoords.lng, dispatch.lat, dispatch.lng);
    let timeCourierToDonor = estimateTravelTimeMinutes(distCourierToDonor);
    let distDonorToShelter = calculateDistanceKm(dispatch.lat, dispatch.lng, targetShelter.lat, targetShelter.lng);

    let osrmSucceeded = false;

    // Real Street Routing via Public OSRM API (Free, high-speed, no API key needed)
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${courierCoords.lng},${courierCoords.lat};${dispatch.lng},${dispatch.lat};${targetShelter.lng},${targetShelter.lat}?overview=full&geometries=geojson&steps=false`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(osrmUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];

          if (route.legs && route.legs.length >= 2) {
            const leg1 = route.legs[0];
            const leg2 = route.legs[1];

            distCourierToDonor = parseFloat((leg1.distance / 1000).toFixed(1));
            timeCourierToDonor = Math.max(3, Math.round(leg1.duration / 60));
            distDonorToShelter = parseFloat((leg2.distance / 1000).toFixed(1));

            if (route.geometry && route.geometry.coordinates) {
              const allCoords = route.geometry.coordinates.map((c) => [c[1], c[0]]);

              let splitIdx = 0;
              let minDistToDonor = Infinity;
              allCoords.forEach((pt, i) => {
                const d = Math.hypot(pt[0] - dispatch.lat, pt[1] - dispatch.lng);
                if (d < minDistToDonor) {
                  minDistToDonor = d;
                  splitIdx = i;
                }
              });

              const leg1Coords = allCoords.slice(0, splitIdx + 1);
              const leg2Coords = allCoords.slice(splitIdx);

              // Leg 1: Solid Royal Blue along real streets
              const leg1Line = L.polyline(leg1Coords.length > 1 ? leg1Coords : [courierPoint, donorPoint], {
                color: '#1d4ed8',
                weight: 4,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(routeLayerGroup);

              // Leg 2: Dashed Terracotta along real streets
              const leg2Line = L.polyline(leg2Coords.length > 1 ? leg2Coords : [donorPoint, shelterPoint], {
                color: '#C84B31',
                weight: 4,
                opacity: 0.95,
                dashArray: '6, 8',
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(routeLayerGroup);

              const group = L.featureGroup([leg1Line, leg2Line]);
              reliefMap.fitBounds(group.getBounds(), { padding: [65, 65], maxZoom: 15 });
              osrmSucceeded = true;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[BhojVolunteer] OSRM routing unavailable, falling back to straight polylines:', err);
    }

    if (!osrmSucceeded) {
      // Fallback: Straight polylines
      const leg1Line = L.polyline([courierPoint, donorPoint], {
        color: '#1d4ed8',
        weight: 3.5,
        opacity: 0.9,
        dashArray: '6, 6'
      }).addTo(routeLayerGroup);

      const leg2Line = L.polyline([donorPoint, shelterPoint], {
        color: '#C84B31',
        weight: 3.5,
        opacity: 0.9,
        dashArray: '6, 6'
      }).addTo(routeLayerGroup);

      const group = L.featureGroup([leg1Line, leg2Line]);
      reliefMap.fitBounds(group.getBounds(), { padding: [65, 65], maxZoom: 14 });
    }

    const overlay = document.getElementById('route-summary-overlay');
    if (overlay) {
      document.getElementById('route-donor-name').textContent = dispatch.donorName;
      document.getElementById('route-courier-dist').textContent = `${distCourierToDonor} km`;
      document.getElementById('route-courier-time').textContent = `${timeCourierToDonor} mins`;
      document.getElementById('route-shelter-dist').textContent = `Donor ➔ ${targetShelter.name}: ${distDonorToShelter} km`;

      const actionBtn = document.getElementById('btn-route-action');
      if (actionBtn) {
        if (dispatch.status === 'Available') {
          actionBtn.textContent = "I'll Pick This Up";
          actionBtn.className = 'btn-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider shrink-0 cursor-pointer';
          actionBtn.onclick = () => openShelterAssignModal(dispatch.id);
        } else if (dispatch.status === 'In-Transit') {
          actionBtn.textContent = 'Mark as Delivered';
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

    // Morph the Map Legend into Active Route Inspection Mode
    updateDynamicLegend(dispatch, targetShelter, distCourierToDonor, timeCourierToDonor, distDonorToShelter);
  }

  // ==========================================
  // 3b. Context-Aware Dynamic Map Legend
  // ==========================================
  function updateDynamicLegend(selectedDispatch = null, targetShelter = null, distLeg1 = 0, timeLeg1 = 0, distLeg2 = 0) {
    const legendContent = document.getElementById('legend-content');
    if (!legendContent || !global.BhojStore) return;

    const dispatches = global.BhojStore.getDispatches();
    const shelters = global.BhojStore.getShelters();

    const countAvailable = dispatches.filter((d) => d.status === 'Available').length;
    const countInTransit = dispatches.filter((d) => d.status === 'In-Transit').length;
    const countDelivered = dispatches.filter((d) => d.status === 'Delivered').length;

    if (selectedDispatch) {
      // ACTIVE ROUTE INSPECTION MODE
      legendContent.innerHTML = `
        <div class="space-y-2">
          <div class="flex items-center justify-between border-b border-[#DCD9D0] pb-1.5">
            <span class="font-bold text-[#141E18] uppercase tracking-wider flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#1B4332] animate-pulse"></span>
              Route Inspection
            </span>
            <button type="button" onclick="window.BhojClearRouteSelection()" class="text-[10px] text-[#C84B31] hover:underline font-bold cursor-pointer">
              ✕ Clear / Show All
            </button>
          </div>

          <div class="bg-[#FAF9F6] p-2 rounded border border-[#DCD9D0] space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-mono font-bold text-[#141E18] text-[11px]">${selectedDispatch.id}</span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${
                selectedDispatch.status === 'Available' ? 'bg-[#E8F3EE] text-[#1B4332]' : 'bg-[#FEF3C7] text-[#B45309]'
              }">${selectedDispatch.status}</span>
            </div>
            <div class="font-bold text-[#141E18] text-xs truncate">${selectedDispatch.donorName}</div>
            <div class="text-[10px] text-[#525B55]">
              ${selectedDispatch.servings} serv (~${((selectedDispatch.servings * 0.45).toFixed(1))} kg) • ${selectedDispatch.storageTemp || 'Temp OK'}
            </div>
          </div>

          <div class="space-y-1.5 text-[10px]">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1 text-[#525B55]">
                <span class="w-2 h-2 rounded-full bg-[#1d4ed8]"></span>
                Courier ➔ Donor:
              </span>
              <strong class="text-[#1d4ed8] font-mono">${distLeg1} km (${timeLeg1}m)</strong>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1 text-[#525B55] truncate max-w-[170px]" title="${targetShelter ? targetShelter.name : 'Shelter'}">
                <span class="w-2 h-2 rounded-full bg-[#C84B31]"></span>
                Donor ➔ ${targetShelter ? targetShelter.name : 'Shelter'}:
              </span>
              <strong class="text-[#C84B31] font-mono shrink-0">${distLeg2} km</strong>
            </div>
          </div>
        </div>
      `;

      // Dim all non-selected donor markers on the map
      donorMarkerMap.forEach((marker, id) => {
        const el = marker.getElement();
        if (el) {
          if (id === selectedDispatch.id) {
            el.classList.remove('marker-dimmed');
          } else {
            el.classList.add('marker-dimmed');
          }
        }
      });

    } else {
      // NORMAL FILTER-AWARE MODE
      // Undim all markers
      donorMarkerMap.forEach((marker) => {
        const el = marker.getElement();
        if (el) el.classList.remove('marker-dimmed');
      });

      let filterLabel = 'VIEWING: ALL';
      if (currentStatusFilter === 'Available') filterLabel = `VIEWING: AVAILABLE (${countAvailable})`;
      else if (currentStatusFilter === 'In-Transit') filterLabel = `VIEWING: ON THE WAY (${countInTransit})`;
      else if (currentStatusFilter === 'Delivered') filterLabel = `VIEWING: DELIVERED (${countDelivered})`;
      else if (currentTypeFilter !== 'all') filterLabel = `VIEWING: ${currentTypeFilter.toUpperCase()}`;

      const isAvailableDimmed = currentStatusFilter !== 'all' && currentStatusFilter !== 'Available';
      const isInTransitDimmed = currentStatusFilter !== 'all' && currentStatusFilter !== 'In-Transit';
      const isDeliveredDimmed = currentStatusFilter !== 'all' && currentStatusFilter !== 'Delivered';

      legendContent.innerHTML = `
        <div class="flex items-center justify-between border-b border-[#DCD9D0] pb-1.5 mb-2">
          <span class="font-bold text-[#141E18] uppercase tracking-wider">Map Legend</span>
          <span class="px-1.5 py-0.5 rounded bg-[#E8F3EE] text-[#1B4332] text-[9px] font-bold">
            ${filterLabel}
          </span>
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#1d4ed8] shrink-0"></span>
              <span class="text-[#525B55]">Your Courier Location</span>
            </div>
            <span class="text-[9px] text-[#1d4ed8] font-bold">Active</span>
          </div>
          <div class="flex items-center justify-between ${isAvailableDimmed ? 'opacity-35' : ''}">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#1B4332] shrink-0"></span>
              <span class="text-[#525B55]">Available Food</span>
            </div>
            <span class="text-[9px] font-bold text-[#1B4332]">${countAvailable}</span>
          </div>
          <div class="flex items-center justify-between ${isInTransitDimmed ? 'opacity-35' : ''}">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#B45309] shrink-0"></span>
              <span class="text-[#525B55]">On the Way</span>
            </div>
            <span class="text-[9px] font-bold text-[#B45309]">${countInTransit}</span>
          </div>
          <div class="flex items-center justify-between ${isDeliveredDimmed ? 'opacity-35' : ''}">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#525B55] shrink-0"></span>
              <span class="text-[#525B55]">Delivered</span>
            </div>
            <span class="text-[9px] font-bold text-[#525B55]">${countDelivered}</span>
          </div>
          <div class="flex items-center justify-between pt-1 border-t border-[#DCD9D0]/60">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#0284C7] shrink-0"></span>
              <span class="text-[#525B55]">Hunger Relief Shelters</span>
            </div>
            <span class="text-[9px] font-bold text-[#0284C7]">${shelters.length} Hubs</span>
          </div>
        </div>
      `;
    }
  }

  global.BhojClearRouteSelection = function () {
    activeSelectedDispatchId = null;
    if (routeLayerGroup) routeLayerGroup.clearLayers();
    const overlay = document.getElementById('route-summary-overlay');
    if (overlay) overlay.classList.add('hidden');

    document.querySelectorAll('.courier-card').forEach((c) => {
      c.classList.remove('bg-[#F0FDF4]', 'border-l-4', 'border-l-[#1B4332]');
    });

    updateDynamicLegend();
    if (reliefMap) {
      reliefMap.panTo([courierCoords.lat, courierCoords.lng]);
    }
  };

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

    if (window.innerWidth < 1024 && typeof global.BhojVolunteerSwitchToMap === 'function') {
      global.BhojVolunteerSwitchToMap();
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
      totalBadge.textContent = `${filtered.length} Pickups`;
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
                <div class="text-[10px] text-[#525B55]">Safe For</div>
                <div class="font-bold ${expiry.isUrgent ? 'text-[#C84B31]' : 'text-[#1B4332]'}">${expiry.formattedText}</div>
                <div class="text-[10px] text-[#525B55]">${item.storageTemp || 'Temp OK'}</div>
              </div>

              <div class="p-2 bg-[#F7F5F0] border border-[#DCD9D0] rounded">
                <div class="text-[10px] text-[#525B55]">Distance</div>
                <div class="font-bold text-[#1d4ed8]">${distKm} km</div>
                <div class="text-[10px] text-[#525B55]">~${travelMins} mins</div>
              </div>
            </div>

            <div class="text-[11px] font-mono text-[#1B4332] bg-[#E8F3EE] border border-[#A3C9B8] px-2 py-1 rounded">
              ✓ Temperature Checked • ✓ Clean Food-Grade Packaging • ✓ Fresh
            </div>

            <div class="pt-2 border-t border-[#DCD9D0] flex items-center justify-between gap-2" onclick="event.stopPropagation()">
              <button type="button" onclick="window.BhojFocusDispatch('${item.id}')" class="px-3 py-1.5 rounded text-xs font-semibold font-mono border border-[#DCD9D0] bg-white hover:bg-[#EFECE6] text-[#141E18] transition-colors cursor-pointer">
                View on Map
              </button>

              ${
                item.status === 'Available'
                  ? `<button type="button" onclick="window.BhojVolunteerTriggerAccept('${item.id}')" class="btn-primary px-4 py-1.5 text-xs uppercase tracking-wider cursor-pointer">
                      I'll Pick This Up
                    </button>`
                  : item.status === 'In-Transit'
                  ? `<div class="flex items-center gap-2">
                      <span class="text-[11px] font-mono text-[#B45309] hidden sm:inline">➔ ${item.targetShelter || 'Shelter'}</span>
                      <button type="button" onclick="window.BhojVolunteerTriggerComplete('${item.id}')" class="px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider text-white bg-[#B45309] hover:bg-[#92400e] cursor-pointer">
                        Mark as Delivered
                      </button>
                    </div>`
                  : `<span class="text-xs font-mono font-bold text-[#525B55]">
                      ✓ Delivered to Shelter
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
    document.getElementById('assign-modal-servings').textContent = `${dispatch.servings} servings (~${((dispatch.servings * 0.45).toFixed(1))} kg)`;
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
                  ${isNearest ? `<span class="ml-auto px-1.5 py-0.5 rounded bg-[#E8F3EE] text-[#1B4332] font-bold">Nearest Shelter</span>` : ''}
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
            global.BhojToast.success(`Pickup confirmed! Route shown to ${chosenShelter}`);
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
          `Delivery complete! ${updated.servings} meals delivered to ${updated.targetShelter}.`
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
    // Mobile / Tablet Segregated View Switcher (< 1024px)
    const btnListView = document.getElementById('btn-toggle-list-view');
    const btnMapView = document.getElementById('btn-toggle-map-view');
    const feedPane = document.getElementById('volunteer-feed-pane');
    const mapPane = document.getElementById('volunteer-map-pane');

    function switchToMapView() {
      if (feedPane && mapPane) {
        feedPane.classList.add('hidden');
        feedPane.classList.remove('flex');
        mapPane.classList.remove('hidden');
        mapPane.classList.add('block');
      }
      if (btnMapView && btnListView) {
        btnMapView.className = 'flex-1 py-2 text-xs font-bold rounded bg-white text-[#141E18] shadow-sm flex items-center justify-center gap-1.5 transition-all';
        btnListView.className = 'flex-1 py-2 text-xs font-bold rounded text-[#525B55] hover:text-[#141E18] flex items-center justify-center gap-1.5 transition-all';
      }
      if (reliefMap) {
        setTimeout(() => reliefMap.invalidateSize(), 150);
      }
    }

    function switchToListView() {
      if (feedPane && mapPane) {
        mapPane.classList.add('hidden');
        mapPane.classList.remove('block');
        feedPane.classList.remove('hidden');
        feedPane.classList.add('flex');
      }
      if (btnListView && btnMapView) {
        btnListView.className = 'flex-1 py-2 text-xs font-bold rounded bg-white text-[#141E18] shadow-sm flex items-center justify-center gap-1.5 transition-all';
        btnMapView.className = 'flex-1 py-2 text-xs font-bold rounded text-[#525B55] hover:text-[#141E18] flex items-center justify-center gap-1.5 transition-all';
      }
    }

    if (btnListView) btnListView.onclick = switchToListView;
    if (btnMapView) btnMapView.onclick = switchToMapView;
    global.BhojVolunteerSwitchToMap = switchToMapView;
    global.BhojVolunteerSwitchToList = switchToListView;

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024) {
        if (feedPane) {
          feedPane.classList.remove('hidden');
          feedPane.classList.add('flex');
        }
        if (mapPane) {
          mapPane.classList.remove('hidden');
          mapPane.classList.add('block');
        }
        if (reliefMap) reliefMap.invalidateSize();
      }
    });

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

          if (gpsAccuracyCircle && reliefMap) {
            reliefMap.removeLayer(gpsAccuracyCircle);
            gpsAccuracyCircle = null;
          }

          if (courierMarker && reliefMap) {
            courierMarker.setLatLng([lat, lng]);
            reliefMap.flyTo([lat, lng], 13, { duration: 1.2 });
          }

          const selectedOption = this.options[this.selectedIndex];
          const optText = selectedOption ? selectedOption.text.replace('📍 ', '') : 'Custom Location';
          const gpsCoordsText = document.getElementById('gps-coords-text');
          if (gpsCoordsText) {
            gpsCoordsText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)} • ${optText}`;
          }

          renderFeed();
          refreshDonorMarkers();

          if (activeSelectedDispatchId && global.BhojStore) {
            const item = global.BhojStore.getDispatchById(activeSelectedDispatchId);
            if (item) drawRoute(item);
          }
        }
      });
    }

    // Live Browser Geolocation Button
    const liveGpsBtn = document.getElementById('btn-use-live-gps');
    const liveGpsBtnText = document.getElementById('btn-use-live-gps-text');
    const gpsCoordsText = document.getElementById('gps-coords-text');

    if (liveGpsBtn) {
      liveGpsBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          if (global.BhojToast) global.BhojToast.error('Geolocation is not supported by your browser.');
          return;
        }

        if (liveGpsBtnText) liveGpsBtnText.textContent = 'Acquiring GPS fix...';
        liveGpsBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
          async function (pos) {
            if (liveGpsBtnText) liveGpsBtnText.textContent = 'Use My Live GPS';
            liveGpsBtn.disabled = false;

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = Math.round(pos.coords.accuracy || 25);

            courierCoords.lat = lat;
            courierCoords.lng = lng;

            if (courierMarker) {
              courierMarker.setLatLng([lat, lng]);
            }

            if (gpsAccuracyCircle && reliefMap) {
              reliefMap.removeLayer(gpsAccuracyCircle);
            }

            if (reliefMap) {
              gpsAccuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#1d4ed8',
                fillColor: '#3b82f6',
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: '4, 4'
              }).addTo(reliefMap);

              reliefMap.flyTo([lat, lng], 14, { duration: 1.2 });
            }

            let areaName = 'Live GPS Position';
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
                headers: { 'Accept': 'application/json' }
              });
              if (res.ok) {
                const data = await res.json();
                areaName = (data.address ? `${data.address.suburb || data.address.neighbourhood || data.address.road || ''}, ${data.address.city || data.address.town || data.address.state || ''}` : data.display_name.split(',')[0]) || 'Live GPS Position';
              }
            } catch (e) {
              console.warn('[BhojVolunteer] Nominatim reverse geocode error:', e);
            }

            if (gpsCoordsText) {
              gpsCoordsText.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)} • ${areaName} (±${accuracy}m)`;
            }

            renderFeed();
            refreshDonorMarkers();

            if (activeSelectedDispatchId && global.BhojStore) {
              const item = global.BhojStore.getDispatchById(activeSelectedDispatchId);
              if (item) drawRoute(item);
            }

            if (global.BhojToast) {
              global.BhojToast.success(`Live GPS acquired: ${areaName} (±${accuracy}m)`);
            }
          },
          function (err) {
            if (liveGpsBtnText) liveGpsBtnText.textContent = 'Use My Live GPS';
            liveGpsBtn.disabled = false;
            console.warn('[BhojVolunteer] Geolocation error:', err);
            if (global.BhojToast) {
              global.BhojToast.error('Could not get GPS fix. Please select a preset location from the dropdown.');
            }
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      });
    }

    // Spawn Pickups Near Me Quick Button
    const spawnBtn = document.getElementById('btn-spawn-near-me');
    if (spawnBtn) {
      spawnBtn.addEventListener('click', function () {
        if (!global.BhojStore || typeof global.BhojStore.spawnPickupsNear !== 'function') return;

        global.BhojStore.spawnPickupsNear(courierCoords.lat, courierCoords.lng);
        renderFeed();
        refreshDonorMarkers();

        if (global.BhojToast) {
          global.BhojToast.success('⚡ Generated 3 active pickups within 1.2 – 3.5 km of your position!');
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
        refreshDonorMarkers();
      });
    }

    const typeSelect = document.getElementById('feed-type-filter');
    if (typeSelect) {
      typeSelect.addEventListener('change', function () {
        currentTypeFilter = this.value;
        renderFeed();
        refreshDonorMarkers();
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
      if (e.key === 'bhojvayasta_dispatches_v2' || e.key === 'bhojvayasta_dispatches') {
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
