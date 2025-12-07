export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // This endpoint can accept POST or GET
  try {
    // Return static airport information
    // In production, you could fetch this from a database or external API
    const airportInfo = {
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
      ]
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
      message: 'Basic airport amenities information'
    });
  }
}
