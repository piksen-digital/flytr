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
    const { base = 'USD', target = 'EUR' } = req.body;
    
    // Call CurrencyFreaks API
    const response = await fetch(
      `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${process.env.CURRENCYFREAKS_API_KEY}&symbols=${target}`
    );
    
    if (!response.ok) {
      throw new Error(`Currency API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return res.status(200).json({
      base,
      target,
      rate: data.rates[target] || 0.85,
      date: data.date
    });
    
  } catch (error) {
    console.error('Currency API error:', error);
    // Return mock exchange rate
    return res.status(200).json({
      base: req.body.base || 'USD',
      target: req.body.target || 'EUR',
      rate: 0.85 + (Math.random() * 0.1), // Random rate between 0.85-0.95
      date: new Date().toISOString().split('T')[0],
      message: 'Using estimated exchange rate'
    });
  }
}
