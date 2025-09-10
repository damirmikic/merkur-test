const fetch = require('node-fetch');

// This function is the serverless version of your fetch-odds.js script
exports.handler = async (event, context) => {
    const API_KEYS = process.env.THE_ODDS_API_KEYS ? process.env.THE_ODDS_API_KEYS.split(',') : [];
    if (API_KEYS.length === 0) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API keys are not configured.' }) };
    }

    const SPORTS = [
        'soccer_epl', 'soccer_france_ligue_one', 'soccer_germany_bundesliga',
        'soccer_italy_serie_a', 'soccer_spain_la_liga'
    ];
    const MARKETS = 'player_goal_scorer_anytime,player_to_receive_card,player_shots_on_target,player_shots,player_assists';
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
                    console.warn(`Key ${keyIndex} failed or rate-limited. Trying next.`);
                    continue;
                }
                throw new Error(`API responded with status: ${response.status}`);
            } catch (error) {
                console.error(`Error with key ${keyIndex}:`, error);
            }
        }
        throw new Error('All API keys failed.');
    };

    try {
        const allEventsWithProps = {};
        
        // 1. Fetch all upcoming events for each sport
        const eventPromises = SPORTS.map(sport => 
            fetchWithFallback(`${BASE_URL}/${sport}/events?dateFormat=iso`)
        );
        const eventResults = await Promise.allSettled(eventPromises);

        const allUpcomingEvents = eventResults
            .filter(res => res.status === 'fulfilled')
            .flatMap(res => res.value);

        // 2. Fetch odds for each event
        const oddsPromises = allUpcomingEvents.map(event => 
            fetchWithFallback(`${BASE_URL}/${event.sport_key}/events/${event.id}/odds?regions=us&markets=${MARKETS}&oddsFormat=decimal`)
                .then(oddsData => ({ ...event, ...oddsData })) // Combine event info with its odds
                .catch(e => ({...event, error: e.message}))
        );

        const fullEventData = await Promise.all(oddsPromises);

        // 3. Group events by sport_key
        fullEventData.forEach(event => {
            if (!event.error) {
                if (!allEventsWithProps[event.sport_key]) {
                    allEventsWithProps[event.sport_key] = [];
                }
                allEventsWithProps[event.sport_key].push(event);
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify(allEventsWithProps)
        };
    } catch (error) {
        console.error("Function Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};