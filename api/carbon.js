export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const { flight, travelers = 1 } = req.body;
        
        if (!flight || !flight.departure || !flight.arrival) {
            throw new Error('Invalid flight data');
        }
        
        // Get airport coordinates from AviationStack
        const aviationstackKey = process.env.AVIATIONSTACK_API_KEY;
        
        let distance = 0;
        let emissionFactor = 0.115; // kg CO2 per passenger km (average)
        
        if (aviationstackKey) {
            // Try to get airport data for distance calculation
            const depIata = flight.departure.iata || 'JFK';
            const arrIata = flight.arrival.iata || 'LAX';
            
            try {
                // Get departure airport
                const depResponse = await fetch(
                    `http://api.aviationstack.com/v1/airports?access_key=${aviationstackKey}&iata_code=${depIata}`
                );
                const depData = await depResponse.json();
                
                // Get arrival airport
                const arrResponse = await fetch(
                    `http://api.aviationstack.com/v1/airports?access_key=${aviationstackKey}&iata_code=${arrIata}`
                );
                const arrData = await arrResponse.json();
                
                if (depData.data && depData.data[0] && arrData.data && arrData.data[0]) {
                    const depAirport = depData.data[0];
                    const arrAirport = arrData.data[0];
                    
                    // Calculate distance using Haversine formula
                    distance = calculateDistance(
                        depAirport.latitude,
                        depAirport.longitude,
                        arrAirport.latitude,
                        arrAirport.longitude
                    );
                    
                    // Adjust emission factor based on distance
                    if (distance < 500) emissionFactor = 0.135; // Short haul
                    else if (distance < 1500) emissionFactor = 0.115; // Medium haul
                    else emissionFactor = 0.095; // Long haul
                }
            } catch (apiError) {
                console.error('Airport API error:', apiError);
            }
        }
        
        // If no distance from API, estimate from flight time
        if (distance === 0 && flight.departure.scheduled && flight.arrival.scheduled) {
            const depTime = new Date(flight.departure.scheduled);
            const arrTime = new Date(flight.arrival.scheduled);
            const flightHours = Math.abs(arrTime - depTime) / (1000 * 60 * 60);
            distance = flightHours * 850; // Average speed 850 km/h
        }
        
        // If still no distance, use route-based estimation
        if (distance === 0) {
            const routeEstimation = {
                'JFK-LHR': 5548,
                'LAX-LHR': 8775,
                'JFK-LAX': 3975,
                'ORD-LHR': 6340,
                'DFW-LHR': 7550,
                'SFO-LHR': 8570,
                'MIA-LHR': 7120,
                'ATL-LHR': 6820,
                'SEA-LHR': 7720,
                'BOS-LHR': 5270
            };
            
            const routeKey = `${flight.departure.iata || 'XXX'}-${flight.arrival.iata || 'XXX'}`;
            distance = routeEstimation[routeKey] || 1500; // Default 1500 km
        }
        
        // Calculate emissions
        const kgPerPax = distance * emissionFactor;
        const totalKg = kgPerPax * travelers;
        
        res.status(200).json({
            kgPerPax: Math.round(kgPerPax),
            totalKg: Math.round(totalKg),
            distance: Math.round(distance),
            emissionFactor: emissionFactor,
            source: distance > 0 ? 'calculated' : 'estimated',
            note: 'Based on ICAO emission factors and great-circle distance'
        });
        
    } catch (error) {
        console.error('Carbon API error:', error);
        // Fallback calculation
        const travelers = req.body.travelers || 1;
        res.status(200).json({
            kgPerPax: 150,
            totalKg: 150 * travelers,
            distance: 1200,
            emissionFactor: 0.125,
            source: 'fallback',
            error: error.message
        });
    }
}

// Haversine formula to calculate distance between coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
