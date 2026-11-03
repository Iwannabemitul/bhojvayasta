/**
 * BhojVayasta - Surplus Food Dispatch Report Portal & Safety Gate Logic
 * File: js/donate.js
 * 
 * Features:
 * - Real-time auto-calculation of food weight in kg and beneficiaries
 * - Dynamic shelf-life expiry timestamp with urgency status classification
 * - Mandatory 3-stage Food Safety & Hygiene Checklist Gate (temp, packaging, spoilage)
 * - Interactive Leaflet mini-map coordinate picker with Delhi/NCR hotspot presets
 * - Real-time Courier Feed Preview card reflecting live inputs
 * - Integration with BhojStore.addDispatch() and cross-tab synchronization
 */

(function (global) {
  'use strict';

  // Map state
  let donorMap = null;
  let donorMarker = null;

  // Default coordinate: Connaught Place, New Delhi
  const DEFAULT_LAT = 28.6280;
  const DEFAULT_LNG = 77.2190;

  /**
   * Helper to format a local datetime string for input[type="datetime-local"]
   */
  function getLocalDateTimeString(offsetHours = 0) {
    const d = new Date(Date.now() - offsetHours * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  /**
   * Formats a future expiry timestamp nicely (e.g. "Today, 08:30 PM")
   */
  function formatExpiryTime(hoursFromNow) {
    const expiryDate = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    const now = new Date();

    const isToday = expiryDate.toDateString() === now.toDateString();
    const timeStr = expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return `Today at ${timeStr}`;
    } else {
      const dayStr = expiryDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${dayStr} at ${timeStr}`;
    }
  }

  // ==========================================
  // 1. Calculations: Weight, Beneficiaries & Expiry
  // ==========================================
  function updateCalculations() {
    const servingsInput = document.getElementById('servings-input');
    const servings = Math.max(1, parseInt(servingsInput ? servingsInput.value : 120, 10) || 120);

    // Weight calculation: 1 serving ≈ 0.45 kg
    const weightKg = (servings * 0.45).toFixed(1);
    const weightDisplay = weightKg >= 1000 
      ? `${(weightKg / 1000).toFixed(2)} MT (${weightKg} kg)` 
      : `${weightKg} kg`;

    const calcWeightEl = document.getElementById('calc-weight-kg');
    const calcPeopleEl = document.getElementById('calc-people-fed');
    const previewServingsEl = document.getElementById('preview-servings');
    const previewWeightEl = document.getElementById('preview-weight');

    if (calcWeightEl) calcWeightEl.textContent = weightDisplay;
    if (calcPeopleEl) calcPeopleEl.textContent = `${servings} People`;
    if (previewServingsEl) previewServingsEl.textContent = `${servings} serv`;
    if (previewWeightEl) previewWeightEl.textContent = `${weightKg} kg`;

    // Shelf life & expiry calculation
    const shelfLifeInput = document.getElementById('shelf-life');
    const shelfLifeHours = parseInt(shelfLifeInput ? shelfLifeInput.value : 4, 10) || 4;

    const shelfLifeDisplay = document.getElementById('shelf-life-display');
    const urgencyBadge = document.getElementById('urgency-badge');
    const expiryTimestampEl = document.getElementById('calc-expiry-timestamp');
    const previewExpiryEl = document.getElementById('preview-expiry');

    if (shelfLifeDisplay) {
      shelfLifeDisplay.textContent = `${shelfLifeHours} Hours`;
    }

    if (expiryTimestampEl) {
      expiryTimestampEl.textContent = formatExpiryTime(shelfLifeHours);
    }

    if (previewExpiryEl) {
      previewExpiryEl.textContent = `${shelfLifeHours}h left`;
    }

    if (urgencyBadge) {
      if (shelfLifeHours < 3) {
        urgencyBadge.textContent = 'Critical < 3 hrs';
        urgencyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse';
      } else if (shelfLifeHours <= 6) {
        urgencyBadge.textContent = 'Moderate 3-6 hrs';
        urgencyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
      } else {
        urgencyBadge.textContent = 'Stable > 6 hrs';
        urgencyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      }
    }
  }

  // ==========================================
  // 2. Mandatory Food Safety & Hygiene Checklist Gate
  // ==========================================
  function updateHygieneGate() {
    const chkTemp = document.getElementById('chk-temp-check');
    const chkPackaging = document.getElementById('chk-packaging');
    const chkSpoilage = document.getElementById('chk-no-spoilage');

    const isTemp = chkTemp ? chkTemp.checked : false;
    const isPack = chkPackaging ? chkPackaging.checked : false;
    const isSpoil = chkSpoilage ? chkSpoilage.checked : false;

    let checkedCount = 0;
    if (isTemp) checkedCount++;
    if (isPack) checkedCount++;
    if (isSpoil) checkedCount++;

    const progressPct = Math.round((checkedCount / 3) * 100);

    // Update UI indicators
    const countText = document.getElementById('compliance-count-text');
    const pctText = document.getElementById('compliance-progress-pct');
    const progressBar = document.getElementById('compliance-progress-bar');
    const complianceBadge = document.getElementById('compliance-badge');
    const gateLockMsg = document.getElementById('gate-lock-message');
    const btnSubmit = document.getElementById('btn-submit-dispatch');
    const btnSubmitIcon = document.getElementById('btn-submit-icon');
    const btnSubmitLabel = document.getElementById('btn-submit-label');

    if (countText) countText.textContent = `${checkedCount} / 3 Verified`;
    if (pctText) pctText.textContent = `${progressPct}%`;
    if (progressBar) progressBar.style.width = `${progressPct}%`;

    if (complianceBadge) {
      if (checkedCount === 3) {
        complianceBadge.className = 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 self-start sm:self-auto';
      } else {
        complianceBadge.className = 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 self-start sm:self-auto';
      }
    }

    // Toggle Submit Button Lock
    if (btnSubmit) {
      if (checkedCount === 3) {
        btnSubmit.disabled = false;
        btnSubmit.className = 'w-full flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-300 hover:from-emerald-300 hover:to-teal-200 shadow-xl shadow-emerald-900/40 hover:shadow-emerald-600/30 cursor-pointer active:scale-95 transition-all duration-300';
        
        if (btnSubmitLabel) btnSubmitLabel.textContent = 'Dispatch Surplus Food to Relief Network (Gate Cleared)';
        if (btnSubmitIcon) {
          btnSubmitIcon.setAttribute('data-lucide', 'send');
          btnSubmitIcon.className = 'w-5 h-5 text-slate-950';
        }

        if (gateLockMsg) {
          gateLockMsg.className = 'p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2';
          gateLockMsg.innerHTML = `
            <i data-lucide="check-circle" class="w-4 h-4 shrink-0 text-emerald-400"></i>
            <span><strong>100% Hygiene Gate Cleared.</strong> Food is certified safe for immediate courier pickup.</span>
          `;
        }
      } else {
        btnSubmit.disabled = true;
        btnSubmit.className = 'w-full flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white bg-slate-800 cursor-not-allowed opacity-60 transition-all duration-300';
        
        if (btnSubmitLabel) btnSubmitLabel.textContent = `Unlock By Completing Hygiene Checklist (${checkedCount}/3)`;
        if (btnSubmitIcon) {
          btnSubmitIcon.setAttribute('data-lucide', 'lock');
          btnSubmitIcon.className = 'w-5 h-5 text-slate-400';
        }

        if (gateLockMsg) {
          gateLockMsg.className = 'p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2';
          gateLockMsg.innerHTML = `
            <i data-lucide="lock" class="w-4 h-4 shrink-0 text-amber-400"></i>
            <span>All 3 safety gates must be checked to unlock community courier dispatch.</span>
          `;
        }
      }

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
    }
  }

  // ==========================================
  // 3. Leaflet Interactive Mini-Map Coordinate Picker
  // ==========================================
  function initDonorMap() {
    const mapContainer = document.getElementById('donor-map');
    if (!mapContainer || typeof L === 'undefined') return;

    try {
      donorMap = L.map('donor-map', {
        center: [DEFAULT_LAT, DEFAULT_LNG],
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: false
      });

      // CartoDB Voyager / OpenStreetMap standard tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 18
      }).addTo(donorMap);

      // Custom Pin Marker
      const pinIcon = L.divIcon({
        className: 'bhoj-pin-wrapper',
        html: `
          <div class="bhoj-pin-body" style="background: linear-gradient(135deg, #059669, #10b981); border: 2px solid #ffffff;">
            <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 36],
        popupAnchor: [0, -32]
      });

      donorMarker = L.marker([DEFAULT_LAT, DEFAULT_LNG], {
        draggable: true,
        icon: pinIcon
      }).addTo(donorMap);

      donorMarker.bindPopup('<strong>Pickup Dispatch Dock</strong><br>Drag pin or click map to move').openPopup();

      // Listen to marker drag
      donorMarker.on('dragend', function (e) {
        const coord = e.target.getLatLng();
        setCoordinates(coord.lat, coord.lng);
      });

      // Listen to map click
      donorMap.on('click', function (e) {
        donorMarker.setLatLng(e.latlng);
        setCoordinates(e.latlng.lat, e.latlng.lng);
      });

      // Quick location presets
      const presetContainer = document.getElementById('location-presets');
      if (presetContainer) {
        presetContainer.addEventListener('click', function (e) {
          const btn = e.target.closest('.btn-location-preset');
          if (!btn) return;

          const lat = parseFloat(btn.getAttribute('data-lat'));
          const lng = parseFloat(btn.getAttribute('data-lng'));
          const addr = btn.getAttribute('data-addr');

          if (lat && lng) {
            setCoordinates(lat, lng, addr);
            donorMarker.setLatLng([lat, lng]);
            donorMap.flyTo([lat, lng], 13, { duration: 1.2 });
          }
        });
      }

    } catch (e) {
      console.error('[BhojDonate] Failed to initialize Leaflet donor map:', e);
    }
  }

  function setCoordinates(lat, lng, addressText = null) {
    const latInput = document.getElementById('donor-lat');
    const lngInput = document.getElementById('donor-lng');
    const coordsReadout = document.getElementById('coords-readout');
    const addrInput = document.getElementById('donor-address');
    const previewAddr = document.getElementById('preview-address');

    const formattedLat = parseFloat(lat).toFixed(4);
    const formattedLng = parseFloat(lng).toFixed(4);

    if (latInput) latInput.value = formattedLat;
    if (lngInput) lngInput.value = formattedLng;
    if (coordsReadout) coordsReadout.textContent = `Lat: ${formattedLat}, Lng: ${formattedLng}`;

    if (addressText && addrInput) {
      addrInput.value = addressText;
    }

    if (previewAddr) {
      const currentAddr = addrInput ? addrInput.value : `${formattedLat}, ${formattedLng}`;
      previewAddr.innerHTML = `
        <svg class="w-3 h-3 text-slate-500 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
        <span>${currentAddr}</span>
      `;
    }
  }

  // ==========================================
  // 4. Real-Time Live Feed Preview Card
  // ==========================================
  function setupLivePreview() {
    const donorNameInput = document.getElementById('donor-name');
    const foodDescInput = document.getElementById('food-items-desc');
    const dietSelect = document.getElementById('diet-type');
    const addressInput = document.getElementById('donor-address');

    const previewDonor = document.getElementById('preview-donor');
    const previewDesc = document.getElementById('preview-description');
    const previewDiet = document.getElementById('preview-badge-diet');
    const previewType = document.getElementById('preview-badge-type');

    if (donorNameInput && previewDonor) {
      donorNameInput.addEventListener('input', function () {
        previewDonor.textContent = this.value.trim() || 'Grand Imperial Wedding Banquet';
      });
    }

    if (addressInput) {
      addressInput.addEventListener('input', function () {
        const previewAddr = document.getElementById('preview-address');
        if (previewAddr) {
          previewAddr.innerHTML = `
            <svg class="w-3 h-3 text-slate-500 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
            <span>${this.value.trim() || 'Barakhamba Road, Connaught Place, New Delhi'}</span>
          `;
        }
      });
    }

    if (foodDescInput && previewDesc) {
      foodDescInput.addEventListener('input', function () {
        previewDesc.textContent = this.value.trim() || 'Dal Makhani, Shahi Paneer, Jeera Rice, Tandoori Rotis in foil urns.';
      });
    }

    if (dietSelect && previewDiet) {
      dietSelect.addEventListener('change', function () {
        previewDiet.textContent = this.value;
      });
    }

    // Food Type radio card listener
    const foodTypeRadios = document.querySelectorAll('input[name="foodType"]');
    foodTypeRadios.forEach((radio) => {
      radio.addEventListener('change', function () {
        if (previewType) {
          previewType.textContent = this.value;
          if (this.value === 'Cooked Meals') {
            previewType.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
          } else {
            previewType.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30';
          }
        }

        // Highlight selected radio card
        document.querySelectorAll('.bhoj-radio-card').forEach((card) => {
          card.classList.remove('border-emerald-500/40', 'bg-emerald-950/20');
          card.classList.add('border-slate-800', 'bg-slate-900/60');
        });

        const parentCard = this.closest('.bhoj-radio-card');
        if (parentCard) {
          parentCard.classList.remove('border-slate-800', 'bg-slate-900/60');
          parentCard.classList.add('border-emerald-500/40', 'bg-emerald-950/20');
        }
      });
    });
  }

  // ==========================================
  // 5. Recent Submissions Feed in Right Column
  // ==========================================
  function renderRecentSubmissions() {
    if (!global.BhojStore) return;

    const listContainer = document.getElementById('recent-submissions-list');
    if (!listContainer) return;

    const dispatches = global.BhojStore.getDispatches();
    const recent = dispatches.slice(0, 3);

    if (recent.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-4 text-xs text-slate-500 font-mono">
          No dispatches submitted yet in this session.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = recent
      .map((item) => {
        let statusBadge = 'status-available';
        if (item.status === 'In-Transit') statusBadge = 'status-intransit';
        if (item.status === 'Delivered') statusBadge = 'status-delivered';

        return `
          <div class="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3 text-xs">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono font-bold text-emerald-400">${item.id}</span>
                <span class="text-slate-400">•</span>
                <span class="font-medium text-slate-200 truncate max-w-[140px]">${item.donorName}</span>
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5">
                ${item.servings} serv • ${item.foodType}
              </div>
            </div>
            <span class="status-pill ${statusBadge} text-[10px] py-0.5 px-2">
              <span>${item.status}</span>
            </span>
          </div>
        `;
      })
      .join('');
  }

  // ==========================================
  // 6. Form Submission & Validation Handling
  // ==========================================
  function setupFormSubmission() {
    const form = document.getElementById('dispatch-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Check hygiene gates
      const chkTemp = document.getElementById('chk-temp-check');
      const chkPackaging = document.getElementById('chk-packaging');
      const chkSpoilage = document.getElementById('chk-no-spoilage');

      if (!chkTemp.checked || !chkPackaging.checked || !chkSpoilage.checked) {
        if (global.BhojToast) {
          global.BhojToast.error('Mandatory Hygiene Gate: You must verify all 3 food safety checks before dispatch.');
        }
        document.getElementById('hygiene-gate-container')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      // Collect form fields
      const donorName = (document.getElementById('donor-name')?.value || '').trim();
      const donorCategory = document.getElementById('donor-category')?.value || 'Wedding Banquet';
      const dietType = document.getElementById('diet-type')?.value || 'Vegetarian';
      const contactPerson = (document.getElementById('contact-person')?.value || '').trim();
      const contactPhone = (document.getElementById('contact-phone')?.value || '').trim();

      const foodTypeEl = document.querySelector('input[name="foodType"]:checked');
      const foodType = foodTypeEl ? foodTypeEl.value : 'Cooked Meals';

      const servings = parseInt(document.getElementById('servings-input')?.value || 120, 10);
      const foodDescription = (document.getElementById('food-items-desc')?.value || '').trim();
      const preparedTime = document.getElementById('prepared-time')?.value || new Date().toISOString();
      const shelfLifeHours = parseInt(document.getElementById('shelf-life')?.value || 4, 10);
      const packagingType = document.getElementById('packaging-type')?.value || 'Sealed Aluminum Food-Grade Trays';
      const storageTemp = document.getElementById('temperature-input')?.value || '68°C';

      const lat = parseFloat(document.getElementById('donor-lat')?.value || DEFAULT_LAT);
      const lng = parseFloat(document.getElementById('donor-lng')?.value || DEFAULT_LNG);
      const address = (document.getElementById('donor-address')?.value || 'Central Delhi Hub, New Delhi').trim();

      // Field validation
      if (!donorName) {
        if (global.BhojToast) global.BhojToast.warning('Please enter the establishment or donor organization name.');
        document.getElementById('donor-name')?.focus();
        return;
      }
      if (!contactPhone) {
        if (global.BhojToast) global.BhojToast.warning('Please provide a direct contact phone number for the courier.');
        document.getElementById('contact-phone')?.focus();
        return;
      }
      if (!foodDescription) {
        if (global.BhojToast) global.BhojToast.warning('Please describe the food items and dishes.');
        document.getElementById('food-items-desc')?.focus();
        return;
      }

      // Construct payload for BhojStore
      const payload = {
        donorName,
        donorCategory,
        foodType,
        foodTitle: `${foodType}: ${foodDescription.split(',')[0]} (${servings} Servings)`,
        servings,
        dietType,
        cookedAt: new Date(preparedTime).toISOString(),
        shelfLifeHours,
        expiryTime: new Date(Date.now() + shelfLifeHours * 60 * 60 * 1000).toISOString(),
        lat,
        lng,
        address,
        contactPhone,
        contactPerson,
        itemsDescription: foodDescription,
        packagingType,
        storageTemp,
        temperatureRecorded: storageTemp,
        tempCheck: true,
        cleanPackaging: true,
        noSpoiledItems: true,
        hygieneCertified: true,
        notes: `Packed in ${packagingType}. Direct courier pickup authorized.`
      };

      try {
        const newDispatch = global.BhojStore.addDispatch(payload);

        // Success Feedback
        if (global.BhojToast) {
          global.BhojToast.success(`Surplus food dispatched! Unique ID: ${newDispatch.id}`);
        }

        // Show Success Modal
        showSuccessModal(newDispatch);

        // Reset Form
        form.reset();
        document.getElementById('servings-input').value = 120;
        document.getElementById('shelf-life').value = 4;
        document.getElementById('prepared-time').value = getLocalDateTimeString();
        updateCalculations();
        updateHygieneGate();
        renderRecentSubmissions();

      } catch (err) {
        console.error('[BhojDonate] Error adding dispatch:', err);
        if (global.BhojToast) {
          global.BhojToast.error('Failed to submit dispatch. Please check your inputs.');
        }
      }
    });
  }

  function showSuccessModal(dispatch) {
    const modal = document.getElementById('success-modal');
    if (!modal) return;

    document.getElementById('modal-success-id').textContent = dispatch.id;
    document.getElementById('modal-success-servings').textContent = `${dispatch.servings} servings (~${(dispatch.servings * 0.45).toFixed(1)} kg)`;
    document.getElementById('modal-success-zone').textContent = dispatch.address;

    const btnFeed = document.getElementById('btn-view-on-feed');
    if (btnFeed) {
      btnFeed.href = `volunteer.html?claim=${dispatch.id}`;
    }

    modal.classList.remove('hidden');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  function setupModalDismiss() {
    const modal = document.getElementById('success-modal');
    const dismissBtn = document.getElementById('btn-modal-dismiss');

    if (dismissBtn && modal) {
      dismissBtn.onclick = function () {
        modal.classList.add('hidden');
      };
    }

    if (modal) {
      modal.onclick = function (e) {
        if (e.target === modal) modal.classList.add('hidden');
      };
    }
  }

  // ==========================================
  // 7. Initialization & Event Bindings
  // ==========================================
  function initDonate() {
    // Set initial datetime-local to right now
    const preparedTimeInput = document.getElementById('prepared-time');
    if (preparedTimeInput && !preparedTimeInput.value) {
      preparedTimeInput.value = getLocalDateTimeString();
    }

    // Quick prepared time button handlers
    const btnNow = document.getElementById('btn-cooked-just-now');
    const btn1hr = document.getElementById('btn-cooked-1hr');
    const btn2hr = document.getElementById('btn-cooked-2hr');

    if (btnNow) btnNow.onclick = () => { if (preparedTimeInput) preparedTimeInput.value = getLocalDateTimeString(0); };
    if (btn1hr) btn1hr.onclick = () => { if (preparedTimeInput) preparedTimeInput.value = getLocalDateTimeString(1); };
    if (btn2hr) btn2hr.onclick = () => { if (preparedTimeInput) preparedTimeInput.value = getLocalDateTimeString(2); };

    // Preset servings buttons
    document.querySelectorAll('.btn-preset-servings').forEach((btn) => {
      btn.addEventListener('click', function () {
        const val = this.getAttribute('data-servings');
        const input = document.getElementById('servings-input');
        if (input && val) {
          input.value = val;
          updateCalculations();
        }
      });
    });

    // Servings & Shelf-Life input listeners
    const servingsInput = document.getElementById('servings-input');
    const shelfLifeInput = document.getElementById('shelf-life');

    if (servingsInput) servingsInput.addEventListener('input', updateCalculations);
    if (shelfLifeInput) shelfLifeInput.addEventListener('input', updateCalculations);

    // Hygiene Gate Checkboxes listeners
    ['chk-temp-check', 'chk-packaging', 'chk-no-spoilage'].forEach((id) => {
      const chk = document.getElementById(id);
      if (chk) chk.addEventListener('change', updateHygieneGate);
    });

    // Initialize Map, Preview, Submissions & Form
    initDonorMap();
    setupLivePreview();
    renderRecentSubmissions();
    setupFormSubmission();
    setupModalDismiss();

    // Initial calculations
    updateCalculations();
    updateHygieneGate();

    // Render Lucide icons
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }

    // Store sync listener for recent submissions
    if (global.BhojStore && typeof global.BhojStore.subscribe === 'function') {
      global.BhojStore.subscribe(function () {
        renderRecentSubmissions();
      });
    }
  }

  // Self-mount on DOM readiness
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDonate);
  } else {
    initDonate();
  }

})(typeof window !== 'undefined' ? window : this);
