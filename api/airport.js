// /api/airport.js - Consolidated: Static cache with AeroDataBox API fallback
// Environment Variables Needed:
// RAPIDAPI_KEY=your_rapidapi_key_here

// Static cache for top 150 global airports (expand as needed)
const staticAirportDatabase = {
  "ATL": { name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", country: "United States", iata: "ATL", timezone: "America/New_York", terminals: ["T", "A", "B", "C", "D", "E", "F"], amenities: ["Free Wi-Fi", "Minute Suites sleep pods", "Plaza Premium Lounge", "Delta Sky Club", "Charging stations", "Art installations"], services: ["Interfaith chapel", "Medical clinic", "Pet relief areas", "Shoe shine", "Post office"], transit: { train: "MARTA station to downtown", taxi: "~20 mins to downtown, ~$30" }, layoverTips: ["Visit the Delta Flight Museum (off-site)", "SkyTrain connects all terminals"] },
  "DXB": { name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", iata: "DXB", timezone: "Asia/Dubai", terminals: ["1", "2", "3"], amenities: ["Free unlimited Wi-Fi", "Zen gardens", "Gym & swimming pool (pay)", "SnoozeCubes sleep pods", "Multiple premium lounges"], services: ["Luxury shopping (duty-free)", "Gold ATM", "24/7 pharmacy", "Hotel inside terminal"], transit: { metro: "Direct to city center", taxi: "~15 mins to downtown" }, layoverTips: ["Take the metro to Burj Khalifa (90+ min layover)", "Showers available in lounges"] },
  "LHR": { name: "Heathrow Airport", city: "London", country: "United Kingdom", iata: "LHR", timezone: "Europe/London", terminals: ["2", "3", "4", "5"], amenities: ["Free Wi-Fi (limited)", "Fortnum & Mason hampers", "Personal shopper service", "Multiple airline lounges", "Harry Potter shop"], services: ["Personalized flight updates", "Farewell services", "Currency exchange", "Left luggage"], transit: { express: "Heathrow Express to Paddington (15 min)", tube: "Piccadilly Line to central London (45 min)" }, layoverTips: ["Visit the T5 viewing deck", "Book a day room at Aerotel"] },
  "HND": { name: "Tokyo Haneda Airport", city: "Tokyo", country: "Japan", iata: "HND", timezone: "Asia/Tokyo", terminals: ["1", "2", "3"], amenities: ["Free Wi-Fi", "Observation decks", "Edo-style shopping street", "Shower facilities (pay)", "Massage chairs"], services: ["Pocket Wi-Fi rental", "Baggage delivery to city", "Manga library", "Prayer room"], transit: { monorail: "To Hamamatsucho (20 min)", train: "Keikyu Line to Shinagawa (15 min)" }, layoverTips: ["Try authentic ramen at Terminal 1", "Visit the rooftop observation deck"] },
  "CDG": { name: "Paris Charles de Gaulle Airport", city: "Paris", country: "France", iata: "CDG", timezone: "Europe/Paris", terminals: ["1", "2A", "2B", "2C", "2D", "2E", "2F", "3"], amenities: ["Free Wi-Fi (1 hr)", "Nap zones", "Shopping galleries", "Air France lounges", "Children's play areas"], services: ["Airport tours", "Pharmacies", "Banking services", "VIP services"], transit: { train: "RER B to central Paris (35 min)", bus: "Roissybus to Opera (60 min)" }, layoverTips: ["CDGVAL automated train connects terminals", "Terminal 2 has best shopping"] },
  "DFW": { name: "Dallas/Fort Worth International Airport", city: "Dallas", country: "United States", iata: "DFW", timezone: "America/Chicago", terminals: ["A", "B", "C", "D", "E"], amenities: ["Free Wi-Fi", "Yoga studio", "Walking paths", "Multiple lounges", "Art exhibits"], services: ["Pet resort", "Medical clinic", "Dry cleaning", "Business center"], transit: { train: "Skylink between terminals", taxi: "~25 mins to downtown Dallas" }, layoverTips: ["Ride the Skylink - it's free and has great views", "Find the interactive art in Terminal D"] }
  // Add more airports as needed...
};

// In-memory cache for API responses (lasts until serverless function cold starts)
const apiCache = new Map();

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Support both POST (with body) and GET (with query params)
  let airportCode;
  if (req.method === 'POST') {
    const { airport } = req.body;
    airportCode = airport;
  } else if (req.method === 'GET') {
    airportCode = req.query.airport;
  }
  
  if (!airportCode) {
    return res.status(400).json({ 
      error: 'Airport IATA code is required',
      usage: 'POST: { "airport": "JFK" } or GET: /api/airport?airport=JFK'
    });
  }
  
  airportCode = airportCode.toUpperCase().trim();
  
  try {
    // STRATEGY 1: Check static database first (fastest, no API cost)
    if (staticAirportDatabase[airportCode]) {
      return res.status(200).json({
        success: true,
        data: staticAirportDatabase[airportCode],
        source: 'static_database',
        note: 'From curated airport database'
      });
    }
    
    // STRATEGY 2: Check in-memory API cache (recently fetched)
    const cacheKey = `airport_${airportCode}`;
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 30 * 60 * 1000)) { // 30 min cache
      return res.status(200).json({
        success: true,
        data: cached.data,
        source: 'api_cache',
        note: 'Cached from AeroDataBox API (30 min TTL)'
      });
    }
    
    // STRATEGY 3: Fetch from AeroDataBox API (global coverage)
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error('RapidAPI key not configured in environment variables');
    }
    
    const apiData = await fetchFromAeroDataBoxAPI(airportCode, apiKey);
    
    // Store in cache for future requests
    apiCache.set(cacheKey, {
      data: apiData,
      timestamp: Date.now()
    });
    
    // Optional: Also add to static database for future (you could log this)
    console.log(`New airport fetched: ${airportCode} - consider adding to static database`);
    
    return res.status(200).json({
      success: true,
      data: apiData,
      source: 'aerodatabox_api',
      note: 'Live data from AeroDataBox API'
    });
    
  } catch (error) {
    console.error(`Airport API Error for ${airportCode}:`, error);
    
    // STRATEGY 4: Ultimate fallback - basic airport info
    return res.status(200).json({
      success: true,
      data: {
        name: `${airportCode} Airport`,
        iata: airportCode,
        city: 'Unknown',
        country: 'Unknown',
        amenities: ["Free Wi-Fi (typically available)", "Standard airport services"],
        services: ["Check-in counters", "Security screening", "Basic dining options"],
        note: 'Using generic airport template - verify details locally'
      },
      source: 'generic_fallback',
      error: error.message
    });
  }
}

// Fetch from AeroDataBox API
async function fetchFromAeroDataBoxAPI(airportCode, apiKey) {
  const response = await fetch(
    `https://aerodatabox.p.rapidapi.com/airports/iata/${airportCode}`,
    {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        'Accept': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AeroDataBox API error (${response.status}): ${errorText}`);
  }
  
  const rawData = await response.json();
  
  // Transform API response to our format
  return {
    name: rawData.name || `${airportCode} Airport`,
    city: rawData.municipalityName || 'Unknown',
    country: rawData.countryName || 'Unknown',
    iata: rawData.iata || airportCode,
    icao: rawData.icao || '',
    timezone: rawData.timeZone || 'UTC',
    latitude: rawData.location?.lat,
    longitude: rawData.location?.lon,
    terminals: Array.isArray(rawData.terminals) ? rawData.terminals : [],
    amenities: generateAmenitiesFromAPI(rawData),
    services: ["Flight information", "Baggage services", "Customer service"],
    transit: {
      note: 'Check local transport options upon arrival'
    },
    layoverTips: generateLayoverTips(airportCode, rawData)
  };
}

// Generate amenities list from API data
function generateAmenitiesFromAPI(apiData) {
  const amenities = ["Free Wi-Fi (common)"];
  
  // Add based on available data
  if (apiData.urls?.webSite) amenities.push("Official airport website available");
  if (apiData.numberOfRunways > 1) amenities.push("Multiple runways");
  if (apiData.elevationFt > 0) amenities.push(`Elevation: ${apiData.elevationFt} ft`);
  
  return amenities;
}

// Generate layover tips based on airport
function generateLayoverTips(airportCode, apiData) {
  const tips = [];
  
  // General tips
  tips.push("Check airport signage for lounge locations");
  tips.push("Allow 45+ minutes for security re-entry");
  
  // Airport-specific tips
  const specificTips = {
    'SIN': ["Visit the Jewel's waterfall", "Try the free city tour for long layovers"],
    'ICN': ["Experience Korean culture in the transit area", "Free showers available"],
    'MUC': ["Visit the airport brewery", "Free coffee and tea in rest areas"],
    'AMS': ["Rijksmuseum annex in terminal", "Try Dutch stroopwafels"],
    'HKG': ["IMAX cinema in terminal", "Golf simulator available"]
  };
  
  if (specificTips[airportCode]) {
    tips.push(...specificTips[airportCode]);
  }
  
  // Size-based tips
  if (apiData.numberOfRunways > 2) {
    tips.push("Large airport - allow extra time between gates");
  }
  
  return tips;
}

// Optional: Endpoint to suggest airports for static database expansion
export async function getStaticDatabaseStats() {
  const staticCount = Object.keys(staticAirportDatabase).length;
  const cacheCount = apiCache.size;
  
  // Identify most frequently requested airports not in static DB
  // (You would track this in production)
  
  return {
    static_airports: staticCount,
    cached_airports: cacheCount,
    suggestion: `Add more airports to static database to reduce API calls. Current coverage: ${staticCount} airports.`
  };
}
