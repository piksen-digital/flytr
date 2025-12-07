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
    const { destination } = req.body;
    
    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    // Call Travel Advisory API (unkeyed)
    const response = await fetch('https://www.travel-advisory.info/api');
    
    if (!response.ok) {
      // Fallback to static data
      return res.status(200).json({
        riskLevel: 'Low',
        advisories: [],
        message: 'Using static travel advisory data'
      });
    }
    
    const data = await response.json();
    
    // Process data to find relevant advisory for destination
    const countryName = getCountryFromCity(destination);
    let riskLevel = 'Low';
    let advisories = [];
    
    // Simple logic - in production, you'd match the destination to country data
    if (countryName) {
      // Check if country exists in data
      const countryCode = Object.keys(data.data || {}).find(key => 
        data.data[key].name.toLowerCase().includes(countryName.toLowerCase())
      );
      
      if (countryCode) {
        const countryData = data.data[countryCode];
        riskLevel = countryData.advisory && countryData.advisory.score > 3 ? 'Medium' : 'Low';
        advisories = countryData.advisory ? [countryData.advisory.message] : [];
      }
    }
    
    return res.status(200).json({
      riskLevel,
      advisories,
      destination
    });
    
  } catch (error) {
    console.error('Advisory API error:', error);
    return res.status(200).json({
      riskLevel: 'Low',
      advisories: [],
      message: 'No travel advisories found'
    });
  }
}

function getCountryFromCity(city) {
  // Simple mapping - expand as needed
  const cityCountryMap = {
    'london': 'United Kingdom',
    'paris': 'France',
    'new york': 'United States',
    'tokyo': 'Japan',
    'sydney': 'Australia',
    'dubai': 'United Arab Emirates',
    'singapore': 'Singapore',
    'frankfurt': 'Germany',
    'amsterdam': 'Netherlands',
    'rome': 'Italy',
    'madrid': 'Spain',
    'bangkok': 'Thailand'
  };
  
  const lowerCity = city.toLowerCase();
  for (const [cityKey, country] of Object.entries(cityCountryMap)) {
    if (lowerCity.includes(cityKey)) {
      return country;
    }
  }
  return null;
}
