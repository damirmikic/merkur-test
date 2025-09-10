const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
    };

    const url = "https://www.eurobasket.com/team-stats.aspx?sectionid=175&League=1";

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const stats = [];
        const headersMap = [];

        $('#tblAgTable thead tr th').each((i, el) => {
            headersMap[i] = $(el).text().trim();
        });

        $('#tblAgTable tbody tr').each((i, row) => {
            const teamStats = {};
            $(row).find('td').each((j, cell) => {
                const header = headersMap[j];
                let value = $(cell).text().trim();
                // Convert numeric strings to numbers, but keep percentages as strings
                if (!header.includes('%') && !isNaN(value) && value !== '') {
                    value = parseFloat(value);
                }
                if (header === 'Team') {
                   teamStats[header] = value.substring(0,3);
                } else {
                   teamStats[header] = value;
                }
            });
            stats.push(teamStats);
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(stats),
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
