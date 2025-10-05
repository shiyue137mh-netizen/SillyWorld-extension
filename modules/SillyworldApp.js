import { JsonProcessor } from './lore/JsonProcessor.js';
import { FactionProcessor } from './lore/FactionProcessor.js';
import { WorldbookDispatcher } from './lore/WorldbookDispatcher.js';
import { EventTranslator } from './EventTranslator.js';

function showStartupNotification(message, type = 'info', duration = 5000) {
    if (window.parent.toastr) {
        window.parent.toastr[type](message, 'Sillyworld Bridge', {
            timeOut: duration,
            extendedTimeOut: duration,
            progressBar: true,
        });
    } else {
        console.log(`[Sillyworld Notification / ${type}]: ${message}`);
    }
}

export class SillyworldApp {
    constructor() {
        // Functions from global scope
        this.sendMessageAsUser = window.parent.sendMessageAsUser;
        this.Generate = window.parent.Generate;

        this.config = {
            gamestateUrl: 'http://localhost:28080/gamestate',
            loreUrl: 'http://localhost:28080/lore',
            eventSocketUrl: 'ws://localhost:28081/events',
            pollIntervalMs: 5000,
            worldbookPrefix: '[Sillyworld] Data -',
            autoSendNarrative: false,
        };

        // New state management for multi-world/multi-timeline
        this.worlds = {}; // { worldId: { timelines: { timelineId: Timeline }, activeTimelineId: '...' } }
        this.activeWorldId = null;
        this.activeTimelineId = null;

        this._currentMode = 'simulation';
        this.socket = null;
        this.pollIntervalId = null;
        this._manualDisconnect = false;
        this.isChatReady = false;
        
        this.jsonProcessor = new JsonProcessor();
        this.factionProcessor = new FactionProcessor();
        this.language = localStorage.getItem('sillyworld_language') || 'zh';
        this.eventTranslator = new EventTranslator(this.config, this.language);
        
        this.initialize();
    }

    async initialize() {
        console.log('[Sillyworld] Initializing...');
        const context = window.parent.SillyTavern.getContext();
        this.TavernHelper = window.parent.TavernHelper;

        this.worldbookDispatcher = new WorldbookDispatcher({
            app: this,
            config: this.config,
            jsonProcessor: this.jsonProcessor,
            factionProcessor: this.factionProcessor,
        });

        await this.initUI();
        
        context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => this.onChatChanged());
        this.onChatChanged(); // Initial check
    }

    onChatChanged() {
        const context = window.parent.SillyTavern.getContext();
        const isChatActive = !!(context.characterId || context.groupId);

        if (isChatActive && !this.isChatReady) {
            console.log('[Sillyworld] Chat is active. Ready to connect.');
            this.isChatReady = true;
            this._handleModeChange();
        } else if (!isChatActive && this.isChatReady) {
            console.log('[Sillyworld] Chat is now inactive. Stopping all services.');
            this.isChatReady = false;
            this.stopAllServices();
        }
    }

    // ---- New Timeline and State Management ----

    _createTimeline(worldId, baseTimeline = null, forkTick = 0) {
        const newTimelineId = Date.now().toString();
        const newTimeline = {
            id: newTimelineId,
            worldId: worldId,
            events: [],
            chatFile: `${worldId}-${newTimelineId}.jsonl`,
            lastEventSendTick: 0,
            cachedGameState: null,
            lastGameStateString: null,
            narrativeToSend: '',
            lastNarrative: '',
        };

        if (baseTimeline) {
            // Fork from an existing timeline
            newTimeline.events = baseTimeline.events.filter(e => e.endTime <= forkTick);
            newTimeline.lastEventSendTick = newTimeline.events[newTimeline.events.length - 1]?.endTime || 0;
        }

        return newTimeline;
    }

    _getActiveTimeline() {
        if (!this.activeWorldId || !this.activeTimelineId) return null;
        return this.worlds[this.activeWorldId]?.timelines[this.activeTimelineId];
    }

    async _switchChat(timeline) {
        if (!timeline || !this.TavernHelper) return;

        try {
            console.log(`[Sillyworld] Saving current chat...`);
            await this.TavernHelper.saveChat();

            const groupId = `sillyworld_${timeline.worldId}`;
            const chatId = timeline.id;
            
            console.log(`[Sillyworld] Switching to group chat: GroupID=${groupId}, ChatID=${chatId}`);
            await this.TavernHelper.openGroupChat(groupId, chatId);
            console.log(`[Sillyworld] Successfully switched chat.`);

        } catch (error) {
            console.error('[Sillyworld] Failed to switch chat:', error);
            showStartupNotification('Failed to switch chat timeline.', 'error');
        }
    }

    _updateTimelineSelector() {
        const selector = window.parent.document.getElementById('sillyworld-timeline-select');
        if (!selector) return;

        selector.innerHTML = ''; // Clear existing options

        if (!this.activeWorldId || !this.worlds[this.activeWorldId]) {
            const option = document.createElement('option');
            option.textContent = 'No world loaded';
            selector.appendChild(option);
            return;
        }

        const world = this.worlds[this.activeWorldId];
        for (const timelineId in world.timelines) {
            const timeline = world.timelines[timelineId];
            const option = document.createElement('option');
            option.value = timeline.id;
            option.textContent = `Timeline ${timeline.id.substring(0, 5)}... (Tick: ${timeline.lastEventSendTick})`;
            if (timeline.id === this.activeTimelineId) {
                option.selected = true;
            }
            selector.appendChild(option);
        }
    }

    async initUI() {
        await this.loadPanelHtml();
        this.initPanel();
        this.createFloatingToggleButton();
    }

    async loadPanelHtml() {
        const body = window.parent.document.body;
        if (body.querySelector('#sillyworld-bridge-panel')) return;
        try {
            const scriptUrl = new URL(import.meta.url);
            const basePath = scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/modules'));
            const panelUrl = `${basePath}/panel.html`;
            const response = await fetch(panelUrl);
            if (!response.ok) throw new Error(`Failed to fetch panel.html: ${response.statusText}`);
            const panelHtml = await response.text();
            body.insertAdjacentHTML('beforeend', panelHtml);
            console.log('[Sillyworld] Panel HTML loaded.');
        } catch (error) {
            console.error('[Sillyworld] CRITICAL: Failed to load panel HTML.', error);
        }
    }

    createFloatingToggleButton() {
        const body = window.parent.document.body;
        if (body.querySelector('#sillyworld-toggle-button')) return;
        const button = document.createElement('div');
        button.id = 'sillyworld-toggle-button';
        button.innerHTML = '<i class="fa-solid fa-globe"></i>';
        button.addEventListener('click', () => {
            const panel = window.parent.document.getElementById('sillyworld-bridge-panel');
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        body.appendChild(button);
        console.log('[Sillyworld] Floating toggle button created.');
    }

    initPanel() {
        const panel = window.parent.document.getElementById('sillyworld-bridge-panel');
        if (!panel) {
            console.error('[Sillyworld] Panel element not found during initPanel.');
            return;
        }

        // Common
        panel.querySelector('.sillyworld-bridge-close').addEventListener('click', () => panel.style.display = 'none');
        panel.querySelector('#sillyworld-mode-select').addEventListener('change', (event) => {
            this._currentMode = event.target.value;
            this._handleModeChange();
        });
        const langSelect = panel.querySelector('#sillyworld-language-select');
        langSelect.value = this.language;
        langSelect.addEventListener('change', (event) => {
            this.language = event.target.value;
            localStorage.setItem('sillyworld_language', this.language);
            this.eventTranslator.setLanguage(this.language);
            showStartupNotification(`Language set to ${this.language === 'zh' ? '中文' : 'English'}.`, 'info');
        });

        // Simulation
        panel.querySelector('#sillyworld-connect-button').addEventListener('click', () => this.startAllServices());
        panel.querySelector('#sillyworld-create-worldbook').addEventListener('click', () => {
            const activeTimeline = this._getActiveTimeline();
            if (activeTimeline) {
                this.ensureWorldbook(`${this.config.worldbookPrefix} ${activeTimeline.worldId}`);
            } else {
                showStartupNotification('No active world to create a worldbook for.', 'warning');
            }
        });
        panel.querySelector('#sillyworld-update-worldbook').addEventListener('click', () => this.manualUpdateWorldbook());
        panel.querySelector('#sillyworld-switch-timeline').addEventListener('click', () => this._onSwitchTimelineClicked());
        panel.querySelector('#sillyworld-send-narrative').addEventListener('click', () => this.sendNarrativeAsTrigger());
        panel.querySelector('#sillyworld-copy-narrative').addEventListener('click', () => this.copyToClipboard(panel.querySelector('#sillyworld-narrative-display').value, 'Narrative'));
        panel.querySelector('#sillyworld-auto-send').addEventListener('change', (event) => {
            this.config.autoSendNarrative = event.target.checked;
            showStartupNotification(`Auto-send ${this.config.autoSendNarrative ? 'enabled' : 'disabled'}.`, 'info');
        });

        // Story
        panel.querySelector('#sillyworld-generate-lore').addEventListener('click', () => this._fetchLore());
        panel.querySelector('#sillyworld-copy-lore').addEventListener('click', () => this.copyToClipboard(panel.querySelector('#sillyworld-lore-display').value, 'Lore'));
        
        console.log('[Sillyworld] Panel event listeners initialized.');
    }

    _handleModeChange() {
        const panel = window.parent.document.getElementById('sillyworld-bridge-panel');
        if (!panel) return;

        const simContainer = panel.querySelector('#sillyworld-simulation-mode-container');
        const storyContainer = panel.querySelector('#sillyworld-story-mode-container');

        this.stopAllServices();

        if (this._currentMode === 'simulation') {
            simContainer.style.display = 'block';
            storyContainer.style.display = 'none';
            if (this.isChatReady) {
                this.startAllServices();
            }
        } else {
            simContainer.style.display = 'none';
            storyContainer.style.display = 'block';
        }
        console.log(`[Sillyworld] Switched to ${this._currentMode} mode.`);
    }

    startAllServices() {
        if (!this.isChatReady) {
            showStartupNotification('Chat is not active. Please open a character chat first.', 'warning');
            return;
        }
        console.log('[Sillyworld] Starting all simulation services...');
        showStartupNotification('Connecting to RimWorld...', 'info');
        this.startPolling();
        this.connectWebSocket();
    }

    stopAllServices() {
        console.log('[Sillyworld] Stopping all simulation services...');
        this.stopPolling();
        if (this.socket) {
            this._manualDisconnect = true;
            this.socket.close();
        }
    }
    
    startPolling() {
        this.stopPolling();
        console.log('[Sillyworld] Starting GameState polling...');
        this.fetchGameState(true); // Initial fetch
        this.pollIntervalId = setInterval(() => this.fetchGameState(false), this.config.pollIntervalMs);
    }

    stopPolling() {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
            console.log('[Sillyworld] GameState polling stopped.');
        }
    }

    async fetchGameState(isInitial = false) {
        const activeTimeline = this._getActiveTimeline();
        if (!activeTimeline) {
            // Don't show an error, just wait for a SAVE_LOADED event to create a timeline.
            console.log('[Sillyworld] No active timeline, skipping gamestate fetch.');
            return;
        }

        console.log('[Sillyworld] Attempting to fetch game state...');
        try {
            const url = new URL(this.config.gamestateUrl);
            url.searchParams.append('lang', this.language);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const dataString = JSON.stringify(data);

            if (activeTimeline.lastGameStateString === dataString) {
                return;
            }
            
            console.log('[Sillyworld] Game state fetched successfully.');
            activeTimeline.cachedGameState = data;
            activeTimeline.lastGameStateString = dataString;
            
            const display = window.parent.document.getElementById('sillyworld-gamestate-display');
            if (display) display.textContent = JSON.stringify(data, null, 2);

            // Automatically update the worldbook on every successful fetch in simulation mode
            if (this._currentMode === 'simulation') {
                await this.updateWorldbook(data);
            }
        } catch (error) {
            console.error("[Sillyworld] fetchGameState failed.", error);
            // Don't show a popup for fetch errors, they are common if the game isn't running.
            // showStartupNotification(`Failed to fetch game state: ${error.message}`, 'error');
        }
    }

    async ensureWorldbook(worldbookName) {
        if (!worldbookName) {
            showStartupNotification('Cannot ensure worldbook without a name.', 'error');
            return;
        }
        console.log(`[Sillyworld] Ensuring worldbook "${worldbookName}" exists and is bound...`);
        
        try {
            const allWorldbookNames = this.TavernHelper.getWorldbookNames();
            if (!allWorldbookNames.includes(worldbookName)) {
                await this.TavernHelper.createWorldbook(worldbookName);
                showStartupNotification(`Created worldbook: ${worldbookName}`, 'success');
            }
            const charBindings = this.TavernHelper.getCharWorldbookNames('current');
            const allBoundBooks = [...(charBindings.additional || []), charBindings.primary].filter(Boolean);
            if (!allBoundBooks.includes(worldbookName)) {
                charBindings.additional.push(worldbookName);
                await this.TavernHelper.rebindCharWorldbooks('current', charBindings);
                showStartupNotification(`Bound worldbook: ${worldbookName}`, 'success');
            } else {
                showStartupNotification(`Worldbook "${worldbookName}" is ready.`, 'info');
            }
        } catch (error) {
            console.error('[Sillyworld] Error in ensureWorldbook:', error);
            showStartupNotification(`Failed to ensure worldbook: ${error.message}`, 'error');
        }
    }

    async manualUpdateWorldbook() {
        const activeTimeline = this._getActiveTimeline();
        if (!activeTimeline || !activeTimeline.cachedGameState) {
            showStartupNotification('No cached game state on active timeline. Please connect to the game first.', 'warning');
            return;
        }
        console.log('[Sillyworld] Manual worldbook update triggered.');
        await this.updateWorldbook(activeTimeline.cachedGameState);
    }

    async updateWorldbook(gameState) {
        const activeTimeline = this._getActiveTimeline();
        if (!activeTimeline) {
            console.error('[Sillyworld] Cannot update worldbook, no active timeline.');
            return;
        }
        if (!gameState) {
            console.warn('[Sillyworld] updateWorldbook called with null gameState.');
            return;
        }
        
        const worldbookName = `${this.config.worldbookPrefix} ${activeTimeline.worldId}`;
        console.log(`[Sillyworld] Updating worldbook "${worldbookName}" with new game state...`);
        
        await this.ensureWorldbook(worldbookName);
        await this.worldbookDispatcher.dispatch(gameState, worldbookName);
        showStartupNotification('Worldbook updated with latest game state.', 'success');
        console.log('[Sillyworld] Worldbook update dispatch complete.');
    }

    connectWebSocket() {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }
        
        console.log(`[Sillyworld] Attempting to connect to WebSocket at ${this.config.eventSocketUrl}`);
        this._manualDisconnect = false;
        this.socket = new WebSocket(this.config.eventSocketUrl);

        this.socket.onopen = () => {
            console.log('[Sillyworld] WebSocket connection established.');
            showStartupNotification('Event stream connected.', 'success');
        };

        this.socket.onmessage = (event) => {
            console.log('[Sillyworld] Raw event data received:', event.data);
            try {
                const eventData = JSON.parse(event.data);
                switch (eventData.event) {
                    case 'SAVE_LOADED':
                        this._handleSaveLoaded(eventData.payload);
                        break;
                    case 'TimePeriodSummary':
                        const activeTimeline = this._getActiveTimeline();
                        if (activeTimeline && eventData.payload) {
                            // The events are now part of the timeline object
                            activeTimeline.events.push(eventData.payload);
                            this.checkAndFlushEventBuffer(activeTimeline, eventData.payload.endTime);
                        }
                        break;
                }
            } catch (error) {
                console.error('Sillyworld Bridge: Error parsing WebSocket message.', error);
            }
        };

        this.socket.onclose = (event) => {
            if (this._manualDisconnect) {
                console.log('[Sillyworld] WebSocket closed by user.');
                return;
            }
            console.warn('[Sillyworld] WebSocket closed unexpectedly. Reconnecting in 5s...', event);
            setTimeout(() => {
                if (!this._manualDisconnect && this._currentMode === 'simulation' && this.isChatReady) {
                    this.connectWebSocket();
                }
            }, 5000);
        };

        this.socket.onerror = (error) => {
            console.error('[Sillyworld] WebSocket error:', error);
            showStartupNotification('Event stream connection error.', 'error');
        };
    }
    
    copyToClipboard(text, type) {
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                showStartupNotification(`${type} copied to clipboard!`, 'success');
            }, (err) => {
                console.error(`Could not copy ${type}: `, err);
            });
        } else {
            showStartupNotification(`No ${type} to copy.`, 'info');
        }
    }

    async _fetchLore() {
        const loreDisplay = window.parent.document.getElementById('sillyworld-lore-display');
        loreDisplay.value = '正在生成故事背景...';
        try {
            const url = new URL(this.config.loreUrl);
            url.searchParams.append('lang', this.language);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const loreData = await response.json();
            const markdown = this._formatLoreAsMarkdown(loreData);
            loreDisplay.value = markdown;
            showStartupNotification('故事背景已生成!', 'success');
        } catch (error) {
            console.error('Sillyworld Bridge: Failed to fetch lore.', error);
            loreDisplay.value = `错误: ${error.message}`;
            showStartupNotification('生成故事背景失败。', 'error');
        }
    }

    _formatLoreAsMarkdown(data) {
        if (!data) return '没有可用的故事数据。';
        let md = ``;
        if (data.Scenario) {
            md += `# ${data.Scenario.Name}\n`;
            md += `> ${data.Scenario.Summary.replace(/\n/g, '\n> ')}\n\n`;
        }
        if (data.Factions) {
            md += `## 主要派系\n\n`;
            data.Factions.forEach(f => {
                md += `### ${f.Name}\n`;
                md += `- **与玩家关系**: ${f.RelationToPlayer}\n`;
                if (f.LeaderName) md += `- **领袖**: ${f.LeaderName}\n`;
                if (f.PrimaryIdeoName) md += `- **主流思想**: ${f.PrimaryIdeoName}\n`;
                if (f.Description) md += `- **描述**: ${f.Description}\n`;
                md += `\n`;
            });
        }
        if (data.PlayerPawns) {
            md += `## 核心人物\n\n`;
            data.PlayerPawns.forEach(p => {
                md += `### ${p.FullName}\n`;
                md += `- **基本信息**: ${p.Gender}, ${p.Age}岁\n`;
                if (p.Appearance) {
                    md += `- **外观**: ${p.Appearance.HairColorLabel} ${p.Appearance.HairStyle}\n`;
                }
                if (p.Backstory?.Childhood) {
                    md += `- **童年**: ${p.Backstory.Childhood.Title}\n`;
                }
                if (p.Backstory?.Adulthood) {
                    md += `- **成年**: ${p.Backstory.Adulthood.Title}\n`;
                }
                if (p.Traits?.length > 0) {
                    md += `- **性格特质**: ${p.Traits.map(t => t.Label).join(', ')}\n`;
                }
                if (p.TopSkills?.length > 0) {
                    md += `- **核心技能**: ${p.TopSkills.map(s => `${s.Name} (${s.Level})`).join(', ')}\n`;
                }
                if (p.Relations?.length > 0) {
                    md += `- **人际关系**:\n`;
                    p.Relations.forEach(r => {
                        md += `  - 与 ${r.Name} 是 ${r.Type}\n`;
                    });
                }
                md += `\n`;
            });
        }
        return md;
    }
    
    async createOrUpdateEntry(entryName, content, options = {}) {
        const activeTimeline = this._getActiveTimeline();
        if (!activeTimeline) {
            console.error(`Sillyworld Bridge: No active timeline. Cannot create entry "${entryName}".`);
            return;
        }
        const worldbookName = `${this.config.worldbookPrefix} ${activeTimeline.worldId}`;

        const { keys = [], enabled = true, comment = '', position = { type: 'before_character_definition', order: 0 }, strategy } = options;
    
        try {
            const bookEntries = await this.TavernHelper.getWorldbook(worldbookName);
            const existingEntry = bookEntries.find(e => e.name === entryName);
    
            const finalStrategy = { type: 'selective', ...(strategy || {}) };
            if (finalStrategy.type === 'selective') {
                finalStrategy.keys = keys;
            } else {
                delete finalStrategy.keys;
            }
    
            if (existingEntry) {
                const needsUpdate = existingEntry.content !== content || existingEntry.enabled !== enabled || JSON.stringify(existingEntry.strategy) !== JSON.stringify(finalStrategy);
                if (!needsUpdate) return;

                await this.TavernHelper.updateWorldbookWith(worldbookName, entries => {
                    const entryToUpdate = entries.find(e => e.name === entryName);
                    if (entryToUpdate) {
                        Object.assign(entryToUpdate, { content, enabled, position, strategy: finalStrategy });
                        if (!entryToUpdate.recursion) entryToUpdate.recursion = {};
                        entryToUpdate.recursion.prevent_incoming = true;
                        entryToUpdate.recursion.prevent_outgoing = true;
                    }
                    return entries;
                });
            } else {
                const newEntry = { name: entryName, content, enabled, comment, strategy: finalStrategy, position, recursion: { prevent_incoming: true, prevent_outgoing: true } };
                await this.TavernHelper.createWorldbookEntries(worldbookName, [newEntry]);
            }
        } catch (error) {
            console.error(`Sillyworld Bridge: Failed to create/update entry "${entryName}" in "${worldbookName}":`, error);
        }
    }

    async _handleSaveLoaded(payload) {
        const { worldId, tick } = payload;
        console.log(`[Sillyworld] Received SAVE_LOADED event for world "${worldId}" at tick ${tick}.`);

        // 1. Ensure world exists
        if (!this.worlds[worldId]) {
            this.worlds[worldId] = { timelines: {}, activeTimelineId: null };
        }
        const world = this.worlds[worldId];

        // 2. Find best timeline or create a new one
        let bestTimeline = null;
        let minTickDiff = Infinity;

        for (const timelineId in world.timelines) {
            const timeline = world.timelines[timelineId];
            if (timeline.lastEventSendTick <= tick) {
                const diff = tick - timeline.lastEventSendTick;
                if (diff < minTickDiff) {
                    minTickDiff = diff;
                    bestTimeline = timeline;
                }
            }
        }

        let targetTimeline;
        if (bestTimeline && bestTimeline.lastEventSendTick === tick) {
            // Perfect match, continue this timeline
            console.log(`[Sillyworld] Found perfect timeline match: ${bestTimeline.id}`);
            targetTimeline = bestTimeline;
        } else if (bestTimeline) {
            // Fork from the best match
            console.log(`[Sillyworld] Forking new timeline from ${bestTimeline.id} at tick ${tick}.`);
            targetTimeline = this._createTimeline(worldId, bestTimeline, tick);
            world.timelines[targetTimeline.id] = targetTimeline;
        } else {
            // No suitable timeline, create a fresh one
            console.log(`[Sillyworld] No suitable timeline found. Creating a new one for world "${worldId}".`);
            targetTimeline = this._createTimeline(worldId);
            world.timelines[targetTimeline.id] = targetTimeline;
        }

        // 3. Set active world and timeline
        // No need to save here, _switchChat will handle it.

        this.activeWorldId = worldId;
        this.activeTimelineId = targetTimeline.id;
        world.activeTimelineId = targetTimeline.id;

        // 4. Switch chat file
        await this._switchChat(targetTimeline);
        showStartupNotification(`Switched to world "${worldId}" on timeline ${targetTimeline.id}.`, 'success');

        // 5. Update UI and fetch initial state
        this.fetchGameState(true);
        this._updateTimelineSelector();
    }

    async _onSwitchTimelineClicked() {
        const selector = window.parent.document.getElementById('sillyworld-timeline-select');
        const selectedTimelineId = selector.value;

        if (selectedTimelineId && selectedTimelineId !== this.activeTimelineId) {
            console.log(`[Sillyworld] Manually switching to timeline ${selectedTimelineId}`);
            const world = this.worlds[this.activeWorldId];
            const targetTimeline = world.timelines[selectedTimelineId];
            
            // No need to save here, _switchChat will handle it.

            this.activeTimelineId = targetTimeline.id;
            world.activeTimelineId = targetTimeline.id;

            await this._switchChat(targetTimeline);
            this._updateTimelineSelector();
            showStartupNotification(`Switched to timeline ${targetTimeline.id}.`, 'success');
        }
    }

    async sendNarrativeAsTrigger() {
        const activeTimeline = this._getActiveTimeline();
        if (!this.isChatReady || !activeTimeline) {
             showStartupNotification('Chat or active timeline is not ready.', 'warning');
            return;
        }
        const textToSend = activeTimeline.narrativeToSend;
        if (!textToSend) {
            showStartupNotification('No narrative to send.', 'info');
            return;
        }

        try {
            console.log(`[Sillyworld] Sending message as user and then triggering generation.`);
            await this.sendMessageAsUser(textToSend);
            await this.Generate('normal');
            showStartupNotification('Narrative sent successfully!', 'success');
            activeTimeline.narrativeToSend = '';
            activeTimeline.lastNarrative = '';
            const narrativeDisplay = window.parent.document.getElementById('sillyworld-narrative-display');
            if (narrativeDisplay) narrativeDisplay.value = '';
        } catch (error) {
            console.error('[Sillyworld] Failed to send narrative message or trigger AI.', error);
            showStartupNotification('Failed to send narrative.', 'error');
        }
    }

    checkAndFlushEventBuffer(timeline, summaryEndTime) {
        if (timeline.events.length === 0) return;
        
        const ticksPerHour = 2500;
        // Use a slightly larger interval to ensure it triggers reliably
        const flushIntervalTicks = (4 * ticksPerHour) - 100; 

        // The start time of the first event in the buffer
        const bufferStartTime = timeline.events[0].startTime;

        if (summaryEndTime > bufferStartTime + flushIntervalTicks) {
            this.flushEventBuffer(timeline, summaryEndTime);
        }
    }

    async flushEventBuffer(timeline, flushTick) {
        if (timeline.events.length === 0) return;

        console.log('[Sillyworld] Flushing event buffer. Fetching latest game state first...');
        await this.fetchGameState(false);
        
        console.log(`[Sillyworld] Flushing ${timeline.events.length} summaries for timeline ${timeline.id}.`);
        const translatedSummaries = timeline.events.map(summary => this.eventTranslator.translateSummary(summary));
        const finalMessage = translatedSummaries.join('\n\n');

        timeline.lastNarrative = finalMessage; 
        timeline.narrativeToSend = finalMessage; 

        const narrativeDisplay = window.parent.document.getElementById('sillyworld-narrative-display');
        if (narrativeDisplay) narrativeDisplay.value = timeline.narrativeToSend;
        
        // Clear the buffer and update the tick
        timeline.events = [];
        timeline.lastEventSendTick = flushTick;
        showStartupNotification('New narrative is ready to be sent.', 'info');

        if (this.config.autoSendNarrative) {
            this.sendNarrativeAsTrigger();
        }
    }
}
