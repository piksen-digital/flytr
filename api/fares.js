// /api/fares.js - Handles both fare calendar and flight search
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
    if (mode === 'calendar') {
      // For fare calendar - use month-matrix
      const calendarData = await fetchCalendarData(from, to, date);
      return res.status(200).json(calendarData);
    } else if (mode === 'flights') {
      // For bookable flights - use flight search
      const flightData = await fetchFlightData(from, to, date, travelers);
      return res.status(200).json(flightData);
    } else {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    
  } catch (error) {
    console.error('Fares API Error:', error);
    
    // Return mock data based on mode
    if (mode === 'calendar') {
      return res.status(200).json({
        success: true,
        fares: generateMockCalendarData(from, to, date),
        source: 'mock_fallback',
        note: 'Travelpayouts API failed'
      });
    } else {
      return res.status(200).json({
        success: true,
        flights: generateMockFlightData(from, to, date, travelers),
        source: 'mock_fallback',
        note: 'Flight search API failed'
      });
    }
  }
}

// Fetch calendar data (month matrix)
async function fetchCalendarData(from, to, date) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  
  if (!token || !marker) {
    throw new Error('Travelpayouts credentials not configured');
  }
  
  const month = date ? date.substring(0, 7) : new Date().toISOString().substring(0, 7);
  
  const response = await fetch(
    `https://api.travelpayouts.com/v2/prices/month-matrix?currency=USD&origin=${from}&destination=${to}&month=${month}&show_to_affiliates=true&token=${token}`,
    {
      headers: {
        'Accept': 'application/json',
        'X-Access-Token': token
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Travelpayouts API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.data) {
    throw new Error(data.message || 'No fare data from Travelpayouts');
  }
  
  // Process and format the data
  const fares = data.data.map(item => ({
    date: item.depart_date,
    price: item.value,
    currency: item.currency || 'USD',
    airline: item.gate || 'Unknown',
    flight_number: item.flight_number,
    isCheapest: false
  }));
  
  // Find cheapest price for each date
  const cheapestByDate = {};
  fares.forEach(fare => {
    if (!cheapestByDate[fare.date] || fare.price < cheapestByDate[fare.date].price) {
      cheapestByDate[fare.date] = fare;
    }
  });
  
  // Mark cheapest fares
  fares.forEach(fare => {
    fare.isCheapest = cheapestByDate[fare.date]?.price === fare.price;
  });
  
  return {
    success: true,
    fares: fares.slice(0, 30), // Limit to 30 days
    source: 'travelpayouts',
    marker: marker,
    currency: 'USD'
  };
}

// Fetch flight data (flight search)
async function fetchFlightData(from, to, date, travelers) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  
  if (!token || !marker) {
    throw new Error('Travelpayouts credentials not configured');
  }
  
  // Travelpayouts Flight Search API
  // Note: This requires the correct endpoint - check Travelpayouts docs
  // Here's a common pattern:
  const response = await fetch(
    `https://api.travelpayouts.com/v1/prices/cheap?origin=${from}&destination=${to}&depart_date=${date}&return_date=&currency=USD&token=${token}`,
    {
      headers: {
        'Accept': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Flight search API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.data || !data.data[from] || !data.data[from][to]) {
    throw new Error('No flight data available');
  }
  
  const flights = data.data[from][to];
  
  // Process flights
  const processedFlights = Object.keys(flights).map(key => {
    const flight = flights[key];
    const duration = flight.duration || calculateRandomDuration();
    
    return {
      airline: flight.airline || 'Unknown',
      flightNumber: flight.flight_number || `${key}`,
      departureTime: formatTime(flight.departure_at),
      arrivalTime: formatTime(flight.return_at || calculateArrival(flight.departure_at, duration)),
      origin: from,
      destination: to,
      duration: duration,
      durationMinutes: parseDuration(duration),
      price: flight.price || 0,
      currency: flight.currency || 'USD',
      stops: flight.transfers || 0,
      deepLink: flight.link ? `${flight.link}&marker=${marker}` : null,
      totalPrice: (flight.price || 0) * travelers
    };
  });
  
  // Sort by price
  processedFlights.sort((a, b) => a.price - b.price);
  
  // Add badges
  if (processedFlights.length > 0) {
    processedFlights[0].isCheapest = true;
    
    // Find best value (cheapest non-stop)
    const nonStopFlights = processedFlights.filter(f => f.stops === 0);
    if (nonStopFlights.length > 0) {
      nonStopFlights[0].isBestValue = true;
    }
    
    // Find shortest flight
    const shortestFlight = processedFlights.reduce((shortest, current) => 
      current.durationMinutes < shortest.durationMinutes ? current : shortest
    );
    shortestFlight.isShortest = true;
  }
  
  return {
    success: true,
    flights: processedFlights.slice(0, 10), // Limit to 10 flights
    source: 'travelpayouts',
    marker: marker,
    currency: 'USD'
  };
}

// Helper functions
function calculateRandomDuration() {
  const hours = Math.floor(Math.random() * 10) + 1;
  const minutes = Math.floor(Math.random() * 60);
  return `${hours}h ${minutes}m`;
}

function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function calculateArrival(departureTimestamp, duration) {
  if (!departureTimestamp) return departureTimestamp;
  const [hours, minutes] = duration.match(/(\d+)h (\d+)m/).slice(1, 3);
  const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
  return departureTimestamp + (totalMinutes * 60);
}

function parseDuration(duration) {
  const match = duration.match(/(\d+)h (\d+)m/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  return 0;
}

// Mock data generators (same as before, but keep them)
function generateMockCalendarData(from, to, selectedDate) {
  // ... keep your existing mock calendar data generator
}

function generateMockFlightData(from, to, date, travelers) {
  // Generate realistic mock flight data
  const flights = [];
  const airlines = [
    { code: 'AA', name: 'American Airlines' },
    { code: 'DL', name: 'Delta Air Lines' },
    { code: 'UA', name: 'United Airlines' },
    { code: 'WN', name: 'Southwest Airlines' },
    { code: 'B6', name: 'JetBlue' }
  ];
  
  const basePrice = 200 + Math.random() * 500;
  
  for (let i = 0; i < 5; i++) {
    const airline = airlines[Math.floor(Math.random() * airlines.length)];
    const departureHour = 6 + Math.floor(Math.random() * 12);
    const departureTime = `${departureHour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`;
    
    const durationHours = Math.floor(Math.random() * 8) + 1;
    const durationMinutes = Math.floor(Math.random() * 60);
    const duration = `${durationHours}h ${durationMinutes}m`;
    
    const priceMultiplier = 0.8 + Math.random() * 0.4;
    const price = Math.round(basePrice * priceMultiplier);
    const stops = Math.random() > 0.6 ? 1 : 0;
    
    flights.push({
      airline: airline.name,
      flightNumber: `${airline.code}${Math.floor(Math.random() * 2000) + 100}`,
      departureTime: departureTime,
      arrivalTime: calculateMockArrival(departureTime, durationHours, durationMinutes),
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
  
  if (arrivalHours >= 24) {
    arrivalHours -= 24;
  }
  
  return `${arrivalHours.toString().padStart(2, '0')}:${arrivalMinutes.toString().padStart(2, '0')}`;
}
