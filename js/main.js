import InjuryManager from '../modules/injury-module.js';
import LineupManager from '../modules/lineup-module.js';

// --- INITIALIZE MODULES ---
window.injuryManager = new InjuryManager();
window.lineupManager = new LineupManager();

// --- HELPERS ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const on = (element, event, handler) => {
    if (element) {
        // Ako je NodeList (rezultat $$), prođi kroz svaki element
        if (element instanceof NodeList) {
            element.forEach(el => el.addEventListener(event, handler));
        } else {
            element.addEventListener(event, handler);
        }
    }
};


// --- DOM ELEMENT CONSTANTS ---
const fetchApiBtn = $('#fetch-api-btn');
const apiBtnText = $('#api-btn-text');
const apiStatus = $('#api-status');
const tabButtons = $$('.tab-btn');
const tabContents = $$('.tab-content');

// Players Tab Elements
const playersApiSection = $('#api-section');
const playersCompetitionSelect = $('#competition-select');
const playersEventSelect = $('#event-select');
const playersTeamSelect = $('#team-select');
const teamFilter = $('#team-filter');
const apiPlayerAdder = $('#api-player-adder');
const apiPlayerSelect = $('#api-player-select');
const addApiPlayerBtn = $('#add-api-player-btn');
const playersContainer = $('#players-container');
const addPlayerBtn = $('#add-player-btn');

// Specials Tab Elements
const specialApiSection = $('#special-api-section');
const specialCompetitionSelect = $('#special-competition-select');
const specialEventSelect = $('#special-event-select');
const addCustomBetBtn = $('#add-custom-bet-btn');


// Common Elements
const generateBtn = $('#generate-btn');
const downloadCsvBtn = $('#download-csv-btn');
const resetBtn = $('#reset-btn');
const previewSection = $('#preview-section');
const previewTableBody = $('#preview-table-body');
const matchDetailsSection = $('#match-details-section');
const toggleApiDataBtn = $('#toggle-api-data-btn');
const apiDataDisplay = $('#api-data-display');


// --- GLOBAL STATE ---
let allFbrefStats = [];
let oddsApiEvents = [];
let cloudbetEvents = [];
let currentTab = 'players';
let playerCounter = 0;

// --- DATA MAPPINGS ---
const sportKeyToNameMapping = {
    'soccer_epl': 'England - Premier League',
    'soccer_france_ligue_one': 'France - Ligue 1',
    'soccer_germany_bundesliga': 'Germany - Bundesliga',
    'soccer_italy_serie_a': 'Italy - Serie A',
    'soccer_spain_la_liga': 'Spain - La Liga',
};

const BIG_5_LEAGUES_CLOUDBET = [
    'soccer-england-premier-league', 'soccer-france-ligue-1', 
    'soccer-germany-bundesliga', 'soccer-italy-serie-a', 'soccer-spain-laliga'
];

// --- DATA FETCHING & NORMALIZATION ---

const normalizePlayerPropsData = (data) => {
    const events = [];
    if (!data) return events;
    for (const sportKey in data) {
        if (!Array.isArray(data[sportKey])) continue;
        data[sportKey].forEach(event => {
            const bookmaker = event.bookmakers?.[0];
            const matchOdds = bookmaker?.markets.find(m => m.key === 'h2h');
            const playerProps = event.playerProps || [];
            events.push({
                id: event.id,
                name: `${event.home_team} vs ${event.away_team}`,
                home: { name: event.home_team },
                away: { name: event.away_team },
                cutoffTime: event.commence_time,
                competitionName: sportKeyToNameMapping[sportKey] || sportKey,
                competitionKey: sportKey,
                source: 'TheOddsAPI',
                playerProps: playerProps,
                markets: {
                    'soccer.match_odds': {
                        submarkets: { 'period=ft': {
                            selections: matchOdds?.outcomes.map(o => ({
                                outcome: o.name === event.home_team ? 'home' : (o.name === event.away_team ? 'away' : 'draw'),
                                price: o.price
                            })) || []
                        }}
                    }
                }
            });
        });
    }
    return events;
};

const fetchAllApiData = async () => {
    apiBtnText.textContent = 'Učitavam...';
    fetchApiBtn.disabled = true;
    apiStatus.textContent = 'Preuzimanje podataka sa oba API-ja...';
    
    const cloudbetPromise = fetch('/api/events').then(res => res.ok ? res.json() : { competitions: [] });
    const playerPropsPromise = fetch('/api/player-props').then(res => res.ok ? res.json() : {});

    try {
        const [cloudbetData, playerPropsData] = await Promise.all([cloudbetPromise, playerPropsPromise]);
        
        oddsApiEvents = normalizePlayerPropsData(playerPropsData);
        cloudbetEvents = (cloudbetData.competitions || []).flatMap(comp => 
            comp.events.map(event => ({...event, competitionName: comp.name, competitionKey: comp.key, source: 'Cloudbet' }))
        );

        if (oddsApiEvents.length === 0 && cloudbetEvents.length === 0) {
             apiStatus.textContent = 'Nije pronađen nijedan meč.';
        } else {
             apiStatus.textContent = `Učitano ${oddsApiEvents.length} mečeva sa TheOddsAPI i ${cloudbetEvents.length} sa Cloudbet-a.`;
             handleTabChange();
        }

    } catch (error) {
        apiStatus.textContent = `Greška: ${error.message}`;
        console.error("API Fetch Error:", error);
    } finally {
        apiBtnText.textContent = 'Učitaj Mečeve sa API-ja';
        fetchApiBtn.disabled = false;
    }
};

const fetchFbrefData = async () => {
    const indicator = $('#status-indicator');
    const statusText = $('#status-text');
    try {
        const response = await fetch('/data/merged_player_stats.json'); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allFbrefStats = await response.json();
        indicator.classList.replace('bg-red-500', 'bg-green-500');
        statusText.textContent = 'Lokalna baza učitana';
        const teams = [...new Set(allFbrefStats.map(p => p.Squad))].sort();
        teamFilter.innerHTML = '<option value="">-- Ručni filter --</option>';
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            teamFilter.appendChild(option);
        });
    } catch (error) {
        console.error("Greška pri učitavanju lokalnih podataka:", error);
        statusText.textContent = 'Greška učitavanja baze';
    }
};

// --- TAB & UI LOGIC ---

const handleTabChange = () => {
    resetForm();
    playersApiSection.classList.add('hidden');
    specialApiSection.classList.add('hidden');
    
    if (currentTab === 'players') {
        playersApiSection.classList.remove('hidden');
        playersCompetitionSelect.innerHTML = '<option value="">-- Izaberi Takmičenje --</option>';
        playersCompetitionSelect.disabled = (oddsApiEvents.length === 0 && cloudbetEvents.length === 0);

        const competitions = {};
        oddsApiEvents.forEach(event => {
            if (!competitions[event.competitionKey]) {
                competitions[event.competitionKey] = { key: event.competitionKey, name: event.competitionName, source: 'TheOddsAPI' };
            }
        });

        cloudbetEvents.forEach(event => {
            if (!BIG_5_LEAGUES_CLOUDBET.includes(event.competitionKey) && !competitions[event.competitionKey]) {
                competitions[event.competitionKey] = { key: event.competitionKey, name: event.competitionName, source: 'Cloudbet' };
            }
        });
        
        Object.values(competitions)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(comp => {
                const option = document.createElement('option');
                option.value = comp.key;
                option.textContent = comp.name;
                option.dataset.source = comp.source;
                playersCompetitionSelect.appendChild(option);
            });

    } else if (currentTab === 'specials') {
        specialApiSection.classList.remove('hidden');
        specialCompetitionSelect.innerHTML = '<option value="">-- Izaberi Takmičenje --</option>';
        specialCompetitionSelect.disabled = (cloudbetEvents.length === 0);

        const competitions = cloudbetEvents.reduce((acc, event) => {
            if (!acc[event.competitionKey]) {
                acc[event.competitionKey] = { key: event.competitionKey, name: event.competitionName };
            }
            return acc;
        }, {});

        Object.values(competitions)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(comp => {
                const option = document.createElement('option');
                option.value = comp.key;
                option.textContent = comp.name;
                specialCompetitionSelect.appendChild(option);
            });
    }
};

const populateApiPlayerSelect = (players) => {
    apiPlayerSelect.innerHTML = '<option value="">-- Izaberi igrača --</option>';
    if (!players || players.length === 0) {
        apiPlayerAdder.classList.add('hidden');
        return;
    }

    players.sort((a, b) => {
        const priceA = a.markets?.player_goal_scorer_anytime?.[0]?.price || Infinity;
        const priceB = b.markets?.player_goal_scorer_anytime?.[0]?.price || Infinity;
        if (priceA === Infinity && priceB === Infinity) {
            return a.name.localeCompare(b.name);
        }
        return priceA - priceB;
    });

    players.forEach(player => {
        const option = document.createElement('option');
        option.value = player.name;
        
        let optionText = player.name;
        const goalscorerOdd = player.markets?.player_goal_scorer_anytime?.[0]?.price;
        if (goalscorerOdd) {
            optionText += ` (${goalscorerOdd})`;
        }
        option.textContent = optionText;
        option.dataset.teamSide = player.teamSide || 'unknown';
        apiPlayerSelect.appendChild(option);
    });
    apiPlayerAdder.classList.remove('hidden');
};

const populateMatchData = (eventId, source) => {
    resetForm();
    const eventList = source === 'TheOddsAPI' ? oddsApiEvents : cloudbetEvents;
    const event = eventList.find(e => e.id == eventId);

    if (!event) {
        apiPlayerAdder.classList.add('hidden');
        return;
    }
    
    matchDetailsSection.classList.remove('hidden');
    const kickoff = new Date(event.cutoffTime);
    $('#kickoff-date').value = kickoff.toISOString().split('T')[0];
    $('#kickoff-time').value = get24hTime(kickoff);
    $('#match-name').value = event.name;

    playersTeamSelect.innerHTML = `<option value="all">Svi Igrači</option>`;
    const matchOddsMarket = event.markets?.['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
    if (matchOddsMarket && matchOddsMarket.length > 0) {
        const homeOdd = matchOddsMarket.find(s => s.outcome === 'home')?.price;
        const awayOdd = matchOddsMarket.find(s => s.outcome === 'away')?.price;
        playersTeamSelect.innerHTML += `<option value="home" data-odd="${homeOdd || ''}">${event.home.name}</option>`;
        playersTeamSelect.innerHTML += `<option value="away" data-odd="${awayOdd || ''}">${event.away.name}</option>`;
        $('#team-win-odd').value = homeOdd || '';
    }
    playersTeamSelect.disabled = false;
    
    if (event.source === 'TheOddsAPI') {
        populateApiPlayerSelect(event.playerProps || []);
    } else {
        apiPlayerAdder.classList.add('hidden');
    }
};

const populateSpecialsData = (eventId) => {
    const event = cloudbetEvents.find(e => e.id == eventId);
    if (!event) return;
    
    const goalsLambda = findMarketLineAndLambda(event, 'soccer.total_goals', 'period=ft');
    const cornersLambda = findMarketLineAndLambda(event, 'soccer.total_corners', 'period=ft_corners');
    const cardsLambda = findMarketLineAndLambda(event, 'soccer.totals.cards', 'period=ft');
    const sotLambda = findMarketLineAndLambda(event, 'soccer.shots_on_target', 'period=ft');
    
    const { lambdaHome, lambdaAway } = calculateTeamLambdas(event);
    const { lambdaHome: cornerLambdaHome, lambdaAway: cornerLambdaAway } = calculateTeamCornerLambdas(event, cornersLambda);
    
    event.lambdaHome = lambdaHome;
    event.lambdaAway = lambdaAway;

    const bttsMarket = event.markets?.['soccer.both_teams_to_score']?.submarkets?.['period=ft']?.selections;
    if(bttsMarket) {
        const yesOdd = bttsMarket.find(s => s.outcome === 'yes')?.price;
        if(yesOdd) {
            $('#special-gg-prob').value = (oddToProb(yesOdd) * 100).toFixed(2);
        }
    }

    $('#special-goals-lambda').value = goalsLambda ? goalsLambda.toFixed(2) : '2.5';
    $('#special-corners-lambda').value = cornersLambda ? cornersLambda.toFixed(2) : '10.5';
    $('#special-cards-lambda').value = cardsLambda ? cardsLambda.toFixed(2) : '4.5';
    $('#special-sot-lambda').value = sotLambda ? sotLambda.toFixed(2) : '8.5';
    $('#special-goals-lambda-home').value = lambdaHome ? lambdaHome.toFixed(2) : '';
    $('#special-goals-lambda-away').value = lambdaAway ? lambdaAway.toFixed(2) : '';
    $('#special-corners-lambda-home').value = cornerLambdaHome ? cornerLambdaHome.toFixed(2) : '';
    $('#special-corners-lambda-away').value = cornerLambdaAway ? cornerLambdaAway.toFixed(2) : '';

    // Show API data in preformatted block
    apiDataDisplay.querySelector('pre').textContent = JSON.stringify(event, null, 2);
};

// --- MATH HELPERS ---
let factCache = [1];
const factorial = n => {
    if (n < 0) return NaN;
    if (n > 170) return Infinity;
    if (factCache[n] !== undefined) return factCache[n];
    let val = factCache[factCache.length - 1];
    for (let i = factCache.length; i <= n; i++) {
        val *= i;
        factCache[i] = val;
    }
    return val;
};
const poissonPMF = (mu, k) => Math.exp(-mu) * Math.pow(mu, k) / factorial(k);
const probToOdd = p => (p <= 0 || p >= 1) ? null : 1 / p;
const oddToProb = o => (o <= 1) ? 1 : 1 / o;
const poissonCDF = (lambda, k) => {
    if (k < 0) return 0;
    let sum = 0;
    for (let i = 0; i <= k; i++) {
        sum += poissonPMF(lambda, i);
    }
    return sum;
};
const probOver = (lambda, k) => 1 - poissonCDF(lambda, k);

// --- FORM LOGIC ---
const resetForm = () => {
    $('#odds-form').reset();
    $('#specials-form').reset();
    playersContainer.innerHTML = '';
    playerCounter = 0;
    previewSection.classList.add('hidden');
    playersTeamSelect.innerHTML = '';
    playersTeamSelect.disabled = true;
    apiPlayerAdder.classList.add('hidden');
    apiPlayerSelect.innerHTML = '';
    matchDetailsSection.classList.add('hidden');
    apiDataDisplay.querySelector('pre').textContent = '';
    apiDataDisplay.classList.add('hidden');
    if (currentTab === 'players') {
        addPlayer();
    }
};

const addPlayer = (playerData = {}) => {
    playerCounter++;
    const playerCard = document.createElement('div');
    playerCard.className = 'player-card';
    playerCard.id = `player-card-${playerCounter}`;
    playerCard.dataset.teamSide = playerData.teamSide || 'unknown';
    // Inner HTML for the player card... (skraćeno radi preglednosti)
    playerCard.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-bold text-slate-700">Igrač ${playerCounter}</h3>
            <button type="button" class="text-slate-400 hover:text-red-600 transition-colors remove-player-btn" title="Ukloni igrača">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
        <div class="grid md:grid-cols-2 gap-x-8 gap-y-6">
            <div class="space-y-4">
                <h4>1. Pronađi i popuni statistiku</h4>
                <div class="relative input-group">
                    <label>Ime igrača</label>
                    <input type="text" class="player-name-search w-full" placeholder="Počni da kucaš ime..." value="${playerData.name || ''}">
                    <div class="autocomplete-suggestions hidden"></div>
                </div>
                 <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                    <div class="input-group"><label>Golovi / 90</label><input type="number" class="player-stat" data-stat="Gls_90" step="0.01" value="${playerData.Gls_90 || 0}"></div>
                    <div class="input-group"><label>Asist. / 90</label><input type="number" class="player-stat" data-stat="Ast_90" step="0.01" value="${playerData.Ast_90 || 0}"></div>
                    <div class="input-group"><label>Šutevi u Okvir / 90</label><input type="number" class="player-stat" data-stat="SoT_90" step="0.01" value="${playerData.SoT_90 || 0}"></div>
                    <div class="input-group"><label>Uk. Šuteva / 90</label><input type="number" class="player-stat" data-stat="Sh_90" step="0.01" value="${playerData.Sh_90 || 0}"></div>
                 </div>
            </div>
            <div class="space-y-4">
                <h4>2. Osnovne kvote</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                    <div class="input-group"><label>Kvota: Daje gol</label><div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="daje-gol" step="0.01" value="${playerData.goalscorerOdd || ''}"><button type="button" class="calc-btn" data-odd-type="daje-gol" data-stat-type="Gls_90" title="Izračunaj">&#9924;</button></div></div>
                    <div class="input-group"><label>Kvota: Asistencija</label><div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="asistencija" step="0.01"><button type="button" class="calc-btn" data-odd-type="asistencija" data-stat-type="Ast_90" title="Izračunaj">&#9924;</button></div></div>
                </div>
            </div>
        </div>`;
    playersContainer.appendChild(playerCard);
};

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    $('#kickoff-date').value = now.toISOString().split('T')[0];
    $('#kickoff-time').value = get24hTime(now);
    
    window.injuryManager.initialize();
    window.lineupManager.initialize();
    fetchFbrefData();
    addPlayer();

    on(fetchApiBtn, 'click', fetchAllApiData);
    
    tabButtons.forEach(button => {
        on(button, 'click', (e) => {
            currentTab = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => content.classList.remove('active'));
            $(`#tab-${currentTab}`).classList.add('active');
            handleTabChange();
        });
    });

    on(generateBtn, 'click', (e) => { 
        e.preventDefault(); 
        const generatedData = currentTab === 'players' ? calculatePlayerOdds() : calculateSpecialOdds();
        if (generatedData) {
            updatePreviewTable(generatedData);
        }
    });
    
    on(resetBtn, 'click', resetForm);
    on(downloadCsvBtn, 'click', downloadCSV);

    // --- PLAYER TAB LISTENERS ---
    on(playersCompetitionSelect, 'change', e => {
        const key = e.target.value;
        const source = e.target.options[e.target.selectedIndex].dataset.source;
        const eventList = source === 'TheOddsAPI' ? oddsApiEvents : cloudbetEvents;
        
        playersEventSelect.innerHTML = '<option value="">-- Izaberi Meč --</option>';
        if (!key) {
            playersEventSelect.disabled = true;
            return;
        }
        
        eventList.filter(event => event.competitionKey === key)
            .sort((a,b) => new Date(a.cutoffTime) - new Date(b.cutoffTime))
            .forEach(event => {
                const option = document.createElement('option');
                option.value = event.id;
                option.textContent = event.name;
                option.dataset.source = source;
                playersEventSelect.appendChild(option);
            });
        playersEventSelect.disabled = false;
    });

    on(playersEventSelect, 'change', e => {
        const source = e.target.options[e.target.selectedIndex].dataset.source;
        populateMatchData(e.target.value, source);
    });

    on(addApiPlayerBtn, 'click', () => {
        const selectedPlayerName = apiPlayerSelect.value;
        if (!selectedPlayerName) return;
        const eventId = playersEventSelect.value;
        const event = oddsApiEvents.find(e => e.id === eventId);
        if (!event) return;
        const playerDataFromApi = event.playerProps.find(p => p.name === selectedPlayerName);
        const fbrefPlayer = allFbrefStats.find(p => p.Player.toLowerCase() === selectedPlayerName.toLowerCase());
        const initialData = {
            name: selectedPlayerName,
            teamSide: playerDataFromApi?.teamSide || 'unknown',
            goalscorerOdd: playerDataFromApi?.markets?.player_goal_scorer_anytime?.[0]?.price,
            ...(fbrefPlayer || {})
        };
        addPlayer(initialData);
    });

    on(addPlayerBtn, 'click', () => addPlayer());
    
    on(playersContainer, 'input', e => { 
        if (e.target.classList.contains('player-name-search')) showAutocomplete(e.target);
    });
    
    on(playersContainer, 'click', e => {
        const target = e.target.closest('button');
        if (!target) return;
        if (target.classList.contains('remove-player-btn')) target.closest('.player-card')?.remove();
        if (target.classList.contains('calc-btn')) calculateSingleBaseOdd(target);
    });

    // --- SPECIALS TAB LISTENERS ---
    on(specialCompetitionSelect, 'change', e => {
        const key = e.target.value;
        specialEventSelect.innerHTML = '<option value="">-- Izaberi Meč --</option>';
        if (!key) {
            specialEventSelect.disabled = true;
            return;
        }

        cloudbetEvents.filter(event => event.competitionKey === key)
            .sort((a,b) => new Date(a.cutoffTime) - new Date(b.cutoffTime))
            .forEach(event => {
                const option = document.createElement('option');
                option.value = event.id;
                option.textContent = event.name;
                specialEventSelect.appendChild(option);
            });
        specialEventSelect.disabled = false;
    });

    on(specialEventSelect, 'change', e => {
        populateSpecialsData(e.target.value);
    });

    on(previewTableBody, 'click', e => {
        if (e.target.closest('.remove-preview-row')) e.target.closest('tr').remove();
    });
    
    on(addCustomBetBtn, 'click', () => { /* Logic for adding custom bet */ });
    on(toggleApiDataBtn, 'click', () => apiDataDisplay.classList.toggle('hidden'));
});
