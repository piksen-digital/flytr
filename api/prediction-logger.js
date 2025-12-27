// /api/prediction-logger.js
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
        const {
            from,
            to,
            date,
            prediction,
            confidence,
            dataSource,
            responseTime,
            cacheHit,
            userId,
            sessionId
        } = req.body;

        // Sample rate: log only 10% of requests to avoid overwhelming the database
        const sampleRate = 0.1;
        const shouldLog = Math.random() < sampleRate;

        if (shouldLog) {
            const timestamp = new Date().toISOString();
            
            // Log to console for now (in production, you'd log to Supabase)
            console.log('Prediction Log Entry:', {
                timestamp,
                from,
                to,
                date,
                prediction: prediction || 'N/A',
                confidence: confidence || 0,
                dataSource: dataSource || 'unknown',
                responseTime: responseTime || 0,
                cacheHit: cacheHit || false,
                userId: userId || 'anonymous',
                sessionId: sessionId || 'unknown'
            });

            // Here you would log to Supabase
            // const supabaseUrl = process.env.SUPABASE_URL;
            // const supabaseKey = process.env.SUPABASE_ANON_KEY;
            // const { createClient } = require('@supabase/supabase-js');
            // const supabase = createClient(supabaseUrl, supabaseKey);
            
            // await supabase
            //     .from('prediction_logs')
            //     .insert([{
            //         timestamp,
            //         from_airport: from,
            //         to_airport: to,
            //         flight_date: date,
            //         prediction_value: prediction,
            //         confidence_score: confidence,
            //         data_source: dataSource,
            //         response_time_ms: responseTime,
            //         cache_hit: cacheHit,
            //         user_id: userId,
            //         session_id: sessionId
            //     }]);
        }

        // Update airport popularity (simplified)
        if (to) {
            // In production, you'd update Supabase here
            // await updateAirportPopularity(to);
        }

        return res.status(200).json({
            success: true,
            logged: shouldLog,
            sampleRate: sampleRate,
            message: shouldLog ? 'Prediction logged' : 'Sampled out (not logged)'
        });

    } catch (error) {
        console.error('Prediction logger error:', error);
        // Don't fail the request - prediction logging is non-critical
        return res.status(200).json({
            success: false,
            message: 'Logging failed but continuing',
            error: error.message
        });
    }
}

// Helper function to update airport popularity
async function updateAirportPopularity(airportCode) {
    // This would update your Supabase table
    // For now, just log it
    console.log(`Airport ${airportCode} popularity updated`);
}
