/**
 * BhojVayasta - Central State Engine, Seed Data & Cross-Tab Synchronization
 * File: js/store.js
 * 
 * Provides:
 * - Persistent state storage under 'bhojvayasta_dispatches' in localStorage
 * - Real-time cross-tab synchronization via BroadcastChannel('bhojvayasta_sync')
 * - Pre-seeded realistic Delhi/NCR food recovery listings
 * - Fixed shelter relief centers / hunger hubs
 * - Complete CRUD & Status transitions (Available -> In-Transit -> Delivered)
 * - Dynamic Impact Metrics calculation engine
 * - Haversine distance & expiry timer utility calculations
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'bhojvayasta_dispatches';
  const CHANNEL_NAME = 'bhojvayasta_sync';
  const BASE_HISTORICAL_MEALS = 12400; // Base historical offset for established look

  // 4 Fixed Receiving Shelters & Slum Relief Hubs in Delhi/NCR
  const SHELTER_HUBS = [
    {
      id: 'SH-01',
      name: 'Asha Child Care Shelter',
      category: 'Child Care & Education',
      address: 'Near Delite Cinema, Asaf Ali Road, Daryaganj, Old Delhi',
      lat: 28.6420,
      lng: 77.2405,
      contactPerson: 'Sister Sunita',
      phone: '+91 98112 34567',
      mealDemand: 150,
      currentOccupancy: 135,
      acceptedCategories: ['Cooked Meals', 'Raw Produce', 'Packaged Food'],
      operatingHours: '08:00 AM - 10:00 PM'
    },
    {
      id: 'SH-02',
      name: 'Seva Urban Slum Relief Camp',
      category: 'Slum & Migrant Relief',
      address: 'Yamuna Khadar Belt, Near Kashmere Gate ISBT, North Delhi',
      lat: 28.6650,
      lng: 77.2320,
      contactPerson: 'Rajendra Sharma',
      phone: '+91 98223 45678',
      mealDemand: 250,
      currentOccupancy: 280,
      acceptedCategories: ['Cooked Meals', 'Raw Produce', 'Packaged Food', 'Bakery'],
      operatingHours: '24 Hours Emergency Hub'
    },
    {
      id: 'SH-03',
      name: 'Bal Vikas Orphanage',
      category: 'Youth Shelter',
      address: 'Near Metro Pillar 42, Ring Road, Lajpat Nagar IV, South Delhi',
      lat: 28.5680,
      lng: 77.2430,
      contactPerson: 'Meenakshi Verma',
      phone: '+91 98334 56789',
      mealDemand: 120,
      currentOccupancy: 110,
      acceptedCategories: ['Cooked Meals', 'Raw Produce', 'Dairy'],
      operatingHours: '07:30 AM - 09:30 PM'
    },
    {
      id: 'SH-04',
      name: 'Samarpan Elders & Destitute Home',
      category: 'Geriatric & Destitute Care',
      address: 'Institutional Area, Sector 11, Rohini, North West Delhi',
      lat: 28.7150,
      lng: 77.1210,
      contactPerson: 'Dr. Arvind Saxena',
      phone: '+91 98445 67890',
      mealDemand: 180,
      currentOccupancy: 175,
      acceptedCategories: ['Cooked Meals', 'Packaged Food'],
      operatingHours: '08:00 AM - 09:00 PM'
    }
  ];

  // Helper: Generates realistic pre-seeded initial dispatches
  function generateSeedData() {
    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;

    return [
      {
        id: 'BV-1082',
        donorName: 'Grand Imperial Wedding Banquet',
        donorCategory: 'Banquet Hall',
        foodType: 'Cooked Meals',
        foodTitle: 'Royal North Indian Feast Assortment',
        servings: 180,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 2 * HOUR_MS).toISOString(),
        shelfLifeHours: 4,
        expiryTime: new Date(now + 2 * HOUR_MS).toISOString(),
        status: 'Available',
        lat: 28.6280,
        lng: 77.2190,
        address: 'Barakhamba Road, Connaught Place, New Delhi',
        contactPhone: '+91 98101 23450',
        contactPerson: 'Sunil Manchanda (Catering Head)',
        itemsDescription: 'Shahi Paneer, Dal Makhani, Pulao, Tandoori Roti, Gulab Jamun (Packed in insulated food containers)',
        packagingType: 'Stainless Steel Insulated Urns & Foil Packs',
        storageTemp: 'Hot (> 65°C)',
        temperatureRecorded: '68°C',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: null,
        volunteerPhone: null,
        targetShelter: null,
        notes: 'Vehicular access via Gate 3 for easy pickup. Ground floor dispatch dock.',
        createdAt: new Date(now - 2 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 2 * HOUR_MS).toISOString(),
          inTransit: null,
          delivered: null
        }
      },
      {
        id: 'BV-2401',
        donorName: 'TechSpace Corporate Dining Hall',
        donorCategory: 'Corporate Cafeteria',
        foodType: 'Cooked Meals',
        foodTitle: 'Corporate Buffet Surplus (Lunch Batch)',
        servings: 95,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 1 * HOUR_MS).toISOString(),
        shelfLifeHours: 5,
        expiryTime: new Date(now + 4 * HOUR_MS).toISOString(),
        status: 'Available',
        lat: 28.5921,
        lng: 77.0460,
        address: 'Tower C, TechSpace Campus, Sector 21, Dwarka, New Delhi',
        contactPhone: '+91 98115 67891',
        contactPerson: 'Kavita Chawla (Facility Admin)',
        itemsDescription: 'Jeera Rice, Yellow Tadka Dal, Mixed Seasonal Veg, Phulkas, Fresh Curd cups',
        packagingType: 'Disposable Eco-Friendly Food Trays',
        storageTemp: 'Warm (~ 60°C)',
        temperatureRecorded: '64°C',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: null,
        volunteerPhone: null,
        targetShelter: null,
        notes: 'Security check cleared; inform receptionist at Tower C security desk upon arrival.',
        createdAt: new Date(now - 1 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 1 * HOUR_MS).toISOString(),
          inTransit: null,
          delivered: null
        }
      },
      {
        id: 'BV-3194',
        donorName: 'FreshMart Supermarket Hub',
        donorCategory: 'Retail Supermarket',
        foodType: 'Raw Produce',
        foodTitle: 'Fresh Farm Produce & Fruit Crates',
        servings: 120,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 6 * HOUR_MS).toISOString(),
        shelfLifeHours: 24,
        expiryTime: new Date(now + 18 * HOUR_MS).toISOString(),
        status: 'Available',
        lat: 28.5355,
        lng: 77.3910,
        address: 'Logix Techno Zone, Sector 62, Noida, NCR',
        contactPhone: '+91 98711 22334',
        contactPerson: 'Vikas Gupta (Store Manager)',
        itemsDescription: 'Apples, Bananas, Farm Spinach crates, Tomatoes, Potatoes, Uncut Musk Melons',
        packagingType: 'Ventilated Plastic Crates',
        storageTemp: 'Ambient / Cool (18°C)',
        temperatureRecorded: '19°C',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: null,
        volunteerPhone: null,
        targetShelter: null,
        notes: 'Loading bay is situated at the basement ramp. Trolleys available on-site.',
        createdAt: new Date(now - 6 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 6 * HOUR_MS).toISOString(),
          inTransit: null,
          delivered: null
        }
      },
      {
        id: 'BV-4820',
        donorName: 'Royal Heritage Hotel Buffet',
        donorCategory: '5-Star Luxury Hotel',
        foodType: 'Cooked Meals',
        foodTitle: 'Gourmet Dinner Buffet Surplus',
        servings: 210,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 2.5 * HOUR_MS).toISOString(),
        shelfLifeHours: 3.5,
        expiryTime: new Date(now + 1 * HOUR_MS).toISOString(),
        status: 'In-Transit',
        lat: 28.6100,
        lng: 77.2300,
        address: 'Lodhi Institutional Area, Near IHC, New Delhi',
        contactPhone: '+91 98102 99887',
        contactPerson: 'Chef Rajesh Bhatt',
        itemsDescription: 'Subz Biryani, Paneer Lababdar, Dal Bukhara, Roomali Roti, Boondi Raita',
        packagingType: 'Heavy Commercial Foil Tins',
        storageTemp: 'Hot (> 65°C)',
        temperatureRecorded: '67°C',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: 'Rohan V.',
        volunteerPhone: '+91 98188 90123',
        targetShelter: 'Asha Child Care Shelter',
        notes: 'Rohan V. picked up at 14:15. Courier en route on electric delivery two-wheeler.',
        createdAt: new Date(now - 2.5 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 2.5 * HOUR_MS).toISOString(),
          inTransit: new Date(now - 0.4 * HOUR_MS).toISOString(),
          delivered: null
        }
      },
      {
        id: 'BV-5172',
        donorName: 'GreenBowl Cloud Kitchen',
        donorCategory: 'Commercial Kitchen',
        foodType: 'Cooked Meals',
        foodTitle: 'Nutritious Millet Khichdi & Lentil Bowls',
        servings: 150,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 5 * HOUR_MS).toISOString(),
        shelfLifeHours: 4,
        expiryTime: new Date(now - 1 * HOUR_MS).toISOString(),
        status: 'Delivered',
        lat: 28.6448,
        lng: 77.2167,
        address: 'Commercial Complex, Pusa Road, Karol Bagh, New Delhi',
        contactPhone: '+91 98991 12233',
        contactPerson: 'Simran Anand',
        itemsDescription: 'Organic Bajra & Moong Dal Khichdi, Steamed Vegetables, Kadhi',
        packagingType: 'Biodegradable Meal Boxes',
        storageTemp: 'Warm',
        temperatureRecorded: '63°C',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: 'Priya S.',
        volunteerPhone: '+91 98733 44556',
        targetShelter: 'Seva Urban Slum Relief Camp',
        notes: 'Handed over directly to Rajendra Sharma. Distributed to 150 migrant workers and children.',
        createdAt: new Date(now - 5 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 5 * HOUR_MS).toISOString(),
          inTransit: new Date(now - 3.5 * HOUR_MS).toISOString(),
          delivered: new Date(now - 2.2 * HOUR_MS).toISOString()
        }
      },
      {
        id: 'BV-6893',
        donorName: 'Metro Wholesale Grocers',
        donorCategory: 'Wholesale Depot',
        foodType: 'Raw Produce',
        foodTitle: 'Bulk Staples & Fresh Vegetables',
        servings: 300,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 12 * HOUR_MS).toISOString(),
        shelfLifeHours: 48,
        expiryTime: new Date(now + 36 * HOUR_MS).toISOString(),
        status: 'Delivered',
        lat: 28.5700,
        lng: 77.3200,
        address: 'Wholesale Market Block B, Sector 18, Noida, NCR',
        contactPhone: '+91 98700 33445',
        contactPerson: 'Deepak Singhal',
        itemsDescription: 'Wheat Flour (Atta) sacks, Toor Dal, Mustard Oil cans, Potato & Onion sacks',
        packagingType: 'Jute Bags & Commercial Cartons',
        storageTemp: 'Ambient Dry (22°C)',
        temperatureRecorded: '22°C',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: 'Aman K.',
        volunteerPhone: '+91 98114 77889',
        targetShelter: 'Bal Vikas Orphanage',
        notes: 'Delivered in mini-cargo truck. Stocked in orphanage pantry for week-long cooking.',
        createdAt: new Date(now - 12 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 12 * HOUR_MS).toISOString(),
          inTransit: new Date(now - 8 * HOUR_MS).toISOString(),
          delivered: new Date(now - 6 * HOUR_MS).toISOString()
        }
      }
    ];
  }

  // Cross-Tab Broadcast Channel initialization with safety fallback
  let syncChannel = null;
  try {
    if (typeof global.BroadcastChannel !== 'undefined') {
      syncChannel = new global.BroadcastChannel(CHANNEL_NAME);
    }
  } catch (err) {
    console.warn('[BhojStore] BroadcastChannel unsupported or restricted, using localStorage events fallback.');
  }

  // Local in-memory listeners
  const subscribers = new Set();

  function notifySubscribers(event) {
    subscribers.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[BhojStore] Subscriber callback error:', err);
      }
    });
  }

  function broadcastEvent(type, payload) {
    const event = {
      type,
      payload,
      timestamp: Date.now(),
      senderTab: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('bhoj_tab_id') : 'tab'
    };

    if (syncChannel) {
      try {
        syncChannel.postMessage(event);
      } catch (e) {
        console.warn('[BhojStore] Broadcast postMessage error:', e);
      }
    }

    // Trigger local listeners
    notifySubscribers(event);
  }

  // Assign unique tab identifier for debugging cross-tab traffic
  if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('bhoj_tab_id')) {
    sessionStorage.setItem('bhoj_tab_id', 'tab_' + Math.random().toString(36).substring(2, 9));
  }

  // Listen for broadcast messages from other tabs
  if (syncChannel) {
    syncChannel.onmessage = function (e) {
      if (e && e.data) {
        notifySubscribers(e.data);
      }
    };
  }

  // Fallback storage event listener for cross-tab sync
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) {
        notifySubscribers({
          type: 'STORAGE_EXTERNAL_UPDATE',
          payload: null,
          timestamp: Date.now()
        });
      }
    });
  }

  // Core Store Engine Definition
  const BhojStore = {
    /**
     * Initializes the store in localStorage if empty or invalid.
     * Guarantees realistic seed data is available immediately.
     */
    initStore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const seeds = generateSeedData();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
          console.log('[BhojStore] Initialized with 6 realistic Delhi/NCR dispatches.');
          return seeds;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          const seeds = generateSeedData();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
          return seeds;
        }
        return parsed;
      } catch (e) {
        console.error('[BhojStore] Error reading localStorage, resetting to seed data:', e);
        const seeds = generateSeedData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
        return seeds;
      }
    },

    /**
     * Retrieves all food dispatches sorted by newest first.
     * @returns {Array} List of dispatches
     */
    getDispatches() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return this.initStore();
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : this.initStore();
      } catch (e) {
        console.error('[BhojStore] getDispatches parse error:', e);
        return this.initStore();
      }
    },

    /**
     * Finds a dispatch by its unique ID.
     * @param {string} id - e.g. "BV-1082"
     * @returns {Object|null}
     */
    getDispatchById(id) {
      if (!id) return null;
      const list = this.getDispatches();
      return list.find((item) => item.id.toUpperCase() === id.toUpperCase()) || null;
    },

    /**
     * Retrieves the 4 fixed hunger relief shelters.
     * @returns {Array} List of fixed shelter hubs
     */
    getShelters() {
      return JSON.parse(JSON.stringify(SHELTER_HUBS));
    },

    /**
     * Finds a shelter by exact name or ID.
     * @param {string} nameOrId
     * @returns {Object|null}
     */
    getShelter(nameOrId) {
      if (!nameOrId) return null;
      return SHELTER_HUBS.find(
        (s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase()
      ) || null;
    },

    /**
     * Adds a new surplus food dispatch with mandatory hygiene validation flags.
     * @param {Object} data - Form input fields
     * @returns {Object} Newly created dispatch record
     */
    addDispatch(data) {
      if (!data || typeof data !== 'object') {
        throw new Error('[BhojStore] Invalid dispatch data provided.');
      }

      const list = this.getDispatches();
      const now = Date.now();

      // Generate guaranteed unique BV-XXXX code
      let newId = '';
      do {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        newId = `BV-${randomNum}`;
      } while (list.some((item) => item.id === newId));

      const shelfLifeHours = Number(data.shelfLifeHours) > 0 ? Number(data.shelfLifeHours) : 4;
      const servings = Math.max(1, parseInt(data.servings, 10) || 50);
      const cookedAt = data.cookedAt ? new Date(data.cookedAt).toISOString() : new Date(now).toISOString();
      const expiryTime = data.expiryTime 
        ? new Date(data.expiryTime).toISOString() 
        : new Date(now + shelfLifeHours * 60 * 60 * 1000).toISOString();

      const newDispatch = {
        id: newId,
        donorName: String(data.donorName || 'Anonymous Donor').trim(),
        donorCategory: data.donorCategory || 'Commercial Kitchen',
        foodType: data.foodType || 'Cooked Meals',
        foodTitle: data.foodTitle || `${data.donorName || 'Surplus'} Food Recovery Batch`,
        servings: servings,
        dietType: data.dietType || 'Vegetarian',
        cookedAt: cookedAt,
        shelfLifeHours: shelfLifeHours,
        expiryTime: expiryTime,
        status: 'Available',
        lat: parseFloat(data.lat) || 28.6139,
        lng: parseFloat(data.lng) || 77.2090,
        address: data.address || 'Central Delhi Hub, New Delhi',
        contactPhone: data.contactPhone || '+91 98000 00000',
        contactPerson: data.contactPerson || 'Dispatch Coordinator',
        itemsDescription: data.itemsDescription || 'Surplus hot cooked meal portions packed hygienically.',
        packagingType: data.packagingType || 'Food Grade Containers',
        storageTemp: data.storageTemp || 'Hot (> 65°C)',
        temperatureRecorded: data.temperatureRecorded || '65°C',
        safetyChecklist: {
          tempCheck: data.tempCheck !== undefined ? Boolean(data.tempCheck) : true,
          cleanPackaging: data.cleanPackaging !== undefined ? Boolean(data.cleanPackaging) : true,
          noSpoiledItems: data.noSpoiledItems !== undefined ? Boolean(data.noSpoiledItems) : true,
          hygieneCertified: data.hygieneCertified !== undefined ? Boolean(data.hygieneCertified) : true
        },
        volunteer: null,
        volunteerPhone: null,
        targetShelter: null,
        notes: data.notes || 'Ready for immediate pickup by registered community courier.',
        createdAt: new Date(now).toISOString(),
        statusTimestamps: {
          available: new Date(now).toISOString(),
          inTransit: null,
          delivered: null
        }
      };

      // Unshift to keep newest at the top
      list.unshift(newDispatch);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      broadcastEvent('DISPATCH_ADDED', newDispatch);
      return newDispatch;
    },

    /**
     * Updates dispatch status along the lifecycle: Available -> In-Transit -> Delivered.
     * @param {string} id - Dispatch ID (e.g. 'BV-1082')
     * @param {'Available'|'In-Transit'|'Delivered'} newStatus
     * @param {string} [volunteerName] - Name of courier taking the pickup
     * @param {string} [shelterName] - Name of receiving hunger shelter
     * @returns {Object} Updated dispatch
     */
    updateStatus(id, newStatus, volunteerName = null, shelterName = null) {
      if (!id || !newStatus) {
        throw new Error('[BhojStore] updateStatus requires valid id and newStatus.');
      }

      const list = this.getDispatches();
      const index = list.findIndex((item) => item.id.toUpperCase() === id.toUpperCase());

      if (index === -1) {
        throw new Error(`[BhojStore] Dispatch with ID ${id} not found.`);
      }

      const item = list[index];
      const validStatuses = ['Available', 'In-Transit', 'Delivered'];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`[BhojStore] Invalid status "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
      }

      const nowIso = new Date().toISOString();
      item.status = newStatus;

      if (!item.statusTimestamps) {
        item.statusTimestamps = {
          available: item.createdAt || nowIso,
          inTransit: null,
          delivered: null
        };
      }

      if (newStatus === 'In-Transit') {
        item.volunteer = volunteerName || item.volunteer || 'Community Courier';
        item.targetShelter = shelterName || item.targetShelter || 'Asha Child Care Shelter';
        item.statusTimestamps.inTransit = nowIso;
      } else if (newStatus === 'Delivered') {
        if (volunteerName) item.volunteer = volunteerName;
        if (shelterName) item.targetShelter = shelterName;
        item.statusTimestamps.delivered = nowIso;
      } else if (newStatus === 'Available') {
        // Reset in case a pickup was aborted
        item.volunteer = null;
        item.targetShelter = null;
        item.statusTimestamps.inTransit = null;
        item.statusTimestamps.delivered = null;
      }

      list[index] = item;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      broadcastEvent('STATUS_UPDATED', item);
      return item;
    },

    /**
     * Computes real-time dynamic impact metrics.
     * @returns {Object} Calculated metrics
     */
    getImpactMetrics() {
      const list = this.getDispatches();
      
      let deliveredServings = 0;
      let activeCount = 0;
      let availableCount = 0;
      let inTransitCount = 0;
      let deliveredCount = 0;

      list.forEach((item) => {
        const servings = parseInt(item.servings, 10) || 0;
        if (item.status === 'Delivered') {
          deliveredServings += servings;
          deliveredCount++;
        } else if (item.status === 'In-Transit') {
          activeCount++;
          inTransitCount++;
        } else if (item.status === 'Available') {
          activeCount++;
          availableCount++;
        }
      });

      // Total meals = delivered items + historical established offset
      const totalMealsServed = deliveredServings + BASE_HISTORICAL_MEALS;

      // 1 meal ≈ 450g (0.45 kg). Metric tons = (meals * 0.45) / 1000
      const metricTonsDiverted = parseFloat(((totalMealsServed * 0.45) / 1000).toFixed(2));

      // 1 meal diverted avoids ≈ 1.12 kg CO2 equivalent greenhouse emissions
      const co2SavedKg = parseFloat((totalMealsServed * 1.12).toFixed(2));

      // Active couriers mobilized (distinct volunteers + base offset)
      const volunteerSet = new Set();
      list.forEach((i) => {
        if (i.volunteer && i.volunteer.trim()) volunteerSet.add(i.volunteer.trim());
      });
      const activeVolunteersCount = volunteerSet.size + 42; // Base registered volunteers

      return {
        totalMealsServed,
        metricTonsDiverted,
        activePickupsCount: activeCount,
        availablePickupsCount: availableCount,
        inTransitCount,
        deliveredCount,
        co2SavedKg,
        activeVolunteersCount,
        sheltersSupported: SHELTER_HUBS.length,
        baseHistoricalMeals: BASE_HISTORICAL_MEALS,
        totalTrackedBatches: list.length
      };
    },

    /**
     * Resets localStorage with fresh demo seed data for viva / evaluation demos.
     * Triggers broadcast so all active tabs reset synchronously.
     */
    resetDemoData() {
      const seeds = generateSeedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      broadcastEvent('DEMO_DATA_RESET', seeds);
      console.log('[BhojStore] Demo data successfully reset to 6 seed items.');
      return seeds;
    },

    /**
     * Subscribes a listener callback to real-time state mutations.
     * @param {Function} callback - Called with { type, payload, timestamp }
     * @returns {Function} Unsubscribe handle
     */
    subscribe(callback) {
      if (typeof callback !== 'function') return () => {};
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    // ==========================================
    // Domain & Utility Calculations
    // ==========================================

    /**
     * Computes Haversine great-circle distance between two GPS coordinates in kilometers.
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number} Distance in km, rounded to 1 decimal place
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
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
    },

    /**
     * Calculates countdown time remaining before food expiry.
     * Flags urgent items (< 2 hours remaining) for visual pulsation.
     * @param {Object} dispatch
     * @returns {Object} { totalMinutes, hours, minutes, isExpired, isUrgent, formattedText }
     */
    getExpiryStatus(dispatch) {
      if (!dispatch || !dispatch.expiryTime) {
        return {
          totalMinutes: 0,
          hours: 0,
          minutes: 0,
          isExpired: false,
          isUrgent: false,
          formattedText: 'Unknown'
        };
      }

      if (dispatch.status === 'Delivered') {
        return {
          totalMinutes: 0,
          hours: 0,
          minutes: 0,
          isExpired: false,
          isUrgent: false,
          formattedText: 'Delivered on Time'
        };
      }

      const expiryMs = new Date(dispatch.expiryTime).getTime();
      const diffMs = expiryMs - Date.now();

      if (diffMs <= 0) {
        return {
          totalMinutes: 0,
          hours: 0,
          minutes: 0,
          isExpired: true,
          isUrgent: true,
          formattedText: 'Expired'
        };
      }

      const totalMinutes = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const isUrgent = totalMinutes <= 120; // Less than 2 hours is considered critical urgency

      let formattedText = '';
      if (hours > 0) {
        formattedText = `${hours}h ${minutes}m left`;
      } else {
        formattedText = `${minutes}m left`;
      }

      return {
        totalMinutes,
        hours,
        minutes,
        isExpired: false,
        isUrgent,
        formattedText
      };
    }
  };

  // Auto-initialize store on script load
  BhojStore.initStore();

  // Export globally
  global.BhojStore = BhojStore;

})(typeof window !== 'undefined' ? window : this);
