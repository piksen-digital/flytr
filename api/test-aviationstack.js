export default async function handler(req, res) {
    const apiKey = process.env.AVIATIONSTACK_API_KEY;
    
    if (!apiKey) {
        return res.status(200).json({
            error: 'API key not configured',
            env: 'AVIATIONSTACK_API_KEY missing'
        });
    }
    
    try {
        // Test with JFK to LAX for today
        const testDate = new Date().toISOString().split('T')[0];
        const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=JFK&arr_iata=LAX&flight_date=${testDate}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        return res.status(200).json({
            success: true,
            url: url.replace(apiKey, 'HIDDEN'),
            status: response.status,
            data_length: data.data ? data.data.length : 0,
            data_sample: data.data ? data.data.slice(0, 1) : null,
            error: data.error || null,
            pagination: data.pagination || null
        });
        
    } catch (error) {
        return res.status(200).json({
            error: error.message,
            stack: error.stack
        });
    }
}
