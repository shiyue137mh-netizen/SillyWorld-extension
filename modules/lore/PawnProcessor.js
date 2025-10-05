export class PawnProcessor {
    constructor() {
        this.translationMap = {
            // RelationToPlayer
            'Hostile': '敌对',
            'Neutral': '中立',
            'Ally': '盟友',
            // MapRole
            'Colonist': '殖民者',
            'Prisoner': '囚犯',
            'Slave': '奴隶',
            'Trader': '商人',
            'Visitor': '访客',
            'Beggar': '乞讨者',
            'AllyInBattle': '援军',
            'Guard': '护卫',
            'Raider': '袭击者',
            'Kidnapper': '绑匪',
            'Thief': '小偷',
            'PrisonBreaker': '越狱者',
            'Rebel': '叛乱者',
            'RitualParticipant': '仪式参与者',
            'Defender': '防御者',
            'PassingBy': '过客',
        };
    }

    /**
     * Processes a single pawn's data to create a worldbook entry.
     * The content of the entry will be the pawn's JSON data.
     * @param {object} pawn - The pawn object from the slimmed GameState.
     * @returns {{name: string, content: string, keywords: Array<string>}}
     */
    process(pawn) {
        if (!pawn || !pawn.FullName) {
            return null;
        }

        const keywords = new Set();
        
        keywords.add(pawn.FullName);
        const firstName = pawn.FullName.split(' ')[0];
        if (firstName !== pawn.FullName) {
            keywords.add(firstName);
        }

        pawn.Traits?.forEach(trait => trait.Label && keywords.add(trait.Label));
        pawn.Skills?.forEach(skill => skill.Passion !== 'None' && keywords.add(skill.Name));
        if (pawn.Backstory?.Childhood?.Title) keywords.add(pawn.Backstory.Childhood.Title);
        if (pawn.Backstory?.Adulthood?.Title) keywords.add(pawn.Backstory.Adulthood.Title);
        if (pawn.IdeologyName) keywords.add(pawn.IdeologyName);
        if (pawn.XenotypeLabel) keywords.add(pawn.XenotypeLabel);
        if (pawn.FactionName) keywords.add(pawn.FactionName);
        
        // Add original and translated keywords
        if (pawn.MapRole) {
            keywords.add(pawn.MapRole);
            if (this.translationMap[pawn.MapRole]) {
                keywords.add(this.translationMap[pawn.MapRole]);
            }
        }
        if (pawn.RelationToPlayer) {
            keywords.add(pawn.RelationToPlayer);
            if (this.translationMap[pawn.RelationToPlayer]) {
                keywords.add(this.translationMap[pawn.RelationToPlayer]);
            }
        }

        return {
            name: `[Pawn] ${pawn.FullName}`,
            content: JSON.stringify(pawn, null, 2),
            keywords: [...keywords],
        };
    }
}