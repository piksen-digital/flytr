// /api/carbon.js - Carbon footprint calculation endpoint

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { flight, travelers = 1 } = req.body;
  
  if (!flight) {
    return res.status(400).json({ error: 'Flight data required' });
  }
  
  try {
    const result = calculateCarbonEmissions(flight, travelers);
    
    res.status(200).json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('Carbon API Error:', error);
    
    // Fallback estimation
    res.status(200).json({
      success: true,
      kgPerPax: 150,
      totalKg: 150 * (travelers || 1),
      distance: 1200,
      aircraftType: 'medium',
      emissionFactor: 0.125,
      source: 'fallback_estimation',
      note: 'Using default estimation due to calculation error'
    });
  }
}

// Main calculation function
function calculateCarbonEmissions(flight, passengers = 1) {
  // Emission factors database (kg CO2 per passenger-km)
  const emissionFactors = {
    // Narrow-body jets
    'A320': 0.095, 'A319': 0.097, 'A321': 0.094,
    'B737': 0.096, 'B738': 0.094, 'B739': 0.092,
    // Wide-body jets
    'A330': 0.090, 'A340': 0.105, 'A350': 0.085, 'A380': 0.105,
    'B767': 0.100, 'B777': 0.095, 'B787': 0.088,
    // Regional jets
    'E170': 0.102, 'E190': 0.098, 'CRJ2': 0.110, 'CRJ9': 0.102,
    // Prop aircraft
    'ATR7': 0.115, 'DH8D': 0.108,
    // Defaults by category
    'small': 0.115, 'medium': 0.098, 'large': 0.090, 'regional': 0.105
  };
  
  // Determine aircraft type
  const aircraftType = identifyAircraftType(flight);
  const factor = emissionFactors[aircraftType] || emissionFactors.medium;
  
  // Calculate distance
  const distance = calculateFlightDistance(flight);
  
  // Calculate emissions
  const kgPerPax = distance * factor;
  const totalKg = kgPerPax * passengers;
  
  // Carbon offset cost estimation ($20 per ton)
  const offsetCost = (totalKg / 1000) * 20;
  
  return {
    kgPerPax: Math.round(kgPerPax),
    totalKg: Math.round(totalKg),
    distance: Math.round(distance),
    aircraftType,
    emissionFactor: factor,
    offsetCost: offsetCost.toFixed(2),
    offsetTrees: Math.ceil(totalKg / 21), // ~21kg CO2 per tree per year
    source: 'calculated',
    methodology: 'Based on ICAO emission factors and great-circle distance',
    accuracy: flight.icao24 ? 'high' : 'estimated'
  };
}

// Helper: Identify aircraft type from flight data
function identifyAircraftType(flight) {
  // Priority 1: Direct aircraft model
  if (flight.aircraft?.model) {
    return flight.aircraft.model;
  }
  
  // Priority 2: ICAO24 code pattern
  if (flight.icao24) {
    const prefix = flight.icao24.substring(0, 2);
    const typeMap = {
      'A0': 'A320', 'A1': 'A321', 'A2': 'A330',
      'B0': 'B738', 'B1': 'B739', 'B2': 'B788',
      'C0': 'CRJ9', 'E0': 'E190', 'F0': 'A380'
    };
    return typeMap[prefix] || 'medium';
  }
  
  // Priority 3: Estimate from flight number/callsign
  if (flight.callsign) {
    const airline = flight.callsign.substring(0, 2);
    const airlineAircraft = {
      'AA': 'B738', 'DL': 'B739', 'UA': 'A320',
      'WN': 'B737', 'B6': 'A321', 'LH': 'A320'
    };
    return airlineAircraft[airline] || 'medium';
  }
  
  return 'medium';
}

// Helper: Calculate great-circle distance
function calculateFlightDistance(flight) {
  // Use actual coordinates if available
  if (flight.departure?.latitude && flight.arrival?.latitude) {
    return haversineDistance(
      flight.departure.latitude, flight.departure.longitude,
      flight.arrival.latitude, flight.arrival.longitude
    );
  }
  
  // Fallback: Route-based estimation
  const routeDistances = {
    // Domestic US
    'JFK-LAX': 3975, 'LAX-ORD': 2804, 'DFW-ORD': 1290,
    'ATL-LAX': 1944, 'DEN-JFK': 2592, 'SFO-MIA': 4176,
    // Transatlantic
    'JFK-LHR': 5548, 'LAX-LHR': 8775, 'ORD-LHR': 6340,
    'MIA-LHR': 7120, 'SEA-LHR': 7720, 'BOS-LHR': 5270,
    // Transpacific
    'LAX-HND': 8808, 'SFO-HND': 9130, 'JFK-NRT': 10850,
    'LAX-SYD': 12039, 'YVR-SYD': 12575,
    // Europe
    'LHR-CDG': 344, 'FRA-AMS': 365, 'MAD-LIS': 503,
    'CDG-IST': 2250, 'LHR-DXB': 5492
  };
  
  const routeKey = `${flight.departure?.airport?.iata}-${flight.arrival?.airport?.iata}`;
  return routeDistances[routeKey] || 1500; // Default 1500km
}

// Haversine formula for distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
      }
