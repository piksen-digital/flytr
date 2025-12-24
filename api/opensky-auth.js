// /api/opensky-auth.js
let openskyToken = null;
let tokenExpiry = 0;

async function getOpenSkyToken() {
  // If token is still valid, return it
  if (openskyToken && Date.now() < tokenExpiry) {
    return openskyToken;
  }
  
  // Get new token
  const response = await fetch('https://opensky-network.org/api/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OPENSKY_CLIENT_ID,
      client_secret: process.env.OPENSKY_CLIENT_SECRET,
    }),
  });
  
  const data = await response.json();
  
  // Store token with 1-hour buffer (tokens usually last 1-2 hours)
  openskyToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 3600000;
  
  return openskyToken;
}

// Then use in API calls:
async function fetchOpenSkyData(endpoint) {
  const token = await getOpenSkyToken();
  
  const response = await fetch(`https://opensky-network.org/api/${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}
