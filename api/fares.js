// /api/fares.js - Updated for Live Travelpayouts Feed
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { from, to, date, travelers = 1, mode = 'calendar' } = req.body;
  
  if (!from || !to) return res.status(400).json({ error: 'Missing route' });

  try {
    const token = process.env.TRAVELPAYOUTS_TOKEN;
    const marker = process.env.TRAVELPAYOUTS_MARKER;

    if (mode === 'calendar') {
      const data = await fetchCalendarData(from, to, date, token, marker);
      return res.status(200).json(data);
    } else {
      const data = await fetchFlightData(from, to, date, travelers, token, marker);
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('Fares API Error:', error);
    return res.status(500).json({ error: error.message, success: false });
  }
}

async function fetchCalendarData(from, to, date, token, marker) {
  const month = date ? date.substring(0, 7) : new Date().toISOString().substring(0, 7);
  const url = `https://api.travelpayouts.com/v2/prices/month-matrix?currency=USD&origin=${from}&destination=${to}&month=${month}&show_to_affiliates=true&token=${token}`;
  
  const response = await fetch(url, { headers: { 'X-Access-Token': token } });
  const json = await response.json();

  if (!json.success || !json.data) throw new Error('No calendar data');

  return {
    success: true,
    fares: json.data.map(f => ({
      date: f.depart_date,
      price: f.value,
      airline: f.gate,
      link: `https://www.jetradar.com/searches/new?origin_iata=${from}&destination_iata=${to}&departure_at=${f.depart_date}&marker=${marker}`
    })),
    source: 'travelpayouts'
  };
}

async function fetchFlightData(from, to, date, travelers) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  
  if (!token || !marker) {
    throw new Error('Travelpayouts credentials not configured');
  }

  // V3 API URL: more reliable for "live-ish" pricing
  const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${from}&destination=${to}&departure_at=${date}&unique=true&sorting=price&direct=false&currency=usd&limit=10&token=${token}`;

  const response = await fetch(url);
  const data = await response.json();
  
  // V3 returns data in a flat array called 'data'
  if (!data.success || !data.data || data.data.length === 0) {
    throw new Error('No flight data found for this route/date');
  }
  
  const processedFlights = data.data.map((flight, index) => {
    const durationTotal = flight.duration || 0;
    const hours = Math.floor(durationTotal / 60);
    const mins = durationTotal % 60;
    
    // Constructing the bookable link using the Standard Search URL
    // Format: aviasales.com/search/IATA_DEPART_DATE_IATA_TRAVELERS
    const searchDate = date.replace(/-/g, ''); // Converts 2023-12-01 to 20231201
    const deepLink = `https://www.aviasales.com/search/${from}${searchDate}${to}${travelers}?marker=${marker}`;

    return {
      airline: flight.airline, // Returns IATA code (e.g., 'AA', 'DL')
      flightNumber: flight.flight_number,
      departureTime: new Date(flight.departure_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      arrivalTime: flight.return_at ? new Date(flight.return_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Check details',
      origin: flight.origin,
      destination: flight.destination,
      duration: `${hours}h ${mins}m`,
      durationMinutes: durationTotal,
      price: flight.value,
      currency: 'USD',
      stops: flight.number_of_changes || 0,
      deepLink: deepLink,
      totalPrice: flight.value * travelers,
      isCheapest: index === 0 // Sorting by price ensures the first is cheapest
    };
  });

  return {
    success: true,
    flights: processedFlights,
    source: 'travelpayouts_v3',
    marker: marker
  };
}
