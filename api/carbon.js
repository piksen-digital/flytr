// /api/carbon.js - Carbon footprint calculation endpoint (enhanced + robust)
// - Returns detailed carbon estimation and several lightweight enhancements:
//   - Train comparison (estimate % savings)
//   - Offset recommendation (trees & cost, Ecosia link)
//   - Airline efficiency relative to average
//   - Seat-class impact multipliers and estimates
//   - Carbon budget percent (compared to annual recommended travel carbon)
//   - Optional SAF (sustainable aviation fuel) projection if requested via body.use_saf = true
//
// Notes:
// - No external integrations required.
// - Input: { flight: {...}, travelers?: number, seat_class?: 'economy'|'premium'|'business', use_saf?: boolean, corporate?: boolean, loyalty_status?: string }
// - Returns consistent schema with success:true on normal and fallback responses.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { flight, travelers = 1, seat_class = 'economy', use_saf = false, corporate = false, loyalty_status = null } = req.body || {};

  if (!flight) {
    return res.status(400).json({ success: false, error: 'Flight data required' });
  }

  try {
    const result = calculateCarbonEmissionsEnhanced(flight, travelers, seat_class, use_saf, corporate, loyalty_status);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Carbon API Error:', error);
    // Safe fallback with consistent schema
    const fallback = {
      success: true,
      kgPerPax: 150,
      totalKg: 150 * (travelers || 1),
      distance: 1200,
      aircraftType: 'medium',
      emissionFactor: 0.125,
      offsetCost: (150 * (travelers || 1) / 1000 * 20).toFixed(2),
      offsetTrees: Math.ceil((150 * (travelers || 1)) / 21),
      source: 'fallback_estimation',
      note: 'Using default estimation due to calculation error'
    };
    return res.status(200).json(fallback);
  }
}

// --------------------------
// Main enhanced calculation
// --------------------------
function calculateCarbonEmissionsEnhanced(flight, passengers = 1, seatClass = 'economy', useSaf = false, corporate = false, loyaltyStatus = null) {
  // Emission factors database (kg CO2 per passenger-km)
  const emissionFactors = {
    'A320': 0.095, 'A319': 0.097, 'A321': 0.094,
    'B737': 0.096, 'B738': 0.094, 'B739': 0.092,
    'A330': 0.090, 'A340': 0.105, 'A350': 0.085, 'A380': 0.105,
    'B767': 0.100, 'B777': 0.095, 'B787': 0.088,
    'E170': 0.102, 'E190': 0.098, 'CRJ2': 0.110, 'CRJ9': 0.102,
    'ATR7': 0.115, 'DH8D': 0.108,
    'small': 0.115, 'medium': 0.098, 'large': 0.090, 'regional': 0.105
  };

  // Defaults & constants
  const ANNUAL_TRAVEL_BUDGET_KG = 2000; // ~2 tonnes per year as a simple budget
  const OFFSET_USD_PER_TON = 20; // $20/tonne assumption for quick offset cost
  const TREE_KG_PER_YEAR = 21; // approx CO2 sequestration per tree/year
  const TRAIN_SAVINGS_IF_SHORTER_THAN_KM = 1000; // assume train viable under 1000km
  const TRAIN_SAVINGS_PERCENT = 0.85; // trains emit ~85% less for similar routes

  // Determine aircraft type & factor
  const aircraftType = identifyAircraftType(flight);
  const factor = emissionFactors[aircraftType] || emissionFactors.medium;

  // Distance (km)
  const distance = calculateFlightDistance(flight);

  // Base emissions (economy baseline)
  let kgPerPax = distance * factor;

  // Seat class multipliers (simple heuristics)
  const seatMultipliers = {
    economy: 1,
    premium: 1.5,
    business: 3
  };
  const seatMultiplier = seatMultipliers[seatClass] || 1;
  const kgPerPaxSeat = kgPerPax * seatMultiplier;
  const totalKg = Math.round(kgPerPaxSeat * passengers);

  // Offset cost & trees
  const offsetCost = ((totalKg / 1000) * OFFSET_USD_PER_TON);
  const offsetTrees = Math.ceil(totalKg / TREE_KG_PER_YEAR);

  // Airline efficiency ranking (compare factor to average of emissionFactors)
  const avgFactor = averageEmissionFactor(emissionFactors);
  const efficiencyPercent = Math.round(((avgFactor - factor) / avgFactor) * 100); // positive => more efficient than average

  // Train comparison (if route short enough)
  let trainComparison = null;
  if (distance <= TRAIN_SAVINGS_IF_SHORTER_THAN_KM) {
    const trainKg = Math.round(kgPerPax * (1 - TRAIN_SAVINGS_PERCENT));
    const savingsPct = Math.round((1 - (trainKg / kgPerPax)) * 100);
    trainComparison = {
      available: true,
      trainKgPerPax: trainKg,
      savingsPercent: savingsPct,
      message: `Estimated train saves ~${savingsPct}% CO₂ compared to flying on this route.`
    };
  } else {
    trainComparison = { available: false, message: 'Train alternative not realistic for this route (long distance).' };
  }

  // Carbon budget percent
  const carbonBudgetPercent = Math.round((totalKg / ANNUAL_TRAVEL_BUDGET_KG) * 100);

  // SAF projection (simple model). Typical ranges vary; use 60% reduction when enabled as requested.
  let saf = null;
  if (useSaf) {
    const safReduction = 0.6; // -60% emissions
    const kgPerPaxSaf = Math.round(kgPerPaxSeat * (1 - safReduction));
    const totalKgSaf = Math.round(kgPerPaxSaf * passengers);
    saf = {
      enabled: true,
      reductionPercent: Math.round(safReduction * 100),
      kgPerPaxSaf,
      totalKgSaf,
      note: 'Estimate assumes broad SAF adoption lowering lifecycle emissions by ~60%'
    };
  } else {
    saf = { enabled: false };
  }

  // Corporate policy checker (lightweight): accept 'corporate' boolean - if true show message
  const corporatePolicy = corporate ? { applies: true, message: 'Your company policy applies offsets to business travel' } : { applies: false, message: 'No corporate offset policy detected' };

  // Frequent flyer impact estimation (simple heuristic)
  let frequentFlyerImpact = null;
  if (loyaltyStatus) {
    // approximate annual impact by status
    const statusAnnualMultiplier = {
      none: 1,
      silver: 1.05,
      gold: 1.1,
      platinum: 1.2,
      diamond: 1.3
    };
    const norm = (statusAnnualMultiplier[loyaltyStatus.toLowerCase()] || 1);
    const estimatedAnnualTons = Math.round((ANNUAL_TRAVEL_BUDGET_KG * norm) / 1000 * 10) / 10; // crude
    frequentFlyerImpact = {
      status: loyaltyStatus,
      estimatedAnnualTons,
      message: `Estimated annual CO₂ influenced by status: ~${estimatedAnnualTons} tCO₂`
    };
  }

  // Airline-friendly logo helper (client may use)
  const airline = flight.airline || flight.flight?.airline || flight.callsign?.slice(0,2) || null;
  const airlineLogo = airline ? `https://pics.avs.io/120/80/${airline}.png` : null;

  // Compose human-friendly strings
  const summary = `Estimated ${Math.round(kgPerPaxSeat)} kg CO₂ per passenger (${distance} km). Total for ${passengers} passenger(s): ${totalKg} kg. Offset ≈ $${offsetCost.toFixed(2)} or plant ${offsetTrees} trees.`;

  return {
    // numeric results
    kgPerPax: Math.round(kgPerPaxSeat),
    totalKg,
    distance: Math.round(distance),
    aircraftType,
    emissionFactor: factor,
    offsetCost: offsetCost.toFixed(2),
    offsetTrees,
    source: 'calculated_enhanced',
    methodology: 'Heuristic based on per-aircraft emission factors and great-circle distance',

    // enhancements
    seatClass: {
      requested: seatClass,
      multiplier: seatMultiplier,
      kgPerPaxBaseline: Math.round(kgPerPax),
      kgPerPaxWithSeat: Math.round(kgPerPaxSeat)
    },
    trainComparison,
    airlineEfficiency: {
      airline: airline || 'unknown',
      efficiencyPercent: efficiencyPercent, // positive = better than average
      note: efficiencyPercent > 0 ? `${airline || 'Carrier'} is estimated ${Math.abs(efficiencyPercent)}% more efficient than average` : `${airline || 'Carrier'} is estimated ${Math.abs(efficiencyPercent)}% less efficient than average`
    },
    carbonBudget: {
      annualBudgetKg: ANNUAL_TRAVEL_BUDGET_KG,
      usedPercent: carbonBudgetPercent,
      message: `This trip uses approximately ${carbonBudgetPercent}% of an annual travel carbon budget of ${ANNUAL_TRAVEL_BUDGET_KG} kg CO₂`
    },
    saf,
    corporatePolicy,
    frequentFlyerImpact,
    airlineLogo,
    summary,

    // quick action links (client-safe)
    offsetLink: `https://www.ecosia.org/` // simple suggestion; replace with partner link if available
  };
}

// --------------------------
// Helpers (same logic as earlier, robustified)
// --------------------------
function identifyAircraftType(flight) {
  // Priority 1: Direct aircraft model
  const model = flight.aircraft?.model || flight.aircraft?.modelcode || null;
  if (model && typeof model === 'string') {
    // Normalize common formats (B738, B737-800, etc.)
    const m = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (m.startsWith('B738') || m.startsWith('B737')) return 'B738';
    if (m.startsWith('B739')) return 'B739';
    if (m.startsWith('A320')) return 'A320';
    if (m.startsWith('A321')) return 'A321';
    if (m.startsWith('A350')) return 'A350';
    if (m.startsWith('B787')) return 'B787';
    if (m.startsWith('A380')) return 'A380';
    return m;
  }

  // Priority 2: ICAO24 pattern (best-effort)
  if (flight.icao24) {
    const prefix = flight.icao24.substring(0, 2).toUpperCase();
    const typeMap = {
      'A0': 'A320', 'A1': 'A321', 'A2': 'A330',
      'B0': 'B738', 'B1': 'B739', 'B2': 'B788',
      'C0': 'CRJ9', 'E0': 'E190', 'F0': 'A380'
    };
    return typeMap[prefix] || 'medium';
  }

  // Priority 3: Callsign/flightNumber heuristic
  if (flight.callsign || flight.flight) {
    const cs = (flight.callsign || (flight.flight && flight.flight.iata) || '').toUpperCase();
    const airline = cs.substring(0, 2);
    const airlineAircraft = {
      'AA': 'B738', 'DL': 'B739', 'UA': 'A320', 'WN': 'B737', 'B6': 'A321', 'LH': 'A320'
    };
    return airlineAircraft[airline] || 'medium';
  }

  return 'medium';
}

function calculateFlightDistance(flight) {
  // Use actual coordinates if available
  if (flight.departure?.latitude && flight.departure?.longitude && flight.arrival?.latitude && flight.arrival?.longitude) {
    return haversineDistance(
      Number(flight.departure.latitude), Number(flight.departure.longitude),
      Number(flight.arrival.latitude), Number(flight.arrival.longitude)
    );
  }

  // Fallback: route-based estimation using IATA codes
  const routeDistances = {
    'JFK-LAX': 3975, 'LAX-ORD': 2804, 'DFW-ORD': 1290,
    'ATL-LAX': 1944, 'DEN-JFK': 2592, 'SFO-MIA': 4176,
    'JFK-LHR': 5548, 'LAX-LHR': 8775, 'ORD-LHR': 6340,
    'MIA-LHR': 7120, 'SEA-LHR': 7720, 'BOS-LHR': 5270,
    'LAX-HND': 8808, 'SFO-HND': 9130, 'JFK-NRT': 10850,
    'LAX-SYD': 12039, 'YVR-SYD': 12575,
    'LHR-CDG': 344, 'FRA-AMS': 365, 'MAD-LIS': 503,
    'CDG-IST': 2250, 'LHR-DXB': 5492
  };

  const origin = flight.departure?.airport?.iata || (flight.origin || '').toUpperCase();
  const dest = flight.arrival?.airport?.iata || (flight.destination || '').toUpperCase();
  const routeKey = `${origin}-${dest}`;

  return routeDistances[routeKey] || (flight.distance ? Number(flight.distance) : 1500);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function averageEmissionFactor(map) {
  const vals = Object.values(map).filter(v => typeof v === 'number');
  if (vals.length === 0) return 0.1;
  const sum = vals.reduce((s, v) => s + v, 0);
  return sum / vals.length;
}