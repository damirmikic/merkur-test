import InjuryManager from '../modules/injury-module.js';
import LineupManager from '../modules/lineup-module.js';

// --- INITIALIZE MODULES ---
window.injuryManager = new InjuryManager();
window.lineupManager = new LineupManager();

// --- HELPERS ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const on = (element, event, handler) => element.addEventListener(event, handler);

// --- DOM ELEMENT CONSTANTS ---
const manualEntryBtn = $('#manual-entry-btn');
const manualEntryBtnText = $('#manual-entry-btn-text');
const apiInputs = $('#api-inputs');
const manualInputs = $('#manual-inputs');
const manualHomeTeam = $('#manual-home-team');
const manualAwayTeam = $('#manual-away-team');
const generateBtn = $('#generate-btn');
const downloadCsvBtn = $('#download-csv-btn');
const addPlayerBtn = $('#add-player-btn');
const resetBtn = $('#reset-btn');
const playersContainer = $('#players-container');
const previewSection = $('#preview-section');
const previewTableBody = $('#preview-table-body');
const teamFilter = $('#team-filter');
const fetchApiBtn = $('#fetch-api-btn');
const apiBtnText = $('#api-btn-text');
const apiStatus = $('#api-status');
const competitionSelect = $('#competition-select');
const eventSelect = $('#event-select');
const teamSelect = $('#team-select');
const apiPlayerAdder = $('#api-player-adder');
const apiPlayerSelect = $('#api-player-select');
const addApiPlayerBtn = $('#add-api-player-btn');
const tabButtons = $$('.tab-btn');
const tabContents = $$('.tab-content');
const matchDetailsSection = $('#match-details-section');
const toggleApiDataBtn = $('#toggle-api-data-btn');
const apiDataDisplay = $('#api-data-display');
const startTourBtn = $('#start-tour-btn');
const addCustomBetBtn = $('#add-custom-bet-btn');

// Tour Elements
const tourHighlight = $('#tour-highlight');
const tourTooltip = $('#tour-tooltip');
const tourTitle = $('#tour-title');
const tourText = $('#tour-text');
const tourNext = $('#tour-next');
const tourPrev = $('#tour-prev');
const tourSkip = $('#tour-skip');
const tourClose = $('#tour-close');

// --- GLOBAL STATE ---
let isManualMode = false;
let playerCounter = 0;
let allFbrefStats = [];
let allApiEvents = [];
let availableApiPlayers = [];
let currentTab = 'players';
let currentStep = 0;

// --- DATA FETCHING & NORMALIZATION ---

const sportKeyToNameMapping = {
    'soccer_epl': 'England - Premier League',
    'soccer_france_ligue_one': 'France - Ligue 1',
    'soccer_germany_bundesliga': 'Germany - Bundesliga',
    'soccer_italy_serie_a': 'Italy - Serie A',
    'soccer_spain_la_liga': 'Spain - La Liga',
};

const cloudbetToOddsAPIKeyMap = {
    'soccer-england-premier-league': 'soccer_epl',
    'soccer-france-ligue-1': 'soccer_france_ligue_one',
    'soccer-germany-bundesliga': 'soccer_germany_bundesliga',
    'soccer-italy-serie-a': 'soccer_italy_serie_a',
    'soccer-spain-laliga': 'soccer_spain_la_liga'
};

const populateCompetitionSelect = () => {
    const competitions = allApiEvents.reduce((acc, event) => {
        if (!acc[event.competitionKey]) {
            acc[event.competitionKey] = { key: event.competitionKey, name: event.competitionName };
        }
        return acc;
    }, {});

    competitionSelect.innerHTML = '<option value="">-- Izaberi Takmičenje --</option>';
    Object.values(competitions)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(comp => {
            const option = document.createElement('option');
            option.value = comp.key;
            option.textContent = comp.name;
            competitionSelect.appendChild(option);
        });
};

const normalizePlayerPropsData = (data) => {
    const events = [];
    if (!data) return events;
    
    for (const sportKey in data) {
        if (!Array.isArray(data[sportKey])) continue;
        data[sportKey].forEach(event => {
            const bookmaker = event.bookmakers?.[0];
            const matchOdds = bookmaker?.markets.find(m => m.key === 'h2h');
            
            const playerProps = {};
            if (bookmaker?.markets) {
                bookmaker.markets.forEach(market => {
                    if (market.key.startsWith('player_')) {
                        market.outcomes.forEach(outcome => {
                            const playerName = outcome.description;
                            if (!playerProps[playerName]) {
                                playerProps[playerName] = { name: playerName, markets: {} };
                            }
                            if (!playerProps[playerName].markets[market.key]) {
                                playerProps[playerName].markets[market.key] = [];
                            }
                            playerProps[playerName].markets[market.key].push(outcome);
                        });
                    }
                });
            }

            events.push({
                id: event.id,
                name: `${event.home_team} vs ${event.away_team}`,
                home: { name: event.home_team },
                away: { name: event.away_team },
                cutoffTime: event.commence_time,
                competitionName: sportKeyToNameMapping[sportKey] || sportKey,
                competitionKey: sportKey,
                source: 'TheOddsAPI',
                playerProps: Object.values(playerProps),
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

const fetchApiEvents = async () => {
    apiBtnText.textContent = 'Učitavam...';
    fetchApiBtn.disabled = true;
    apiStatus.textContent = 'Preuzimanje podataka sa oba API-ja...';
    
    const cloudbetPromise = fetch('/api/events').then(res => res.ok ? res.json() : { competitions: [] });
    const playerPropsPromise = fetch('/api/player-props').then(res => res.ok ? res.json() : {});

    try {
        const [cloudbetData, playerPropsData] = await Promise.all([cloudbetPromise, playerPropsPromise]);
        
        const playerPropsEvents = normalizePlayerPropsData(playerPropsData);
        const hasPlayerPropsData = playerPropsEvents.length > 0;

        if (!hasPlayerPropsData) {
            apiStatus.textContent = 'Nema dostupnih kvota za igrače (verovatno je pauza za reprezentacije). Koristim alternativni API za svih 5 liga.';
        }

        const cloudbetEvents = (cloudbetData.competitions || []).flatMap(comp => 
            comp.events.map(event => ({...event, competitionName: comp.name, competitionKey: comp.key, source: 'Cloudbet' }))
        );

        const mergedEvents = [...playerPropsEvents];
        const big5CloudbetKeys = new Set(Object.keys(cloudbetToOddsAPIKeyMap));

        cloudbetEvents.forEach(event => {
            if (big5CloudbetKeys.has(event.competitionKey)) {
                if (!hasPlayerPropsData) {
                    mergedEvents.push(event);
                }
            } else {
                mergedEvents.push(event);
            }
        });

        allApiEvents = mergedEvents;

        if (allApiEvents.length === 0) {
             apiStatus.textContent = 'Nije pronađen nijedan meč.';
        } else {
             populateCompetitionSelect();
             if (hasPlayerPropsData) {
                 apiStatus.textContent = `Uspešno učitano ${allApiEvents.length} mečeva.`;
             }
             competitionSelect.disabled = false;
        }

    } catch (error) {
        apiStatus.textContent = `Greška: ${error.message}`;
        console.error("API Fetch Error:", error);
    } finally {
        apiBtnText.textContent = 'Učitaj Mečeve sa API-ja';
        fetchApiBtn.disabled = false;
    }
};

const populateTeamFilter = (teams) => {
    teamFilter.innerHTML = '<option value="">-- Ručni filter --</option>';
    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamFilter.appendChild(option);
    });
};

const fetchFbrefData = async () => {
    const indicator = $('#status-indicator');
    const statusText = $('#status-text');
    try {
        const response = await fetch('/data/merged_player_stats.json'); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allFbrefStats = await response.json();
        indicator.classList.replace('bg-red-500', 'bg-green-500');
        indicator.classList.replace('pulse-red', 'pulse-green');
        statusText.textContent = 'Lokalna baza učitana';
        statusText.className = 'text-green-700';
        indicator.title = `Uspešno učitano ${allFbrefStats.length} igrača.`;
        const teams = [...new Set(allFbrefStats.map(p => p.Squad))].sort();
        populateTeamFilter(teams);
    } catch (error) {
        console.error("Greška pri učitavanju lokalnih podataka:", error);
        indicator.title = "Greška: Nije moguće učitati 'data/merged_player_stats.json'.";
        statusText.textContent = 'Greška učitavanja baze';
        statusText.className = 'text-red-600';
    }
};

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
const getLambdaFromProb = p => (p <= 0 || p >= 1) ? 0 : -Math.log(1 - p);
const poissonCDF = (lambda, k) => {
    if (k < 0) return 0;
    let sum = 0;
    for (let i = 0; i <= k; i++) {
        sum += poissonPMF(lambda, i);
    }
    return sum;
};
const probOver = (lambda, k) => 1 - poissonCDF(lambda, k);
const probUnder = (lambda, k) => poissonCDF(lambda, k - 1);

const scoreAndWin = (muTeam, muOpponent, pScore, maxGoals = 10) => {
     const lambdaPlayer = getLambdaFromProb(pScore);
     if (lambdaPlayer === 0) return 0;

     const lambdaOther = muTeam - lambdaPlayer;
     if (lambdaOther < 0) return 0;

     let winIfScore = 0;
     let probScore = 0;

     for (let d = 1; d <= maxGoals; d++) {
       const pD = poissonPMF(lambdaPlayer, d);
       probScore += pD;
       for (let o = 0; o <= maxGoals; o++) {
         const pO = poissonPMF(lambdaOther, o);
         const totalGoals = d + o;
         const pOppLess = poissonCDF(muOpponent, totalGoals - 1);
         winIfScore += pD * pO * pOppLess;
       }
     }
     if (probScore === 0) return 0;
     const pWinGivenScore = winIfScore / probScore;
     return probScore * pWinGivenScore;
};

function updateTeamSelectFromManual() {
    const home = manualHomeTeam.value || 'Domaćin';
    const away = manualAwayTeam.value || 'Gost';
    
    teamSelect.innerHTML = `
        <option value="all">Svi Igrači</option>
        <option value="home">${home}</option>
        <option value="away">${away}</option>
    `;
    
    $('#match-name').value = `${home} vs ${away}`;
}

const get24hTime = (date = new Date()) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

const formatOdd = (o) => {
    if (o === null || isNaN(o)) return 'N/A';
    if (o <= 1.01) return '1.01';

    let roundedOdd;
    if (o >= 10) {
        roundedOdd = Math.round(o * 4) / 4;
    } else {
        roundedOdd = Math.round(o * 10) / 10;
    }
    return roundedOdd.toFixed(2);
};

const applyMarginToOdd = (odd, margin) => {
    if (!odd || margin <= 0 || odd <= 1) return odd;
    const p = 1 / odd;
    const ap = p * (1 + (margin / 100));
    return probToOdd(ap);
}

const parsePlayerNameFromOutcome = (outcome) => {
    if (!outcome || !outcome.startsWith('player=')) return 'Unknown Player';
    let namePart = outcome.split('=')[1];
    const firstHyphenIndex = namePart.indexOf('-');
    if (firstHyphenIndex === -1) return 'Unknown Player';
    namePart = namePart.substring(firstHyphenIndex + 1);
    return namePart.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const createShotLineHTML = (threshold, odd, isCustom = false) => {
    const thresholdInput = isCustom 
        ? `<input type="number" class="shots-threshold w-full" value="${threshold || 1}" min="1" step="1">`
        : `<span class="shots-threshold font-medium text-slate-700">${threshold}+</span>`;
    
    const calcButton = isCustom 
        ? `<button type="button" class="calc-btn calc-shot-btn" title="Izračunaj kvotu za ovu granicu">&#9924;</button>`
        : '';

    return `
    <div class="grid grid-cols-12 gap-x-3 items-center shot-line" data-threshold="${threshold}">
         <div class="input-group col-span-4 flex items-center h-full">
              ${thresholdInput}
         </div>
         <div class="input-group col-span-7">
             <div class="input-wrapper">
                 <input type="number" class="shot-odd-input w-full" step="0.01" value="${odd || ''}">
                 ${calcButton}
             </div>
         </div>
         <div class="col-span-1 flex justify-end">
            <button type="button" class="remove-shot-line-btn text-slate-400 hover:text-red-500" title="Ukloni liniju">&times;</button>
         </div>
    </div>`;
};

const addPlayer = (playerData = {}) => {
    playerCounter++;
    const cardId = `player-card-${playerCounter}`;
    const playerCard = document.createElement('div');
    playerCard.className = 'player-card';
    playerCard.id = cardId;
    playerCard.dataset.teamSide = playerData.teamSide || '';
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
                    <div class="input-group"><label>Pasovi / 90</label><input type="number" class="player-stat" data-stat="Pass_Att_90" step="0.01" value="${playerData.Pass_Att_90 || 0}"></div>
                    <div class="input-group"><label>Faulovi / 90</label><input type="number" class="player-stat" data-stat="Fls_90" step="0.01" value="${playerData.Fls_90 || 0}"></div>
                    <div class="input-group"><label>Izn. Faulovi / 90</label><input type="number" class="player-stat" data-stat="Fld_90" step="0.01" value="${playerData.Fld_90 || 0}"></div>
                </div>
            </div>
            <div class="space-y-4">
                <h4>2. Osnovne kvote</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                    <div class="input-group">
                        <label>Kvota: Daje gol</label>
                        <div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="daje-gol" step="0.01" value="${playerData.goalscorerOdd || ''}"><button type="button" class="calc-btn" data-odd-type="daje-gol" data-stat-type="Gls_90" title="Izračunaj">&#9924;</button></div>
                    </div>
                    <div class="input-group">
                        <label>Kvota: Asistencija</label>
                        <div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="asistencija" step="0.01"><button type="button" class="calc-btn" data-odd-type="asistencija" data-stat-type="Ast_90" title="Izračunaj">&#9924;</button></div>
                    </div>
                    <div class="input-group">
                        <label>Kvota: Šutevi u okvir 1+</label>
                        <div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="sutevi-okvir-1" step="0.01"><button type="button" class="calc-btn" data-odd-type="sutevi-okvir-1" data-stat-type="SoT_90" title="Izračunaj">&#9924;</button></div>
                    </div>
                     <div class="input-group">
                        <label>Kvota: Načinjeni faulovi 1+</label>
                        <div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="faulovi-1" step="0.01"><button type="button" class="calc-btn" data-odd-type="faulovi-1" data-stat-type="Fls_90" title="Izračunaj">&#9924;</button></div>
                    </div>
                    <div class="input-group">
                        <label>Kvota: Iznuđeni faulovi 1+</label>
                        <div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="faulovi-iznudjeni-1" step="0.01"><button type="button" class="calc-btn" data-odd-type="faulovi-iznudjeni-1" data-stat-type="Fld_90" title="Izračunaj">&#9924;</button></div>
                    </div>
                    <div class="input-group">
                        <label>Kvota: Žuti karton</label>
                        <div class="input-wrapper">
                            <input type="number" class="player-base-odd" data-odd-type="zuti-karton" step="0.01">
                            <button type="button" class="calc-btn" data-odd-type="zuti-karton" data-stat-type="Fls_90" title="Izračunaj">&#9924;</button>
                        </div>
                    </div>
                     <div class="input-group sm:col-span-2">
                        <label>Očekivani broj pasova (λ)</label>
                        <div class="input-wrapper"><input type="number" class="player-base-odd" data-odd-type="pasovi-lambda" step="0.01"><button type="button" class="calc-btn" data-odd-type="pasovi-lambda" data-stat-type="Pass_Att_90" title="Izračunaj">&#9924;</button></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="border-t border-slate-200 pt-6 mt-6">
             <h4>3. Ukupno Šuteva</h4>
             <div class="shots-lines-container space-y-2 mt-4"></div>
             <button type="button" class="add-shot-line-btn mt-3 text-sm text-blue-600 font-medium hover:text-blue-800 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Dodaj Prilagođenu Liniju
            </button>
        </div>
        `;
     return playerCard;
};

const populateStandardShotLines = (card) => {
    const container = card.querySelector('.shots-lines-container');
    const statInput = card.querySelector('.player-stat[data-stat="Sh_90"]');
    const lambda = parseFloat(statInput.value) || 0;
    const margin = parseFloat($('#bookmaker-margin').value) || 0;
    if (!container || lambda <= 0) {
        if(container) container.innerHTML = '<p class="text-sm text-slate-400">Unesite statistiku "Uk. Šuteva / 90" da bi se generisale linije.</p>';
        return;
    };

    container.innerHTML = '';
    for (let k = 1; k <= 5; k++) {
        const prob_less_than_k = poissonCDF(lambda, k - 1);
        const probability = 1 - prob_less_than_k;
        let rawOdd = probToOdd(probability);
        let finalOdd = applyMarginToOdd(rawOdd, margin);
        container.insertAdjacentHTML('beforeend', createShotLineHTML(k, formatOdd(finalOdd), false));
    }
};

const selectPlayerFromDb = (inputElement, player) => {
    const card = inputElement.closest('.player-card');
    card.querySelector('[data-stat="Gls_90"]').value = player.Gls_90 || 0;
    card.querySelector('[data-stat="Ast_90"]').value = player.Ast_90 || 0;
    card.querySelector('[data-stat="SoT_90"]').value = player.SoT_90 || 0;
    card.querySelector('[data-stat="Sh_90"]').value = player.Sh_90 || 0;
    card.querySelector('[data-stat="Pass_Att_90"]').value = player.Pass_Att_90 || 0;
    card.querySelector('[data-stat="Fls_90"]').value = player.Fls_90 || 0;
    card.querySelector('[data-stat="Fld_90"]').value = player.Fld_90 || 0;
    populateStandardShotLines(card);
};

const showAutocomplete = (inputElement) => {
    const suggestionsContainer = inputElement.nextElementSibling;
    const value = inputElement.value.toLowerCase();
    const selectedTeam = teamFilter.value;
    let sourceData = allFbrefStats;
    if (selectedTeam) {
        sourceData = allFbrefStats.filter(p => p.Squad === selectedTeam);
    }
    suggestionsContainer.innerHTML = '';
    if (!value) {
        suggestionsContainer.classList.add('hidden');
        return;
    }
    const suggestions = sourceData.filter(p => p.Player.toLowerCase().includes(value)).slice(0, 10);
    if (suggestions.length === 0) {
        suggestionsContainer.classList.add('hidden');
        return;
    }
    suggestions.forEach(player => {
        const div = document.createElement('div');
        div.innerHTML = player.Player.replace(new RegExp(value, 'gi'), match => `<span class="highlight">${match}</span>`);
        on(div, 'click', () => {
             inputElement.value = player.Player;
             suggestionsContainer.classList.add('hidden');
             
             if (window.injuryManager) {
                const injuryInfo = window.injuryManager.isPlayerInjured(player.Player);
                if (injuryInfo) {
                    alert(`${player.Player} je možda povređen.\n\nInfo: ${injuryInfo.info}\nOčekivani povratak: ${injuryInfo.expected_return}`);
                }
             }
             
             selectPlayerFromDb(inputElement, player);
        });
        suggestionsContainer.appendChild(div);
    });
    suggestionsContainer.classList.remove('hidden');
};

const calculateOddForLine = (button) => {
     const line = button.closest('.shot-line');
     const card = button.closest('.player-card');
     if (!line || !card) return;

     const k = parseInt(line.querySelector('.shots-threshold').value, 10);
     const oddInput = line.querySelector('.shot-odd-input');
     const statInput = card.querySelector('.player-stat[data-stat="Sh_90"]');
     const lambda = parseFloat(statInput.value) || 0;
     const margin = parseFloat($('#bookmaker-margin').value) || 0;

     if (isNaN(k) || k < 1 || lambda <= 0) {
         oddInput.value = '';
         return;
     }
     const prob_less_than_k = poissonCDF(lambda, k - 1);
     const probability = 1 - prob_less_than_k;
     let rawOdd = probToOdd(probability);
     let finalOdd = applyMarginToOdd(rawOdd, margin);
     oddInput.value = formatOdd(finalOdd);
};

const calculateSingleBaseOdd = (button) => {
    const { oddType, statType } = button.dataset;
    const card = button.closest('.player-card');
    if (!card) return;
    const statInput = card.querySelector(`.player-stat[data-stat="${statType}"]`);
    const oddInput = card.querySelector(`.player-base-odd[data-odd-type="${oddType}"]`);
    const statValue = parseFloat(statInput.value) || 0;
    const margin = parseFloat($('#bookmaker-margin').value) || 0;

    if (statValue <= 0) {
        oddInput.value = '';
        return;
    }

    if (oddType === 'pasovi-lambda') {
        oddInput.value = statValue.toFixed(2);
    } else if (oddType === 'zuti-karton') {
        const prob_1_plus_fouls = 1 - poissonPMF(statValue, 0);
        const odd_1_plus_fouls = probToOdd(prob_1_plus_fouls);
        if (odd_1_plus_fouls) {
            let rawOdd = odd_1_plus_fouls * 3.2;
            let finalOdd = applyMarginToOdd(rawOdd, margin);
            oddInput.value = formatOdd(finalOdd);
        } else {
            oddInput.value = '';
        }
    } else {
        const probability = 1 - poissonPMF(statValue, 0);
        let rawOdd = probToOdd(probability);
        let finalOdd = applyMarginToOdd(rawOdd, margin);
        oddInput.value = formatOdd(finalOdd);
    }
};

const calculatePlayerOdds = () => {
    let allResults = [];
    const playerCards = $$('.player-card');
    let margin = parseFloat($('#bookmaker-margin').value) || 0;
    
    const eventId = eventSelect.value;
    const event = allApiEvents.find(e => e.id == eventId);

    const createBet = (playerName, m2, m3, o, amf = true) => {
        const currentMargin = amf ? margin : 0;
        let finalOddValue = applyMarginToOdd(o, currentMargin);
        
        if (finalOddValue === null || finalOddValue <= 1) return;

        const isShotsMarket = m2.includes('suteva');
        if (isShotsMarket && finalOddValue > 7) return;

        if (finalOddValue > 60) {
            finalOddValue = 60;
        }

        allResults.push({ player: playerName, market2: m2, market3: m3, odd: formatOdd(finalOddValue) });
    };

    playerCards.forEach(card => {
        const playerName = card.querySelector('.player-name-search').value || "Igrač";
        if (!playerName) return;
        
        const baseOdds = {};
        card.querySelectorAll('.player-base-odd').forEach(input => baseOdds[input.dataset.oddType] = parseFloat(input.value) || 0);
        
        if (baseOdds['daje-gol'] > 0) {
            const playerLambda = getLambdaFromProb(oddToProb(baseOdds['daje-gol']));
            const p_poisson = [poissonPMF(playerLambda, 0), poissonPMF(playerLambda, 1), poissonPMF(playerLambda, 2)];
            
            createBet(playerName, 'daje', 'gol', baseOdds['daje-gol'], false);
            createBet(playerName, 'daje gol', 'do 10. min', probToOdd(1 - poissonPMF(playerLambda / 9, 0)));
            
            const prob_2plus = 1 - p_poisson[0] - p_poisson[1];
            let odd_2plus_raw = probToOdd(prob_2plus);
            let odd_2plus_final = applyMarginToOdd(odd_2plus_raw, 20);
            createBet(playerName, 'daje', '2+ golova', odd_2plus_final, false);

            const formatted_odd_2plus = formatOdd(odd_2plus_final);

            if (formatted_odd_2plus !== '60.00') {
                const prob_3plus = 1 - p_poisson[0] - p_poisson[1] - p_poisson[2];
                let odd_3plus_raw = probToOdd(prob_3plus);
                let odd_3plus_final = applyMarginToOdd(odd_3plus_raw, 30);
                createBet(playerName, 'daje', '3+ golova', odd_3plus_final, false);
            }

            const lambda_1h = playerLambda * 0.44;
            const lambda_2h = playerLambda * 0.56;
            
            const prob_1h = 1 - poissonPMF(lambda_1h, 0);
            const prob_2h = 1 - poissonPMF(lambda_2h, 0);

            const odd_1h = probToOdd(prob_1h);
            const odd_2h = probToOdd(prob_2h);
            
            const odd_both_halves = (odd_1h && odd_2h) ? odd_1h * odd_2h : null;

            createBet(playerName, 'daje gol', 'u 1. poluvremenu', odd_1h);
            createBet(playerName, 'daje gol', 'u 2. poluvremenu', odd_2h);
            createBet(playerName, 'daje gol', 'u oba pol.', odd_both_halves);
            
            createBet(playerName, 'daje', 'prvi gol', baseOdds['daje-gol'] * 2.6);
            createBet(playerName, 'daje', 'zadnji gol', baseOdds['daje-gol'] * 2.6);
            
            if (event && event.lambdaHome && event.lambdaAway) {
                const teamSide = card.dataset.teamSide;
                const teamOption = $(`#team-select option[value="${teamSide}"]`);
                if(teamOption) {
                    const teamWinOdd = parseFloat(teamOption.dataset.odd) || 0;
                    const teamLambda = teamSide === 'home' ? event.lambdaHome : event.lambdaAway;
                    
                    if (teamLambda > 0 && teamWinOdd > 1) {
                        const opponentSide = teamSide === 'home' ? 'away' : 'home';
                        const opponentLambda = opponentSide === 'home' ? event.lambdaHome : event.lambdaAway;
                        const pScore = oddToProb(baseOdds['daje-gol']);
                        const probScoresAndWins = scoreAndWin(teamLambda, opponentLambda, pScore, 15);
                        const teamName = teamSide === 'home' ? event.home.name : event.away.name;
                        createBet(playerName, 'daje gol i', `${teamName} pobedjuje`, probToOdd(probScoresAndWins), true);
                    }
                }
            }
        }
        if (baseOdds['sutevi-okvir-1'] > 0) {
            const lambda = getLambdaFromProb(oddToProb(baseOdds['sutevi-okvir-1']));
            const p = [poissonPMF(lambda, 0), poissonPMF(lambda, 1), poissonPMF(lambda, 2)];
            createBet(playerName, 'ukupno suteva', 'u okvir gola 1+', baseOdds['sutevi-okvir-1'], false);
            createBet(playerName, 'ukupno suteva', 'u okvir gola 2+', probToOdd(1 - p[0] - p[1]), true);
            createBet(playerName, 'ukupno suteva', 'u okvir gola 3+', probToOdd(1 - p[0] - p[1] - p[2]), true);
        }
        if (baseOdds['faulovi-1'] > 0) {
            const lambda = getLambdaFromProb(oddToProb(baseOdds['faulovi-1']));
            const p = [poissonPMF(lambda, 0), poissonPMF(lambda, 1), poissonPMF(lambda, 2)];
            const baseOdd = baseOdds['faulovi-1'];
            
            if (baseOdd < 1.3) {
                createBet(playerName, 'ukupno nacinjenih', 'faulova 2+', probToOdd(1 - p[0] - p[1]), true);
                let tempMargin = 20;
                const tempFinalOdd = applyMarginToOdd(probToOdd(1 - p[0] - p[1] - p[2]), tempMargin);
                allResults.push({ player: playerName, market2: 'ukupno nacinjenih', market3: 'faulova 3+', odd: formatOdd(tempFinalOdd) });

            } else {
                createBet(playerName, 'ukupno nacinjenih', 'faulova 1+', baseOdd, false);
                createBet(playerName, 'ukupno nacinjenih', 'faulova 2+', probToOdd(1 - p[0] - p[1]), true);
            }
        }
        if (baseOdds['zuti-karton'] > 0) {
            createBet(playerName, 'dobija', 'karton', baseOdds['zuti-karton'], false);
        }
        if (baseOdds['faulovi-iznudjeni-1'] > 0) {
            const lambda = getLambdaFromProb(oddToProb(baseOdds['faulovi-iznudjeni-1']));
            const p = [poissonPMF(lambda, 0), poissonPMF(lambda, 1), poissonPMF(lambda, 2)];
            const baseOdd = baseOdds['faulovi-iznudjeni-1'];
            
            if (baseOdd < 1.3) {
                createBet(playerName, 'ukupno iznudjenih', 'faulova 2+', probToOdd(1 - p[0] - p[1]), true);
                let tempMargin = 20;
                const tempFinalOdd = applyMarginToOdd(probToOdd(1 - p[0] - p[1] - p[2]), tempMargin);
                allResults.push({ player: playerName, market2: 'ukupno iznudjenih', market3: 'faulova 3+', odd: formatOdd(tempFinalOdd) });
            } else {
                createBet(playerName, 'ukupno iznudjenih', 'faulova 1+', baseOdd, false);
                createBet(playerName, 'ukupno iznudjenih', 'faulova 2+', probToOdd(1 - p[0] - p[1]), true);
            }
        }
        if (baseOdds['pasovi-lambda'] > 0) {
            const lambda = baseOdds['pasovi-lambda'];
            const line = Math.ceil(lambda);
            if (line > 0) createBet(playerName, 'ukupno pasova', `${line}+`, probToOdd(1 - poissonCDF(lambda, line - 1)));
        }
        if (baseOdds['asistencija'] > 0) {
            createBet(playerName, 'asistencija', '1+', baseOdds['asistencija'], false);
            if (baseOdds['daje-gol'] > 0) {
                const prob_goal = oddToProb(baseOdds['daje-gol']);
                const prob_assist = oddToProb(baseOdds['asistencija']);
                createBet(playerName, 'daje gol', 'ili asistencija', probToOdd(prob_goal + prob_assist - (prob_goal * prob_assist)));
            }
        }
        
        card.querySelectorAll('.shot-line').forEach(line => {
            const oddValue = parseFloat(line.querySelector('.shot-odd-input').value);
            const thresholdEl = line.querySelector('.shots-threshold');
            if (!thresholdEl) return; 

            let threshold;
            if (thresholdEl.tagName === 'INPUT') {
                threshold = thresholdEl.value;
            } else {
                threshold = thresholdEl.textContent.replace('+', '').trim();
            }

            if (threshold && oddValue > 0) {
                createBet(playerName, 'ukupno suteva', `${threshold}+`, oddValue, false);
            }
        });
    });
    return allResults;
};

const calculateCorrelatedProbability = (probA, probB, boost = 1.15) => {
    const p_less_likely = Math.min(probA, probB);
    const p_more_likely = Math.max(probA, probB);
    const boosted_p = Math.min(p_more_likely * boost, 0.99);
    return p_less_likely * boosted_p;
};

const calculateSpecialOdds = () => {
    const results = [];
    const margin = parseFloat($('#bookmaker-margin').value) || 0;
    const goalsLambda = parseFloat($('#special-goals-lambda').value) || 0;
    const cornersLambda = parseFloat($('#special-corners-lambda').value) || 0;
    const cardsLambda = parseFloat($('#special-cards-lambda').value) || 0;
    const sotLambda = parseFloat($('#special-sot-lambda').value) || 0;
    const penaltyOdd = parseFloat($('#special-penalty-odd').value) || 0;
    const redCardOdd = parseFloat($('#special-red-card-odd').value) || 0;

    const eventId = eventSelect.value;
    const event = allApiEvents.find(e => e.id == eventId);

    if (!event || goalsLambda <= 0 || cornersLambda <= 0 || cardsLambda <= 0) {
        alert("Molimo Vas izaberite meč i proverite da li su unete validne očekivane vrednosti.");
        return [];
    }
    
    const homeTeam = event.home.name;
    const awayTeam = event.away.name;

    const createSpecialBet = (m2, m3, prob) => {
        if (prob <= 0 || prob >= 1) return;
        const rawOdd = probToOdd(prob);
        const finalOdd = applyMarginToOdd(rawOdd, margin);
        results.push({ player: 'Specijal', market2: m2, market3: m3, odd: formatOdd(finalOdd) });
    };
    
    const p_gg = (parseFloat($('#special-gg-prob').value) / 100) || (1 - Math.exp(-goalsLambda * 0.35));
    const p_3plus_goals = event.prob_3plus_goals || probOver(goalsLambda, 2);
    const p_under_4_goals = probUnder(goalsLambda, 4);
    const p_3plus_cards = probOver(cardsLambda, 2);
    const p_4plus_cards = probOver(cardsLambda, 3);
    const p_2plus_cards_team = probOver(cardsLambda / 2, 1);
    const p_1plus_card_team = probOver(cardsLambda / 2, 0);
    const p_8plus_corners = probOver(cornersLambda, 7);
    const p_9plus_corners = probOver(cornersLambda, 8);
    const p_10plus_corners = event.prob_10plus_corners || probOver(cornersLambda, 9);
    const p_12plus_corners = probOver(cornersLambda, 11);
    const p_15plus_corners = probOver(cornersLambda, 14);
    const p_3plus_corners_half = probOver(cornersLambda * 0.45, 2) * probOver(cornersLambda * 0.55, 2);
    const p_9plus_sot = probOver(sotLambda, 8);
    const p_11plus_sot = probOver(sotLambda, 10);
    const p_penal = oddToProb(penaltyOdd);
    const p_red = oddToProb(redCardOdd);
    const lambdaPerMin = goalsLambda / 90;

    const prob_sub_goal = 1 - Math.exp(-goalsLambda * 0.15);
    const prob_header_goal = 1 - Math.exp(-goalsLambda * 0.17);
    const prob_outside_box_goal = 1 - Math.exp(-goalsLambda * 0.12);
    const prob_free_kick_goal = 1 - Math.exp(-goalsLambda * 0.05);
    const prob_injury_1h = 1 - Math.exp(-lambdaPerMin * 3);
    const prob_injury_2h = 1 - Math.exp(-lambdaPerMin * 6);

    createSpecialBet('Oba tima 2+ kartona', '', p_2plus_cards_team * p_2plus_cards_team);
    createSpecialBet('Penal i crveni karton', '', calculateCorrelatedProbability(p_penal, p_red, 1.1));
    createSpecialBet('Penal ili crveni karton', '', p_penal + p_red - (p_penal * p_red));
    createSpecialBet('Manje od 4 gola', 'i uk. 3+ kartona', p_under_4_goals * p_3plus_cards);
    createSpecialBet('11+ suteva u okvir', 'i GG', calculateCorrelatedProbability(p_11plus_sot, p_gg, 1.2));
    createSpecialBet('9+ suteva u okvir', 'i GG', calculateCorrelatedProbability(p_9plus_sot, p_gg, 1.2));
    createSpecialBet('Oba tima 1+ kartona', 'i GG', (p_1plus_card_team * p_1plus_card_team) * p_gg);
    createSpecialBet('10+ suteva u okvir', 'i 3+ golova', calculateCorrelatedProbability(probOver(sotLambda, 9), p_3plus_goals, 1.3));
    createSpecialBet('3+ golova', 'i 10+ kornera', p_3plus_goals * p_10plus_corners);
    createSpecialBet('3+ golova', 'i 4+ kartona', p_3plus_goals * p_4plus_cards);
    createSpecialBet(`${homeTeam} pobedjuje`, 'posle penala', 0.1);
    createSpecialBet(`${awayTeam} pobedjuje`, 'posle penala', 0.1);
    createSpecialBet('10+ kornera', 'i GG', p_10plus_corners * p_gg);
    createSpecialBet('15+ kornera', 'i GG', p_15plus_corners * p_gg);
    createSpecialBet('15+ kornera', 'i 3+ golova', p_15plus_corners * p_3plus_goals);
    createSpecialBet('3+ kornera', 'u svakom pol.', p_3plus_corners_half);
    createSpecialBet('Sudija gleda VAR', '', 0.4);
    createSpecialBet('Precka ili stativa', 'na mecu', 0.5);
    createSpecialBet('Dosudjen penal', 'za oba tima', (p_penal/2) * (p_penal/2));
    
    createSpecialBet('Gol u nadoknadi', '2. pol.', prob_injury_2h);
    createSpecialBet('Gol u nadoknadi', '1. pol.', prob_injury_1h);
    createSpecialBet('Izmena postize gol', '', prob_sub_goal);
    createSpecialBet('Gol iz slobodnog udarca', '', prob_free_kick_goal);
    createSpecialBet('Gol izvan 16m', '', prob_outside_box_goal);
    createSpecialBet('Gol glavom na mecu', '', prob_header_goal);

    const p_4plus_corners_team = probOver(cornersLambda / 2, 3);
    const p_3plus_corners_team = probOver(cornersLambda / 2, 2);

    createSpecialBet('GG', 'i 8+ kornera', p_gg * p_8plus_corners);
    createSpecialBet('3+ golova', 'i 8+ kornera', p_3plus_goals * p_8plus_corners);
    createSpecialBet('GG', 'i 3+ kartona i 9+ kornera', p_gg * p_3plus_cards * p_9plus_corners);
    createSpecialBet('3+ golova', 'i 3+ kartona i 9+ kornera', p_3plus_goals * p_3plus_cards * p_9plus_corners);
    createSpecialBet('GG', 'i oba tima 4+ kornera', p_gg * p_4plus_corners_team * p_4plus_corners_team);
    createSpecialBet('GG', 'i oba tima 3+ kornera', p_gg * p_3plus_corners_team * p_3plus_corners_team);
    createSpecialBet('GG', 'i 4+ kartona i 9+ kornera', p_gg * p_4plus_cards * p_9plus_corners);
    createSpecialBet('GG', 'i 12+ kornera', p_gg * p_12plus_corners);

    return results;
};

const updatePreviewTable = (data) => {
    previewTableBody.innerHTML = '';
    const eventId = eventSelect.value;
    const event = allApiEvents.find(e => e.id == eventId);

    if (data.length === 0) {
        previewSection.classList.add('hidden');
        return;
    }

    const csvDatetimeValue = $('#csv-datetime-value');
    const dateVal = $('#kickoff-date').value;
    const timeVal = $('#kickoff-time').value;
    let date, time;

    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        date = `${d}.${m}.${y}`;
    } else {
        const now = new Date();
        date = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    }
    
    time = timeVal || get24hTime(new Date());

    if(csvDatetimeValue) {
        csvDatetimeValue.textContent = `${date} ${time}`;
    }

     if (currentTab === 'players') {
        $('#preview-match-name').textContent = event ? event.name : 'Igrači';
        $('#csv-match-name').value = $('#match-name').value || 'MATCH';
        $('#csv-league-name').placeholder = 'LEAGUE_NAME (Ime Igrača)';
        $('#csv-league-name').value = '';
    } else {
        $('#preview-match-name').textContent = event ? event.name : 'Specijal';
        $('#csv-match-name').value = 'XTip Specijal';
        $('#csv-league-name').value = event ? event.name : 'Izabrani Meč';
        $('#csv-league-name').placeholder = 'LEAGUE_NAME (Ime Meča)';
    }

    data.sort((a,b) => a.player.localeCompare(b.player) || (a.market2+a.market3).localeCompare(b.market2+b.market3))
        .forEach((item) => {
            const row = previewTableBody.insertRow();
            row.className = 'bg-white even:bg-slate-50';
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">${item.player}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">${item.market2}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${item.market3}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <input type="number" class="editable-odd" step="0.01" value="${item.odd}" />
                </td>
                <td class="px-4 py-4 text-center">
                    <button type="button" class="remove-preview-row" title="Ukloni ovu kvotu iz CSV-a">&times;</button>
                </td>
            `;
    });
    previewSection.classList.remove('hidden');
};

const downloadCSV = () => {
    const visibleRows = previewTableBody.querySelectorAll('tr');
    if (visibleRows.length === 0) {
        alert("Nema podataka za generisanje CSV fajla.");
        return;
    }

    const header = "Datum,Vreme,Sifra,Domacin,Gost,1,X,2,GR,U,O,Yes,No\r\n";
    let csvContent = header;
    
    const dateVal = $('#kickoff-date').value;
    const timeVal = $('#kickoff-time').value;
    let date, time;

    if (dateVal) {
        const [y, m, d] = dateVal.split('-');
        date = `${d}.${m}.${y}`;
    } else {
        const now = new Date();
        date = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    }
    
    time = timeVal || get24hTime(new Date());

    const matchName = $('#csv-match-name').value;
    const leagueName = $('#csv-league-name').value;

    if (currentTab === 'specials') {
        csvContent += [`MATCH_NAME:${matchName}`, '', '', '', '', '', '', '', '', '', '', '', ''].join(',') + '\r\n';
        csvContent += [`LEAGUE_NAME:${leagueName}`, '', '', '', '', '', '', '', '', '', '', '', ''].join(',') + '\r\n';
        
        visibleRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const market2 = cells[1].textContent;
            const market3 = cells[2].textContent;
            const odd = cells[3].querySelector('.editable-odd').value;
            const rowData = [ date, time, '', market2, market3, odd, '', '', '', '', '', '', '' ];
            csvContent += rowData.join(',') + '\r\n';
        });

    } else { 
        csvContent += [`MATCH_NAME:${matchName}`, '', '', '', '', '', '', '', '', '', '', '', ''].join(',') + '\r\n';
        
        const playerData = {};
        visibleRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const playerName = cells[0].textContent;
            if (!playerData[playerName]) {
                playerData[playerName] = [];
            }
            playerData[playerName].push({
                market2: cells[1].textContent,
                market3: cells[2].textContent,
                odd: cells[3].querySelector('.editable-odd').value,
            });
        });

        for (const playerName in playerData) {
            const leagueRow = [`LEAGUE_NAME:${playerName}`, '', '', '', '', '', '', '', '', '', '', '', ''].join(',');
            csvContent += leagueRow + '\r\n';
            
            playerData[playerName].forEach(item => {
                const rowData = [ date, time, '', item.market2, item.market3, item.odd, '', '', '', '', '', '', '' ];
                csvContent += rowData.join(',') + '\r\n';
            });
            csvContent += '\n';
        }
    }
    
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const fileName = matchName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_odds.csv';
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const resetForm = () => {
    $('#odds-form').reset();
    $('#specials-form').reset();
    
    playersContainer.innerHTML = '';
    playerCounter = 0;
    if(currentTab === 'players') addPlayer(); 
    previewSection.classList.add('hidden');
    teamFilter.value = '';
    apiPlayerAdder.classList.add('hidden');
    apiPlayerSelect.innerHTML = '';
    matchDetailsSection.classList.add('hidden');
    apiDataDisplay.classList.add('hidden');
    apiDataDisplay.querySelector('pre').textContent = '';
};

const addCustomSpecialBet = () => {
    const market2 = $('#custom-market2').value;
    const market3 = $('#custom-market3').value;
    const odd = $('#custom-odd').value;

    if (!market2 || !odd) {
        alert('Molimo Vas unesite bar Opis 1 i Kvotu.');
        return;
    }
    
    const row = previewTableBody.insertRow();
    row.className = 'bg-white even:bg-slate-50';
    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">Specijal</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">${market2}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${market3}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
            <input type="number" class="editable-odd" step="0.01" value="${odd}" />
        </td>
        <td class="px-4 py-4 text-center">
            <button type="button" class="remove-preview-row" title="Ukloni ovu kvotu iz CSV-a">&times;</button>
        </td>
    `;

    $('#custom-market2').value = '';
    $('#custom-market3').value = '';
    $('#custom-odd').value = '';
    previewSection.classList.remove('hidden');
};

function openTeamMapping() {
    window.open('/team-mapping.html', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
}

function startTour() {
    currentStep = 0;
    showStep(currentStep);
}

function endTour() {
    tourHighlight.classList.add('hidden');
    tourTooltip.classList.add('hidden');
}

function showStep(index) {
    const step = tourSteps[index];
    const targetElement = $(step.element);

    if (!targetElement || targetElement.offsetParent === null) {
        if (index < tourSteps.length - 1) {
            currentStep++;
            showStep(currentStep);
        } else {
            endTour();
        }
        return;
    }
    
    const rect = targetElement.getBoundingClientRect();
    
    tourHighlight.classList.remove('hidden');
    tourHighlight.style.width = `${rect.width + 8}px`;
    tourHighlight.style.height = `${rect.height + 8}px`;
    tourHighlight.style.top = `${rect.top - 4}px`;
    tourHighlight.style.left = `${rect.left - 4}px`;

    tourTitle.textContent = step.title;
    tourText.textContent = step.text;
    tourTooltip.classList.remove('hidden');
    
    tourTooltip.className = tourTooltip.className.replace(/arrow-\w+/g, '');
    tourTooltip.classList.add(`arrow-${step.position}`);

    const tooltipRect = tourTooltip.getBoundingClientRect();

    switch (step.position) {
        case 'bottom':
            tourTooltip.style.top = `${rect.bottom + 15}px`;
            tourTooltip.style.left = `${rect.left + rect.width / 2 - tooltipRect.width / 2}px`;
            break;
        case 'top':
            tourTooltip.style.top = `${rect.top - tooltipRect.height - 15}px`;
            tourTooltip.style.left = `${rect.left + rect.width / 2 - tooltipRect.width / 2}px`;
            break;
        case 'right':
             tourTooltip.style.top = `${rect.top + rect.height / 2 - tooltipRect.height / 2}px`;
             tourTooltip.style.left = `${rect.right + 15}px`;
            break;
        case 'left':
             tourTooltip.style.top = `${rect.top + rect.height / 2 - tooltipRect.height / 2}px`;
             tourTooltip.style.left = `${rect.left - tooltipRect.width - 15}px`;
            break;
    }

    tourPrev.style.display = index === 0 ? 'none' : 'inline-block';
    tourNext.textContent = index === tourSteps.length - 1 ? 'Završi' : 'Dalje';
}

function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = element.querySelector("h3");
    if (header) { header.onmousedown = dragMouseDown; }

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

const findMarketLineAndLambda = (event, market, submarket) => {
    const selections = event.markets?.[market]?.submarkets?.[submarket]?.selections;
    if (!selections) return null;

    let bestLine = null;
    let minProbDiff = Infinity;
    const uniqueLines = [...new Set(selections.map(s => parseFloat(s.params.replace('total=', ''))))];

    for (const line of uniqueLines) {
        const overSelection = selections.find(s => s.outcome === 'over' && parseFloat(s.params.replace('total=', '')) === line);
        if (overSelection?.probability) {
            const diff = Math.abs(overSelection.probability - 0.5);
            if (diff < minProbDiff) {
                minProbDiff = diff;
                bestLine = line;
            }
        }
    }

    if (bestLine !== null) {
        const overSelection = selections.find(s => s.outcome === 'over' && parseFloat(s.params.replace('total=', '')) === bestLine);
        const probOver = oddToProb(overSelection.price);
        let lambda = 0;
        let minError = Infinity;
        for (let l = 0.1; l < 20; l += 0.05) {
            const p_over = 1 - poissonCDF(l, bestLine);
            const error = Math.abs(p_over - probOver);
            if (error < minError) {
                minError = error;
                lambda = l;
            }
        }
        return lambda;
    }
    return null;
};

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    $('#kickoff-date').value = now.toISOString().split('T')[0];
    $('#kickoff-time').value = get24hTime(now);
    
    window.injuryManager.initialize();
    window.lineupManager.initialize();
    fetchFbrefData();
    makeDraggable(tourTooltip);

    on(fetchApiBtn, 'click', fetchApiEvents);
    on(addPlayerBtn, 'click', () => playersContainer.appendChild(addPlayer()));
    on(resetBtn, 'click', resetForm);
    on(generateBtn, 'click', (e) => { 
        e.preventDefault(); 
        const btnText = $('#generate-btn-text');
        generateBtn.disabled = true;
        btnText.textContent = 'Računam...';
        setTimeout(() => {
            const generatedData = currentTab === 'players' ? calculatePlayerOdds() : calculateSpecialOdds();
            updatePreviewTable(generatedData);
            generateBtn.disabled = false;
            btnText.textContent = currentTab === 'players' ? 'Generiši Kvote' : 'Generiši Specijal Kvote';
        }, 50);
    });

    on(manualEntryBtn, 'click', () => {
        isManualMode = !isManualMode;
        apiInputs.classList.toggle('hidden', isManualMode);
        manualInputs.classList.toggle('hidden', !isManualMode);
        matchDetailsSection.classList.toggle('hidden', !isManualMode);
        manualEntryBtn.classList.toggle('primary', !isManualMode);
        manualEntryBtn.classList.toggle('secondary', isManualMode);
        manualEntryBtnText.textContent = isManualMode ? 'Izaberi Meč sa API-ja' : 'Dodaj Meč Ručno';
        if(isManualMode) updateTeamSelectFromManual();
    });

    on(manualHomeTeam, 'input', updateTeamSelectFromManual);
    on(manualAwayTeam, 'input', updateTeamSelectFromManual);

    tabButtons.forEach(button => {
        on(button, 'click', () => {
            currentTab = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => content.classList.remove('active'));
            $(`#tab-${currentTab}`).classList.add('active');
        });
    });

    on(competitionSelect, 'change', e => {
        const key = e.target.value;
        eventSelect.innerHTML = '<option value="">-- Izaberi Meč --</option>';
        if (!key) {
            eventSelect.disabled = true;
            return;
        }
        allApiEvents.filter(event => event.competitionKey === key)
            .sort((a,b) => new Date(a.cutoffTime) - new Date(b.cutoffTime))
            .forEach(event => {
                const option = document.createElement('option');
                option.value = event.id;
                option.textContent = event.name;
                eventSelect.appendChild(option);
            });
        eventSelect.disabled = false;
    });

    on(eventSelect, 'change', e => populateMatchData(e.target.value));

    on(teamSelect, 'change', e => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        $('#team-win-odd').value = selectedOption.dataset.odd || '';
        const teamName = selectedOption.textContent;
        const showInfo = teamName && e.target.value !== 'all';
        $('#team-injury-display').style.display = showInfo ? 'block' : 'none';
        $('#team-lineup-display').style.display = showInfo ? 'block' : 'none';
        if(showInfo) {
            window.injuryManager.displayInjuries(teamName, 'team-injury-display');
            window.lineupManager.displayLineup(teamName, 'team-lineup-display');
        }
    });

    on(addApiPlayerBtn, 'click', () => {
        const selectedPlayerName = apiPlayerSelect.value;
        if (!selectedPlayerName) return;
    
        const playerDataFromApi = availableApiPlayers.find(p => p.name === selectedPlayerName);
        const fbrefPlayer = allFbrefStats.find(p => p.Player.toLowerCase() === selectedPlayerName.toLowerCase());
    
        const initialData = {
            name: selectedPlayerName,
            teamSide: playerDataFromApi?.teamSide || 'unknown',
            goalscorerOdd: playerDataFromApi?.markets?.player_goal_scorer_anytime?.[0]?.price,
            ...(fbrefPlayer || {})
        };
        
        const playerCard = addPlayer(initialData);
        playersContainer.appendChild(playerCard);

        if (playerDataFromApi && playerDataFromApi.markets) {
            const oddsAPIToInternalMap = {
                'player_assists': 'asistencija',
                'player_to_receive_card': 'zuti-karton',
            };
    
            for (const [apiKey, internalKey] of Object.entries(oddsAPIToInternalMap)) {
                // For these markets, we expect one outcome (e.g., 'Yes' for card, or 'Over 0.5' for assist)
                const oddValue = playerDataFromApi.markets[apiKey]?.[0]?.price;
                if (oddValue) {
                    const input = playerCard.querySelector(`.player-base-odd[data-odd-type="${internalKey}"]`);
                    if (input) input.value = oddValue;
                }
            }
            
            const sotMarket = playerDataFromApi.markets['player_shots_on_target'];
            const sotOver05 = sotMarket?.find(o => o.name === 'Over' && o.point === 0.5);
            if (sotOver05) {
                const input = playerCard.querySelector('.player-base-odd[data-odd-type="sutevi-okvir-1"]');
                if (input) input.value = sotOver05.price;
            }

            const shotsMarket = playerDataFromApi.markets['player_shots'];
            const shotsContainer = playerCard.querySelector('.shots-lines-container');
            if (shotsMarket && shotsContainer) {
                shotsContainer.innerHTML = '';
                shotsMarket.filter(o => o.name === 'Over').forEach(outcome => {
                    const threshold = outcome.point + 0.5;
                    shotsContainer.insertAdjacentHTML('beforeend', createShotLineHTML(threshold, outcome.price, false));
                });
            }
        }
    });
    
    on(downloadCsvBtn, 'click', downloadCSV);
    on(playersContainer, 'input', e => { 
        if (e.target.classList.contains('player-name-search')) showAutocomplete(e.target);
        if (e.target.matches('.player-stat[data-stat="Sh_90"]')) populateStandardShotLines(e.target.closest('.player-card'));
    });
    on(document, 'click', e => {
         if (!e.target.closest('.player-name-search')) $$('.autocomplete-suggestions').forEach(s => s.classList.add('hidden'));
    });
    on(playersContainer, 'click', e => {
        const target = e.target.closest('button');
        if (!target) return;
        if (target.classList.contains('remove-player-btn')) target.closest('.player-card')?.remove();
        if (target.classList.contains('add-shot-line-btn')) target.previousElementSibling.insertAdjacentHTML('beforeend', createShotLineHTML('', '', true));
        if (target.classList.contains('calc-shot-btn')) calculateOddForLine(target);
        if (target.classList.contains('remove-shot-line-btn')) target.closest('.shot-line')?.remove();
        if (target.classList.contains('calc-btn')) calculateSingleBaseOdd(target);
    });
    on(previewTableBody, 'click', e => {
        if (e.target.closest('.remove-preview-row')) e.target.closest('tr').remove();
    });
    on(toggleApiDataBtn, 'click', () => apiDataDisplay.classList.toggle('hidden'));
    on(addCustomBetBtn, 'click', addCustomSpecialBet);
    on(startTourBtn, 'click', startTour);
    on(tourSkip, 'click', endTour);
    on(tourClose, 'click', endTour);
    on(tourNext, 'click', () => {
        if (currentStep < tourSteps.length - 1) {
            currentStep++;
            showStep(currentStep);
        } else endTour();
    });
    on(tourPrev, 'click', () => {
        if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
        }
    });
});

const populateEventSelect = (competitionKey) => {
    eventSelect.innerHTML = '<option value="">-- Izaberi Meč --</option>';
    teamSelect.innerHTML = '';
    teamSelect.disabled = true;
    apiPlayerAdder.classList.add('hidden');
    if (!competitionKey) {
        eventSelect.disabled = true;
        return;
    }
    const eventsInCompetition = allApiEvents.filter(e => e.competitionKey === competitionKey);
    eventsInCompetition
        .sort((a, b) => new Date(a.cutoffTime) - new Date(b.cutoffTime))
        .forEach(event => {
            if (event && event.home && event.away && event.home.name && event.away.name) {
                const option = document.createElement('option');
                option.value = event.id;
                option.textContent = `${event.home.name} vs ${event.away.name}`;
                eventSelect.appendChild(option);
            }
        });
    eventSelect.disabled = false;
};

const populateApiPlayerSelect = (players) => {
    apiPlayerSelect.innerHTML = '<option value="">-- Izaberi igrača --</option>';
    if (!players || players.length === 0) {
        apiPlayerAdder.classList.add('hidden');
        return;
    }

    players.sort((a, b) => a.name.localeCompare(b.name));

    players.forEach(player => {
        const option = document.createElement('option');
        option.value = player.name;
        
        let optionText = player.name;
        if (player.markets?.player_goal_scorer_anytime?.[0]?.price) {
            optionText += ` (${player.markets.player_goal_scorer_anytime[0].price})`;
        }
        option.textContent = optionText;
        option.dataset.teamSide = player.teamSide || 'unknown';
        apiPlayerSelect.appendChild(option);
    });
    apiPlayerAdder.classList.remove('hidden');
};

const populateMatchData = (eventId) => {
    resetForm();
    const event = allApiEvents.find(e => e.id == eventId);
    if (!event) {
        apiPlayerAdder.classList.add('hidden');
        return;
    }
    
    matchDetailsSection.classList.remove('hidden');
    const kickoff = new Date(event.cutoffTime);
    $('#kickoff-date').value = kickoff.toISOString().split('T')[0];
    $('#kickoff-time').value = get24hTime(kickoff);
    $('#match-name').value = event.name;

    teamSelect.innerHTML = `<option value="all">Svi Igrači</option>`;
    const matchOddsMarket = event.markets?.['soccer.match_odds']?.submarkets?.['period=ft']?.selections;
    if (matchOddsMarket) {
        const homeOdd = matchOddsMarket.find(s => s.outcome === 'home')?.price;
        const awayOdd = matchOddsMarket.find(s => s.outcome === 'away')?.price;
        teamSelect.innerHTML += `<option value="home" data-odd="${homeOdd || ''}">${event.home.name}</option>`;
        teamSelect.innerHTML += `<option value="away" data-odd="${awayOdd || ''}">${event.away.name}</option>`;
        $('#team-win-odd').value = homeOdd || '';
    }
    teamSelect.disabled = false;
    
    availableApiPlayers = [];
    if (event.source === 'Cloudbet') {
        const goalscorerSelections = event.markets?.['soccer.anytime_goalscorer']?.submarkets?.['period=ft']?.selections;
        if (goalscorerSelections) {
             goalscorerSelections.forEach(selection => {
                if (selection.status === 'SELECTION_ENABLED') {
                    const playerName = parsePlayerNameFromOutcome(selection.outcome);
                    const playerInfo = Object.values(event.players || {}).find(p => p.name === playerName);
                    availableApiPlayers.push({ 
                        name: playerName, 
                        markets: { 'player_goal_scorer_anytime': [{price: selection.price}] },
                        teamSide: playerInfo ? playerInfo.team.toLowerCase() : 'unknown' 
                    });
                }
             });
        }
    } else if (event.source === 'TheOddsAPI') {
        availableApiPlayers = event.playerProps || [];
    }
    populateApiPlayerSelect(availableApiPlayers);
    
    // --- Specijal Tab Population ---
    if (event.source === 'Cloudbet') {
        const goalsLambda = findMarketLineAndLambda(event, 'soccer.total_goals', 'period=ft');
        const cornersLambda = findMarketLineAndLambda(event, 'soccer.total_corners', 'period=ft_corners');
        const cardsLambda = findMarketLineAndLambda(event, 'soccer.totals.cards', 'period=ft');

        $('#special-goals-lambda').value = goalsLambda ? goalsLambda.toFixed(2) : '2.5';
        $('#special-corners-lambda').value = cornersLambda ? cornersLambda.toFixed(2) : '10.5';
        $('#special-cards-lambda').value = cardsLambda ? cardsLambda.toFixed(2) : '4.5';
    }
};

