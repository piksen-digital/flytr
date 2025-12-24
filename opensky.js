// /api/opensky.js - Consolidated OpenSky OAuth2 & Data
let cachedToken = null;
let tokenExpiry = 0;

async function getOpenSkyToken() {
  // Token caching logic from opensky-auth.js
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  const response = await fetch('https://opensky-network.org/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OPENSKY_CLIENT_ID,
      client_secret: process.env.OPENSKY_CLIENT_SECRET,
    }),
  });
  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Buffer
  return cachedToken;
}

async function fetchOpenSkyFlights(departureIata, arrivalIata, date) {
  // Flight fetching logic from opensky-flights.js
  try {
    const token = await getOpenSkyToken(); // Uses merged auth function
    const startTime = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const endTime = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
    const response = await fetch(
      `https://opensky-network.org/api/flights/departure?airport=${departureIata}&begin=${startTime}&end=${endTime}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error(`OpenSky API error: ${response.status}`);
    const allFlights = await response.json();
    // Filter for the specific route
    return allFlights.filter(f => f.estArrivalAirport === arrivalIata);
  } catch (error) {
    console.error('OpenSky fetch failed:', error);
    return null; // Triggers fallback in main flights.js
  }
}

// Export for use by flights.js
export { getOpenSkyToken, fetchOpenSkyFlights };
