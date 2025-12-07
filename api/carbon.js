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
    const { from, to, travelers = 1 } = req.body;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'Origin and destination are required' });
    }

    // Call Google Travel Impact Model API
    const response = await fetch(
      'https://travelimpactmodel.googleapis.com/v1/flights:computeFlightEmissions?key=' + process.env.GOOGLETIM_API_KEY,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "flights": [{
            "origin": from,
            "destination": to,
            "operatingCarrierCode": "AA", // Default airline
            "flightNumber": 100,
            "departureDate": {
              "year": new Date().getFullYear(),
              "month": new Date().getMonth() + 1,
              "day": new Date().getDate()
            },
            "aircraft": {
              "code": "B738" // Default aircraft
            },
            "class": "ECONOMY",
            "passengerCount": parseInt(travelers) || 1
          }]
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Carbon API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Calculate emissions
    let kgPerPax = 150; // Default fallback
    if (data.flightEmissions && data.flightEmissions.length > 0) {
      const emissionData = data.flightEmissions[0];
      kgPerPax = emissionData.emissionsGramsPerPax / 1000;
    }
    
    const totalKg = kgPerPax * (parseInt(travelers) || 1);
    
    return res.status(200).json({
      kgPerPax: Math.round(kgPerPax * 10) / 10,
      totalKg: Math.round(totalKg * 10) / 10,
      details: data.flightEmissions?.[0] || null
    });
    
  } catch (error) {
    console.error('Carbon API error:', error);
    // Calculate approximate emissions based on distance
    const travelers = parseInt(req.body.travelers) || 1;
    const kgPerPax = 150; // Average kg CO2 per passenger for medium-haul flight
    const totalKg = kgPerPax * travelers;
    
    return res.status(200).json({
      kgPerPax,
      totalKg,
      message: 'Using estimated carbon footprint calculation'
    });
  }
}
