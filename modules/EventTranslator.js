export class EventTranslator {
    constructor(config) {
        this.config = config;
    }

    translateSummary(summary) {
        if (!summary || !summary.events || summary.events.length === 0) {
            return '';
        }

        const { startDateString, endDateString, startTimeOfDay, endTimeOfDay } = summary;

        let timeHeader;
        if (startDateString === endDateString) {
            timeHeader = `【${startDateString}，从 ${startTimeOfDay} 到 ${endTimeOfDay}】`;
        } else {
            timeHeader = `【从 ${startDateString} ${startTimeOfDay} 到 ${endDateString} ${endTimeOfDay}】`;
        }

        let narrative = `${timeHeader}\n\n`;

        const translatedEvents = summary.events.map(event => this.translateSingleEvent(event)).filter(Boolean);
        narrative += translatedEvents.join('\n');

        return narrative;
    }

    translateSingleEvent(event) {
        if (!event || !event.Type) return null;

        const time = event.TimeOfDay || this.formatTime(event.Tick);
        const participants = event.Participants || [];
        const details = event.Details || {};

        const getPawn = (role) => participants.find(p => p.Role === role)?.PawnName;

        switch (event.Type) {
            case 'JobCompleted': {
                const actor = getPawn('executor');
                const jobName = details.JobName?.replace(/。$/, '') || '一项工作';
                if (actor) {
                    return `${time}, ${actor} 完成了 ${jobName}。`;
                }
                return `${time}, ${jobName} 已被完成。`;
            }
            case 'SocialInteraction': {
                const log = details.InteractionLog?.replace(/<color=#[^>]+>/g, '').replace(/<\/color>/g, '');
                if (log) {
                    return `${time}, ${log}`;
                }
                const initiator = getPawn('initiator');
                const recipient = getPawn('recipient');
                if (initiator && recipient) {
                    return `${time}, ${initiator} 和 ${recipient} 进行了一次社交互动。`;
                }
                return null;
            }
            case 'NotificationReceived': {
                 const content = details.Content || details.Label;
                 if (content) {
                    return `${time}, ${content}`;
                 }
                 return null; // Avoid generic "received a notification"
            }
            case 'PawnDied': {
                const victim = getPawn('victim');
                const killer = getPawn('killer');
                const weapon = details.Weapon || '未知原因';
                if (victim && killer) {
                    return `${time}, ${killer} 使用 ${weapon} 杀死了 ${victim}。`;
                } else if (victim) {
                    return `${time}, ${victim} 因 ${weapon} 而死。`;
                }
                return null;
            }
            case 'PawnBorn': {
                const mother = getPawn('mother');
                const father = getPawn('father');
                const child = getPawn('child');
                if (mother && child) {
                    return `${time}, ${mother} ${father ? `和 ${father} ` : ''}的孩子, ${child}, 出生了。`;
                }
                return `${time}, 一个新生命诞生了。`;
            }
            case 'PawnRelationThresholdChanged': {
                const subject = getPawn('subject');
                const object = getPawn('object');
                if (subject && object) {
                    return `${time}, ${subject} 和 ${object} 的关系发生了变化，现在他们是 ${details.NewStatus}。`;
                }
                return null;
            }
            case 'PawnHealthChanged': {
                const subject = getPawn('subject');
                if (subject) {
                    const change = details.ChangeType === 'Gained' ? '患上了' : '从...中康复了';
                    return `${time}, ${subject} ${change} ${details.Hediff}。`;
                }
                return null;
            }
            case 'SexActFinished': {
                const initiator = getPawn('Initiator');
                const partner = getPawn('Partner');
                const type = details.InteractionType || '未知类型';
                if (initiator && partner) {
                    return `${time}, ${initiator} 和 ${partner} 完成了一次 ${type} 类型的性行为。`;
                }
                return null;
            }
             case 'PawnImpregnated': {
                const mother = getPawn('Subject');
                const father = getPawn('Object');
                if (mother) {
                    return `${time}, ${mother} 被 ${father || '未知来源'} 弄怀孕了。`;
                }
                return null;
            }
            case 'TradeCompleted': {
                const negotiator = getPawn('Negotiator');
                const traderName = details.TraderName;

                const soldItems = details.TradedItems.filter(item => item.TradeAction === 'PlayerSells');
                const boughtItems = details.TradedItems.filter(item => item.TradeAction === 'PlayerBuys');

                let tradeParts = [];
                if (soldItems.length > 0) {
                    const soldStr = soldItems.map(item => `${item.ItemName} x${Math.abs(item.Count)}`).join('、');
                    tradeParts.push(`卖出了 ${soldStr}`);
                }
                if (boughtItems.length > 0) {
                    const boughtStr = boughtItems.map(item => `${item.ItemName} x${item.Count}`).join('、');
                    tradeParts.push(`买入了 ${boughtStr}`);
                }

                const tradeDetails = tradeParts.join('，');

                if (negotiator && traderName) {
                    return `${time}, ${negotiator} 与 ${traderName} 完成了一笔交易。${tradeDetails ? ` ${tradeDetails}。` : ''}`;
                }
                return `${time}, 与 ${traderName} 完成了一笔交易。${tradeDetails ? ` ${tradeDetails}。` : ''}`;
            }
            case 'PawnDraftStatusChanged': {
                const subject = getPawn('subject');
                if (subject) {
                    const status = details.IsDrafted ? '已被征召' : '解除了征召状态';
                    return `${time}, ${subject} ${status}。`;
                }
                return null;
            }
            default: {
                // For any unhandled event, format it as structured JSON to preserve all data.
                const detailsJson = JSON.stringify(details, null, 2);
                
                if (Object.keys(details).length === 0) {
                    return `${time}, 发生了 ${event.Type} 事件。`;
                }
                
                return `${time}, 发生了 **${event.Type}** 事件:\n\`\`\`json\n${detailsJson}\n\`\`\``;
            }
        }
    }

    formatTime(tick) {
        const ticksPerDay = 60000;
        const hour = Math.floor((tick % ticksPerDay) / 2500);
        const minute = Math.floor(((tick % ticksPerDay) % 2500) / (2500 / 60));
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
}