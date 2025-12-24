// Calculate carbon emissions using OpenSky aircraft data
export function calculateCarbonEmissions(flightData, passengers = 1) {
  if (!flightData || !flightData.icao24) {
    return getDefaultEstimation(passengers);
  }
  
  // Aircraft emission factors (kg CO2 per passenger-km)
  const emissionFactors = {
    'A320': 0.095,  // Airbus A320 family
    'B738': 0.094,  // Boeing 737-800
    'B739': 0.092,  // Boeing 737-900
    'A359': 0.085,  // Airbus A350-900
    'B788': 0.088,  // Boeing 787-8
    'B789': 0.087,  // Boeing 787-9
    'A388': 0.105,  // Airbus A380-800
    'E190': 0.098,  // Embraer E190
    'CRJ9': 0.102,  // Bombardier CRJ-900
    // Default based on aircraft category
    'small': 0.120,  // Small regional jets
    'medium': 0.100, // Medium narrow-body
    'large': 0.090,  // Large wide-body
  };
  
  // Get aircraft type from ICAO24 (simplified)
  const aircraftType = estimateAircraftType(flightData.icao24);
  const factor = emissionFactors[aircraftType] || emissionFactors.medium;
  
  // Calculate distance (using coordinates or route-based estimation)
  const distance = estimateFlightDistance(
    flightData.estDepartureAirport,
    flightData.estArrivalAirport
  );
  
  // Calculate emissions
  const kgPerPax = distance * factor;
  const totalKg = kgPerPax * passengers;
  
  return {
    kgPerPax: Math.round(kgPerPax),
    totalKg: Math.round(totalKg),
    distance: Math.round(distance),
    aircraftType,
    emissionFactor: factor,
    source: 'calculated',
    note: 'Based on ICAO emission factors and great-circle distance'
  };
}

function estimateAircraftType(icao24) {
  // Simple mapping - in reality, you'd query OpenSky's aircraft database
  const prefix = icao24.substring(0, 3);
  const typeMap = {
    'A0': 'A320', 'A1': 'A321', 'A2': 'A330',
    'B0': 'B738', 'B1': 'B739', 'B2': 'B788',
    'C0': 'CRJ9', 'E0': 'E190'
  };
  return typeMap[prefix] || 'medium';
}
