/**
 * BhojVayasta - Food Safety Engine (FSSAI Thermal Spoilage & Arrhenius Decay)
 * File: js/foodSafety.js
 *
 * Implements:
 * 1. FSSAI 2019 surplus food safety regulations & danger zone categorization (5°C to 60°C)
 * 2. Arrhenius / biological thermal decay kinetic rate multipliers
 * 3. Dynamic non-linear remaining shelf life & Freshness Index calculations
 * 4. Multi-phase thermal transit simulation with pathogen proliferation curves
 */

(function (global) {
  'use strict';

  /**
   * Robust temperature parser handling numbers, strings with units ("68°C", " 4 °C "),
   * and defaulting safely to room ambient (25°C) on NaN/null/undefined.
   */
  function parseTemperature(temp) {
    if (temp === null || temp === undefined || temp === '') {
      return 25.0;
    }
    if (typeof temp === 'number') {
      return isNaN(temp) ? 25.0 : temp;
    }
    if (typeof temp === 'string') {
      const match = temp.match(/-?\d+(\.\d+)?/);
      if (match) {
        const val = parseFloat(match[0]);
        if (!isNaN(val)) return val;
      }
      return 25.0;
    }
    return 25.0;
  }

  /**
   * Classifies temperature into FSSAI danger zone categories:
   * - T <= 5°C: 'Safe Cold'
   * - 5°C < T < 20°C: 'Danger Zone Low'
   * - 20°C <= T <= 50°C: 'Danger Zone Peak'
   * - 50°C < T < 60°C: 'Approaching Hot Safe'
   * - T >= 60°C: 'Safe Hot'
   */
  function getDangerZoneCategory(tempInput) {
    const T = parseTemperature(tempInput);
    if (T <= 5.0) {
      return 'Safe Cold';
    }
    if (T > 5.0 && T < 20.0) {
      return 'Danger Zone Low';
    }
    if (T >= 20.0 && T <= 50.0) {
      return 'Danger Zone Peak';
    }
    if (T > 50.0 && T < 60.0) {
      return 'Approaching Hot Safe';
    }
    return 'Safe Hot';
  }

  /**
   * Arrhenius reaction multiplier M(T):
   * - 1.0x at <= 5°C (Safe Cold) and >= 60°C (Safe Hot)
   * - Accelerates inside danger zone (5°C to 60°C), peaking at 38°C (~4.2x)
   */
  function calculateArrheniusMultiplier(tempInput) {
    const T = parseTemperature(tempInput);
    if (T <= 5.0 || T >= 60.0) {
      return 1.0;
    }
    // Arrhenius Gaussian curve peaked at 38°C with variance parameter
    const multiplier = 1.0 + 3.2 * Math.exp(-Math.pow(T - 38.0, 2) / (2.0 * 144.0));
    return Math.round(multiplier * 100) / 100;
  }

  /**
   * Dynamic non-linear shelf life and freshness index calculation:
   * Considers elapsed time accelerated by ambient temperature exposure.
   */
  function calculateDynamicShelfLife(dispatch, currentTempC, currentTimeMs) {
    const now = typeof currentTimeMs === 'number' ? currentTimeMs : Date.now();
    const temp = parseTemperature(currentTempC);
    const category = getDangerZoneCategory(temp);
    const multiplier = calculateArrheniusMultiplier(temp);

    // Calculate baseline nominal shelf life in minutes
    let nominalMinutes = 240; // Default 4 hours
    if (dispatch) {
      if (dispatch.expiryTime && dispatch.createdAt) {
        const expMs = new Date(dispatch.expiryTime).getTime();
        const createMs = new Date(dispatch.createdAt).getTime();
        if (!isNaN(expMs) && !isNaN(createMs) && expMs > createMs) {
          nominalMinutes = Math.round((expMs - createMs) / 60000);
        } else if (typeof dispatch.shelfLifeHours === 'number') {
          nominalMinutes = Math.round(dispatch.shelfLifeHours * 60);
        }
      } else if (typeof dispatch.shelfLifeHours === 'number') {
        nominalMinutes = Math.round(dispatch.shelfLifeHours * 60);
      }
    }

    // Determine elapsed time
    let elapsedRealMinutes = 0;
    if (dispatch && dispatch.createdAt) {
      const createMs = new Date(dispatch.createdAt).getTime();
      if (!isNaN(createMs)) {
        elapsedRealMinutes = Math.max(0, (now - createMs) / 60000);
      }
    }

    const effectiveElapsedMinutes = elapsedRealMinutes * multiplier;
    const remainingSafeMinutes = Math.max(0, Math.round((nominalMinutes - effectiveElapsedMinutes) / multiplier));

    // Expiry conditions
    const isClockExpired = dispatch && dispatch.expiryTime && now >= new Date(dispatch.expiryTime).getTime();
    const isThermalExpired = remainingSafeMinutes <= 0 || effectiveElapsedMinutes >= nominalMinutes;
    const isExpired = Boolean(isClockExpired || isThermalExpired);

    if (isExpired) {
      return {
        remainingMinutes: 0,
        freshnessIndex: 0,
        isUrgent: true,
        isExpired: true,
        formattedText: 'Expired',
        dangerZone: category,
        multiplier
      };
    }

    const remainingMinutes = remainingSafeMinutes;
    const isUrgent = remainingMinutes <= 120;

    // Freshness Index (0% to 100%)
    let freshnessIndex = 100;
    if (elapsedRealMinutes > 0.1) {
      const decayRatio = (effectiveElapsedMinutes / nominalMinutes) * 1.35;
      freshnessIndex = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-decayRatio))));
    }

    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    const formattedText = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;

    return {
      remainingMinutes,
      freshnessIndex,
      isUrgent,
      isExpired: false,
      formattedText,
      dangerZone: category,
      multiplier
    };
  }

  /**
   * Simulates food decay curve across a temperature profile.
   * tempProfile: Array of { tempC, durationMinutes }
   * Returns: Array of { timeMinutes, tempC, multiplier, freshnessIndex, pathogenDensity }
   */
  function simulateDecayCurve(dispatch, tempProfile) {
    if (!Array.isArray(tempProfile)) {
      return [];
    }

    let nominalMinutes = 240;
    if (dispatch && typeof dispatch.shelfLifeHours === 'number') {
      nominalMinutes = Math.round(dispatch.shelfLifeHours * 60);
    }

    let accumulatedEffectiveMinutes = 0;
    let cumulativeTimeMinutes = 0;
    const initialPathogen = 100; // Baseline CFU/g
    const points = [];

    tempProfile.forEach((phase) => {
      const tempC = parseTemperature(phase.tempC);
      const duration = typeof phase.durationMinutes === 'number' ? phase.durationMinutes : 30;
      cumulativeTimeMinutes += duration;
      const mult = calculateArrheniusMultiplier(tempC);
      accumulatedEffectiveMinutes += duration * mult;

      const decayRatio = (accumulatedEffectiveMinutes / nominalMinutes) * 1.35;
      const freshness = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-decayRatio))));
      const pathogenDensity = Math.round(initialPathogen * Math.pow(2, accumulatedEffectiveMinutes / 60));

      points.push({
        timeMinutes: cumulativeTimeMinutes,
        tempC,
        multiplier: mult,
        freshnessIndex: freshness,
        pathogenDensity
      });
    });

    return points;
  }

  // Define public module API
  const BhojSafety = {
    parseTemperature,
    getDangerZoneCategory,
    calculateArrheniusMultiplier,
    calculateThermalDecay: calculateArrheniusMultiplier, // API alias
    calculateDynamicShelfLife,
    simulateDecayCurve
  };

  // Export to window / global and CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BhojSafety;
  }
  global.BhojSafety = BhojSafety;

})(typeof window !== 'undefined' ? window : global);
