// Routes requests between OpenSky and AeroDataBox
import { fetchOpenSkyFlights } from './opensky-flights';
import { fetchAeroDataBoxFlights } from './aerodatabox-fallback';
import { calculateCarbonEmissions } from './carbon-calculator';
import { logFlightForPrediction } from './prediction-logger';

export async function getFlightData(departure, arrival, date, travelers = 1) {
  let flightData = null;
  let source = 'unknown';
  
  // Try OpenSky first (OAuth2)
  try {
    flightData = await fetchOpenSkyFlights(departure, arrival, date);
    if (flightData && flightData.length > 0) {
      source = 'opensky';
    }
  } catch (error) {
    console.log('OpenSky failed, trying AeroDataBox...');
  }
  
  // Fallback to AeroDataBox
  if (!flightData || flightData.length === 0) {
    try {
      flightData = await fetchAeroDataBoxFlights(departure, date, 'Departure');
      if (flightData && flightData.departures) {
        // Filter for our route
        flightData = flightData.departures.filter(f => 
          f.arrival.airport.iata === arrival
        );
        source = 'aerodatabox';
      }
    } catch (error) {
      console.log('AeroDataBox failed, using mock data...');
    }
  }
  
  // Final fallback: mock data
  if (!flightData || flightData.length === 0) {
    flightData = [generateMockFlight(departure, arrival, date)];
    source = 'mock';
  }
  
  const primaryFlight = flightData[0];
  
  // Calculate carbon emissions
  const carbonData = calculateCarbonEmissions(primaryFlight, travelers);
  
  // Log for prediction (if real data)
  if (source !== 'mock') {
    await logFlightForPrediction(primaryFlight);
  }
  
  return {
    flight: primaryFlight,
    carbon: carbonData,
    source,
    alternatives: flightData.slice(1, 3)
  };
}
