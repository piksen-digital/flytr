// /api/health.js
export default function handler(req, res) {
    const envVars = {
        aviationstack: !!process.env.AVIATIONSTACK_API_KEY,
        openweather: !!process.env.OPENWEATHER_API_KEY,
        supabase: !!process.env.SUPABASE_URL,
        currencyfreaks: !!process.env.CURRENCYFREAKS_API_KEY,
        gnews: !!process.env.GNEWS_API_KEY,
        googletim: !!process.env.GOOGLETIM_API_KEY,
        // Add other env vars
    };
    
    res.status(200).json({
        status: 'operational',
        environment: process.env.VERCEL_ENV || 'development',
        apis_configured: envVars,
        timestamp: new Date().toISOString()
    });
}
