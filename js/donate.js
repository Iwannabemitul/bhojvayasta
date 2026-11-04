/**
 * BhojVayasta - Surplus Food Dispatch Report Portal & Safety Gate Logic
 * File: js/donate.js
 * 
 * Theme: Warm Editorial & Civic Logistics
 * Preserves 100% of BhojStore logic and calculations
 */

(function (global) {
  'use strict';

  let donorMap = null;
  let donorMarker = null;

  const DEFAULT_LAT = 28.6280;
  const DEFAULT_LNG = 77.2190;

  function getLocalDateTimeString(offsetHours = 0) {
    const d = new Date(Date.now() - offsetHours * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

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
  // 1. Calculations: Weight & Safe Window
  // ==========================================
  function updateCalculations() {
    const servingsInput = document.getElementById('servings-input');
    const servings = Math.max(1, parseInt(servingsInput ? servingsInput.value : 120, 10) || 120);

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

    const shelfLifeInput = document.getElementById('shelf-life');
    const shelfLifeHours = parseInt(shelfLifeInput ? shelfLifeInput.value : 4, 10) || 4;

    const shelfLifeDisplay = document.getElementById('shelf-life-display');
    const urgencyBadge = document.getElementById('urgency-badge');
    const expiryTimestampEl = document.getElementById('calc-expiry-timestamp');
    const previewExpiryEl = document.getElementById('preview-expiry');

    if (shelfLifeDisplay) shelfLifeDisplay.textContent = `${shelfLifeHours} Hours`;
    if (expiryTimestampEl) expiryTimestampEl.textContent = formatExpiryTime(shelfLifeHours);
    if (previewExpiryEl) previewExpiryEl.textContent = `${shelfLifeHours}h left`;

    if (urgencyBadge) {
      if (shelfLifeHours < 3) {
        urgencyBadge.textContent = 'Critical < 3 hrs';
        urgencyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF2F2] text-[#C84B31] border border-[#FCA5A5]';
      } else if (shelfLifeHours <= 6) {
        urgencyBadge.textContent = 'Moderate 3-6 hrs';
        urgencyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]';
      } else {
        urgencyBadge.textContent = 'Stable > 6 hrs';
        urgencyBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]';
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

    const countText = document.getElementById('compliance-count-text');
    const pctText = document.getElementById('compliance-progress-pct');
    const progressBar = document.getElementById('compliance-progress-bar');
    const complianceBadge = document.getElementById('compliance-badge');
    const gateLockMsg = document.getElementById('gate-lock-message');
    const btnSubmit = document.getElementById('btn-submit-dispatch');
    const btnSubmitLabel = document.getElementById('btn-submit-label');

    if (countText) countText.textContent = `${checkedCount} / 3 Checked`;
    if (pctText) pctText.textContent = `${progressPct}%`;
    if (progressBar) progressBar.style.width = `${progressPct}%`;

    if (complianceBadge) {
      if (checkedCount === 3) {
        complianceBadge.className = 'px-3 py-1 rounded text-xs font-mono font-bold bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]';
      } else {
        complianceBadge.className = 'px-3 py-1 rounded text-xs font-mono font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]';
      }
    }

    if (btnSubmit) {
      if (checkedCount === 3) {
        btnSubmit.disabled = false;
        btnSubmit.className = 'w-full flex items-center justify-center gap-2 px-8 py-3.5 rounded text-sm font-semibold uppercase tracking-wider bg-[#C84B31] hover:bg-[#A83820] text-white cursor-pointer shadow-sm transition-all duration-200';
        if (btnSubmitLabel) btnSubmitLabel.textContent = 'Send Food to Relief Network (Ready for Pickup)';

        if (gateLockMsg) {
          gateLockMsg.className = 'p-3 rounded bg-[#E8F3EE] border border-[#A3C9B8] text-xs text-[#1B4332] font-mono';
          gateLockMsg.innerHTML = '<strong>All 3 safety checks verified.</strong> Ready for volunteer pickup.';
        }
      } else {
        btnSubmit.disabled = true;
        btnSubmit.className = 'w-full flex items-center justify-center gap-2 px-8 py-3.5 rounded text-sm font-semibold uppercase tracking-wider bg-[#EFECE6] text-[#525B55] border border-[#DCD9D0] cursor-not-allowed opacity-70 transition-all duration-200';
        if (btnSubmitLabel) btnSubmitLabel.textContent = `Unlock By Checking All 3 Boxes (${checkedCount}/3)`;

        if (gateLockMsg) {
          gateLockMsg.className = 'p-3 rounded bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#B45309] font-mono';
          gateLockMsg.innerHTML = 'Please check all 3 boxes above to submit your donation.';
        }
      }
    }
  }

  // ==========================================
  // 3. Leaflet Mini Map (Key-Free OpenStreetMap)
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

      // Reliable Key-Free Map Tiles: Esri World Street Map (Enterprise CDN, No API key, No 403 blocks on file:/// or localhost)
      const primaryTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &bull; Map &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
      });

      primaryTiles.on('tileerror', function (err) {
        if (err && err.tile && err.coords) {
          err.tile.src = `https://a.tile.openstreetmap.fr/osmfr/${err.coords.z}/${err.coords.x}/${err.coords.y}.png`;
        }
      });

      primaryTiles.addTo(donorMap);

      const pinIcon = L.divIcon({
        className: 'bhoj-pin-wrapper',
        html: `
          <div class="bhoj-pin-body pin-available">
            <svg class="bhoj-pin-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      donorMarker = L.marker([DEFAULT_LAT, DEFAULT_LNG], {
        draggable: true,
        icon: pinIcon
      }).addTo(donorMap);

      donorMarker.bindPopup('<strong>Pickup Location</strong><br>Drag pin or click map to move');

      donorMarker.on('dragend', function (e) {
        const coord = e.target.getLatLng();
        setCoordinates(coord.lat, coord.lng);
      });

      donorMap.on('click', function (e) {
        donorMarker.setLatLng(e.latlng);
        setCoordinates(e.latlng.lat, e.latlng.lng);
      });

      // Browser Live Geolocation Button Handler
      const gpsBtn = document.getElementById('btn-donor-gps');
      const gpsBtnText = document.getElementById('btn-donor-gps-text');

      if (gpsBtn) {
        gpsBtn.addEventListener('click', function () {
          if (!navigator.geolocation) {
            if (global.BhojToast) global.BhojToast.error('Geolocation is not supported by your browser.');
            return;
          }

          if (gpsBtnText) gpsBtnText.textContent = 'Acquiring GPS fix...';
          gpsBtn.disabled = true;

          navigator.geolocation.getCurrentPosition(
            async function (pos) {
              if (gpsBtnText) gpsBtnText.textContent = 'Use My Current GPS Location';
              gpsBtn.disabled = false;

              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              const accuracy = Math.round(pos.coords.accuracy || 25);

              donorMarker.setLatLng([lat, lng]);
              donorMap.flyTo([lat, lng], 14, { duration: 1.2 });
              setCoordinates(lat, lng);

              // Attempt Nominatim reverse geocode
              try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, {
                  headers: { 'Accept': 'application/json' }
                });
                if (res.ok) {
                  const data = await res.json();
                  const address = data.display_name || (data.address ? `${data.address.road || ''}, ${data.address.suburb || data.address.city || ''}` : '');
                  if (address) {
                    setCoordinates(lat, lng, address);
                    if (global.BhojToast) global.BhojToast.success(`Located at ${address.split(',')[0]} (±${accuracy}m)`);
                    return;
                  }
                }
              } catch (geoErr) {
                console.warn('[BhojDonate] Reverse geocode error:', geoErr);
              }

              if (global.BhojToast) {
                global.BhojToast.success(`GPS coordinates captured: [${lat.toFixed(4)}, ${lng.toFixed(4)}] (±${accuracy}m)`);
              }
            },
            function (err) {
              if (gpsBtnText) gpsBtnText.textContent = 'Use My Current GPS Location';
              gpsBtn.disabled = false;
              console.warn('[BhojDonate] Geolocation error:', err);
              if (global.BhojToast) {
                global.BhojToast.error('Could not get GPS fix. Please select a quick preset or click on the map.');
              }
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        });
      }

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
            donorMap.flyTo([lat, lng], 13, { duration: 1 });
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
      previewAddr.textContent = currentAddr;
    }
  }

  // ==========================================
  // 4. Live Feed Preview Card
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
        if (previewAddr) previewAddr.textContent = this.value.trim() || 'Barakhamba Road, Connaught Place, New Delhi';
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

    const foodTypeRadios = document.querySelectorAll('input[name="foodType"]');
    foodTypeRadios.forEach((radio) => {
      radio.addEventListener('change', function () {
        if (previewType) {
          previewType.textContent = this.value;
          if (this.value === 'Cooked Meals') {
            previewType.className = 'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8F3EE] text-[#1B4332] border border-[#A3C9B8]';
          } else {
            previewType.className = 'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]';
          }
        }

        document.querySelectorAll('.bhoj-radio-card').forEach((card) => {
          card.className = 'bhoj-radio-card cursor-pointer p-4 rounded border border-[#DCD9D0] bg-white transition-all flex items-start gap-3';
        });

        const parentCard = this.closest('.bhoj-radio-card');
        if (parentCard) {
          if (this.value === 'Cooked Meals') {
            parentCard.className = 'bhoj-radio-card cursor-pointer p-4 rounded border-2 border-[#1B4332] bg-[#E8F3EE] transition-all flex items-start gap-3';
          } else {
            parentCard.className = 'bhoj-radio-card cursor-pointer p-4 rounded border-2 border-[#C84B31] bg-[#FEF3C7] transition-all flex items-start gap-3';
          }
        }

        // Context-aware defaults for temperature, packaging, and safe window
        const tempInput = document.getElementById('temperature-input');
        const packSelect = document.getElementById('packaging-type');
        const shelfInput = document.getElementById('shelf-life');

        if (this.value === 'Raw Produce') {
          if (tempInput) tempInput.value = '22°C (Ambient)';
          if (packSelect) packSelect.value = 'Commercial Ventilated Plastic Crates';
          if (shelfInput) shelfInput.value = 24;
        } else {
          if (tempInput) tempInput.value = '68°C';
          if (packSelect) packSelect.value = 'Sealed Aluminum Food-Grade Trays';
          if (shelfInput) shelfInput.value = 4;
        }
        updateCalculations();
      });
    });
  }

  // ==========================================
  // 5. Recent Submissions Feed
  // ==========================================
  function renderRecentSubmissions() {
    if (!global.BhojStore) return;

    const listContainer = document.getElementById('recent-submissions-list');
    if (!listContainer) return;

    const dispatches = global.BhojStore.getDispatches();
    const recent = dispatches.slice(0, 3);

    if (recent.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-3 text-xs text-[#525B55] font-mono">
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
          <div class="p-3 rounded bg-[#FAF9F6] border border-[#DCD9D0] flex items-center justify-between gap-3 text-xs">
            <div>
              <div class="flex items-center gap-1.5 font-mono">
                <span class="font-bold text-[#141E18]">${item.id}</span>
                <span class="text-[#DCD9D0]">•</span>
                <span class="font-sans font-medium text-[#141E18] truncate max-w-[150px]">${item.donorName}</span>
              </div>
              <div class="text-[11px] text-[#525B55] font-mono mt-0.5">
                ${item.servings} serv • ${item.foodType}
              </div>
            </div>
            <span class="status-pill ${statusBadge}">
              <span class="status-dot"></span>
              <span>${item.status}</span>
            </span>
          </div>
        `;
      })
      .join('');
  }

  // ==========================================
  // 6. Form Submission
  // ==========================================
  function setupFormSubmission() {
    const form = document.getElementById('dispatch-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const chkTemp = document.getElementById('chk-temp-check');
      const chkPackaging = document.getElementById('chk-packaging');
      const chkSpoilage = document.getElementById('chk-no-spoilage');

      if (!chkTemp.checked || !chkPackaging.checked || !chkSpoilage.checked) {
        if (global.BhojToast) {
          global.BhojToast.error('Please check all 3 safety boxes before submitting.');
        }
        document.getElementById('hygiene-gate-container')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }

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

      if (!donorName) {
        if (global.BhojToast) global.BhojToast.warning('Please enter the kitchen or organization name.');
        document.getElementById('donor-name')?.focus();
        return;
      }
      if (!contactPhone) {
        if (global.BhojToast) global.BhojToast.warning('Please enter a contact phone number.');
        document.getElementById('contact-phone')?.focus();
        return;
      }
      if (!foodDescription) {
        if (global.BhojToast) global.BhojToast.warning('Please list the food items.');
        document.getElementById('food-items-desc')?.focus();
        return;
      }

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

        if (global.BhojToast) {
          global.BhojToast.success(`Food donation posted! ID: ${newDispatch.id}`);
        }

        showSuccessModal(newDispatch);

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
          global.BhojToast.error('Failed to submit dispatch.');
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
    if (btnFeed) btnFeed.href = `volunteer.html?claim=${dispatch.id}`;

    modal.classList.remove('hidden');
  }

  function setupModalDismiss() {
    const modal = document.getElementById('success-modal');
    const dismissBtn = document.getElementById('btn-modal-dismiss');

    if (dismissBtn && modal) {
      dismissBtn.onclick = () => modal.classList.add('hidden');
    }
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      };
    }
  }

  function initDonate() {
    const preparedTimeInput = document.getElementById('prepared-time');
    if (preparedTimeInput && !preparedTimeInput.value) {
      preparedTimeInput.value = getLocalDateTimeString();
    }

    const btnNow = document.getElementById('btn-cooked-just-now');
    const btn1hr = document.getElementById('btn-cooked-1hr');
    const btn2hr = document.getElementById('btn-cooked-2hr');

    if (btnNow) btnNow.onclick = () => { if (preparedTimeInput) preparedTimeInput.value = getLocalDateTimeString(0); };
    if (btn1hr) btn1hr.onclick = () => { if (preparedTimeInput) preparedTimeInput.value = getLocalDateTimeString(1); };
    if (btn2hr) btn2hr.onclick = () => { if (preparedTimeInput) preparedTimeInput.value = getLocalDateTimeString(2); };

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

    const servingsInput = document.getElementById('servings-input');
    const shelfLifeInput = document.getElementById('shelf-life');

    if (servingsInput) servingsInput.addEventListener('input', updateCalculations);
    if (shelfLifeInput) shelfLifeInput.addEventListener('input', updateCalculations);

    ['chk-temp-check', 'chk-packaging', 'chk-no-spoilage'].forEach((id) => {
      const chk = document.getElementById(id);
      if (chk) chk.addEventListener('change', updateHygieneGate);
    });

    initDonorMap();
    setupLivePreview();
    renderRecentSubmissions();
    setupFormSubmission();
    setupModalDismiss();

    updateCalculations();
    updateHygieneGate();

    if (global.BhojStore && typeof global.BhojStore.subscribe === 'function') {
      global.BhojStore.subscribe(function () {
        renderRecentSubmissions();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDonate);
  } else {
    initDonate();
  }

})(typeof window !== 'undefined' ? window : this);
