const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // URLs to scrape injury data from
        const urls = {
            "england-premier-league": "https://www.sportsgambler.com/injuries/football/england-premier-league/",
            "spain-la-liga": "https://www.sportsgambler.com/injuries/football/spain-la-liga/",
            "italy-serie-a": "https://www.sportsgambler.com/injuries/football/italy-serie-a/",
            "germany-bundesliga": "https://www.sportsgambler.com/injuries/football/germany-bundesliga/",
            "france-ligue-1": "https://www.sportsgambler.com/injuries/football/france-ligue-1/"
        };

        const allInjuries = {};
        
        // Process each league
        for (const [league, url] of Object.entries(urls)) {
            try {
                console.log(`Fetching injury data for ${league}...`);
                
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} for ${league}`);
                }

                const html = await response.text();
                const $ = cheerio.load(html);
                const injuries = [];

                // Find team headings
                $('h3').each((index, teamHeading) => {
                    const teamName = $(teamHeading).text().trim();
                    
                    // Skip non-team headings
                    const excludeWords = ['injuries', 'suspensions', 'premier', 'liga', 'bundesliga', 'serie', 'ligue', 'la liga', 'serie a', 'news', 'updates'];
                    if (excludeWords.some(word => teamName.toLowerCase().includes(word))) {
                        return;
                    }

                    // Find injury rows for this team
                    let currentElement = $(teamHeading).next();
                    
                    while (currentElement.length && !currentElement.is('h3')) {
                        if (currentElement.hasClass('inj-row')) {
                            const dataDiv = currentElement.find('div').first();
                            if (dataDiv.length) {
                                const text = dataDiv.text().trim();
                                const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                                
                                if (lines.length >= 4) {
                                    const player = {
                                        team: teamName,
                                        player_name: lines[0] || "N/A",
                                        position: lines[1] || "N/A",
                                        info: lines.length >= 6 ? (lines[5] || "N/A") : "N/A",
                                        expected_return: lines.length >= 7 ? (lines[6] || "N/A") : "N/A"
                                    };
                                    
                                    if (player.player_name !== "N/A" && player.player_name) {
                                        injuries.push(player);
                                    }
                                }
                            }
                        }
                        currentElement = currentElement.next();
                    }
                });

                allInjuries[league] = injuries;
                console.log(`Found ${injuries.length} injuries for ${league}`);

            } catch (error) {
                console.error(`Error fetching ${league}:`, error.message);
                allInjuries[league] = { error: `Failed to fetch ${league}: ${error.message}` };
            }
        }

        // Add metadata
        const result = {
            ...allInjuries,
            _metadata: {
                last_updated: new Date().toISOString(),
                total_leagues: Object.keys(urls).length,
                successful_leagues: Object.keys(allInjuries).filter(league => !allInjuries[league].error).length
            }
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result, null, 2),
        };

    } catch (error) {
        console.error('Function error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            }),
        };
    }
};