import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Test connection
    const { data, error } = await supabase
      .from('user_loyalty')
      .select('*')
      .limit(1);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      connected: true,
      tableExists: true,
      rowCount: data.length
    });

  } catch (error) {
    console.error('Supabase test error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      url: process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_ANON_KEY
    });
  }
}
