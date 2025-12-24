// /api/airport.js - Consolidated: Airport Intelligence, Layover Suggestions & Prediction Logging
// Environment Variables Needed:
// RAPIDAPI_KEY=your_rapidapi_key_here
// SUPABASE_URL=your_project_url (for prediction logging)
// SUPABASE_ANON_KEY=your_anon_key (for prediction logging)

// ===== CONFIGURATION =====
const CONFIG = {
  // Cache TTLs (in milliseconds)
  apiCacheTTL: 30 * 60 * 1000, // 30 minutes for API responses
  staticDataRefresh: 24 * 60 * 60 * 1000, // 24 hours for static data
    
  // Prediction logging
  logToSupabase: true, // Set to false to disable prediction logging
  logSampleRate: 1.0, // Log 100% of requests (adjust for high traffic)
    
  // RapidAPI limits
  maxApiCallsPerDay: 100 // AeroDataBox free tier limit
};

// ===== STATIC AIRPORT DATABASE (Top 100 Airports) =====
const staticAirportDatabase = {
  "ATL": { name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", country: "United States", iata: "ATL", timezone: "America/New_York", terminals: ["T", "A", "B", "C", "D", "E", "F"], amenities: ["Free Wi-Fi", "Minute Suites sleep pods", "Plaza Premium Lounge", "Delta Sky Club", "Charging stations"], services: ["Interfaith chapel", "Medical clinic", "Pet relief areas", "Shoe shine"], transit: { train: "MARTA station to downtown", taxi: "~20 mins, ~$30" }, layoverTips: ["Visit the Delta Flight Museum", "SkyTrain connects all terminals"] },
  "LAX": { name: "Los Angeles International Airport", city: "Los Angeles", country: "United States", iata: "LAX", timezone: "America/Los_Angeles", terminals: ["1", "2", "3", "4", "5", "6", "7", "8", "B", "TBIT"], amenities: ["Free Wi-Fi", "Yoga studio", "Multiple lounges", "Art installations"], services: ["EV charging", "Luggage storage", "Oxygen bar"], transit: { shuttle: "Free terminal shuttle", taxi: "~30 mins, ~$50" } },
  "DXB": { name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", iata: "DXB", timezone: "Asia/Dubai", terminals: ["1", "2", "3"], amenities: ["Free unlimited Wi-Fi", "Zen gardens", "Gym & pool (pay)", "SnoozeCubes"], services: ["Luxury shopping", "Gold ATM", "24/7 pharmacy"], transit: { metro: "Direct to city center", taxi: "~15 mins" } },
  "LHR": { name: "Heathrow Airport", city: "London", country: "United Kingdom", iata: "LHR", timezone: "Europe/London", terminals: ["2", "3", "4", "5"], amenities: ["Free Wi-Fi (limited)", "Fortnum & Mason", "Personal shopper", "Multiple lounges"], services: ["Personalized flight updates", "Farewell services", "Currency exchange"], transit: { express: "Heathrow Express (15 min)", tube: "Piccadilly Line (45 min)" } },
  "HND": { name: "Tokyo Haneda Airport", city: "Tokyo", country: "Japan", iata: "HND", timezone: "Asia/Tokyo", terminals: ["1", "2", "3"], amenities: ["Free Wi-Fi", "Observation decks", "Edo-style street", "Shower facilities"], services: ["Pocket Wi-Fi rental", "Baggage delivery", "Manga library"], transit: { monorail: "To Hamamatsucho (20 min)", train: "Keikyu Line (15 min)" } },
  "CDG": { name: "Paris Charles de Gaulle Airport", city: "Paris", country: "France", iata: "CDG", timezone: "Europe/Paris", terminals: ["1", "2A", "2B", "2C", "2D", "2E", "2F", "3"], amenities: ["Free Wi-Fi (1 hr)", "Nap zones", "Shopping galleries", "Air France lounges"], services: ["Airport tours", "Pharmacies", "Banking services"], transit: { train: "RER B to Paris (35 min)", bus: "Roissybus (60 min)" } },
  "DFW": { name: "Dallas/Fort Worth International Airport", city: "Dallas", country: "United States", iata: "DFW", timezone: "America/Chicago", terminals: ["A", "B", "C", "D", "E"], amenities: ["Free Wi-Fi", "Yoga studio", "Walking paths", "Multiple lounges"], services: ["Pet resort", "Medical clinic", "Dry cleaning"], transit: { train: "Skylink between terminals", taxi: "~25 mins to downtown" } },
  "SIN": { name: "Singapore Changi Airport", city: "Singapore", country: "Singapore", iata: "SIN", timezone: "Asia/Singapore", terminals: ["1", "2", "3", "4", "Jewel"], amenities: ["Free Wi-Fi", "Butterfly Garden", "Movie theater", "Swimming pool"], services: ["Free city tour", "Nap rooms", "Video game consoles"], transit: { mrt: "To city (30 min)", taxi: "~20 mins" } },
  "ICN": { name: "Incheon International Airport", city: "Seoul", country: "South Korea", iata: "ICN", timezone: "Asia/Seoul", terminals: ["1", "2"], amenities: ["Free Wi-Fi", "Ice skating rink", "Cultural museum", "Showers"], services: ["Free transit tours", "Baggage delivery", "Spa services"], transit: { express: "AREX to Seoul (45 min)", bus: "Various routes" } },
  "JFK": { name: "John F. Kennedy International Airport", city: "New York", country: "United States", iata: "JFK", timezone: "America/New_York", terminals: ["1", "2", "4", "5", "7", "8"], amenities: ["Free Wi-Fi", "Multiple lounges", "Nursery", "Prayer room"], services: ["Baggage wrapping", "Currency exchange", "Medical clinic"], transit: { train: "AirTrain to subway", taxi: "~60 mins, ~$70" } }
  // Add 90+ more airports as needed...
};

// ===== IN-MEMORY CACHES =====
const apiResponseCache = new Map(); // API responses
const requestStatsCache = new Map(); // For prediction analytics

// ===== MAIN REQUEST HANDLER =====
export default async function handler(req, res) {
  const requestStartTime = Date.now();
  let requestData = { endpoint: 'airport', success: false };
  
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Parse request parameters
    const { airport, action, duration, ...otherParams } = parseRequest(req);
    requestData = { ...requestData, airport, action, duration, ...otherParams };
    
    if (!airport && action !== 'stats') {
      return await sendResponse(res, 400, { error: 'Airport IATA code is required' }, requestData);
    }
    
    // Route to appropriate handler
    let result;
    if (action === 'layovers') {
      result = await handleLayoverRequest(airport, duration);
    } else if (action === 'stats') {
      result = await handleStatsRequest();
    } else {
      result = await handleAirportRequest(airport);
    }
    
    requestData.success = result.success;
    requestData.source = result.source;
    requestData.responseTime = Date.now() - requestStartTime;
    
    // Log prediction data (async, non-blocking)
    if (CONFIG.logToSupabase && Math.random() < CONFIG.logSampleRate) {
      logPredictionData(requestData).catch(console.error);
    }
    
    return await sendResponse(res, 200, result, requestData);
    
  } catch (error) {
    console.error(`Airport API Error:`, error);
    requestData.success = false;
    requestData.error = error.message;
    requestData.responseTime = Date.now() - requestStartTime;
    
    // Log error for prediction analysis
    if (CONFIG.logToSupabase) {
      logPredictionData(requestData).catch(console.error);
    }
    
    return await sendResponse(res, 500, {
      success: false,
      error: 'Internal server error',
      data: getFallbackData(requestData.airport, requestData.action)
    }, requestData);
  }
}

// ===== REQUEST PARSING =====
function parseRequest(req) {
  if (req.method === 'POST') {
    return req.body || {};
  } else if (req.method === 'GET') {
    return req.query || {};
  }
  return {};
}

// ===== RESPONSE HANDLER =====
async function sendResponse(res, status, data, requestData) {
  const response = {
    ...data,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  };
  
  // Update request stats cache for analytics
  updateRequestStats(requestData);
  
  return res.status(status).json(response);
}

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ===== AIRPORT DATA HANDLER =====
async function handleAirportRequest(airportCode) {
  airportCode = airportCode.toUpperCase().trim();
  
  // 1. Check static database (fastest, no API cost)
  if (staticAirportDatabase[airportCode]) {
    return {
      success: true,
      data: staticAirportDatabase[airportCode],
      source: 'static_database',
      note: 'From curated airport database'
    };
  }
  
  // 2. Check API cache
  const cacheKey = `api_${airportCode}`;
  const cached = apiResponseCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CONFIG.apiCacheTTL)) {
    return {
      success: true,
      data: cached.data,
      source: 'api_cache',
      note: `Cached from AeroDataBox API (${Math.round((CONFIG.apiCacheTTL - (Date.now() - cached.timestamp)) / 60000)} min remaining)`
    };
  }
  
  // 3. Fetch from AeroDataBox API
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error('RapidAPI key not configured');
  }
  
  const apiData = await fetchFromAeroDataBoxAPI(airportCode, apiKey);
  
  // 4. Cache the API response
  apiResponseCache.set(cacheKey, {
    data: apiData,
    timestamp: Date.now()
  });
  
  // 5. Log new airport for potential addition to static DB
  console.log(`[PREDICTION FEED] New airport fetched: ${airportCode}`);
  
  return {
    success: true,
    data: apiData,
    source: 'aerodatabox_api',
    note: 'Live data from AeroDataBox API'
  };
}

// ===== LAYOVER HANDLER =====
async function handleLayoverRequest(airportCode, durationHours = 4) {
  airportCode = airportCode.toUpperCase().trim();
  durationHours = parseInt(durationHours) || 4;
  
  // Get airport data first
  const airportResult = await handleAirportRequest(airportCode);
  
  if (!airportResult.success) {
    throw new Error(`Failed to fetch airport data: ${airportResult.error}`);
  }
  
  const airportData = airportResult.data;
  const suggestions = generateLayoverSuggestions(airportCode, durationHours, airportData);
  
  return {
    success: true,
    airport: airportCode,
    durationHours,
    airportInfo: {
      name: airportData.name,
      city: airportData.city,
      country: airportData.country
    },
    suggestions,
    source: airportResult.source,
    note: `Layover suggestions for ${durationHours} hour${durationHours !== 1 ? 's' : ''}`
  };
}

function generateLayoverSuggestions(airportCode, durationHours, airportData) {
  const durationCategory = durationHours < 3 ? 'short' : durationHours < 8 ? 'medium' : 'long';
  
  const suggestions = {
    durationCategory,
    activities: [],
    services: [],
    warnings: [],
    estimatedCosts: {}
  };
  
  // Duration-based activities
  if (durationCategory === 'short') {
    suggestions.activities.push(
      "Stay airside: explore shops & cafes",
      "Find charging stations and rest zones",
      "Visit airport lounges (purchase day pass if needed)"
    );
    suggestions.warnings.push(
      "Not enough time to exit security and re-enter safely",
      "Stay near your departure gate"
    );
    suggestions.estimatedCosts.loungeAccess = "$30-50";
    
  } else if (durationCategory === 'medium') {
    suggestions.activities.push(
      `Quick city visit: ${airportData.city} downtown or nearby attractions`,
      "Book an airport hotel for a nap or shower",
      "Look for airport-sponsored transit tours"
    );
    suggestions.services.push(
      "Luggage storage services",
      "Shower facilities (often in lounges)",
      "Day rooms/capsule hotels"
    );
    suggestions.warnings.push(
      "Check visa requirements for leaving airport",
      "Allow 2+ hours for security re-entry",
      "Keep boarding pass and ID with you"
    );
    suggestions.estimatedCosts = {
      luggageStorage: "$5-10 per bag",
      cityTransport: "$10-30 round trip",
      dayRoom: "$50-120 for 4 hours"
    };
    
  } else { // long
    suggestions.activities.push(
      `Book a day room at airport hotel or nearby`,
      `Explore ${airportData.city} major attractions`,
      "Visit nearby shopping districts or museums"
    );
    suggestions.services.push(
      "Luggage storage or delivery to hotel",
      "Shower and change facilities",
      "Tourist information desk"
    );
    suggestions.warnings.push(
      "Confirm hotel shuttle availability",
      "Check luggage storage hours",
      "Monitor flight status closely"
    );
    suggestions.estimatedCosts = {
      hotelDayRate: "$80-200",
      attractionTickets: "$20-50",
      roundTripTransport: "$15-40"
    };
  }
  
  // Airport-specific tips
  const airportSpecificTips = {
    'SIN': {
      activities: ["Join the free Singapore tour (2.5+ hour layover required)", "Visit Jewel Changi's canopy park and waterfall"],
      services: ["Free movie theater", "Butterfly garden", "Napping areas"]
    },
    'ICN': {
      activities: ["Try the free transit tour programs", "Visit the cultural experience center", "See traditional performances"],
      services: ["Free showers", "Nap zones", "Ice skating rink"]
    },
    'LHR': {
      activities: ["Take Heathrow Express to Paddington (15 min)", "Book a pod at Aerotel or Yotel"],
      services: ["Personal shopper", "Fortnum & Mason hampers"]
    },
    'HND': {
      activities: ["Try authentic ramen at Terminal 1", "Visit the rooftop observation deck"],
      services: ["Manga library", "Shower facilities", "Massage chairs"]
    },
    'DXB': {
      activities: ["Visit the Dubai Duty Free complex", "See the waterfall in Terminal 3"],
      services: ["Sleep pods", "Gym and pool (pay)", "Zen gardens"]
    }
  };
  
  if (airportSpecificTips[airportCode]) {
    suggestions.activities.push(...airportSpecificTips[airportCode].activities);
    suggestions.services.push(...airportSpecificTips[airportCode].services);
  }
  
  // Add transit options if available
  if (airportData.transit) {
    suggestions.transitOptions = airportData.transit;
  }
  
  return suggestions;
}

// ===== STATS HANDLER (for monitoring) =====
async function handleStatsRequest() {
  const staticCount = Object.keys(staticAirportDatabase).length;
  const cacheCount = apiResponseCache.size;
  const requestStats = getRequestStats();
  
  // Identify candidates for static database expansion
  const apiCalls = Array.from(apiResponseCache.entries())
    .map(([key, value]) => ({
      airport: key.replace('api_', ''),
      lastFetched: new Date(value.timestamp).toISOString(),
      ageHours: Math.round((Date.now() - value.timestamp) / (1000 * 60 * 60))
    }))
    .filter(item => item.ageHours < 168); // Last 7 days
  
  return {
    success: true,
    stats: {
      staticDatabase: {
        airports: staticCount,
        coverage: `${staticCount} airports`
      },
      cache: {
        cachedAirports: cacheCount,
        memoryUsage: `${Math.round((JSON.stringify(Array.from(apiResponseCache)).length) / 1024)} KB`
      },
      requests: requestStats,
      suggestions: {
        topApiCalls: apiCalls.sort((a, b) => b.ageHours - a.ageHours).slice(0, 5),
        recommendation: apiCalls.length > 10 ? 
          `Consider adding ${apiCalls.slice(0, 3).map(a => a.airport).join(', ')} to static database` :
          'Static database coverage is good'
      }
    },
    source: 'internal_stats'
  };
}

// ===== PREDICTION LOGGING =====
async function logPredictionData(requestData) {
  // Only log if Supabase is configured
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return;
  }
  
  try {
    const logEntry = {
      // Request metadata
      endpoint: requestData.endpoint,
      action: requestData.action || 'airport_info',
      airport_code: requestData.airport,
      duration_hours: requestData.duration,
      
      // Performance metrics
      response_time_ms: requestData.responseTime,
      success: requestData.success,
      data_source: requestData.source || 'unknown',
      
      // User/context data (expand based on what you collect)
      user_agent: requestData.userAgent, // Pass from frontend if needed
      timestamp: new Date().toISOString(),
      
      // Cache performance
      cache_hit: requestData.source?.includes('cache') || requestData.source?.includes('static'),
      
      // Error information (if any)
      error_message: requestData.error || null,
      error_type: requestData.error ? 'api_error' : null
    };
    
    // Log to Supabase
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/airport_predictions`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(logEntry)
    });
    
    if (!response.ok) {
      console.warn(`Prediction logging failed: ${response.status}`);
    }
    
  } catch (error) {
    // Silent fail - prediction logging should not break main functionality
    console.warn('Non-critical prediction logging error:', error.message);
  }
}

function updateRequestStats(requestData) {
  const today = new Date().toDateString();
  const key = `${today}_${requestData.airport || 'general'}`;
  
  if (!requestStatsCache.has(key)) {
    requestStatsCache.set(key, {
      date: today,
      airport: requestData.airport,
      totalRequests: 0,
      successfulRequests: 0,
      totalResponseTime: 0,
      sources: {},
      actions: {}
    });
  }
  
  const stats = requestStatsCache.get(key);
  stats.totalRequests++;
  if (requestData.success) stats.successfulRequests++;
  stats.totalResponseTime += requestData.responseTime || 0;
  
  // Track sources
  if (requestData.source) {
    stats.sources[requestData.source] = (stats.sources[requestData.source] || 0) + 1;
  }
  
  // Track actions
  if (requestData.action) {
    stats.actions[requestData.action] = (stats.actions[requestData.action] || 0) + 1;
  }
  
  // Limit cache size
  if (requestStatsCache.size > 100) {
    const firstKey = requestStatsCache.keys().next().value;
    requestStatsCache.delete(firstKey);
  }
}

function getRequestStats() {
  const statsArray = Array.from(requestStatsCache.values());
  const today = new Date().toDateString();
  
  const todayStats = statsArray.find(s => s.date === today) || {
    totalRequests: 0,
    successfulRequests: 0,
    avgResponseTime: 0
  };
  
  return {
    today: {
      requests: todayStats.totalRequests,
      successRate: todayStats.totalRequests > 0 ? 
        Math.round((todayStats.successfulRequests / todayStats.totalRequests) * 100) : 0,
      avgResponseTime: todayStats.totalRequests > 0 ?
        Math.round(todayStats.totalResponseTime / todayStats.totalRequests) : 0,
      topSources: Object.entries(todayStats.sources || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([source, count]) => ({ source, count }))
    },
    historical: {
      trackedDays: statsArray.length,
      totalRequests: statsArray.reduce((sum, s) => sum + s.totalRequests, 0)
    }
  };
}

// ===== AERODATABOX API INTEGRATION =====
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
    throw new Error(`AeroDataBox API error (${response.status}): ${errorText.substring(0, 100)}`);
  }
  
  const rawData = await response.json();
  
  // Transform to our format
  return {
    name: rawData.name || `${airportCode} Airport`,
    city: rawData.municipalityName || 'Unknown',
    country: rawData.countryName || 'Unknown',
    iata: rawData.iata || airportCode,
    icao: rawData.icao || '',
    timezone: rawData.timeZone || 'UTC',
    coordinates: rawData.location ? {
      lat: rawData.location.lat,
      lon: rawData.loc      data: {
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
