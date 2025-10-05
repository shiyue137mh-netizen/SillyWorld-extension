export class FactionProcessor {
    constructor() {}

    /**
     * Processes faction data to create faction entries.
     * It now expects the entire world object to find related settlements.
     * @param {Array<object>} factions - The array of faction objects.
     * @param {object} world - The World object from the GameState.
     * @returns {Array<object>} An array of processed faction entries, ready for the worldbook.
     */
    process(factions, world) {
        if (!factions || !Array.isArray(factions)) {
            return [];
        }

        return factions.map(faction => {
            // The faction object from the new GameState already contains its settlements.
            // We just need to ensure the format is clean for the worldbook.
            const entryContent = { ...faction };

            const keywords = new Set([faction.Name]);
            if (faction.LeaderName) {
                keywords.add(faction.LeaderName);
            }
            if (faction.Settlements) {
                faction.Settlements.forEach(s => keywords.add(s.Name));
            }

            return {
                name: `[Faction] ${faction.Name}`,
                content: JSON.stringify(entryContent, null, 2),
                keywords: [...keywords],
            };
        });
    }
}