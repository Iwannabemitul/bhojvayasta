/**
 * BhojVayasta - Live Transit Simulator (R4)
 * File: js/transitSimulator.js
 *
 * Implements:
 * 1. Geodesic distance (Haversine) and vehicle bearing (heading angle) calculations
 * 2. Waypoint step interpolation along OSRM street polyline coordinates
 * 3. Simulation state machine: IDLE -> RUNNING -> PAUSED -> COMPLETED
 * 4. Demonstration speed multipliers (1x, 2x, 5x, 10x, 25x)
 * 5. Telemetry updates (currentCoord, heading, speedKmH, etaMinutes, progressPercent)
 * 6. Destination arrival callback triggering shelter handover PoD
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
    const bearingDegrees = (theta * 180 / Math.PI + 360) % 360;
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

  // Simulator Instance State
  let waypoints = [];
  let segmentDistances = [];
  let totalDistanceKm = 0;
  let distanceTraveledKm = 0;
  let isRunning = false;
  let isPaused = false;
  let speedMultiplier = 1;
  const BASE_SPEED_KMH = 45.0; // Typical urban/highway courier pace
  let currentCoord = [28.6315, 77.2195];
  let currentHeading = 0;
  let timerId = null;
  let lastTimestamp = null;
  let arrivalCallbacks = [];
  let tickCallbacks = [];
  let boundMap = null;
  let boundCourierMarker = null;

  function resetState() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    isRunning = false;
    isPaused = false;
    distanceTraveledKm = 0;
    lastTimestamp = null;
  }

  function loadRoute(rawCoords) {
    resetState();
    waypoints = [];
    segmentDistances = [];
    totalDistanceKm = 0;

    if (!Array.isArray(rawCoords) || rawCoords.length === 0) {
      currentCoord = [28.6315, 77.2195];
      currentHeading = 0;
      return;
    }

    waypoints = rawCoords.map(normalizeCoord);
    currentCoord = waypoints[0] ? [...waypoints[0]] : [28.6315, 77.2195];

    if (waypoints.length < 2) {
      currentHeading = 0;
      totalDistanceKm = 0;
      return;
    }

    currentHeading = calculateBearing(waypoints[0], waypoints[1]);

    for (let i = 0; i < waypoints.length - 1; i++) {
      const d = calculateDistance(waypoints[i], waypoints[i + 1]);
      segmentDistances.push(d);
      totalDistanceKm += d;
    }
  }

  function getState() {
    const progressPercent = totalDistanceKm > 0
      ? Math.min(100, Math.round((distanceTraveledKm / totalDistanceKm) * 10000) / 100)
      : (waypoints.length > 0 ? 100 : 0);

    const distanceRemainingKm = Math.max(0, Math.round((totalDistanceKm - distanceTraveledKm) * 100) / 100);
    const effectiveSpeedKmH = BASE_SPEED_KMH * (speedMultiplier || 1);
    const etaMinutes = distanceRemainingKm > 0
      ? Math.max(1, Math.round((distanceRemainingKm / BASE_SPEED_KMH) * 60))
      : 0;

    return {
      isRunning,
      isPaused,
      progressPercent,
      currentCoord: [...currentCoord],
      heading: Math.round(currentHeading),
      speedKmH: isRunning && !isPaused ? Math.round(effectiveSpeedKmH) : 0,
      speedMultiplier,
      etaMinutes,
      distanceRemainingKm,
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100
    };
  }

  function step(deltaMs) {
    if (!isRunning || isPaused || waypoints.length < 2 || totalDistanceKm === 0) {
      return;
    }

    const dt = typeof deltaMs === 'number' ? deltaMs : 100;
    const effectiveSpeed = BASE_SPEED_KMH * (speedMultiplier || 1);
    const distDelta = (effectiveSpeed / 3600000) * dt;

    distanceTraveledKm = Math.min(totalDistanceKm, distanceTraveledKm + distDelta);

    // Locate current segment along route
    let accumulated = 0;
    let foundSegment = false;

    for (let i = 0; i < segmentDistances.length; i++) {
      const segDist = segmentDistances[i];
      if (accumulated + segDist >= distanceTraveledKm || i === segmentDistances.length - 1) {
        const segTraveled = Math.max(0, distanceTraveledKm - accumulated);
        const alpha = segDist > 0 ? Math.min(1, segTraveled / segDist) : 1;
        currentCoord = interpolateCoordinate(waypoints[i], waypoints[i + 1], alpha);
        currentHeading = calculateBearing(waypoints[i], waypoints[i + 1]);
        foundSegment = true;
        break;
      }
      accumulated += segDist;
    }

    if (!foundSegment && waypoints.length > 0) {
      currentCoord = [...waypoints[waypoints.length - 1]];
    }

    // Update bound Leaflet marker if connected
    if (boundCourierMarker && typeof boundCourierMarker.setLatLng === 'function') {
      boundCourierMarker.setLatLng(currentCoord);
    }

    const currentState = getState();
    tickCallbacks.forEach(fn => fn(currentState));

    // Destination arrival check
    if (distanceTraveledKm >= totalDistanceKm) {
      completeRoute();
    }
  }

  function completeRoute() {
    distanceTraveledKm = totalDistanceKm;
    if (waypoints.length > 0) {
      currentCoord = [...waypoints[waypoints.length - 1]];
    }
    isRunning = false;
    isPaused = false;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }

    const finalState = getState();
    arrivalCallbacks.forEach(fn => fn(finalState));
  }

  function start(mult) {
    if (waypoints.length < 2) return;
    speedMultiplier = Math.max(1, Number(mult) || 1);
    isRunning = true;
    isPaused = false;

    if (distanceTraveledKm >= totalDistanceKm) {
      distanceTraveledKm = 0;
    }

    if (timerId) {
      clearInterval(timerId);
    }

    const TICK_INTERVAL_MS = 50;
    lastTimestamp = Date.now();
    timerId = setInterval(() => {
      const now = Date.now();
      const dt = now - (lastTimestamp || now);
      lastTimestamp = now;
      step(dt);
    }, TICK_INTERVAL_MS);
  }

  function pause() {
    if (!isRunning) return;
    isPaused = true;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function resume() {
    if (!isRunning || !isPaused) return;
    isPaused = false;
    lastTimestamp = Date.now();
    const TICK_INTERVAL_MS = 50;
    timerId = setInterval(() => {
      const now = Date.now();
      const dt = now - (lastTimestamp || now);
      lastTimestamp = now;
      step(dt);
    }, TICK_INTERVAL_MS);
  }

  function stop() {
    resetState();
    if (waypoints.length > 0) {
      currentCoord = [...waypoints[0]];
      currentHeading = waypoints.length >= 2 ? calculateBearing(waypoints[0], waypoints[1]) : 0;
    }
  }

  function onArrival(cb) {
    if (typeof cb === 'function') {
      arrivalCallbacks.push(cb);
    }
  }

  function onTick(cb) {
    if (typeof cb === 'function') {
      tickCallbacks.push(cb);
    }
  }

  function init(map, courierMarker) {
    boundMap = map || null;
    boundCourierMarker = courierMarker || null;
  }

  const BhojTransitSimulator = {
    init,
    loadRoute,
    start,
    pause,
    resume,
    stop,
    step,
    tick: step,
    completeRoute,
    getState,
    onArrival,
    onTick,
    calculateBearing,
    calculateDistance,
    interpolateCoordinate,
    math: {
      calculateBearing,
      calculateDistance,
      interpolateCoordinate
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BhojTransitSimulator;
  }
  global.BhojTransitSimulator = BhojTransitSimulator;

})(typeof window !== 'undefined' ? window : global);
