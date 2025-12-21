// /api/fares.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const { from, to, date } = req.body;
        const aviationstackKey = process.env.AVIATIONSTACK_API_KEY;
        
        if (!aviationstackKey) {
            // Return mock data if API key not configured
            return res.status(200).json({
                fares: generateMockFareData(date),
                source: 'mock_data',
                message: 'Configure AVIATIONSTACK_API_KEY for real fare data'
            });
        }
        
        // AviationStack doesn't have fare data directly
        // For now, return mock data with a note
        return res.status(200).json({
            fares: generateMockFareData(date),
            source: 'mock_data',
            note: 'AviationStack free tier does not include historical fare data. Consider using Skyscanner API for real fare data.'
        });
        
    } catch (error) {
        console.error('Fares API error:', error);
        return res.status(200).json({
            fares: generateMockFareData(new Date().toISOString().split('T')[0]),
            source: 'mock_data_error',
            error: error.message
        });
    }
}

function generateMockFareData(selectedDate) {
    // Same mock data generation logic you already have
    // ... your existing mock data code ...
}
