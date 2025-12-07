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
    const { destination, type = 'risk' } = req.body;
    
    if (!destination) {
      return res.status(400).json({ error: 'Destination is required' });
    }

    // Call GNews API
    const response = await fetch(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(destination + " travel safety")}&token=${process.env.GNEWS_API_KEY}&lang=en&max=5`
    );
    
    if (!response.ok) {
      throw new Error(`News API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Analyze articles for risk indicators
    const riskKeywords = ['strike', 'protest', 'unrest', 'warning', 'danger', 'attack', 'violence', 'crisis', 'emergency'];
    const riskArticles = data.articles?.filter(article => {
      const title = article.title.toLowerCase();
      const content = article.content?.toLowerCase() || '';
      return riskKeywords.some(keyword => title.includes(keyword) || content.includes(keyword));
    }) || [];
    
    // Determine risk level
    let riskLevel = 'Low';
    if (riskArticles.length > 2) {
      riskLevel = 'High';
    } else if (riskArticles.length > 0) {
      riskLevel = 'Medium';
    }
    
    return res.status(200).json({
      riskLevel,
      articles: riskArticles.slice(0, 3),
      totalArticles: data.articles?.length || 0,
      riskArticlesCount: riskArticles.length
    });
    
  } catch (error) {
    console.error('News API error:', error);
    return res.status(200).json({
      riskLevel: 'Low',
      articles: [],
      message: 'News data unavailable'
    });
  }
}
