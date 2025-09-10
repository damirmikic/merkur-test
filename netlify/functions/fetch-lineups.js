const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
    };

    const fetchOptions = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 8000 // 8-second timeout for each individual fetch
    };

    const baseUrl = "https://www.sportsmole.co.uk";
    const initialUrl = `${baseUrl}/football/previews/`;
    const allLineupsData = [];

    try {
        console.log("--- Lineup Scraper START ---");
        console.log(`1. Fetching initial page: ${initialUrl}`);

        const response = await fetch(initialUrl, fetchOptions);
        if (!response.ok) throw new Error(`Failed to fetch initial page: ${response.statusText}`);
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const previewLinks = [];
        $('div.previews a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/preview/') && href.endsWith('.html')) {
                const fullUrl = new URL(href, baseUrl).href;
                if (!previewLinks.includes(fullUrl)) {
                    previewLinks.push(fullUrl);
                }
            }
        });

        console.log(`2. Found ${previewLinks.length} unique preview links.`);
        if (previewLinks.length === 0) {
            console.warn("   ! WARNING: No preview links found.");
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }

        console.log(`3. Fetching all ${previewLinks.length} articles in parallel...`);
        const fetchPromises = previewLinks.map(link => fetch(link, fetchOptions));
        const results = await Promise.allSettled(fetchPromises);

        for (const result of results) {
            if (result.status === 'rejected') {
                console.warn(`   - Article failed to fetch: ${result.reason}`);
                continue;
            }

            const articleResponse = result.value;
            if (!articleResponse.ok) continue;

            try {
                const articleHtml = await articleResponse.text();
                const $$ = cheerio.load(articleHtml);

                $$('#article_body strong').each((i, strongEl) => {
                    const strongText = $$(strongEl).text().trim();
                    if (strongText.includes('possible starting lineup:')) {
                        const teamName = strongText.replace('possible starting lineup:', '').trim();
                        
                        let parentElement = $$(strongEl).parent();
                        let lineupText = null;

                        while (parentElement.length && !lineupText) {
                            let nextP = parentElement.nextAll('p').first();
                            while(nextP.length) {
                                let text = nextP.text().trim();
                                if (text && (text.includes(';') || text.split(',').length > 5)) {
                                    lineupText = text;
                                    break;
                                }
                                nextP = nextP.next('p');
                            }
                            parentElement = parentElement.parent();
                        }

                        if (lineupText) {
                             if (!allLineupsData.some(item => item.team === teamName && item.source_url === articleResponse.url)) {
                                console.log(`   -> Found Lineup for "${teamName}" in ${articleResponse.url}`);
                                allLineupsData.push({
                                    team: teamName,
                                    lineup: lineupText,
                                    source_url: articleResponse.url
                                });
                            }
                        }
                    }
                });
            } catch (e) {
                // Ignore errors from individual articles
            }
        }

        console.log(`\n4. Finished processing. Total unique lineups found: ${allLineupsData.length}`);
        console.log("--- Lineup Scraper END ---");

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(allLineupsData),
        };

    } catch (error) {
        console.error('Function Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Function Error: ${error.message}` }),
        };
    }
};
