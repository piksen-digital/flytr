// /api/flights.js - Main endpoint with smart routing between APIs
// Enhanced: returns travel planner hints (when-to-leave, check-in/boarding guidance, connection risk)
// and ensures carbon info is included in structured form.

import { fetchOpenSkyFlights } from './opensky.js';

// Smart router: tries OpenSky first, then AeroDataBox, then mock
async function getFlightData(departure, arrival, date, travelers = 1) {
  let flightData = null;
  let source = 'unknown';

  // 1. Try OpenSky (OAuth2)
  try {
    flightData = await fetchOpenSkyFlights(departure, arrival, date);
    if (flightData) {
      source = 'opensky';
    }
  } catch (error) {
    console.log('OpenSky failed:', error.message);
  }

  // 2. Fallback to AeroDataBox
  if (!flightData) {
    try {
      flightData = await fetchAeroDataBoxFlights(departure, date, 'Departure');
      if (flightData?.departures) {
        // Filter for our route
        flightData = flightData.departures.filter(f =>
          f.arrival?.airport?.iata === arrival
        );
        source = 'aerodatabox';
      }
    } catch (error) {
      console.log('AeroDataBox failed:', error.message);
    }
  }

  // 3. Final fallback: mock data
  if (!flightData || flightData.length === 0) {
    flightData = [generateMockFlight(departure, arrival, date)];
    source = 'mock';
  }

  const primaryFlight = Array.isArray(flightData) ? flightData[0] : flightData;

  // Calculate carbon emissions (reuse local helper)
  const carbonData = calculateCarbonEmissions(primaryFlight, travelers);

  // Build travel planner hints (simple heuristics)
  const travelPlanner = generateTravelPlannerHints(primaryFlight);

  // Include alternatives (next 2 flights or mock)
  const alternatives = Array.isArray(flightData) ? flightData.slice(1, 4) : [];

  return {
    flight: primaryFlight,
    carbon: carbonData,
    planner: travelPlanner,
    source,
    alternatives
  };
}

// Main API handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { from, to, date, travelers = 1 } = req.body;

  if (!from || !to || !date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await getFlightData(from, to, date, travelers);

    res.status(200).json({
      success: true,
      data: result.flight,
      carbon: result.carbon,
      planner: result.planner,
      source: result.source,
      alternatives: result.alternatives
    });

  } catch (error) {
    console.error('Flight API Error:', error);
    const mock = generateMockFlight(from, to, date);
    res.status(200).json({
      success: true,
      data: mock,
      carbon: getDefaultEstimation(travelers),
      planner: generateTravelPlannerHints(mock),
      source: 'mock_error',
      note: 'All flight APIs failed, using realistic mock data'
    });
  }
}

// -------------------
// Travel Planner Hints
// -------------------
function generateTravelPlannerHints(flight) {
  // Extract departure time (attempt to parse several possible fields)
  const depIso = flight.departure?.scheduled || flight.departure?.estimated || flight.departure_time || null;
  let depDate = null;
  if (depIso) {
    depDate = new Date(depIso);
    if (isNaN(depDate.getTime())) {
      // Try if timestamp seconds
      if (/^\d{10}$/.test(String(depIso))) depDate = new Date(Number(depIso) * 1000);
      else if (/^\d{13}$/.test(String(depIso))) depDate = new Date(Number(depIso));
      else depDate = null;
    }
  }

  // Default airport processing times (simple heuristics)
  const isInternational = assumeInternational(flight);
  const checkInCloseMinutes = isInternational ? 90 : 60; // close time before departure
  const recommendedArrivalMinutesBefore = isInternational ? 180 : 120; // arrival at airport
  const boardingCloseMinutes = 30; // boarding close before departure
  const securityBufferMinutes = 30; // time for security
  const typicalTransitToAirportMinutes = 60; // default travel time to airport (can be refined on client)

  // When to arrive at airport and when to leave home
  let arrivalAtAirport = null;
  let leaveHomeAt = null;
  let depLocalStr = depDate ? depDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD';
  if (depDate) {
    const arrival = new Date(depDate.getTime() - recommendedArrivalMinutesBefore * 60000);
    arrivalAtAirport = arrival.toISOString();
    const leaveHome = new Date(arrival.getTime() - typicalTransitToAirportMinutes * 60000);
    leaveHomeAt = leaveHome.toISOString();
  }

  // Connection risk assessment (if flight has 'connecting' legs / stops info)
  const connectionRisk = computeConnectionRisk(flight);

  // Alternate routing suggestions (lightweight)
  const alternateSuggestions = [];
  if (flight.stops && flight.stops > 0) {
    alternateSuggestions.push('If you prefer lower connection risk, consider a later non-stop or 1-stop with longer layover.');
  } else {
    alternateSuggestions.push('Non-stop flight — no connection risk estimated.');
  }

  return {
    depLocalTime: depLocalStr,
    recommendedArrivalAtAirportISO: arrivalAtAirport,
    recommendedLeaveHomeISO: leaveHomeAt,
    checkInCloseMinutes,
    boardingCloseMinutes,
    securityBufferMinutes,
    typicalTransitToAirportMinutes,
    connectionRisk,
    alternateSuggestions
  };
}

function assumeInternational(flight) {
  // heuristic: if origin and destination country codes differ (simple IATA->country not available), fallback to checking that IATA prefixes differ
  const from = (flight.departure?.airport?.iata || (flight.origin || '')).toString().toUpperCase();
  const to = (flight.arrival?.airport?.iata || (flight.destination || '')).toString().toUpperCase();
  if (!from || !to) return true;
  // crude: treat certain known domestic pairs as domestic if both US (JFK,LAX,ORD,ATL etc)
  const usIatas = ['JFK','LAX','ORD','ATL','DFW','SFO','MIA','SEA','BOS','IAD','DEN','PHX','IAH'];
  if (usIatas.includes(from) && usIatas.includes(to)) return false;
  // otherwise assume international
  return true;
}

function computeConnectionRisk(flight) {
  // If flight contains legs with timings (AeroDataBox style), compute minimal layover and produce risk %.
  // Otherwise use stops heuristic.
  try {
    if (flight.legs && Array.isArray(flight.legs) && flight.legs.length > 1) {
      // compute layover (in minutes) between first and second leg
      const leg1Arr = new Date(flight.legs[0].arrival_time || flight.legs[0].arrival);
      const leg2Dep = new Date(flight.legs[1].departure_time || flight.legs[1].departure);
      if (!isNaN(leg1Arr) && !isNaN(leg2Dep)) {
        const layoverMin = Math.max(0, Math.round((leg2Dep - leg1Arr) / 60000));
        const risk = layoverRiskPercent(layoverMin);
        return { hasConnection: true, layoverMin, riskPercent: risk, advice: layoverMin < 60 ? 'High risk' : 'Moderate/Low risk' };
      }
    }

    // If stops present but no legs
    if (typeof flight.stops === 'number' && flight.stops > 0) {
      const estLayover = 60; // assume 60 min
      const risk = layoverRiskPercent(estLayover);
      return { hasConnection: true, layoverMin: estLayover, riskPercent: risk, advice: 'Estimated' };
    }

    return { hasConnection: false, layoverMin: 0, riskPercent: 5, advice: 'Non-stop — low connection risk' };
  } catch (e) {
    return { hasConnection: null, layoverMin: null, riskPercent: 30, advice: 'Unable to compute connection risk' };
  }
}

function layoverRiskPercent(mins) {
  if (mins < 45) return 60;
  if (mins < 60) return 40;
  if (mins < 90) return 20;
  return 8;
}

// -------------------
// Existing helpers
// -------------------
async function fetchAeroDataBoxFlights(airport, date, direction) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RapidAPI key not configured');

  const startTime = `${date}T00:00`;
  const endTime = `${date}T23:59`;

  const response = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${airport}/${startTime}/${endTime}?withLeg=true&direction=${direction}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'
      }
    }
  );

  if (!response.ok) throw new Error(`AeroDataBox error: ${response.status}`);
  return await response.json();
}

function generateMockFlight(from, to, date) {
  const flightNumbers = ['AA123', 'DL456', 'UA789', 'WN321', 'B6789'];
  const airlines = ['American Airlines', 'Delta', 'United', 'Southwest', 'British Airways'];
  const randomIndex = Math.floor(Math.random() * flightNumbers.length);

  return {
    icao24: 'ABCDEF',
    callsign: flightNumbers[randomIndex],
    airline: airlines[randomIndex],
    departure: {
      airport: { iata: from, name: `${from} Airport` },
      scheduled: `${date}T10:00:00Z`,
      estimated: `${date}T10:15:00Z`,
      // no lat/lon in mock
    },
    arrival: {
      airport: { iata: to, name: `${to} Airport` },
      scheduled: `${date}T13:00:00Z`,
      estimated: `${date}T13:20:00Z`
    },
    status: 'scheduled',
    aircraft: { model: 'B738' },
    stops: 0
  };
}

// Helper: Carbon calculation (kept consistent with carbon.js)
function calculateCarbonEmissions(flightData, passengers = 1) {
  const emissionFactors = {
    'A320': 0.095, 'B738': 0.094, 'B739': 0.092,
    'A359': 0.085, 'B788': 0.088, 'B789': 0.087,
    'small': 0.120, 'medium': 0.100, 'large': 0.090,
  };

  const aircraftTypeRaw = (flightData.aircraft && (flightData.aircraft.model || flightData.aircraft.modelcode)) || 'medium';
  const aircraftType = (typeof aircraftTypeRaw === 'string' && aircraftTypeRaw.toUpperCase().includes('B738')) ? 'B738' : (typeof aircraftTypeRaw === 'string' ? aircraftTypeRaw.toUpperCase() : aircraftTypeRaw);
  const factor = emissionFactors[aircraftType] || emissionFactors.medium;

  const routeDistances = {
    'JFK-LAX': 3975, 'LHR-JFK': 5548, 'LAX-LHR': 8775,
    'DFW-ORD': 1290, 'ATL-LAX': 1944
  };
  const routeKey = `${flightData.departure?.airport?.iata}-${flightData.arrival?.airport?.iata}`;
  const distance = routeDistances[routeKey] || 1500;

  const kgPerPax = distance * factor;
  const totalKg = Math.round(kgPerPax * passengers);

  return {
    kgPerPax: Math.round(kgPerPax),
    totalKg,
    distance: Math.round(distance),
    aircraftType,
    emissionFactor: factor,
    source: flightData.source === 'mock' ? 'estimated' : 'calculated'
  };
}

function getDefaultEstimation(passengers) {
  return {
    kgPerPax: 150,
    totalKg: 150 * passengers,
    distance: 1200,
    aircraftType: 'medium',
    emissionFactor: 0.125,
    source: 'default_estimation'
  };
}