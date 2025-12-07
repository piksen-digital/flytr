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
    const formattedDate = date.split('-').reverse().join('-');
    
    // Call AviationStack API
    const response = await fetch(
      `https://api.aviationstack.com/v1/flights?access_key=${process.env.AVIATIONSTACK_API_KEY}&dep_iata=${from}&arr_iata=${to}&flight_date=${formattedDate}&limit=5`
    );
    
    if (!response.ok) {
      throw new Error(`AviationStack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
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
