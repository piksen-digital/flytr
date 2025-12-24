// /api/flights.js - Main endpoint with smart routing between APIs
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
  
  // Calculate carbon emissions
  const carbonData = calculateCarbonEmissions(primaryFlight, travelers);
  
  return {
    flight: primaryFlight,
    carbon: carbonData,
    source,
    alternatives: Array.isArray(flightData) ? flightData.slice(1, 3) : []
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
      source: result.source,
      alternatives: result.alternatives
    });
    
  } catch (error) {
    console.error('Flight API Error:', error);
    res.status(200).json({
      success: true,
      data: generateMockFlight(from, to, date),
      carbon: getDefaultEstimation(travelers),
      source: 'mock_error',
      note: 'All flight APIs failed, using realistic mock data'
    });
  }
}

// Helper: Fetch from AeroDataBox
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

// Helper: Generate mock flight
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
      estimated: `${date}T10:15:00Z`
    },
    arrival: {
      airport: { iata: to, name: `${to} Airport` },
      scheduled: `${date}T13:00:00Z`,
      estimated: `${date}T13:20:00Z`
    },
    status: 'scheduled',
    aircraft: { model: 'B738' }
  };
}

// Helper: Carbon calculation
function calculateCarbonEmissions(flightData, passengers = 1) {
  // Emission factors (kg CO2 per passenger-km)
  const emissionFactors = {
    'A320': 0.095, 'B738': 0.094, 'B739': 0.092,
    'A359': 0.085, 'B788': 0.088, 'B789': 0.087,
    'small': 0.120, 'medium': 0.100, 'large': 0.090,
  };
  
  const aircraftType = flightData.aircraft?.model || 'medium';
  const factor = emissionFactors[aircraftType] || emissionFactors.medium;
  
  // Estimate distance (would use actual airport coordinates in production)
  const routeDistances = {
    'JFK-LAX': 3975, 'LHR-JFK': 5548, 'LAX-LHR': 8775,
    'DFW-ORD': 1290, 'ATL-LAX': 1944
  };
  const routeKey = `${flightData.departure?.airport?.iata}-${flightData.arrival?.airport?.iata}`;
  const distance = routeDistances[routeKey] || 1500;
  
  const kgPerPax = distance * factor;
  const totalKg = kgPerPax * passengers;
  
  return {
    kgPerPax: Math.round(kgPerPax),
    totalKg: Math.round(totalKg),
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
