// OpenSky OAuth2 authentication & flight data fetching
import { getOpenSkyToken } from './opensky-auth';

export async function fetchOpenSkyFlights(departureIata, arrivalIata, date) {
  try {
    const token = await getOpenSkyToken();
    
    // Convert date to Unix timestamps (OpenSky uses seconds)
    const startTime = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000);
    const endTime = Math.floor(new Date(date + 'T23:59:59Z').getTime() / 1000);
    
    // Fetch flights by airport
    const response = await fetch(
      `https://opensky-network.org/api/flights/departure?airport=${departureIata}&begin=${startTime}&end=${endTime}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    if (!response.ok) throw new Error(`OpenSky API error: ${response.status}`);
    
    const data = await response.json();
    
    // Filter for specific arrival airport
    return data.filter(flight => 
      flight.estArrivalAirport === arrivalIata || 
      flight.estDepartureAirport === arrivalIata
    );
    
  } catch (error) {
    console.error('OpenSky API Error:', error);
    return null; // Trigger fallback
  }
}
