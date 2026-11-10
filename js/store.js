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

  const STORAGE_KEY = 'bhojvayasta_dispatches_v2';
  const CHANNEL_NAME = 'bhojvayasta_sync';
  const BASE_HISTORICAL_MEALS = 12400; // Base historical offset for established look

  /**
   * SafeStorage Facade Pattern
   * 
   * Wraps browser localStorage to catch:
   * 1. QuotaExceededError (e.g. mobile browser storage limits)
   * 2. SecurityError (e.g. Chrome/Firefox private windows, Safari iframe block)
   * 3. Environments where window or localStorage is undefined
   * 
   * Seamlessly degrades to an in-memory session dictionary so that
   * state mutations never throw unhandled fatal exceptions.
   */
  const SafeStorage = (function () {
    const memoryStore = new Map();
    let isNativeSupported = false;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const testKey = '__bhoj_test_write__';
        window.localStorage.setItem(testKey, testKey);
        window.localStorage.removeItem(testKey);
        isNativeSupported = true;
      }
    } catch (e) {
      console.warn('[BhojStore:SafeStorage] Native localStorage blocked or quota exceeded. Operating in-memory session fallback.', e);
      isNativeSupported = false;
    }

    return {
      memoryStore,
      getItem(key) {
        if (this.memoryStore && typeof this.memoryStore.has === 'function' && this.memoryStore.has(key)) {
          return this.memoryStore.get(key);
        }
        if (memoryStore.has(key)) {
          return memoryStore.get(key);
        }
        if (isNativeSupported) {
          try {
            return window.localStorage.getItem(key);
          } catch (e) {
            console.warn('[BhojStore:SafeStorage] Read failure on native storage; reading from fallback memory:', e);
            return memoryStore.has(key) ? memoryStore.get(key) : null;
          }
        }
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      },
      setItem(key, value) {
        const valStr = String(value);
        if (isNativeSupported) {
          try {
            window.localStorage.setItem(key, valStr);
            memoryStore.delete(key);
            return true;
          } catch (e) {
            console.warn('[BhojStore:SafeStorage] Write failure on native storage (QuotaExceeded/SecurityError). Falling back to memory:', e);
            memoryStore.set(key, valStr);
            return false;
          }
        }
        memoryStore.set(key, valStr);
        return true;
      },
      removeItem(key) {
        if (isNativeSupported) {
          try {
            window.localStorage.removeItem(key);
          } catch (e) {
            console.warn('[BhojStore:SafeStorage] RemoveItem failure on native storage:', e);
          }
        }
        memoryStore.delete(key);
      },
      isNative() {
        return isNativeSupported;
      }
    };
  })();

  // 7 Fixed Receiving Shelters & Slum Relief Hubs (Delhi/NCR + Jalandhar/Phagwara LPU Corridor)
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
      operatingHours: '08:00 AM - 10:00 PM',
      region: 'Delhi/NCR',
      corridor: 'Delhi/NCR',
      handoverPin: '4821'
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
      operatingHours: '24 Hours Emergency Hub',
      region: 'Delhi/NCR',
      corridor: 'Delhi/NCR',
      handoverPin: '5912'
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
      operatingHours: '07:30 AM - 09:30 PM',
      region: 'Delhi/NCR',
      corridor: 'Delhi/NCR',
      handoverPin: '7341'
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
      operatingHours: '08:00 AM - 09:00 PM',
      region: 'Delhi/NCR',
      corridor: 'Delhi/NCR',
      handoverPin: '2650'
    },
    {
      id: 'SH-05',
      name: 'Apahaj Ashram & Hunger Relief Center',
      category: 'Destitute & Hunger Relief',
      address: 'HMV Road, Patel Chowk, Jalandhar',
      lat: 31.3340,
      lng: 75.5680,
      contactPerson: 'Bhai Gurpreet Singh',
      phone: '+91 98150 11223',
      mealDemand: 200,
      currentOccupancy: 185,
      acceptedCategories: ['Cooked Meals', 'Raw Produce', 'Packaged Food'],
      operatingHours: '07:00 AM - 09:30 PM',
      region: 'Jalandhar',
      corridor: 'Punjab / Jalandhar / Phagwara',
      handoverPin: '6275'
    },
    {
      id: 'SH-06',
      name: 'Nari Niketan & Child Care Home',
      category: 'Women & Child Welfare',
      address: 'Nakodar Road, Near Model Town, Jalandhar',
      lat: 31.3090,
      lng: 75.5610,
      contactPerson: 'Smt. Paramjeet Kaur',
      phone: '+91 98722 33445',
      mealDemand: 140,
      currentOccupancy: 130,
      acceptedCategories: ['Cooked Meals', 'Dairy', 'Bakery'],
      operatingHours: '08:00 AM - 09:00 PM',
      region: 'Jalandhar',
      corridor: 'Punjab / Jalandhar / Phagwara',
      handoverPin: '9143'
    },
    {
      id: 'SH-07',
      name: 'Phagwara Seva Slum Relief Camp',
      category: 'Migrant & Slum Relief',
      address: 'GT Road, Near Chaheru / LPU Corridor, Phagwara',
      lat: 31.2580,
      lng: 75.7020,
      contactPerson: 'Harpreet Singh (Sevadar)',
      phone: '+91 98881 55667',
      mealDemand: 180,
      currentOccupancy: 195,
      acceptedCategories: ['Cooked Meals', 'Raw Produce', 'Packaged Food'],
      operatingHours: '24 Hours Emergency Hub',
      region: 'Jalandhar',
      corridor: 'Punjab / Jalandhar / Phagwara',
      handoverPin: '1588'
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
        region: 'Delhi/NCR',
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
        region: 'Delhi/NCR',
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
        region: 'Delhi/NCR',
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
        region: 'Delhi/NCR',
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
        region: 'Delhi/NCR',
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
        region: 'Delhi/NCR',
        notes: 'Delivered in mini-cargo truck. Stocked in orphanage pantry for week-long cooking.',
        createdAt: new Date(now - 12 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 12 * HOUR_MS).toISOString(),
          inTransit: new Date(now - 8 * HOUR_MS).toISOString(),
          delivered: new Date(now - 6 * HOUR_MS).toISOString()
        }
      },
      {
        id: 'BV-5012',
        donorName: 'UniMall & Central Mess Dining Hall (LPU Campus)',
        donorCategory: 'University Mess',
        foodType: 'Cooked Meals',
        foodTitle: 'Campus Mess Dinner Surplus Batch',
        servings: 240,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 1.5 * HOUR_MS).toISOString(),
        shelfLifeHours: 4.5,
        expiryTime: new Date(now + 3 * HOUR_MS).toISOString(),
        status: 'Available',
        lat: 31.2554,
        lng: 75.7050,
        address: 'GT Road, Phagwara-Jalandhar Highway, Near LPU Main Gate',
        contactPhone: '+91 98140 88990',
        contactPerson: 'Ramanjot Singh (Mess Supervisor)',
        itemsDescription: 'Dal Makhani, Jeera Rice, Paneer Butter Masala & Tandoori Rotis',
        packagingType: 'Insulated Stainless Steel Carts & Thermal Boxes',
        storageTemp: 'Hot (> 65°C)',
        temperatureRecorded: '69°C',
        region: 'Jalandhar',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: null,
        volunteerPhone: null,
        targetShelter: null,
        notes: 'Enter through Gate 1 or UniMall service ramp. Guard has gate pass pre-approved.',
        createdAt: new Date(now - 1.5 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 1.5 * HOUR_MS).toISOString(),
          inTransit: null,
          delivered: null
        }
      },
      {
        id: 'BV-5048',
        donorName: 'The Maya Hotel & Wedding Banquet',
        donorCategory: 'Banquet Hall',
        foodType: 'Cooked Meals',
        foodTitle: 'Punjabi Wedding Buffet Surplus',
        servings: 160,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 2 * HOUR_MS).toISOString(),
        shelfLifeHours: 4,
        expiryTime: new Date(now + 2 * HOUR_MS).toISOString(),
        status: 'Available',
        lat: 31.3185,
        lng: 75.5842,
        address: 'EH-178, Civil Lines, BMC Chowk, Jalandhar',
        contactPhone: '+91 98155 44332',
        contactPerson: 'Balwinder Chawla (Banquet Manager)',
        itemsDescription: 'Punjabi Wedding Buffet Surplus - Chana Masala, Pulao, Mixed Veg',
        packagingType: 'Heavy Commercial Foil Tins',
        storageTemp: 'Hot (> 65°C)',
        temperatureRecorded: '66°C',
        region: 'Jalandhar',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: null,
        volunteerPhone: null,
        targetShelter: null,
        notes: 'Dispatch area at kitchen rear entrance. Porter will assist loading.',
        createdAt: new Date(now - 2 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 2 * HOUR_MS).toISOString(),
          inTransit: null,
          delivered: null
        }
      },
      {
        id: 'BV-5089',
        donorName: 'Reliance Smart Bazaar Model Town',
        donorCategory: 'Retail Supermarket',
        foodType: 'Raw Produce',
        foodTitle: 'Fresh Seasonal Produce & Grains',
        servings: 130,
        dietType: 'Vegetarian',
        cookedAt: new Date(now - 5 * HOUR_MS).toISOString(),
        shelfLifeHours: 36,
        expiryTime: new Date(now + 31 * HOUR_MS).toISOString(),
        status: 'In-Transit',
        lat: 31.3045,
        lng: 75.5785,
        address: 'Model Town Market, Jalandhar, Punjab',
        contactPhone: '+91 98144 66778',
        contactPerson: 'Manpreet Sandhu',
        itemsDescription: 'Fresh Seasonal Vegetable Crates, Potatoes, Onions & Whole Wheat Bags',
        packagingType: 'Plastic Crates & Gunny Bags',
        storageTemp: 'Ambient (20°C)',
        temperatureRecorded: '20°C',
        region: 'Jalandhar',
        safetyChecklist: {
          tempCheck: true,
          cleanPackaging: true,
          noSpoiledItems: true,
          hygieneCertified: true
        },
        volunteer: 'Simranjeet S.',
        volunteerPhone: '+91 98882 12345',
        targetShelter: 'Apahaj Ashram & Hunger Relief Center',
        notes: 'Simranjeet S. is en route on utility pickup van to Apahaj Ashram.',
        createdAt: new Date(now - 5 * HOUR_MS).toISOString(),
        statusTimestamps: {
          available: new Date(now - 5 * HOUR_MS).toISOString(),
          inTransit: new Date(now - 0.5 * HOUR_MS).toISOString(),
          delivered: null
        }
      }
    ].map((item) => ({
      ...item,
      version: item.version || 1,
      handoverPin: item.handoverPin || (
        item.id === 'BV-1082' ? '4821' :
        item.id === 'BV-2401' ? '5912' :
        item.id === 'BV-3194' ? '7341' :
        item.id === 'BV-4820' ? '2650' :
        item.id === 'BV-5172' ? '8104' :
        item.id === 'BV-6893' ? '3499' :
        item.id === 'BV-5012' ? '6275' :
        item.id === 'BV-5048' ? '9143' : '1588'
      ),
      corridor: item.corridor || (
        (item.lat >= 30.0 || (item.region && item.region.toLowerCase().includes('jalandhar')))
          ? 'Punjab / Jalandhar / Phagwara'
          : 'Delhi/NCR'
      )
    }));
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
     * Stored XSS Mitigation: Encodes HTML special characters to prevent script injection.
     * Essential for sanitizing user-controllable input (donorName, address, itemsDescription).
     * @param {string|any} str - Input text
     * @returns {string} Sanitized string safe for HTML interpolation
     */
    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    /**
     * Initializes the store in SafeStorage if empty or invalid.
     * Guarantees realistic seed data is available immediately without storage crashes.
     */
    initStore() {
      try {
        const raw = SafeStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const seeds = generateSeedData();
          SafeStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
          console.log('[BhojStore] Initialized with realistic Delhi/NCR and Punjab seed dispatches.');
          return seeds;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          const seeds = generateSeedData();
          SafeStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
          return seeds;
        }
        return parsed;
      } catch (e) {
        console.error('[BhojStore] Error reading SafeStorage, resetting to seed data:', e);
        const seeds = generateSeedData();
        SafeStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
        return seeds;
      }
    },

    /**
     * Retrieves all food dispatches sorted by newest first.
     * Normalizes records to ensure OCC version, corridor, and handoverPin exist.
     * @returns {Array} List of dispatches
     */
    getDispatches() {
      try {
        const raw = SafeStorage.getItem(STORAGE_KEY);
        if (!raw) return this.initStore();
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return this.initStore();

        // Self-healing normalization for backwards compatibility with pre-existing storage
        return data.map((item) => {
          if (!item.version) item.version = 1;
          if (!item.handoverPin) {
            item.handoverPin = String(Math.floor(1000 + Math.random() * 9000));
          }
          if (!item.corridor) {
            item.corridor = (item.lat >= 30.0 || (item.region && item.region.toLowerCase().includes('jalandhar')))
              ? 'Punjab / Jalandhar / Phagwara'
              : 'Delhi/NCR';
          }
          return item;
        });
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
     * Retrieves the fixed hunger relief shelters.
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
     * Dual-Corridor Geofenced Shelter Matching:
     * Returns shelters filtered by designated geographical corridor.
     * Ensures couriers in Delhi/NCR route to Delhi relief hubs and Punjab couriers route to Jalandhar/Phagwara hubs.
     * 
     * @param {string} [corridor] - Target corridor or region name
     * @returns {Array} Matching shelters
     */
    getSheltersForCorridor(corridor) {
      if (!corridor) return this.getShelters();
      const norm = String(corridor).toLowerCase();
      const isPunjab = norm.includes('jalandhar') || norm.includes('phagwara') || norm.includes('punjab') || norm.includes('lpu');
      const targetCorridor = isPunjab ? 'Punjab / Jalandhar / Phagwara' : 'Delhi/NCR';
      return SHELTER_HUBS.filter((s) => s.corridor === targetCorridor);
    },

    /**
     * Determines geographical corridor from coordinates.
     * Latitude >= 30.0 degrees N is the Punjab NH-44 corridor; otherwise Delhi/NCR.
     * 
     * @param {number} lat
     * @param {number} lng
     * @returns {string} Corridor identifier
     */
    determineCorridor(lat, lng) {
      const latitude = parseFloat(lat) || 0;
      return latitude >= 30.0 ? 'Punjab / Jalandhar / Phagwara' : 'Delhi/NCR';
    },

    /**
     * Adds a new surplus food dispatch with mandatory hygiene validation flags,
     * OCC revision counter, and 4-digit handover proof of delivery (PoD) token.
     * 
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

      const lat = parseFloat(data.lat) || 28.6139;
      const lng = parseFloat(data.lng) || 77.2090;
      const corridor = data.corridor || this.determineCorridor(lat, lng);
      const handoverPin = data.handoverPin || String(Math.floor(1000 + Math.random() * 9000));

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
        version: 1, // OCC initial revision
        handoverPin: handoverPin, // Proof of Delivery 4-digit token
        corridor: corridor,
        lat: lat,
        lng: lng,
        address: data.address || (corridor.includes('Punjab') ? 'GT Road Corridor, Phagwara/Jalandhar' : 'Central Delhi Hub, New Delhi'),
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
        region: data.region || (corridor.includes('Punjab') ? 'Jalandhar' : 'Delhi/NCR'),
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
      SafeStorage.setItem(STORAGE_KEY, JSON.stringify(list));

      broadcastEvent('DISPATCH_ADDED', newDispatch);
      return newDispatch;
    },

    /**
     * Updates dispatch status along the lifecycle: Available -> In-Transit -> Delivered.
     * Enforces:
     * 1. Optimistic Concurrency Control (OCC) state assertions
     * 2. Revision counter increments
     * 3. Handover Proof of Delivery (PoD) PIN verification on delivery completion
     * 
     * @param {string} id - Dispatch ID (e.g. 'BV-1082')
     * @param {'Available'|'In-Transit'|'Delivered'} newStatus
     * @param {string} [volunteerName] - Name of courier taking the pickup
     * @param {string} [shelterName] - Name of receiving hunger shelter
     * @param {string} [expectedStatus] - Assert expected state before mutating (OCC)
     * @param {string} [deliveryVerificationCode] - 4-digit handover PIN from shelter coordinator (PoD)
     * @returns {Object} Updated dispatch
     */
    updateStatus(id, newStatus, volunteerName = null, shelterName = null, expectedStatus = null, deliveryVerificationCode = null) {
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

      // ========================================================================
      // Optimistic Concurrency Control (OCC) Verification
      // ========================================================================
      if (expectedStatus && item.status !== expectedStatus) {
        const conflictErr = new Error(
          `[BhojStore:OCC] Concurrency Conflict: Dispatch ${id} status is "${item.status}", expected "${expectedStatus}". Claimed by: ${item.volunteer || 'another courier'}.`
        );
        conflictErr.name = 'ConcurrencyConflictError';
        conflictErr.code = 'ERR_CLAIM_CONFLICT';
        conflictErr.currentStatus = item.status;
        conflictErr.claimedBy = item.volunteer;
        throw conflictErr;
      }

      // Safeguard: When claiming ('In-Transit'), current status MUST be 'Available'
      if (newStatus === 'In-Transit' && item.status !== 'Available') {
        const conflictErr = new Error(
          `[BhojStore:OCC] Concurrency Conflict: Dispatch ${id} has already been claimed (status: "${item.status}" by ${item.volunteer || 'another courier'}).`
        );
        conflictErr.name = 'ConcurrencyConflictError';
        conflictErr.code = 'ERR_CLAIM_CONFLICT';
        conflictErr.currentStatus = item.status;
        conflictErr.claimedBy = item.volunteer;
        throw conflictErr;
      }

      // ========================================================================
      // Handover Proof of Delivery (PoD) Verification
      // ========================================================================
      if (newStatus === 'Delivered') {
        const expectedPin = String(item.handoverPin || '1234').trim();
        const enteredPin = (deliveryVerificationCode !== undefined && deliveryVerificationCode !== null)
          ? String(deliveryVerificationCode).trim()
          : '';

        if (!deliveryVerificationCode || enteredPin !== expectedPin) {
          const pinErr = new Error(
            `ERR_INVALID_POD_PIN: Handover verification code mismatch or missing. Required 4-digit PIN from shelter coordinator (expected ${expectedPin}, entered ${enteredPin || 'none'}).`
          );
          pinErr.name = 'VerificationCodeError';
          pinErr.code = 'ERR_INVALID_POD_PIN';
          throw pinErr;
        }

        item.proofOfDelivery = {
          verifiedAt: new Date().toISOString(),
          verifiedBy: shelterName || item.targetShelter || 'Shelter Coordinator',
          pinMatch: true
        };
      }

      // Increment monotonically increasing OCC version
      item.version = (item.version || 1) + 1;

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
      SafeStorage.setItem(STORAGE_KEY, JSON.stringify(list));

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
     * Resets SafeStorage with fresh demo seed data for viva / evaluation demos.
     * Triggers broadcast so all active tabs reset synchronously.
     */
    resetDemoData() {
      const seeds = generateSeedData();
      SafeStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      broadcastEvent('DEMO_DATA_RESET', seeds);
      console.log('[BhojStore] Demo data successfully reset to seed items via SafeStorage.');
      return seeds;
    },

    /**
     * Dynamically shifts or generates 3 active pickups within 1.2 km – 3.5 km
     * of the given coordinates (user's live GPS position) for testing local routing.
     * @param {number} lat
     * @param {number} lng
     * @returns {Array} Updated list of dispatches
     */
    spawnPickupsNear(lat, lng) {
      if (!lat || !lng) return this.getDispatches();
      const list = this.getDispatches();
      const now = Date.now();
      const HOUR_MS = 60 * 60 * 1000;

      // 1 deg lat ≈ 111 km, 1 deg lng ≈ 111 * cos(lat)
      const kmToLat = 1 / 111.0;
      const kmToLng = 1 / (111.0 * Math.cos((lat * Math.PI) / 180));

      const presets = [
        {
          name: 'Annapurna Community Banquet & Catering',
          category: 'Banquet Hall',
          foodType: 'Cooked Meals',
          foodTitle: 'Fresh Evening Buffet Recovery Batch',
          servings: 180,
          distKm: 1.4,
          angle: 45,
          items: 'Dal Makhani, Jeera Rice, Shahi Paneer, Fresh Tandoori Rotis',
          temp: 'Hot (> 65°C)',
          recorded: '67°C',
          status: 'Available'
        },
        {
          name: 'Metro City Fresh Mart & Produce Depot',
          category: 'Retail Supermarket',
          foodType: 'Raw Produce',
          foodTitle: 'Seasonal Farm Produce Crates',
          servings: 120,
          distKm: 2.1,
          angle: 160,
          items: 'Fresh seasonal vegetables, potatoes, onions, whole grain wheat bags',
          temp: 'Ambient (20°C)',
          recorded: '20°C',
          status: 'Available'
        },
        {
          name: 'Grand Heritage Dining Kitchen',
          category: 'Restaurant & Catering',
          foodType: 'Cooked Meals',
          foodTitle: 'Executive Thali Surplus Portions',
          servings: 150,
          distKm: 2.8,
          angle: 280,
          items: 'Subz Biryani, Yellow Tadka Dal, Phulkas, Mixed Seasonal Veg',
          temp: 'Hot (> 65°C)',
          recorded: '65°C',
          status: 'In-Transit',
          volunteer: 'Local Active Courier',
          targetShelter: lat > 30 ? 'Apahaj Ashram & Hunger Relief Center' : 'Asha Child Care Shelter'
        }
      ];

      // Remove any previously spawned pickups with prefix BV-9
      const filteredList = list.filter((item) => !item.id.startsWith('BV-9'));

      presets.forEach((p, idx) => {
        const rad = (p.angle * Math.PI) / 180;
        const offsetLat = p.distKm * kmToLat * Math.sin(rad);
        const offsetLng = p.distKm * kmToLng * Math.cos(rad);
        const pLat = parseFloat((lat + offsetLat).toFixed(4));
        const pLng = parseFloat((lng + offsetLng).toFixed(4));
        const randId = `BV-9${Math.floor(100 + Math.random() * 900)}`;

        const newDispatch = {
          id: randId,
          donorName: p.name,
          donorCategory: p.category,
          foodType: p.foodType,
          foodTitle: p.foodTitle,
          servings: p.servings,
          dietType: 'Vegetarian',
          cookedAt: new Date(now - 1.5 * HOUR_MS).toISOString(),
          shelfLifeHours: p.foodType === 'Cooked Meals' ? 4.5 : 36,
          expiryTime: new Date(now + (p.foodType === 'Cooked Meals' ? 3 : 24) * HOUR_MS).toISOString(),
          status: p.status,
          lat: pLat,
          lng: pLng,
          address: `Near Local Sector (approx ${p.distKm} km from GPS, lat: ${pLat}, lng: ${pLng})`,
          contactPhone: '+91 98111 55443',
          contactPerson: 'Dispatch Desk Coordinator',
          itemsDescription: p.items,
          packagingType: 'Food Grade Insulated Carriers',
          storageTemp: p.temp,
          temperatureRecorded: p.recorded,
          region: lat > 30 ? 'Jalandhar' : 'Delhi/NCR',
          corridor: lat > 30 ? 'Punjab / Jalandhar / Phagwara' : 'Delhi/NCR',
          version: 1,
          handoverPin: String(Math.floor(2000 + Math.random() * 7000)),
          safetyChecklist: {
            tempCheck: true,
            cleanPackaging: true,
            noSpoiledItems: true,
            hygieneCertified: true
          },
          volunteer: p.volunteer || null,
          volunteerPhone: p.volunteer ? '+91 98765 43210' : null,
          targetShelter: p.targetShelter || null,
          notes: 'Dynamically generated within 1.2–3.5 km of active courier position for local testing.',
          createdAt: new Date(now).toISOString(),
          statusTimestamps: {
            available: new Date(now).toISOString(),
            inTransit: p.status === 'In-Transit' ? new Date(now).toISOString() : null,
            delivered: null
          }
        };

        filteredList.unshift(newDispatch);
      });

      SafeStorage.setItem(STORAGE_KEY, JSON.stringify(filteredList));
      broadcastEvent('DEMO_DATA_RESET', filteredList);
      return filteredList;
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
  global.SafeStorage = SafeStorage;
  global.escapeHtml = BhojStore.escapeHtml;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BhojStore;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
