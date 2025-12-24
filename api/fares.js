// /api/fares.js - Fare data with Travelpayouts primary and mock fallback

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { from, to, date } = req.body;
  
  if (!from || !to || !date) {
    return res.status(400).json({ error: 'Missing route or date' });
  }
  
  try {
    // Try Travelpayouts first
    const travelpayoutsData = await fetchTravelpayoutsFares(from, to, date);
    if (travelpayoutsData.success) {
      return res.status(200).json(travelpayoutsData);
    }
    
    // Fallback to mock data
    const mockData = generateMockFareData(from, to, date);
    return res.status(200).json({
      success: true,
      fares: mockData,
      source: 'mock_fallback',
      note: 'Travelpayouts API not configured or failed'
    });
    
  } catch (error) {
    console.error('Fares API Error:', error);
    const mockData = generateMockFareData(from, to, date);
    return res.status(200).json({
      success: true,
      fares: mockData,
      source: 'mock_error',
      error: error.message
    });
  }
}

// Travelpayouts API integration
async function fetchTravelpayoutsFares(from, to, date) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  
  if (!token || !marker) {
    throw new Error('Travelpayouts credentials not configured');
  }
  
  // Extract month for monthly matrix
  const month = date.substring(0, 7); // YYYY-MM format
  
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
    isCheapest: false // Will calculate below
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

// Mock data generator (fallback)
function generateMockFareData(from, to, selectedDate) {
  const fares = [];
  const basePrice = 300 + Math.random() * 700;
  const selected = new Date(selectedDate);
  
  for (let i = -15; i <= 15; i++) {
    const currentDate = new Date(selected);
    currentDate.setDate(currentDate.getDate() + i);
    
    if (currentDate < new Date()) continue; // Skip past dates
    
    const dayOfWeek = currentDate.getDay();
    let priceMultiplier = 1.0;
    
    // Cheaper on weekdays
    if (dayOfWeek >= 1 && dayOfWeek <= 3) priceMultiplier = 0.7;
    if (dayOfWeek === 0 || dayOfWeek === 6) priceMultiplier = 1.4;
    
    // Add randomness
    priceMultiplier *= (0.9 + Math.random() * 0.2);
    
    const price = Math.round(basePrice * priceMultiplier);
    
    fares.push({
      date: currentDate.toISOString().split('T')[0],
      price: price,
      currency: 'USD',
      airline: ['AA', 'DL', 'UA', 'WN', 'B6'][Math.floor(Math.random() * 5)],
      isCheapest: false
    });
  }
  
  // Mark cheapest
  if (fares.length > 0) {
    const minPrice = Math.min(...fares.map(f => f.price));
    fares.forEach(f => { f.isCheapest = f.price === minPrice; });
  }
  
  return fares;
}
