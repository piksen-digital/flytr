// /api/fares.js - Handles both fare calendar and flight search (serverless)
// Notes:
// - Uses Travelpayouts v2 (month-matrix) for calendar and aviasales/v3 prices_for_dates for flight search.
// - Adds a fetch timeout, robust response parsing, consistent response schema, and mock fallbacks.
// - Requires TRAVELPAYOUTS_TOKEN and TRAVELPAYOUTS_MARKER set in environment variables.

export default async function handler(req, res) {
  // CORS (allow all for now; restrict in production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { from, to, date, travelers = 1, mode = 'calendar' } = req.body || {};

  if (!from || !to) {
    return res.status(400).json({ success: false, error: 'Missing route (from/to required)' });
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;

  if (!token || !marker) {
    // Graceful response so front-end can fall back to mock data
    console.error('Travelpayouts credentials not configured');
    const fallback = mode === 'flights'
      ? { success: true, flights: generateMockFlightData(from, to, date, travelers), source: 'mock_fallback' }
      : { success: true, fares: generateMockCalendarData(from, to, date), source: 'mock_fallback' };
    return res.status(200).json(fallback);
  }

  try {
    if (mode === 'calendar') {
      const calendarData = await fetchCalendarData(from, to, date, token, marker);
      return res.status(200).json(calendarData);
    } else if (mode === 'flights') {
      const flightData = await fetchFlightData(from, to, date, travelers, token, marker);
      return res.status(200).json(flightData);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid mode' });
    }
  } catch (error) {
    console.error('Fares API Error:', error);
    // Return mock data as a safe fallback with success:true to keep front-end stable
    if (mode === 'calendar') {
      return res.status(200).json({
        success: true,
        fares: generateMockCalendarData(from, to, date),
        source: 'mock_fallback',
        note: error.message
      });
    } else {
      return res.status(200).json({
        success: true,
        flights: generateMockFlightData(from, to, date, travelers),
        source: 'mock_fallback',
        note: error.message
      });
    }
  }
}

// Helper: fetch with timeout using AbortController
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Fetch calendar data (month-matrix)
async function fetchCalendarData(from, to, date, token, marker) {
  const month = date ? date.substring(0, 7) : new Date().toISOString().substring(0, 7);
  const url = `https://api.travelpayouts.com/v2/prices/month-matrix?currency=USD&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&month=${month}&show_to_affiliates=true&token=${encodeURIComponent(token)}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json',
      'X-Access-Token': token
    }
  }, 8000);

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    throw new Error(`Travelpayouts month-matrix error: ${response.status} ${t}`);
  }

  const json = await response.json().catch(() => null);
  if (!json || (!json.success && !json.data)) {
    throw new Error('No calendar data from Travelpayouts');
  }

  // Normalize data.data which may be an array or object
  let fares = [];
  if (Array.isArray(json.data)) {
    fares = json.data.map(item => ({
      date: item.depart_date || item.date,
      price: Number(item.value || item.price || 0),
      currency: item.currency || 'USD',
      airline: item.gate || item.airline || 'Unknown',
      flight_number: item.flight_number || null,
      isCheapest: false
    }));
  } else if (typeof json.data === 'object') {
    // data could be keyed by dates or by routes; try to extract best values
    for (const key of Object.keys(json.data)) {
      const item = json.data[key];
      if (item && item.depart_date && (item.value || item.price)) {
        fares.push({
          date: item.depart_date,
          price: Number(item.value || item.price || 0),
          currency: item.currency || 'USD',
          airline: item.gate || item.airline || 'Unknown',
          flight_number: item.flight_number || null,
          isCheapest: false
        });
      } else if (Array.isArray(item)) {
        item.forEach(i => {
          fares.push({
            date: i.depart_date || i.date,
            price: Number(i.value || i.price || 0),
            currency: i.currency || 'USD',
            airline: i.gate || i.airline || 'Unknown',
            flight_number: i.flight_number || null,
            isCheapest: false
          });
        });
      }
    }
  }

  // Mark cheapest per date
  const cheapestByDate = {};
  fares.forEach(f => {
    if (!cheapestByDate[f.date] || f.price < cheapestByDate[f.date].price) cheapestByDate[f.date] = f;
  });
  fares.forEach(f => f.isCheapest = cheapestByDate[f.date] && cheapestByDate[f.date].price === f.price);

  return {
    success: true,
    fares: fares.slice(0, 60),
    source: 'travelpayouts',
    marker,
    currency: 'USD'
  };
}

// Fetch flight data (v3 prices_for_dates)
async function fetchFlightData(from, to, date, travelers, token, marker) {
  // V3 endpoint (aviasales)
  const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&departure_at=${encodeURIComponent(date)}&unique=true&sorting=price&direct=false&currency=usd&limit=10&token=${encodeURIComponent(token)}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json'
    }
  }, 9000);

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    throw new Error(`Travelpayouts v3 prices error: ${response.status} ${t}`);
  }

  const json = await response.json().catch(() => null);
  if (!json || !json.data || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error('No flight data found for this route/date');
  }

  const processedFlights = json.data.map((f, index) => {
    const durationTotal = Number(f.duration || f.duration_total || 0);
    const hours = Math.floor(durationTotal / 60);
    const mins = durationTotal % 60;

    const searchDate = (date || '').replace(/-/g, '');
    const deepLink = f.link || `https://www.aviasales.com/search/${from}${searchDate}${to}${travelers}?marker=${encodeURIComponent(marker)}`;

    return {
      airline: f.airline || f.airline_iata || 'N/A',
      flightNumber: f.flight_number || null,
      departureTime: safeFormatTime(f.departure_at),
      arrivalTime: safeFormatTime(f.return_at) || (f.arrival_at ? safeFormatTime(f.arrival_at) : 'Check details'),
      origin: f.origin || from,
      destination: f.destination || to,
      duration: `${hours}h ${mins}m`,
      durationMinutes: durationTotal,
      price: Number(f.value || f.price || 0),
      currency: 'USD',
      stops: Number(f.transfers || f.number_of_changes || 0),
      deepLink,
      totalPrice: (Number(f.value || f.price || 0)) * Number(travelers || 1),
      isCheapest: false,
      isBestValue: false,
      isShortest: false
    };
  });

  // Sort by price and tag cheapest / best value / shortest
  processedFlights.sort((a, b) => a.price - b.price);
  if (processedFlights.length > 0) {
    processedFlights[0].isCheapest = true;
    const nonStop = processedFlights.find(f => f.stops === 0);
    if (nonStop) nonStop.isBestValue = true;
    const shortest = processedFlights.reduce((s, c) => (c.durationMinutes < (s.durationMinutes || 1e9) ? c : s), processedFlights[0]);
    if (shortest) shortest.isShortest = true;
  }

  return {
    success: true,
    flights: processedFlights.slice(0, 10),
    source: 'travelpayouts_v3',
    marker,
    currency: 'USD'
  };
}

// Safe time formatter (handles epoch seconds, ms, or ISO strings)
function safeFormatTime(ts) {
  if (!ts) return '--:--';
  // If numeric string or number assume seconds or ms
  if (typeof ts === 'number') {
    // if ts looks like seconds (10-digit), convert
    if (String(ts).length === 10) return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof ts === 'string') {
    // try to parse ISO or numeric
    if (/^\d{10}$/.test(ts)) return new Date(Number(ts) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (/^\d{13}$/.test(ts)) return new Date(Number(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return '--:--';
}

/* -------------------------
   Mock Data Generators
   ------------------------- */

function generateMockCalendarData(from, to, selectedDate) {
  const selected = new Date(selectedDate || new Date());
  const today = new Date();
  const fareData = [];
  const basePrice = 450;

  for (let i = -15; i <= 15; i++) {
    const d = new Date(selected);
    d.setDate(selected.getDate() + i);
    if (d < today) continue;

    let priceMultiplier = 1;
    const wd = d.getDay();
    if (wd === 0 || wd === 6) priceMultiplier = 1.25;
    else if (wd === 5) priceMultiplier = 1.15;
    else if (wd === 2 || wd === 3) priceMultiplier = 0.9;

    const daysDiff = Math.abs(i);
    if (daysDiff <= 3) priceMultiplier *= 1.08;
    else if (daysDiff <= 7) priceMultiplier *= 1.03;

    priceMultiplier *= (0.96 + Math.random() * 0.08);
    const price = Math.round(basePrice * priceMultiplier);

    fareData.push({
      date: d.toISOString().split('T')[0],
      price,
      dayOfWeek: wd,
      isSelected: i === 0,
      isCheapest: price <= basePrice * 0.9,
      isExpensive: price >= basePrice * 1.2
    });
  }
  return fareData;
}

function generateMockFlightData(from, to, date, travelers) {
  const flights = [];
  const airlines = [
    { code: 'AA', name: 'American Airlines' },
    { code: 'DL', name: 'Delta Air Lines' },
    { code: 'UA', name: 'United Airlines' },
    { code: 'WN', name: 'Southwest Airlines' },
    { code: 'B6', name: 'JetBlue' }
  ];

  const basePrice = 150 + Math.random() * 400;

  for (let i = 0; i < 5; i++) {
    const airline = airlines[Math.floor(Math.random() * airlines.length)];
    const departureHour = 6 + Math.floor(Math.random() * 12);
    const departureMinute = Math.floor(Math.random() * 60);
    const departureTime = `${String(departureHour).padStart(2, '0')}:${String(departureMinute).padStart(2, '0')}`;

    const durationHours = Math.floor(Math.random() * 8) + 1;
    const durationMinutes = Math.floor(Math.random() * 60);
    const duration = `${durationHours}h ${durationMinutes}m`;

    const priceMultiplier = 0.85 + Math.random() * 0.45;
    const price = Math.round(basePrice * priceMultiplier);
    const stops = Math.random() > 0.6 ? 1 : 0;

    flights.push({
      airline: airline.code,
      flightNumber: `${airline.code}${Math.floor(Math.random() * 900) + 100}`,
      departureTime,
      arrivalTime: calculateMockArrival(departureTime, durationHours, durationMinutes),
      origin: from,
      destination: to,
      duration,
      durationMinutes: durationHours * 60 + durationMinutes,
      price,
      currency: 'USD',
      stops,
      deepLink: `https://www.aviasales.com/search/${from}${(date || '').replace(/-/g, '')}${to}${travelers}?marker=flytr`,
      totalPrice: price * travelers,
      isCheapest: i === 0,
      isBestValue: i === 0 && stops === 0,
      isShortest: i === 0
    });
  }

  return flights;
}

function calculateMockArrival(departureTime, hours, minutes) {
  const [h, m] = departureTime.split(':').map(Number);
  let arrivalHours = h + hours;
  let arrivalMinutes = m + minutes;

  if (arrivalMinutes >= 60) {
    arrivalHours += Math.floor(arrivalMinutes / 60);
    arrivalMinutes = arrivalMinutes % 60;
  }

  if (arrivalHours >= 24) arrivalHours -= 24;

  return `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMinutes).padStart(2, '0')}`;
}