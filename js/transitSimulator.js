/**
 * BhojVayasta - Live Transit Simulator & Fleet Isochrone Engine (R1 & R2)
 * File: js/transitSimulator.js
 *
 * Implements:
 * 1. Geodesic distance (Haversine) and vehicle bearing (heading angle) calculations
 * 2. Forward spherical geodesic coordinate projection (projectGeodesic)
 * 3. Waypoint step interpolation along street polyline coordinates
 * 4. CourierSimulator class: instantiable multi-agent movement & state machine
 * 5. BhojIsochrone: 24-point heading-elongated polygons (15-min & 30-min) & ray-casting point-in-polygon
 * 6. BhojTransitSimulator.fleet: Multi-courier orchestration across Delhi/NCR and Punjab corridors
 * 7. 100% backward-compatible singleton delegation for primary courier simulation
 */

(function (global) {
  'use strict';

  const EARTH_RADIUS_KM = 6371.0;

  /**
   * Calculates Haversine distance in km between two [lat, lng] coordinates
   */
  function calculateDistance(p1, p2) {
    if (!p1 || !p2 || !Array.isArray(p1) || !Array.isArray(p2)) return 0;
    const lat1 = Number(p1[0]);
    const lng1 = Number(p1[1]);
    const lat2 = Number(p2[0]);
    const lng2 = Number(p2[1]);
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return 0;

    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const rLat1 = lat1 * (Math.PI / 180);
    const rLat2 = lat2 * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  /**
   * Calculates vehicle bearing / heading angle in degrees [0, 360) from p1 to p2
   */
  function calculateBearing(p1, p2) {
    if (!p1 || !p2 || !Array.isArray(p1) || !Array.isArray(p2)) return 0;
    const lat1 = Number(p1[0]);
    const lng1 = Number(p1[1]);
    const lat2 = Number(p2[0]);
    const lng2 = Number(p2[1]);
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return 0;

    // Handle identical points
    if (Math.abs(lat1 - lat2) < 1e-7 && Math.abs(lng1 - lng2) < 1e-7) {
      return 0;
    }

    const phi1 = lat1 * (Math.PI / 180);
    const phi2 = lat2 * (Math.PI / 180);
    const deltaLambda = (lng2 - lng1) * (Math.PI / 180);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    const bearingDegrees = ((theta * 180) / Math.PI + 360) % 360;
    return isNaN(bearingDegrees) ? 0 : bearingDegrees;
  }

  /**
   * Linearly interpolates intermediate [lat, lng] between p1 and p2 for alpha in [0, 1]
   */
  function interpolateCoordinate(p1, p2, alpha) {
    if (!p1 || !p2) return p1 || [0, 0];
    const a = Math.max(0, Math.min(1, alpha));
    const lat = p1[0] + (p2[0] - p1[0]) * a;
    const lng = p1[1] + (p2[1] - p1[1]) * a;
    return [lat, lng];
  }

  /**
   * Forward spherical geodesic projection: computes destination [lat, lng]
   * given start [lat0, lng0], distance in km, and bearing in degrees [0, 360).
   */
  function projectGeodesic(lat0, lng0, distanceKm, bearingDeg) {
    const R = EARTH_RADIUS_KM;
    const delta = distanceKm / R;
    const theta = (bearingDeg * Math.PI) / 180;
    const phi0 = (lat0 * Math.PI) / 180;
    const lambda0 = (lng0 * Math.PI) / 180;

    const phi1 = Math.asin(
      Math.sin(phi0) * Math.cos(delta) +
      Math.cos(phi0) * Math.sin(delta) * Math.cos(theta)
    );
    const lambda1 = lambda0 + Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi0),
      Math.cos(delta) - Math.sin(phi0) * Math.sin(phi1)
    );

    const lat1 = (phi1 * 180) / Math.PI;
    const lng1 = (((lambda1 * 180) / Math.PI + 540) % 360) - 180;
    return [
      Math.round(lat1 * 1000000) / 1000000,
      Math.round(lng1 * 1000000) / 1000000
    ];
  }

  /**
   * Normalizes GeoJSON [lng, lat] or Leaflet [lat, lng] into standard [lat, lng]
   */
  function normalizeCoord(c) {
    if (!Array.isArray(c) || c.length < 2) return [28.6315, 77.2195];
    // In India (Delhi/Punjab), Lat is ~28-32, Lng is ~75-78
    if (c[0] > 50 && c[1] < 50) {
      return [c[1], c[0]]; // [lng, lat] -> [lat, lng]
    }
    return [c[0], c[1]];
  }

  // ============================================================================
  // BHOJ ISOCHRONE GEOMETRIC ENGINE (R2)
  // ============================================================================

  const BhojIsochrone = {
    /**
     * Computes a 24-point reachability polygon around center coordinate.
     * Takes into account travel budget (minutes), velocity (speedKmH),
     * road circuity factor (1.30), and directional heading vector elongation.
     *
     * @param {Array<number>} center - [lat, lng]
     * @param {number} minutes - Reachability horizon in minutes (e.g. 15 or 30)
     * @param {number} speedKmH - Courier velocity in km/h
     * @param {number} headingDeg - Forward vehicle heading angle [0, 360)
     * @returns {Array<Array<number>>} Array of 24 [lat, lng] polygon vertices
     */
    computeIsochronePolygon: function (center, minutes, speedKmH, headingDeg) {
      if (!center || !Array.isArray(center) || center.length < 2) {
        return [];
      }
      const lat0 = Number(center[0]);
      const lng0 = Number(center[1]);
      if (isNaN(lat0) || isNaN(lng0)) return [];

      const speed = Math.max(15, Number(speedKmH) || 32);
      const mins = Math.max(1, Number(minutes) || 15);
      const circuity = 1.30;
      const nominalRadiusKm = (speed * (mins / 60)) / circuity;
      const numVertices = 24;
      const headingRad = (((headingDeg || 0) % 360) * Math.PI) / 180;
      const points = [];

      for (let i = 0; i < numVertices; i++) {
        const bearingRad = (2 * Math.PI * i) / numVertices;
        const deltaTheta = bearingRad - headingRad;
        // Directional velocity elongation forward along travel vector
        const elongation = 1.0 + 0.18 * Math.cos(deltaTheta) + 0.08 * Math.cos(4 * bearingRad);
        const radiusKm = nominalRadiusKm * elongation;
        const dest = projectGeodesic(lat0, lng0, radiusKm, (bearingRad * 180) / Math.PI);
        points.push(dest);
      }
      return points;
    },

    /**
     * Computes both 15-minute and 30-minute reachability polygons simultaneously.
     *
     * @param {Array<number>} center - [lat, lng]
     * @param {number} speedKmH - Courier velocity
     * @param {number} headingDeg - Heading angle
     * @returns {{ polygon15: Array<Array<number>>, polygon30: Array<Array<number>> }}
     */
    computeDualIsochrones: function (center, speedKmH, headingDeg) {
      return {
        polygon15: this.computeIsochronePolygon(center, 15, speedKmH, headingDeg),
        polygon30: this.computeIsochronePolygon(center, 30, speedKmH, headingDeg)
      };
    },

    /**
     * Ray-casting point-in-polygon classification.
     * Determines whether a query [lat, lng] is within a closed polygon ring.
     *
     * @param {Array<number>} point - [lat, lng]
     * @param {Array<Array<number>>} polygon - Array of [lat, lng] vertices
     * @returns {boolean} True if point is inside polygon
     */
    isPointInPolygon: function (point, polygon) {
      if (!point || !polygon || !Array.isArray(polygon) || polygon.length < 3) return false;
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (isNaN(lat) || isNaN(lng)) return false;

      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];
        const intersect =
          yi > lng !== yj > lng &&
          lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }
  };

  // ============================================================================
  // COURIER SIMULATOR CLASS (R1)
  // ============================================================================

  function CourierSimulator(config) {
    const cfg = config || {};
    this.id = cfg.id || 'courier-' + Math.random().toString(36).substr(2, 6);
    this.name = cfg.name || 'Volunteer Courier';
    this.vehicleType = cfg.vehicleType || 'Electric Two-Wheeler';
    this.corridor = cfg.corridor || 'Delhi/NCR';
    this.color = cfg.color || '#10B981';
    this.baseSpeedKmH = Math.max(15, Number(cfg.speedKmH) || 45.0);
    this.speedMultiplier = 1;

    this.waypoints = [];
    this.segmentDistances = [];
    this.totalDistanceKm = 0;
    this.distanceTraveledKm = 0;
    this.currentCoord = cfg.origin ? [...cfg.origin] : [28.6315, 77.2195];
    this.currentHeading = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.lastTimestamp = null;
    this.timerId = null;

    this.arrivalCallbacks = [];
    this.tickCallbacks = [];
    this.boundMap = null;
    this.boundMarker = null;

    if (cfg.waypoints && Array.isArray(cfg.waypoints)) {
      this.loadRoute(cfg.waypoints);
    }
  }

  CourierSimulator.prototype.resetState = function () {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.distanceTraveledKm = 0;
    this.lastTimestamp = null;
  };

  CourierSimulator.prototype.loadRoute = function (rawCoords) {
    this.resetState();
    this.waypoints = [];
    this.segmentDistances = [];
    this.totalDistanceKm = 0;

    if (!Array.isArray(rawCoords) || rawCoords.length === 0) {
      this.currentCoord = [28.6315, 77.2195];
      this.currentHeading = 0;
      return;
    }

    this.waypoints = rawCoords.map(normalizeCoord);
    this.currentCoord = this.waypoints[0] ? [...this.waypoints[0]] : [28.6315, 77.2195];

    if (this.waypoints.length < 2) {
      this.currentHeading = 0;
      this.totalDistanceKm = 0;
      return;
    }

    this.currentHeading = calculateBearing(this.waypoints[0], this.waypoints[1]);

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const d = calculateDistance(this.waypoints[i], this.waypoints[i + 1]);
      this.segmentDistances.push(d);
      this.totalDistanceKm += d;
    }
  };

  CourierSimulator.prototype.getState = function () {
    const progressPercent =
      this.totalDistanceKm > 0
        ? Math.min(100, Math.round((this.distanceTraveledKm / this.totalDistanceKm) * 10000) / 100)
        : (this.waypoints.length > 0 ? 100 : 0);

    const distanceRemainingKm = Math.max(
      0,
      Math.round((this.totalDistanceKm - this.distanceTraveledKm) * 100) / 100
    );
    const effectiveSpeedKmH = this.baseSpeedKmH * (this.speedMultiplier || 1);
    const etaMinutes =
      distanceRemainingKm > 0
        ? Math.max(1, Math.round((distanceRemainingKm / this.baseSpeedKmH) * 60))
        : 0;

    return {
      id: this.id,
      name: this.name,
      vehicleType: this.vehicleType,
      corridor: this.corridor,
      color: this.color,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      progressPercent,
      currentCoord: [...this.currentCoord],
      heading: Math.round(this.currentHeading),
      speedKmH: this.isRunning && !this.isPaused ? Math.round(effectiveSpeedKmH) : 0,
      speedMultiplier: this.speedMultiplier,
      etaMinutes,
      distanceRemainingKm,
      totalDistanceKm: Math.round(this.totalDistanceKm * 100) / 100
    };
  };

  CourierSimulator.prototype.step = function (deltaMs) {
    if (!this.isRunning || this.isPaused || this.waypoints.length < 2 || this.totalDistanceKm === 0) {
      return;
    }

    const dt = typeof deltaMs === 'number' ? deltaMs : 100;
    const effectiveSpeed = this.baseSpeedKmH * (this.speedMultiplier || 1);
    const distDelta = (effectiveSpeed / 3600000) * dt;

    this.distanceTraveledKm = Math.min(this.totalDistanceKm, this.distanceTraveledKm + distDelta);

    let accumulated = 0;
    let foundSegment = false;

    for (let i = 0; i < this.segmentDistances.length; i++) {
      const segDist = this.segmentDistances[i];
      if (accumulated + segDist >= this.distanceTraveledKm || i === this.segmentDistances.length - 1) {
        const segTraveled = Math.max(0, this.distanceTraveledKm - accumulated);
        const alpha = segDist > 0 ? Math.min(1, segTraveled / segDist) : 1;
        this.currentCoord = interpolateCoordinate(this.waypoints[i], this.waypoints[i + 1], alpha);
        this.currentHeading = calculateBearing(this.waypoints[i], this.waypoints[i + 1]);
        foundSegment = true;
        break;
      }
      accumulated += segDist;
    }

    if (!foundSegment && this.waypoints.length > 0) {
      this.currentCoord = [...this.waypoints[this.waypoints.length - 1]];
    }

    if (this.boundMarker && typeof this.boundMarker.setLatLng === 'function') {
      this.boundMarker.setLatLng(this.currentCoord);
    }

    const currentState = this.getState();
    this.tickCallbacks.forEach(fn => fn(currentState));

    if (this.distanceTraveledKm >= this.totalDistanceKm) {
      this.completeRoute();
    }
  };

  CourierSimulator.prototype.completeRoute = function () {
    this.distanceTraveledKm = this.totalDistanceKm;
    if (this.waypoints.length > 0) {
      this.currentCoord = [...this.waypoints[this.waypoints.length - 1]];
    }
    this.isRunning = false;
    this.isPaused = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    const finalState = this.getState();
    this.arrivalCallbacks.forEach(fn => fn(finalState));
  };

  CourierSimulator.prototype.start = function (mult) {
    if (this.waypoints.length < 2) return;
    this.speedMultiplier = Math.max(1, Number(mult) || 1);
    this.isRunning = true;
    this.isPaused = false;

    if (this.distanceTraveledKm >= this.totalDistanceKm) {
      this.distanceTraveledKm = 0;
    }

    if (this.timerId) {
      clearInterval(this.timerId);
    }

    const TICK_INTERVAL_MS = 50;
    this.lastTimestamp = Date.now();
    this.timerId = setInterval(() => {
      const now = Date.now();
      const dt = now - (this.lastTimestamp || now);
      this.lastTimestamp = now;
      this.step(dt);
    }, TICK_INTERVAL_MS);
  };

  CourierSimulator.prototype.pause = function () {
    if (!this.isRunning) return;
    this.isPaused = true;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  };

  CourierSimulator.prototype.resume = function () {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.lastTimestamp = Date.now();
    const TICK_INTERVAL_MS = 50;
    this.timerId = setInterval(() => {
      const now = Date.now();
      const dt = now - (this.lastTimestamp || now);
      this.lastTimestamp = now;
      this.step(dt);
    }, TICK_INTERVAL_MS);
  };

  CourierSimulator.prototype.stop = function () {
    this.resetState();
    if (this.waypoints.length > 0) {
      this.currentCoord = [...this.waypoints[0]];
      this.currentHeading = this.waypoints.length >= 2 ? calculateBearing(this.waypoints[0], this.waypoints[1]) : 0;
    }
  };

  CourierSimulator.prototype.onArrival = function (cb) {
    if (typeof cb === 'function') {
      this.arrivalCallbacks.push(cb);
    }
  };

  CourierSimulator.prototype.onTick = function (cb) {
    if (typeof cb === 'function') {
      this.tickCallbacks.push(cb);
    }
  };

  CourierSimulator.prototype.getDualIsochrones = function () {
    const effectiveSpeed = this.baseSpeedKmH * (this.speedMultiplier || 1);
    return BhojIsochrone.computeDualIsochrones(this.currentCoord, effectiveSpeed, this.currentHeading);
  };

  // ============================================================================
  // MULTI-COURIER FLEET CONTROLLER (R1)
  // ============================================================================

  const fleet = {
    couriers: new Map(),
    isFleetRunning: false,
    isFleetPaused: false,
    timerId: null,
    speedMultiplier: 1,
    fleetTickCallbacks: [],
    fleetArrivalCallbacks: [],

    registerCourier: function (config) {
      const courier = config instanceof CourierSimulator ? config : new CourierSimulator(config);
      this.couriers.set(courier.id, courier);
      courier.onArrival(state => {
        this.fleetArrivalCallbacks.forEach(fn => fn(courier, state));
      });
      return courier;
    },

    getCourier: function (id) {
      return this.couriers.get(id) || null;
    },

    getAllCouriers: function () {
      return Array.from(this.couriers.values());
    },

    clearFleet: function () {
      this.stopAll();
      this.couriers.clear();
    },

    startAll: function (mult) {
      this.speedMultiplier = Math.max(1, Number(mult) || 1);
      this.isFleetRunning = true;
      this.isFleetPaused = false;

      this.couriers.forEach(c => {
        c.speedMultiplier = this.speedMultiplier;
        c.isRunning = true;
        c.isPaused = false;
        if (c.distanceTraveledKm >= c.totalDistanceKm) {
          c.distanceTraveledKm = 0;
        }
      });

      if (this.timerId) clearInterval(this.timerId);
      let lastTime = Date.now();
      this.timerId = setInterval(() => {
        const now = Date.now();
        const dt = now - lastTime;
        lastTime = now;
        this.stepFleet(dt);
      }, 50);
    },

    pauseAll: function () {
      this.isFleetPaused = true;
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.couriers.forEach(c => c.pause());
    },

    resumeAll: function () {
      if (!this.isFleetRunning || !this.isFleetPaused) return;
      this.isFleetPaused = false;
      this.couriers.forEach(c => {
        c.isPaused = false;
      });
      let lastTime = Date.now();
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => {
        const now = Date.now();
        const dt = now - lastTime;
        lastTime = now;
        this.stepFleet(dt);
      }, 50);
    },

    stopAll: function () {
      this.isFleetRunning = false;
      this.isFleetPaused = false;
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.couriers.forEach(c => c.stop());
      const telem = this.getFleetTelemetry();
      this.fleetTickCallbacks.forEach(fn => fn(telem));
    },

    stepFleet: function (deltaMs) {
      const dt = typeof deltaMs === 'number' ? deltaMs : 100;
      this.couriers.forEach(c => {
        if (c.isRunning && !c.isPaused) {
          c.step(dt);
        }
      });
      const telemetry = this.getFleetTelemetry();
      this.fleetTickCallbacks.forEach(fn => fn(telemetry));
    },

    getFleetTelemetry: function () {
      const results = [];
      this.couriers.forEach(c => {
        const s = c.getState();
        const effectiveSpeed = s.speedKmH > 0 ? s.speedKmH : c.baseSpeedKmH;
        results.push({
          ...s,
          isochrones: BhojIsochrone.computeDualIsochrones(s.currentCoord, effectiveSpeed, s.heading)
        });
      });
      return results;
    },

    onFleetTick: function (cb) {
      if (typeof cb === 'function') this.fleetTickCallbacks.push(cb);
    },

    onFleetArrival: function (cb) {
      if (typeof cb === 'function') this.fleetArrivalCallbacks.push(cb);
    },

    /**
     * Loads the preset 4-courier fleet distributed across Delhi/NCR and Punjab corridors
     */
    loadPresetFleet: function () {
      this.clearFleet();

      // CR-DEL-01: Rohan V. (Delhi/NCR Central Corridor)
      this.registerCourier({
        id: 'CR-DEL-01',
        name: 'Rohan V.',
        vehicleType: 'Electric Two-Wheeler',
        corridor: 'Delhi/NCR',
        color: '#10B981',
        speedKmH: 35,
        waypoints: [
          [28.6280, 77.2190], // Connaught Place (BV-1082)
          [28.6315, 77.2230], // Barakhamba Road
          [28.6340, 77.2300], // Mandi House Circle
          [28.6330, 77.2370], // ITO Ring Road Junction
          [28.6375, 77.2410], // Delhi Gate
          [28.6420, 77.2405]  // Asha Child Care Shelter SH-01
        ]
      });

      // CR-DEL-02: Arjun M. (Delhi/NCR South Corridor)
      this.registerCourier({
        id: 'CR-DEL-02',
        name: 'Arjun M.',
        vehicleType: 'Motorcycle Courier',
        corridor: 'Delhi/NCR',
        color: '#3B82F6',
        speedKmH: 42,
        waypoints: [
          [28.6100, 77.2300], // Lodhi Institutional Area (BV-4820)
          [28.6010, 77.2340], // Defence Colony Flyover
          [28.5900, 77.2370], // South Extension
          [28.5780, 77.2410], // Lajpat Nagar Ring Road
          [28.5680, 77.2430]  // Bal Vikas Orphanage SH-03
        ]
      });

      // CR-PUN-01: Simranjeet S. (Punjab / Jalandhar Corridor)
      this.registerCourier({
        id: 'CR-PUN-01',
        name: 'Simranjeet S.',
        vehicleType: 'Utility Delivery Van',
        corridor: 'Punjab / Jalandhar / Phagwara',
        color: '#F59E0B',
        speedKmH: 45,
        waypoints: [
          [31.3045, 75.5785], // Model Town Market (BV-5089)
          [31.3120, 75.5750], // Jyoti Chowk
          [31.3185, 75.5842], // BMC Chowk Jalandhar
          [31.3260, 75.5760], // Old Railway Road
          [31.3340, 75.5680]  // Apahaj Ashram SH-05
        ]
      });

      // CR-PUN-02: Harpreet K. (Punjab / Phagwara / LPU Corridor)
      this.registerCourier({
        id: 'CR-PUN-02',
        name: 'Harpreet K.',
        vehicleType: 'Volunteer Two-Wheeler',
        corridor: 'Punjab / Jalandhar / Phagwara',
        color: '#8B5CF6',
        speedKmH: 38,
        waypoints: [
          [31.2554, 75.7050], // LPU Main Gate GT Road (BV-5012)
          [31.2562, 75.7035], // Chaheru Bridge
          [31.2570, 75.7028], // Sugar Mill Crossing
          [31.2580, 75.7020]  // Phagwara Seva Slum Camp SH-07
        ]
      });

      return this.getAllCouriers();
    }
  };

  // ============================================================================
  // SINGLETON FACADE (100% BACKWARD COMPATIBILITY)
  // ============================================================================

  const defaultCourier = new CourierSimulator({
    id: 'courier-default',
    name: 'Primary Courier',
    speedKmH: 45.0
  });

  const BhojTransitSimulator = {
    // Delegated single-route methods for primary courier
    init: function (map, courierMarker) {
      defaultCourier.boundMap = map || null;
      defaultCourier.boundMarker = courierMarker || null;
    },
    loadRoute: function (rawCoords) {
      return defaultCourier.loadRoute(rawCoords);
    },
    start: function (mult) {
      return defaultCourier.start(mult);
    },
    pause: function () {
      return defaultCourier.pause();
    },
    resume: function () {
      return defaultCourier.resume();
    },
    stop: function () {
      return defaultCourier.stop();
    },
    step: function (deltaMs) {
      return defaultCourier.step(deltaMs);
    },
    tick: function (deltaMs) {
      return defaultCourier.step(deltaMs);
    },
    completeRoute: function () {
      return defaultCourier.completeRoute();
    },
    getState: function () {
      return defaultCourier.getState();
    },
    onArrival: function (cb) {
      return defaultCourier.onArrival(cb);
    },
    onTick: function (cb) {
      return defaultCourier.onTick(cb);
    },

    // Geodesic math exports
    calculateBearing: calculateBearing,
    calculateDistance: calculateDistance,
    interpolateCoordinate: interpolateCoordinate,
    projectGeodesic: projectGeodesic,
    math: {
      calculateBearing: calculateBearing,
      calculateDistance: calculateDistance,
      interpolateCoordinate: interpolateCoordinate,
      projectGeodesic: projectGeodesic
    },

    // Multi-Courier Fleet & Isochrone Engine
    isochrone: BhojIsochrone,
    fleet: fleet,
    CourierSimulator: CourierSimulator,
    BhojIsochrone: BhojIsochrone
  };

  // Global & CommonJS registration
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BhojTransitSimulator;
    module.exports.BhojTransitSimulator = BhojTransitSimulator;
    module.exports.BhojIsochrone = BhojIsochrone;
    module.exports.CourierSimulator = CourierSimulator;
  }
  global.BhojTransitSimulator = BhojTransitSimulator;
  global.BhojIsochrone = BhojIsochrone;
  global.CourierSimulator = CourierSimulator;

})(typeof window !== 'undefined' ? window : global);
