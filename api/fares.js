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

async function fetchFlightData(from, to, date, travelers, token, marker) {
  // Using the "Latest Prices" API for faster live responses without a complex search-poll flow
  const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${from}&destination=${to}&departure_at=${date}&unique=true&sorting=price&direct=false&currency=usd&limit=10&token=${token}`;
  
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success || !json.data || json.data.length === 0) {
    throw new Error('No live flights found for this date');
  }

  const processedFlights = json.data.map(f => ({
    airline: f.airline,
    flightNumber: f.flight_number,
    departureTime: new Date(f.departure_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    arrivalTime: 'Flexible', // V3 basic prices don't always include arrival time
    origin: f.origin,
    destination: f.destination,
    duration: `${Math.floor(f.duration / 60)}h ${f.duration % 60}m`,
    durationMinutes: f.duration,
    price: f.value,
    currency: 'USD',
    stops: f.transfers,
    // Construct the direct booking deep link
    deepLink: `https://aviasales.com/search/${from}${date.replace(/-/g, '')}${to}${travelers}?marker=${marker}`,
    totalPrice: f.value * travelers
  }));

  return { success: true, flights: processedFlights, source: 'travelpayouts' };
}
