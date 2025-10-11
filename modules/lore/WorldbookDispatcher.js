import { PawnProcessor } from './PawnProcessor.js';
import { MapProcessor } from './MapProcessor.js';

export class WorldbookDispatcher {
    constructor(dependencies) {
        this.app = dependencies.app;
        this.config = dependencies.config;
        this.jsonProcessor = dependencies.jsonProcessor;
        this.factionProcessor = dependencies.factionProcessor;
        this.pawnProcessor = new PawnProcessor();
        this.mapProcessor = new MapProcessor();
    }

    async dispatch(gameState, worldbookName) {
        if (!gameState) return;

        const { slimmedState, universalLorebook } = this.jsonProcessor.process(gameState);

        // --- Pawn Lifecycle Management (The final, robust solution) ---
        await this.synchronizePawnEntries(slimmedState, worldbookName);

        // --- Other Entries ---
        await this.processOverview(slimmedState);
        await this.processMapDescription(slimmedState.DescriptiveMap);
        await this.processMapEvents(slimmedState.Map);
        await this.processColonistRoster(slimmedState.PlayerPawns);
        await this.processPawnGroupRosters(slimmedState.Map?.PawnGroups);
        await this.processResearch(slimmedState.Research);
        await this.processAlerts(slimmedState.Alerts);
        await this.processAnomaly(slimmedState.Anomaly);
        await this.processGravship(slimmedState.Gravship);
        await this.processFactions(slimmedState.Factions, slimmedState.World);
        await this.processIdeologies(slimmedState.Ideologies);
        await this.processXenotypes(slimmedState.Xenotypes);
        await this.processQuests(slimmedState.Quests);
        await this.processTales(slimmedState.Tales);
        await this.processUniversalLorebook(universalLorebook);
    }

    async synchronizePawnEntries(state, worldbookName) {
        const allBookEntries = await this.app.TavernHelper.getWorldbook(worldbookName);
        const existingPawnEntries = allBookEntries.filter(entry => /^\[(Pawn|Hostile|Friendly)\]/.test(entry.name));
        const existingPawnMap = new Map(existingPawnEntries.map(e => [e.name, e]));

        const statePawns = new Map();
        (state.PlayerPawns || []).forEach(p => statePawns.set(p.FullName, { pawn: p, prefix: '[Pawn]' }));
        
        // New logic to include pawns from PawnGroups
        (state.Map?.PawnGroups || []).forEach(group => {
            (group.Members || []).forEach(p => {
                let prefix = '[Friendly]'; // Default prefix
                if (p.RelationToPlayer === 'Hostile') {
                    prefix = '[Hostile]';
                }
                statePawns.set(p.FullName, { pawn: p, prefix: prefix });
            });
        });

        const entriesToUpdate = [];
        const entriesToRemove = [];
        const entriesToCreate = [];

        // Process pawns present in the current game state
        for (const [fullName, { pawn, prefix }] of statePawns.entries()) {
            const desiredName = `${prefix} ${fullName}`;
            const entryData = this.pawnProcessor.process(pawn);
            if (!entryData) continue;

            // Check if an entry with the correct name already exists
            if (existingPawnMap.has(desiredName)) {
                entriesToUpdate.push({ name: desiredName, content: entryData.content, options: { keys: entryData.keywords, enabled: true } });
                existingPawnMap.delete(desiredName); // Mark as processed
            } else {
                // If not, check if an entry with a *different* prefix exists
                const oldEntry = existingPawnEntries.find(e => e.name.endsWith(fullName));
                if (oldEntry) {
                    console.log(`[Sillyworld] Pawn ${fullName} changed status. Deleting old entry "${oldEntry.name}".`);
                    entriesToRemove.push(oldEntry.name);
                    existingPawnMap.delete(oldEntry.name);
                }
                entriesToCreate.push({ name: desiredName, content: entryData.content, options: { keys: entryData.keywords, enabled: true } });
            }
        }

        // Process entries that existed but were not in the current game state
        for (const [name, entry] of existingPawnMap.entries()) {
            if (name.startsWith('[Hostile]')) {
                console.log(`[Sillyworld] Pruning stale hostile entry: ${name}`);
                entriesToRemove.push(name);
            } else {
                console.log(`[Sillyworld] Disabling off-map friendly/colonist entry: ${name}`);
                entriesToUpdate.push({ name: name, content: entry.content, options: { enabled: false } });
            }
        }

        // Perform batch operations
        if (entriesToRemove.length > 0) {
            await this.app.TavernHelper.removeWorldbookEntries(worldbookName, entriesToRemove);
        }
        for (const { name, content, options } of entriesToUpdate) {
            await this.app.createOrUpdateEntry(name, content, options);
        }
        for (const { name, content, options } of entriesToCreate) {
            await this.app.createOrUpdateEntry(name, content, options);
        }
    }

    // --- Other Processing Methods (Unchanged) ---

    async processUniversalLorebook(lorebookContent) {
        if (lorebookContent && lorebookContent.trim() !== '') {
            await this.app.createOrUpdateEntry('[World] Universal Lorebook', lorebookContent, {
                strategy: { type: 'constant' }
            });
        }
    }

    async processFactions(factions, world) {
        if (!factions) return;
        const factionEntries = this.factionProcessor.process(factions, world);
        for (const entry of factionEntries) {
            await this.app.createOrUpdateEntry(entry.name, entry.content, { keys: entry.keywords });
        }
    }
    
    async processMapDescription(descriptiveMap) {
        const entry = this.mapProcessor.process(descriptiveMap);
        if (entry) {
            await this.app.createOrUpdateEntry(entry.name, entry.content, entry.options);
        }
    }

    async processOverview(state) {
        const overview = {
            TimeOfDay: state.TimeOfDay,
            Storyteller: state.Storyteller,
            Scenario: state.Scenario,
            ColonyResources: state.Resources,
            MapInfo: { Biome: state.Map?.Biome, Weather: state.Map?.Weather, Temperature: state.Map?.Temperature },
            WorldInfo: { PlanetName: state.World?.PlanetName },
        };
        await this.app.createOrUpdateEntry('[World] Overview', JSON.stringify(overview, null, 2), {
            strategy: { type: 'constant' }
        });
    }

    async processColonistRoster(pawns) {
        const roster = {
            ColonistCount: pawns?.length ?? 0,
            Colonists: pawns?.map(p => p.FullName) ?? []
        };
        await this.app.createOrUpdateEntry('[World] Colonist Roster', JSON.stringify(roster, null, 2), {
            strategy: { type: 'constant' }
        });
    }

    async processPawnGroupRosters(pawnGroups) {
        const groupTypesToProcess = ['Trader', 'Visitor', 'Raider', 'AllyInBattle', 'Beggar', 'Guard'];
        const grouped = new Map();

        (pawnGroups || []).forEach(group => {
            if (!grouped.has(group.GroupName)) {
                grouped.set(group.GroupName, []);
            }
            grouped.get(group.GroupName).push(...(group.Members || []).map(p => p.FullName));
        });

        for (const type of groupTypesToProcess) {
            const members = grouped.get(type);
            const entryName = `[World] ${type} Roster`;
            let content;

            if (members && members.length > 0) {
                content = JSON.stringify({
                    Count: members.length,
                    Members: members
                }, null, 2);
            } else {
                content = JSON.stringify({ Count: 0, Members: [] }, null, 2);
            }
            
            await this.app.createOrUpdateEntry(entryName, content, {
                strategy: { type: 'constant' }
            });
        }
    }

    async processResearch(research) {
        if (!research) return;
        await this.app.createOrUpdateEntry('[World] Research', JSON.stringify(research, null, 2), {
            strategy: { type: 'constant' }
        });
    }
    
    async processAlerts(alerts) {
        const hasAlerts = alerts && alerts.length > 0;
        const content = hasAlerts ? JSON.stringify(alerts, null, 2) : "No active alerts.";
        await this.app.createOrUpdateEntry('[Colony] Active Alerts', content, {
            enabled: true,
            strategy: { type: 'constant' }
        });
    }

    async processIdeologies(ideologies) {
        if (!ideologies) return;
        for (const ideo of ideologies) {
            await this.app.createOrUpdateEntry(`[Ideo] ${ideo.Name}`, JSON.stringify(ideo, null, 2), {
                keys: [ideo.Name, ideo.Culture, ...(ideo.Memes || [])],
            });
        }
    }

    async processXenotypes(xenotypes) {
        if (!xenotypes) return;
        for (const xenotype of Object.values(xenotypes)) {
            await this.app.createOrUpdateEntry(`[Xenotype] ${xenotype.Label}`, JSON.stringify(xenotype, null, 2), {
                keys: [xenotype.Label]
            });
        }
    }

    async processQuests(quests) {
        if (!quests || quests.length === 0) {
            await this.app.createOrUpdateEntry('[World] Active Quests', "No active quests.", { enabled: true, strategy: { type: 'constant' } });
            return;
        }
        for (const quest of quests) {
            await this.app.createOrUpdateEntry(`[Quest] ${quest.Name}`, JSON.stringify(quest, null, 2), {
                enabled: true,
                strategy: { type: 'constant' }
            });
        }
    }

    async processTales(tales) {
        if (!tales) return;
        await this.app.createOrUpdateEntry('[World] Historical Tales', JSON.stringify(tales, null, 2), {
            enabled: true,
            strategy: { type: 'constant' }
        });
    }

    async processAnomaly(anomaly) {
        const content = anomaly && Object.keys(anomaly).length > 0 ? JSON.stringify(anomaly, null, 2) : "No anomaly data available.";
        await this.app.createOrUpdateEntry('[World] Anomaly', content, {
            enabled: true,
            strategy: { type: 'constant' }
        });
    }

    async processGravship(gravship) {
        const content = gravship && Object.keys(gravship).length > 0 ? JSON.stringify(gravship, null, 2) : "No gravship data available.";
        await this.app.createOrUpdateEntry('[World] Gravship', content, {
            enabled: true,
            strategy: { type: 'constant' }
        });
    }

    async processMapEvents(mapState) {
        const pawnGroups = mapState?.PawnGroups;
        if (!pawnGroups || !Array.isArray(pawnGroups) || pawnGroups.length === 0) {
            await this.app.createOrUpdateEntry('[World] Current Map Events', "The map is currently quiet. No major events are happening.", {
                enabled: true,
                strategy: { type: 'constant' }
            });
            return;
        }

        const events = pawnGroups.map(group => {
            const count = group.Members.length;
            const faction = group.FactionName || 'an unknown faction';
            const leaderText = group.LeaderName ? ` Their leader is ${group.LeaderName}.` : '';

            switch (group.GroupName) {
                case "Trader":
                    return `A trade caravan from ${faction} with ${count} members is visiting.${leaderText}`;
                case "Visitor":
                    return `A group of ${count} visitors from ${faction} are on the map.${leaderText}`;
                case "Raider":
                    return `A group of ${count} raiders from ${faction} are attacking.${leaderText}`;
                case "AllyInBattle":
                    return `${count} reinforcements from ${faction} have arrived to help.${leaderText}`;
                case "Beggar":
                    return `A group of ${count} beggars from ${faction} are asking for help.${leaderText}`;
                default:
                    return `A group of ${count} individuals from ${faction} of type '${group.GroupName}' are present.${leaderText}`;
            }
        });

        const content = events.join('\n');
        
        await this.app.createOrUpdateEntry('[World] Current Map Events', content, {
            enabled: true,
            strategy: { type: 'constant' }
        });
    }
}