export class JsonProcessor {
    constructor() {
        // Define the rules for slimming the JSON
        this.rules = {
            // Fields to completely remove from the final JSON
            fieldsToRemove: [
                'DefName', 'ModName', 'Type', 'GameTicks', 'Id', 'XenotypeName',
                'Beauty', 'AgeTicks', 'MoodEffect', 'Degree', 'Issue', 'Impact',
                'MassUsage', 'MassCapacity', 'PowerOutput', 'PowerConsumption',
                'IsFueled', 'Resistance', 'Will', 'Entropy', 'Psyfocus', 'BandwidthTotal',
                'BandwidthUsed', 'Learning', 'Favor',
                // Redundant or overly specific stats
                '阅读加成', '感染几率系数', '手术成功几率清洁系数',
                '研究速度系数', '扫墓娱乐系数', '食物有毒几率',
                '塑形舱速度系数', '工作速度系数'
            ],
            // Fields whose values are important keywords but the key-value pair itself can be removed
            fieldsToPromote: [],
            // Fields to truncate to a certain length
            fieldsToTruncate: {
                'Summary': 150,
            },
            // Keys for identifying unique items in an array to remove duplicates
            deduplicationKeys: {
                'Precepts': ['Label'],
                'ContainedBuildings': ['Name'],
                'PlayerPawns': ['FullName'],
                'HostilePawns': ['FullName'],
                'FriendlyPawns': ['FullName'],
                'Memes': [], // Simple string array deduplication
                'SpecialGenes': ['Label'],
                'Xenogenes': ['Label'],
            }
        };
    }

    /**
     * Processes the entire GameState object to slim it down.
     * @param {object} gameState The raw GameState object.
     * @returns {{slimmedState: object, keywords: Set<string>}}
     */
    process(gameState) {
        const keywords = new Set();
        // Create a deep copy to avoid modifying the original object
        const slimmedState = JSON.parse(JSON.stringify(gameState));

        const universalLorebook = slimmedState.UniversalLorebook;
        if (universalLorebook) {
            delete slimmedState.UniversalLorebook;
        }

        this.traverseAndSlim(slimmedState, keywords);

        return { slimmedState, keywords: [...keywords], universalLorebook };
    }

    /**
     * Recursively traverses an object or array and applies slimming rules.
     * @param {object|Array} currentObject The object or array to process.
     * @param {Set<string>} keywords The set to collect keywords in.
     */
    traverseAndSlim(currentObject, keywords) {
        if (currentObject === null || typeof currentObject !== 'object') {
            return;
        }

        if (Array.isArray(currentObject)) {
            for (let i = currentObject.length - 1; i >= 0; i--) {
                this.traverseAndSlim(currentObject[i], keywords);
                // If an object becomes empty after slimming, remove it from the array
                if (typeof currentObject[i] === 'object' && currentObject[i] !== null && Object.keys(currentObject[i]).length === 0) {
                    currentObject.splice(i, 1);
                }
            }
        } else {
            for (const key in currentObject) {
                if (Object.prototype.hasOwnProperty.call(currentObject, key)) {
                    if (this.rules.fieldsToRemove.includes(key)) {
                        delete currentObject[key];
                        continue;
                    }

                    if (this.rules.fieldsToPromote.includes(key)) {
                        if(currentObject[key]) keywords.add(currentObject[key]);
                        delete currentObject[key];
                        continue;
                    }
                    
                    if (this.rules.fieldsToTruncate[key] && typeof currentObject[key] === 'string') {
                        if (currentObject[key].length > this.rules.fieldsToTruncate[key]) {
                            currentObject[key] = currentObject[key].substring(0, this.rules.fieldsToTruncate[key]) + '...';
                        }
                    }

                    this.traverseAndSlim(currentObject[key], keywords);

                    // After recursing, check if the child object/array is now empty and remove it
                    const child = currentObject[key];
                    if (child !== null && typeof child === 'object' && Object.keys(child).length === 0) {
                        delete currentObject[key];
                    }
                }
            }
        }
    }

    /**
     * Removes duplicate objects from an array based on a set of key properties.
     * @param {Array<object>} array The array to deduplicate.
     * @param {Array<string>} uniqueKeys The keys to identify a unique object.
     * @returns {Array<object>} The deduplicated array.
     */
    deduplicateArray(array, uniqueKeys) {
        if (!uniqueKeys || uniqueKeys.length === 0) {
            // Simple deduplication for arrays of strings or numbers
            return [...new Set(array)];
        }
        const seen = new Set();
        return array.filter(item => {
            if (typeof item !== 'object' || item === null) return true;
            const identifier = uniqueKeys.map(key => item[key]).join('||');
            if (seen.has(identifier)) {
                return false;
            } else {
                seen.add(identifier);
                return true;
            }
        });
    }
}