/**
 * Lineup Display Module for Merkur Specijali
 * Integrates with /api/lineups endpoint and a local JSON for team data
 */

class LineupManager {
    constructor() {
        this.lineupData = null;
        this.teamMappings = {}; // Počinje prazno, učitava se sa servera
        this.isInitialized = false;
        this.lastUpdate = null;
        this.cacheTimeout = 15 * 60 * 1000; // 15 minutes cache
    }

    // Učitava mapiranja iz lokalnog JSON fajla
    async loadTeamMappings() {
        try {
            const response = await fetch('/team-mappings.json');
            if (!response.ok) throw new Error('Failed to fetch local mappings');
            const data = await response.json();
            this.teamMappings = data;
            return data;
        } catch (error) {
            console.warn('Could not fetch local mappings for lineups, using empty fallback:', error);
            this.teamMappings = {};
            return this.teamMappings;
        }
    }

    // Inicijalizacija modula
    async initialize() {
        if (this.isInitialized) return;
        try {
            await this.loadTeamMappings();
            await this.loadLineupData();
            this.addStyles();
            this.isInitialized = true;
            console.log(`✅ ${this.constructor.name} initialized with local mappings`);
        } catch (error) {
            console.error(`❌ ${this.constructor.name} initialization failed:`, error);
        }
    }

    // Load lineup data from API
    async loadLineupData(forceRefresh = false) {
        if (!forceRefresh && this.lineupData && this.lastUpdate && (Date.now() - this.lastUpdate < this.cacheTimeout)) {
            return this.lineupData;
        }

        try {
            const response = await fetch('/api/lineups');
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            this.lineupData = await response.json();
            this.lastUpdate = Date.now();
            console.log('✅ Lineup data loaded. Total lineups fetched:', this.lineupData.length);
            return this.lineupData;
        } catch (error) {
            console.error('⚠️ Could not load lineup data:', error.message);
            this.lineupData = []; // Reset on error
            return this.lineupData;
        }
    }

    // Find canonical team name
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

        return searchName; // Fallback na originalno ime
    }

    // Get lineup for a specific team
    getTeamLineup(teamName) {
        if (!this.lineupData || !teamName) return null;

        console.log(`[DEBUG] --------------------------------`);
        console.log(`[DEBUG] Attempting to find lineup for: "${teamName}"`);
        const canonicalName = this.findCanonicalTeamName(teamName);
        console.log(`[DEBUG] Input name resolved to canonical: "${canonicalName}"`);

        const foundLineup = this.lineupData.find(lineup => {
            const lineupCanonical = this.findCanonicalTeamName(lineup.team);
            // Detailed comparison log
            const isMatch = lineupCanonical.toLowerCase() === canonicalName.toLowerCase();
            if (isMatch) {
                console.log(`[DEBUG] ✅ MATCH FOUND: "${canonicalName}" vs "${lineup.team}" (resolved to "${lineupCanonical}")`);
            }
            return isMatch;
        });

        if (!foundLineup) {
            console.error(`[DEBUG] ❌ Lineup NOT FOUND for "${teamName}". No matches in the fetched data.`);
            console.log(`[DEBUG] Fetched team names were:`, this.lineupData.map(l => `"${l.team}"`));
        }
        console.log(`[DEBUG] --------------------------------`);
        return foundLineup;
    }

    // Create detailed display for lineup
    createDetailedDisplay(teamName) {
        const lineup = this.getTeamLineup(teamName);

        if (!lineup || !lineup.lineup) {
            return `
                <div class="lineup-panel not-found">
                    <div class="lineup-header"><h4>ℹ️ Moguća Postava</h4></div>
                    <p class="no-lineup">Postava za tim "${teamName}" nije pronađena.</p>
                </div>
            `;
        }

        const players = lineup.lineup.split(/;|,/).map(p => `<span class="player-tag">${p.trim()}</span>`).join('');

        return `
            <div class="lineup-panel found">
                <div class="lineup-header">
                    <h4>📋 Moguća Postava: ${lineup.team}</h4>
                    <a href="${lineup.source_url}" target="_blank" class="source-link">Izvor</a>
                </div>
                <div class="lineup-grid">${players}</div>
            </div>
        `;
    }

    // Display lineup in a container
    displayLineup(teamName, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`Lineup container ${containerId} not found`);
            return;
        }
        container.innerHTML = this.createDetailedDisplay(teamName);
    }

    // Add CSS styles for the lineup display
    addStyles() {
        if (document.getElementById('lineup-styles')) return;
        const styles = document.createElement('style');
        styles.id = 'lineup-styles';
        styles.textContent = `
            .lineup-panel { border-radius: 10px; padding: 15px; margin: 15px 0; border: 1px solid #e2e8f0; background: #f8fafc; }
            .lineup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
            .lineup-header h4 { margin: 0; color: #1e293b; font-size: 16px; font-weight: 600; }
            .source-link { font-size: 12px; color: #4f46e5; text-decoration: none; font-weight: 500; }
            .source-link:hover { text-decoration: underline; }
            .lineup-grid { display: flex; flex-wrap: wrap; gap: 8px; }
            .player-tag { background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 15px; font-size: 13px; font-weight: 500; }
            .no-lineup { text-align: center; color: #64748b; font-style: italic; }
        `;
        document.head.appendChild(styles);
    }
}

// Global instance
window.lineupManager = new LineupManager();

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.lineupManager.initialize();
});
