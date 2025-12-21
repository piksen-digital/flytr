// /api/health.js
export default function handler(req, res) {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'development',
        apis_configured: {
            aviationstack: !!process.env.AVIATIONSTACK_API_KEY,
            openweather: !!process.env.OPENWEATHER_API_KEY,
            currencyfreaks: !!process.env.CURRENCYFREAKS_API_KEY,
            gnews: !!process.env.GNEWS_API_KEY,
            supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY,
            google_tim: !!process.env.GOOGLE_TIM_API_KEY
        },
        serverless_functions: [
            'flights', 'weather', 'advisory', 'currency', 
            'carbon', 'news', 'airport', 'layover', 
            'fares', 'loyalty', 'health'
        ].map(func => `${func}.js`)
    };
    
    res.status(200).json(health);
}
