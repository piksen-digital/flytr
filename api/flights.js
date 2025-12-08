// api/flights.js - UPDATED VERSION
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

    // Check if API key is configured
    if (!process.env.AVIATIONSTACK_API_KEY || process.env.AVIATIONSTACK_API_KEY === 'YOUR_AVIATIONSTACK_API_KEY_HERE') {
      // Return mock flight data if API key not configured
      return res.status(200).json({
        success: true,
        data: [{
          flight: {
            iata: 'AA' + Math.floor(Math.random() * 1000),
            number: Math.floor(Math.random() * 1000)
          },
          airline: {
            name: 'American Airlines'
          },
          departure: {
            scheduled: '10:00',
            delay: Math.floor(Math.random() * 60),
            iata: from,
            airport: `${from} Airport`
          },
          arrival: {
            scheduled: '12:00',
            iata: to,
            airport: `${to} Airport`
          },
          flight_status: 'scheduled'
        }]
      });
    }

    // Format date for AviationStack API
    const formattedDate = date; // Already in YYYY-MM-DD format
    
    // Call AviationStack API
    const url = `https://api.aviationstack.com/v1/flights?access_key=${process.env.AVIATIONSTACK_API_KEY}&dep_iata=${from}&arr_iata=${to}&flight_date=${formattedDate}&limit=5`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`AviationStack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`AviationStack API error: ${data.error.info}`);
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      data: data.data || []
    });
    
  } catch (error) {
    console.error('Flights API error:', error);

    // Add to the flight data before returning
if (data.data && data.data.length > 0) {
  data.data = data.data.map(flight => ({
    ...flight,
    estimated_price: {
      economy: 150 + Math.floor(Math.random() * 300),
      business: 500 + Math.floor(Math.random() * 800),
      currency: 'USD'
    },
    booking_link: `https://www.example.com/search?flight=${flight.flight.iata}`
  }));
}
    
    // Return mock data as fallback
    return res.status(200).json({
      success: true,
      data: [{
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
          iata: req.body?.from || 'JFK',
          airport: `${req.body?.from || 'JFK'} Airport`
        },
        arrival: {
          scheduled: '12:00',
          iata: req.body?.to || 'LAX',
          airport: `${req.body?.to || 'LAX'} Airport`
        },
        flight_status: 'scheduled'
      }],
      message: 'Using demo flight data'
    });
  }
}
