// Travelpayouts (Aviasales) API for fare data
export default async function handler(req, res) {
  const { from, to, date } = req.body;
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  
  if (!token || !marker) {
    return res.status(200).json({
      fares: generateMockFareData(date),
      source: 'mock_data',
      note: 'Travelpayouts credentials not configured'
    });
  }
  
  try {
    // Get cheapest prices for the month
    const response = await fetch(
      `https://api.travelpayouts.com/v2/prices/month-matrix?currency=usd&origin=${from}&destination=${to}&show_to_affiliates=true&token=${token}`,
      {
        headers: {
          'Accept-Encoding': 'gzip, deflate',
          'Accept': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success && data.data) {
      // Map to our format
      const fares = data.data.map(item => ({
        date: item.depart_date,
        price: item.value,
        currency: item.currency,
        airline: item.gate,
        isCheapest: item.value === Math.min(...data.data.map(d => d.value))
      }));
      
      res.status(200).json({
        fares,
        source: 'travelpayouts',
        marker // For affiliate links
      });
    } else {
      throw new Error(data.message || 'No fare data');
    }
    
  } catch (error) {
    console.error('Travelpayouts API Error:', error);
    // Fallback to mock data
    res.status(200).json({
      fares: generateMockFareData(date),
      source: 'mock_data_fallback',
      error: error.message
    });
  }
}

function generateMockFareData(date) {
  // Your existing mock fare generator
}
