const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // --- CONFIGURATION ---
    const API_KEYS = process.env.THE_ODDS_API_KEYS ? process.env.THE_ODDS_API_KEYS.split(',') : [];
    if (API_KEYS.length === 0) {
        return { statusCode: 500, body: JSON.stringify({ error: 'THE_ODDS_API_KEYS is not configured in Netlify.' }) };
    }

    const SPORTS = [
        'soccer_epl', 'soccer_france_ligue_one', 'soccer_germany_bundesliga',
        'soccer_italy_serie_a', 'soccer_spain_la_liga'
    ];
    const MARKETS = 'h2h,player_goal_scorer_anytime,player_shots_on_target,player_shots,player_assists,player_to_receive_card';
    const BOOKMAKERS_PRIORITY = ['fanduel', 'betrivers'];
    const BASE_URL = 'https://api.the-odds-api.com/v4/sports';
    const DAYS_AHEAD = 7;
    let keyIndex = 0;

    // --- HELPER FUNCTIONS ---
    const fetchWithFallback = async (url) => {
        for (let i = 0; i < API_KEYS.length; i++) {
            const apiKey = API_KEYS[keyIndex];
            keyIndex = (keyIndex + 1) % API_KEYS.length;
            const fullUrl = `${url}&apiKey=${apiKey}`;

            try {
                const response = await fetch(fullUrl, { timeout: 15000 });
                const remaining = response.headers.get('x-requests-remaining');
                
                if (response.ok) {
                    console.log(`Success with key index ${keyIndex}. Remaining requests: ${remaining}`);
                    return response.json();
                }
                if (response.status === 401 || response.status === 429) {
                    console.warn(`Key index ${keyIndex} failed or rate-limited (Remaining: ${remaining}). Trying next.`);
                    continue;
                }
                throw new Error(`API responded with status: ${response.status}`);
            } catch (error) {
                console.error(`Error with key index ${keyIndex}:`, error.message);
            }
        }
        throw new Error('All API keys failed or timed out.');
    };

    const processEvent = (event) => {
        let bestBookmaker = null;
        for (const bookie of BOOKMAKERS_PRIORITY) {
            const found = event.bookmakers.find(b => b.key === bookie);
            if (found) {
                bestBookmaker = found;
                break;
            }
        }
        if (!bestBookmaker && event.bookmakers.length > 0) {
            bestBookmaker = event.bookmakers[0];
        }
        
        return {
            ...event,
            bookmakers: bestBookmaker ? [bestBookmaker] : []
        };
    };

    // --- MAIN LOGIC ---
    try {
        const allSportsData = {};
        const fetchPromises = SPORTS.map(async (sport) => {
            try {
                const eventsList = await fetchWithFallback(`${BASE_URL}/${sport}/events?dateFormat=iso&daysFromNow=${DAYS_AHEAD}`);
                
                if (!eventsList || eventsList.length === 0) {
                    console.log(`No upcoming events in the next ${DAYS_AHEAD} days for ${sport}.`);
                    return { sport, data: [] };
                }

                const eventIds = eventsList.map(e => e.id).join(',');
                const oddsData = await fetchWithFallback(
                    `${BASE_URL}/${sport}/events/odds?eventIds=${eventIds}&markets=${MARKETS}&regions=us&oddsFormat=decimal`
                );
                
                const processedEvents = oddsData.map(processEvent).filter(e => e.bookmakers.length > 0);
                return { sport, data: processedEvents };

            } catch (error) {
                console.error(`Failed to process sport ${sport}: ${error.message}`);
                return { sport, data: [] };
            }
        });

        const results = await Promise.all(fetchPromises);

        results.forEach(result => {
            if (result.data.length > 0) {
                allSportsData[result.sport] = result.data;
            }
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allSportsData)
        };

    } catch (error) {
        console.error("Critical Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

