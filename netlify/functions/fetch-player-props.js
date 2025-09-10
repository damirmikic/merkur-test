const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const API_KEYS = process.env.THE_ODDS_API_KEYS ? process.env.THE_ODDS_API_KEYS.split(',') : [];
    if (API_KEYS.length === 0) {
        return { statusCode: 500, body: JSON.stringify({ error: 'THE_ODDS_API_KEYS is not configured in Netlify.' }) };
    }

    const SPORTS = [
        'soccer_epl', 'soccer_france_ligue_one', 'soccer_germany_bundesliga',
        'soccer_italy_serie_a', 'soccer_spain_la_liga'
    ];
    
    const MARKETS = [
        'h2h',
        'player_goal_scorer_anytime',
        'player_to_receive_card',
        'player_shots_on_target',
        'player_shots',
        'player_assists',
    ].join(',');

    const BASE_URL = 'https://api.the-odds-api.com/v4/sports';
    let keyIndex = 0;

    const fetchWithFallback = async (url) => {
        for (let i = 0; i < API_KEYS.length; i++) {
            const apiKey = API_KEYS[keyIndex];
            keyIndex = (keyIndex + 1) % API_KEYS.length;
            const fullUrl = `${url}&apiKey=${apiKey}`;
            
            try {
                const response = await fetch(fullUrl);
                if (response.ok) return response.json();
                if (response.status === 401 || response.status === 429) {
                    console.warn(`Key index ${keyIndex} failed or was rate-limited. Trying next.`);
                    continue;
                }
                throw new Error(`API call to ${url} failed with status: ${response.status}`);
            } catch (error) {
                console.error(`Fetch error with key index ${keyIndex}:`, error.message);
            }
        }
        throw new Error(`All API keys failed for URL: ${url}`);
    };

    try {
        const eventPromises = SPORTS.map(sport => 
            fetchWithFallback(`${BASE_URL}/${sport}/events?dateFormat=iso`)
        );
        const eventResults = await Promise.allSettled(eventPromises);

        const allUpcomingEvents = eventResults
            .filter(res => res.status === 'fulfilled' && Array.isArray(res.value))
            .flatMap(res => res.value);

        if (allUpcomingEvents.length === 0) {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({})
            };
        }
        
        const oddsPromises = allUpcomingEvents.map(event => 
            fetchWithFallback(`${BASE_URL}/${event.sport_key}/events/${event.id}/odds?regions=us&markets=${MARKETS}&oddsFormat=decimal&dateFormat=iso`)
                .then(oddsData => {
                    const bookmakers = oddsData.bookmakers || [];
                    // Prioritize bookmakers: 1. FanDuel, 2. BetRivers, 3. First available
                    let chosenBookmaker = 
                        bookmakers.find(b => b.key === 'fanduel') || 
                        bookmakers.find(b => b.key === 'betrivers') || 
                        bookmakers[0];
                    
                    const finalEventData = { ...event };
                    // Return only the single chosen bookmaker
                    finalEventData.bookmakers = chosenBookmaker ? [chosenBookmaker] : [];
                    return finalEventData;
                })
                .catch(e => {
                    console.warn(`Could not fetch odds for event ${event.id}: ${e.message}`);
                    return {...event, bookmakers: [] };
                })
        );

        const fullEventData = await Promise.all(oddsPromises);

        const finalGroupedData = {};
        fullEventData.forEach(event => {
            const sportKey = event.sport_key;
            if (!finalGroupedData[sportKey]) {
                finalGroupedData[sportKey] = [];
            }
            finalGroupedData[sportKey].push(event);
        });
        
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(finalGroupedData)
        };
    } catch (error) {
        console.error("Critical Function Error:", error);
        return { 
            statusCode: 500,
            body: JSON.stringify({ error: `A critical error occurred: ${error.message}` }) 
        };
    }
};

