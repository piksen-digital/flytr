// /api/supabase.js
// Server-side Supabase client that protects your anon key

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Initialize Supabase client using server-side environment variables
  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase environment variables not configured');
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'Supabase credentials not configured'
    });
  }

  // Use service role key for admin operations, anon key for public operations
  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

  try {
    switch (req.method) {
      case 'POST':
        return await handlePostRequest(req, res, supabase);
      case 'GET':
        return await handleGetRequest(req, res, supabase);
      case 'PUT':
        return await handlePutRequest(req, res, supabase);
      case 'DELETE':
        return await handleDeleteRequest(req, res, supabase);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Supabase API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

async function handlePostRequest(req, res, supabase) {
  const { action, table, data, query } = req.body;
  
  if (!action) {
    return res.status(400).json({ error: 'Action is required' });
  }

  switch (action) {
    case 'get_loyalty_data':
      return await getLoyaltyData(req, res, supabase);
    case 'save_loyalty_data':
      return await saveLoyaltyData(req, res, supabase);
    case 'get_user_settings':
      return await getUserSettings(req, res, supabase);
    case 'save_user_settings':
      return await saveUserSettings(req, res, supabase);
    case 'log_search':
      return await logSearch(req, res, supabase);
    case 'get_travel_history':
      return await getTravelHistory(req, res, supabase);
    default:
      return res.status(400).json({ error: 'Unknown action' });
  }
}

async function handleGetRequest(req, res, supabase) {
  const { action } = req.query;
  
  switch (action) {
    case 'health':
      return res.status(200).json({ 
        status: 'ok',
        supabase_configured: !!process.env.SUPABASE_URL
      });
    case 'stats':
      return await getStats(req, res, supabase);
    default:
      return res.status(400).json({ error: 'Unknown action' });
  }
}

async function handlePutRequest(req, res, supabase) {
  const { action, table, data, id } = req.body;
  
  if (!action || !table || !id || !data) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const { error } = await supabase
    .from(table)
    .update(data)
    .eq('id', id);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  return res.status(200).json({ success: true });
}

async function handleDeleteRequest(req, res, supabase) {
  const { action, table, id } = req.body;
  
  if (!action || !table || !id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  return res.status(200).json({ success: true });
}

// Specific handlers for different actions

async function getLoyaltyData(req, res, supabase) {
  const { user_id, session_id } = req.body;
  
  // For demo purposes, we'll use session_id or create a temporary user
  let userId = user_id;
  if (!userId && session_id) {
    // Look up or create a user based on session
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('session_id', session_id)
      .single();
    
    if (existingUser) {
      userId = existingUser.id;
    }
  }
  
  if (!userId) {
    // Return empty data for new users
    return res.status(200).json({
      loyalty_programs: [],
      user_exists: false
    });
  }
  
  // Get loyalty data for the user
  const { data: loyaltyData, error } = await supabase
    .from('user_loyalty')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching loyalty data:', error);
    return res.status(200).json({
      loyalty_programs: [],
      user_exists: true
    });
  }
  
  return res.status(200).json({
    loyalty_programs: loyaltyData || [],
    user_exists: true
  });
}

async function saveLoyaltyData(req, res, supabase) {
  const { session_id, loyalty_program, airline, status, member_number } = req.body;
  
  if (!session_id || !loyalty_program || !airline) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // First, get or create user based on session
    let user;
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('session_id', session_id)
      .single();
    
    if (existingUser) {
      user = existingUser;
    } else {
      // Create new user
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([{
          session_id: session_id,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
        
      if (userError) throw userError;
      user = newUser;
    }
    
    // Save loyalty program
    const { data: savedProgram, error: loyaltyError } = await supabase
      .from('user_loyalty')
      .insert([{
        user_id: user.id,
        loyalty_program: loyalty_program,
        airline: airline,
        status: status || 'Silver',
        member_number: member_number,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
      
    if (loyaltyError) throw loyaltyError;
    
    return res.status(200).json({
      success: true,
      loyalty_program: savedProgram
    });
    
  } catch (error) {
    console.error('Error saving loyalty data:', error);
    return res.status(500).json({ 
      error: 'Failed to save loyalty data',
      message: error.message 
    });
  }
}

async function getUserSettings(req, res, supabase) {
  const { session_id } = req.body;
  
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const { data: userData, error } = await supabase
    .from('users')
    .select('settings')
    .eq('session_id', session_id)
    .single();
    
  if (error) {
    return res.status(200).json({
      settings: {}
    });
  }
  
  return res.status(200).json({
    settings: userData?.settings || {}
  });
}

async function saveUserSettings(req, res, supabase) {
  const { session_id, settings } = req.body;
  
  if (!session_id || !settings) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const { error } = await supabase
    .from('users')
    .update({ 
      settings: settings,
      updated_at: new Date().toISOString()
    })
    .eq('session_id', session_id);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  
  return res.status(200).json({ success: true });
}

async function logSearch(req, res, supabase) {
  const { session_id, from, to, date, travelers, search_data } = req.body;
  
  // Don't require session_id for search logging (can be anonymous)
  const { error } = await supabase
    .from('search_logs')
    .insert([{
      session_id: session_id || 'anonymous',
      from_location: from,
      to_location: to,
      travel_date: date,
      travelers: travelers,
      search_data: search_data || {},
      created_at: new Date().toISOString()
    }]);
    
  if (error) {
    console.error('Error logging search:', error);
    // Don't fail the request, just log error
    return res.status(200).json({ success: false });
  }
  
  return res.status(200).json({ success: true });
}

async function getTravelHistory(req, res, supabase) {
  const { session_id, limit = 10 } = req.body;
  
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const { data: searches, error } = await supabase
    .from('search_logs')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    return res.status(200).json({
      searches: []
    });
  }
  
  return res.status(200).json({
    searches: searches || []
  });
}

async function getStats(req, res, supabase) {
  // Get some basic stats (admin function)
  const apiKey = req.headers['x-api-key'];
  
  // Optional: Add API key protection for stats endpoint
  if (process.env.ADMIN_API_KEY && apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Get total searches
    const { count: totalSearches } = await supabase
      .from('search_logs')
      .select('*', { count: 'exact', head: true });
    
    // Get unique users
    const { count: uniqueUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    // Get recent activity
    const { data: recentSearches } = await supabase
      .from('search_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    return res.status(200).json({
      total_searches: totalSearches || 0,
      unique_users: uniqueUsers || 0,
      recent_searches: recentSearches || []
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({ error: error.message });
  }
                                         }
