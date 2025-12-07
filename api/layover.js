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
      return res.status(400).json({ error: 'Airport code is required' });
    }

    // For OpenStreetMap/Nominatim API, we need to respect rate limits (1 request per second)
    // We'll use a simplified approach with predefined data
    
    const layoverData = getLayoverSuggestions(airport);
    
    return res.status(200).json(layoverData);
    
  } catch (error) {
    console.error('Layover API error:', error);
    return res.status(200).json(getDefaultLayoverSuggestions());
  }
}

function getLayoverSuggestions(airportCode) {
  // Predefined layover suggestions for major airports
  const airportLayovers = {
    'JFK': {
      airport: 'JFK',
      city: 'New York',
      amenities: [
        'Free Wi-Fi (JFK Wi-Fi)',
        'Multiple airline lounges',
        'Minute Suites sleep pods',
        'Art galleries throughout terminals',
        'Live music performances'
      ],
      nearby: [
        'Rockaway Beach (30 min by A train)',
        'Jamaica Bay Wildlife Refuge (20 min)',
        'Queens Center Mall (15 min)',
        'TWA Hotel at JFK (connected via shuttle)'
      ],
      transitTimeToCity: '45-60 minutes to Manhattan',
      hotels: [
        'TWA Hotel (in airport)',
        'Holiday Inn JFK Airport (5 min shuttle)',
        'Courtyard by Marriott (10 min shuttle)'
      ]
    },
    'LHR': {
      airport: 'LHR',
      city: 'London',
      amenities: [
        'Free Wi-Fi (Heathrow Wi-Fi)',
        'Premium Plaza lounges',
        'Sleep pods in Terminal 5',
        'Spa and shower facilities',
        'Personal shopper service'
      ],
      nearby: [
        'Windsor Castle (25 min by taxi)',
        'Kew Gardens (30 min by Tube)',
        'Hounslow urban farm (15 min)',
        'Heathrow Airport Walks (within airport perimeter)'
      ],
      transitTimeToCity: '15-45 minutes to Central London',
      hotels: [
        'Sofitel London Heathrow (connected to Terminal 5)',
        'Hilton London Heathrow (Terminal 4)',
        'YOTELAIR London Heathrow (Terminal 4)'
      ]
    },
    // Add more airports as needed
  };
  
  return airportLayovers[airportCode] || getDefaultLayoverSuggestions();
}

function getDefaultLayoverSuggestions() {
  return {
    amenities: [
      'Free Wi-Fi throughout terminals',
      'Multiple dining options',
      'Lounges available for purchase',
      'Charging stations',
      'Quiet zones for resting'
    ],
    nearby: [
      'City center (typically 30-45 minutes by transit)',
      'Airport hotels with day rooms',
      'Local shopping areas',
      'Parks or green spaces'
    ],
    tips: [
      'Lounges available for $35-50/day with shower access',
      'Consider booking a day room for long layovers',
      'Check if airport offers free city tours',
      'Keep essentials in carry-on for easy access'
    ]
  };
}
