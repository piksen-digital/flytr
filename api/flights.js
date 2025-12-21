export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { from, to, date } = req.body;
    
    try {
        // Use your actual AviationStack API key from Vercel env
        const apiKey = process.env.AVIATIONSTACK_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'API key not configured',
                message: 'Set AVIATIONSTACK_API_KEY in Vercel environment variables'
            });
        }
        
        // Construct AviationStack API URL
        const params = new URLSearchParams({
            access_key: apiKey,
            dep_iata: from,
            arr_iata: to,
            flight_date: date,
            limit: 1
        });
        
        const response = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ 
                error: data.error.message,
                info: 'Check your AviationStack subscription and API key'
            });
        }
        
        // Return the data
        res.status(200).json({
            success: true,
            data: data.data || []
        });
        
    } catch (error) {
        console.error('AviationStack API error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch flight data',
            details: error.message 
        });
    }
}
