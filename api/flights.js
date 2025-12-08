export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, to, date, travelers } = req.body;
    
    if (!from || !to || !date) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Always return mock data for now - we'll fix AviationStack later
    const mockFlight = {
      flight: {
        iata: 'AA' + Math.floor(Math.random() * 1000),
        number: Math.floor(Math.random() * 1000)
      },
      airline: {
        name: ['American Airlines', 'Delta', 'United', 'Southwest'][Math.floor(Math.random() * 4)]
      },
      departure: {
        scheduled: '10:00',
        delay: Math.floor(Math.random() * 60),
        iata: from || 'JFK',
        airport: `${from || 'JFK'} Airport`
      },
      arrival: {
        scheduled: '12:00',
        iata: to || 'LAX',
        airport: `${to || 'LAX'} Airport`
      },
      flight_status: 'scheduled',
      estimated_price: {
        economy: 250 + Math.floor(Math.random() * 300),
        business: 600 + Math.floor(Math.random() * 800),
        currency: 'USD'
      }
    };

    // Return success response with mock data
    return res.status(200).json({
      success: true,
      data: [mockFlight]
    });
    
  } catch (error) {
    console.error('Flights API error:', error);
    return res.status(200).json({
      success: true,
      data: [{
        flight: { iata: 'AA123', number: 123 },
        airline: { name: 'American Airlines' },
        departure: { scheduled: '10:00', delay: 0, iata: 'JFK', airport: 'JFK Airport' },
        arrival: { scheduled: '12:00', iata: 'LAX', airport: 'LAX Airport' },
        flight_status: 'scheduled'
      }],
      message: 'Using demo flight data'
    });
  }
}
