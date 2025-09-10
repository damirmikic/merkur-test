const fetch = require('node-fetch'); // This is required for some Netlify runtimes

exports.handler = async (event, context) => {
    // Securely get API keys from Netlify environment variables
    const API_KEYS = process.env.THE_ODDS_API_KEYS ? process.env.THE_ODDS_API_KEYS.split(',') : [];
    if (API_KEYS.length === 0) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API keys are not configured.' }) };
    }

    const SPORTS = [
        'soccer_epl', 'soccer_france_ligue_one', 'soccer_germany_bundesliga',
        'soccer_italy_serie_a', 'soccer_spain_la_liga'
    ];
    // We get h2h (match odds) and anytime goalscorer odds in one call per league
    const MARKETS = 'h2h,player_goal_scorer_anytime';
    const BASE_URL = 'https://api.the-odds-api.com/v4/sports';
    let keyIndex = 0;

    // Helper to try fetching with rotating keys
    const fetchWithFallback = async (url) => {
        for (let i = 0; i < API_KEYS.length; i++) {
            const apiKey = API_KEYS[keyIndex];
            keyIndex = (keyIndex + 1) % API_KEYS.length;
            const fullUrl = `${url}&apiKey=${apiKey}`;
            
            try {
                const response = await fetch(fullUrl);
                if (response.ok) return response.json();
                if (response.status === 401 || response.status === 429) {
                    console.warn(`Key index ${keyIndex} failed or rate-limited. Trying next.`);
                    continue;
                }
                throw new Error(`API responded with status: ${response.status}`);
            } catch (error) {
                console.error(`Error with key index ${keyIndex}:`, error.message);
                 if (!(error.message.includes('401') || error.message.includes('429'))) {
                   throw error;
                }
            }
        }
        throw new Error('All API keys failed or were rate-limited.');
    };

    try {
        const allEventsWithProps = {};
        
        const sportPromises = SPORTS.map(async (sport) => {
            const oddsUrl = `${BASE_URL}/${sport}/odds?regions=us&markets=${MARKETS}&oddsFormat=decimal&dateFormat=iso`;
            try {
                const events = await fetchWithFallback(oddsUrl);
                allEventsWithProps[sport] = events;
            } catch (error) {
                 console.error(`Could not fetch odds for ${sport}: ${error.message}`);
                 allEventsWithProps[sport] = []; 
            }
        });

        await Promise.all(sportPromises);
        
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(allEventsWithProps)
        };
    } catch (error) {
        console.error("Function Error:", error);
        return { 
            statusCode: 500,
            body: JSON.stringify({ error: `A critical error occurred: ${error.message}` }) 
        };
    }
};

