export class MapProcessor {
    constructor() {}

    /**
     * Processes the DescriptiveMap data to create a single worldbook entry.
     * The content will be the JSON representation of the map data.
     * @param {object} descriptiveMap - The DescriptiveMap object from the slimmed GameState.
     * @returns {{name: string, content: string, keywords: Array<string>, options: object}}
     */
    process(descriptiveMap) {
        if (!descriptiveMap) {
            return null;
        }

        const keywords = new Set(['map', 'location', 'area', 'surroundings', '地图', '位置', '区域', '环境']);

        // Add specific feature labels as keywords
        descriptiveMap.NaturalFeatures?.forEach(feature => keywords.add(feature.Label));
        descriptiveMap.ManMadeAreas?.forEach(area => keywords.add(area.Label));

        return {
            name: `[World] Map Description`,
            content: JSON.stringify(descriptiveMap, null, 2),
            keywords: [...keywords],
            options: {
                enabled: true,
                strategy: { type: 'constant' } // This entry should always be active
            }
        };
    }
}