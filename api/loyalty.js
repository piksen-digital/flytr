import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // GET - Fetch loyalty data
    if (req.method === 'GET') {
      const { userId } = req.query;
      
      const { data, error } = await supabase
        .from('user_loyalty')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: data || []
      });
    }

    // POST - Save loyalty data
    if (req.method === 'POST') {
      const { airline, program, status, member_number } = req.body;
      
      if (!airline || !program) {
        return res.status(400).json({
          success: false,
          error: 'Airline and program name are required'
        });
      }

      const { data, error } = await supabase
        .from('user_loyalty')
        .insert([
          {
            airline,
            program,
            status: status || 'Silver',
            member_number: member_number || '',
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: data[0]
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Loyalty API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
        }
