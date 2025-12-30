// /api/fares.js - Updated with proper Travelpayouts V3 API handling
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { from, to, date, travelers = 1, mode = 'calendar' } = req.body;
  
  if (!from || !to) {
    return res.status(400).json({ error: 'Missing route' });
  }
  
  try {
    const token = process.env.TRAVELPAYOUTS_TOKEN;
    const marker = process.env.TRAVELPAYOUTS_MARKER || 'flytr';
    
    if (!token) {
      throw new Error('Travelpayouts token not configured');
    }
    
    if (mode === 'calendar') {
      const calendarData = await fetchCalendarData(from, to, date, token);
      return res.status(200).json(calendarData);
    } else {
      // For flights search
      const flightData = await fetchFlightData(from, to, date, travelers, token, marker);
      return res.status(200).json(flightData);
    }
    
  } catch (error) {
    console.error('Fares API Error:', error);
    
    // Return mock data as fallback
    if (mode === 'calendar') {
      return res.status(200).json({
        success: true,
        fares: generateMockCalendarData(from, to, date),
        source: 'mock_fallback',
        note: 'API failed, showing sample data'
      });
    } else {
      return res.status(200).json({
        success: true,
        flights: generateMockFlightData(from, to, date, travelers),
        source: 'mock_fallback',
        note: 'API failed, showing sample data'
      });
    }
  }
}

// Fetch calendar data using Travelpayouts V3 API
async function fetchCalendarData(from, to, date, token) {
  const month = date ? date.substring(0, 7) : new Date().toISOString().substring(0, 7);
  
  // Use the correct V3 API endpoint for calendar
  const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates_calendar?origin=${from}&destination=${to}&month=${month}&currency=usd&calendar_type=departure_date`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Access-Token': token
    }
  });
  
  if (!response.ok) {
    throw new Error(`Travelpayouts API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error('No fare data from Travelpayouts');
  }
  
  // Process calendar data
  const fares = Object.entries(data.data).map(([dateStr, price]) => ({
    date: dateStr,
    price: price,
    currency: 'USD',
    isCheapest: false
  }));
  
  // Sort by price and mark cheapest
  fares.sort((a, b) => a.price - b.price);
  if (fares.length > 0) {
    fares[0].isCheapest = true;
  }
  
  return {
    success: true,
    fares: fares.slice(0, 30),
    source: 'travelpayouts',
    currency: 'USD'
  };
}

// Fetch flight data using Travelpayouts V3 API
async function fetchFlightData(from, to, date, travelers, token, marker) {
  // Use the V3 API for flight search
  const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${from}&destination=${to}&departure_at=${date}&currency=usd&limit=10&sorting=price&direct=false&unique=false`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Access-Token': token
    }
  });
  
  if (!response.ok) {
    throw new Error(`Flight search API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.data || data.data.length === 0) {
    throw new Error('No flight data available for this route/date');
  }
  
  // Process flights
  const flights = data.data.map((flight, index) => {
    const duration = flight.duration || 0;
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    
    // Create deep link with marker
    const searchDate = date.replace(/-/g, '');
    const deepLink = `https://aviasales.com/search/${from}${searchDate}${to}${travelers}?marker=${marker}`;
    
    return {
      airline: getAirlineName(flight.airline) || 'Multiple Airlines',
      flightNumber: flight.flight_number || `${flight.airline}${Math.floor(Math.random() * 1000)}`,
      departureTime: formatTime(flight.departure_at),
      arrivalTime: flight.return_at ? formatTime(flight.return_at) : '--:--',
      origin: flight.origin || from,
      destination: flight.destination || to,
      duration: `${hours}h ${minutes}m`,
      durationMinutes: duration,
      price: flight.value,
      currency: 'USD',
      stops: flight.number_of_changes || 0,
      deepLink: deepLink,
      totalPrice: flight.value * travelers,
      isCheapest: index === 0,
      isBestValue: index === 0 && (flight.number_of_changes || 0) === 0,
      isShortest: false // Will be set after sorting
    };
  });
  
  // Sort by duration for shortest flight badge
  const flightsByDuration = [...flights].sort((a, b) => a.durationMinutes - b.durationMinutes);
  flights.forEach(flight => {
    if (flight === flightsByDuration[0]) {
      flight.isShortest = true;
    }
  });
  
  return {
    success: true,
    flights: flights,
    source: 'travelpayouts_v3',
    marker: marker,
    currency: 'USD'
  };
}

// Helper function to get airline name from IATA code
function getAirlineName(iataCode) {
  const airlines = {
    'AA': 'American Airlines',
    'DL': 'Delta Air Lines',
    'UA': 'United Airlines',
    'WN': 'Southwest Airlines',
    'B6': 'JetBlue',
    'AS': 'Alaska Airlines',
    'F9': 'Frontier Airlines',
    'NK': 'Spirit Airlines',
    'HA': 'Hawaiian Airlines',
    'BA': 'British Airways',
    'AF': 'Air France',
    'LH': 'Lufthansa',
    'TK': 'Turkish Airlines',
    'EK': 'Emirates',
    'QR': 'Qatar Airways',
    'SQ': 'Singapore Airlines',
    'CX': 'Cathay Pacific',
    'JL': 'Japan Airlines',
    'NH': 'ANA All Nippon Airways',
    'KE': 'Korean Air'
  };
  
  return airlines[iataCode] || iataCode;
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '--:--';
  }
}

// Mock data generators (fallback)
function generateMockCalendarData(from, to, selectedDate) {
  const fares = [];
  const today = new Date();
  const selected = new Date(selectedDate);
  
  for (let i = -15; i <= 15; i++) {
    const date = new Date(selected);
    date.setDate(selected.getDate() + i);
    
    if (date < today) continue;
    
    const basePrice = 300;
    let priceMultiplier = 1.0;
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) priceMultiplier = 1.3;
    else if (dayOfWeek === 5) priceMultiplier = 1.2;
    else if (dayOfWeek === 1 || dayOfWeek === 2) priceMultiplier = 0.9;
    
    const price = Math.round(basePrice * priceMultiplier * (0.9 + Math.random() * 0.2));
    
    fares.push({
      date: date.toISOString().split('T')[0],
      price: price,
      currency: 'USD',
      isCheapest: false
    });
  }
  
  if (fares.length > 0) {
    fares.sort((a, b) => a.price - b.price);
    fares[0].isCheapest = true;
  }
  
  return fares;
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
  
  const basePrice = 250 + Math.random() * 400;
  
  for (let i = 0; i < 5; i++) {
    const airline = airlines[Math.floor(Math.random() * airlines.length)];
    const departureHour = 6 + Math.floor(Math.random() * 12);
    const departureTime = `${departureHour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;
    
    const durationHours = Math.floor(Math.random() * 6) + 2;
    const durationMinutes = Math.floor(Math.random() * 60);
    const duration = `${durationHours}h ${durationMinutes}m`;
    
    const priceMultiplier = 0.8 + Math.random() * 0.4;
    const price = Math.round(basePrice * priceMultiplier);
    const stops = Math.random() > 0.6 ? 1 : 0;
    
    const arrivalHour = (departureHour + durationHours) % 24;
    const arrivalTime = `${arrivalHour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;
    
    flights.push({
      airline: airline.name,
      flightNumber: `${airline.code}${Math.floor(Math.random() * 2000) + 100}`,
      departureTime: departureTime,
      arrivalTime: arrivalTime,
      origin: from,
      destination: to,
      duration: duration,
      durationMinutes: durationHours * 60 + durationMinutes,
      price: price,
      currency: 'USD',
      stops: stops,
      deepLink: `https://www.example.com/book?flight=${from}-${to}-${date}&marker=flytr`,
      totalPrice: price * travelers,
      isCheapest: i === 0,
      isBestValue: i === 0 && stops === 0,
      isShortest: i === 2
    });
  }
  
  return flights;
}
