// /api/fares.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { from, to, date, travelers = 1, mode = 'calendar' } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: 'Missing route' });
  }

  try {
    if (mode === 'calendar') {
      const data = await fetchCalendarData(from, to, date);
      return res.json(data);
    }

    if (mode === 'flights') {
      const data = await fetchBookableFlights(from, to, date, travelers);
      return res.json(data);
    }

    return res.status(400).json({ error: 'Invalid mode' });
  } catch (err) {
    console.error(err);
    return res.json({
      success: false,
      source: 'mock_fallback',
      flights: generateMockFlightData(from, to, date, travelers)
    });
  }
}
