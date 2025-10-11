export class EventTranslator {
    constructor(config, language = 'zh') {
        this.config = config;
        this.translations = {
            zh: {
                timeHeader: (s, e, st, et) => s === e ? `【${s}，从 ${st} 到 ${et}】` : `【从 ${s} ${st} 到 ${e} ${et}】`,
                jobCompleted: (t, a, j) => a ? `${t}, ${a} 完成了 ${j}。` : `${t}, ${j} 已被完成。`,
                jobCompletedFallback: '一项工作',
                socialInteraction: (t, i, r) => `${t}, ${i} 和 ${r} 进行了一次社交互动。`,
                pawnDied: (t, v, k, w) => k ? `${t}, ${k} 使用 ${w} 杀死了 ${v}。` : `${t}, ${v} 因 ${w} 而死。`,
                pawnDiedFallbackWeapon: '未知原因',
                pawnBorn: (t, m, f, c) => m && c ? `${t}, ${m} ${f ? `和 ${f} ` : ''}的孩子, ${c}, 出生了。` : `${t}, 一个新生命诞生了。`,
                relationChanged: (t, s, o, n) => `${t}, ${s} 和 ${o} 的关系发生了变化，现在他们是 ${n}。`,
                healthChanged: (t, s, c, h) => `${t}, ${s} ${c === 'Gained' ? '患上了' : '从...中康复了'} ${h}。`,
                sexActFinished: (t, i, p, y) => `${t}, ${i} 和 ${p} 完成了一次 ${y} 类型的性行为。`,
                sexActFinishedFallback: '未知类型',
                impregnated: (t, m, f) => `${t}, ${m} 被 ${f || '未知来源'} 弄怀孕了。`,
                tradeCompleted: (t, n, r, d) => n ? `${t}, ${n} 与 ${r} 完成了一笔交易。${d ? ` ${d}。` : ''}` : `${t}, 与 ${r} 完成了一笔交易。${d ? ` ${d}。` : ''}`,
                tradeSold: (items) => `卖出了 ${items}`,
                tradeBought: (items) => `买入了 ${items}`,
                draftStatusChanged: (t, s, d) => `${t}, ${s} ${d ? '已被征召' : '解除了征召状态'}。`,
                groupLeftMap: (t, c, n, f) => `${t}, 来自 ${f} 的 ${n} (${c}人) 离开了地图。`,
                gravshipLaunch: (t, s, o, d, p) => `${t}, ${s} 从 ${o} 起飞，目的地是 ${d}。${p ? ` 乘客: ${p}。` : ''}`,
                gravshipLand: (t, s, d, p) => `${t}, ${s} 在 ${d} 着陆。${p ? ` 乘客: ${p}。` : ''}`,
                mapPrefix: (map) => `[${map}] `,
                atLocation: (loc) => ` 在 ${loc}`,
                defaultEvent: (t, e) => `${t}, 发生了 ${e} 事件。`,
                defaultEventWithDetails: (t, e, d) => `${t}, 发生了 **${e}** 事件:\n\`\`\`json\n${d}\n\`\`\``,
            },
            en: {
                timeHeader: (s, e, st, et) => s === e ? `[${s}, from ${st} to ${et}]` : `[From ${s} ${st} to ${e} ${et}]`,
                jobCompleted: (t, a, j) => a ? `${t}, ${a} finished ${j}.` : `${t}, ${j} has been completed.`,
                jobCompletedFallback: 'a job',
                socialInteraction: (t, i, r) => `${t}, ${i} and ${r} had a social interaction.`,
                pawnDied: (t, v, k, w) => k ? `${t}, ${k} killed ${v} with ${w}.` : `${t}, ${v} died from ${w}.`,
                pawnDiedFallbackWeapon: 'unknown causes',
                pawnBorn: (t, m, f, c) => m && c ? `${t}, ${c}, child of ${m} ${f ? `and ${f}` : ''}, was born.` : `${t}, a new life was born.`,
                relationChanged: (t, s, o, n) => `${t}, the relationship between ${s} and ${o} has changed. They are now ${n}.`,
                healthChanged: (t, s, c, h) => `${t}, ${s} ${c === 'Gained' ? 'has contracted' : 'has recovered from'} ${h}.`,
                sexActFinished: (t, i, p, y) => `${t}, ${i} and ${p} finished a sex act of type ${y}.`,
                sexActFinishedFallback: 'an unknown type',
                impregnated: (t, m, f) => `${t}, ${m} was impregnated by ${f || 'an unknown source'}.`,
                tradeCompleted: (t, n, r, d) => n ? `${t}, ${n} completed a trade with ${r}.${d ? ` ${d}.` : ''}` : `${t}, a trade was completed with ${r}.${d ? ` ${d}.` : ''}`,
                tradeSold: (items) => `Sold ${items}`,
                tradeBought: (items) => `Bought ${items}`,
                draftStatusChanged: (t, s, d) => `${t}, ${s} has been ${d ? 'drafted' : 'undrafted'}.`,
                groupLeftMap: (t, c, n, f) => `${t}, ${n} (${c} people) from ${f} have left the map.`,
                gravshipLaunch: (t, s, o, d, p) => `${t}, ${s} launched from ${o}, destination: ${d}.${p ? ` Passengers: ${p}.` : ''}`,
                gravshipLand: (t, s, d, p) => `${t}, ${s} landed at ${d}.${p ? ` Passengers: ${p}.` : ''}`,
                mapPrefix: (map) => `[${map}] `,
                atLocation: (loc) => ` at ${loc}`,
                defaultEvent: (t, e) => `${t}, a ${e} event occurred.`,
                defaultEventWithDetails: (t, e, d) => `${t}, a **${e}** event occurred:\n\`\`\`json\n${d}\n\`\`\``,
            }
        };
        this.setLanguage(language);
    }

    setLanguage(language) {
        this.language = language;
        this.T = this.translations[language] || this.translations.en;
    }

    translateSummary(summary, mainMapName) {
        if (!summary || !summary.events || summary.events.length === 0) {
            return '';
        }

        const { startDateString, endDateString, startTimeOfDay, endTimeOfDay } = summary;
        const timeHeader = this.T.timeHeader(startDateString, endDateString, startTimeOfDay, endTimeOfDay);

        let narrative = `${timeHeader}\n\n`;
        const translatedEvents = summary.events.map(event => this.translateSingleEvent(event, mainMapName)).filter(Boolean);
        narrative += translatedEvents.join('\n');

        return narrative;
    }

    _formatLocation(location) {
        if (!location) return '';
        let locStr = location.Room || location.Zone || location.OutdoorsLabel;
        if (locStr) {
            return this.T.atLocation(locStr);
        }
        return '';
    }

    translateSingleEvent(event, mainMapName) {
        if (!event || !event.Type) return null;

        const time = event.TimeOfDay || this.formatTime(event.Tick);
        const participants = event.Participants || [];
        const details = event.Details || {};
        const location = this._formatLocation(event.Location);
        const mapPrefix = (event.MapName && event.MapName !== mainMapName) ? this.T.mapPrefix(event.MapName) : '';

        const getPawn = (role) => participants.find(p => p.Role === role)?.PawnName;

        let translatedEvent = null;

        switch (event.Type) {
            case 'JobCompleted': {
                const actor = getPawn('executor');
                const jobName = details.JobName?.replace(/。$/, '') || this.T.jobCompletedFallback;
                translatedEvent = this.T.jobCompleted(time, actor, jobName);
                break;
            }
            case 'SocialInteraction': {
                const log = details.InteractionLog?.replace(/<color=#[^>]+>/g, '').replace(/<\/color>/g, '');
                if (log) {
                    translatedEvent = `${time}, ${log}`;
                } else {
                    const initiator = getPawn('initiator');
                    const recipient = getPawn('recipient');
                    if (initiator && recipient) translatedEvent = this.T.socialInteraction(time, initiator, recipient);
                }
                break;
            }
            case 'NotificationReceived': {
                 const content = details.Content || details.Label;
                 if (content) translatedEvent = `${time}, ${content}`;
                 break;
            }
            case 'PawnDied': {
                const victim = getPawn('victim');
                const killer = getPawn('killer');
                const weapon = details.Weapon || this.T.pawnDiedFallbackWeapon;
                if (victim) translatedEvent = this.T.pawnDied(time, victim, killer, weapon);
                break;
            }
            case 'PawnBorn': {
                const mother = getPawn('mother');
                const father = getPawn('father');
                const child = getPawn('child');
                translatedEvent = this.T.pawnBorn(time, mother, father, child);
                break;
            }
            case 'PawnRelationThresholdChanged': {
                const subject = getPawn('subject');
                const object = getPawn('object');
                if (subject && object) translatedEvent = this.T.relationChanged(time, subject, object, details.NewStatus);
                break;
            }
            case 'PawnHealthChanged': {
                const subject = getPawn('subject');
                if (subject) translatedEvent = this.T.healthChanged(time, subject, details.ChangeType, details.Hediff);
                break;
            }
            case 'SexActFinished': {
                const initiator = getPawn('Initiator');
                const partner = getPawn('Partner');
                const type = details.InteractionType || this.T.sexActFinishedFallback;
                if (initiator && partner) translatedEvent = this.T.sexActFinished(time, initiator, partner, type);
                break;
            }
             case 'PawnImpregnated': {
                const mother = getPawn('Subject');
                const father = getPawn('Object');
                if (mother) translatedEvent = this.T.impregnated(time, mother, father);
                break;
            }
            case 'TradeCompleted': {
                const negotiator = getPawn('Negotiator');
                const traderName = details.TraderName;
                const soldItems = details.TradedItems.filter(item => item.TradeAction === 'PlayerSells');
                const boughtItems = details.TradedItems.filter(item => item.TradeAction === 'PlayerBuys');
                let tradeParts = [];
                if (soldItems.length > 0) {
                    const soldStr = soldItems.map(item => `${item.ItemName} x${Math.abs(item.Count)}`).join(', ');
                    tradeParts.push(this.T.tradeSold(soldStr));
                }
                if (boughtItems.length > 0) {
                    const boughtStr = boughtItems.map(item => `${item.ItemName} x${item.Count}`).join(', ');
                    tradeParts.push(this.T.tradeBought(boughtStr));
                }
                const tradeDetails = tradeParts.join(', ');
                translatedEvent = this.T.tradeCompleted(time, negotiator, traderName, tradeDetails);
                break;
            }
            case 'PawnDraftStatusChanged': {
                const subject = getPawn('subject');
                if (subject) translatedEvent = this.T.draftStatusChanged(time, subject, details.IsDrafted);
                break;
            }
            case 'GroupLeftMap': {
                const { GroupName, FactionName, PawnCount } = details;
                if (GroupName && FactionName && PawnCount > 0) {
                    translatedEvent = this.T.groupLeftMap(time, PawnCount, GroupName, FactionName);
                }
                break;
            }
            case 'GravshipActivity': {
                const { ActivityType, ShipName, Origin, Destination, Passengers } = details;
                const passengerStr = Passengers?.join(', ');
                if (ActivityType === 'Launch') {
                    translatedEvent = this.T.gravshipLaunch(time, ShipName, Origin, Destination, passengerStr);
                } else if (ActivityType === 'Land') {
                    translatedEvent = this.T.gravshipLand(time, ShipName, Destination, passengerStr);
                }
                break;
            }
            default: {
                const detailsJson = JSON.stringify(details, null, 2);
                if (Object.keys(details).length === 0) {
                    translatedEvent = this.T.defaultEvent(time, event.Type);
                } else {
                    translatedEvent = this.T.defaultEventWithDetails(time, event.Type, detailsJson);
                }
                break;
            }
        }

        if (translatedEvent) {
            return mapPrefix + translatedEvent + location;
        }
        return null;
    }

    formatTime(tick) {
        const ticksPerDay = 60000;
        const hour = Math.floor((tick % ticksPerDay) / 2500);
        const minute = Math.floor(((tick % ticksPerDay) % 2500) / (2500 / 60));
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
}