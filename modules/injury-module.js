export default class InjuryManager {
    constructor() {
        this.injuryData = null;
        this.teamMappings = {}; 
        this.isInitialized = false;
        this.lastUpdate = null;
        this.cacheTimeout = 15 * 60 * 1000;
    }

    async loadTeamMappings() {
        try {
            // Corrected Path
            const response = await fetch('/data/team-mappings.json');
            if (!response.ok) throw new Error('Failed to fetch local mappings');
            this.teamMappings = await response.json();
        } catch (error) {
            console.warn('Could not fetch local mappings for injuries, using empty fallback:', error);
            this.teamMappings = {};
        }
    }

    async initialize() {
        if (this.isInitialized) return;
        try {
            await this.loadTeamMappings();
            await this.loadInjuryData();
            this.addStyles();
            this.isInitialized = true;
            console.log(`✅ ${this.constructor.name} initialized`);
        } catch (error) {
            console.error(`❌ ${this.constructor.name} initialization failed:`, error);
        }
    }
    
    async loadInjuryData(forceRefresh = false) {
        if (!forceRefresh && this.injuryData && this.lastUpdate && (Date.now() - this.lastUpdate < this.cacheTimeout)) {
            return;
        }
        try {
            const response = await fetch('/api/injuries');
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            this.injuryData = await response.json();
            this.lastUpdate = Date.now();
            console.log('✅ Injury data loaded');
        } catch (error) {
            console.warn('⚠️ Could not load injury data:', error.message);
            this.injuryData = { "_metadata": { "source": "error" } };
        }
    }

    findCanonicalTeamName(searchName) {
        if (!searchName) return null;
        const normalized = searchName.trim().toLowerCase();
        
        for (const [canonical, aliases] of Object.entries(this.teamMappings)) {
            if (canonical.toLowerCase() === normalized) return canonical;
            if (aliases.some(alias => alias.toLowerCase() === normalized)) return canonical;
        }
        
        for (const [canonical, aliases] of Object.entries(this.teamMappings)) {
            const allNames = [canonical, ...aliases].map(name => name.toLowerCase());
            for (const name of allNames) {
                if (name.includes(normalized) || normalized.includes(name)) return canonical;
            }
        }
        return searchName;
    }

    getTeamInjuries(teamName) {
        if (!this.injuryData || !teamName) return [];
        const canonicalName = this.findCanonicalTeamName(teamName);
        const injuries = [];
        for (const [league, data] of Object.entries(this.injuryData)) {
            if (league.startsWith('_') || !Array.isArray(data)) continue;
            const teamInjuries = data.filter(player => {
                if (!player.team) return false;
                const playerCanonical = this.findCanonicalTeamName(player.team);
                return playerCanonical.toLowerCase() === canonicalName.toLowerCase();
            });
            injuries.push(...teamInjuries);
        }
        return injuries;
    }
    
    isPlayerInjured(playerName) {
        if (!this.injuryData || !playerName) return null;
        const normalizedPlayerName = playerName.trim().toLowerCase();
        for (const [league, injuries] of Object.entries(this.injuryData)) {
            if (league.startsWith('_') || !Array.isArray(injuries)) continue;
            const foundInjury = injuries.find(injury =>
                injury.player_name && injury.player_name.toLowerCase() === normalizedPlayerName
            );
            if (foundInjury) return foundInjury;
        }
        return null;
    }

    getInjurySeverity(injuryInfo) {
        if (!injuryInfo) return 'unknown';
        const info = injuryInfo.toLowerCase();
        if (info.match(/(long|serious|surgery|months|season|torn|rupture|fracture)/)) return 'severe';
        else if (info.match(/(minor|knock|days|bruise)/)) return 'minor';
        else if (info.match(/(doubt|test|fitness|assess)/)) return 'doubtful';
        return 'moderate';
    }

    createDetailedDisplay(teamName) {
        const injuries = this.getTeamInjuries(teamName);
        if (injuries.length === 0) {
            return `<div class="injury-panel safe"><div class="injury-header"><h4>✅ Team Status: Healthy</h4></div><p class="no-injuries">No injury concerns reported</p></div>`;
        }
        const injuryList = injuries.map(injury => `<div class="injury-card ${this.getInjurySeverity(injury.info)}"><div class="player-header"><span class="player-name">${injury.player_name}</span><span class="player-position">${injury.position}</span></div><div class="injury-info"><span class="injury-type">${injury.info}</span><span class="return-info">↩️ ${injury.expected_return !== 'N/A' ? injury.expected_return : 'Unknown'}</span></div></div>`).join('');
        return `<div class="injury-panel has-injuries"><div class="injury-header"><h4>🏥 Injury Report</h4></div><div class="injury-list">${injuryList}</div></div>`;
    }

    displayInjuries(teamName, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = this.createDetailedDisplay(teamName);
    }

    addStyles() {
        if (document.getElementById('injury-styles')) return;
        const styles = document.createElement('style');
        styles.id = 'injury-styles';
        styles.textContent = `
            .injury-panel { border-radius: 10px; padding: 20px; margin: 15px 0; border: 1px solid #e9ecef; }
            .injury-panel.safe { background: #d4edda; border-color: #c3e6cb; }
            .injury-panel.has-injuries { background: #f8d7da; border-color: #f5c6cb; }
            .injury-header h4 { margin: 0; color: #343a40; font-size: 18px; }
            .injury-list { max-height: 250px; overflow-y: auto; margin-top: 15px; }
            .injury-card { background: rgba(255,255,255,0.8); border-radius: 8px; padding: 12px; margin-bottom: 8px; border-left: 4px solid; }
            .injury-card.severe { border-left-color: #dc3545; }
            .injury-card.moderate { border-left-color: #fd7e14; }
            .injury-card.minor { border-left-color: #ffc107; }
            .injury-card.doubtful { border-left-color: #6f42c1; }
            .player-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
            .player-name { font-weight: 600; color: #212529; }
            .player-position { background: #e9ecef; padding: 2px 6px; border-radius: 10px; font-size: 11px; color: #6c757d; }
            .injury-info { display: flex; justify-content: space-between; font-size: 13px; }
            .injury-type { color: #721c24; } .return-info { color: #6c757d; }
            .no-injuries { text-align: center; color: #155724; font-weight: 500; }
        `;
        document.head.appendChild(styles);
    }
}

