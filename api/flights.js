// flights.js
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

    // Format date for AviationStack API (YYYY-MM-DD)
    // Note: the frontend sends YYYY-MM-DD, but AviationStack expects YYYY-MM-DD.
    // So no need to reverse. Actually, the frontend sends YYYY-MM-DD and AviationStack expects the same.
    // The previous code was reversing, which is wrong.
    // Let me check: In the HTML, we are getting the date in YYYY-MM-DD format.
    // And AviationStack API expects YYYY-MM-DD.
    // So we don't need to change the format.

    const formattedDate = date; // No need to reverse

    // Check if the API key is set
    if (!process.env.AVIATIONSTACK_API_KEY) {
      throw new Error('AVIATIONSTACK_API_KEY is not set in environment variables');
    }

    // Call AviationStack API
    const url = `https://api.aviationstack.com/v1/flights?access_key=${process.env.AVIATIONSTACK_API_KEY}&dep_iata=${from}&arr_iata=${to}&flight_date=${formattedDate}&limit=5`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('AviationStack API response error:', errorText);
      throw new Error(`AviationStack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if the API returned an error
    if (data.error) {
      throw new Error(`AviationStack API error: ${data.error.info || 'Unknown error'}`);
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      data: data.data || []
    });
    
  } catch (error) {
    console.error('Flights API error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to fetch flight data'
    });
  }
}
