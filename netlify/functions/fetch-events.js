/**
 * Netlify serverless function to securely fetch sports events data from the Cloudbet API.
 * This function now fetches data for ALL relevant leagues to serve as a primary or fallback source.
 */
exports.handler = async (event, context) => {
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key is not configured.' }),
    };
  }
  
  const from = Math.floor(Date.now() / 1000);
  const to = from + (72 * 3600); 
  
  // Fetching all leagues. The frontend will decide which ones to use.
  const leagueKeys = [
    'soccer-england-premier-league',
    'soccer-france-ligue-1',
    'soccer-germany-bundesliga',
    'soccer-italy-serie-a',
    'soccer-spain-laliga',
    'soccer-international-clubs-uefa-champions-league',
    'soccer-international-clubs-uefa-europa-league',
    'soccer-international-clubs-t6eeb-uefa-europa-conference-league',
    'soccer-serbia-superliga',
    'soccer-international-wc-qualification-uefa',
    'soccer-international-wc-qualifying-conmebol'
  ];

  try {
    const fetchPromises = leagueKeys.map(key => {
      const API_URL = `https://sports-api.cloudbet.com/pub/v2/odds/competitions/${key}?from=${from}&to=${to}&players=true&limit=100`;
      return fetch(API_URL, { headers: { 'X-API-Key': API_KEY } });
    });

    const results = await Promise.allSettled(fetchPromises);

    const competitions = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.ok) {
        const data = await result.value.json();
        if (data && data.events && data.events.length > 0) {
          data.events = data.events.filter(event => event.type !== 'EVENT_TYPE_OUTRIGHT');
          if (data.events.length > 0) {
            competitions.push(data);
          }
        }
      } else {
        const reason = result.reason || `Status: ${result.value.status}`;
        console.error(`Fetch failed for one of the leagues: ${reason}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitions }),
    };

  } catch (error) {
    console.error("Function Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Function Error: ${error.message}` }),
    };
  }
};

