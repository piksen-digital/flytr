export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, to, date } = req.body;
    
    // In production, you would:
    // 1. Query a database of historical fares
    // 2. Use an external fare API
    // 3. Use cached pricing data
    
    // For now, generate mock fare data
    const fares = generateMockFares(date);
    
    return res.status(200).json({
      fares,
      route: `${from} to ${to}`,
      date,
      bestBookingWindow: '3-6 weeks before departure',
      tips: [
        'Tuesday and Wednesday are typically cheapest',
        'Avoid Friday and Sunday flights',
        'Book 6-8 weeks in advance for international flights',
        'Set price alerts for your route'
      ]
    });
    
  } catch (error) {
    console.error('Fares API error:', error);
    const mockFares = generateMockFares(req.body.date || new Date().toISOString().split('T')[0]);
    return res.status(200).json({
      fares: mockFares,
      message: 'Using estimated fare patterns'
    });
  }
}

function generateMockFares(selectedDate) {
  const selected = new Date(selectedDate);
  const fares = [];
  const basePrice = 400 + Math.random() * 200; // Base price $400-600
  
  // Generate fares for 30 days around selected date
  for (let i = -15; i <= 15; i++) {
    const date = new Date(selected);
    date.setDate(selected.getDate() + i);
    
    // Skip past dates
    if (date < new Date()) continue;
    
    const dayOfWeek = date.getDay();
    let priceMultiplier = 1.0;
    
    // Weekend flights are more expensive
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      priceMultiplier = 1.3 + Math.random() * 0.2;
    } else if (dayOfWeek === 5) { // Friday
      priceMultiplier = 1.2 + Math.random() * 0.1;
    } else if (dayOfWeek === 1 || dayOfWeek === 2) { // Mon-Tue
      priceMultiplier = 0.9 + Math.random() * 0.1;
    } else { // Wed-Thu
      priceMultiplier = 1.0 + Math.random() * 0.1;
    }
    
    // Flights closer to selected date are more expensive
    const daysDiff = Math.abs(i);
    if (daysDiff <= 3) {
      priceMultiplier *= 1.1;
    } else if (daysDiff <= 7) {
      priceMultiplier *= 1.05;
    }
    
    const price = Math.round(basePrice * priceMultiplier);
    
    fares.push({
      date: date.toISOString().split('T')[0],
      price,
      dayOfWeek,
      isCheapest: price <= basePrice * 0.95,
      isExpensive: price >= basePrice * 1.25
    });
  }
  
  return fares;
}
