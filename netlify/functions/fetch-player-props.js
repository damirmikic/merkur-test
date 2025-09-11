const fetch = require('node-fetch');

// Wrapper za omogućavanje jednostavnog keširanja u memoriji
const createCache = (ttl) => {
    let cache = {};
    return {
        get: (key) => cache[key] && cache[key].expires > Date.now() ? cache[key].value : null,
        set: (key, value) => {
            cache[key] = { value, expires: Date.now() + ttl };
        },
    };
};

// Keširanje odgovora na 15 minuta da bi se smanjio broj API poziva
const cache = createCache(15 * 60 * 1000);

exports.handler = async (event, context) => {
    const cacheKey = 'player-props-data';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log("Serving from cache.");
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cachedData)
        };
    }
    
    console.log("Fetching fresh data.");

    // --- KONFIGURACIJA ---
    const API_KEYS = process.env.THE_ODDS_API_KEYS ? process.env.THE_ODDS_API_KEYS.split(',') : [
      // Fallback ključevi ako Netlify varijable nisu postavljene
      'd61c763b8d4f58df8a9b1c6f7b532ea7', 'f5342e7e96c21d2c6775e9686cc066c2', '01d36c2b65c8718a1c9e04edfbf41d39'
    ];
     if (API_KEYS.length === 0) {
        return { statusCode: 500, body: JSON.stringify({ error: 'THE_ODDS_API_KEYS is not configured.' }) };
    }

    const SPORTS = [
        'soccer_epl', 'soccer_france_ligue_one', 'soccer_germany_bundesliga',
        'soccer_italy_serie_a', 'soccer_spain_la_liga'
    ];
    const MARKETS = 'h2h,player_goal_scorer_anytime,player_shots_on_target,player_shots,player_assists,player_to_receive_card';
    const BASE_URL = 'https://api.the-odds-api.com/v4/sports';
    const CONCURRENCY = 5;
    let keyIndex = 0;

    // --- POMOĆNE FUNKCIJE ---
    const fetchWithFallback = async (url, params = {}) => {
        for (let i = 0; i < API_KEYS.length; i++) {
            const apiKey = API_KEYS[keyIndex];
            keyIndex = (keyIndex + 1) % API_KEYS.length;
            
            const urlWithParams = new URL(url);
            Object.entries(params).forEach(([key, value]) => urlWithParams.searchParams.set(key, value));
            urlWithParams.searchParams.set('apiKey', apiKey);

            try {
                const response = await fetch(urlWithParams.toString(), { timeout: 15000 });
                if (response.ok) return response.json();
                
                if ([401, 429].includes(response.status)) {
                    console.warn(`Key index ${keyIndex} failed or rate-limited. Trying next.`);
                    continue;
                }
                throw new Error(`API responded with status: ${response.status}`);
            } catch (error) {
                console.error(`Error with key index ${keyIndex}:`, error.message);
            }
        }
        throw new Error('All API keys failed.');
    };

    const mapWithConcurrency = async (items, limit, fn) => {
        const results = [];
        const executing = [];
        for (const item of items) {
            const p = fn(item).then(res => results.push(res));
            executing.push(p);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);
        return results;
    };

    // --- GLAVNA LOGIKA ---
    try {
        const allSportsData = {};

        const sportPromises = SPORTS.map(async (sport) => {
            try {
                const events = await fetchWithFallback(`${BASE_URL}/${sport}/events`, { dateFormat: 'iso' });
                if (!events || events.length === 0) {
                    console.log(`No scheduled events found for ${sport}.`);
                    return { sport, data: [] };
                }

                const oddsPromises = events.map(event => 
                    fetchWithFallback(`${BASE_URL}/${sport}/events/${event.id}/odds`, {
                        regions: 'us', // Usklađeno sa vašom skriptom
                        markets: MARKETS,
                        oddsFormat: 'decimal',
                        dateFormat: 'iso'
                    }).catch(e => {
                        console.error(`Could not fetch odds for event ${event.id}: ${e.message}`);
                        return null;
                    })
                );

                const oddsResults = await Promise.all(oddsPromises);

                const processedEvents = oddsResults
                    .filter(Boolean)
                    .map(eventOdds => {
                        // Pronalazi originalni događaj da spoji informacije
                        const originalEvent = events.find(e => e.id === eventOdds.id);
                        return {
                            ...originalEvent, // Zadržava sve originalne podatke o događaju
                            ...eventOdds      // Dodaje podatke o kvotama
                        };
                    });
                
                return { sport, data: processedEvents };

            } catch (error) {
                console.error(`Failed to process sport ${sport}: ${error.message}`);
                return { sport, data: [] };
            }
        });

        const results = await Promise.all(sportPromises);

        results.forEach(result => {
            if (result.data.length > 0) {
                allSportsData[result.sport] = result.data;
            }
        });

        // Sačuvaj u keš pre vraćanja podataka
        cache.set(cacheKey, allSportsData);

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
