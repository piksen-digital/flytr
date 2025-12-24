// Main flights endpoint - uses the flight router
import { getFlightData } from './flight-router';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { from, to, date, travelers = 1 } = req.body;
  
  if (!from || !to || !date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    const result = await getFlightData(from, to, date, travelers);
    
    res.status(200).json({
      success: true,
      data: result.flight,
      carbon: result.carbon,
      source: result.source,
      alternatives: result.alternatives
    });
    
  } catch (error) {
    console.error('Flight API Error:', error);
    res.status(200).json({
      success: true,
      data: generateMockFlight(from, to, date),
      carbon: getDefaultEstimation(travelers),
      source: 'mock_error',
      note: 'All flight APIs failed, using realistic mock data'
    });
  }
}
