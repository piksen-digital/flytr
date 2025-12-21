// /api/airport.js
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
    const { airport } = req.body;
    
    if (!airport) {
      return res.status(400).json({ error: 'Airport code required' });
    }

    // Try to get real airport data from AviationStack
    const aviationstackKey = process.env.AVIATIONSTACK_API_KEY;
    
    if (aviationstackKey) {
      // Fetch airports data
      const response = await fetch(
        `http://api.aviationstack.com/v1/airports?access_key=${aviationstackKey}&search=${airport}&limit=1`
      );
      
      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        const airportData = data.data[0];
        
        return res.status(200).json({
          name: airportData.airport_name,
          city: airportData.city_name,
          country: airportData.country_name,
          iata: airportData.iata_code,
          timezone: airportData.timezone,
          amenities: [
            "Free Wi-Fi throughout terminals",
            "Multiple dining options post-security",
            `Terminal: ${airportData.terminal || 'Multiple terminals available'}`,
            "Lounges available for premium passengers",
            "Charging stations near all gates",
            "Rest zones with comfortable seating",
            "Business centers with printing facilities",
            "Children's play areas",
            "Medical facilities and pharmacies",
            "Currency exchange and ATMs"
          ],
          services: [
            "Baggage wrapping services",
            "Luggage storage and lockers",
            "Meet & greet services",
            "Airport hotels for long layovers",
            "Transportation to city center"
          ],
          source: 'AviationStack API'
        });
      }
    }
    
    // Fallback to static data if AviationStack fails or no key
    const airportInfo = {
      iata: airport,
      amenities: [
        "Free Wi-Fi throughout terminals",
        "Multiple dining options post-security",
        "Lounges available for premium passengers",
        "Charging stations near all gates",
        "Rest zones with comfortable seating",
        "Business centers with printing facilities",
        "Children's play areas",
        "Medical facilities and pharmacies",
        "Currency exchange and ATMs",
        "Shopping outlets and duty-free stores"
      ],
      tips: [
        "Arrive at least 2 hours before domestic flights, 3 hours for international",
        "Download the airport app for real-time updates",
        "Pack essentials in carry-on in case of baggage delay",
        "Keep liquids in containers under 100ml for carry-on",
        "Have boarding pass and ID ready at security"
      ],
      services: [
        "Baggage wrapping services",
        "Luggage storage and lockers",
        "Meet & greet services",
        "Airport hotels for long layovers",
        "Transportation to city center"
      ],
      source: 'Static data (configure AviationStack API for real data)'
    };
    
    return res.status(200).json(airportInfo);
    
  } catch (error) {
    console.error('Airport API error:', error);
    return res.status(200).json({
      amenities: [
        "Free Wi-Fi throughout terminals",
        "Multiple dining options post-security",
        "Lounges available for premium passengers",
        "Charging stations near all gates"
      ],
      message: 'Using static airport data',
      error: error.message
    });
  }
}
