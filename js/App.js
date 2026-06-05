        // =========================================================================
        // Haptic & Visual Interaction Layer
        // =========================================================================
        var lastVibrateTime = 0;

        // Cooldown-safe vibration utility to prevent muddy double-vibrations
        function vibrate(ms = 10) {
            const now = Date.now();
            if (now - lastVibrateTime < 100) return;

            try {
                if (navigator.vibrate) {
                    navigator.vibrate(ms);
                    lastVibrateTime = now;
                }
            } catch (e) {
                // Fail silently on restricted or unsupported environments
            }
        }

        var haptics = {
            // Crisp mechanical micro-switch tick (subtle standard tap)
            tap: () => {
                vibrate(15);
            },
            // Heavier thud for core rolls or important actions
            thud: () => {
                vibrate(40);
            },
            // Error pattern (buzz, pause, buzz) for invalid states/warning/deletion
            error: () => {
                vibrate([45, 50, 45]);
            }
        };

        // Pointer event delegation for unified touch-target feedback
        document.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest('button, .btn-interactive, .segmented-btn, .menu-item, .gear-btn');
            if (!btn || btn.disabled || btn.classList.contains('cursor-default')) return;

            // 1. Add instant visual state compression
            btn.classList.add('is-pressed');

            // 2. Trigger tactile hardware haptics tailored by action context
            if (btn.id === 'roll-button') {
                haptics.thud();
            } else if (
                btn.id === 'clear-btn' ||
                btn.classList.contains('text-rose-500') ||
                btn.classList.contains('danger') ||
                btn.classList.contains('delete-btn-active')
            ) {
                haptics.error();
            } else {
                haptics.tap();
            }
        });

        // Safe release handler to reset visual active compression
        var handleGlobalRelease = () => {
            document.querySelectorAll('.is-pressed').forEach(el => el.classList.remove('is-pressed'));
        };
        document.addEventListener('pointerup', handleGlobalRelease);
        document.addEventListener('pointercancel', handleGlobalRelease);
        document.addEventListener('webkitmouseforcewillbegin', (e) => {
            e.preventDefault();
        });

        var engine = new DiceEngine();
        var pickerTargetId = null;
        var soundEnabled = true;
        var volume = 0.5;
        var headerHidden = false;
        var soundTimer = null;
        var isVolumeOpen = false;
        var isDraggingVolume = false;
        var rollSound = new Audio('Assets/353844__magnesus__dice8.flac');
        rollSound.volume = volume;

        var isModdedQuick = false;
        var isInstaQueue = 'Roll Only';
        var isArsenalQueue = 'Roll Only';
        var customDice = [];
        var stressCount = 100000;
        var activeLoadoutId = null;
        var chainTargetId = null;

        var isCharging = false;
        var chargeTimer;
        var activeChargeButton = null;

        // =========================================================================
        // CHARACTER & GROUP MANAGEMENT STATE
        // =========================================================================
        var campaigns = [{ id: 'default_campaign', name: 'Default Campaign' }];
        var activeCampaignId = 'default_campaign';
        var openTabs = ['default_campaign'];
        var characters = [{ id: 'primary', name: 'Primary Character', dndType: 'standard', campaignId: 'default_campaign' }];
        var groups = [
            { id: 'grp_stats_1', name: 'Stats', color: '#00d4ff', characterId: 'primary' },
            { id: 'grp_attacks_1', name: 'Attacks', color: '#ff003c', characterId: 'primary' },
            { id: 'grp_spells_1', name: 'Spells', color: '#a855f7', characterId: 'primary' },
            { id: 'grp_items_1', name: 'Items', color: '#ffea00', characterId: 'primary' }
        ];
        var activeCharacterId = 'primary';
        var activeGroupId = 'grp_stats_1';
        var templates = [];
        var showHiddenWidgets = localStorage.getItem('show_hidden_widgets') === 'true';

        function toggleShowHiddenWidgets() {
            showHiddenWidgets = !showHiddenWidgets;
            localStorage.setItem('show_hidden_widgets', showHiddenWidgets);
            updateShowHiddenWidgetsButton();
            renderSavedQueues();
            vibrate(5);
        }

        function updateShowHiddenWidgetsButton() {
            const btn = document.getElementById('toggle-show-hidden-btn');
            if (!btn) return;
            if (showHiddenWidgets) {
                btn.classList.add('text-[#00d4ff]', 'border-[#00d4ff]/30', 'bg-[#00d4ff]/10');
                btn.classList.remove('text-[#94a3b8]', 'border-white/5', 'bg-[#020617]/40');
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                `;
            } else {
                btn.classList.remove('text-[#00d4ff]', 'border-[#00d4ff]/30', 'bg-[#00d4ff]/10');
                btn.classList.add('text-[#94a3b8]', 'border-white/5', 'bg-[#020617]/40');
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                `;
            }
        }

        // Global layout mode: 'auto' | 'override-compact' | 'force-full'
        var globalLayout = localStorage.getItem('global_layout') || 'auto';
        if (globalLayout === 'force-normal') {
            globalLayout = 'auto';
            localStorage.setItem('global_layout', 'auto');
        }

        var GLOBAL_LAYOUT_STATES = ['auto', 'override-compact', 'force-full'];

        function cycleGlobalLayout() {
            const idx = GLOBAL_LAYOUT_STATES.indexOf(globalLayout);
            globalLayout = GLOBAL_LAYOUT_STATES[(idx + 1) % GLOBAL_LAYOUT_STATES.length];
            localStorage.setItem('global_layout', globalLayout);
            updateGlobalLayoutBtn();
            renderSavedQueues();
            vibrate(5);
        }

        function updateGlobalLayoutBtn() {
            const btn = document.getElementById('global-layout-btn');
            if (!btn) return;
            // Reset classes
            btn.classList.remove(
                'text-[#00d4ff]', 'border-[#00d4ff]/30', 'bg-[#00d4ff]/10',
                'text-[#00ff88]', 'border-[#00ff88]/30', 'bg-[#00ff88]/10',
                'text-amber-400', 'border-amber-400/30', 'bg-amber-400/10',
                'text-[#94a3b8]', 'border-white/5', 'bg-[#020617]/40',
                'hover:text-[#00d4ff]', 'hover:border-[#00d4ff]/30',
                'hover:text-[#00ff88]', 'hover:border-[#00ff88]/30',
                'hover:text-amber-400', 'hover:border-amber-400/30'
            );
            if (globalLayout === 'override-compact') {
                btn.classList.add('text-[#00d4ff]', 'border-[#00d4ff]/30', 'bg-[#00d4ff]/10', 'hover:text-[#00d4ff]', 'hover:border-[#00d4ff]/30');
                btn.title = 'Layout: Override Compact (click to cycle)';
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`;
            } else if (globalLayout === 'force-full') {
                btn.classList.add('text-amber-400', 'border-amber-400/30', 'bg-amber-400/10', 'hover:text-amber-400', 'hover:border-amber-400/30');
                btn.title = 'Layout: Force Full (click to cycle)';
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
            } else {
                btn.classList.add('text-[#94a3b8]', 'border-white/5', 'bg-[#020617]/40', 'hover:text-[#00d4ff]', 'hover:border-[#00d4ff]/30');
                btn.title = 'Layout: Auto (click to cycle)';
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
            }
        }

        function getEffectiveDisplayMode(q) {
            const widgetMode = q.displayMode || 'auto';
            if (globalLayout === 'override-compact') return 'compact';
            if (globalLayout === 'force-full') return 'full';
            if (widgetMode === 'compact') return 'compact';
            if (widgetMode === 'full') return 'full';
            if (widgetMode === 'normal') return 'normal';
            return 'normal';
        }

        // Update display mode pill selection visuals
        function updateDisplayModePills(selectedValue) {
            document.querySelectorAll('.display-mode-pill').forEach(pill => {
                const radio = pill.querySelector('input[type="radio"]');
                if (!radio) return;
                if (radio.value === selectedValue) {
                    pill.classList.add('border-sky-500/50', 'bg-sky-500/10');
                    pill.classList.remove('border-white/10', 'bg-[#090d16]/60');
                } else {
                    pill.classList.remove('border-sky-500/50', 'bg-sky-500/10');
                    pill.classList.add('border-white/10', 'bg-[#090d16]/60');
                }
            });
        }

        var modalResolve = () => { };
        var isCurrentModalDanger = false;

        function showModal({ title, body, confirmText = 'OK', cancelText = 'Cancel', danger = false, alertOnly = false, inputPrompt = false, defaultValue = '' }) {
            isCurrentModalDanger = danger;
            return new Promise(resolve => {
                const overlay = document.getElementById('modal-overlay');
                const box = document.getElementById('modal-box');
                const titleEl = document.getElementById('modal-title');
                const bodyEl = document.getElementById('modal-body');
                const btnsEl = document.getElementById('modal-buttons');

                titleEl.innerHTML = title;
                let bodyHtml = body || '';
                if (inputPrompt) {
                    bodyHtml += `<input type="text" id="modal-input" value="${defaultValue.replace(/"/g, '&quot;')}" class="w-full mt-3 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-[#e2e8f0] font-bold text-center outline-none focus:border-sky-500 transition-colors" autocomplete="off">`;
                }
                bodyEl.innerHTML = bodyHtml;
                bodyEl.style.display = (body || inputPrompt) ? '' : 'none';
                box.style.borderColor = danger ? 'rgba(244, 63, 94, 0.3)' : 'rgba(56, 189, 248, 0.2)';

                let btns = '';
                if (alertOnly) {
                    btns = `<button id="modal-ok-btn" class="flex-1 py-2 rounded-xl border border-sky-500/30 text-sky-400 font-bold text-xs hover:bg-sky-500 hover:text-[#e2e8f0] transition-colors">OK</button>`;
                } else {
                    const confirmClass = danger
                        ? 'bg-rose-500/20 border border-rose-500/50 text-rose-400 hover:bg-rose-500 hover:text-[#e2e8f0]'
                        : 'bg-sky-500/20 border border-sky-500/50 text-sky-400 hover:bg-sky-500 hover:text-[#e2e8f0]';
                    btns = `
                        <button id="modal-cancel-btn" class="flex-1 py-2 rounded-xl border border-white/10 text-[#94a3b8] font-bold text-xs hover:bg-white/5 transition-colors">${cancelText}</button>
                        <button id="modal-confirm-btn" class="flex-1 py-2 rounded-xl ${confirmClass} font-bold text-xs transition-colors">${confirmText}</button>
                    `;
                }
                btnsEl.innerHTML = btns;

                const getResult = (confirmed) => {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex');
                    isCurrentModalDanger = false;
                    if (inputPrompt) {
                        const inputEl = document.getElementById('modal-input');
                        resolve(confirmed ? (inputEl ? inputEl.value : null) : null);
                    } else {
                        resolve(confirmed);
                    }
                };
                modalResolve = (val) => getResult(val);

                if (alertOnly) {
                    document.getElementById('modal-ok-btn').onclick = () => getResult(true);
                } else {
                    document.getElementById('modal-cancel-btn').onclick = () => getResult(false);
                    document.getElementById('modal-confirm-btn').onclick = () => getResult(true);
                }

                overlay.classList.remove('hidden');
                overlay.classList.add('flex');

                if (inputPrompt) {
                    setTimeout(() => {
                        const inputEl = document.getElementById('modal-input');
                        if (inputEl) { inputEl.focus(); inputEl.select(); }
                    }, 50);
                }
            });
        }

        var defaultDice = [
            { d: 4, path: "M12 3L2 21h20z M12 3v11 M2 21l10-7 M22 21l-10-7" },
            { d: 6, path: "M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12l-9-5" },
            { d: 8, path: "M12 2L2 12l10 10l10-10z M12 2v20 M2 12h20" },
            { d: 10, path: "M12 2L22 9L12 22L2 9z M12 2v11 M12 13L2 9 M12 13L22 9 M12 13v9" },
            { d: 12, path: "M12 2l9 5v10l-9 5-9-5V7z M12 7l6 4v6l-6 4l-6-4v-6z M12 2v5 M21 7l-3 4 M21 17h-3 M12 22v-1 M3 17h3 M3 7l3 4" },
            { d: 20, path: "M12 2l9 5v10l-9 5-9-5V7z M12 7l6 10H6z M12 2v5 M21 7l-3 10 M3 7l3 10" },
            { d: 100, path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" }
        ];

        var deleteMode = false;
        var pendingDeleteSides = null;


        function addCustomDice() {
            showModal({
                title: 'Create Custom Dice',
                body: 'Enter the number of sides:',
                confirmText: 'Create',
                inputPrompt: true,
                defaultValue: ''
            }).then(val => {
                if (!val) return;
                const trimmed = val.trim();
                if (!/^\d+$/.test(trimmed)) {
                    showModal({ title: 'Invalid Input', body: 'Please enter a positive whole number only (no letters or symbols).', alertOnly: true, danger: true });
                    return;
                }
                const num = parseInt(trimmed, 10);
                if (num <= 0) {
                    showModal({ title: 'Invalid Input', body: 'Number of sides must be greater than zero.', alertOnly: true, danger: true });
                    return;
                }

                if (defaultDice.some(d => d.d === num) || customDice.some(d => d.d === num)) {
                    showModal({ title: 'Already Exists', body: 'A dice with that number of sides already exists.', alertOnly: true });
                    return;
                }
                customDice.push({ d: num });
                customDice.sort((a, b) => a.d - b.d);
                saveSettings();
                renderDiceGrid();
            });
        }

        function toggleDeleteMode(e) {
            if (e) e.stopPropagation();
            if (customDice.length === 0) {
                showModal({ title: 'No Custom Dice', body: 'There are no custom dice to delete.', alertOnly: true });
                return;
            }
            deleteMode = !deleteMode;
            renderDiceGrid();
            if (deleteMode) {
                setTimeout(() => {
                    document.addEventListener('click', closeDeleteModeListener);
                }, 10);
            } else {
                document.removeEventListener('click', closeDeleteModeListener);
            }
        }

        function closeDeleteModeListener(e) {
            if (deleteMode && !e.target.closest('.delete-btn-active')) {
                deleteMode = false;
                renderDiceGrid();
                document.removeEventListener('click', closeDeleteModeListener);
            }
        }

        function promptDeleteCustomDice(sides, e) {
            if (e) e.stopPropagation();
            pendingDeleteSides = sides;
            showModal({
                title: `Delete <span class="text-rose-400">D${sides}</span>?`,
                body: 'This action cannot be undone.',
                confirmText: 'Delete',
                danger: true
            }).then(confirmed => {
                if (confirmed) {
                    const idx = customDice.findIndex(d => d.d === pendingDeleteSides);
                    if (idx > -1) {
                        customDice.splice(idx, 1);
                        saveSettings();
                    }
                }
                pendingDeleteSides = null;
                deleteMode = false;
                renderDiceGrid();
                document.removeEventListener('click', closeDeleteModeListener);
            });
        }



        function toggleInstaQueue() {
            if (isInstaQueue === 'Roll Only') {
                isInstaQueue = 'Queue Only';
            } else if (isInstaQueue === 'Queue Only') {
                isInstaQueue = 'Roll & Queue';
            } else {
                isInstaQueue = 'Roll Only';
            }
            saveSettings();
            updateUI();
            vibrate(5);
        }

        function toggleArsenalQueue() {
            if (isArsenalQueue === 'Roll Only') {
                isArsenalQueue = 'Queue Only';
            } else if (isArsenalQueue === 'Queue Only') {
                isArsenalQueue = 'Roll & Queue';
            } else {
                isArsenalQueue = 'Roll Only';
            }
            saveSettings();
            updateUI();
            renderSavedQueues();
            vibrate(5);
        }

        var COLOR_PALETTE = [
            '#ff003c', '#ff4e00', '#ff8c00', '#ffea00', '#b6ff00', '#44ff00', '#00ff88', '#00ffcc', '#00f2ff', '#00d4ff',
            '#00a2ff', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ff00ff', '#ff0088', '#e2e8f0', '#94a3b8'
        ];

        var currentTargetMode = 'sum';

        function setTargetMode(mode) {
            currentTargetMode = mode;
            updateRulesUI();
            vibrate(5);
        }

        // ═══════════════════════════════════════════════════════════════
        // ADVANCED PANEL TOGGLE
        // ═══════════════════════════════════════════════════════════════

        function toggleAdvancedPanel() {
            const advRows = document.getElementById('advanced-rows');
            const btn = document.getElementById('adv-rules-toggle');
            const isOpen = advRows && !advRows.classList.contains('hidden');
            if (isOpen) {
                if (advRows) advRows.classList.add('hidden');
                btn.classList.remove('bg-sky-500/20', 'text-sky-400', 'border-sky-500/30');
                btn.classList.add('bg-[#00d4ff]/05', 'text-[#94a3b8]', 'border-[#00d4ff]/10');
            } else {
                if (advRows) advRows.classList.remove('hidden');
                btn.classList.add('bg-sky-500/20', 'text-sky-400', 'border-sky-500/30');
                btn.classList.remove('bg-[#00d4ff]/05', 'text-[#94a3b8]', 'border-[#00d4ff]/10');
            }
            vibrate(5);
        }

        // Legacy shims (kept for compatibility; advanced-panel now hidden by default)
        function toggleRulesPanel() { toggleAdvancedPanel(); }
        function openRulesPanel() { const r = document.getElementById('advanced-rows'); if (r && r.classList.contains('hidden')) toggleAdvancedPanel(); }
        function closeRulesPanel() { const r = document.getElementById('advanced-rows'); if (r && !r.classList.contains('hidden')) toggleAdvancedPanel(); }

        // ═══════════════════════════════════════════════════════════════
        // INLINE NODE EDITOR (INE) — replaces old panel & node popover
        // ═══════════════════════════════════════════════════════════════

        var ineNodeIndex = null; // which queue node is being edited (null = new number)
        var ineDivRoundMode = 'none'; // for division operator nodes

        // Legacy state variables (still referenced by setNumberMode, setEvalTab, etc.)
        var currentAdvDisType = null;
        var currentEvalTab = 'sum';
        var numberNodeMode = 'NUM';
        var rerollMode = 'NUM';
        var evalCriteria = { sum: [], count: [], sets: [], list: [] };
        var ineEvalCriteria = [];

        function ineOpen(mode, label) {
            const editor = document.getElementById('inline-node-editor');
            const lbl = document.getElementById('ine-label');
            const diceContent = document.getElementById('ine-dice-content');
            const numberContent = document.getElementById('ine-number-content');
            const divContent = document.getElementById('ine-div-content');
            const rerollContent = document.getElementById('ine-reroll-content');
            const evalContent = document.getElementById('ine-eval-content');
            const numberToggle = document.getElementById('ine-number-toggle-container');
            const evalToggle = document.getElementById('ine-eval-header-btn-container');

            lbl.textContent = label || 'NODE EDITOR';

            if (diceContent) {
                diceContent.classList.toggle('active', mode === 'node');
                diceContent.classList.toggle('hidden', mode !== 'node');
            }
            if (numberContent) {
                numberContent.classList.toggle('active', mode === 'number');
                numberContent.classList.toggle('hidden', mode !== 'number');
            }
            if (numberToggle) {
                numberToggle.classList.toggle('active', mode === 'number');
                numberToggle.classList.toggle('hidden', mode !== 'number');
            }
            if (evalToggle) {
                evalToggle.classList.toggle('active', mode === 'eval');
                evalToggle.classList.toggle('hidden', mode !== 'eval');
            }
            if (divContent) {
                divContent.classList.toggle('active', mode === 'div');
                divContent.classList.toggle('hidden', mode !== 'div');
            }
            if (rerollContent) {
                rerollContent.classList.toggle('active', mode === 'reroll');
                rerollContent.classList.toggle('hidden', mode !== 'reroll');
            }
            if (evalContent) {
                evalContent.classList.toggle('active', mode === 'eval');
                evalContent.classList.toggle('hidden', mode !== 'eval');
            }

            if (editor) {
                editor.setAttribute('data-mode', mode);
                editor.classList.add('open');
            }
            vibrate(5);
        }

        function ineClose() {
            const editor = document.getElementById('inline-node-editor');
            if (editor) {
                editor.classList.remove('open');
                editor.removeAttribute('data-mode');
            }
            ineNodeIndex = null;
        }

        // ── INE: Dice node ──
        function ineOpenNode(index) {
            ineNodeIndex = index;
            const node = engine.queue[index];
            if (!node || node.nodeType !== 'node') return;

            document.getElementById('ine-dice-count').value = node.count;
            ineRenderDieGrid(node.sides);
            ineOpen('node', 'DICE NODE');
        }

        function ineRenderDieGrid(activeSides) {
            const grid = document.getElementById('ine-die-grid');
            const sides = [4, 6, 8, 10, 12, 20, 100];
            grid.innerHTML = sides.map(s =>
                `<button class="ine-die-btn${s === activeSides ? ' active' : ''}" onclick="ineSelectDie(${s})">d${s}</button>`
            ).join('');
        }

        function ineAdjustDiceCount(delta) {
            const inp = document.getElementById('ine-dice-count');
            inp.value = Math.max(1, (parseInt(inp.value) || 1) + delta);
            ineUpdateDice();
        }

        function ineSelectDie(sides) {
            if (ineNodeIndex === null) return;
            const node = engine.queue[ineNodeIndex];
            if (!node) return;
            node.sides = sides;
            ineRenderDieGrid(sides);
            updateUI();
            vibrate(5);
        }

        function ineUpdateDice() {
            if (ineNodeIndex === null) return;
            const node = engine.queue[ineNodeIndex];
            if (!node) return;
            node.count = Math.max(1, parseInt(document.getElementById('ine-dice-count').value) || 1);
            updateUI();
        }

        // ── INE: Number/modifier node ──

        function ineSetNumVarMode(mode) {
            numberNodeMode = mode;
            const btnNum = document.getElementById('ine-num-toggle-num');
            const btnVar = document.getElementById('ine-num-toggle-var');
            const numContainer = document.getElementById('ine-num-mode-container');
            const varContainer = document.getElementById('ine-var-mode-container');

            if (mode === 'NUM') {
                if (btnNum) {
                    btnNum.classList.add('bg-sky-500/20', 'text-sky-400');
                    btnNum.classList.remove('text-slate-500');
                }
                if (btnVar) {
                    btnVar.classList.remove('bg-sky-500/20', 'text-sky-400');
                    btnVar.classList.add('text-slate-500');
                }
                if (numContainer) numContainer.classList.remove('hidden');
                if (varContainer) varContainer.classList.add('hidden');
            } else {
                if (btnVar) {
                    btnVar.classList.add('bg-sky-500/20', 'text-sky-400');
                    btnVar.classList.remove('text-slate-500');
                }
                if (btnNum) {
                    btnNum.classList.remove('bg-sky-500/20', 'text-sky-400');
                    btnNum.classList.add('text-slate-500');
                }
                if (numContainer) numContainer.classList.add('hidden');
                if (varContainer) varContainer.classList.remove('hidden');
                inePopulateVarDropdown();
                ineOnVarSelectChange();
            }
            ineUpdateNumber();
        }

        function inePopulateVarDropdown() {
            const select = document.getElementById('ine-number-var-select');
            if (!select) return;
            select.innerHTML = '';

            // Add Target
            const optTarget = document.createElement('option');
            optTarget.value = 'target';
            optTarget.textContent = 'Target';
            select.appendChild(optTarget);

            // Add active character variables
            const char = characters.find(c => c.id === activeCharacterId);
            if (char && char.variables) {
                Object.entries(char.variables).forEach(([name, val]) => {
                    if (name === 'target') return;
                    const opt = document.createElement('option');
                    opt.value = name;
                    const sign = val >= 0 ? '+' : '';
                    opt.textContent = `${name}(${sign}${val})`;
                    select.appendChild(opt);
                });
            }
        }

        function ineOnVarSelectChange() {
            const select = document.getElementById('ine-number-var-select');
            const valContainer = document.getElementById('ine-var-val-container');
            const valInput = document.getElementById('ine-number-var-val');
            if (!select) return;

            const selectedVal = select.value;
            const char = characters.find(c => c.id === activeCharacterId);
            const varVal = (char && char.variables) ? char.variables[selectedVal] : undefined;

            if (selectedVal === 'target' || varVal === undefined || varVal === null || varVal === "") {
                if (valContainer) valContainer.classList.remove('hidden');
                if (valInput) valInput.value = varVal !== undefined ? (parseInt(varVal) || 0) : 0;
            } else {
                if (valContainer) valContainer.classList.add('hidden');
            }
            ineUpdateNumber();
        }

        function ineAdjustVarVal(delta) {
            const inp = document.getElementById('ine-number-var-val');
            if (inp) {
                inp.value = (parseInt(inp.value) || 0) + delta;
            }
            ineUpdateNumber();
        }

        function ineOpenNumber(index) {
            ineNodeIndex = index;
            inePopulateVarDropdown();

            if (index === null) {
                // New number node from '#' button
                const valInp = document.getElementById('ine-number-val');
                if (valInp) valInp.value = 0;
                ineSetNumVarMode('NUM');
                ineOpen('number', 'NUMBER NODE');
                return;
            }

            const node = engine.queue[index];
            if (!node) return;

            if (node.nodeType === 'number' || node.type === 'literal') {
                const valInp = document.getElementById('ine-number-val');
                if (valInp) valInp.value = Number(node.value) || 0;
                ineSetNumVarMode('NUM');
            } else {
                const select = document.getElementById('ine-number-var-select');
                if (select) select.value = node.value;
                ineSetNumVarMode('VAR');

                const char = characters.find(c => c.id === activeCharacterId);
                const varVal = (char && char.variables) ? char.variables[node.value] : undefined;
                if (node.value === 'target' || varVal === undefined || varVal === null || varVal === "") {
                    const varValInp = document.getElementById('ine-number-var-val');
                    if (varValInp) varValInp.value = varVal !== undefined ? (parseInt(varVal) || 0) : 0;
                }
            }
            const label = node.nodeType === 'modifier' ? 'MODIFIER NODE' : 'NUMBER NODE';
            ineOpen('number', label);
        }

        function ineAdjustNumber(delta) {
            const inp = document.getElementById('ine-number-val');
            if (inp) inp.value = (parseInt(inp.value) || 0) + delta;
            ineUpdateNumber();
        }

        function ineUpdateNumber() {
            if (ineNodeIndex === null) return;
            const node = engine.queue[ineNodeIndex];
            if (!node) return;

            if (numberNodeMode === 'NUM') {
                node.nodeType = 'number';
                node.type = 'literal';
                const numValEl = document.getElementById('ine-number-val');
                node.value = numValEl ? (parseInt(numValEl.value) || 0) : 0;
            } else {
                const selectEl = document.getElementById('ine-number-var-select');
                const varSelect = selectEl ? selectEl.value : 'target';
                node.nodeType = 'modifier';
                node.type = 'variable';
                node.value = varSelect;

                const char = characters.find(c => c.id === activeCharacterId);
                const valContainer = document.getElementById('ine-var-val-container');
                if (char && char.variables && valContainer && !valContainer.classList.contains('hidden')) {
                    const varValEl = document.getElementById('ine-number-var-val');
                    const customVal = varValEl ? (parseInt(varValEl.value) || 0) : 0;
                    char.variables[varSelect] = customVal;
                }
            }
            updateUI();
        }

        // ── INE: Division / rounding ──
        function ineOpenDiv(index) {
            ineNodeIndex = index;
            const node = engine.queue[index];
            ineDivRoundMode = (node && node.roundMode) ? node.roundMode : 'none';
            ineUpdateRoundBtns();
            ineOpen('div', 'DIVISION');
        }

        function ineSetRound(mode) {
            ineDivRoundMode = mode;
            ineUpdateRoundBtns();
            if (ineNodeIndex !== null) {
                const node = engine.queue[ineNodeIndex];
                if (node) {
                    node.roundMode = mode;
                    updateUI();
                }
            }
            vibrate(5);
        }

        function ineUpdateRoundBtns() {
            ['none', 'up', 'down'].forEach(m => {
                const btn = document.getElementById('ine-round-' + m);
                if (btn) btn.classList.toggle('active', m === ineDivRoundMode);
            });
        }

        // ── INE: Reroll / Explode ──
        var rerollNodeMode = 'NUM';

        function ineSetRerollNumVarMode(mode) {
            rerollNodeMode = mode;
            const btnNum = document.getElementById('ine-reroll-toggle-num');
            const btnVar = document.getElementById('ine-reroll-toggle-var');
            const numContainer = document.getElementById('ine-reroll-num-container');
            const varContainer = document.getElementById('ine-reroll-var-container');

            if (mode === 'NUM') {
                if (btnNum) {
                    btnNum.classList.add('bg-sky-500/20', 'text-sky-400');
                    btnNum.classList.remove('text-slate-500');
                }
                if (btnVar) {
                    btnVar.classList.remove('bg-sky-500/20', 'text-sky-400');
                    btnVar.classList.add('text-slate-500');
                }
                if (numContainer) numContainer.classList.remove('hidden');
                if (varContainer) varContainer.classList.add('hidden');
            } else {
                if (btnVar) {
                    btnVar.classList.add('bg-sky-500/20', 'text-sky-400');
                    btnVar.classList.remove('text-slate-500');
                }
                if (btnNum) {
                    btnNum.classList.remove('bg-sky-500/20', 'text-sky-400');
                    btnNum.classList.add('text-slate-500');
                }
                if (numContainer) numContainer.classList.add('hidden');
                if (varContainer) varContainer.classList.remove('hidden');
                inePopulateRerollVarDropdown();
                ineOnRerollVarSelectChange();
            }
            ineUpdateReroll();
        }

        function inePopulateRerollVarDropdown() {
            const select = document.getElementById('ine-reroll-var-select');
            if (!select) return;
            select.innerHTML = '';

            // Add Target
            const optTarget = document.createElement('option');
            optTarget.value = 'target';
            optTarget.textContent = 'Target';
            select.appendChild(optTarget);

            // Add active character variables
            const char = characters.find(c => c.id === activeCharacterId);
            if (char && char.variables) {
                Object.entries(char.variables).forEach(([name, val]) => {
                    if (name === 'target') return;
                    const opt = document.createElement('option');
                    opt.value = name;
                    const sign = val >= 0 ? '+' : '';
                    opt.textContent = `${name}(${sign}${val})`;
                    select.appendChild(opt);
                });
            }
        }

        function ineOnRerollVarSelectChange() {
            const select = document.getElementById('ine-reroll-var-select');
            const valContainer = document.getElementById('ine-reroll-var-val-container');
            const valInput = document.getElementById('ine-reroll-var-val');
            if (!select) return;

            const selectedVal = select.value;
            const char = characters.find(c => c.id === activeCharacterId);
            const varVal = (char && char.variables) ? char.variables[selectedVal] : undefined;

            if (selectedVal === 'target' || varVal === undefined || varVal === null || varVal === "") {
                if (valContainer) valContainer.classList.remove('hidden');
                if (valInput) valInput.value = varVal !== undefined ? (parseInt(varVal) || 0) : 0;
            } else {
                if (valContainer) valContainer.classList.add('hidden');
            }
            ineUpdateReroll();
        }

        function ineAdjustRerollVarVal(delta) {
            const inp = document.getElementById('ine-reroll-var-val');
            if (inp) {
                inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta);
            }
            ineUpdateReroll();
        }

        function ineOpenReroll() {
            ineNodeIndex = null;
            inePopulateRerollVarDropdown();

            const isExplode = document.getElementById('rule-explode-op').value !== "";
            const op = isExplode ? document.getElementById('rule-explode-op').value : document.getElementById('rule-reroll-op').value;
            const val = isExplode ? document.getElementById('rule-explode-val').value : document.getElementById('rule-reroll-val').value;

            document.getElementById('ine-reroll-op').value = op;
            document.getElementById('ine-reroll-keep').checked = isExplode;

            // Check if val is a number or variable
            const isVar = isNaN(parseInt(val)) && val !== "";
            if (isVar) {
                const select = document.getElementById('ine-reroll-var-select');
                if (select) select.value = val;
                ineSetRerollNumVarMode('VAR');

                const char = characters.find(c => c.id === activeCharacterId);
                const varVal = (char && char.variables) ? char.variables[val] : undefined;
                if (val === 'target' || varVal === undefined || varVal === null || varVal === "") {
                    const varValInp = document.getElementById('ine-reroll-var-val');
                    if (varValInp) varValInp.value = varVal !== undefined ? (parseInt(varVal) || 0) : 0;
                }
            } else {
                const valInp = document.getElementById('ine-reroll-val');
                if (valInp) valInp.value = val !== "" ? (parseInt(val) || 0) : 1;
                ineSetRerollNumVarMode('NUM');
            }

            // Sync Apply to all from engine
            document.getElementById('ine-reroll-apply-all').checked = engine.rollRules.rerollApplyAll !== false;

            ineOpen('reroll', 'REROLL / EXPLODE');
        }

        function ineAdjustReroll(delta) {
            const inp = document.getElementById('ine-reroll-val');
            if (inp) inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta);
            ineUpdateReroll();
        }

        function ineUpdateReroll() {
            const op = document.getElementById('ine-reroll-op').value;
            const isExplode = document.getElementById('ine-reroll-keep').checked;
            const applyAll = document.getElementById('ine-reroll-apply-all').checked;

            let val = "";
            if (rerollNodeMode === 'NUM') {
                const valInp = document.getElementById('ine-reroll-val');
                val = valInp ? (parseInt(valInp.value) || 0) : 0;
            } else {
                const selectEl = document.getElementById('ine-reroll-var-select');
                val = selectEl ? selectEl.value : 'target';

                const char = characters.find(c => c.id === activeCharacterId);
                const valContainer = document.getElementById('ine-reroll-var-val-container');
                if (char && char.variables && valContainer && !valContainer.classList.contains('hidden')) {
                    const varValEl = document.getElementById('ine-reroll-var-val');
                    const customVal = varValEl ? (parseInt(varValEl.value) || 0) : 0;
                    char.variables[val] = customVal;
                }
            }

            // Save rerollApplyAll to engine
            engine.rollRules.rerollApplyAll = applyAll;

            if (applyAll) {
                // Clear any local rules on dice in the queue
                engine.queue.forEach(node => {
                    if (node.nodeType === 'node') {
                        delete node.rerollOp;
                        delete node.rerollVal;
                        delete node.explodeOp;
                        delete node.explodeVal;
                    }
                });

                if (isExplode) {
                    document.getElementById('rule-reroll-op').value = "";
                    document.getElementById('rule-reroll-val').value = "";
                    document.getElementById('rule-explode-op').value = op;
                    document.getElementById('rule-explode-val').value = op ? val : "";
                } else {
                    document.getElementById('rule-explode-op').value = "";
                    document.getElementById('rule-explode-val').value = "";
                    document.getElementById('rule-reroll-op').value = op;
                    document.getElementById('rule-reroll-val').value = op ? val : "";
                }
            } else {
                // Clear global rules
                document.getElementById('rule-reroll-op').value = "";
                document.getElementById('rule-reroll-val').value = "";
                document.getElementById('rule-explode-op').value = "";
                document.getElementById('rule-explode-val').value = "";

                // Find the last dice node in the queue
                const diceNodes = engine.queue.filter(c => c.nodeType === 'node');
                if (diceNodes.length > 0) {
                    const lastDice = diceNodes[diceNodes.length - 1];
                    if (isExplode) {
                        lastDice.explodeOp = op;
                        lastDice.explodeVal = op ? val : null;
                        delete lastDice.rerollOp;
                        delete lastDice.rerollVal;
                    } else {
                        lastDice.rerollOp = op;
                        lastDice.rerollVal = op ? val : null;
                        delete lastDice.explodeOp;
                        delete lastDice.explodeVal;
                    }
                }
            }
            updateRulesUI();
        }

        // ── INE: Eval / Target Mode ──
        function ineOpenEval() {
            ineNodeIndex = null;

            // Map structured rules from engine to unified flat array
            ineEvalCriteria.length = 0;
            if (engine.rollRules.evalCriteria) {
                const structured = engine.rollRules.evalCriteria;
                ['sum', 'count', 'sets', 'list'].forEach(type => {
                    const list = structured[type] || [];
                    const isViewOnly = structured[type].viewOnly || false;
                    list.forEach(c => {
                        ineEvalCriteria.push({
                            type: type,
                            op: c.op || '>=',
                            mode: c.mode || 'NUM',
                            numVal: c.numVal !== undefined ? c.numVal : 0,
                            varVal: c.varVal || 'target',
                            gate: c.gate || 'AND',
                            viewOnly: isViewOnly
                        });
                    });
                });
            }

            if (ineEvalCriteria.length === 0) {
                ineEvalCriteria.push({ type: 'sum', op: '>=', mode: 'NUM', numVal: 0, varVal: 'target', gate: 'AND', viewOnly: false });
            }

            ineRenderCriteria();
            ineOpen('eval', 'EVALUATION');
        }

        function ineUpdateEvalCriteriaViewOnly(idx, val) {
            ineEvalCriteria[idx].viewOnly = val;
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineAddCriteria() {
            ineEvalCriteria.push({ type: 'sum', op: '>=', mode: 'NUM', numVal: 0, varVal: 'target', gate: 'AND', viewOnly: false });
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineRemoveCriteria(idx) {
            ineEvalCriteria.splice(idx, 1);
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineToggleEvalGate(idx) {
            const gates = ['AND', 'OR', 'AND/OR'];
            const c = ineEvalCriteria[idx];
            c.gate = gates[(gates.indexOf(c.gate || 'AND') + 1) % gates.length];
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineUpdateEvalCriteria(idx, key, val) {
            ineEvalCriteria[idx][key] = val;
            if (key === 'varVal' || key === 'mode') {
                ineRenderCriteria();
            }
            ineSyncEvalToEngine();
        }

        function ineAdjustEvalCriteria(idx, delta) {
            const c = ineEvalCriteria[idx];
            c.numVal = Math.max(0, (parseInt(c.numVal) || 0) + delta);
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineAdjustEvalCriteriaVarVal(idx, delta) {
            const c = ineEvalCriteria[idx];
            const char = characters.find(c => c.id === activeCharacterId);
            if (char && char.variables) {
                const varName = c.varVal || 'target';
                const currentVal = parseInt(char.variables[varName]) || 0;
                char.variables[varName] = currentVal + delta;
            }
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineUpdateEvalCriteriaVarVal(idx, val) {
            const c = ineEvalCriteria[idx];
            const char = characters.find(c => c.id === activeCharacterId);
            if (char && char.variables) {
                char.variables[c.varVal || 'target'] = val;
            }
            ineSyncEvalToEngine();
        }

        function ineSetEvalCriteriaMode(idx, mode) {
            ineEvalCriteria[idx].mode = mode;
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineUpdateEvalCriteriaType(idx, type) {
            ineEvalCriteria[idx].type = type;
            if (type === 'list') {
                ineEvalCriteria[idx].viewOnly = true;
            }
            ineRenderCriteria();
            ineSyncEvalToEngine();
        }

        function ineRenderCriteria() {
            const container = document.getElementById('ine-eval-criteria-list');
            const addBtn = document.getElementById('ine-eval-add-btn');
            if (!container) return;

            if (addBtn) addBtn.classList.remove('hidden');

            if (ineEvalCriteria.length === 0) {
                container.innerHTML = '<p class="text-[9px] text-slate-600 italic text-center py-2">No conditions configured.</p>';
                return;
            }

            let html = '';
            ineEvalCriteria.forEach((c, idx) => {
                if (idx > 0) {
                    html += `
                        <div class="flex justify-center my-1">
                            <button onclick="ineToggleEvalGate(${idx})" class="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-violet-400 bg-[#020617] border border-violet-500/20 hover:border-violet-500/40 rounded-lg transition-all">
                                ${c.gate || 'AND'}
                            </button>
                        </div>
                    `;
                }

                let row2Content = '';
                if (c.type !== 'list') {
                    let valSection = '';
                    if (c.mode === 'NUM') {
                        valSection = `
                            <div class="ine-stepper flex-1" style="max-width: 9.5rem; height: 2.5rem;">
                                <button class="ine-stepper-btn" style="width: 2.5rem; height: 2.5rem;" onclick="ineAdjustEvalCriteria(${idx}, -1)">−</button>
                                <input type="number" class="ine-stepper-val" style="font-size: 1rem;" value="${c.numVal || 0}" oninput="ineUpdateEvalCriteria(${idx}, 'numVal', parseInt(this.value) || 0)">
                                <button class="ine-stepper-btn" style="width: 2.5rem; height: 2.5rem;" onclick="ineAdjustEvalCriteria(${idx}, 1)">+</button>
                            </div>
                        `;
                    } else {
                        let optionsHtml = '<option value="target">Target</option>';
                        const char = characters.find(c => c.id === activeCharacterId);
                        if (char && char.variables) {
                            Object.entries(char.variables).forEach(([name, val]) => {
                                if (name === 'target') return;
                                const sign = val >= 0 ? '+' : '';
                                optionsHtml += `<option value="${name}" ${c.varVal === name ? 'selected' : ''}>${name}(${sign}${val})</option>`;
                            });
                        }

                        const varVal = (char && char.variables) ? char.variables[c.varVal || 'target'] : undefined;
                        let valInputHtml = '';
                        if (c.varVal === 'target' || varVal === undefined || varVal === null || varVal === "") {
                            const customVarVal = varVal !== undefined ? (parseInt(varVal) || 0) : 0;
                            valInputHtml = `
                                <div class="ine-stepper ml-1" style="max-width: 6.5rem; height: 2.5rem;">
                                    <button class="ine-stepper-btn" style="width: 2.5rem; height: 2.5rem;" onclick="ineAdjustEvalCriteriaVarVal(${idx}, -1)">−</button>
                                    <input type="number" class="ine-stepper-val" style="font-size: 1rem;" value="${customVarVal}" oninput="ineUpdateEvalCriteriaVarVal(${idx}, parseInt(this.value) || 0)">
                                    <button class="ine-stepper-btn" style="width: 2.5rem; height: 2.5rem;" onclick="ineAdjustEvalCriteriaVarVal(${idx}, 1)">+</button>
                                </div>
                            `;
                        }

                        valSection = `
                            <div class="flex items-center flex-1">
                                <select onchange="ineUpdateEvalCriteria(${idx}, 'varVal', this.value)" class="bg-[#020617] border border-white/10 rounded-xl px-2.5 h-[2.5rem] text-xs text-sky-400 font-bold outline-none flex-1">
                                    ${optionsHtml}
                                </select>
                                ${valInputHtml}
                            </div>
                        `;
                    }

                    row2Content = `
                        <!-- Row 2: Value Selector, View Only, and Delete -->
                        <div class="flex items-center justify-between gap-2 border-t border-white/5 pt-1.5 mt-1.5">
                            <div class="flex-1 flex items-center justify-start">
                                ${valSection}
                            </div>
                            
                            <div class="flex items-center gap-2 select-none shrink-0 pl-2">
                                <label class="toggle-switch" style="transform: scale(0.85); transform-origin: center;">
                                    <input type="checkbox" ${c.viewOnly ? 'checked' : ''} onchange="ineUpdateEvalCriteriaViewOnly(${idx}, this.checked)">
                                    <span class="toggle-slider"></span>
                                </label>
                                <span class="text-[9px] font-black text-slate-500 uppercase tracking-wider">View Only</span>
                            </div>
                            
                            ${ineEvalCriteria.length > 1 ? `
                                <button onclick="ineRemoveCriteria(${idx})" class="text-rose-500/60 hover:text-rose-400 text-xs px-2 h-[2.5rem] flex items-center justify-center border border-rose-500/20 hover:bg-rose-500/10 rounded-xl transition-all ml-1">✕</button>
                            ` : ''}
                        </div>
                    `;
                } else {
                    // List Mode Row 2 (only View Only and Delete)
                    row2Content = `
                        <div class="flex items-center justify-between gap-2 border-t border-white/5 pt-1.5 mt-1.5">
                            <span class="text-[9px] text-slate-500 italic">Lists all rolls individually.</span>
                            <div class="flex items-center gap-2 select-none shrink-0 pl-2">
                                <label class="toggle-switch" style="transform: scale(0.85); transform-origin: center;">
                                    <input type="checkbox" checked disabled>
                                    <span class="toggle-slider opacity-60"></span>
                                </label>
                                <span class="text-[9px] font-black text-slate-500 uppercase tracking-wider">View Only</span>
                            </div>
                            ${ineEvalCriteria.length > 1 ? `
                                <button onclick="ineRemoveCriteria(${idx})" class="text-rose-500/60 hover:text-rose-400 text-xs px-2 h-[2.5rem] flex items-center justify-center border border-rose-500/20 hover:bg-rose-500/10 rounded-xl transition-all ml-1">✕</button>
                            ` : ''}
                        </div>
                    `;
                }

                let opSelectHtml = '';
                let numVarToggleHtml = '';
                if (c.type !== 'list') {
                    opSelectHtml = `
                        <select onchange="ineUpdateEvalCriteria(${idx}, 'op', this.value)" class="bg-[#020617] border border-white/10 rounded-xl px-2.5 h-[2.5rem] text-xs text-sky-400 font-bold outline-none" style="width: 3.5rem">
                            <option value=">=" ${c.op === '>=' ? 'selected' : ''}>&ge;</option>
                            <option value=">" ${c.op === '>' ? 'selected' : ''}>&gt;</option>
                            <option value="=" ${c.op === '=' ? 'selected' : ''}>=</option>
                            <option value="<=" ${c.op === '<=' ? 'selected' : ''}>&le;</option>
                            <option value="<" ${c.op === '<' ? 'selected' : ''}>&lt;</option>
                        </select>
                    `;

                    numVarToggleHtml = `
                        <div class="flex bg-[#020617] rounded-xl border border-white/10 overflow-hidden shrink-0 h-[2.5rem] items-center">
                            <button onclick="ineSetEvalCriteriaMode(${idx}, 'NUM')" class="px-3 h-full text-[9px] font-black uppercase ${c.mode === 'NUM' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-600'} transition-all">NUM</button>
                            <button onclick="ineSetEvalCriteriaMode(${idx}, 'VAR')" class="px-3 h-full text-[9px] font-black uppercase border-l border-white/10 ${c.mode === 'VAR' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-600'} transition-all">VAR</button>
                        </div>
                    `;
                }

                html += `
                    <div class="bg-[#020617]/50 rounded-xl border border-white/10 p-2 space-y-2">
                        <!-- Row 1: Type dropdown, Operator, and NUM/VAR toggle -->
                        <div class="flex items-center gap-2">
                            <select onchange="ineUpdateEvalCriteriaType(${idx}, this.value)" class="bg-[#020617] border border-white/15 rounded-xl px-3 h-[2.5rem] text-xs text-sky-400 font-extrabold outline-none shrink-0" style="width: 6.5rem">
                                <option value="sum" ${c.type === 'sum' ? 'selected' : ''}>SUM</option>
                                <option value="count" ${c.type === 'count' ? 'selected' : ''}>COUNT</option>
                                <option value="sets" ${c.type === 'sets' ? 'selected' : ''}>SETS</option>
                                <option value="list" ${c.type === 'list' ? 'selected' : ''}>LIST</option>
                            </select>
                            
                            ${opSelectHtml}
                            ${numVarToggleHtml}
                        </div>
                        
                        ${row2Content}
                    </div>
                `;
            });

            container.innerHTML = html;
        }

        function ineSyncEvalToEngine() {
            // Find the main (non-view-only) condition to set targetMode
            const mainCond = ineEvalCriteria.find(c => !c.viewOnly) || ineEvalCriteria[0];
            const targetMode = mainCond ? mainCond.type : 'sum';
            currentTargetMode = targetMode;
            engine.rollRules.targetMode = targetMode;

            // Reconstruct structured evalCriteria object for the engine
            const structured = { sum: [], count: [], sets: [], list: [] };

            structured.sum.viewOnly = !ineEvalCriteria.some(c => c.type === 'sum' && !c.viewOnly);
            structured.count.viewOnly = !ineEvalCriteria.some(c => c.type === 'count' && !c.viewOnly);
            structured.sets.viewOnly = !ineEvalCriteria.some(c => c.type === 'sets' && !c.viewOnly);
            structured.list.viewOnly = !ineEvalCriteria.some(c => c.type === 'list' && !c.viewOnly);

            ineEvalCriteria.forEach(c => {
                if (structured[c.type]) {
                    structured[c.type].push({
                        op: c.op,
                        mode: c.mode,
                        numVal: c.numVal,
                        varVal: c.varVal,
                        gate: c.gate
                    });
                }
            });

            engine.rollRules.evalCriteria = structured;

            // Sync first criteria back to hidden legacy controls for backwards compatibility
            const first = ineEvalCriteria[0];
            if (first) {
                if (first.type === 'sum') {
                    const opEl = document.getElementById('rule-sum-op');
                    const valEl = document.getElementById('rule-sum-val');
                    if (opEl) opEl.value = first.op;
                    if (valEl) valEl.value = first.mode === 'NUM' ? first.numVal : first.varVal;
                } else if (first.type === 'count') {
                    const opEl = document.getElementById('rule-count-op');
                    const valEl = document.getElementById('rule-count-val');
                    if (opEl) opEl.value = first.op;
                    if (valEl) valEl.value = first.mode === 'NUM' ? first.numVal : first.varVal;
                } else if (first.type === 'sets') {
                    const opEl = document.getElementById('rule-sets-op');
                    const valEl = document.getElementById('rule-sets-val');
                    if (opEl) opEl.value = first.op;
                    if (valEl) valEl.value = first.mode === 'NUM' ? first.numVal : first.varVal;
                }
            }
            updateRulesUI();
        }

        // ── INE: Actions ──
        function ineDelete() {
            if (ineNodeIndex !== null) {
                removeQueueChip(ineNodeIndex);
            } else {
                const rerollContent = document.getElementById('ine-reroll-content');
                const evalContent = document.getElementById('ine-eval-content');
                if (rerollContent && !rerollContent.classList.contains('hidden')) {
                    document.getElementById('ine-reroll-op').value = "";
                    document.getElementById('ine-reroll-val').value = "";
                    document.getElementById('rule-reroll-op').value = "";
                    document.getElementById('rule-reroll-val').value = "";
                    document.getElementById('rule-explode-op').value = "";
                    document.getElementById('rule-explode-val').value = "";
                    updateRulesUI();
                } else if (evalContent && !evalContent.classList.contains('hidden')) {
                    ineEvalCriteria.length = 0;
                    ineRenderCriteria();
                    ineSyncEvalToEngine();
                    if (document.getElementById('rule-sum-op')) document.getElementById('rule-sum-op').value = "";
                    if (document.getElementById('rule-sum-val')) document.getElementById('rule-sum-val').value = "overall";
                    if (document.getElementById('rule-count-op')) document.getElementById('rule-count-op').value = ">=";
                    if (document.getElementById('rule-count-val')) document.getElementById('rule-count-val').value = "";
                    if (document.getElementById('rule-sets-op')) document.getElementById('rule-sets-op').value = "";
                    if (document.getElementById('rule-sets-val')) document.getElementById('rule-sets-val').value = "";
                    updateRulesUI();
                }
            }
            ineClose();
            vibrate(10);
        }

        function ineConfirm() {
            // For number node from '#' button (new node)
            const editor = document.getElementById('inline-node-editor');
            const mode = editor ? editor.getAttribute('data-mode') : null;
            if (ineNodeIndex === null && mode === 'number') {
                activeLoadoutId = null;
                if (numberNodeMode === 'NUM') {
                    const val = parseInt(document.getElementById('ine-number-val').value) || 0;
                    engine.queue.push({
                        nodeType: 'number', value: val, operator: '+', type: 'literal',
                        multiplierType: 'none', multiplierValue: 1, divisorType: 'none', divisorValue: 1, roundMode: 'none'
                    });
                } else {
                    const selectEl = document.getElementById('ine-number-var-select');
                    const varSelect = selectEl ? selectEl.value : 'target';
                    engine.queue.push({
                        nodeType: 'modifier', type: 'variable', value: varSelect, operator: '+',
                        multiplierType: 'none', multiplierValue: 1, divisorType: 'none', divisorValue: 1, roundMode: 'none'
                    });

                    const char = characters.find(c => c.id === activeCharacterId);
                    const valContainer = document.getElementById('ine-var-val-container');
                    if (char && char.variables && valContainer && !valContainer.classList.contains('hidden')) {
                        const varValEl = document.getElementById('ine-number-var-val');
                        const customVal = varValEl ? (parseInt(varValEl.value) || 0) : 0;
                        char.variables[varSelect] = customVal;
                    }
                }
                updateUI();
                vibrate(10);
            }
            ineClose();
        }

        function openNodeEditor(type) {
            // For the '#' number node button
            if (type === 'number') {
                ineOpenNumber(null);
                return;
            }
            if (type === 'reroll') {
                ineOpenReroll();
                return;
            }
            if (type === 'eval') {
                ineOpenEval();
                return;
            }
            // advdis (triggered from ADV/DIS button clicks) — handled elsewhere
            vibrate(5);
        }

        function closeNodeEditor() {
            ineClose();
        }

        // ═══════════════════════════════════════════════════════════════
        // editQueueChip — now opens the inline node editor
        // ═══════════════════════════════════════════════════════════════
        function editQueueChip(index, event) {
            if (event) event.stopPropagation();
            const node = engine.queue[index];
            if (!node) return;

            if (node.nodeType === 'node') {
                document.getElementById('dice-section')?.scrollIntoView({ behavior: 'smooth' });
                return;
            } else if (node.nodeType === 'modifier' || node.nodeType === 'number') {
                if (ineNodeIndex === index && document.getElementById('inline-node-editor').classList.contains('open')) {
                    ineClose(); return;
                }
                ineOpenNumber(index);
            } else if (node.nodeType === 'operator' && node.operator === '/') {
                if (ineNodeIndex === index && document.getElementById('inline-node-editor').classList.contains('open')) {
                    ineClose(); return;
                }
                ineOpenDiv(index);
            }
            // Other operators (+, -, *, (, )) — no editor
        }

        function populateVarDropdowns() {
            const char = characters.find(c => c.id === activeCharacterId);
            const vars = (char && char.variables) ? char.variables : [];
            ['ne-var-select', 'ne-reroll-var-select'].forEach(id => {
                const sel = document.getElementById(id);
                if (!sel) return;
                sel.innerHTML = '';
                const tgt = document.createElement('option');
                tgt.value = 'target'; tgt.textContent = 'Target';
                sel.appendChild(tgt);
                vars.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id || v.name;
                    const sign = v.value >= 0 ? '+' : '';
                    opt.textContent = v.name + '(' + sign + v.value + ')';
                    sel.appendChild(opt);
                });
            });
        }

        // ── NUMBER NODE ──

        function setNumberMode(mode) {
            numberNodeMode = mode;
            const numTab = document.getElementById('ne-num-tab');
            const varTab = document.getElementById('ne-var-tab');
            const numMode = document.getElementById('ne-num-mode');
            const varMode = document.getElementById('ne-var-mode');
            const active = ['bg-sky-500/20', 'text-sky-400'];
            const inactive = ['text-slate-500'];
            [numTab, varTab].forEach(t => { t.classList.remove(...active, ...inactive); t.classList.add(...inactive); });
            if (mode === 'NUM') {
                numTab.classList.remove(...inactive); numTab.classList.add(...active);
                numMode.classList.remove('hidden'); varMode.classList.add('hidden');
            } else {
                varTab.classList.remove(...inactive); varTab.classList.add(...active);
                numMode.classList.add('hidden'); varMode.classList.remove('hidden');
                onVarSelectChange();
            }
        }

        function adjustNumberNode(delta) {
            const inp = document.getElementById('ne-num-input');
            inp.value = (parseInt(inp.value) || 0) + delta;
            vibrate(5);
        }

        function onVarSelectChange() {
            const sel = document.getElementById('ne-var-select');
            const display = document.getElementById('ne-var-value-display');
            const resolved = document.getElementById('ne-var-resolved');
            if (!sel) return;
            if (sel.value === 'target') {
                display.classList.add('hidden');
            } else {
                display.classList.remove('hidden');
                const char = characters.find(c => c.id === activeCharacterId);
                const v = char && char.variables && char.variables.find(x => (x.id || x.name) === sel.value);
                resolved.textContent = v ? ((v.value >= 0 ? '+' : '') + v.value) : '—';
            }
        }

        function addNumberNodeToQueue() {
            const val = parseInt(document.getElementById('ne-num-input').value) || 0;
            activeLoadoutId = null;
            const lastChip = engine.queue[engine.queue.length - 1];
            if (lastChip && (
                lastChip.nodeType === 'node' ||
                lastChip.nodeType === 'number' ||
                lastChip.nodeType === 'modifier' ||
                (lastChip.nodeType === 'operator' && lastChip.operator === ')')
            )) {
                engine.queue.push({ nodeType: 'operator', operator: '+', roundMode: 'none' });
            }
            engine.queue.push({
                nodeType: 'number', value: val, operator: '+', type: 'literal',
                multiplierType: 'none', multiplierValue: 1, divisorType: 'none', divisorValue: 1, roundMode: 'none'
            });
            updateUI(); vibrate(10);
        }

        function addVariableNodeToQueue() {
            const sel = document.getElementById('ne-var-select');
            if (!sel) return;
            activeLoadoutId = null;
            const lastChip = engine.queue[engine.queue.length - 1];
            if (lastChip && (
                lastChip.nodeType === 'node' ||
                lastChip.nodeType === 'number' ||
                lastChip.nodeType === 'modifier' ||
                (lastChip.nodeType === 'operator' && lastChip.operator === ')')
            )) {
                engine.queue.push({ nodeType: 'operator', operator: '+', roundMode: 'none' });
            }
            engine.queue.push({
                nodeType: 'modifier', type: sel.value === 'target' ? 'target' : 'variable',
                variableId: sel.value, operator: '+', value: 0,
                multiplierType: 'none', multiplierValue: 1, divisorType: 'none', divisorValue: 1, roundMode: 'none'
            });
            updateUI(); vibrate(10);
        }

        // ── EVAL NODE ──

        function setEvalTab(tab) {
            currentEvalTab = tab;
            ['sum', 'count', 'sets', 'list'].forEach(t => {
                const btn = document.getElementById('eval-tab-' + t);
                if (t === tab) {
                    btn.classList.add('bg-sky-500/20', 'text-sky-400', 'border-sky-500/30');
                    btn.classList.remove('text-slate-500', 'border-white/10', 'bg-[#020617]');
                } else {
                    btn.classList.remove('bg-sky-500/20', 'text-sky-400', 'border-sky-500/30');
                    btn.classList.add('text-slate-500', 'border-white/10', 'bg-[#020617]');
                }
            });
            if (evalCriteria[tab].length === 0) {
                let op = '', val = '', mode = 'NUM';
                if (tab === 'sum') { op = document.getElementById('rule-sum-op').value; val = 'overall'; mode = 'VAR'; }
                else if (tab === 'count') { op = document.getElementById('rule-count-op').value; val = document.getElementById('rule-count-val').value; }
                else if (tab === 'sets') { op = document.getElementById('rule-sets-op').value; val = document.getElementById('rule-sets-val').value; }
                if (op) evalCriteria[tab].push({ viewOnly: false, op, mode, numVal: val, varVal: 'target', gate: 'AND' });
            }
            renderEvalCriteria();
        }

        function addEvalCriteria() {
            evalCriteria[currentEvalTab].push({ viewOnly: false, op: '>=', mode: 'NUM', numVal: '0', varVal: 'target', gate: 'AND' });
            renderEvalCriteria(); vibrate(5);
        }


        function toggleEvalGate(idx) {
            const gates = ['AND', 'OR', 'AND/OR'];
            const c = evalCriteria[currentEvalTab][idx];
            c.gate = gates[(gates.indexOf(c.gate) + 1) % gates.length];
            renderEvalCriteria();
        }
        function toggleEvalViewOnly(idx, val) { evalCriteria[currentEvalTab][idx].viewOnly = val; }
        function removeEvalCriteria(idx) { evalCriteria[currentEvalTab].splice(idx, 1); renderEvalCriteria(); }
        function updateEvalCriteria(idx, key, val) { evalCriteria[currentEvalTab][idx][key] = val; _syncEvalToEngine(); }
        function setEvalCriteriaMode(idx, mode) { evalCriteria[currentEvalTab][idx].mode = mode; renderEvalCriteria(); }

        function _syncEvalToEngine() {
            const tab = currentEvalTab;
            const first = (evalCriteria[tab] || [])[0];
            if (!first) return;
            if (tab === 'sum') { document.getElementById('rule-sum-op').value = first.op; }
            else if (tab === 'count') { document.getElementById('rule-count-op').value = first.op; document.getElementById('rule-count-val').value = first.numVal; }
            else if (tab === 'sets') { document.getElementById('rule-sets-op').value = first.op; document.getElementById('rule-sets-val').value = first.numVal; }
            updateRulesUI();
        }

        // ── REROLL/EXPLODE NODE ──

        function setRerollMode(mode) {
            rerollMode = mode;
            const numTab = document.getElementById('ne-reroll-num-tab');
            const varTab = document.getElementById('ne-reroll-var-tab');
            const numDiv = document.getElementById('ne-reroll-num');
            const varDiv = document.getElementById('ne-reroll-var');
            if (!numTab) return;
            const active = ['bg-sky-500/20', 'text-sky-400'], inactive = ['text-slate-500'];
            [numTab, varTab].forEach(t => { t.classList.remove(...active, ...inactive); t.classList.add(...inactive); });
            if (mode === 'NUM') {
                numTab.classList.remove(...inactive); numTab.classList.add(...active);
                numDiv.classList.remove('hidden'); varDiv.classList.add('hidden');
            } else {
                varTab.classList.remove(...inactive); varTab.classList.add(...active);
                numDiv.classList.add('hidden'); varDiv.classList.remove('hidden');
            }
        }

        function updateRerollEditorUI() {
            const op = document.getElementById('ne-reroll-op').value;
            document.getElementById('ne-reroll-val-area').classList.toggle('hidden', !op);
        }

        function adjustRerollVal(delta) {
            const inp = document.getElementById('ne-reroll-num-input');
            inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta);
            vibrate(5);
        }

        function applyRerollRule() {
            const op = document.getElementById('ne-reroll-op').value;
            const isExplode = document.getElementById('ne-explode-check').checked;
            const val = rerollMode === 'NUM' ? (parseInt(document.getElementById('ne-reroll-num-input').value) || 0) : null;
            if (isExplode) {
                document.getElementById('rule-explode-op').value = op;
                if (val !== null) document.getElementById('rule-explode-val').value = val;
            } else {
                document.getElementById('rule-reroll-op').value = op;
                if (val !== null) document.getElementById('rule-reroll-val').value = val;
            }
            updateRulesUI(); vibrate(10);
        }

        // ── ADV/DIS ──
        // Clicking ADV/DIS directly toggles the modifier (no node editor needed)
        function handleAdvDisBtnClick(type) {
            applyModifier(type);
        }

        // ── OPERATOR QUEUE ──

        function addOperatorToQueue(op) {
            activeLoadoutId = null;
            const lastChip = engine.queue[engine.queue.length - 1];
            const binaryOps = ['+', '-', '*', '/'];

            if (binaryOps.includes(op)) {
                if (!lastChip) return;
                if (lastChip.nodeType === 'operator' && lastChip.operator !== ')') return;
            } else if (op === ')') {
                let openCount = 0;
                let closeCount = 0;
                engine.queue.forEach(c => {
                    if (c.nodeType === 'operator') {
                        if (c.operator === '(') openCount++;
                        if (c.operator === ')') closeCount++;
                    }
                });
                if (openCount <= closeCount) return;
                if (!lastChip) return;
                if (lastChip.nodeType === 'operator' && lastChip.operator !== ')') return;
            }

            if (op === '(') {
                if (lastChip && (
                    lastChip.nodeType === 'node' ||
                    lastChip.nodeType === 'number' ||
                    lastChip.nodeType === 'modifier' ||
                    (lastChip.nodeType === 'operator' && lastChip.operator === ')')
                )) {
                    engine.queue.push({ nodeType: 'operator', operator: '+', roundMode: 'none' });
                }
            }
            engine.queue.push({ nodeType: 'operator', operator: op, roundMode: 'none' });
            autoExpandRollPad();
            updateUI(); vibrate(5);
            if (op === '/') {
                editQueueChip(engine.queue.length - 1);
            }
        }




        function adjustRuleVal(type, delta) {
            let input, opSelect;
            if (type === 'countThresh') {
                opSelect = document.getElementById('rule-count-thresh-op');
                input = document.getElementById('rule-count-thresh-val');
            } else {
                opSelect = document.getElementById(`rule-${type}-op`);
                input = document.getElementById(`rule-${type}-val`);
            }
            if (!opSelect || !opSelect.value) return;

            let val = parseInt(input.value) || 0;
            val += delta;
            if (val < 0) val = 0;
            input.value = val;
            updateRulesUI();
        }

        function updateRulesUI(fromInput = false) {
            ['reroll', 'explode', 'sets'].forEach(type => {
                const opEl = document.getElementById(`rule-${type}-op`);
                if (!opEl) return;
                const op = opEl.value;
                const container = document.getElementById(`rule-${type}-input-container`);
                const input = document.getElementById(`rule-${type}-val`);

                if (op) {
                    if (container) container.classList.remove('opacity-30', 'pointer-events-none');
                    if (input && !fromInput && !input.value) input.value = '0';
                } else {
                    if (container) container.classList.add('opacity-30', 'pointer-events-none');
                    if (input && !fromInput) input.value = '';
                }
            });

            // Count threshold: gate the val select based on whether op is set
            const threshOp = document.getElementById('rule-count-thresh-op')?.value;
            const threshValEl = document.getElementById('rule-count-thresh-val');
            if (threshOp) {
                if (threshValEl) threshValEl.classList.remove('opacity-30', 'pointer-events-none');
            } else {
                if (threshValEl) threshValEl.classList.add('opacity-30', 'pointer-events-none');
            }

            // Update target mode button styles and containers
            const sumBtn = document.getElementById('target-mode-sum');
            const countBtn = document.getElementById('target-mode-count');
            const listBtn = document.getElementById('target-mode-list');
            const sumContainer = document.getElementById('sum-target-inputs');
            const countContainer = document.getElementById('count-target-inputs');
            const listContainer = document.getElementById('list-target-inputs');
            const overallTargetContainer = document.getElementById('overall-target-container');

            [sumBtn, countBtn, listBtn].forEach(btn => {
                btn.classList.remove('plasma-highlight', 'text-[#00d4ff]', 'text-slate-500');
            });

            sumContainer.classList.add('hidden');
            countContainer.classList.add('hidden');
            listContainer.classList.add('hidden');

            if (currentTargetMode === 'sum') {
                sumBtn.classList.add('plasma-highlight');
                countBtn.classList.add('text-slate-500');
                listBtn.classList.add('text-slate-500');
                sumContainer.classList.remove('hidden');
                overallTargetContainer?.classList.remove('opacity-30', 'pointer-events-none');

                const sumOp = document.getElementById('rule-sum-op').value;
                const sumValEl = document.getElementById('rule-sum-val');
                if (sumOp) {
                    sumValEl.classList.remove('opacity-30', 'pointer-events-none');
                } else {
                    sumValEl.classList.add('opacity-30', 'pointer-events-none');
                }
            } else if (currentTargetMode === 'count') {
                sumBtn.classList.add('text-slate-500');
                countBtn.classList.add('plasma-highlight');
                listBtn.classList.add('text-slate-500');
                countContainer.classList.remove('hidden');
                overallTargetContainer?.classList.remove('opacity-30', 'pointer-events-none');
            } else { // LIST
                sumBtn.classList.add('text-slate-500');
                countBtn.classList.add('text-slate-500');
                listBtn.classList.add('plasma-highlight');
                listContainer.classList.remove('hidden');
                overallTargetContainer?.classList.add('opacity-30', 'pointer-events-none');
            }

            let targetOp = '';
            let targetVal = null;
            let countThreshOp = '';
            let countThreshVal = null;
            if (currentTargetMode === 'sum') {
                targetOp = document.getElementById('rule-sum-op').value;
                targetVal = document.getElementById('rule-sum-val').value;
            } else if (currentTargetMode === 'count') {
                targetOp = document.getElementById('rule-count-op').value;
                let parsed = parseInt(document.getElementById('rule-count-val').value);
                targetVal = isNaN(parsed) ? 0 : parsed;
                countThreshOp = document.getElementById('rule-count-thresh-op').value;
                // countThreshVal is now a select (string: 'overall' | 'varX')
                countThreshVal = document.getElementById('rule-count-thresh-val').value || null;
            }

            let rVal = parseInt(document.getElementById('rule-reroll-val').value);
            let eVal = parseInt(document.getElementById('rule-explode-val').value);
            let sVal = parseInt(document.getElementById('rule-sets-val').value);

            engine.updateRules({
                rerollOp: document.getElementById('rule-reroll-op').value,
                rerollVal: isNaN(rVal) ? null : rVal,
                explodeOp: document.getElementById('rule-explode-op').value,
                explodeVal: isNaN(eVal) ? null : eVal,
                targetMode: currentTargetMode,
                targetOp: targetOp,
                targetVal: targetVal,
                countThreshOp: countThreshOp,
                countThreshVal: countThreshVal,
                setsOp: document.getElementById('rule-sets-op').value,
                setsVal: isNaN(sVal) ? null : sVal,
                evalCriteria: JSON.parse(JSON.stringify(engine.rollRules.evalCriteria || evalCriteria))
            });
            updateUI();
        }

        function toggleSound() {
            if (isVolumeOpen) return;
            soundEnabled = !soundEnabled;
            updateSoundUI();
            saveSettings();
            vibrate(5);
        }

        function updateSoundUI() {
            const iconOn = document.getElementById('sound-icon-on');
            const iconOff = document.getElementById('sound-icon-off');
            const btn = document.getElementById('sound-btn');

            if (soundEnabled) {
                iconOn.classList.remove('hidden');
                iconOff.classList.add('hidden');
                btn.classList.add('text-[#94a3b8]');
                btn.classList.remove('text-slate-600');
            } else {
                iconOn.classList.add('hidden');
                iconOff.classList.remove('hidden');
                btn.classList.add('text-slate-600');
                btn.classList.remove('text-[#94a3b8]');
            }
        }

        function toggleHeader() {
            headerHidden = !headerHidden;
            document.body.classList.toggle('header-hidden', headerHidden);
            saveSettings();
            vibrate(5);
        }

        function handleSoundStart(e) {
            soundTimer = setTimeout(() => {
                isVolumeOpen = true;
                isDraggingVolume = true;
                showVolumeSlider();

                window.addEventListener('mousemove', handleGlobalDrag);
                window.addEventListener('touchmove', handleGlobalDrag, { passive: false });
                window.addEventListener('mouseup', handleGlobalUp);
                window.addEventListener('touchend', handleGlobalUp);
            }, 500);
        }

        function handleSoundEnd(e) {
            clearTimeout(soundTimer);
        }

        function handleGlobalDrag(e) {
            if (!isDraggingVolume) return;
            e.preventDefault();

            const slider = document.getElementById('volume-slider');
            const rect = slider.getBoundingClientRect();
            const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;

            let percentage = (clientX - rect.left) / rect.width;
            percentage = Math.max(0, Math.min(1, percentage));

            slider.value = percentage;
            updateVolume(percentage);
        }

        function handleGlobalUp() {
            isDraggingVolume = false;
            window.removeEventListener('mousemove', handleGlobalDrag);
            window.removeEventListener('touchmove', handleGlobalDrag);
            window.removeEventListener('mouseup', handleGlobalUp);
            window.removeEventListener('touchend', handleGlobalUp);
        }

        function showVolumeSlider() {
            const overlay = document.getElementById('volume-overlay');
            overlay.classList.add('show');
            vibrate(15);

            const closeHandler = (e) => {
                if (!overlay.contains(e.target) && !document.getElementById('sound-btn').contains(e.target)) {
                    overlay.classList.remove('show');
                    document.removeEventListener('mousedown', closeHandler);
                    setTimeout(() => isVolumeOpen = false, 100);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
        }

        function updateVolume(val) {
            volume = parseFloat(val);
            rollSound.volume = volume;

            const slider = document.getElementById('volume-slider');
            if (slider) {
                const percent = volume * 100;
                slider.style.background = `linear-gradient(to right, var(--accent-azure) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
            }

            if (volume > 0 && !soundEnabled) {
                soundEnabled = true;
                updateSoundUI();
            }
            saveSettings();
        }

        function playRollSound() {
            if (!soundEnabled) return;
            rollSound.currentTime = 0;
            rollSound.play().catch(e => console.log("Sound play blocked"));
        }

        function toggleMode() {
            const container = document.getElementById('main-container');
            const labels = document.querySelectorAll('.mode-label');
            if (container.classList.contains('mode-dice')) {
                container.classList.remove('mode-dice');
                container.classList.add('mode-arsenal');
                labels.forEach(l => l.innerText = 'Dice');
            } else {
                container.classList.remove('mode-arsenal');
                container.classList.add('mode-dice');
                labels.forEach(l => l.innerText = 'Arsenal');
            }
            vibrate(10);
        }

        function changeQueue(sides, delta) {
            vibrate(5);
            activeLoadoutId = null;
            engine.changeQueue(sides, delta);
            if (delta > 0) autoExpandRollPad();
            updateUI();
        }

        function backspaceQueue() {
            vibrate(10);
            activeLoadoutId = null;
            engine.backspaceQueue();
            updateUI();
        }

        // clearQueue is defined fully below

        function adjustFlatMod(val) {
            activeLoadoutId = null;
            engine.adjustFlatMod(val);
            if (val > 0) autoExpandRollPad();
            updateUI();
        }

        function setFlatMod(val) {
            activeLoadoutId = null;
            const num = parseInt(val) || 0;
            engine.flatMod = num !== 0 ? [{
                type: 'literal',
                value: Math.abs(num),
                operator: num >= 0 ? '+' : '-',
                multiplierType: 'none',
                multiplierValue: 1,
                divisorType: 'none',
                divisorValue: 1,
                roundMode: 'none'
            }] : [];
            if (num !== 0) autoExpandRollPad();
            updateUI();
        }

        function adjustOverallTarget(val) {
            activeLoadoutId = null;
            engine.adjustOverallTarget(val);
            if (val > 0) autoExpandRollPad();
            updateUI();
        }

        function setOverallTarget(val) {
            activeLoadoutId = null;
            if (val === "") {
                engine.overallTarget = null;
            } else {
                engine.overallTarget = parseInt(val) || null;
                autoExpandRollPad();
            }
            updateUI();
        }

        function applyModifier(type) {
            vibrate(10);
            activeLoadoutId = null;
            engine.applyModifier(type);
            autoExpandRollPad();
            updateUI();
        }

        function clearQueue() {
            activeLoadoutId = null;
            engine.clearQueue();
            currentTargetMode = 'sum';

            document.getElementById('rule-reroll-op').value = "";
            document.getElementById('rule-reroll-val').value = "";
            document.getElementById('rule-explode-op').value = "";
            document.getElementById('rule-explode-val').value = "";
            document.getElementById('rule-sum-op').value = "";
            document.getElementById('rule-sum-val').value = "overall";
            document.getElementById('rule-count-op').value = ">=";
            document.getElementById('rule-count-val').value = "";
            document.getElementById('rule-count-thresh-op').value = "";
            document.getElementById('rule-count-thresh-val').value = "";
            document.getElementById('rule-sets-op').value = "";
            document.getElementById('rule-sets-val').value = "";

            // Reset node editor state
            evalCriteria.sum = []; evalCriteria.count = []; evalCriteria.sets = []; evalCriteria.list = [];
            closeNodeEditor();

            updateRulesUI();
            resetDisplayToIdle();
            updateUI();
        }

        function updateDisplay(val, classAction = null) {
            const hero = document.getElementById('result-hero');
            if (!hero) return;

            hero.innerText = val;
            if (classAction === 'rolling') {
                hero.classList.add('is-rolling');
            } else if (classAction === 'stop') {
                hero.classList.remove('is-rolling');
            } else if (classAction) {
                hero.className = hero.className.split(' ').filter(c => !c.startsWith('crit-')).join(' ');
                hero.classList.add(classAction);
            } else {
                hero.className = hero.className.split(' ').filter(c => !c.startsWith('crit-')).join(' ');
            }
        }

        function resetDisplayToIdle() {
            const main = document.getElementById('result-main');
            const oldHeight = main.offsetHeight;
            main.style.height = oldHeight + 'px';

            const hero = document.getElementById('result-hero');
            hero.innerText = '0';
            hero.classList.remove('is-rolling', 'hidden');
            hero.className = hero.className.split(' ').filter(c => !c.startsWith('crit-')).join(' ');

            const label = document.getElementById('result-label');
            label.classList.add('hidden');
            label.innerHTML = '';

            document.getElementById('result-badges').classList.add('hidden');
            document.getElementById('result-badges').innerHTML = '';

            const breakdown = document.getElementById('result-breakdown');
            breakdown.classList.remove('hidden');
            breakdown.innerHTML = '<span class="text-sm text-slate-300 tracking-wide">READY</span>';

            const cascade = document.getElementById('chain-cascade-container');
            if (cascade) {
                cascade.classList.add('hidden');
                cascade.innerHTML = '';
            }

            // Animate height back to idle
            requestAnimationFrame(() => {
                main.style.transition = 'none';
                main.style.height = 'auto';
                const newHeight = main.offsetHeight;
                main.style.height = oldHeight + 'px';
                main.offsetHeight; // reflow
                main.style.transition = '';
                main.style.height = newHeight + 'px';
            });
        }

        function fmtOp(op) {
            if (!op) return "";
            return op.replace('>=', '≥').replace('<=', '≤').replace('==', '=');
        }

        function updateUI() {
            const display = document.getElementById('queue-display');
            const advBtn = document.getElementById('adv-btn');
            const disBtn = document.getElementById('dis-btn');
            const advSub = document.getElementById('adv-sub');
            const disSub = document.getElementById('dis-sub');
            const modInput = document.getElementById('flat-mod-input');
            const rollBtn = document.getElementById('roll-button');
            const saveBtn = document.getElementById('save-queue-btn');

            const hasFlatMod = engine.queue.some(c => c.nodeType === 'modifier');
            const hasDice = engine.queue.some(c => c.nodeType === 'node');
            const canRoll = engine.isQueueValid();
            rollBtn.disabled = !canRoll;
            rollBtn.style.opacity = canRoll ? '1' : '0.4';
            rollBtn.style.filter = canRoll ? 'none' : 'grayscale(1)';
            rollBtn.style.pointerEvents = canRoll ? 'auto' : 'none';

            // 1. Build Unified Chips
            let basePartsHtml = "";
            if (engine.queue.length > 0) {
                basePartsHtml = engine.queue.map((node, idx) => {
                    if (node.nodeType === 'node') {
                        let displayText = `${node.count}d${node.sides}`;
                        if (node.rerollOp && node.rerollVal !== null) {
                            const formattedOp = node.rerollOp.replace('>=', '≥').replace('<=', '≤');
                            displayText += ` rr${formattedOp}${node.rerollVal}`;
                        }
                        if (node.explodeOp && node.explodeVal !== null) {
                            const formattedOp = node.explodeOp.replace('>=', '≥').replace('<=', '≤');
                            displayText += ` ex${formattedOp}${node.explodeVal}`;
                        }
                        return `
                            <div class="group relative flex items-center justify-center gap-1 bg-[#020617] border border-sky-500/20 hover:border-sky-500/50 text-sky-400 px-3 h-[2rem] rounded-xl text-xs font-black transition-all cursor-pointer select-none"
                                 onclick="editQueueChip(${idx}, event)">
                                <span>${displayText}</span>
                                <button class="w-0 opacity-0 group-hover:w-4 group-hover:ml-1.5 group-hover:opacity-100 focus:w-4 focus:ml-1.5 focus:opacity-100 h-4 flex-shrink-0 flex items-center justify-center bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-full text-[9px] transition-all duration-200 overflow-hidden"
                                        onclick="removeQueueChip(${idx}, event)" title="Remove">✕</button>
                            </div>
                        `;
                    } else if (node.nodeType === 'modifier' || node.nodeType === 'number') {
                        const op = node.operator === '-' ? '-' : '+';
                        let valStr = node.value;
                        let inlineResolved = "";
                        if (node.type === 'variable') {
                            const resolvedVar = window.getActiveCharacterVariable(node.value);
                            if (resolvedVar !== null) {
                                inlineResolved = `<span class="opacity-60 text-[0.85em] ml-0.5">(${resolvedVar})</span>`;
                            }
                        }

                        let mathIndicator = "";
                        if (node.multiplierType && node.multiplierType !== 'none') {
                            mathIndicator += ` ×${node.multiplierValue}`;
                        }
                        if (node.divisorType && node.divisorType !== 'none') {
                            mathIndicator += ` /${node.divisorValue}`;
                        }
                        if (node.roundMode && node.roundMode !== 'none') {
                            mathIndicator += ` (${node.roundMode === 'up' ? '↑' : node.roundMode === 'down' ? '↓' : '≈'})`;
                        }

                        return `
                            <div class="group relative flex items-center justify-center gap-1 bg-[#020617] border border-emerald-500/20 hover:border-emerald-500/50 text-emerald-400 px-3 h-[2rem] rounded-xl text-xs font-black transition-all cursor-pointer select-none"
                                 onclick="editQueueChip(${idx}, event)">
                                <span class="text-[10px] opacity-75">${op === '-' ? '➖' : '➕'}</span>
                                <span>${valStr}${inlineResolved}${mathIndicator}</span>
                                <button class="w-0 opacity-0 group-hover:w-4 group-hover:ml-1.5 group-hover:opacity-100 focus:w-4 focus:ml-1.5 focus:opacity-100 h-4 flex-shrink-0 flex items-center justify-center bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-full text-[9px] transition-all duration-200 overflow-hidden"
                                        onclick="removeQueueChip(${idx}, event)" title="Remove">✕</button>
                            </div>
                        `;
                    } else if (node.nodeType === 'operator') {
                        const op = node.operator;
                        const isDivision = op === '/';
                        const isAdvDis = op === 'ADV' || op === 'DIS';

                        let roundIndicator = '';
                        if (isDivision && node.roundMode && node.roundMode !== 'none') {
                            roundIndicator = `<span class="ml-0.5 opacity-70">${node.roundMode === 'up' ? '↑' : '↓'}</span>`;
                        }

                        const opDisplay = op === '*' ? '×' : op === '/' ? '/' : (isAdvDis ? `${op}${node.modifierLevel > 1 ? '+' + (node.modifierLevel - 1) : ''}` : op);

                        let chipColor = 'border-slate-600/30 hover:border-slate-500/40 text-slate-400 bg-[#020617]';
                        if (isDivision) {
                            chipColor = 'border-cyan-500/30 hover:border-cyan-500/60 text-cyan-400 bg-[#020617]';
                        } else if (op === 'ADV') {
                            chipColor = 'border-[#00d4ff]/30 hover:border-[#00d4ff]/60 text-[#00d4ff] bg-[#020617] shadow-[0_0_8px_rgba(0,212,255,0.1)]';
                        } else if (op === 'DIS') {
                            chipColor = 'border-[#6366f1]/30 hover:border-[#6366f1]/60 text-[#6366f1] bg-[#020617] shadow-[0_0_8px_rgba(99,102,241,0.1)]';
                        }

                        const clickHandler = isDivision ? `onclick="editQueueChip(${idx}, event)"` : '';
                        const cursorClass = isDivision ? 'cursor-pointer' : 'cursor-default';
                        return `
                            <div class="group relative flex items-center justify-center gap-0.5 ${chipColor} px-3 h-[2rem] rounded-xl text-xs font-black transition-all select-none ${cursorClass}" ${clickHandler}>
                                <span>${opDisplay}${roundIndicator}</span>
                                <button class="w-0 opacity-0 group-hover:w-4 group-hover:ml-1.5 group-hover:opacity-100 focus:w-4 focus:ml-1.5 focus:opacity-100 h-4 flex-shrink-0 flex items-center justify-center bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-full text-[9px] transition-all duration-200 overflow-hidden"
                                        onclick="removeQueueChip(${idx}, event)" title="Remove">✕</button>
                            </div>
                        `;
                    }
                    return "";
                }).join("");
            }

            // 2. Build Rules (RR, EX)
            let rulesParts = [];
            const rules = engine.rollRules;
            const rrActive = rules.rerollOp && rules.rerollVal !== null;
            const exActive = rules.explodeOp && rules.explodeVal !== null;

            if (rrActive) rulesParts.push(`RR${fmtOp(rules.rerollOp)}${rules.rerollVal}`);
            if (exActive) rulesParts.push(`EX${fmtOp(rules.explodeOp)}${rules.explodeVal}`);

            // 3. Build Mode & Target
            let modeLabel = "";
            if (rules.targetMode === 'list') {
                modeLabel = "LIST";
            } else if (rules.targetMode === 'count') {
                modeLabel = "COUNT";
                if (rules.targetOp) modeLabel += `${fmtOp(rules.targetOp)}${rules.targetVal}`;
            } else {
                if (rules.targetOp) modeLabel = `SUM${fmtOp(rules.targetOp)}${rules.targetVal}`;
            }
            if (engine.overallTarget !== null) {
                if (modeLabel === "") modeLabel = "SUM";
                modeLabel += ` ≥${engine.overallTarget}`;
            }

            // Build Evals HTML for Left Column
            let evalsHtmlList = [];
            const activeMode = rules.targetMode || 'sum';

            // Collect all criteria from all types
            let hasAnyCriteria = false;
            ['sum', 'count', 'sets', 'list'].forEach(type => {
                const criteriaList = rules.evalCriteria ? rules.evalCriteria[type] : [];
                if (type === 'list' && activeMode === 'list') {
                    // List mode itself is a criteria/mode indicator
                    evalsHtmlList.push(`<span onclick="openNodeEditor('eval')" class="cursor-pointer bg-sky-500/10 text-sky-400 text-xs px-2.5 h-[2rem] flex items-center justify-center rounded-xl border border-sky-500/20 font-black whitespace-nowrap opacity-90 text-center hover:bg-sky-500/20 transition-all">LIST</span>`);
                    hasAnyCriteria = true;
                } else if (criteriaList && criteriaList.length > 0) {
                    criteriaList.forEach(c => {
                        let opDisp = fmtOp(c.op || '>=');
                        let valDisp = c.numVal;
                        if (c.mode === 'VAR') {
                            valDisp = c.varVal === 'target' ? 'TGT' : c.varVal;
                        }
                        const text = `${type.toUpperCase()}${opDisp}${valDisp}`;
                        evalsHtmlList.push(`<span onclick="openNodeEditor('eval')" class="cursor-pointer bg-sky-500/10 text-sky-400 text-xs px-2.5 h-[2rem] flex items-center justify-center rounded-xl border border-sky-500/20 font-black whitespace-nowrap opacity-90 text-center shadow-[0_0_8px_rgba(0,212,255,0.15)] hover:bg-sky-500/20 transition-all">${text}</span>`);
                    });
                    hasAnyCriteria = true;
                }
            });

            // Fallback if no criteria are defined in any list
            if (!hasAnyCriteria) {
                let modeLabelOnly = activeMode.toUpperCase();
                if (activeMode === 'count' && rules.targetOp) {
                    modeLabelOnly += `${fmtOp(rules.targetOp)}${rules.targetVal}`;
                } else if (activeMode === 'sum' && rules.targetOp) {
                    modeLabelOnly = `SUM${fmtOp(rules.targetOp)}${rules.targetVal}`;
                } else if (activeMode === 'sum' && engine.overallTarget !== null) {
                    modeLabelOnly = `SUM≥${engine.overallTarget}`;
                } else if (activeMode === 'sets' && rules.setsOp) {
                    modeLabelOnly = `SETS${fmtOp(rules.setsOp)}${rules.setsVal}`;
                }
                evalsHtmlList.push(`<span onclick="openNodeEditor('eval')" class="cursor-pointer bg-sky-500/10 text-sky-400 text-xs px-2.5 h-[2rem] flex items-center justify-center rounded-xl border border-sky-500/20 font-black whitespace-nowrap opacity-90 text-center shadow-[0_0_8px_rgba(0,212,255,0.15)] hover:bg-sky-500/20 transition-all">${modeLabelOnly}</span>`);
            }
            const evalsHtml = evalsHtmlList.join('');

            const hasBaseContent = basePartsHtml !== "" || engine.activeModifier !== null || engine.overallTarget !== null;
            const hasRules = rrActive || exActive;

            const modHtml = engine.activeModifier ? `
                <div class="group relative flex items-center justify-center gap-1 bg-[#020617] border border-indigo-500/20 hover:border-indigo-500/50 text-indigo-400 px-3 h-[2rem] rounded-xl text-xs font-black transition-all cursor-default select-none">
                    <span class="text-[10px] opacity-75">⚡</span>
                    <span>${engine.activeModifier}${engine.modifierLevel > 1 ? '+' + (engine.modifierLevel - 1) : ''}</span>
                    <button class="w-0 opacity-0 group-hover:w-4 group-hover:ml-1.5 group-hover:opacity-100 focus:w-4 focus:ml-1.5 focus:opacity-100 h-4 flex-shrink-0 flex items-center justify-center bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-full text-[9px] transition-all duration-200 overflow-hidden"
                            onclick="removeActiveModifier(event)" title="Remove">✕</button>
                </div>
            ` : "";
            const rulesHtml = rulesParts.length > 0 ? rulesParts.map(r => `<span class="bg-slate-500/10 text-slate-400 text-xs px-2.5 h-[2rem] flex items-center justify-center rounded-xl border border-slate-500/20 font-bold whitespace-nowrap opacity-80">${r}</span>`).join("") : "";

            const rightColumnContent = (hasBaseContent || hasRules)
                ? `${basePartsHtml} ${modHtml} ${rulesHtml}`
                : '<span class="text-sky-400/20">EMPTY QUEUE</span>';

            display.innerHTML = `
                <div class="flex items-center gap-3.5 w-full justify-between">
                    <!-- Left Column: Evals Stack -->
                    <div class="flex flex-col gap-1 items-stretch justify-center min-w-[5rem] max-w-[8rem] shrink-0">
                        ${evalsHtml}
                    </div>
                    <!-- Vertical Divider Line -->
                    <div class="w-px h-8 self-stretch bg-white/10"></div>
                    <!-- Right Column: Queue Chips -->
                    <div class="flex flex-wrap items-center justify-center gap-1.5 flex-1">
                        ${rightColumnContent}
                    </div>
                </div>
            `;

            if (modInput && document.activeElement !== modInput) {
                let resolvedVal = 0;
                if (Array.isArray(engine.flatMod)) {
                    resolvedVal = engine.resolveModifier(engine.flatMod);
                } else if (typeof engine.flatMod === 'string' && engine.flatMod !== '') {
                    const resolved = window.getActiveCharacterVariable(engine.flatMod);
                    resolvedVal = resolved !== null ? resolved : 0;
                } else {
                    resolvedVal = Number(engine.flatMod) || 0;
                }
                modInput.value = resolvedVal > 0 ? `+${resolvedVal}` : (resolvedVal === 0 ? "0" : resolvedVal);
            }
            const overallTargetInput = document.getElementById('overall-target-input');
            if (overallTargetInput && document.activeElement !== overallTargetInput) {
                overallTargetInput.value = engine.overallTarget !== null ? engine.overallTarget : '';
            }

            // Sync toggle buttons with queue ending ADV/DIS operator state
            const lastChip = engine.queue[engine.queue.length - 1];
            const currentActiveMod = (lastChip && lastChip.nodeType === 'operator' && (lastChip.operator === 'ADV' || lastChip.operator === 'DIS')) ? lastChip.operator : null;
            const currentActiveModLevel = currentActiveMod ? lastChip.modifierLevel : 0;

            const canMod = true; // Buttons are no longer disabled when empty

            advBtn.disabled = false;
            disBtn.disabled = false;

            const advPip = document.getElementById('adv-pip');
            const advLabel = document.getElementById('adv-label');
            if (currentActiveMod === 'ADV') {
                advBtn.style.borderColor = '#00d4ff';
                advBtn.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.3)';
                advPip.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-[#00d4ff] shadow-[0_0_12px_rgba(0, 212, 255, 0.6)] transition-all duration-300';
                advLabel.classList.add('text-white');
                advLabel.classList.remove('text-slate-500');
            } else if (engine.activeModifier === 'ADV') {
                advBtn.style.borderColor = '#00d4ff';
                advBtn.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.3)';
                advPip.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-[#00d4ff] shadow-[0_0_12px_rgba(0, 212, 255, 0.6)] transition-all duration-300';
                advLabel.classList.add('text-white');
                advLabel.classList.remove('text-slate-500');
            } else {
                advBtn.style.borderColor = '';
                advBtn.style.boxShadow = '';
                advPip.className = 'absolute left-0 top-0 bottom-0 w-1 bg-white/5 transition-all duration-300 group-hover:bg-[#00d4ff]/30';
                advLabel.classList.remove('text-white');
                advLabel.classList.add('text-slate-500');
            }

            const disPip = document.getElementById('dis-pip');
            const disLabel = document.getElementById('dis-label');
            if (currentActiveMod === 'DIS') {
                disBtn.style.borderColor = '#6366f1'; /* DIS is traditionally a different 'charge' */
                disBtn.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.3)';
                disPip.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-[#6366f1] shadow-[0_0_12px_rgba(99, 102, 241, 0.6)] transition-all duration-300';
                disLabel.classList.add('text-white');
                disLabel.classList.remove('text-slate-500');
            } else if (engine.activeModifier === 'DIS') {
                disBtn.style.borderColor = '#6366f1'; /* DIS is traditionally a different 'charge' */
                disBtn.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.3)';
                disPip.className = 'absolute left-0 top-0 bottom-0 w-1.5 bg-[#6366f1] shadow-[0_0_12px_rgba(99, 102, 241, 0.6)] transition-all duration-300';
                disLabel.classList.add('text-white');
                disLabel.classList.remove('text-slate-500');
            } else {
                disBtn.style.borderColor = '';
                disBtn.style.boxShadow = '';
                disPip.className = 'absolute left-0 top-0 bottom-0 w-1 bg-white/5 transition-all duration-300 group-hover:bg-[#6366f1]/30';
                disLabel.classList.remove('text-white');
                disLabel.classList.add('text-slate-500');
            }

            // Update Dynamic Tooltips
            const advLevel = (currentActiveMod === 'ADV' ? currentActiveModLevel : 0) || (engine.activeModifier === 'ADV' ? engine.modifierLevel : 0);
            const disLevel = (currentActiveMod === 'DIS' ? currentActiveModLevel : 0) || (engine.activeModifier === 'DIS' ? engine.modifierLevel : 0);
            const advDesc = advLevel > 1 ? `Plus ${advLevel - 1}` : "";
            const disDesc = disLevel > 1 ? `Plus ${disLevel - 1}` : "";
            const rollsAdv = 1 + (advLevel || 1);
            const rollsDis = 1 + (disLevel || 1);

            advBtn.title = `Advantage ${advDesc}: Roll ${rollsAdv} dice and take the highest result.`.replace('  ', ' ');
            disBtn.title = `Disadvantage ${disDesc}: Roll ${rollsDis} dice and take the lowest result.`.replace('  ', ' ');
            document.getElementById('adv-rules-toggle').title = "Advanced Rules & Settings";

            if (!canMod) {
                advBtn.title = "Advantage (Locked): Add dice to the queue to enable.";
                disBtn.title = "Disadvantage (Locked): Add dice to the queue to enable.";
            }



            const iqBtn = document.getElementById('insta-queue-btn');
            const iqLabel = document.getElementById('insta-queue-label');
            if (iqLabel) {
                iqLabel.innerHTML = isInstaQueue;
            }

            const aqBtn = document.getElementById('arsenal-queue-btn');
            const aqLabel = document.getElementById('arsenal-queue-label');
            if (aqLabel) {
                aqLabel.innerHTML = isArsenalQueue;
            }

            // Tooltips
            if (iqBtn) {
                if (isInstaQueue === 'Queue Only') {
                    iqBtn.title = "Quick rolls are added to the queue without rolling.";
                } else if (isInstaQueue === 'Roll & Queue') {
                    iqBtn.title = "Quick rolls are added to the queue and rolled immediately.";
                } else {
                    iqBtn.title = "Quick rolls fire immediately and do not touch your active queue.";
                }
            }
            if (aqBtn) {
                if (isArsenalQueue === 'Queue Only') {
                    aqBtn.title = "Clicking an arsenal loads/replaces your active queue without rolling.";
                } else if (isArsenalQueue === 'Roll & Queue') {
                    aqBtn.title = "Clicking an arsenal rolls it AND replaces your active queue.";
                } else {
                    aqBtn.title = "Clicking an arsenal rolls it WITHOUT changing your active queue.";
                }
            }

            advSub.innerText = (canMod && engine.activeModifier === 'ADV' && engine.modifierLevel > 1) ? `PLUS ${engine.modifierLevel - 1}` : '';
            disSub.innerText = (canMod && engine.activeModifier === 'DIS' && engine.modifierLevel > 1) ? `PLUS ${engine.modifierLevel - 1}` : '';

            saveBtn.disabled = !canRoll;

            const runAuditBtn = document.getElementById('run-audit-btn');
            if (runAuditBtn) {
                runAuditBtn.disabled = !canRoll;
                runAuditBtn.style.opacity = canRoll ? '1' : '0.4';
                runAuditBtn.style.pointerEvents = canRoll ? 'auto' : 'none';
            }

            syncAuditorLabels();
            renderModifierChips();
            updateKeypadValidation();
        }

        function updateKeypadValidation() {
            const plusBtn = document.getElementById('op-plus-btn');
            const minusBtn = document.getElementById('op-minus-btn');
            const multBtn = document.getElementById('op-mult-btn');
            const divBtn = document.getElementById('op-div-btn');
            const openBtn = document.getElementById('op-open-paren-btn');
            const closeBtn = document.getElementById('op-close-paren-btn');

            if (!plusBtn) return;

            const queue = engine.queue || [];
            const lastChip = queue[queue.length - 1];

            const openCount = queue.filter(c => c.nodeType === 'operator' && c.operator === '(').length;
            const closeCount = queue.filter(c => c.nodeType === 'operator' && c.operator === ')').length;

            const isLastDataOrClose = lastChip && (
                lastChip.nodeType === 'node' ||
                lastChip.nodeType === 'number' ||
                lastChip.nodeType === 'modifier' ||
                (lastChip.nodeType === 'operator' && lastChip.operator === ')')
            );

            const mathValid = isLastDataOrClose;

            [plusBtn, minusBtn, multBtn, divBtn].forEach(btn => {
                if (btn) {
                    btn.disabled = !mathValid;
                    btn.style.opacity = mathValid ? '1' : '0.35';
                    btn.style.pointerEvents = mathValid ? 'auto' : 'none';
                }
            });

            if (openBtn) {
                openBtn.disabled = false;
                openBtn.style.opacity = '1';
                openBtn.style.pointerEvents = 'auto';
            }

            const closeValid = (openCount > closeCount) && isLastDataOrClose;
            if (closeBtn) {
                closeBtn.disabled = !closeValid;
                closeBtn.style.opacity = closeValid ? '1' : '0.35';
                closeBtn.style.pointerEvents = closeValid ? 'auto' : 'none';
            }
        }

        function syncAuditorLabels() {
            const title = document.getElementById('auditor-title');
            const context = document.getElementById('auditor-context-label');
            const display = document.getElementById('queue-display');
            if (!title || !context || !display) return;

            title.innerText = "Entropy Check";
            context.innerHTML = display.innerHTML;

            // Adjust styles for the mirrored content to fit the header
            const container = context.querySelector('div');
            if (container) {
                container.classList.remove('justify-center', 'flex-nowrap', '[mask-image:linear-gradient(to_right,white_80%,transparent)]');
                container.classList.add('justify-start', 'flex-wrap', 'w-full', 'mt-1');
            }

            // Clean up the mirrored queue in the Entropy Check so it's not interactable or deletable
            context.querySelectorAll('button').forEach(btn => btn.remove());
            context.querySelectorAll('[onclick]').forEach(el => {
                el.removeAttribute('onclick');
                el.classList.remove('cursor-pointer', 'group');
                el.classList.add('cursor-default');
            });
            context.querySelectorAll('.cursor-pointer').forEach(el => {
                el.classList.remove('cursor-pointer');
                el.classList.add('cursor-default');
            });
        }

        // =========================================================================
        // MODIFIER CHIPS MANAGEMENT
        // =========================================================================
        function toggleNewChipBaseType() {
            const type = document.getElementById('new-node-base-type').value;
            const litInput = document.getElementById('new-node-base-literal');
            const varSelect = document.getElementById('new-node-base-variable');

            if (type === 'variable') {
                litInput.classList.add('hidden');
                varSelect.classList.remove('hidden');
                populateVariablesDropdown(varSelect);
            } else {
                litInput.classList.remove('hidden');
                varSelect.classList.add('hidden');
            }
        }

        function toggleNewChipMultType() {
            const type = document.getElementById('new-node-mult-type').value;
            const litInput = document.getElementById('new-node-mult-literal');
            const varSelect = document.getElementById('new-node-mult-variable');

            if (type === 'literal') {
                litInput.classList.remove('hidden');
                varSelect.classList.add('hidden');
            } else if (type === 'variable') {
                litInput.classList.add('hidden');
                varSelect.classList.remove('hidden');
                populateVariablesDropdown(varSelect);
            } else {
                litInput.classList.add('hidden');
                varSelect.classList.add('hidden');
            }
        }

        function toggleNewChipDivType() {
            const type = document.getElementById('new-node-div-type').value;
            const litInput = document.getElementById('new-node-div-literal');
            const varSelect = document.getElementById('new-node-div-variable');

            if (type === 'literal') {
                litInput.classList.remove('hidden');
                varSelect.classList.add('hidden');
            } else if (type === 'variable') {
                litInput.classList.add('hidden');
                varSelect.classList.remove('hidden');
                populateVariablesDropdown(varSelect);
            } else {
                litInput.classList.add('hidden');
                varSelect.classList.add('hidden');
            }
        }

        var mathOptionsVisible = false;
        function toggleMathOptions() {
            mathOptionsVisible = !mathOptionsVisible;
            const mathPanel = document.getElementById('new-node-math-opts');
            const toggleBtn = document.getElementById('math-options-btn');

            if (mathOptionsVisible) {
                mathPanel.classList.remove('hidden');
                toggleBtn.innerHTML = "<span>⚙ Hide Math Options (× / ÷ / Round)</span>";
            } else {
                mathPanel.classList.add('hidden');
                toggleBtn.innerHTML = "<span>⚙ Show Math Options (× / ÷ / Round)</span>";
            }
        }

        function populateVariablesDropdown(dropdownEl) {
            if (!dropdownEl) return;
            const currentVal = dropdownEl.value;
            const char = characters.find(c => c.id === activeCharacterId);
            let options = "";
            if (char && char.variables) {
                Object.keys(char.variables).forEach(name => {
                    options += `<option value="${name}">${name}</option>`;
                });
            }
            if (!options) {
                options = `<option value="">No Variables</option>`;
            }
            dropdownEl.innerHTML = options;
            if ([...dropdownEl.options].some(o => o.value === currentVal)) {
                dropdownEl.value = currentVal;
            }
        }

        function addNewModifierChip() {
            activeLoadoutId = null;

            const operator = document.getElementById('new-node-operator').value;
            const baseType = document.getElementById('new-node-base-type').value;
            let baseValue;

            if (baseType === 'variable') {
                baseValue = document.getElementById('new-node-base-variable').value;
                if (!baseValue || baseValue === "No Variables") {
                    showModal({ title: 'Add Chip Failed', body: 'No character variable selected.', alertOnly: true });
                    return;
                }
            } else {
                baseValue = parseInt(document.getElementById('new-node-base-literal').value);
                if (isNaN(baseValue)) {
                    showModal({ title: 'Add Chip Failed', body: 'Invalid literal modifier value entered.', alertOnly: true });
                    return;
                }
            }

            // Math inputs
            const multType = document.getElementById('new-node-mult-type').value;
            let multValue = 1;
            if (multType === 'literal') {
                multValue = parseInt(document.getElementById('new-node-mult-literal').value);
                if (isNaN(multValue)) multValue = 1;
            } else if (multType === 'variable') {
                multValue = document.getElementById('new-node-mult-variable').value;
                if (!multValue || multValue === "No Variables") multValue = 1;
            }

            const divType = document.getElementById('new-node-div-type').value;
            let divValue = 1;
            if (divType === 'literal') {
                divValue = parseInt(document.getElementById('new-node-div-literal').value);
                if (isNaN(divValue) || divValue === 0) divValue = 1;
            } else if (divType === 'variable') {
                divValue = document.getElementById('new-node-div-variable').value;
                if (!divValue || divValue === "No Variables") divValue = 1;
            }

            const roundMode = document.getElementById('new-node-round-mode').value;

            const newTerm = {
                type: baseType,
                value: baseValue,
                operator: operator,
                multiplierType: multType,
                multiplierValue: multValue,
                divisorType: divType,
                divisorValue: divValue,
                roundMode: roundMode
            };

            if (!Array.isArray(engine._flatMod)) {
                engine._flatMod = [];
            }

            engine._flatMod.push(newTerm);

            // Clear literal base value
            document.getElementById('new-node-base-literal').value = '';

            // Vibrate and refresh UI
            vibrate(10);
            updateUI();
        }

        var activeEditChipIndex = null;

        function removeQueueChip(index, event) {
            if (event) event.stopPropagation();
            engine.queue.splice(index, 1);

            // Close the inline node editor and the old popover (hidden anyway)
            ineClose();
            const popover = document.getElementById('node-popover-editor');
            if (popover) popover.classList.add('hidden');
            activeEditChipIndex = null;

            vibrate(5);
            updateUI();
        }

        // (old editQueueChip removed — replaced by INE functions above)
        // These stubs remain for legacy event wiring safety:
        function closeChipPopover() { ineClose(); }
        function deletePopChip() { ineDelete(); }

        function updatePopDiceCount() { }
        function updatePopDiceSides() { }
        function updatePopModLiteral() { }
        function updatePopModType() { }
        function updatePopModMultType() { }
        function updatePopModDivType() { }
        function updatePopModField() { }
        function togglePopMathOpts() { }

        // editQueueChip is now defined earlier (INE version)
        // keep old popover HTML for safety — it's hidden anyway

        // NEXT: removeModifierChip

        function removeModifierChip(index, e) {
            if (e) e.stopPropagation();
            activeLoadoutId = null;
            if (Array.isArray(engine._flatMod)) {
                engine._flatMod.splice(index, 1);
            }
            vibrate(5);
            updateUI();
        }

        function removeActiveModifier(e) {
            if (e) e.stopPropagation();
            engine.activeModifier = null;
            engine.modifierLevel = 0;
            vibrate(5);
            updateUI();
        }

        var draggedChipIndex = null;

        function handleChipDragStart(e, index) {
            draggedChipIndex = index;
            e.dataTransfer.effectAllowed = 'move';
            // Slight delay so the drag ghost image looks normal before we dim the original
            setTimeout(() => e.target.classList.add('opacity-30', 'scale-95'), 0);
        }

        function handleChipDragEnd(e) {
            e.target.classList.remove('opacity-30', 'scale-95');
            draggedChipIndex = null;
        }

        function handleChipDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        }

        function handleChipDrop(e, targetIndex) {
            e.stopPropagation();
            if (draggedChipIndex === null || draggedChipIndex === targetIndex) return;

            const arr = engine._flatMod;
            const item = arr.splice(draggedChipIndex, 1)[0];
            arr.splice(targetIndex, 0, item);

            activeLoadoutId = null;
            vibrate(10);
            updateUI();
            return false;
        }


        function saveCurrentQueue() {
            openWidgetCreationModal(true);
        }

        function closeAllArsenalMenus() {
            document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.arsenal-item-wrapper').forEach(i => i.classList.remove('z-50'));
            document.getElementById('char-menu')?.classList.add('hidden');
            document.getElementById('group-menu')?.classList.add('hidden');
            activeMenuId = null;
        }


        function deleteQueue(id, event) {
            if (event) event.stopPropagation();
            closeAllArsenalMenus();

            showModal({
                title: 'Delete this loadout?',
                body: 'This action cannot be undone.',
                confirmText: 'Delete',
                danger: true
            }).then(confirmed => {
                if (!confirmed) return;
                engine.deleteQueue(id);
                persistSaved();
                renderSavedQueues();
            });
        }

        function renameQueue(id, event) {
            event.stopPropagation();
            const item = engine.findSavedQueue(id);
            if (!item) return;
            showModal({
                title: 'Rename Loadout',
                body: 'Enter a new name:',
                confirmText: 'Rename',
                inputPrompt: true,
                defaultValue: item.name
            }).then(newName => {
                if (newName) {
                    engine.renameQueue(id, newName);
                    persistSaved();
                    renderSavedQueues();
                }
            });
        }

        function openChainConfig(id, event) {
            if (event) event.stopPropagation();

            // Close arsenal menus if open
            document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.arsenal-item-wrapper').forEach(i => i.classList.remove('z-50'));
            activeMenuId = null;

            chainTargetId = id;
            const item = engine.findSavedQueue(id);
            if (!item) return;

            const overlay = document.getElementById('chain-config-overlay');

            // Populate select dropdowns with other saved queues
            const preSelect = document.getElementById('chain-pre-select');
            const successSelect = document.getElementById('chain-success-select');
            const critSelect = document.getElementById('chain-crit-select');
            const failSelect = document.getElementById('chain-fail-select');
            const preHaltCheckbox = document.getElementById('chain-pre-halt');

            const otherQueues = engine.savedQueues.filter(q => q.id !== id);

            const populateDropdown = (selectEl, currentValue) => {
                selectEl.innerHTML = '<option value="">(None)</option>';
                otherQueues.forEach(q => {
                    const opt = document.createElement('option');
                    opt.value = q.id;
                    opt.innerText = q.name;
                    if (q.id === currentValue) opt.selected = true;
                    selectEl.appendChild(opt);
                });
            };

            const chain = item.chain || {};
            const preVal = chain.preRoll ? chain.preRoll.arsenalId : "";
            const preHalt = chain.preRoll ? !!chain.preRoll.haltOnFail : false;
            const successVal = (chain.postRoll && chain.postRoll.success) ? chain.postRoll.success.arsenalId : "";
            const critVal = (chain.postRoll && chain.postRoll.crit) ? chain.postRoll.crit.arsenalId : "";
            const failVal = (chain.postRoll && chain.postRoll.fail) ? chain.postRoll.fail.arsenalId : "";

            populateDropdown(preSelect, Number(preVal) || "");
            populateDropdown(successSelect, Number(successVal) || "");
            populateDropdown(critSelect, Number(critVal) || "");
            populateDropdown(failSelect, Number(failVal) || "");
            preHaltCheckbox.checked = preHalt;

            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }

        function closeChainConfig() {
            const overlay = document.getElementById('chain-config-overlay');
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            chainTargetId = null;
        }

        function wouldCreateCycle(sourceId, preId, successId, critId, failId) {
            const tempChainMap = {};
            engine.savedQueues.forEach(q => {
                if (q.id === sourceId) {
                    tempChainMap[q.id] = { preRoll: preId, success: successId, crit: critId, fail: failId };
                } else {
                    const c = q.chain || {};
                    tempChainMap[q.id] = {
                        preRoll: c.preRoll ? c.preRoll.arsenalId : null,
                        success: (c.postRoll && c.postRoll.success) ? c.postRoll.success.arsenalId : null,
                        crit: (c.postRoll && c.postRoll.crit) ? c.postRoll.crit.arsenalId : null,
                        fail: (c.postRoll && c.postRoll.fail) ? c.postRoll.fail.arsenalId : null
                    };
                }
            });

            const visited = new Set();
            const stack = new Set();

            function dfs(id) {
                if (!id) return false;
                if (stack.has(id)) return true;
                if (visited.has(id)) return false;

                visited.add(id);
                stack.add(id);

                const links = tempChainMap[id];
                if (links) {
                    if (dfs(links.preRoll)) return true;
                    if (dfs(links.success)) return true;
                    if (dfs(links.crit)) return true;
                    if (dfs(links.fail)) return true;
                }

                stack.delete(id);
                return false;
            }

            return dfs(sourceId);
        }

        function saveChainConfig() {
            if (chainTargetId === null) return;
            const item = engine.savedQueues.find(q => q.id === chainTargetId);
            if (!item) return;

            const preVal = document.getElementById('chain-pre-select').value;
            const preHalt = document.getElementById('chain-pre-halt').checked;
            const successVal = document.getElementById('chain-success-select').value;
            const critVal = document.getElementById('chain-crit-select').value;
            const failVal = document.getElementById('chain-fail-select').value;

            const preId = preVal ? Number(preVal) : null;
            const successId = successVal ? Number(successVal) : null;
            const critId = critVal ? Number(critVal) : null;
            const failId = failVal ? Number(failVal) : null;

            // Perform cycle detection!
            if (wouldCreateCycle(chainTargetId, preId, successId, critId, failId)) {
                showModal({
                    title: 'Cycle Detected!',
                    body: 'Saving this chain link would create an infinite rolling loop (e.g., A rolls B which rolls back to A). Please resolve the loop before saving.',
                    alertOnly: true,
                    danger: true
                });
                return;
            }

            // Save settings
            item.chain = {
                preRoll: preId ? { arsenalId: preId, haltOnFail: preHalt } : null,
                postRoll: {
                    success: successId ? { arsenalId: successId } : null,
                    crit: critId ? { arsenalId: critId } : null,
                    fail: failId ? { arsenalId: failId } : null
                }
            };

            persistSaved();
            renderSavedQueues();
            closeChainConfig();
            vibrate(10);
        }

        function openColorPicker(id, event) {
            event.stopPropagation();

            // Close arsenal menus if open
            document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.arsenal-item-wrapper').forEach(i => i.classList.remove('z-50'));
            activeMenuId = null;

            pickerTargetId = id;
            const overlay = document.getElementById('color-picker-overlay');
            const grid = document.getElementById('color-grid');

            grid.innerHTML = '';

            // "None" option — no color strip
            const noneBtn = document.createElement('button');
            noneBtn.className = 'color-option w-10 h-10 rounded-full border-2 border-white/20 bg-transparent relative overflow-hidden flex items-center justify-center';
            noneBtn.title = 'No color';
            noneBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5 text-slate-500">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
            `;
            noneBtn.onclick = () => selectColor('none');
            grid.appendChild(noneBtn);

            COLOR_PALETTE.forEach(color => {
                const btn = document.createElement('button');
                btn.className = 'color-option w-10 h-10 rounded-full border-2 border-white/5';
                btn.style.backgroundColor = color;
                btn.style.color = color;
                btn.onclick = () => selectColor(color);
                grid.appendChild(btn);
            });

            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }

        function closeColorPicker() {
            const overlay = document.getElementById('color-picker-overlay');
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            pickerTargetId = null;
        }

        function selectColor(color) {
            if (pickerTargetId === null) return;
            engine.changeQueueColor(pickerTargetId, color);
            persistSaved();
            renderSavedQueues();
            closeColorPicker();
        }

        function updateSavedQueue(id, event) {
            if (event) event.stopPropagation();

            // Close arsenal menus
            document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
            document.querySelectorAll('.arsenal-item-wrapper').forEach(i => i.classList.remove('z-50'));
            activeMenuId = null;

            const item = engine.findSavedQueue(id);
            if (!item) return;

            showModal({
                title: `Overwrite <span class="text-sky-400">"${item.name}"</span>?`,
                body: 'This will replace it with the current active queue.',
                confirmText: 'Overwrite'
            }).then(confirmed => {
                if (!confirmed) return;
                engine.updateSavedQueue(id);
                persistSaved();
                renderSavedQueues();
                vibrate(5);
            });
        }



        function restoreDefaults() {
            showModal({
                title: 'Restore Defaults?',
                body: 'This will restore all default settings, clear all custom dice, delete all characters/groups, and erase your saved loadouts. This action cannot be undone.',
                confirmText: 'Restore',
                danger: true
            }).then(ok => {
                if (!ok) return;

                // Clear storage
                localStorage.removeItem('crypto_roller_settings');
                localStorage.removeItem('crypto_roller_saved');
                localStorage.removeItem('crypto_roller_arsenal');
                localStorage.removeItem('instaQueueState');
                localStorage.removeItem('crypto_roller_templates');
                templates = getInitialTemplates();

                // Reset state variables to factory defaults
                soundEnabled = true;
                volume = 0.5;
                headerHidden = false;
                isModdedQuick = false;
                isInstaQueue = 'Roll Only';
                isArsenalQueue = 'Roll Only';
                customDice = [];
                currentTargetMode = 'sum';
                engine.setSavedQueues([]);

                // Re-initialize default campaign, character, and groups
                const baseTime = Date.now();
                campaigns = [{ id: 'default_campaign', name: 'Default Campaign' }];
                activeCampaignId = 'default_campaign';
                openTabs = ['default_campaign'];
                characters = [{ id: 'primary', name: 'Primary Character', dndType: 'standard', campaignId: 'default_campaign' }];
                groups = [
                    { id: `grp_stats_${baseTime}_1`, name: 'Stats', color: '#00d4ff', characterId: 'primary' },
                    { id: `grp_attacks_${baseTime}_2`, name: 'Attacks', color: '#ff003c', characterId: 'primary' },
                    { id: `grp_spells_${baseTime}_3`, name: 'Spells', color: '#a855f7', characterId: 'primary' },
                    { id: `grp_items_${baseTime}_4`, name: 'Items', color: '#ffea00', characterId: 'primary' }
                ];
                activeCharacterId = 'primary';
                activeGroupId = groups[0].id;

                // Apply defaults to DOM
                document.body.classList.remove('header-hidden');

                // Clear overall target and flat mod inputs in DOM
                const oTarget = document.getElementById('overall-target-input');
                if (oTarget) oTarget.value = '';
                const fMod = document.getElementById('flat-mod-input');
                if (fMod) fMod.value = '0';

                // Reset engine variables
                engine.rollingQueue = [];
                engine.activeModifier = null;
                engine.modifierLevel = 1;
                engine.flatMod = 0;
                engine.overallTarget = null;

                // Reset rules panel elements to defaults in DOM
                const sumOp = document.getElementById('rule-sum-op');
                if (sumOp) sumOp.value = '';
                const sumVal = document.getElementById('rule-sum-val');
                if (sumVal) sumVal.value = 'overall';
                const countOp = document.getElementById('rule-count-op');
                if (countOp) countOp.value = '>=';
                const countVal = document.getElementById('rule-count-val');
                if (countVal) countVal.value = '0';
                const countThreshOp = document.getElementById('rule-count-thresh-op');
                if (countThreshOp) countThreshOp.value = '';
                const countThreshVal = document.getElementById('rule-count-thresh-val');
                if (countThreshVal) countThreshVal.value = 'overall';

                const rrOp = document.getElementById('rule-reroll-op');
                if (rrOp) rrOp.value = '';
                const rrVal = document.getElementById('rule-reroll-val');
                if (rrVal) rrVal.value = '';
                const exOp = document.getElementById('rule-explode-op');
                if (exOp) exOp.value = '';
                const exVal = document.getElementById('rule-explode-val');
                if (exVal) exVal.value = '';
                const setsOp = document.getElementById('rule-sets-op');
                if (setsOp) setsOp.value = '';
                const setsVal = document.getElementById('rule-sets-val');
                if (setsVal) setsVal.value = '';

                // Update volume slider and range value
                const volumeSlider = document.getElementById('volume-slider');
                if (volumeSlider) {
                    volumeSlider.value = volume;
                }
                updateVolume(volume);

                // Clear any active roll outputs from UI
                const hero = document.getElementById('result-hero');
                if (hero) hero.innerText = '0';
                const label = document.getElementById('result-label');
                if (label) label.innerText = '';
                const breakdown = document.getElementById('result-breakdown');
                if (breakdown) breakdown.innerHTML = '';
                const badges = document.getElementById('result-badges');
                if (badges) badges.innerHTML = '';

                // Trigger all UI rerenders
                updateUI();
                updateSoundUI();
                updateRulesUI();
                renderDiceGrid();
                renderCharacterSelect();
                renderGroupTabs();
                renderSavedQueues();
                renderBinder();
                persistArsenal();

                vibrate(20);
            });
        }




        var activeMenuId = null;


        function toggleArsenalMenu(id, e) {
            if (e) e.stopPropagation();
            vibrate(5);
            const menus = document.querySelectorAll('.arsenal-menu');
            const items = document.querySelectorAll('.arsenal-item-wrapper');
            const targetMenu = document.getElementById(`menu-${id}`);
            const parentItem = targetMenu.closest('.arsenal-item-wrapper');

            const isShowing = !targetMenu.classList.contains('hidden');

            // Hide all first
            menus.forEach(m => m.classList.add('hidden'));
            items.forEach(i => i.classList.remove('z-50'));

            if (!isShowing) {
                targetMenu.classList.remove('hidden');
                parentItem.classList.add('z-50');
                activeMenuId = id;

                // Dynamically update play/pause menu button for timer widgets
                const q = engine.findSavedQueue(id);
                if (q && q.widgetType === 'timer') {
                    const playBtn = targetMenu.querySelector('.menu-timer-play-btn');
                    if (playBtn) {
                        const timerIsPaused = q.isPaused !== false;
                        playBtn.innerHTML = timerIsPaused
                            ? `<svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-emerald-400"><path d="M8 5v14l11-7z"/></svg><span>Start Timer</span>`
                            : `<svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-amber-400"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg><span>Pause Timer</span>`;
                    }
                }

                if (e && parentItem) {
                    const rect = parentItem.getBoundingClientRect();
                    let clientX = 0;
                    let clientY = 0;

                    if (e.touches && e.touches.length > 0) {
                        clientX = e.touches[0].clientX;
                        clientY = e.touches[0].clientY;
                    } else if (e.changedTouches && e.changedTouches.length > 0) {
                        clientX = e.changedTouches[0].clientX;
                        clientY = e.changedTouches[0].clientY;
                    } else {
                        clientX = e.clientX;
                        clientY = e.clientY;
                    }

                    // Calculate local offset
                    let localX = clientX - rect.left;
                    let localY = clientY - rect.top;

                    // Bound checks to ensure menu doesn't draw offscreen or overlap layout weirdly
                    const menuWidth = 170;
                    if (localX + menuWidth > rect.width) {
                        localX = rect.width - menuWidth - 8;
                    }
                    if (localX < 8) localX = 8;

                    targetMenu.style.left = `${localX}px`;
                    targetMenu.style.top = `${localY + 8}px`;
                    targetMenu.style.right = 'auto';
                }
            } else {
                activeMenuId = null;
            }
        }

        function toggleArsenalAdvDis(id, checked) {
            const item = engine.findSavedQueue(id);
            if (item) {
                item.includeAdvDis = checked;
                persistSaved();
                renderSavedQueues();
                vibrate(5);
            }
        }

        function toggleImportExportMenu(e) {
            if (e) e.stopPropagation();
            vibrate(5);
            const menu = document.getElementById('import-export-menu');
            if (!menu) return;
            const isHidden = menu.classList.contains('hidden');
            closeAllArsenalMenus();
            if (isHidden) {
                menu.classList.remove('hidden');
            }
        }

        window.addEventListener('click', (e) => {
            // Close old node popover (kept for safety, is hidden anyway)
            const popover = document.getElementById('node-popover-editor');
            if (popover && !popover.classList.contains('hidden')) {
                if (!popover.contains(e.target) && !e.target.closest('#queue-display')) {
                    popover.classList.add('hidden');
                    activeEditChipIndex = null;
                }
            }

            // Close inline node editor when clicking outside it and outside the queue
            const ineEl = document.getElementById('inline-node-editor');
            if (ineEl && ineEl.classList.contains('open')) {
                if (!document.body.contains(e.target)) {
                    // Detached element (re-rendered during click), keep open
                    return;
                }
                if (!ineEl.contains(e.target) &&
                    !e.target.closest('#queue-display') &&
                    !e.target.closest('#hash-btn') &&
                    !e.target.closest('#eval-btn') &&
                    !e.target.closest('#op-div-btn') &&
                    !e.target.closest('#reroll-btn')) {
                    const mode = ineEl.getAttribute('data-mode');
                    if (ineNodeIndex === null && mode === 'number') {
                        ineClose();
                    } else {
                        ineConfirm();
                    }
                }
            }

            // Close arsenal menus on any click outside the menu.
            // Synthetic post-longpress clicks are blocked upstream by
            // e.stopPropagation() in item.onclick when isHold is true.
            if (!e.target.closest('.arsenal-menu') && !e.target.closest('.gear-btn') && !e.target.closest('#import-export-btn')) {
                document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
                document.querySelectorAll('.arsenal-item-wrapper').forEach(i => i.classList.remove('z-50'));
                activeMenuId = null;
            }
        });

        function renameSavedQueue(id, e) {
            if (e) e.stopPropagation();
            closeAllArsenalMenus();

            const item = engine.findSavedQueue(id);
            if (!item) return;
            showModal({
                title: 'Rename Loadout',
                body: 'Enter a new name:',
                confirmText: 'Rename',
                inputPrompt: true,
                defaultValue: item.name
            }).then(newName => {
                if (newName && newName.trim()) {
                    engine.renameQueue(id, newName.trim());
                    persistSaved();
                    renderSavedQueues();
                    vibrate(5);
                }
            });
        }

        // =========================================================================
        // CHARACTER & GROUP UI RENDERING
        // =========================================================================




        function selectCharacter(id) {
            if (!id) {
                activeCharacterId = null;
                activeGroupId = null;
            } else {
                activeCharacterId = id;
                const charGroups = groups.filter(g => g.characterId === id);
                activeGroupId = charGroups.length > 0 ? charGroups[0].id : null;
            }
            renderGroupTabs();
            renderSavedQueues();
            persistArsenal();
            populateRulesVariableDropdowns();
        }

        function selectGroup(id) {
            activeGroupId = id;
            renderGroupTabs();
            renderSavedQueues();
            persistArsenal();
            vibrate(5);
        }

        // Character CRUD

        function addCharacter(e) {
            if (e) e.stopPropagation();
            closeAllArsenalMenus();

            if (campaigns.length === 0) {
                showModal({
                    title: 'No Campaigns',
                    body: 'Please create a campaign in the Binder drawer before adding a character.',
                    alertOnly: true
                });
                return;
            }

            // Set default name and selection in Character Creation Modal
            document.getElementById('new-char-name').value = `Character ${characters.length + 1}`;
            const radios = document.getElementsByName('new-char-dndtype');
            radios.forEach(r => {
                if (r.value === 'standard') r.checked = true;
            });

            const overlay = document.getElementById('char-creation-overlay');
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');

            setTimeout(() => {
                const input = document.getElementById('new-char-name');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 50);
            vibrate(5);
        }

        function closeCharCreationModal() {
            const overlay = document.getElementById('char-creation-overlay');
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
            vibrate(5);
        }

        function submitCharCreation() {
            const nameEl = document.getElementById('new-char-name');
            const name = nameEl.value.trim();
            if (!name) return;

            let dndType = 'standard';
            const radios = document.getElementsByName('new-char-dndtype');
            radios.forEach(r => {
                if (r.checked) dndType = r.value;
            });

            const id = 'char_' + Date.now();
            characters.push({ id, name, dndType, campaignId: activeCampaignId });

            const baseTime = Date.now();
            const charGroups = [
                { id: `grp_stats_${baseTime}_1`, name: 'Stats', color: '#00d4ff', characterId: id },
                { id: `grp_attacks_${baseTime}_2`, name: 'Attacks', color: '#ff003c', characterId: id },
                { id: `grp_spells_${baseTime}_3`, name: 'Spells', color: '#a855f7', characterId: id },
                { id: `grp_items_${baseTime}_4`, name: 'Items', color: '#ffea00', characterId: id }
            ];
            groups.push(...charGroups);
            activeCharacterId = id;
            activeGroupId = charGroups[0].id;

            closeCharCreationModal();
            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();
            persistArsenal();
            vibrate(10);

            // Automatically open the resources modal after creating a D&D character!
            if (dndType !== 'none') {
                setTimeout(() => {
                    openResourcesModal();
                }, 200);
            }
        }

        function renameActiveCharacter(name) {
            const char = characters.find(c => c.id === activeCharacterId);
            if (!char) return;
            char.name = name;
            renderBinder();
            persistArsenal();
        }

        function renameCharacter(e) {
            if (e) e.stopPropagation();
            document.getElementById('char-menu').classList.add('hidden');
            const char = characters.find(c => c.id === activeCharacterId);
            if (!char) return;
            showModal({ title: 'Rename Character', body: 'Enter new name:', confirmText: 'Rename', inputPrompt: true, defaultValue: char.name }).then(name => {
                if (!name || !name.trim()) return;
                char.name = name.trim();
                renderCharacterSelect();
                persistArsenal();
                vibrate(5);
            });
        }

        function removeCharacter(e) {
            if (e) e.stopPropagation();
            document.getElementById('char-menu').classList.add('hidden');
            const char = characters.find(c => c.id === activeCharacterId);
            if (!char) return;
            showModal({ title: `Remove <span class="text-rose-400">${char.name}</span>?`, body: 'All groups and loadouts for this character will be deleted.', confirmText: 'Remove', danger: true }).then(ok => {
                if (!ok) return;
                engine.savedQueues = engine.savedQueues.filter(q => q.characterId !== activeCharacterId);
                groups = groups.filter(g => g.characterId !== activeCharacterId);
                characters = characters.filter(c => c.id !== activeCharacterId);

                const campChars = characters.filter(c => c.campaignId === activeCampaignId);
                if (campChars.length > 0) {
                    activeCharacterId = campChars[0].id;
                    const remaining = groups.filter(g => g.characterId === activeCharacterId);
                    activeGroupId = remaining.length ? remaining[0].id : null;
                } else if (characters.length > 0) {
                    activeCharacterId = characters[0].id;
                    activeCampaignId = characters[0].campaignId || activeCampaignId;
                    const remaining = groups.filter(g => g.characterId === activeCharacterId);
                    activeGroupId = remaining.length ? remaining[0].id : null;
                } else {
                    activeCharacterId = null;
                    activeGroupId = null;
                }

                renderCharacterSelect();
                renderGroupTabs();
                renderSavedQueues();
                renderBinder();
                persistSaved();
                persistArsenal();
                vibrate(10);
            });
        }

        // =========================================================================
        // TEMPLATE & CLONING UTILITIES
        // =========================================================================
        var contextCharId = null;

        function openCharContextMenu(charId, e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            vibrate(5);

            const menu = document.getElementById('char-menu');
            if (!menu) return;

            contextCharId = charId;
            closeAllArsenalMenus();

            menu.classList.remove('hidden');

            let clientX = 0;
            let clientY = 0;

            if (e) {
                if (e.touches && e.touches.length > 0) {
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                } else if (e.changedTouches && e.changedTouches.length > 0) {
                    clientX = e.changedTouches[0].clientX;
                    clientY = e.changedTouches[0].clientY;
                } else {
                    clientX = e.clientX;
                    clientY = e.clientY;
                }
            }

            const menuWidth = 150;
            let left = clientX;
            let top = clientY;

            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 12;
            }
            if (left < 12) left = 12;

            const menuHeight = 150;
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 12;
            }
            if (top < 12) top = 12;

            menu.style.position = 'fixed';
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.right = 'auto';
            menu.style.bottom = 'auto';
        }

        function triggerCloneActive() {
            document.getElementById('char-menu').classList.add('hidden');
            if (contextCharId) {
                cloneCharacter(contextCharId);
            }
        }

        function triggerSaveAsTemplateActive() {
            document.getElementById('char-menu').classList.add('hidden');
            if (contextCharId) {
                saveCharacterAsTemplate(contextCharId);
            }
        }

        function triggerDeleteActive() {
            document.getElementById('char-menu').classList.add('hidden');
            if (contextCharId) {
                const oldActive = activeCharacterId;
                activeCharacterId = contextCharId;
                removeCharacter();
            }
        }

        function getInitialTemplates() {
            return window.StaticDiceTemplates || [];
        }







        async function spawnTemplateInstance(tplId, event) {
            if (event) event.stopPropagation();
            const tpl = templates.find(t => t.id === tplId);
            if (!tpl) return;

            if (!activeCampaignId) {
                if (campaigns.length === 0) {
                    campaigns = [{ id: 'default_campaign', name: 'Default Campaign' }];
                    activeCampaignId = 'default_campaign';
                    openTabs = [activeCampaignId];
                } else {
                    activeCampaignId = campaigns[0].id;
                }
            }

            const name = await showModal({
                title: 'Spawn Instance',
                body: `Enter name for this ${tpl.dndType === 'monster' ? 'Monster' : 'Character'}:`,
                confirmText: 'Spawn',
                inputPrompt: true,
                defaultValue: tpl.name.replace(' (Blank)', '')
            });
            if (!name || !name.trim()) return;

            const newCharId = 'char_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const newChar = {
                id: newCharId,
                name: name.trim(),
                dndType: tpl.dndType || 'standard',
                campaignId: activeCampaignId,
                variables: JSON.parse(JSON.stringify(tpl.variables || {}))
            };

            const groupIdMap = {};
            const newGroups = (tpl.groups || []).map((g, idx) => {
                const newGrpId = 'grp_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 5);
                groupIdMap[g.id] = newGrpId;
                return {
                    id: newGrpId,
                    name: g.name,
                    color: g.color || '#00d4ff',
                    characterId: newCharId
                };
            });

            const newWidgets = (tpl.widgets || []).map((w, idx) => {
                const newWId = 'w_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 5);
                return {
                    ...JSON.parse(JSON.stringify(w)),
                    id: newWId,
                    characterId: newCharId,
                    groupId: groupIdMap[w.groupId] || null
                };
            });

            characters.push(newChar);
            groups.push(...newGroups);
            engine.savedQueues.push(...newWidgets);

            organizeCombatWidgets(newCharId, engine, groups);

            activeCharacterId = newCharId;
            activeGroupId = newGroups.length > 0 ? newGroups[0].id : null;

            syncCharacterVariables(newChar);

            persistArsenal();
            persistSaved();

            renderCampaignSelect();
            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();

            vibrate(15);
        }

        async function deleteTemplate(tplId, event) {
            if (event) event.stopPropagation();
            const tpl = templates.find(t => t.id === tplId);
            if (!tpl) return;
            if (tpl.isDefault) return;

            const confirm = await showModal({
                title: 'Delete Template',
                body: `Are you sure you want to permanently delete the template "${tpl.name}"?`,
                confirmText: 'Delete',
                danger: true
            });
            if (!confirm) return;

            templates = templates.filter(t => t.id !== tplId);
            persistTemplates();
            renderTemplates();
            vibrate(15);
        }

        async function createCustomTemplate(event) {
            if (event) event.stopPropagation();
            const name = await showModal({
                title: 'Create Custom Template',
                body: 'Enter template name:',
                confirmText: 'Next',
                inputPrompt: true,
                defaultValue: 'My Custom Template'
            });
            if (!name || !name.trim()) return;

            const confirm = await showModal({
                title: 'Create Custom Template',
                body: `
                    <div class="space-y-4 text-left">
                        <div class="text-xs text-slate-400 font-medium">Choose sheet type:</div>
                        <div class="flex gap-4">
                            <label class="flex-1 p-3 rounded-xl border border-white/5 bg-[#020617]/30 hover:border-sky-500/30 flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="tpl-type" value="standard" checked class="accent-sky-500">
                                <div class="flex flex-col">
                                    <span class="text-xs font-bold text-slate-300">Character</span>
                                    <span class="text-[9px] text-slate-500">Standard PC stats & groups</span>
                                </div>
                            </label>
                            <label class="flex-1 p-3 rounded-xl border border-white/5 bg-[#020617]/30 hover:border-rose-500/30 flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="tpl-type" value="monster" class="accent-rose-500">
                                <div class="flex flex-col">
                                    <span class="text-xs font-bold text-rose-300">Monster</span>
                                    <span class="text-[9px] text-slate-500">Minified NPC / Hazard layout</span>
                                </div>
                            </label>
                        </div>
                    </div>
                `,
                confirmText: 'Create'
            });
            if (!confirm) return;

            const radio = document.querySelector('input[name="tpl-type"]:checked');
            const type = radio ? radio.value : 'standard';

            const tplId = 'template_custom_' + Date.now();
            const newTpl = {
                id: tplId,
                name: name.trim(),
                system: 'Custom',
                dndType: type,
                isDefault: false,
                variables: type === 'monster' ? {
                    "HP": "10", "MaxHP": "10", "AC": "10", "LVL": "1"
                } : {
                    "LVL": "1", "HP": "10", "MaxHP": "10", "AC": "10",
                    "STR": "10", "DEX": "10", "CON": "10", "INT": "10", "WIS": "10", "CHA": "10",
                    "STR_mod": "0", "DEX_mod": "0", "CON_mod": "0", "INT_mod": "0", "WIS_mod": "0", "CHA_mod": "0"
                },
                groups: type === 'monster' ? [
                    { id: 'actions', name: 'Actions', color: '#ff003c' }
                ] : [
                    { id: 'stats', name: 'Stats', color: '#00d4ff' },
                    { id: 'attacks', name: 'Attacks', color: '#ff003c' }
                ],
                widgets: []
            };

            templates.push(newTpl);
            persistTemplates();
            renderTemplates();
            vibrate(15);
        }

        async function cloneCharacter(charId) {
            const menu = document.getElementById('char-menu');
            if (menu) menu.classList.add('hidden');

            const char = characters.find(c => c.id === charId);
            if (!char) return;

            const newName = await showModal({
                title: 'Clone Sheet',
                body: `Enter name for the cloned sheet of "${char.name}":`,
                confirmText: 'Clone',
                inputPrompt: true,
                defaultValue: char.name + ' (Copy)'
            });
            if (!newName || !newName.trim()) return;

            const newCharId = 'char_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const newChar = {
                id: newCharId,
                name: newName.trim(),
                dndType: char.dndType || 'standard',
                campaignId: char.campaignId || activeCampaignId,
                variables: JSON.parse(JSON.stringify(char.variables || {}))
            };

            const charGroups = groups.filter(g => g.characterId === charId);
            const groupIdMap = {};
            const newGroups = charGroups.map((g, idx) => {
                const newGrpId = 'grp_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 5);
                groupIdMap[g.id] = newGrpId;
                return {
                    id: newGrpId,
                    name: g.name,
                    color: g.color || '#00d4ff',
                    characterId: newCharId
                };
            });

            const charWidgets = engine.savedQueues.filter(w => w.characterId === charId);
            const newWidgets = charWidgets.map((w, idx) => {
                const newWId = 'w_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 5);
                return {
                    ...JSON.parse(JSON.stringify(w)),
                    id: newWId,
                    characterId: newCharId,
                    groupId: groupIdMap[w.groupId] || null
                };
            });

            characters.push(newChar);
            groups.push(...newGroups);
            engine.savedQueues.push(...newWidgets);

            activeCharacterId = newCharId;
            activeGroupId = newGroups.length > 0 ? newGroups[0].id : null;

            syncCharacterVariables(newChar);

            persistArsenal();
            persistSaved();

            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();

            vibrate(15);
        }

        async function saveCharacterAsTemplate(charId) {
            const menu = document.getElementById('char-menu');
            if (menu) menu.classList.add('hidden');

            const char = characters.find(c => c.id === charId);
            if (!char) return;

            const tplName = await showModal({
                title: 'Save as Template',
                body: 'Enter template name:',
                confirmText: 'Next',
                inputPrompt: true,
                defaultValue: char.name + ' Template'
            });
            if (!tplName || !tplName.trim()) return;

            const reset = await showModal({
                title: 'Reset Stats?',
                body: `
                    <div class="space-y-4 text-left">
                        <div class="text-xs text-slate-400 font-medium">Do you want to reset stats/trackers to their default values (e.g., zero or 10) in the template?</div>
                        <div class="flex gap-4">
                            <label class="flex-1 p-3 rounded-xl border border-white/5 bg-[#020617]/30 hover:border-sky-500/30 flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="reset-choice" value="yes" checked class="accent-sky-500">
                                <div class="flex flex-col">
                                    <span class="text-xs font-bold text-slate-300">Yes, Reset</span>
                                    <span class="text-[9px] text-slate-500">HP, XP, and stats reset to defaults</span>
                                </div>
                            </label>
                            <label class="flex-1 p-3 rounded-xl border border-white/5 bg-[#020617]/30 hover:border-rose-500/30 flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="reset-choice" value="no" class="accent-rose-500">
                                <div class="flex flex-col">
                                    <span class="text-xs font-bold text-rose-300">No, Keep Active</span>
                                    <span class="text-[9px] text-slate-500">Template retains all active values</span>
                                </div>
                            </label>
                        </div>
                    </div>
                `,
                confirmText: 'Save Template'
            });
            if (!reset) return;

            const resetChoice = document.querySelector('input[name="reset-choice"]:checked')?.value === 'yes';

            let finalVariables = JSON.parse(JSON.stringify(char.variables || {}));
            if (resetChoice) {
                for (const k in finalVariables) {
                    if (k === 'HP' || k === 'MaxHP') {
                        finalVariables[k] = char.dndType === 'monster' ? "5" : "10";
                    } else if (k === 'LVL') {
                        finalVariables[k] = "1";
                    } else if (k === 'XP') {
                        finalVariables[k] = "0";
                    } else if (['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].includes(k)) {
                        finalVariables[k] = "10";
                    } else if (['STR_mod', 'DEX_mod', 'CON_mod', 'INT_mod', 'WIS_mod', 'CHA_mod'].includes(k)) {
                        finalVariables[k] = "0";
                    } else if (k === 'AC') {
                        finalVariables[k] = "10";
                    } else if (!isNaN(finalVariables[k])) {
                        finalVariables[k] = "0";
                    }
                }
            }

            const charGroups = groups.filter(g => g.characterId === charId);
            const charWidgets = engine.savedQueues.filter(w => w.characterId === charId);

            const newTpl = {
                id: 'template_custom_' + Date.now(),
                name: tplName.trim(),
                system: char.dndType === 'monster' ? 'Monster' : 'Character',
                dndType: char.dndType || 'standard',
                isDefault: false,
                variables: finalVariables,
                groups: charGroups.map(g => ({ id: g.id, name: g.name, color: g.color })),
                widgets: charWidgets.map(w => ({
                    name: w.name,
                    widgetType: w.widgetType,
                    groupId: w.groupId,
                    unifiedQueue: JSON.parse(JSON.stringify(w.unifiedQueue || w.queue || [])),
                    addonCounter: w.addonCounter ? JSON.parse(JSON.stringify(w.addonCounter)) : undefined,
                    addonToggle: w.addonToggle ? JSON.parse(JSON.stringify(w.addonToggle)) : undefined,
                    addonNote: w.addonNote || undefined,
                    color: w.color || undefined
                }))
            };

            templates.push(newTpl);
            persistTemplates();
            renderTemplates();

            showModal({
                title: 'Template Created',
                body: `"${tplName}" is now available in your Templates Library in the sidebar drawer!`,
                alertOnly: true
            });

            vibrate(15);
        }

        // =========================================================================
        // BINDER DRAWER & bluePRINTS SYSTEM
        // =========================================================================
        function toggleBinderDrawer() {
            const drawer = document.getElementById('binder-drawer');
            const overlay = document.getElementById('binder-overlay');
            if (!drawer || !overlay) return;
            const isOpen = drawer.classList.contains('open');
            if (isOpen) {
                drawer.classList.remove('open');
                overlay.classList.remove('open');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                }, 300);
            } else {
                overlay.classList.remove('hidden');
                overlay.offsetHeight; // force reflow
                drawer.classList.add('open');
                overlay.classList.add('open');
                renderBinder();

                // Auto-close roll pad if open
                const rollPadContainer = document.getElementById('roll-pad-container');
                if (rollPadContainer && !rollPadContainer.classList.contains('collapsed')) {
                    rollPadContainer.classList.add('collapsed');
                    localStorage.setItem('roll_pad_collapsed', 'true');
                }
            }
            vibrate(5);
        }

        function toggleCampaignFolder(campId, event) {
            if (event) event.stopPropagation();
            const idx = openTabs.indexOf(campId);
            if (idx > -1) {
                openTabs.splice(idx, 1);
            } else {
                openTabs.push(campId);
            }
            renderBinder();
            persistArsenal();
            vibrate(5);
        }


        function selectCampaign(campId) {
            if (!campId) {
                activeCampaignId = null;
                activeCharacterId = null;
                activeGroupId = null;
            } else {
                activeCampaignId = campId;
                const campChars = characters.filter(c => c.campaignId === activeCampaignId);
                if (campChars.length > 0) {
                    activeCharacterId = campChars[0].id;
                    const charGroups = groups.filter(g => g.characterId === activeCharacterId);
                    activeGroupId = charGroups.length > 0 ? charGroups[0].id : null;
                } else {
                    activeCharacterId = null;
                    activeGroupId = null;
                }
            }
            renderCampaignSelect();
            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();
            persistArsenal();
            vibrate(5);
        }

        function createNewCampaign(e) {
            if (e) e.stopPropagation();
            showModal({
                title: 'New Campaign',
                body: 'Enter campaign name:',
                confirmText: 'Create',
                inputPrompt: true,
                defaultValue: `Campaign ${campaigns.length + 1}`
            }).then(name => {
                if (!name || !name.trim()) return;
                const id = 'camp_' + Date.now();
                campaigns.push({ id, name: name.trim() });
                activeCampaignId = id;

                activeCharacterId = null;
                activeGroupId = null;

                if (!openTabs.includes(id)) {
                    openTabs.push(id);
                }

                renderCampaignSelect();
                renderCharacterSelect();
                renderGroupTabs();
                renderSavedQueues();
                renderBinder();
                persistArsenal();
                vibrate(10);
            });
        }

        function renameActiveCampaign(e) {
            if (e) e.stopPropagation();
            const camp = campaigns.find(c => c.id === activeCampaignId);
            if (!camp) return;
            showModal({
                title: 'Rename Campaign',
                body: 'Enter new name:',
                confirmText: 'Rename',
                inputPrompt: true,
                defaultValue: camp.name
            }).then(name => {
                if (!name || !name.trim()) return;
                camp.name = name.trim();
                renderBinder();
                persistArsenal();
                vibrate(5);
            });
        }

        function deleteActiveCampaign(e) {
            if (e) e.stopPropagation();
            deleteCampaignFromBinder(activeCampaignId, e);
        }

        function startCampaignInlineRename(campId, element) {
            const camp = campaigns.find(c => c.id === campId);
            if (!camp) return;
            const labelContainer = element.querySelector('.camp-inline-name');
            if (!labelContainer) return;

            const currentName = camp.name;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'w-full bg-[#020617] border border-sky-500/50 rounded px-1.5 py-0.5 text-xs text-white font-bold outline-none focus:ring-0';
            labelContainer.replaceWith(input);
            input.focus();
            input.select();

            let finished = false;
            const finishRename = () => {
                if (finished) return;
                finished = true;
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    camp.name = newName;
                    persistArsenal();
                }
                renderBinder();
            };

            input.onblur = finishRename;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    finishRename();
                } else if (e.key === 'Escape') {
                    finished = true;
                    renderBinder();
                }
            };
        }

        function startInlineRename(charId, element) {
            const char = characters.find(c => c.id === charId);
            if (!char) return;
            const labelContainer = element.querySelector('.inline-name-label');
            if (!labelContainer) return;

            const currentName = char.name;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'w-full bg-[#020617] border border-sky-500/50 rounded px-1.5 py-0.5 text-xs text-white font-bold outline-none focus:ring-0';
            labelContainer.replaceWith(input);
            input.focus();
            input.select();

            let finished = false;
            const finishRename = () => {
                if (finished) return;
                finished = true;
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    char.name = newName;
                    persistArsenal();
                    renderCharacterSelect();
                }
                renderBinder();
            };

            input.onblur = finishRename;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    finishRename();
                } else if (e.key === 'Escape') {
                    finished = true;
                    renderBinder();
                }
            };
        }

        function selectCharacterFromBinder(charId) {
            activeCharacterId = charId;
            const charGroups = groups.filter(g => g.characterId === charId);
            activeGroupId = charGroups.length > 0 ? charGroups[0].id : null;
            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();
            persistArsenal();
            vibrate(5);
        }

        function deleteCharacterFromBinder(charId, event) {
            if (event) event.stopPropagation();
            const char = characters.find(c => c.id === charId);
            if (!char) return;
            const campId = char.campaignId;
            showModal({
                title: 'Delete Sheet',
                body: `Are you sure you want to delete <span class="text-rose-400">${char.name}</span>? This will delete all its groups and saved widgets.`,
                confirmText: 'Delete',
                danger: true
            }).then(confirm => {
                if (!confirm) return;
                groups = groups.filter(g => g.characterId !== charId);
                engine.savedQueues = engine.savedQueues.filter(q => q.characterId !== charId);
                persistSaved();

                characters = characters.filter(c => c.id !== charId);
                if (activeCharacterId === charId) {
                    const remaining = characters.filter(c => c.campaignId === campId);
                    if (remaining.length > 0) {
                        activeCharacterId = remaining[0].id;
                        const charGroups = groups.filter(g => g.characterId === activeCharacterId);
                        activeGroupId = charGroups.length > 0 ? charGroups[0].id : null;
                    } else {
                        activeCharacterId = null;
                        activeGroupId = null;
                    }
                }
                renderCharacterSelect();
                renderGroupTabs();
                renderSavedQueues();
                renderBinder();
                persistArsenal();
            });
        }

        function deleteCampaignFromBinder(campId, event) {
            if (event) event.stopPropagation();
            const camp = campaigns.find(c => c.id === campId);
            showModal({
                title: 'Delete Campaign',
                body: `Are you sure you want to delete <span class="text-rose-400">${camp ? camp.name : ''}</span>? This will delete all characters, groups, and saved widgets in this campaign.`,
                confirmText: 'Delete',
                danger: true
            }).then(confirm => {
                if (!confirm) return;
                const charIdsToDelete = characters.filter(c => c.campaignId === campId).map(c => c.id);
                characters = characters.filter(c => c.campaignId !== campId);
                groups = groups.filter(g => !charIdsToDelete.includes(g.characterId));
                engine.savedQueues = engine.savedQueues.filter(q => !charIdsToDelete.includes(q.characterId));
                persistSaved();

                campaigns = campaigns.filter(c => c.id !== campId);
                if (activeCampaignId === campId) {
                    activeCampaignId = campaigns.length > 0 ? campaigns[0].id : null;
                }

                if (charIdsToDelete.includes(activeCharacterId)) {
                    const remaining = activeCampaignId ? characters.filter(c => c.campaignId === activeCampaignId) : [];
                    if (remaining.length > 0) {
                        activeCharacterId = remaining[0].id;
                        const charGroups = groups.filter(g => g.characterId === activeCharacterId);
                        activeGroupId = charGroups.length > 0 ? charGroups[0].id : null;
                    } else {
                        activeCharacterId = null;
                        activeGroupId = null;
                    }
                }

                const tabIdx = openTabs.indexOf(campId);
                if (tabIdx > -1) openTabs.splice(tabIdx, 1);

                renderCampaignSelect();
                renderCharacterSelect();
                renderGroupTabs();
                renderSavedQueues();
                renderBinder();
                persistArsenal();
                vibrate(10);
            });
        }

        function spawnTemplate(type) {
            const campId = activeCampaignId;
            if (!campId) return;

            const existingCount = characters.filter(c => c.name.toLowerCase().startsWith(type)).length + 1;
            const charName = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + existingCount;
            const charId = 'char_' + Date.now();

            const newChar = {
                id: charId,
                name: charName,
                dndType: 'standard',
                campaignId: campId,
                variables: { HP: 10, MaxHP: 10 }
            };


            characters.push(newChar);

            const baseTime = Date.now();
            const charGroups = [
                { id: `grp_stats_${baseTime}_1`, name: 'Stats', color: '#00d4ff', characterId: charId },
                { id: `grp_attacks_${baseTime}_2`, name: 'Attacks', color: '#ff003c', characterId: charId },
                { id: `grp_spells_${baseTime}_3`, name: 'Spells', color: '#a855f7', characterId: charId },
                { id: `grp_items_${baseTime}_4`, name: 'Items', color: '#ffea00', characterId: charId }
            ];
            groups.push(...charGroups);

            const statsGrpId = charGroups[0].id;
            const attacksGrpId = charGroups[1].id;
            const spellsGrpId = charGroups[2].id;
            const itemsGrpId = charGroups[3].id;

            const makeDiceNode = (sides, count) => ({
                nodeType: 'node',
                id: 'node_' + Math.random().toString(36).substr(2, 9),
                sides: sides,
                count: count,
                localModifier: null,
                localModLevel: 1,
                rerollOp: null,
                rerollVal: null,
                explodeOp: null,
                explodeVal: null
            });

            const makeModifierNode = (val) => ({
                nodeType: 'modifier',
                id: 'mod_' + Math.random().toString(36).substr(2, 9),
                type: 'literal',
                value: Math.abs(val),
                operator: val >= 0 ? '+' : '-',
                multiplierType: 'none',
                multiplierValue: 1,
                divisorType: 'none',
                divisorValue: 1,
                roundMode: 'none'
            });



            activeCharacterId = charId;
            activeGroupId = statsGrpId;

            if (!openTabs.includes(campId)) {
                openTabs.push(campId);
            }

            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();
            persistArsenal();
            persistSaved();
            vibrate(10);
        }

        function ensureActiveCharacterAndGroup() {
            if (campaigns.length === 0) {
                campaigns.push({ id: 'default_campaign', name: 'Default Campaign' });
            }
            if (!activeCampaignId) {
                activeCampaignId = campaigns[0].id;
            }
            
            if (characters.length === 0) {
                characters.push({
                    id: 'primary',
                    name: 'Default Character',
                    dndType: 'standard',
                    campaignId: activeCampaignId
                });
            }
            if (!activeCharacterId) {
                activeCharacterId = characters[0].id;
            }
            
            const char = characters.find(c => c.id === activeCharacterId);
            if (char && !char.campaignId) {
                char.campaignId = activeCampaignId;
            }

            const charGroups = groups.filter(g => g.characterId === activeCharacterId);
            if (charGroups.length === 0) {
                const baseTime = Date.now();
                const mainGrp = {
                    id: `grp_main_${baseTime}`,
                    name: 'Main',
                    color: '#00d4ff',
                    characterId: activeCharacterId
                };
                groups.push(mainGrp);
            }
            
            const updatedCharGroups = groups.filter(g => g.characterId === activeCharacterId);
            if (!activeGroupId || !updatedCharGroups.some(g => g.id === activeGroupId)) {
                activeGroupId = updatedCharGroups[0].id;
            }
            
            persistArsenal();
            renderCharacterSelect();
            renderGroupTabs();
            renderSavedQueues();
            renderBinder();
        }

        // =========================================================================
        // WIDGET CREATION AND STATE EDITING
        // =========================================================================
        var editingWidgetId = null;

        function openWidgetCreationModal(isSavingQueue = false) {
            closeAllArsenalMenus();
            ensureActiveCharacterAndGroup();
            editingWidgetId = null;
            const overlay = document.getElementById('widget-creation-overlay');
            if (!overlay) return;

            // Reset modal title and button text
            const titleEl = overlay.querySelector('h3 span');
            if (titleEl) titleEl.textContent = 'Create Widget';
            const submitBtn = overlay.querySelector('button[onclick="submitWidgetCreation()"]');
            if (submitBtn) submitBtn.textContent = 'Create';

            document.getElementById('widget-name').value = isSavingQueue ? `Loadout ${engine.savedQueues.length + 1}` : '';
            const typeSelect = document.getElementById('widget-type');

            if (isSavingQueue && engine.queue.length > 0) {
                const hasDice = engine.queue.some(node => node.nodeType === 'node');
                typeSelect.value = hasDice ? 'roller' : 'number';
            } else {
                typeSelect.value = 'stepper';
            }

            document.getElementById('addon-none').checked = true;
            document.getElementById('addon-stepper-label').value = 'Resource';
            document.getElementById('addon-stepper-max').value = '20';
            document.getElementById('addon-stepper-val').value = '20';
            document.getElementById('addon-toggle-on').value = 'Ready';
            document.getElementById('addon-toggle-off').value = 'Miscast';
            document.getElementById('addon-note-text').value = '';
            selectAddonWidget('none');

            document.getElementById('stepper-min').value = '0';
            document.getElementById('stepper-max').value = '20';
            document.getElementById('stepper-val').value = '20';

            document.getElementById('toggle-label-on').value = 'On';
            document.getElementById('toggle-label-off').value = 'Off';
            document.getElementById('toggle-initial').checked = true;

            document.getElementById('text-card-content').value = '';

            document.getElementById('number-val').value = '10';
            document.getElementById('widget-detail-text').value = '';
            const autoPill = document.querySelector('input[name="widget-display-mode"][value="auto"]');
            if (autoPill) { autoPill.checked = true; updateDisplayModePills('auto'); }
            document.getElementById('widget-bind-var-check').checked = false;
            document.getElementById('widget-binds-variable').value = '';
            document.getElementById('widget-variable-rel-type').value = 'define';
            toggleWidgetVarBinding(false);

            document.getElementById('widget-passive-mods-check').checked = false;
            document.getElementById('passive-mods-list').innerHTML = '';
            toggleWidgetPassiveModifiers(false);

            onWidgetTypeChange(typeSelect.value);

            overlay.classList.remove('hidden');
            overlay.classList.add('flex');

            setTimeout(() => {
                document.getElementById('widget-name').focus();
            }, 50);
            vibrate(5);
        }

        function configureSavedWidget(widgetId, event) {
            if (event) event.stopPropagation();
            closeAllArsenalMenus();

            const q = engine.findSavedQueue(widgetId);
            if (!q) return;

            editingWidgetId = widgetId;

            const overlay = document.getElementById('widget-creation-overlay');
            if (!overlay) return;

            // Change title in modal
            const titleEl = overlay.querySelector('h3 span');
            if (titleEl) titleEl.textContent = 'Configure Widget';

            const submitBtn = overlay.querySelector('button[onclick="submitWidgetCreation()"]');
            if (submitBtn) submitBtn.textContent = 'Save Changes';

            // Populate fields
            document.getElementById('widget-name').value = q.name || '';

            const typeSelect = document.getElementById('widget-type');
            typeSelect.value = q.widgetType || 'roller';

            // Populate roller addons
            // Determine which addon radio to select
            const hasCounter = !!q.addonCounter;
            const hasToggle = !!q.addonToggle;
            let activeAddon = 'none';
            if (q.includeAdvDis) activeAddon = 'advdis';
            else if (hasCounter) activeAddon = 'stepper';
            else if (hasToggle) activeAddon = 'toggle';

            document.getElementById('addon-stepper-label').value = hasCounter ? q.addonCounter.label : 'Resource';
            document.getElementById('addon-stepper-max').value = hasCounter ? q.addonCounter.max : '20';
            document.getElementById('addon-stepper-val').value = hasCounter ? q.addonCounter.value : '20';
            document.getElementById('addon-toggle-on').value = hasToggle ? q.addonToggle.labelOn : 'Ready';
            document.getElementById('addon-toggle-off').value = hasToggle ? q.addonToggle.labelOff : 'Miscast';
            document.getElementById('addon-note-text').value = q.addonNote || '';

            // Set the correct radio and show its config
            const radioEl = document.querySelector(`input[name="addon-widget"][value="${activeAddon}"]`);
            if (radioEl) radioEl.checked = true;
            selectAddonWidget(activeAddon);

            // Populate standalone stepper configs
            document.getElementById('stepper-min').value = q.min !== undefined ? q.min : '0';
            document.getElementById('stepper-max').value = q.max !== undefined ? q.max : '20';
            document.getElementById('stepper-val').value = q.value !== undefined ? q.value : '20';
            document.getElementById('stepper-tracker').checked = !!q.showTracker;

            // Populate standalone toggle configs
            document.getElementById('toggle-label-on').value = q.labelOn || 'On';
            document.getElementById('toggle-label-off').value = q.labelOff || 'Off';
            document.getElementById('toggle-initial').checked = !!q.checked;

            // Populate text card configs
            document.getElementById('text-card-content').value = q.text || '';

            // Populate number config
            document.getElementById('number-val').value = q.value !== undefined ? q.value : '10';

            // Populate countdown config
            if (q.widgetType === 'countdown') {
                ctWriteConfigFromWidget(q);
            }

            // Populate timer config
            if (q.widgetType === 'timer') {
                document.getElementById('timer-max-min').value = Math.floor((q.maxTime || 600) / 60);
                document.getElementById('timer-curr-min').value = Math.floor((q.currentTime ?? 600) / 60);
                document.getElementById('timer-curr-sec').value = (q.currentTime ?? 600) % 60;
                document.getElementById('timer-dice-formula').value = q.diceFormula || '2d6';
                document.getElementById('timer-rundown-text').value = q.rundownText || "Time's Up!";
                document.getElementById('timer-animation').value = q.animationType || 'none';
            }

            // Populate detail text
            document.getElementById('widget-detail-text').value = q.detailText || '';
            let compactShowFormula = q.compactShowFormula;
            let compactShowNote = q.compactShowNote;
            let compactShowDetail = q.compactShowDetail;

            if (compactShowFormula === undefined && compactShowNote === undefined && compactShowDetail === undefined) {
                if (q.compactDisplayPriority === 'note') {
                    compactShowNote = true;
                } else if (q.compactDisplayPriority === 'detail') {
                    compactShowDetail = true;
                } else if (q.compactDisplayPriority === 'formula') {
                    compactShowFormula = true;
                } else if (q.compactDisplayPriority === 'auto') {
                    compactShowFormula = true;
                    compactShowNote = true;
                    compactShowDetail = true;
                } else {
                    compactShowFormula = false;
                    compactShowNote = false;
                    compactShowDetail = false;
                }
            }

            document.getElementById('widget-full-formula').checked = q.fullShowFormula !== false;
            document.getElementById('widget-full-note').checked = q.fullShowNote !== false;
            document.getElementById('widget-full-detail').checked = q.fullShowDetail !== false;
            document.getElementById('widget-show-formula').checked = q.showFormula !== false;
            document.getElementById('widget-show-note').checked = q.showNote !== false;
            document.getElementById('widget-show-detail').checked = q.showDetail !== false;
            document.getElementById('widget-compact-formula').checked = !!compactShowFormula;
            document.getElementById('widget-compact-note').checked = !!compactShowNote;
            document.getElementById('widget-compact-detail').checked = !!compactShowDetail;


            // Populate variable binding
            const hasVarBind = !!q.bindsVariable;
            document.getElementById('widget-bind-var-check').checked = hasVarBind;
            document.getElementById('widget-binds-variable').value = q.bindsVariable || '';
            document.getElementById('widget-variable-rel-type').value = q.variableRelType || 'define';
            toggleWidgetVarBinding(hasVarBind);

            // Populate passive modifiers
            const hasPassiveMods = Array.isArray(q.passiveModifiers) && q.passiveModifiers.length > 0;
            document.getElementById('widget-passive-mods-check').checked = hasPassiveMods;
            const pmList = document.getElementById('passive-mods-list');
            if (pmList) pmList.innerHTML = '';
            if (hasPassiveMods) {
                q.passiveModifiers.forEach(pm => {
                    addPassiveModifierRow(pm.variable, pm.value);
                });
            }
            toggleWidgetPassiveModifiers(hasPassiveMods);

            // Populate display mode pill
            let dm = q.displayMode || 'auto';
            if (dm === 'normal') dm = 'full'; // map old normal to full
            const dmPill = document.querySelector(`input[name="widget-display-mode"][value="${dm}"]`);
            if (dmPill) { dmPill.checked = true; updateDisplayModePills(dm); }

            onWidgetTypeChange(typeSelect.value);

            overlay.classList.remove('hidden');
            overlay.classList.add('flex');

            setTimeout(() => {
                document.getElementById('widget-name').focus();
            }, 50);
            vibrate(5);
        }

        function closeWidgetCreationModal() {
            const overlay = document.getElementById('widget-creation-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex');
            }
            editingWidgetId = null;
            vibrate(5);
        }

        function applyDefaultGridSettingsForType(type) {
            // Compact is always unchecked by default
            document.getElementById('widget-compact-formula').checked = false;
            document.getElementById('widget-compact-note').checked = false;
            document.getElementById('widget-compact-detail').checked = false;

            // Full and Normal default to true
            document.getElementById('widget-full-formula').checked = true;
            document.getElementById('widget-full-note').checked = true;
            document.getElementById('widget-full-detail').checked = true;

            document.getElementById('widget-show-formula').checked = true;
            document.getElementById('widget-show-note').checked = true;
            document.getElementById('widget-show-detail').checked = true;

            // Formula is only relevant for roller, number, timer
            if (type !== 'roller' && type !== 'number' && type !== 'timer') {
                document.getElementById('widget-full-formula').checked = false;
                document.getElementById('widget-show-formula').checked = false;
            }
        }

        function onWidgetTypeChange(type) {
            document.getElementById('widget-roller-addons').classList.add('hidden');
            document.getElementById('widget-stepper-config').classList.add('hidden');
            document.getElementById('widget-toggle-config').classList.add('hidden');
            document.getElementById('widget-text-config').classList.add('hidden');
            document.getElementById('widget-number-config').classList.add('hidden');
            document.getElementById('widget-countdown-config').classList.add('hidden');
            document.getElementById('widget-timer-config')?.classList.add('hidden');

            if (type === 'roller' || type === 'number') {
                document.getElementById('widget-roller-addons').classList.remove('hidden');
            } else if (type === 'stepper') {
                document.getElementById('widget-stepper-config').classList.remove('hidden');
            } else if (type === 'toggle') {
                document.getElementById('widget-toggle-config').classList.remove('hidden');
            } else if (type === 'text') {
                document.getElementById('widget-text-config').classList.remove('hidden');
            } else if (type === 'number') {
                document.getElementById('widget-number-config').classList.remove('hidden');
            } else if (type === 'countdown') {
                document.getElementById('widget-countdown-config').classList.remove('hidden');
            } else if (type === 'timer') {
                document.getElementById('widget-timer-config')?.classList.remove('hidden');
            }

            // Show/Hide formula row in matrix based on widget type
            const formulaRow = document.getElementById('matrix-row-formula');
            if (formulaRow) {
                if (type === 'roller' || type === 'number' || type === 'timer') {
                    formulaRow.style.display = '';
                } else {
                    formulaRow.style.display = 'none';
                }
            }

            // Hide secondary Note input field if type is 'text' to merge note fields
            const noteConfig = document.getElementById('widget-note-config');
            if (noteConfig) {
                if (type === 'text') {
                    noteConfig.classList.add('hidden');
                } else {
                    noteConfig.classList.remove('hidden');
                }
            }

            // Apply default display grid configuration if creating a new widget
            if (editingWidgetId === null) {
                applyDefaultGridSettingsForType(type);
            }
        }


        function toggleWidgetVarBinding(checked) {
            const fields = document.getElementById('widget-var-binding-fields');
            if (fields) {
                if (checked) fields.classList.remove('hidden');
                else fields.classList.add('hidden');
            }
        }

        function toggleWidgetPassiveModifiers(checked) {
            const fields = document.getElementById('widget-passive-mods-fields');
            if (fields) {
                if (checked) fields.classList.remove('hidden');
                else fields.classList.add('hidden');
            }
        }

        function addPassiveModifierRow(variable = '', value = '') {
            const container = document.getElementById('passive-mods-list');
            if (!container) return;

            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 passive-mod-row';
            row.innerHTML = `
                <input type="text" placeholder="STR" value="${variable.toUpperCase()}" 
                    class="flex-1 bg-[#090d16] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#e2e8f0] font-bold uppercase pm-variable">
                <input type="number" placeholder="+2" value="${value}" 
                    class="w-16 bg-[#090d16] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-[#e2e8f0] font-bold text-center pm-value">
                <button type="button" onclick="this.parentElement.remove()" class="text-slate-500 hover:text-rose-500 p-1 shrink-0">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            `;
            container.appendChild(row);
        }

        function selectAddonWidget(type) {
            // Hide all addon config panels
            document.getElementById('addon-stepper-config').classList.add('hidden');
            document.getElementById('addon-toggle-config').classList.add('hidden');

            // Highlight the selected radio label
            document.querySelectorAll('.addon-radio-label').forEach(lbl => {
                const radio = lbl.querySelector('input[type="radio"]');
                if (radio && radio.checked) {
                    lbl.classList.add('border-sky-500/40', 'bg-sky-500/5');
                    lbl.classList.remove('border-white/5', 'bg-[#090d16]/40');
                } else {
                    lbl.classList.remove('border-sky-500/40', 'bg-sky-500/5');
                    lbl.classList.add('border-white/5', 'bg-[#090d16]/40');
                }
            });

            // Show the relevant config panel
            if (type === 'stepper') {
                document.getElementById('addon-stepper-config').classList.remove('hidden');
            } else if (type === 'toggle') {
                document.getElementById('addon-toggle-config').classList.remove('hidden');
            }
        }

        // Legacy aliases (kept for safety)
        function toggleAddonStepperInput(checked) { selectAddonWidget(checked ? 'stepper' : 'none'); }
        function toggleAddonToggleInput(checked) { selectAddonWidget(checked ? 'toggle' : 'none'); }
        function toggleAddonNoteInput(checked) { selectAddonWidget(checked ? 'note' : 'none'); }

        async function submitWidgetCreation() {
            const nameEl = document.getElementById('widget-name');
            const name = nameEl.value.trim() || 'Widget';
            const type = document.getElementById('widget-type').value;
            // Assign a sensible default color by widget type
            const DEFAULT_COLORS_BY_TYPE = {
                roller: '#00d4ff',
                stepper: '#00ff88',
                toggle: '#a855f7',
                number: '#ffea00',
                text: 'none',
                timer: '#ff5500'
            };
            const color = DEFAULT_COLORS_BY_TYPE[type] || '#00d4ff';

            let bindsVariable = null;
            let variableRelType = null;
            if (document.getElementById('widget-bind-var-check').checked) {
                let rawVar = document.getElementById('widget-binds-variable').value.trim().toUpperCase();
                if (rawVar) {
                    rawVar = rawVar.replace(/[^A-Z0-9_]/g, '');
                    if (/^[A-Z]/.test(rawVar)) {
                        bindsVariable = rawVar;
                        variableRelType = document.getElementById('widget-variable-rel-type').value;
                    }
                }
            }

            if (bindsVariable && variableRelType === 'define') {
                const uniqueVar = getUniqueVariableName(activeCharacterId, bindsVariable, editingWidgetId);
                if (uniqueVar !== bindsVariable) {
                    await showModal({
                        title: 'Variable Collision',
                        body: `The variable "${bindsVariable}" is already defined on this character. It has been renamed to "${uniqueVar}" to avoid conflicts.`,
                        alertOnly: true
                    });
                    bindsVariable = uniqueVar;
                }
            }

            let passiveModifiers = null;
            if (document.getElementById('widget-passive-mods-check').checked) {
                const rows = document.querySelectorAll('.passive-mod-row');
                const list = [];
                rows.forEach(row => {
                    const varInput = row.querySelector('.pm-variable');
                    const valInput = row.querySelector('.pm-value');
                    const variableName = varInput ? varInput.value.trim().toUpperCase() : '';
                    const modifierVal = valInput ? parseInt(valInput.value, 10) : 0;
                    if (variableName) {
                        list.push({ variable: variableName, value: modifierVal });
                    }
                });
                if (list.length > 0) {
                    passiveModifiers = list;
                }
            }

            let detailText = document.getElementById('widget-detail-text').value.trim() || null;
            const displayMode = document.querySelector('input[name="widget-display-mode"]:checked')?.value || 'auto';
            const fullShowFormula = document.getElementById('widget-full-formula').checked;
            const fullShowNote = document.getElementById('widget-full-note').checked;
            const fullShowDetail = document.getElementById('widget-full-detail').checked;
            const showFormula = document.getElementById('widget-show-formula').checked;
            const showNote = document.getElementById('widget-show-note').checked;
            const showDetail = document.getElementById('widget-show-detail').checked;
            const compactShowFormula = document.getElementById('widget-compact-formula').checked;
            const compactShowNote = document.getElementById('widget-compact-note').checked;
            const compactShowDetail = document.getElementById('widget-compact-detail').checked;

            if (editingWidgetId !== null) {
                const q = engine.findSavedQueue(editingWidgetId);
                if (q) {
                    q.name = name;
                    q.widgetType = type;
                    q.detailText = detailText;
                    q.addonNote = document.getElementById('addon-note-text').value.trim() || null;
                    q.bindsVariable = bindsVariable;
                    q.variableRelType = variableRelType;
                    q.passiveModifiers = passiveModifiers;
                    q.displayMode = displayMode === 'auto' ? null : displayMode;
                    q.fullShowFormula = fullShowFormula;
                    q.fullShowNote = fullShowNote;
                    q.fullShowDetail = fullShowDetail;
                    q.showFormula = showFormula;
                    q.showNote = showNote;
                    q.showDetail = showDetail;
                    q.compactShowFormula = compactShowFormula;
                    q.compactShowNote = compactShowNote;
                    q.compactShowDetail = compactShowDetail;

                    if (type === 'roller' || type === 'number') {
                        const selectedAddon = document.querySelector('input[name="addon-widget"]:checked')?.value || 'none';
                        q.includeAdvDis = type === 'roller' && selectedAddon === 'advdis';

                        if (selectedAddon === 'stepper') {
                            q.addonCounter = {
                                label: document.getElementById('addon-stepper-label').value.trim() || 'Resource',
                                max: parseInt(document.getElementById('addon-stepper-max').value) || 20,
                                value: Math.min(parseInt(document.getElementById('addon-stepper-val').value) || 20, parseInt(document.getElementById('addon-stepper-max').value) || 20)
                            };
                        } else {
                            q.addonCounter = null;
                        }

                        if (selectedAddon === 'toggle') {
                            q.addonToggle = {
                                checked: q.addonToggle ? q.addonToggle.checked : true,
                                labelOn: document.getElementById('addon-toggle-on').value.trim() || 'Ready',
                                labelOff: document.getElementById('addon-toggle-off').value.trim() || 'Miscast'
                            };
                        } else {
                            q.addonToggle = null;
                        }
                    } else if (type === 'stepper') {
                        q.min = parseInt(document.getElementById('stepper-min').value) || 0;
                        const maxValRaw = document.getElementById('stepper-max').value.trim();
                        const parsedMaxVal = parseInt(maxValRaw, 10);
                        q.max = isNaN(parsedMaxVal) ? maxValRaw : parsedMaxVal;
                        
                        const resolvedMax = (typeof q.max === 'string') ? (window.getActiveCharacterVariable(q.max) ?? 100) : (q.max ?? 100);
                        q.value = Math.max(q.min, Math.min(resolvedMax, parseInt(document.getElementById('stepper-val').value) || 20));
                        q.showTracker = document.getElementById('stepper-tracker').checked;

                        if (name.toLowerCase() === 'hit points' || name.toLowerCase() === 'hp') {
                            const char = characters.find(c => c.id === activeCharacterId);
                            if (char) {
                                if (!char.variables) char.variables = {};
                                char.variables.HP = q.value;
                                char.variables.MaxHP = q.max;
                                persistArsenal();
                                renderBinder();
                            }
                        }
                    } else if (type === 'toggle') {
                        q.checked = document.getElementById('toggle-initial').checked;
                        q.labelOn = document.getElementById('toggle-label-on').value.trim() || 'On';
                        q.labelOff = document.getElementById('toggle-label-off').value.trim() || 'Off';
                    } else if (type === 'number') {
                        q.value = parseInt(document.getElementById('number-val').value) || 0;
                    } else if (type === 'text') {
                        q.text = document.getElementById('text-card-content').value;
                    } else if (type === 'countdown') {
                        ctReadConfigIntoWidget(q);
                    } else if (type === 'timer') {
                        const maxMin = parseInt(document.getElementById('timer-max-min').value) || 10;
                        const currMin = parseInt(document.getElementById('timer-curr-min').value) || 0;
                        const currSec = parseInt(document.getElementById('timer-curr-sec').value) || 0;
                        q.maxTime = maxMin * 60;
                        q.currentTime = (currMin * 60) + currSec;
                        q.diceFormula = document.getElementById('timer-dice-formula').value.trim() || '2d6';
                        q.rundownText = document.getElementById('timer-rundown-text').value.trim() || "Time's Up!";
                        q.animationType = document.getElementById('timer-animation').value || 'none';
                        if (q.currentTime <= 0) {
                            q.isPaused = true;
                        }
                    }

                    persistSaved();
                    const char = characters.find(c => c.id === activeCharacterId);
                    if (char) {
                        syncCharacterVariables(char);
                    }
                    renderSavedQueues();
                    closeWidgetCreationModal();
                    vibrate(10);
                }
                return;
            }

            let newWidget = {
                id: Date.now(),
                characterId: activeCharacterId,
                groupId: activeGroupId,
                name: name,
                color: color,
                widgetType: type,
                queue: [],
                detailText: detailText,
                addonNote: document.getElementById('addon-note-text').value.trim() || null,
                bindsVariable: bindsVariable,
                variableRelType: variableRelType,
                passiveModifiers: passiveModifiers,
                displayMode: displayMode === 'auto' ? null : displayMode,
                fullShowFormula: fullShowFormula,
                fullShowNote: fullShowNote,
                fullShowDetail: fullShowDetail,
                showFormula: showFormula,
                showNote: showNote,
                showDetail: showDetail,
                compactShowFormula: compactShowFormula,
                compactShowNote: compactShowNote,
                compactShowDetail: compactShowDetail
            };

            if (type === 'roller' || type === 'number') {
                if (engine.queue.length > 0) {
                    const saved = engine.saveQueue(name, color);
                    if (saved) {
                        newWidget.queue = saved.queue;
                        newWidget.modifier = saved.modifier;
                        newWidget.modLevel = saved.modLevel;
                        newWidget.flat = saved.flat;
                        newWidget.unifiedQueue = saved.unifiedQueue;
                        newWidget.rules = saved.rules;
                        engine.savedQueues = engine.savedQueues.filter(q => q.id !== saved.id);
                    }
                }
            }

            if (type === 'roller' || type === 'number') {
                const selectedAddon = document.querySelector('input[name="addon-widget"]:checked')?.value || 'none';
                newWidget.includeAdvDis = type === 'roller' && selectedAddon === 'advdis';

                if (selectedAddon === 'stepper') {
                    newWidget.addonCounter = {
                        label: document.getElementById('addon-stepper-label').value.trim() || 'Resource',
                        max: parseInt(document.getElementById('addon-stepper-max').value) || 20,
                        value: parseInt(document.getElementById('addon-stepper-val').value) || 20
                    };
                } else {
                    newWidget.addonCounter = null;
                }

                if (selectedAddon === 'toggle') {
                    newWidget.addonToggle = {
                        checked: true,
                        labelOn: document.getElementById('addon-toggle-on').value.trim() || 'Ready',
                        labelOff: document.getElementById('addon-toggle-off').value.trim() || 'Miscast'
                    };
                } else {
                    newWidget.addonToggle = null;
                }

            } else if (type === 'stepper') {
                newWidget.min = parseInt(document.getElementById('stepper-min').value) || 0;
                newWidget.max = parseInt(document.getElementById('stepper-max').value) || 20;
                newWidget.value = parseInt(document.getElementById('stepper-val').value) || 20;
                newWidget.showTracker = document.getElementById('stepper-tracker').checked;

                if (name.toLowerCase() === 'hit points' || name.toLowerCase() === 'hp') {
                    const char = characters.find(c => c.id === activeCharacterId);
                    if (char) {
                        if (!char.variables) char.variables = {};
                        char.variables.HP = newWidget.value;
                        char.variables.MaxHP = newWidget.max;
                        persistArsenal();
                        renderBinder();
                    }
                }
            } else if (type === 'toggle') {
                newWidget.checked = document.getElementById('toggle-initial').checked;
                newWidget.labelOn = document.getElementById('toggle-label-on').value.trim() || 'On';
                newWidget.labelOff = document.getElementById('toggle-label-off').value.trim() || 'Off';
            } else if (type === 'number') {
                if (newWidget.unifiedQueue && newWidget.unifiedQueue.length > 0) {
                    const res = engine.calculateRoll(newWidget.unifiedQueue, true);
                    newWidget.value = res ? (parseInt(res.total) || 0) : 0;
                } else {
                    newWidget.value = parseInt(document.getElementById('number-val').value) || 0;
                }
            } else if (type === 'text') {
                newWidget.text = document.getElementById('text-card-content').value;
                newWidget.collapsed = false;
            } else if (type === 'countdown') {
                ctReadConfigIntoWidget(newWidget);
            } else if (type === 'timer') {
                const maxMin = parseInt(document.getElementById('timer-max-min').value) || 10;
                const currMin = parseInt(document.getElementById('timer-curr-min').value) || 0;
                const currSec = parseInt(document.getElementById('timer-curr-sec').value) || 0;
                newWidget.maxTime = maxMin * 60;
                newWidget.currentTime = (currMin * 60) + currSec;
                newWidget.diceFormula = document.getElementById('timer-dice-formula').value.trim() || '2d6';
                newWidget.rundownText = document.getElementById('timer-rundown-text').value.trim() || "Time's Up!";
                newWidget.animationType = document.getElementById('timer-animation').value || 'none';
                newWidget.isPaused = true;
            }

            engine.savedQueues.push(newWidget);
            persistSaved();
            const char = characters.find(c => c.id === activeCharacterId);
            if (char) {
                syncCharacterVariables(char);
            }
            renderSavedQueues();
            closeWidgetCreationModal();
            vibrate(10);
        }

        function showVariableModal(widgetId) {
            const q = engine.findSavedQueue(widgetId);
            if (!q || !q.bindsVariable) return;

            const varName = q.bindsVariable;
            const currentVal = window.getActiveCharacterVariable(varName) ?? 0;
            const initialVal = q.value ?? 0;

            const isCalculatedOnly = q.variableRelType !== 'define' || (q.unifiedQueue && q.unifiedQueue.length > 0);

            // Construct the modal body
            let bodyHtml = `
                <div class="space-y-4 text-left">
                    <div class="flex justify-between items-center bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5">
                        <span class="text-xs font-bold text-slate-400">Current Calculated Value</span>
                        <span class="text-lg font-black text-[#00d4ff] tabular-nums">${currentVal >= 0 ? '+' : ''}${currentVal}</span>
                    </div>
            `;

            if (isCalculatedOnly) {
                bodyHtml += `
                    <div class="text-xs text-slate-500 text-center leading-normal italic px-2">
                        This variable is calculated dynamically and cannot be edited directly.
                    </div>
                </div>
                `;
                
                showModal({
                    title: `VARIABLE: ${varName.toUpperCase()}`,
                    body: bodyHtml,
                    alertOnly: true
                });
            } else {
                bodyHtml += `
                    <div class="space-y-2">
                        <label class="text-xs font-bold text-slate-400 block">Base (Initial) Value</label>
                        <input type="number" id="variable-initial-input" value="${initialVal}" 
                               class="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-bold text-center outline-none focus:border-[#00d4ff] transition-colors">
                    </div>
                </div>
                `;

                showModal({
                    title: `VARIABLE: ${varName.toUpperCase()}`,
                    body: bodyHtml,
                    confirmText: 'Save Base Value',
                    cancelText: 'Cancel'
                }).then(confirmed => {
                    if (confirmed) {
                        const inputEl = document.getElementById('variable-initial-input');
                        if (inputEl) {
                            const newBaseVal = parseInt(inputEl.value, 10) || 0;
                            changeNumberValueDirect(widgetId, newBaseVal);
                        }
                    }
                });
            }
        }

        function changeNumberValueDirect(widgetId, newValue) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'number') {
                q.value = parseInt(newValue, 10) || 0;
                persistSaved();
                const char = characters.find(c => c.id === activeCharacterId);
                if (char) {
                    syncCharacterVariables(char);
                }
                renderSavedQueues();
                if (q.bindsVariable) {
                    populateRulesVariableDropdowns();
                    updateUI();
                }
                vibrate(5);
            }
        }

        function toggleWidgetHiddenState(widgetId, event) {
            if (event) event.stopPropagation();
            closeAllArsenalMenus();
            const q = engine.findSavedQueue(widgetId);
            if (q) {
                q.hidden = !q.hidden;
                persistSaved();
                renderSavedQueues();
                vibrate(5);
            }
        }

        function changeStepperValueDirect(widgetId, newValue, isCurrent) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'stepper') {
                const parsed = parseInt(newValue, 10) || 0;
                const resolvedMax = (typeof q.max === 'string') ? (window.getActiveCharacterVariable(q.max) ?? 100) : (q.max ?? 100);
                if (isCurrent) {
                    q.value = Math.max(q.min ?? 0, Math.min(resolvedMax, parsed));
                } else {
                    q.max = parsed;
                    q.value = Math.max(q.min ?? 0, Math.min(q.max, q.value));
                }

                if (q.name.toLowerCase() === 'hit points' || q.name.toLowerCase() === 'hp') {
                    const char = characters.find(c => c.id === activeCharacterId);
                    if (char) {
                        if (!char.variables) char.variables = {};
                        char.variables.HP = q.value;
                        char.variables.MaxHP = q.max;
                        persistArsenal();
                        renderBinder();
                    }
                }
                persistSaved();
                const char = characters.find(c => c.id === activeCharacterId);
                if (char) {
                    syncCharacterVariables(char);
                }
                renderSavedQueues();
                vibrate(5);
            }
        }

        function changeStepperValue(widgetId, delta) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'stepper') {
                const resolvedMax = (typeof q.max === 'string') ? (window.getActiveCharacterVariable(q.max) ?? 100) : (q.max ?? 100);
                q.value = Math.max(q.min ?? 0, Math.min(resolvedMax, q.value + delta));
                if (q.name.toLowerCase() === 'hit points' || q.name.toLowerCase() === 'hp') {
                    const char = characters.find(c => c.id === activeCharacterId);
                    if (char) {
                        if (!char.variables) char.variables = {};
                        char.variables.HP = q.value;
                        char.variables.MaxHP = q.max;
                        persistArsenal();
                        renderBinder();
                    }
                }
                persistSaved();
                const char = characters.find(c => c.id === activeCharacterId);
                if (char) {
                    syncCharacterVariables(char);
                }
                renderSavedQueues();
                vibrate(5);
            }
        }

        function changeToggleValue(widgetId, checked) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'toggle') {
                q.checked = checked;
                persistSaved();
                const char = characters.find(c => c.id === activeCharacterId);
                if (char) {
                    syncCharacterVariables(char);
                }
                renderSavedQueues();
                vibrate(5);
            }
        }

        function toggleTextCardCollapsed(widgetId) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'text') {
                q.collapsed = !(q.collapsed ?? false);
                persistSaved();
                renderSavedQueues();
                vibrate(5);
            }
        }

        // =========================================================================
        // COUNTDOWN TRACKER WIDGET FUNCTIONS
        // =========================================================================

        /** Helper: read config form fields into a widget object (used on save) */
        function ctReadConfigIntoWidget(w) {
            const isBi = document.querySelector('input[name="ct-direction"]:checked')?.value !== 'uni';
            w.biDirectional = isBi;
            w.leftColor = document.getElementById('ct-left-color').value || '#f43f5e';
            w.rightColor = document.getElementById('ct-right-color').value || '#f59e0b';
            w.leftLabel = isBi ? (document.getElementById('ct-left-label').value.trim() || 'Left Side') : '';
            w.rightLabel = isBi
                ? (document.getElementById('ct-right-label').value.trim() || 'Right Side')
                : (document.getElementById('ct-uni-label').value.trim() || 'Effect');
            w.startLabel = document.getElementById('ct-start-label').value.trim() || 'Start';
            w.endLabel = document.getElementById('ct-end-label').value.trim() || 'Complete';
            const rawMin = parseInt(document.getElementById('ct-track-min').value);
            const rawMax = parseInt(document.getElementById('ct-track-max').value);
            w.trackMin = isNaN(rawMin) ? 0 : rawMin;
            w.trackMax = isNaN(rawMax) ? 20 : rawMax;
            const rawStart = parseInt(document.getElementById('ct-track-start').value);
            const clampedStart = isNaN(rawStart) ? w.trackMin : Math.max(w.trackMin, Math.min(w.trackMax, rawStart));
            // Only reset trackValue on create (no undoStack yet); on edit keep the current position
            if (!w.undoStack) {
                w.trackValue = clampedStart;
                w.round = 1;
                w.undoStack = [];
                w.leftBase = 0;
                w.leftMods = [];
                w.rightBase = 0;
                w.rightMods = [];
                w.resolved = false;
                w.resolvedSide = null;
                w.hasEverLeft = false;
            }
            w.escalationEnabled = document.getElementById('ct-escalation-enabled').checked;
            w.escalationValue = parseInt(document.getElementById('ct-escalation-value').value) || 1;
            w.escalationDir = document.querySelector('input[name="ct-escalation-dir"]:checked')?.value || 'left';
        }

        /** Helper: write widget data back into config form (used on re-configure) */
        function ctWriteConfigFromWidget(w) {
            const dirEl = document.querySelector(`input[name="ct-direction"][value="${w.biDirectional !== false ? 'bi' : 'uni'}"]`);
            if (dirEl) { dirEl.checked = true; ctConfigDirectionChange(dirEl.value); }
            document.getElementById('ct-left-color').value = w.leftColor || '#f43f5e';
            document.getElementById('ct-right-color').value = w.rightColor || '#f59e0b';
            document.getElementById('ct-left-color-swatch').style.background = w.leftColor || '#f43f5e';
            document.getElementById('ct-right-color-swatch').style.background = w.rightColor || '#f59e0b';
            document.getElementById('ct-uni-color-swatch').style.background = w.rightColor || '#f59e0b';
            document.getElementById('ct-left-label').value = w.leftLabel || 'Left Side';
            document.getElementById('ct-right-label').value = w.rightLabel || 'Right Side';
            document.getElementById('ct-uni-label').value = w.rightLabel || 'Effect';
            document.getElementById('ct-start-label').value = w.startLabel || 'Start';
            document.getElementById('ct-end-label').value = w.endLabel || 'Complete';
            document.getElementById('ct-track-min').value = w.trackMin ?? 0;
            document.getElementById('ct-track-max').value = w.trackMax ?? 20;
            document.getElementById('ct-track-start').value = w.trackValue ?? w.trackMin ?? 0;
            document.getElementById('ct-escalation-enabled').checked = !!w.escalationEnabled;
            document.getElementById('ct-escalation-config').classList.toggle('hidden', !w.escalationEnabled);
            document.getElementById('ct-escalation-value').value = w.escalationValue ?? 1;
            const edirEl = document.querySelector(`input[name="ct-escalation-dir"][value="${w.escalationDir || 'left'}"]`);
            if (edirEl) edirEl.checked = true;
        }

        /** Toggle bi/uni direction field visibility in the config form */
        function ctConfigDirectionChange(val) {
            document.getElementById('ct-config-bi-fields').classList.toggle('hidden', val === 'uni');
            document.getElementById('ct-config-uni-fields').classList.toggle('hidden', val !== 'uni');
        }

        /** Open the system color picker via the existing Arsenal color-picker overlay */
        function ctPickColor(side, event) {
            if (event) event.stopPropagation();
            // Reuse the existing color-picker overlay
            const overlay = document.getElementById('color-picker-overlay');
            const grid = document.getElementById('color-grid');
            if (!overlay || !grid) return;
            grid.innerHTML = '';
            COLOR_PALETTE.forEach(color => {
                const btn = document.createElement('button');
                btn.className = 'color-option w-10 h-10 rounded-full border-2 border-white/5';
                btn.style.backgroundColor = color;
                btn.onclick = () => {
                    document.getElementById(side === 'left' ? 'ct-left-color' : 'ct-right-color').value = color;
                    const swatchId = side === 'left' ? 'ct-left-color-swatch' : 'ct-right-color-swatch';
                    const sw = document.getElementById(swatchId);
                    if (sw) sw.style.background = color;
                    // also update uni swatch if picking right
                    if (side === 'right') {
                        const uniSw = document.getElementById('ct-uni-color-swatch');
                        if (uniSw) uniSw.style.background = color;
                    }
                    closeColorPicker();
                    vibrate(5);
                };
                grid.appendChild(btn);
            });
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }

        /** Calculate total for a side */
        function ctSideTotal(base, mods) {
            return (parseInt(base) || 0) + (mods || []).reduce((s, m) => s + (parseInt(m.value) || 0), 0);
        }

        /** Get effective track bounds accounting for escalation per-round */
        function ctEffectiveBounds(w) {
            if (!w.escalationEnabled || !w.escalationValue) return { min: w.trackMin, max: w.trackMax };
            const rounds = Math.max(0, (w.round || 1) - 1); // rounds elapsed (not counting round 1 as escalated)
            const step = (w.escalationValue || 0) * rounds;
            let eMin = w.trackMin;
            let eMax = w.trackMax;
            const dir = w.escalationDir || 'left';
            if (dir === 'left' || dir === 'both') eMin = Math.min(w.trackMax, w.trackMin + step);
            if (dir === 'right' || dir === 'both') eMax = Math.max(w.trackMin, w.trackMax - step);
            return { min: eMin, max: eMax };
        }

        /** Check & set resolution state (called after every End Turn) */
        function ctCheckResolution(w) {
            if (w.resolved) return;
            const { min, max } = ctEffectiveBounds(w);
            const tv = w.trackValue;
            // Only trigger if the value has previously left its starting boundary
            if (!w.hasEverLeft) {
                // Mark hasEverLeft if value is NOT at both boundaries simultaneously (i.e. it's moved)
                const startedAtMin = (w.trackValue === min);
                const startedAtMax = (w.trackValue === max);
                if (!startedAtMin && !startedAtMax) w.hasEverLeft = true;
                // Edge: if it jumped straight to opposite end we still resolve
                else if (startedAtMin && tv >= max) { w.hasEverLeft = true; }
                else if (startedAtMax && tv <= min) { w.hasEverLeft = true; }
                else return;
            }
            if (tv >= max) {
                w.resolved = true;
                w.resolvedSide = 'right';
            } else if (tv <= min) {
                w.resolved = true;
                w.resolvedSide = 'left';
            }
        }

        /** End Turn: push undo, advance track, increment round, apply escalation, check resolution */
        function countdownEndTurn(widgetId, event) {
            if (event) event.stopPropagation();
            const w = engine.findSavedQueue(widgetId);
            if (!w || w.resolved) return;

            // Snapshot undo (keep max 10)
            w.undoStack = w.undoStack || [];
            w.undoStack.push({ trackValue: w.trackValue, round: w.round, hasEverLeft: w.hasEverLeft });
            if (w.undoStack.length > 10) w.undoStack.shift();

            const rightTotal = ctSideTotal(w.rightBase, w.rightMods);
            const leftTotal = w.biDirectional !== false ? ctSideTotal(w.leftBase, w.leftMods) : 0;
            const net = rightTotal - leftTotal;

            const { min, max } = ctEffectiveBounds(w);
            w.trackValue = Math.max(min, Math.min(max, (w.trackValue || 0) + net));
            w.round = (w.round || 1) + 1;

            // Mark hasEverLeft if moved away from start
            if (!w.hasEverLeft && w.trackValue !== (w.trackMin ?? 0)) w.hasEverLeft = true;

            ctCheckResolution(w);
            persistSaved();
            renderSavedQueues();
            vibrate(10);
        }

        /** Undo last End Turn */
        function countdownUndo(widgetId, event) {
            if (event) event.stopPropagation();
            const w = engine.findSavedQueue(widgetId);
            if (!w || !w.undoStack || !w.undoStack.length) return;
            const snap = w.undoStack.pop();
            w.trackValue = snap.trackValue;
            w.round = snap.round;
            w.hasEverLeft = snap.hasEverLeft;
            w.resolved = false;
            w.resolvedSide = null;
            persistSaved();
            renderSavedQueues();
            vibrate(5);
        }

        /** Reset countdown to initial state */
        function countdownReset(widgetId, event) {
            if (event) event.stopPropagation();
            const w = engine.findSavedQueue(widgetId);
            if (!w) return;
            w.trackValue = w.trackMin ?? 0;
            w.round = 1;
            w.undoStack = [];
            w.resolved = false;
            w.resolvedSide = null;
            w.hasEverLeft = false;
            persistSaved();
            renderSavedQueues();
            vibrate(5);
        }

        // ---- Breakdown dialog state ----
        var _ctBdWidgetId = null;
        var _ctBdSide = null; // 'left' | 'right'

        function openCountdownBreakdown(widgetId, side, event) {
            if (event) { event.stopPropagation(); event.preventDefault(); }
            const w = engine.findSavedQueue(widgetId);
            if (!w) return;
            _ctBdWidgetId = widgetId;
            _ctBdSide = side;

            const dlg = document.getElementById('ct-breakdown-dialog');
            const titleInput = document.getElementById('ct-bd-title');
            titleInput.value = side === 'left' ? (w.leftLabel || 'Left Side') : (w.rightLabel || 'Right Side');

            const sideColor = side === 'left' ? (w.leftColor || '#f43f5e') : (w.rightColor || '#f59e0b');
            titleInput.style.color = sideColor;

            ctRenderBreakdownBody(w, side);
            dlg.showModal();
            vibrate(5);
        }

        function closeCountdownBreakdown() {
            const dlg = document.getElementById('ct-breakdown-dialog');
            if (dlg) dlg.close();
            _ctBdWidgetId = null;
            _ctBdSide = null;
        }

        function ctBdUpdateLabel(val) {
            if (!_ctBdWidgetId || !_ctBdSide) return;
            const w = engine.findSavedQueue(_ctBdWidgetId);
            if (!w) return;
            if (_ctBdSide === 'left') w.leftLabel = val;
            else w.rightLabel = val;
            persistSaved();
            renderSavedQueues();
        }

        function ctRenderBreakdownBody(w, side) {
            const body = document.getElementById('ct-bd-body');
            if (!body) return;
            const base = side === 'left' ? (w.leftBase || 0) : (w.rightBase || 0);
            const mods = side === 'left' ? (w.leftMods || []) : (w.rightMods || []);
            const sideColor = side === 'left' ? (w.leftColor || '#f43f5e') : (w.rightColor || '#f59e0b');
            const wid = w.id;
            const sign = side === 'left' ? '−' : '+';

            let html = `
                <div class="ct-bd-base-row">
                    <span class="ct-bd-base-label">Base Effect</span>
                    <span style="color:${sideColor};font-size:0.65rem;font-weight:900;margin-right:0.25rem;">${sign}</span>
                    <input type="number" class="ct-bd-num-input" value="${Math.abs(base)}"
                           style="color:${sideColor}"
                           onchange="ctBdUpdateBase('${wid}','${side}',this.value)">
                </div>
            `;

            mods.forEach((m, idx) => {
                html += `
                    <div class="ct-bd-mod-row">
                        <span style="color:${sideColor};font-size:0.65rem;font-weight:900;flex-shrink:0;">${sign}</span>
                        <input type="text" class="ct-bd-mod-label-input" placeholder="Modifier name"
                               value="${(m.label || '').replace(/"/g, '&quot;')}"
                               onchange="ctBdUpdateMod('${wid}','${side}',${idx},'label',this.value)">
                        <input type="number" class="ct-bd-num-input" value="${Math.abs(m.value || 0)}"
                               style="color:${sideColor}"
                               onchange="ctBdUpdateMod('${wid}','${side}',${idx},'value',this.value)">
                        <button class="ct-bd-del-btn" onclick="ctBdRemoveMod('${wid}','${side}',${idx})">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                `;
            });

            const total = ctSideTotal(base, mods);
            const totalDisplay = side === 'left' ? -Math.abs(total) : Math.abs(total);
            html += `
                <button class="ct-bd-add-btn" onclick="ctBdAddMod('${wid}','${side}')">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                    Add Modifier
                </button>
                <div class="ct-bd-total-row">
                    <span class="ct-bd-total-label">Total</span>
                    <span class="ct-bd-total-val" style="color:${sideColor}">${totalDisplay > 0 ? '+' : ''}${totalDisplay}</span>
                </div>
            `;

            body.innerHTML = html;
        }

        function ctBdUpdateBase(wid, side, val) {
            const w = engine.findSavedQueue(wid);
            if (!w) return;
            const parsed = parseInt(val) || 0;
            if (side === 'left') w.leftBase = parsed;
            else w.rightBase = parsed;
            persistSaved();
            renderSavedQueues();
            ctRenderBreakdownBody(w, side); // refresh total
        }

        function ctBdUpdateMod(wid, side, idx, field, val) {
            const w = engine.findSavedQueue(wid);
            if (!w) return;
            const mods = side === 'left' ? w.leftMods : w.rightMods;
            if (!mods || !mods[idx]) return;
            if (field === 'label') mods[idx].label = val;
            else mods[idx].value = parseInt(val) || 0;
            persistSaved();
            renderSavedQueues();
            ctRenderBreakdownBody(w, side);
        }

        function ctBdAddMod(wid, side) {
            const w = engine.findSavedQueue(wid);
            if (!w) return;
            if (side === 'left') { w.leftMods = w.leftMods || []; w.leftMods.push({ label: '', value: 0 }); }
            else { w.rightMods = w.rightMods || []; w.rightMods.push({ label: '', value: 0 }); }
            persistSaved();
            renderSavedQueues();
            ctRenderBreakdownBody(w, side);
        }

        function ctBdRemoveMod(wid, side, idx) {
            const w = engine.findSavedQueue(wid);
            if (!w) return;
            const mods = side === 'left' ? w.leftMods : w.rightMods;
            if (mods) mods.splice(idx, 1);
            persistSaved();
            renderSavedQueues();
            ctRenderBreakdownBody(w, side);
        }

        /** Build the full countdown DOM element for renderSavedQueues */
        function buildCountdownWidget(q) {
            const resolvedName = window.resolveDynamicText ? window.resolveDynamicText(q.name || 'Countdown') : (q.name || 'Countdown');
            const leftColor = q.leftColor || '#1e293b';
            const rightColor = q.rightColor || '#ffffff';
            const isBi = q.biDirectional !== false;
            const { min: effMin, max: effMax } = ctEffectiveBounds(q);
            const trackVal = q.trackValue ?? q.trackMin ?? 0;
            const range = effMax - effMin;
            const pct = range > 0 ? Math.max(0, Math.min(100, ((trackVal - effMin) / range) * 100)) : 0;

            const rightTotal = ctSideTotal(q.rightBase, q.rightMods);
            const leftTotal = isBi ? ctSideTotal(q.leftBase, q.leftMods) : 0;
            const net = rightTotal - leftTotal;
            const netDisplay = net >= 0 ? `+${net}` : `${net}`;

            let netColor = '#64748b';
            if (net > 0) netColor = rightColor;
            else if (net < 0) netColor = leftColor;

            const hasUndo = (q.undoStack || []).length > 0;
            const isResolved = !!q.resolved;
            const undoDisabled = !hasUndo ? 'disabled' : '';

            const el = document.createElement('div');
            const effectiveMode = getEffectiveDisplayMode(q);

            if (effectiveMode === 'compact') {
                el.className = 'ct-widget widget-display-compact';
                const roundLabel = `R${q.round || 1}`;
                const pipBg = isBi ? ('linear-gradient(to bottom, ' + leftColor + ', ' + rightColor + ')') : rightColor;

                let valuesHtml = '';
                if (isBi) {
                    valuesHtml = `<span class="cursor-pointer hover:underline" style="color: ${leftColor}" onclick="openCountdownBreakdown('${q.id}','left',event)">−${Math.abs(leftTotal)}</span>
                                  <span class="text-slate-600 font-bold">/</span>
                                  <span style="color: ${netColor}">${netDisplay}</span>
                                  <span class="text-slate-600 font-bold">/</span>
                                  <span class="cursor-pointer hover:underline" style="color: ${rightColor}" onclick="openCountdownBreakdown('${q.id}','right',event)">+${rightTotal}</span>`;
                } else {
                    valuesHtml = `<span class="cursor-pointer hover:underline" style="color: ${rightColor}" onclick="openCountdownBreakdown('${q.id}','right',event)">+${rightTotal}</span>`;
                }

                let innerHtml = `
                    <div class="absolute left-0 top-0 bottom-0 w-3 shadow-[2px_0_15px_rgba(255,255,255,0.15)] z-10" style="background: ${pipBg}"></div>
                `;

                if (isResolved) {
                    innerHtml += `
                        <!-- Resolved: content takes full height, no track needed -->
                        <div class="flex-1 min-h-0 flex flex-col justify-between pr-3 pt-1 pb-1 z-10 relative">
                            <!-- Row 1: Winner text, Reset button -->
                            <div class="flex items-center justify-between w-full min-w-0">
                                <div class="flex items-center min-w-0 flex-shrink pl-11 pr-2">
                                    <span class="text-xs font-black uppercase tracking-tight truncate" style="color:${q.resolvedSide === 'right' ? rightColor : leftColor}">
                                        ${q.resolvedSide === 'right' ? (q.rightLabel || 'Right') : (q.leftLabel || 'Left')} Wins
                                    </span>
                                </div>
                                <button class="ct-reset-btn text-[10px] font-black uppercase tracking-wider py-1 px-2.5 rounded-lg border border-white/10 bg-[#020617]/40 text-[#00d4ff] hover:bg-white/5 active:scale-95 transition-all shrink-0" onclick="countdownReset('${q.id}',event)">Reset</button>
                            </div>
                            <!-- Row 2: Completion subtitle -->
                            <div class="flex items-center w-full">
                                <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest pl-11">
                                    Countdown Complete — Round ${(q.round || 1) - 1}
                                </span>
                            </div>
                        </div>
                    `;
                } else {
                    innerHtml += `
                        <!-- Content area: flex-1 so it grows above the track flex child -->
                        <div class="flex-1 min-h-0 flex flex-col justify-between pr-3 pt-1 z-10 relative">
                            <!-- Row 1: Name (muted context) + Round badge + END TURN (primary CTA) + Undo -->
                            <div class="flex items-center justify-between w-full min-w-0">
                                <div class="flex items-center min-w-0 flex-shrink pl-11 pr-2">
                                    <div class="flex flex-col min-w-0">
                                        <span class="ct-widget-name text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">${resolvedName}</span>
                                        ${renderWidgetSubtext(q, '', effectiveMode)}
                                    </div>
                                    <span class="ct-round-badge text-[9px] font-black text-slate-500 bg-white/5 border border-white/8 rounded px-1.5 py-0.5 ml-1.5 shrink-0">${roundLabel}</span>
                                </div>
                                <div class="flex items-center gap-1.5 shrink-0 select-none">
                                    <button class="ct-end-turn-btn text-[10px] font-black uppercase tracking-wider py-1 px-2.5 rounded-lg" onclick="countdownEndTurn('${q.id}',event)">End Turn</button>
                                    <button class="ct-undo-btn" onclick="countdownUndo('${q.id}',event)" ${undoDisabled} title="Undo last turn">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:0.7rem;height:0.7rem"><path d="M3 9h13a5 5 0 0 1 0 10H7"/><polyline points="3 9 7 5 3 5"/></svg>
                                    </button>
                                </div>
                            </div>
                            <!-- Row 2: Values (left, dominant) | current track position (right, muted) -->
                            <div class="flex items-center justify-between w-full min-w-0 pb-0.5">
                                <div class="flex items-center gap-2 select-none pl-11 font-black tabular-nums text-sm">
                                    ${valuesHtml}
                                </div>
                                <span class="text-sm font-black tabular-nums text-slate-500 shrink-0 mr-0">${trackVal}</span>
                            </div>
                        </div>

                        <!-- Track: in-flow flex child sits cleanly at the bottom with no overlap -->
                        <div class="ct-compact-track relative h-3 shrink-0 select-none pointer-events-none z-20 flex items-center pl-11 pr-3">
                            <span class="text-[8px] font-black tracking-tight leading-none mr-1.5 shrink-0 select-none" style="color: ${leftColor};">${effMin}</span>
                            <div class="ct-compact-track-line relative flex-grow h-[2px] bg-[#020617]/60 rounded-full">
                                <!-- Endpoint indicators -->
                                <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="left: 0; background-color: ${leftColor}; transform: translate(-50%, -50%);"></div>
                                <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="left: 100%; background-color: ${rightColor}; transform: translate(-50%, -50%);"></div>

                                <div class="h-full rounded-full" style="width:${pct}%; background:linear-gradient(to right,${leftColor},${rightColor});"></div>
                                <div class="absolute top-1/2 w-1.5 h-1.5 bg-[#e2e8f0] rounded-full shadow-[0_0_4px_rgba(255,255,255,0.5)]" style="left: ${pct}%; transform: translate(-50%, -50%); pointer-events: none;"></div>
                            </div>
                            <span class="text-[8px] font-black tracking-tight leading-none ml-1.5 shrink-0 select-none" style="color: ${rightColor};">${effMax}</span>
                        </div>
                    `;
                }

                el.innerHTML = innerHtml;
                return el;
            }

            el.className = 'ct-widget';

            let pipStyle = '';
            if (isBi) {
                pipStyle = `background: linear-gradient(to bottom, ${leftColor}, ${rightColor}); box-shadow: 2px 0 15px rgba(255,255,255,0.15);`;
            } else {
                pipStyle = `background: ${rightColor}; box-shadow: 2px 0 15px ${rightColor};`;
            }
            const roundLabel = `Round ${q.round || 1}`;

            el.innerHTML = `
                <div class="ct-color-pip" style="${pipStyle}"></div>
                <div class="ct-title-bar">
                    
                    <span class="ct-widget-name">${resolvedName}</span>
                    <span class="ct-round-badge">${roundLabel}</span>
                    <button class="ct-end-turn-btn" onclick="countdownEndTurn('${q.id}',event)" ${isResolved ? 'disabled' : ''}>End Turn</button>
                    <button class="ct-undo-btn" onclick="countdownUndo('${q.id}',event)" ${undoDisabled} title="Undo last turn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:0.7rem;height:0.7rem"><path d="M3 9h13a5 5 0 0 1 0 10H7"/><polyline points="3 9 7 5 3 5"/></svg>
                    </button>
                </div>
                ${isResolved ? `
                <div class="ct-resolved-banner ct-pulse">
                    <span class="ct-resolved-winner" style="color:${q.resolvedSide === 'right' ? rightColor : leftColor}">
                        ${q.resolvedSide === 'right' ? (q.rightLabel || 'Right') : (q.leftLabel || 'Left')} Wins
                    </span>
                    <span class="ct-resolved-sub">Countdown Complete — Round ${(q.round || 1) - 1}</span>
                    <button class="ct-reset-btn" onclick="countdownReset('${q.id}',event)">Reset</button>
                </div>
                ` : `
                ${isBi ? `
                <div class="ct-values-row">
                    <div class="ct-side-panel" onclick="openCountdownBreakdown('${q.id}','left',event)" style="border-color:${leftColor}22;">
                        <span class="ct-side-label" style="color:${leftColor}">${q.leftLabel || 'Left Side'}</span>
                        <span class="ct-side-value" style="color:${leftColor}">−${Math.abs(leftTotal)}</span>
                        ${q.leftMods?.length ? `<span class="ct-side-mods">${q.leftMods.length} modifier${q.leftMods.length !== 1 ? 's' : ''}</span>` : ''}
                    </div>
                    <div class="ct-net-col">
                        <span class="ct-net-label">Net</span>
                        <span class="ct-net-value" style="color:${netColor}">${netDisplay}</span>
                    </div>
                    <div class="ct-side-panel" onclick="openCountdownBreakdown('${q.id}','right',event)" style="border-color:${rightColor}22;">
                        <span class="ct-side-label" style="color:${rightColor}">${q.rightLabel || 'Right Side'}</span>
                        <span class="ct-side-value" style="color:${rightColor}">+${rightTotal}</span>
                        ${q.rightMods?.length ? `<span class="ct-side-mods">${q.rightMods.length} modifier${q.rightMods.length !== 1 ? 's' : ''}</span>` : ''}
                    </div>
                </div>
                ` : `
                <div class="ct-uni-panel" onclick="openCountdownBreakdown('${q.id}','right',event)">
                    <span class="ct-uni-side-label" style="color:${rightColor}">${q.rightLabel || 'Effect'}</span>
                    ${q.rightMods?.length ? `<span class="ct-uni-side-mods">${q.rightMods.length} mod${q.rightMods.length !== 1 ? 's' : ''}</span>` : ''}
                    <span class="ct-uni-side-value" style="color:${rightColor}">+${rightTotal}</span>
                </div>
                `}
                <div class="${isBi ? 'ct-track-row' : 'ct-track-row-compact'}">
                    <div class="ct-track-meta">
                        <div class="ct-track-endpoint">
                            <span class="ct-track-endpoint-val" style="color:${leftColor}">${effMin}</span>
                        </div>
                        <div class="ct-track-center">
                            <span class="ct-track-current-val">${trackVal}</span>
                        </div>
                        <div class="ct-track-endpoint">
                            <span class="ct-track-endpoint-val" style="color:${rightColor}">${effMax}</span>
                        </div>
                    </div>
                    <div class="ct-bar-container">
                        <div class="ct-bar-track" style="background:rgba(15,23,42,0.6);">
                            <!-- Endpoint indicators -->
                            <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="left: 0; background-color: ${leftColor}; transform: translate(-50%, -50%);"></div>
                            <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="left: 100%; background-color: ${rightColor}; transform: translate(-50%, -50%);"></div>
                        </div>
                        <div class="ct-bar-fill" style="width:${pct}%; background:linear-gradient(to right,${leftColor},${rightColor});"></div>
                        <div class="ct-bar-thumb" style="left:${pct}%;"></div>
                    </div>
                </div>
                ${(q.showDetail !== false && q.detailText) || (q.showNote !== false && q.addonNote) ? `
                <div class="ct-detail-row" style="padding-top:0.25rem;">
                    ${renderWidgetSubtext(q, '', effectiveMode)}
                </div>
                ` : ''}
                `}
            `;

            return el;
        }

        function changeCardCounterVal(widgetId, delta) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.addonCounter) {
                const c = q.addonCounter;
                c.value = Math.max(0, Math.min(c.max, c.value + delta));
                persistSaved();
                renderSavedQueues();
                vibrate(5);
            }
        }

        function toggleCardAddonState(widgetId, checked) {
            const q = engine.findSavedQueue(widgetId);
            if (q && q.addonToggle) {
                q.addonToggle.checked = checked;
                persistSaved();
                const char = characters.find(c => c.id === activeCharacterId);
                if (char) {
                    syncCharacterVariables(char);
                }
                renderSavedQueues();
                vibrate(5);
            }
        }

        // =========================================================================
        // TIMER WIDGET UTILITIES AND ACTIONS
        // =========================================================================
        var timerInterval = null;

        function startGlobalTimerInterval() {
            if (timerInterval) return;
            timerInterval = setInterval(() => {
                let anyRunning = false;
                engine.savedQueues.forEach(q => {
                    if (q.widgetType === 'timer' && !q.isPaused) {
                        anyRunning = true;
                        if (q.currentTime > 0) {
                            q.currentTime--;
                            if (q.currentTime === 0) {
                                q.isPaused = true;
                                vibrate([100, 50, 100, 50, 100]); // Heavy alarm vibration
                                playTimerFinishedSound();
                            }
                        }
                    }
                });
                if (anyRunning) {
                    updateTimerWidgetDOMs();
                }
            }, 1000);
        }

        function playTimerFinishedSound() {
            if (soundEnabled) {
                try {
                    rollSound.currentTime = 0;
                    rollSound.play();
                } catch (e) {
                    // Ignore autoplay restrictions
                }
            }
        }

        function updateTimerWidgetDOMs() {
            engine.savedQueues.forEach(q => {
                if (q.widgetType === 'timer') {
                    const el = document.getElementById(`timer-card-${q.id}`);
                    if (el) {
                        // Update time text
                        const displayEl = el.querySelector('.timer-time-display');
                        if (displayEl) {
                            displayEl.textContent = formatTime(q.currentTime || 0);
                        }

                        // Update progress bar
                        const barFill = el.querySelector('.timer-bar-fill');
                        if (barFill) {
                            const maxVal = q.maxTime || 600;
                            const currVal = q.currentTime ?? maxVal;
                            const pct = maxVal > 0 ? (currVal / maxVal) * 100 : 0;
                            barFill.style.width = `${pct}%`;
                            const barThumb = el.querySelector('.timer-bar-thumb');
                            if (barThumb) {
                                barThumb.style.left = `${pct}%`;
                            }
                        }

                        // Update play button icon
                        const playBtn = el.querySelector('.timer-play-btn');
                        if (playBtn) {
                            const iconPlay = `<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M8 5v14l11-7z"/></svg>`;
                            const iconPause = `<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
                            playBtn.innerHTML = q.isPaused ? iconPlay : iconPause;
                            playBtn.title = q.isPaused ? "Start Timer" : "Pause Timer";
                        }

                        // Update layout styling for rundown status
                        const innerContainer = el.querySelector('.timer-inner-container');
                        const rundownTextEl = el.querySelector('.timer-rundown-text');
                        const animEl = el.querySelector('.timer-anim-overlay');
                        if (innerContainer && rundownTextEl) {
                            if (q.currentTime === 0) {
                                innerContainer.classList.add('timer-rundown');
                                rundownTextEl.classList.remove('hidden');
                                if (animEl) animEl.classList.add('hidden');
                            } else {
                                innerContainer.classList.remove('timer-rundown');
                                rundownTextEl.classList.add('hidden');
                                if (animEl) animEl.classList.remove('hidden');
                            }
                        }
                    }
                }
            });
        }

        function formatTime(totalSeconds) {
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        function parseDiceFormulaToQueue(formulaString) {
            const clean = formulaString.replace(/\s+/g, '').toLowerCase();
            const queue = [];
            const regex = /([+-])?(\d*)d(\d+)|([+-])?(\d+)/g;
            let match;

            while ((match = regex.exec(clean)) !== null) {
                if (match[0] === '') continue;

                const isDice = match[3] !== undefined;
                if (isDice) {
                    const sign = match[1] || '+';
                    const count = parseInt(match[2] || '1', 10);
                    const sides = parseInt(match[3], 10);

                    if (queue.length > 0) {
                        queue.push({ nodeType: 'operator', operator: sign });
                    } else if (sign === '-') {
                        queue.push({ nodeType: 'modifier', type: 'literal', value: 0, operator: '+' });
                        queue.push({ nodeType: 'operator', operator: '-' });
                    }

                    queue.push({
                        nodeType: 'node',
                        id: 'timer_dice_' + Math.random(),
                        sides: sides,
                        count: count,
                        localModifier: null,
                        localModLevel: 1,
                        rerollOp: null,
                        rerollVal: null,
                        explodeOp: null,
                        explodeVal: null
                    });
                } else {
                    const sign = match[4] || '+';
                    const val = parseInt(match[5], 10);

                    if (queue.length > 0) {
                        queue.push({ nodeType: 'operator', operator: sign });
                    }

                    queue.push({
                        nodeType: 'modifier',
                        id: 'timer_mod_' + Math.random(),
                        type: 'literal',
                        value: val,
                        operator: sign,
                        multiplierType: 'none',
                        multiplierValue: 1,
                        divisorType: 'none',
                        divisorValue: 1,
                        roundMode: 'none'
                    });
                }
            }
            return queue;
        }

        function rollTimerMaxTime(event) {
            if (event) event.stopPropagation();
            const formula = document.getElementById('timer-dice-formula').value.trim();
            if (!formula) return;
            try {
                const queue = parseDiceFormulaToQueue(formula);
                if (queue.length === 0) {
                    haptics.error();
                    return;
                }
                const res = engine.calculateRoll(queue, true);
                if (res && res.total !== undefined) {
                    const rolledMins = Math.max(1, parseInt(res.total) || 1);
                    document.getElementById('timer-max-min').value = rolledMins;
                    document.getElementById('timer-curr-min').value = rolledMins;
                    document.getElementById('timer-curr-sec').value = 0;
                    vibrate(15);
                } else {
                    haptics.error();
                }
            } catch (e) {
                haptics.error();
            }
        }

        function resetTimerConfigInputs(event) {
            if (event) event.stopPropagation();
            const maxVal = document.getElementById('timer-max-min').value;
            document.getElementById('timer-curr-min').value = maxVal;
            document.getElementById('timer-curr-sec').value = 0;
            vibrate(10);
        }

        function adjustTimerMinutes(widgetId, deltaMins, event) {
            if (event) event.stopPropagation();
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'timer') {
                const deltaSecs = deltaMins * 60;
                q.currentTime = Math.max(0, Math.min(q.maxTime, (q.currentTime ?? q.maxTime) + deltaSecs));
                persistSaved();
                updateTimerWidgetDOMs();
                vibrate(10);
            }
        }

        function toggleTimerPlay(widgetId, event) {
            if (event) event.stopPropagation();
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'timer') {
                if (q.currentTime === 0 && q.isPaused) {
                    q.currentTime = q.maxTime;
                }
                q.isPaused = !q.isPaused;
                persistSaved();
                updateTimerWidgetDOMs();
                vibrate(15);

                // Dismiss right-click menu
                document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
                activeMenuId = null;
            }
        }

        function resetTimerWidget(widgetId, event) {
            if (event) event.stopPropagation();
            const q = engine.findSavedQueue(widgetId);
            if (q && q.widgetType === 'timer') {
                q.currentTime = q.maxTime;
                q.isPaused = true;
                persistSaved();
                updateTimerWidgetDOMs();
                vibrate(10);

                // Dismiss right-click menu
                document.querySelectorAll('.arsenal-menu').forEach(m => m.classList.add('hidden'));
                activeMenuId = null;
            }
        }

        function buildTimerWidget(q) {
            const resolvedName = window.resolveDynamicText ? window.resolveDynamicText(q.name || 'Timer') : (q.name || 'Timer');
            const hasColor = q.color && q.color !== 'none';
            const accentColor = hasColor ? q.color : '#00d4ff';

            const maxVal = q.maxTime || 600;
            const currVal = q.currentTime ?? maxVal;
            const pct = maxVal > 0 ? (currVal / maxVal) * 100 : 0;

            const isPaused = q.isPaused !== false;
            const isFinished = currVal === 0;

            const el = document.createElement('div');
            el.className = 'timer-widget';
            el.id = `timer-card-${q.id}`;
            el.style.setProperty('--widget-accent-color', accentColor);

            // Shimmer animation overlay
            let animHtml = '';
            if (q.animationType && q.animationType !== 'none') {
                animHtml = `<div class="timer-anim-overlay timer-anim-${q.animationType} ${isFinished ? 'hidden' : ''}"></div>`;
            }

            const iconPlay = `<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M8 5v14l11-7z"/></svg>`;
            const iconPause = `<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
            const iconReset = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;

            const effectiveMode = getEffectiveDisplayMode(q);

            if (effectiveMode === 'compact') {
                el.className = 'timer-widget widget-display-compact';
                el.innerHTML = `
                    ${animHtml}
                    <div class="timer-inner-container ${isFinished ? 'timer-rundown' : ''} flex flex-col h-full">
                        <!-- Accent side bar -->
                        <div class="absolute left-0 top-0 bottom-0 w-1.5 shadow-[2px_0_15px_var(--widget-accent-color)] z-10" style="background-color: var(--widget-accent-color)"></div>
                        
                        <!-- Content area: single row with name left, timer text right -->
                        <div class="flex-1 min-h-0 flex items-center justify-between pl-7 pr-3 z-10 relative">
                            <div class="flex items-center min-w-0 flex-shrink pr-2">
                                
                                <div class="flex flex-col min-w-0">
                                    <span class="text-[13px] font-black text-slate-400 truncate uppercase tracking-tight">${resolvedName}</span>
                                    ${renderWidgetSubtext(q, q.diceFormula || '', effectiveMode)}
                                </div>
                            </div>
                            <div class="flex flex-col items-end shrink-0 select-none">
                                <span class="timer-time-display text-[13px] font-black text-[#e2e8f0] tracking-tight tabular-nums leading-none" style="${isFinished ? 'color: rgb(248 113 113)' : ''}">${formatTime(currVal)}</span>
                                <span class="timer-rundown-text text-[7px] font-black text-rose-400 uppercase tracking-widest animate-pulse leading-none mt-0.5 ${isFinished ? '' : 'hidden'}">${q.rundownText || "Time's Up!"}</span>
                            </div>
                        </div>
                        
                        <!-- Track: in-flow flex child sits cleanly at the bottom with no overlap -->
                        <div class="timer-bar-container relative h-3 shrink-0 cursor-ew-resize select-none z-20 touch-none flex items-center pl-7 pr-3" style="touch-action: none;">
                            <span class="text-[8px] font-black tracking-tight leading-none text-slate-500 mr-1.5 shrink-0 select-none">0</span>
                            <div class="timer-bar-track relative flex-grow h-[2px] bg-[#020617]/60 rounded-full">
                                <!-- Endpoint indicators -->
                                <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-600" style="left: 0; transform: translate(-50%, -50%);"></div>
                                <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="left: 100%; background-color: var(--widget-accent-color); transform: translate(-50%, -50%);"></div>

                                <div class="timer-bar-fill h-full transition-all duration-75 rounded-full" style="width: ${pct}%; background-color: var(--widget-accent-color); box-shadow: 0 0 8px var(--widget-accent-color);"></div>
                                <div class="timer-bar-thumb absolute top-1/2 w-1.5 h-1.5 bg-[#e2e8f0] rounded-full shadow-[0_0_4px_var(--widget-accent-color)]" style="left: ${pct}%; transform: translate(-50%, -50%); pointer-events: none;"></div>
                            </div>
                            <span class="text-[8px] font-black tracking-tight leading-none ml-1.5 shrink-0 select-none" style="color: var(--widget-accent-color);">${Math.round(maxVal / 60)}</span>
                        </div>
                    </div>
                `;
            } else {
                el.innerHTML = `
                    ${animHtml}
                    <div class="timer-inner-container ${isFinished ? 'timer-rundown' : ''} flex flex-col h-full justify-between">
                        <!-- Accent side bar -->
                        <div class="absolute left-0 top-0 bottom-0 w-1.5 shadow-[2px_0_15px_var(--widget-accent-color)]" style="background-color: var(--widget-accent-color)"></div>
                        
                        <!-- Row 1: Title (left) | Play (right) -->
                        <div class="flex items-center justify-between w-full pl-7 pr-3 pt-2 z-10 relative">
                            <div class="flex items-center min-w-0 flex-shrink pr-2">
                                
                                <div class="flex flex-col min-w-0">
                                    <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight">${resolvedName}</div>
                                    ${renderWidgetSubtext(q, q.diceFormula || '', effectiveMode)}
                                </div>
                            </div>
                            <div class="flex items-center gap-2.5 shrink-0 select-none">
                                <button onclick="toggleTimerPlay('${q.id}', event)" class="timer-play-btn w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-[#020617]/40 text-[#e2e8f0] hover:text-white hover:bg-white/5 active:scale-95 transition-all" title="${isPaused ? 'Start Timer' : 'Pause Timer'}">
                                    ${isPaused ? iconPlay : iconPause}
                                </button>
                            </div>
                        </div>
                        
                        <!-- Row 2: -1M (left) | Time display (center) | +1M (right) -->
                        <div class="flex items-center justify-between w-full pl-4 pr-3 select-none relative min-h-[2.25rem] z-10">
                            <!-- Left: -1M Button -->
                            <button onclick="adjustTimerMinutes('${q.id}', -1, event)" class="timer-step-btn w-10 py-1" title="Subtract 1 minute">
                                −1m
                            </button>

                            <!-- Center: Time Display -->
                            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center flex flex-col items-center">
                                <span class="timer-time-display text-2xl font-black text-[#e2e8f0] tracking-tight tabular-nums leading-none">
                                    ${formatTime(currVal)}
                                </span>
                                <span class="timer-rundown-text text-[9px] font-black text-rose-500 uppercase tracking-widest mt-0.5 animate-pulse leading-none ${isFinished ? '' : 'hidden'}">
                                    ${q.rundownText || "Time's Up!"}
                                </span>
                            </div>

                            <!-- Right: +1M Button -->
                            <button onclick="adjustTimerMinutes('${q.id}', 1, event)" class="timer-step-btn w-10 py-1" title="Add 1 minute">
                                +1m
                            </button>
                        </div>

                        <!-- Progress bar (In-flow flex item!) -->
                        <div class="timer-bar-container relative h-6 shrink-0 cursor-ew-resize select-none z-20 touch-none flex items-center pl-4 pr-3 pb-2" style="touch-action: none;">
                            <span class="text-[9px] font-black text-slate-500 mr-2.5 shrink-0 select-none">0</span>
                            <div class="timer-bar-track relative flex-grow h-1 bg-[#020617]/60 rounded-full">
                                <!-- Endpoint indicators -->
                                <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-600" style="left: 0; transform: translate(-50%, -50%);"></div>
                                <div class="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="left: 100%; background-color: var(--widget-accent-color); transform: translate(-50%, -50%);"></div>

                                <div class="timer-bar-fill h-full transition-all duration-75 rounded-full" style="width: ${pct}%; background-color: var(--widget-accent-color); box-shadow: 0 0 10px var(--widget-accent-color);"></div>
                                <div class="timer-bar-thumb absolute top-1/2 w-2 h-4.5 bg-[#e2e8f0] rounded-full shadow-[0_0_6px_var(--widget-accent-color)]" style="left: ${pct}%; transform: translate(-50%, -50%); pointer-events: none;"></div>
                            </div>
                            <span class="text-[9px] font-black ml-2.5 shrink-0 select-none" style="color: var(--widget-accent-color);">${Math.round(maxVal / 60)}</span>
                        </div>
                    </div>
                `;
            }

            // Bind draggable slider logic to the progress bar container
            const bar = el.querySelector('.timer-bar-container');
            const track = el.querySelector('.timer-bar-track');
            if (bar && track) {
                let isDragging = false;

                const updateTimeFromPointer = (e) => {
                    const rect = track.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const offsetX = clientX - rect.left;
                    const pct = Math.max(0, Math.min(1, offsetX / rect.width));

                    const maxVal = q.maxTime || 600;
                    q.currentTime = Math.round(pct * maxVal);

                    // Update DOM display immediately for fluid responsiveness
                    const displayEl = el.querySelector('.timer-time-display');
                    if (displayEl) {
                        displayEl.textContent = formatTime(q.currentTime);
                    }
                    const barFill = el.querySelector('.timer-bar-fill');
                    if (barFill) {
                        barFill.style.width = `${pct * 100}%`;
                    }
                    const barThumb = el.querySelector('.timer-bar-thumb');
                    if (barThumb) {
                        barThumb.style.left = `${pct * 100}%`;
                    }
                };

                bar.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();

                    bar.setPointerCapture(e.pointerId);
                    isDragging = true;
                    updateTimeFromPointer(e);
                    vibrate(5);
                });

                bar.addEventListener('pointermove', (e) => {
                    if (!isDragging) return;
                    e.stopPropagation();
                    updateTimeFromPointer(e);
                });

                const stopDrag = (e) => {
                    if (!isDragging) return;
                    e.stopPropagation();
                    bar.releasePointerCapture(e.pointerId);
                    isDragging = false;

                    persistSaved();
                    vibrate(10);
                };

                bar.addEventListener('pointerup', stopDrag);
                bar.addEventListener('pointercancel', stopDrag);
            }

            return el;
        }

        // Start the global timer interval on script execution
        startGlobalTimerInterval();

        // =========================================================================
        // CHARACTER RESOURCES & VARIABLES MANAGEMENT
        // =========================================================================

        function getCalculatedVariables(char) {
            if (!char) return {};
            const originalGetVar = window.getActiveCharacterVariable;
            const vars = {}; // Holds fully resolved variables
            const rawVars = {}; // Holds raw values from character sheet
            const computing = new Set();

            if (char.variables) {
                for (const [k, v] of Object.entries(char.variables)) {
                    rawVars[k.toUpperCase()] = parseInt(v) || 0;
                }
            }

            if (typeof engine === 'undefined' || !engine.savedQueues) return rawVars;
            const charWidgets = engine.savedQueues.filter(w => w.characterId === char.id);

            const isWidgetActive = (w) => {
                if (w.widgetType === 'toggle') return !!w.checked;
                if (w.addonToggle) return !!w.addonToggle.checked;
                return true;
            };

            const getWidgetValue = (w) => {
                if (w.widgetType === 'toggle') return w.checked ? 1 : 0;
                if (w.widgetType === 'roller' || (w.widgetType === 'number' && w.unifiedQueue && w.unifiedQueue.length > 0)) {
                    const res = engine.calculateRoll(w.unifiedQueue || w.queue, true);
                    return res ? (parseInt(res.total) || 0) : 0;
                }
                return parseInt(w.value) || 0;
            };

            const baseStats = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

            // Resolve a variable on-demand
            function resolveVariable(name) {
                if (!name) return 0;
                const upperName = name.toUpperCase();
                // If already computed, return it
                if (vars[upperName] !== undefined) {
                    return vars[upperName];
                }
                // Detect circular dependency
                if (computing.has(upperName)) {
                    // Return fallback value from rawVars or 0 to break loop
                    return rawVars[upperName] !== undefined ? rawVars[upperName] : 0;
                }

                computing.add(upperName);

                try {
                    // Check if there is any widget that defines this variable
                    const hasDefineWidget = charWidgets.some(w => w.bindsVariable && w.bindsVariable.toUpperCase() === upperName && w.variableRelType === 'define');

                    // If it's a base stat modifier (e.g., DEX_mod) and we don't have a define widget for it
                    if (upperName.endsWith('_MOD') && !hasDefineWidget) {
                        const baseName = upperName.slice(0, -4);
                        if (baseStats.includes(baseName)) {
                            const baseVal = resolveVariable(baseName);
                            vars[upperName] = Math.floor((baseVal - 10) / 2);
                            return vars[upperName];
                        }
                    }

                    // Find active widgets that bind to this variable
                    const activeBinders = charWidgets.filter(w => w.bindsVariable && w.bindsVariable.toUpperCase() === upperName && isWidgetActive(w));

                    // Find passive modifiers from active widgets for this variable
                    const activePassiveModifiers = [];
                    charWidgets.forEach(w => {
                        if (isWidgetActive(w) && Array.isArray(w.passiveModifiers)) {
                            w.passiveModifiers.forEach(pm => {
                                if (pm.variable && pm.variable.toUpperCase() === upperName) {
                                    activePassiveModifiers.push({
                                        value: parseInt(pm.value) || 0,
                                        widget: w
                                    });
                                }
                            });
                        }
                    });



                    if (activeBinders.length > 0 || hasDefineWidget || activePassiveModifiers.length > 0) {
                        // 1. Process define
                        const defWidget = activeBinders.find(w => w.variableRelType === 'define');
                        let val = 0;
                        if (defWidget) {
                            val = getWidgetValue(defWidget);
                        } else if (!hasDefineWidget) {
                            // If there is no define widget at all, fallback to rawVars
                            val = rawVars[upperName] !== undefined ? rawVars[upperName] : 0;
                        }

                        // 2. Process modifies
                        activeBinders.forEach(w => {
                            if (w.variableRelType === 'modify') {
                                val += getWidgetValue(w);
                            }
                        });

                        // 3. Process passive modifiers
                        activePassiveModifiers.forEach(pm => {
                            val += pm.value;
                        });

                        vars[upperName] = val;
                    } else {
                        // No widgets bind to this variable, fallback to rawVars or 0
                        vars[upperName] = rawVars[upperName] !== undefined ? rawVars[upperName] : 0;
                    }
                    return vars[upperName];
                } finally {
                    computing.delete(upperName);
                }
            }

            // Set up the global variable retriever to use our resolveVariable function
            window.getActiveCharacterVariable = function (name) {
                return resolveVariable(name);
            };

            try {
                // Force resolution of all variables bound by active widgets to populate the `vars` object completely
                charWidgets.forEach(w => {
                    if (w.bindsVariable) {
                        resolveVariable(w.bindsVariable);
                    }
                    if (isWidgetActive(w) && Array.isArray(w.passiveModifiers)) {
                        w.passiveModifiers.forEach(pm => {
                            if (pm.variable) {
                                resolveVariable(pm.variable);
                            }
                        });
                    }
                });

                // Also make sure all base stats and their modifiers are resolved
                baseStats.forEach(stat => {
                    resolveVariable(stat);
                    resolveVariable(`${stat}_MOD`);
                });

                // Calculate Backstab_Dice dynamically at the end if not already defined (1 + LVL / 2 rounded down)
                if (vars["BACKSTAB_DICE"] === undefined) {
                    const lvl = resolveVariable("LVL");
                    vars["BACKSTAB_DICE"] = 1 + Math.floor((lvl || 1) / 2);
                }
            } finally {
                window.getActiveCharacterVariable = originalGetVar;
            }

            return vars;
        }

        window.getActiveCharacterVariable = function (name) {
            if (typeof characters === 'undefined') return null;
            const char = characters.find(c => c.id === activeCharacterId);
            if (!char) return null;
            const vars = getCalculatedVariables(char);
            if (name) {
                const upperName = name.toUpperCase();
                if (vars[upperName] !== undefined) {
                    return vars[upperName];
                }
            }
            return null;
        };

        function syncCharacterVariables(char) {
            if (!char) return;
            const vars = getCalculatedVariables(char);
            if (!char.variables) char.variables = {};
            let changed = false;

            // Sync all calculated vars to char.variables
            Object.keys(vars).forEach(k => {
                const existingKey = Object.keys(char.variables).find(x => x.toUpperCase() === k);
                const strVal = String(vars[k]);
                if (existingKey) {
                    if (char.variables[existingKey] !== strVal) {
                        char.variables[existingKey] = strVal;
                        changed = true;
                    }
                } else {
                    char.variables[k] = strVal;
                    changed = true;
                }
            });

            // Also keep widgets' value in sync in engine.savedQueues
            if (typeof engine !== 'undefined' && engine.savedQueues) {
                const charWidgets = engine.savedQueues.filter(w => w.characterId === char.id);
                charWidgets.forEach(w => {
                    if (w.widgetType === 'number' && w.bindsVariable) {
                        const hasFormula = w.unifiedQueue && w.unifiedQueue.length > 0;
                        if (w.variableRelType === 'define' && !hasFormula) {
                            return;
                        }
                        const upperBindVar = w.bindsVariable.toUpperCase();
                        if (vars[upperBindVar] !== undefined) {
                            const targetVal = vars[upperBindVar];
                            if (w.value !== targetVal) {
                                w.value = targetVal;
                                changed = true;
                            }
                        }
                    }
                });
            }

            if (changed) {
                persistArsenal();
                persistSaved();
            }
        }

        function getUniqueVariableName(charId, varName, excludeWidgetId) {
            if (!varName) return null;
            let baseName = varName.toUpperCase().replace(/[^A-Z0-9_]/g, '');
            if (!baseName) return null;

            let candidate = baseName;
            let suffix = 1;

            const isNameTaken = (name) => {
                return engine.savedQueues.some(w => 
                    w.characterId === charId && 
                    w.id !== excludeWidgetId && 
                    w.bindsVariable && 
                    w.bindsVariable.toUpperCase() === name && 
                    w.variableRelType === 'define'
                );
            };

            while (isNameTaken(candidate)) {
                candidate = `${baseName}_${suffix}`;
                suffix++;
            }

            return candidate;
        }

        async function duplicateWidget(widgetId, event) {
            if (event) event.stopPropagation();
            const original = engine.savedQueues.find(w => w.id === widgetId);
            if (!original) return;

            // Hide the active menu
            const menus = document.querySelectorAll('.arsenal-menu');
            menus.forEach(m => m.classList.add('hidden'));

            const clone = JSON.parse(JSON.stringify(original));
            clone.id = 'w_dup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

            if (clone.bindsVariable && clone.variableRelType === 'define') {
                const uniqueVar = getUniqueVariableName(clone.characterId, clone.bindsVariable, null);
                if (uniqueVar !== clone.bindsVariable) {
                    await showModal({
                        title: 'Variable Collision',
                        body: `The variable "${clone.bindsVariable}" is already defined on this character. The duplicated widget's variable has been renamed to "${uniqueVar}" to avoid conflicts.`,
                        alertOnly: true
                    });
                    clone.bindsVariable = uniqueVar;
                }
            }

            // Find index of original and insert clone after it
            const idx = engine.savedQueues.findIndex(w => w.id === widgetId);
            if (idx !== -1) {
                engine.savedQueues.splice(idx + 1, 0, clone);
            } else {
                engine.savedQueues.push(clone);
            }

            persistSaved();
            const char = characters.find(c => c.id === original.characterId);
            if (char) {
                syncCharacterVariables(char);
            }
            renderSavedQueues();
            vibrate(10);
        }

        function populateRulesVariableDropdowns() {
            const sumValEl = document.getElementById('rule-sum-val');
            const countValEl = document.getElementById('rule-count-thresh-val');
            if (!sumValEl || !countValEl) return;

            const currentSumVal = sumValEl.value;
            const currentCountVal = countValEl.value;

            let optionsHtml = `
                <option value="overall">Target</option>
                <option value="varX">Variable X</option>
            `;

            const char = characters.find(c => c.id === activeCharacterId);
            if (char) {
                const vars = getCalculatedVariables(char);
                Object.keys(vars).forEach(name => {
                    optionsHtml += `<option value="${name}">${name}</option>`;
                });
            }

            sumValEl.innerHTML = optionsHtml;
            countValEl.innerHTML = optionsHtml;

            if ([...sumValEl.options].some(o => o.value === currentSumVal)) {
                sumValEl.value = currentSumVal;
            } else {
                sumValEl.value = 'overall';
            }

            if ([...countValEl.options].some(o => o.value === currentCountVal)) {
                countValEl.value = currentCountVal;
            } else {
                countValEl.value = 'overall';
            }

            // Populate New Mod Chip selects
            const baseVar = document.getElementById('new-node-base-variable');
            const multVar = document.getElementById('new-node-mult-variable');
            const divVar = document.getElementById('new-node-div-variable');

            populateVariablesDropdown(baseVar);
            populateVariablesDropdown(multVar);
            populateVariablesDropdown(divVar);
        }



        // Group CRUD
        var activeGroupMenuId = null;

        function openGroupContextMenu(groupId, e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            vibrate(5);

            const menu = document.getElementById('group-menu');
            if (!menu) return;

            // Mark this group as active so that actions operate on it
            activeGroupId = groupId;
            renderGroupTabs(); // Highlight the tab

            closeAllArsenalMenus();

            menu.classList.remove('hidden');
            activeGroupMenuId = groupId;

            let clientX = 0;
            let clientY = 0;

            if (e) {
                if (e.touches && e.touches.length > 0) {
                    clientX = e.touches[0].clientX;
                    clientY = e.touches[0].clientY;
                } else if (e.changedTouches && e.changedTouches.length > 0) {
                    clientX = e.changedTouches[0].clientX;
                    clientY = e.changedTouches[0].clientY;
                } else {
                    clientX = e.clientX;
                    clientY = e.clientY;
                }
            }

            const menuWidth = 160;
            let left = clientX;
            let top = clientY;

            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 12;
            }
            if (left < 12) left = 12;

            const menuHeight = 180;
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 12;
            }
            if (top < 12) top = 12;

            menu.style.position = 'fixed';
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.right = 'auto';
            menu.style.bottom = 'auto';
        }

        function addGroup(e) {
            if (e) e.stopPropagation();
            document.getElementById('group-menu').classList.add('hidden');
            showModal({ title: 'Add Group', body: 'Enter group name:', confirmText: 'Add', inputPrompt: true, defaultValue: `Group ${groups.filter(g => g.characterId === activeCharacterId).length + 1}` }).then(name => {
                if (!name || !name.trim()) return;
                const id = 'grp_' + Date.now();
                const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
                groups.push({ id, name: name.trim(), color, characterId: activeCharacterId });
                activeGroupId = id;
                renderGroupTabs();
                renderSavedQueues();
                persistArsenal();
                vibrate(5);
            });
        }

        function renameGroup(e) {
            if (e) e.stopPropagation();
            document.getElementById('group-menu').classList.add('hidden');
            const grp = groups.find(g => g.id === activeGroupId);
            if (!grp) return;
            showModal({ title: 'Rename Group', body: 'Enter new name:', confirmText: 'Rename', inputPrompt: true, defaultValue: grp.name }).then(name => {
                if (!name || !name.trim()) return;
                grp.name = name.trim();
                renderGroupTabs();
                persistArsenal();
                vibrate(5);
            });
        }

        function removeGroup(e) {
            if (e) e.stopPropagation();
            document.getElementById('group-menu').classList.add('hidden');
            const grp = groups.find(g => g.id === activeGroupId);
            if (!grp) return;
            showModal({ title: `Remove <span class="text-rose-400">${grp.name}</span>?`, body: 'All loadouts in this group will be deleted.', confirmText: 'Remove', danger: true }).then(ok => {
                if (!ok) return;
                engine.savedQueues = engine.savedQueues.filter(q => q.groupId !== activeGroupId);
                groups = groups.filter(g => g.id !== activeGroupId);
                const remaining = groups.filter(g => g.characterId === activeCharacterId);
                activeGroupId = remaining.length ? remaining[0].id : null;
                renderGroupTabs();
                renderSavedQueues();
                persistSaved();
                persistArsenal();
                vibrate(10);
            });
        }

        function groupAppearance(e) {
            if (e) e.stopPropagation();
            document.getElementById('group-menu').classList.add('hidden');
            const grp = groups.find(g => g.id === activeGroupId);
            if (!grp) return;
            pickerTargetId = '__group__' + activeGroupId;
            const overlay = document.getElementById('color-picker-overlay');
            const grid = document.getElementById('color-grid');
            grid.innerHTML = '';
            COLOR_PALETTE.forEach(color => {
                const btn = document.createElement('button');
                btn.className = 'color-option w-10 h-10 rounded-full border-2 border-white/5';
                btn.style.backgroundColor = color;
                btn.onclick = () => {
                    grp.color = color;
                    persistArsenal();
                    renderGroupTabs();
                    closeColorPicker();
                    vibrate(5);
                };
                grid.appendChild(btn);
            });
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }

        function moveQueueToGroup(id, e) {
            if (e) e.stopPropagation();
            closeAllArsenalMenus();
            const item = engine.findSavedQueue(id);
            if (!item) return;
            const charGroups = groups.filter(g => g.characterId === activeCharacterId);
            const options = charGroups.filter(g => g.id !== item.groupId);
            if (options.length === 0) { showModal({ title: 'No Other Groups', body: 'Create another group first to move this loadout.', alertOnly: true }); return; }
            const optHtml = '<div class="flex flex-col gap-2 mt-3">' + options.map(g =>
                `<button onclick="document.getElementById('modal-overlay').classList.add('hidden');document.getElementById('modal-overlay').classList.remove('flex');assignQueueGroup('${id}','${g.id}')" class="py-2 px-3 rounded-xl border border-white/10 text-xs font-bold text-[#e2e8f0] hover:bg-white/5 flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${g.color}"></span>${g.name}</button>`
            ).join('') + '</div>';
            showModal({ title: 'Move to Group', body: optHtml, alertOnly: true, confirmText: 'Cancel' });
        }

        function assignQueueGroup(id, groupId) {
            const item = engine.findSavedQueue(id);
            if (item) {
                item.groupId = groupId;
                persistSaved();
                renderSavedQueues();
                vibrate(5);
            }
        }


        var dragSrcId = null;
        var dragSrcGroupId = null;






        async function executeRollChain(startId, e, forcedModifier = null) {
            if (isRolling) return;

            // Set rolling state
            isRolling = true;

            // Re-find the starting button for CSS animations
            let btn = document.querySelector(`.saved-item[data-id="${startId}"]`) || (e ? e.currentTarget : document.getElementById('roll-button'));
            btn.classList.add('is-charging-btn');

            const container = document.getElementById('main-container');
            container.classList.add('is-charging');
            container.classList.remove('is-resolved');

            let completedSteps = [];

            // A modular recursive runner so that we can support multi-hop chains!
            async function rollStep(itemId, name, color, stepForcedModifier = null) {
                const item = engine.findSavedQueue(itemId);
                if (!item) return null;

                const queue = item.unifiedQueue || item.queue;
                const overrides = {
                    modifier: stepForcedModifier || item.modifier,
                    modLevel: stepForcedModifier ? Math.max(1, item.modLevel || 1) : item.modLevel,
                    flat: item.flat,
                    rules: item.rules
                };

                // 1. Roll math
                const res = engine.calculateRoll(queue, false, overrides);
                if (!res) return null;

                // 2. Initial Haptics
                vibrate(12);

                // 3. Scramble progress
                let scramblePromise = new Promise(resolve => {
                    let frame = 0;
                    const scrambleTimer = setInterval(() => {
                        renderChainProgress(completedSteps, Math.floor(Math.random() * 20) + 1, name, color);
                        frame++;
                        if (frame >= 8) {
                            clearInterval(scrambleTimer);
                            resolve();
                        }
                    }, 35);
                });

                await scramblePromise;

                // 4. Resolve sounds & vibrations
                try { playRollSound(); } catch (err) { }
                if (res.heroClass === 'crit-hit') vibrate([45, 90, 45]);
                else if (res.heroClass === 'crit-fail') vibrate(65);
                else vibrate(25);

                // 5. Add to history
                let historyText = res.flatDescription;
                if (res.targetMode === 'count') historyText = `${res.total} Dice | ${historyText}`;
                addToHistory(res.total, `${name}: ${historyText}`);

                return res;
            }

            try {
                // Get primary item
                const startItem = engine.findSavedQueue(startId);
                if (!startItem) throw new Error("Start loadout not found");

                const chain = startItem.chain || {};

                // A. Check if pre-roll exists
                let prePassed = true;
                if (chain.preRoll && chain.preRoll.arsenalId) {
                    const preItem = engine.findSavedQueue(chain.preRoll.arsenalId);
                    if (preItem) {
                        const preRes = await rollStep(chain.preRoll.arsenalId, preItem.name, preItem.color || '#00d4ff');
                        if (preRes) {
                            completedSteps.push({ name: preItem.name, result: preRes, color: preItem.color || '#00d4ff' });

                            // Check success
                            const isPreSuccess = preRes.labels.some(l => l.color === 'emerald');
                            if (chain.preRoll.haltOnFail && !isPreSuccess) {
                                prePassed = false;
                            }
                        }
                    }
                }

                if (!prePassed) {
                    // Halting execution
                    renderChainFinal(completedSteps, "PREREQUISITE FAILED", "rose");
                    vibrate([100, 50, 100]);
                } else {
                    // B. Roll primary step
                    const primaryRes = await rollStep(startId, startItem.name, startItem.color || '#00d4ff', forcedModifier);
                    if (primaryRes) {
                        completedSteps.push({ name: startItem.name, result: primaryRes, color: startItem.color || '#00d4ff' });

                        // Evaluate post-roll branching conditions
                        const isSuccess = primaryRes.labels.some(l => l.color === 'emerald');
                        const isCrit = primaryRes.heroClass === 'crit-hit' || primaryRes.labels.some(l => l.text.includes('NATURAL 20') || l.text.includes('NAT 20'));

                        let postRollTargetId = null;

                        if (isCrit && chain.postRoll && chain.postRoll.crit && chain.postRoll.crit.arsenalId) {
                            postRollTargetId = chain.postRoll.crit.arsenalId;
                        } else if (isSuccess && chain.postRoll && chain.postRoll.success && chain.postRoll.success.arsenalId) {
                            postRollTargetId = chain.postRoll.success.arsenalId;
                        } else if (!isSuccess && chain.postRoll && chain.postRoll.fail && chain.postRoll.fail.arsenalId) {
                            postRollTargetId = chain.postRoll.fail.arsenalId;
                        }

                        if (postRollTargetId) {
                            const postItem = engine.findSavedQueue(postRollTargetId);
                            if (postItem) {
                                const postRes = await rollStep(postRollTargetId, postItem.name, postItem.color || '#00d4ff');
                                if (postRes) {
                                    completedSteps.push({ name: postItem.name, result: postRes, color: postItem.color || '#00d4ff' });
                                }
                            }
                        }

                        renderChainFinal(completedSteps);
                    }
                }
            } catch (err) {
                console.error("Chain roll error:", err);
            } finally {
                // Finalize state
                isRolling = false;
                btn.classList.remove('is-charging-btn');
                container.classList.remove('is-charging');
                container.classList.add('is-resolved');

                setTimeout(() => {
                    if (container.classList.contains('is-resolved')) {
                        container.classList.remove('is-resolved');
                    }
                }, 800);
            }
        }

        var isRolling = false;

        function triggerRoll(e, options = {}) {
            if (e && e.cancelable) e.preventDefault();
            if (isRolling) return;

            // 1. Prepare Data
            let forcedQueue = null;
            let isInstant = false;
            let rollOverrides = null;

            if (options.arsenalId) {
                const item = engine.findSavedQueue(options.arsenalId);
                if (item) {
                    if (item.addonToggle && !item.addonToggle.checked) {
                        vibrate([45, 50, 45]);
                        return;
                    }
                    activeLoadoutId = options.arsenalId;
                    if (isArsenalQueue === 'Roll & Queue' || isArsenalQueue === 'Queue Only') {
                        loadQueue(options.arsenalId);
                        if (options.forcedModifier) {
                            engine.activeModifier = options.forcedModifier;
                            engine.modifierLevel = 1;
                            updateUI();
                        }
                    }
                    if (isArsenalQueue === 'Queue Only') {
                        return;
                    }

                    // Check if there is an active chain config
                    const hasChain = item.chain && (
                        (item.chain.preRoll && item.chain.preRoll.arsenalId) ||
                        (item.chain.postRoll && (
                            item.chain.postRoll.success?.arsenalId ||
                            item.chain.postRoll.crit?.arsenalId ||
                            item.chain.postRoll.fail?.arsenalId
                        ))
                    );

                    if (hasChain) {
                        executeRollChain(options.arsenalId, e, options.forcedModifier);
                        return;
                    }

                    // "Fire-and-forget": Roll using item settings 
                    forcedQueue = item.unifiedQueue || item.queue;
                    isInstant = false;
                    rollOverrides = {
                        modifier: options.forcedModifier || item.modifier,
                        modLevel: options.forcedModifier ? 1 : item.modLevel,
                        flat: item.flat,
                        rules: item.rules
                    };
                }
            } else if (options.sides) {
                if (isInstaQueue === 'Queue Only') {
                    changeQueue(options.sides, 1);
                    return;
                }
                if (isInstaQueue === 'Roll & Queue') {
                    changeQueue(options.sides, 1);
                }
                forcedQueue = [{ sides: options.sides, count: options.count || 1 }];
                isInstant = options.isInstant || false;
            }

            // 2. Start Roll Process
            isRolling = true;

            // For Arsenal clicks, the button element is replaced in the DOM during loadQueue,
            // so we must re-find it using the ID to ensure the animation is visible.
            let btn;
            if (options.arsenalId) {
                btn = document.querySelector(`.saved-item[data-id="${options.arsenalId}"]`) || (e ? e.currentTarget : document.getElementById('roll-button'));
            } else {
                btn = e ? e.currentTarget : document.getElementById('roll-button');
            }

            btn.classList.add('is-charging-btn');
            const container = document.getElementById('main-container');
            container.classList.add('is-charging');
            container.classList.remove('is-resolved');

            vibrate(10); // keep tactile feedback for button press

            try {
                // 3. Calculate Result IMMEDIATELY
                const res = engine.calculateRoll(forcedQueue, isInstant, rollOverrides);
                if (!res) {
                    isRolling = false;
                    btn.classList.remove('is-charging-btn');
                    container.classList.remove('is-charging');
                    return;
                }

                // 4. Scramble Animation (Fixed 0.3s)
                updateDisplay("...", "rolling");

                let frame = 0;
                const totalFrames = 8;
                const scrambleTimer = setInterval(() => {
                    try {
                        updateDisplay(Math.floor(Math.random() * 20) + 1);
                        frame++;

                        if (frame >= totalFrames) {
                            clearInterval(scrambleTimer);
                            try { playRollSound(); } catch (err) { }

                            // 5. Finalize and Show Result
                            btn.classList.remove('is-charging-btn');
                            container.classList.remove('is-charging');
                            container.classList.add('is-resolved');

                            showResult(res);

                            // Log to history
                            let historyText = res.flatDescription;
                            if (res.targetMode === 'count') historyText = `${res.total} Dice | ${historyText}`;
                            addToHistory(res.total, historyText);

                            isRolling = false;

                            setTimeout(() => {
                                if (container.classList.contains('is-resolved')) {
                                    container.classList.remove('is-resolved');
                                }
                            }, 800);
                        }
                    } catch (err) {
                        clearInterval(scrambleTimer);
                        isRolling = false;
                        btn.classList.remove('is-charging-btn');
                        container.classList.remove('is-charging');
                    }
                }, 35);
            } catch (err) {
                console.error("Roll failed:", err);
                isRolling = false;
                btn.classList.remove('is-charging-btn');
                container.classList.remove('is-charging');
            }
        }

        function resolveRolling(forcedQueue = null, isInstant = false, isImmediate = false) {
            // This function is now mostly a fallback for when triggerRoll isn't used (e.g. InstaQueue toggle)
            if (!forcedQueue && engine.rollingQueue.length === 0 && engine.flatMod === 0) return;

            vibrate(15);

            const res = engine.calculateRoll(forcedQueue, isInstant);
            if (!res) return;

            let historyText = res.flatDescription;
            if (res.targetMode === 'count') historyText = `${res.total} Dice | ${historyText}`;
            addToHistory(res.total, historyText);

            if (isImmediate) {
                try { playRollSound(); } catch (err) { }
                showResult(res);
                return;
            }

            updateDisplay("...", "rolling");
            let frame = 0;
            const totalFrames = 8;
            const scrambleTimer = setInterval(() => {
                updateDisplay(Math.floor(Math.random() * 20) + 1);
                frame++;
                if (frame >= totalFrames) {
                    clearInterval(scrambleTimer);
                    try { playRollSound(); } catch (err) { }
                    showResult(res);
                }
            }, 40);
        }

        function showResult(res) {
            const main = document.getElementById('result-main');
            const oldHeight = main.offsetHeight;
            main.style.height = oldHeight + 'px';

            const hero = document.getElementById('result-hero');
            const label = document.getElementById('result-label');
            const badges = document.getElementById('result-badges');
            const breakdown = document.getElementById('result-breakdown');

            // Hide chain container and restore normal elements
            hero.classList.remove('hidden');
            breakdown.classList.remove('hidden');
            const cascade = document.getElementById('chain-cascade-container');
            if (cascade) {
                cascade.classList.add('hidden');
                cascade.innerHTML = '';
            }

            // HERO zone
            hero.classList.remove('is-rolling');
            hero.className = hero.className.split(' ').filter(c => !c.startsWith('crit-')).join(' ');
            hero.innerText = res.total;
            if (res.heroClass) {
                hero.classList.add(res.heroClass);
                if (res.heroClass === 'crit-hit') vibrate([40, 80, 40]);
                else if (res.heroClass === 'crit-fail') vibrate(60);
                else vibrate(25);
            } else {
                vibrate(25);
            }

            // LABEL zone
            if (res.labels && res.labels.length > 0) {
                label.innerHTML = res.labels.map(l =>
                    `<div class="label-${l.color}">${l.text}</div>`
                ).join('');
                label.className = `text-sm font-black uppercase tracking-widest mt-1 space-y-1 transition-all duration-300 flex flex-col items-center`;
                label.classList.remove('hidden');
            } else {
                label.classList.add('hidden');
                label.innerHTML = '';
            }

            // BADGES zone
            if (res.badges && res.badges.length > 0) {
                badges.innerHTML = res.badges.map(b =>
                    `<span class="result-badge badge-${b.color}">${b.icon} ${b.text}</span>`
                ).join('');
                badges.classList.remove('hidden');
            } else {
                badges.classList.add('hidden');
                badges.innerHTML = '';
            }

            // BREAKDOWN zone
            if (res.breakdown && res.breakdown.length > 0) {
                breakdown.innerHTML = res.breakdown.map(row => {
                    if (!row.rolls) {
                        // Flat mod row
                        return `<div class="breakdown-row">
                            <span class="breakdown-formula">${row.formula}</span>
                            <span class="breakdown-rolls text-slate-500">→</span>
                            <span class="breakdown-subtotal">${row.subtotal}</span>
                        </div>`;
                    }
                    return `<div class="breakdown-row">
                        <span class="breakdown-formula">${row.formula}</span>
                        <span class="breakdown-rolls">[${row.rolls}]</span>
                        <span class="breakdown-subtotal"><span class="text-slate-500 mr-1">→</span>${row.subtotal}</span>
                    </div>`;
                }).join('');
            } else {
                breakdown.innerHTML = '';
            }

            // Animate height change with overshoot bounce
            requestAnimationFrame(() => {
                main.style.transition = 'none';
                main.style.height = 'auto';
                const newHeight = main.offsetHeight;
                main.style.height = oldHeight + 'px';
                main.offsetHeight; // reflow
                main.style.transition = '';
                main.style.height = newHeight + 'px';
            });
        }

        function addToHistory(val, desc) {
            const log = document.getElementById('history-log');
            if (log.innerHTML.includes('Log is empty') || log.innerHTML.includes('No history')) log.innerHTML = '';
            const item = document.createElement('div');
            item.className = 'history-item flex items-center justify-between bg-slate-800/10 p-1.5 rounded-lg border border-slate-800/40 min-h-[2.75rem] gap-2';
            item.innerHTML = `<span class="text-xs text-slate-500 mono whitespace-normal break-words flex-grow leading-normal">${desc}</span><span class="font-black text-sky-400 mono text-sm shrink-0">${val}</span>`;
            log.prepend(item);
            if (log.children.length > 20) log.removeChild(log.lastChild);
        }

        function clearHistory() {
            document.getElementById('history-log').innerHTML = '<p class="text-xs text-slate-600 italic px-1">Log is empty...</p>';
        }

        function getTheoreticalDistribution(queue, mod, modifierType, modifierLevel, rules = {}) {
            let numericMod = 0;
            if (Array.isArray(mod)) {
                numericMod = engine.resolveModifier(mod);
            } else if (typeof mod === 'string' && window.getActiveCharacterVariable) {
                const resolved = window.getActiveCharacterVariable(mod);
                if (resolved !== null) {
                    numericMod = parseInt(resolved) || 0;
                }
            } else {
                numericMod = parseInt(mod) || 0;
            }

            const isSum = rules.targetMode === 'sum';
            const isCount = rules.targetMode === 'count';

            // Sets path requires tracking the full joint face-count distribution.
            // The exact BFS is used; a state-count abort guard (see below) handles
            // intractable cases and falls back to a non-sets BFS curve.
            const hasSets = rules.setsOp && rules.setsVal !== null;

            // Unified, bug-free comparator — always coerces to Number first (resolving variables)
            const check = (val, op, target) => {
                if (!op || target === null) return false;
                let actualTarget = target;
                if (window.getActiveCharacterVariable) {
                    const resolved = window.getActiveCharacterVariable(target);
                    if (resolved !== null) {
                        actualTarget = resolved;
                    }
                }
                if (isNaN(Number(actualTarget))) return false;
                const v = Number(val);
                const t = Number(actualTarget);
                if (op === '>=') return v >= t;
                if (op === '<=') return v <= t;
                if (op === '>') return v > t;
                if (op === '<') return v < t;
                if (op === '=' || op === '==') return v === t;
                return false;
            };

            const convolve = (d1, d2) => {
                let res = {};
                for (let v1 in d1) {
                    const p1 = d1[v1];
                    for (let v2 in d2) {
                        const s = parseInt(v1) + parseInt(v2);
                        const p = p1 * d2[v2];
                        if (p > 1e-20) res[s] = (res[s] || 0) + p;
                    }
                }
                return res;
            };

            if (!hasSets) {
                // ── Fast BFS path (non-sets) ────────────────────────────────
                // Computes the exact single-die PMF via BFS over explosion chains,
                // then convolves per-die PMFs across the whole queue.

                const getDiePMF = (sides) => {
                    const rollsToTake = 1 + (modifierType ? modifierLevel : 0);

                    // 1. Initial face probabilities (ADV / DIS)
                    let p_first = {};
                    let p_norm = {};
                    for (let v = 1; v <= sides; v++) {
                        p_norm[v] = 1 / sides;
                        if (modifierType === 'ADV') {
                            p_first[v] = (Math.pow(v, rollsToTake) - Math.pow(v - 1, rollsToTake)) / Math.pow(sides, rollsToTake);
                        } else if (modifierType === 'DIS') {
                            p_first[v] = (Math.pow(sides - v + 1, rollsToTake) - Math.pow(sides - v, rollsToTake)) / Math.pow(sides, rollsToTake);
                        } else {
                            p_first[v] = 1 / sides;
                        }
                    }

                    const isRR = (v) => rules.rerollOp && rules.rerollVal !== null && check(v, rules.rerollOp, rules.rerollVal);
                    const isExp = (v) => rules.explodeOp && rules.explodeVal !== null && check(v, rules.explodeOp, rules.explodeVal);
                    const isSucc = (v) => rules.targetOp && rules.targetVal !== null && check(v, rules.targetOp, rules.targetVal);

                    // 2. Apply rerolls (up to 10) — geometric series redistribution
                    let p_kept = {};
                    const rrFaces = [];
                    for (let v = 1; v <= sides; v++) if (isRR(v)) rrFaces.push(v);

                    if (rrFaces.length > 0 && rrFaces.length < sides) {
                        const p_R_first = rrFaces.reduce((s, f) => s + (p_first[f] || 0), 0);
                        const p_R_norm = rrFaces.reduce((s, f) => s + (p_norm[f] || 0), 0);
                        let geom = 0;
                        for (let i = 0; i <= 8; i++) geom += Math.pow(p_R_norm, i);
                        for (let v = 1; v <= sides; v++) {
                            p_kept[v] = isRR(v)
                                ? p_R_first * Math.pow(p_R_norm, 9) * p_norm[v]
                                : p_first[v] + p_R_first * p_norm[v] * geom;
                        }
                    } else {
                        p_kept = { ...p_first };
                    }

                    // 3. BFS over explosion chains
                    let die_pmf = {};
                    let bfsQueue = [];
                    for (let v = 1; v <= sides; v++) {
                        const p = p_kept[v] || 0;
                        if (p <= 0) continue;
                        const outcome = isCount ? (isSucc(v) ? 1 : 0) : v;
                        if (isExp(v)) {
                            bfsQueue.push({ outcome, prob: p, depth: 1 });
                        } else {
                            die_pmf[outcome] = (die_pmf[outcome] || 0) + p;
                        }
                    }
                    while (bfsQueue.length > 0) {
                        const curr = bfsQueue.shift();
                        for (let v = 1; v <= sides; v++) {
                            const nextProb = curr.prob * p_norm[v];
                            if (nextProb < 1e-15) continue;
                            const nextOutcome = isCount
                                ? curr.outcome + (isSucc(v) ? 1 : 0)
                                : curr.outcome + v;
                            if (isExp(v) && curr.depth < 10) {
                                bfsQueue.push({ outcome: nextOutcome, prob: nextProb, depth: curr.depth + 1 });
                            } else {
                                die_pmf[nextOutcome] = (die_pmf[nextOutcome] || 0) + nextProb;
                            }
                        }
                    }
                    return die_pmf;
                };

                let finalDist = { 0: 1 };
                queue.forEach(group => {
                    const pmf = getDiePMF(group.sides);
                    for (let i = 0; i < group.count; i++) {
                        finalDist = convolve(finalDist, pmf);
                    }
                });

                if (isSum) {
                    let shifted = {};
                    for (let s in finalDist) shifted[parseInt(s) + numericMod] = finalDist[s];
                    return shifted;
                }
                return finalDist;
            }

            // ── Exact Sets path: independent face-count-vector BFS ─────────
            // In DiceEngine.js, sets are calculated and scored independently
            // for each die group in the queue, and then summed.
            // Convolving the face-count vectors per-group preserves exactness,
            // avoids cross-group state explosion, and remains extremely fast.

            const MAX_SETS_STATES = 30000;

            const mergeSorted = (a, b) => {
                let i = 0, j = 0;
                const res = [];
                while (i < a.length && j < b.length) {
                    if (a[i] < b[j]) { res.push(a[i]); i++; }
                    else { res.push(b[j]); j++; }
                }
                while (i < a.length) { res.push(a[i]); i++; }
                while (j < b.length) { res.push(b[j]); j++; }
                return res;
            };

            const getSlotVecPMF = (sides) => {
                const rollsToTake = 1 + (modifierType ? modifierLevel : 0);
                let p_first = {}, p_norm = {};
                for (let v = 1; v <= sides; v++) {
                    p_norm[v] = 1 / sides;
                    if (modifierType === 'ADV') {
                        p_first[v] = (Math.pow(v, rollsToTake) - Math.pow(v - 1, rollsToTake)) / Math.pow(sides, rollsToTake);
                    } else if (modifierType === 'DIS') {
                        p_first[v] = (Math.pow(sides - v + 1, rollsToTake) - Math.pow(sides - v, rollsToTake)) / Math.pow(sides, rollsToTake);
                    } else {
                        p_first[v] = 1 / sides;
                    }
                }
                const isRR = (v) => rules.rerollOp && rules.rerollVal !== null && check(v, rules.rerollOp, rules.rerollVal);
                const isExp = (v) => rules.explodeOp && rules.explodeVal !== null && check(v, rules.explodeOp, rules.explodeVal);

                let p_kept = {};
                const rrFaces = [];
                for (let v = 1; v <= sides; v++) if (isRR(v)) rrFaces.push(v);
                if (rrFaces.length > 0 && rrFaces.length < sides) {
                    const pRf = rrFaces.reduce((s, f) => s + (p_first[f] || 0), 0);
                    const pRn = rrFaces.reduce((s, f) => s + (p_norm[f] || 0), 0);
                    let g = 0; for (let i = 0; i <= 8; i++) g += Math.pow(pRn, i);
                    for (let v = 1; v <= sides; v++) {
                        p_kept[v] = isRR(v)
                            ? pRf * Math.pow(pRn, 9) * p_norm[v]
                            : p_first[v] + pRf * p_norm[v] * g;
                    }
                } else { p_kept = { ...p_first }; }

                let slotPMF = {};
                let bfsQ = [];
                for (let v = 1; v <= sides; v++) {
                    const p = p_kept[v] || 0;
                    if (p <= 0) continue;
                    const vec = [v];
                    if (isExp(v)) {
                        bfsQ.push({ vec, prob: p, depth: 1 });
                    } else {
                        const key = vec.join(',');
                        slotPMF[key] = (slotPMF[key] || 0) + p;
                    }
                }
                while (bfsQ.length > 0) {
                    const curr = bfsQ.shift();
                    for (let v = 1; v <= sides; v++) {
                        const np = curr.prob * p_norm[v];
                        if (np < 1e-14) continue;
                        const nv = mergeSorted(curr.vec, [v]);
                        if (isExp(v) && curr.depth < 10) {
                            bfsQ.push({ vec: nv, prob: np, depth: curr.depth + 1 });
                        } else {
                            const key = nv.join(',');
                            slotPMF[key] = (slotPMF[key] || 0) + np;
                        }
                    }
                }
                return slotPMF;
            };

            const convolveSimple = (d1, d2) => {
                let res = {};
                for (let v1 in d1) {
                    const p1 = d1[v1];
                    for (let v2 in d2) {
                        const s = Number(v1) + Number(v2);
                        const p = p1 * d2[v2];
                        if (p > 1e-20) res[s] = (res[s] || 0) + p;
                    }
                }
                return res;
            };

            let finalDist = { 0: 1 };
            let aborted = false;

            for (const group of queue) {
                const sp = getSlotVecPMF(group.sides);
                const spArr = [];
                for (let key in sp) {
                    spArr.push({
                        vec: key ? key.split(',').map(Number) : [],
                        prob: sp[key]
                    });
                }

                let groupPMF = [{ vec: [], prob: 1 }];
                for (let i = 0; i < group.count; i++) {
                    const resMap = {};
                    for (let x = 0; x < groupPMF.length; x++) {
                        const o1 = groupPMF[x];
                        for (let y = 0; y < spArr.length; y++) {
                            const o2 = spArr[y];
                            const merged = mergeSorted(o1.vec, o2.vec);
                            const key = merged.join(',');
                            const p = o1.prob * o2.prob;
                            if (p > 1e-20) resMap[key] = (resMap[key] || 0) + p;
                        }
                    }
                    groupPMF = [];
                    for (let key in resMap) {
                        groupPMF.push({
                            vec: key ? key.split(',').map(Number) : [],
                            prob: resMap[key]
                        });
                    }
                    if (groupPMF.length > MAX_SETS_STATES) {
                        aborted = true;
                        break;
                    }
                }
                if (aborted) break;

                // Apply sets filter and score this group to get its subtotal score PMF
                const isSucc = (v) => rules.targetOp && rules.targetVal !== null && check(v, rules.targetOp, rules.targetVal);
                let groupScorePMF = {};
                for (let x = 0; x < groupPMF.length; x++) {
                    const o = groupPMF[x];
                    const arr = o.vec;
                    let score = 0;
                    let i = 0;
                    while (i < arr.length) {
                        let j = i;
                        while (j < arr.length && arr[j] === arr[i]) j++;
                        const cnt = j - i;
                        const faceNum = arr[i];
                        if (check(cnt, rules.setsOp, rules.setsVal)) {
                            if (isCount) {
                                if (!rules.targetOp || isSucc(faceNum)) score += cnt;
                            } else {
                                score += faceNum * cnt;
                            }
                        }
                        i = j;
                    }
                    groupScorePMF[score] = (groupScorePMF[score] || 0) + o.prob;
                }

                // Convolve the group's score PMF into finalDist
                finalDist = convolveSimple(finalDist, groupScorePMF);
            }

            if (aborted) {
                // Fall back to the non-sets BFS — correct shape, ignores the
                // sets filter. Better than a misleading approximation.
                let finalDistFallback = { 0: 1 };
                queue.forEach(group => {
                    const sides = group.sides;
                    const rollsToTake = 1 + (modifierType ? modifierLevel : 0);
                    let p_first = {}, p_norm = {};
                    for (let v = 1; v <= sides; v++) {
                        p_norm[v] = 1 / sides;
                        if (modifierType === 'ADV') p_first[v] = (Math.pow(v, rollsToTake) - Math.pow(v - 1, rollsToTake)) / Math.pow(sides, rollsToTake);
                        else if (modifierType === 'DIS') p_first[v] = (Math.pow(sides - v + 1, rollsToTake) - Math.pow(sides - v, rollsToTake)) / Math.pow(sides, rollsToTake);
                        else p_first[v] = 1 / sides;
                    }
                    const isRR2 = (v) => rules.rerollOp && rules.rerollVal !== null && check(v, rules.rerollOp, rules.rerollVal);
                    const isExp2 = (v) => rules.explodeOp && rules.explodeVal !== null && check(v, rules.explodeOp, rules.explodeVal);
                    const isSucc2 = (v) => rules.targetOp && rules.targetVal !== null && check(v, rules.targetOp, rules.targetVal);
                    let p_kept = {}, rrFaces = [];
                    for (let v = 1; v <= sides; v++) if (isRR2(v)) rrFaces.push(v);
                    if (rrFaces.length > 0 && rrFaces.length < sides) {
                        const pRf = rrFaces.reduce((s, f) => s + (p_first[f] || 0), 0);
                        const pRn = rrFaces.reduce((s, f) => s + (p_norm[f] || 0), 0);
                        let g = 0; for (let i = 0; i <= 8; i++) g += Math.pow(pRn, i);
                        for (let v = 1; v <= sides; v++) {
                            p_kept[v] = isRR2(v) ? pRf * Math.pow(pRn, 9) * p_norm[v] : p_first[v] + pRf * p_norm[v] * g;
                        }
                    } else { p_kept = { ...p_first }; }
                    let die_pmf = {}, bfsQ2 = [];
                    for (let v = 1; v <= sides; v++) {
                        const p = p_kept[v] || 0; if (p <= 0) continue;
                        const outcome = isCount ? (isSucc2(v) ? 1 : 0) : v;
                        if (isExp2(v)) bfsQ2.push({ outcome, prob: p, depth: 1 });
                        else die_pmf[outcome] = (die_pmf[outcome] || 0) + p;
                    }
                    while (bfsQ2.length > 0) {
                        const curr = bfsQ2.shift();
                        for (let v = 1; v <= sides; v++) {
                            const np = curr.prob * p_norm[v]; if (np < 1e-15) continue;
                            const no = isCount ? curr.outcome + (isSucc2(v) ? 1 : 0) : curr.outcome + v;
                            if (isExp2(v) && curr.depth < 10) bfsQ2.push({ outcome: no, prob: np, depth: curr.depth + 1 });
                            else die_pmf[no] = (die_pmf[no] || 0) + np;
                        }
                    }
                    for (let i = 0; i < group.count; i++) finalDistFallback = convolve(finalDistFallback, die_pmf);
                });
                if (isSum) {
                    let shifted = {};
                    for (let s in finalDistFallback) shifted[parseInt(s) + numericMod] = finalDistFallback[s];
                    return shifted;
                }
                return finalDistFallback;
            }

            if (Object.keys(finalDist).length === 0) finalDist = { 0: 1 };
            if (isSum) {
                let shifted = {};
                for (let s in finalDist) shifted[parseInt(s) + numericMod] = finalDist[s];
                return shifted;
            }
            return finalDist;
        }
        var auditorChart = null;
        var auditorStopFlag = false;
        var auditorIsRunning = false;

        function simulateRollChainIteration(itemId) {
            const item = engine.findSavedQueue(itemId);
            if (!item) return 0;

            // Step 1: Pre-roll
            if (item.chain && item.chain.preRoll && item.chain.preRoll.arsenalId) {
                const preItem = engine.findSavedQueue(item.chain.preRoll.arsenalId);
                if (preItem) {
                    const preRes = engine.calculateRoll(preItem.unifiedQueue || preItem.queue, false, {
                        modifier: preItem.modifier,
                        modLevel: preItem.modLevel,
                        flat: preItem.flat,
                        rules: preItem.rules
                    });
                    const isPreSuccess = preRes && preRes.labels.some(l => l.color === 'emerald');
                    if (item.chain.preRoll.haltOnFail && !isPreSuccess) {
                        return 0; // Stopped
                    }
                }
            }

            // Step 2: Primary roll
            const primaryRes = engine.calculateRoll(item.unifiedQueue || item.queue, false, {
                modifier: item.modifier,
                modLevel: item.modLevel,
                flat: item.flat,
                rules: item.rules
            });
            if (!primaryRes) return 0;

            const isSuccess = primaryRes.labels.some(l => l.color === 'emerald');
            const isCrit = primaryRes.heroClass === 'crit-hit' || primaryRes.labels.some(l => l.text.includes('NATURAL 20') || l.text.includes('NAT 20'));

            let postRollId = null;
            if (isCrit && item.chain && item.chain.postRoll && item.chain.postRoll.crit && item.chain.postRoll.crit.arsenalId) {
                postRollId = item.chain.postRoll.crit.arsenalId;
            } else if (isSuccess && item.chain && item.chain.postRoll && item.chain.postRoll.success && item.chain.postRoll.success.arsenalId) {
                postRollId = item.chain.postRoll.success.arsenalId;
            } else if (!isSuccess && item.chain && item.chain.postRoll && item.chain.postRoll.fail && item.chain.postRoll.fail.arsenalId) {
                postRollId = item.chain.postRoll.fail.arsenalId;
            }

            if (postRollId) {
                const postItem = engine.findSavedQueue(postRollId);
                if (postItem) {
                    const postRes = engine.calculateRoll(postItem.unifiedQueue || postItem.queue, false, {
                        modifier: postItem.modifier,
                        modLevel: postItem.modLevel,
                        flat: postItem.flat,
                        rules: postItem.rules
                    });
                    return postRes ? parseInt(postRes.total) || 0 : 0;
                }
            }

            return parseInt(primaryRes.total) || 0;
        }

        async function runAuditor(iterationsOverride = null) {
            if (auditorIsRunning) {
                // Don't interrupt a manual run with an auto-update
                if (iterationsOverride) return;

                auditorStopFlag = true;
                return;
            }

            auditorIsRunning = true;
            auditorStopFlag = false;
            const iterations = iterationsOverride || stressCount;
            const isPreview = !!iterationsOverride;

            const queue = engine.rollingQueue;
            const flatMod = engine.flatMod;
            const modType = engine.activeModifier;
            const modLvl = engine.modifierLevel;
            const activeRules = engine.rollRules;

            const activeLoadout = activeLoadoutId ? engine.findSavedQueue(activeLoadoutId) : null;
            const hasActiveChain = activeLoadout && activeLoadout.chain && (
                (activeLoadout.chain.preRoll && activeLoadout.chain.preRoll.arsenalId) ||
                (activeLoadout.chain.postRoll && (
                    activeLoadout.chain.postRoll.success?.arsenalId ||
                    activeLoadout.chain.postRoll.crit?.arsenalId ||
                    activeLoadout.chain.postRoll.fail?.arsenalId
                ))
            );

            syncAuditorLabels();

            const btn = document.getElementById('run-audit-btn');
            const icon = document.getElementById('run-icon');
            const text = document.getElementById('run-text');
            const progress = document.getElementById('audit-progress-bar');
            const etaLabel = document.getElementById('audit-eta');

            btn.classList.remove('bg-sky-500/10', 'text-sky-400', 'border-sky-500/20');
            btn.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
            icon.classList.add('animate-spin');
            text.innerText = 'Stop';
            progress.style.transform = 'translateX(-100%)';
            etaLabel.classList.remove('opacity-0');
            etaLabel.innerText = 'Est: --s';

            const actualTallies = {};
            const sampleResults = [];
            const chunkSize = 10000;
            let processed = 0;
            let startTime = performance.now();
            let hasWarned = false;

            // Run in chunks to prevent UI hang
            while (processed < iterations && !auditorStopFlag) {
                const currentBatch = Math.min(chunkSize, iterations - processed);
                for (let i = 0; i < currentBatch; i++) {
                    let finalTotal;
                    if (hasActiveChain) {
                        finalTotal = simulateRollChainIteration(activeLoadoutId);
                    } else {
                        const res = engine.calculateRoll(queue, false, {
                            modifier: modType,
                            modLevel: modLvl,
                            flat: flatMod,
                            rules: activeRules
                        });
                        finalTotal = res ? res.total : 0;
                    }
                    actualTallies[finalTotal] = (actualTallies[finalTotal] || 0) + 1;
                    sampleResults.push(finalTotal);
                }
                processed += currentBatch;

                // Progress & ETA
                const percent = (processed / iterations) * 100;
                progress.style.transform = `translateX(${percent - 100}%)`;

                const elapsed = (performance.now() - startTime) / 1000;
                const totalEstimated = (elapsed / processed) * iterations;
                const remaining = Math.max(0, totalEstimated - elapsed);
                etaLabel.innerText = `ETA: ${remaining.toFixed(1)}s`;

                // ETA Warning (Check after 1 chunk to have stable estimation)
                if (!isPreview && processed >= chunkSize && totalEstimated > 5 && !hasWarned) {
                    hasWarned = true;
                    const proceed = await showModal({
                        title: 'Long Audit Warning',
                        body: `This high-confidence audit is estimated to take <b>${totalEstimated.toFixed(0)} seconds</b> on your current hardware. Continue?`,
                        confirmText: 'Continue',
                        cancelText: 'Stop Now'
                    });
                    if (!proceed) {
                        auditorStopFlag = true;
                        break;
                    }
                    // Reset startTime to exclude modal time
                    startTime = performance.now() - elapsed * 1000;
                }

                // Yield to UI
                await new Promise(r => requestAnimationFrame(r));
            }

            // finalize iterations for math
            const finalSampleCount = processed;

            // 1. Calculate Theoretical
            const theoretical = hasActiveChain ? {} : getTheoreticalDistribution(queue, flatMod, modType, modLvl, activeRules);

            // 3. Prepare Chart Data
            const allValues = [...new Set([
                ...Object.keys(theoretical).filter(k => theoretical[k] > 1e-15),
                ...Object.keys(actualTallies)
            ])].map(Number).sort((a, b) => a - b);

            const labels = allValues;
            const mathData = allValues.map(v => theoretical[v] || 0);
            const actualData = allValues.map(v => (actualTallies[v] || 0) / finalSampleCount);

            // 4. Stats Calculation
            const minVal = allValues.length > 0 ? allValues[0] : 0;
            const maxVal = allValues.length > 0 ? allValues[allValues.length - 1] : 0;

            let mathMean = 0;
            let mathVariance = 0;
            if (!hasActiveChain) {
                for (let v in theoretical) mathMean += v * theoretical[v];
                for (let v in theoretical) mathVariance += Math.pow(v - mathMean, 2) * theoretical[v];
            }
            const mathStdDev = Math.sqrt(mathVariance);

            let actualMean = finalSampleCount > 0 ? sampleResults.reduce((a, b) => a + b, 0) / finalSampleCount : 0;
            let actualVariance = finalSampleCount > 0 ? sampleResults.reduce((sum, v) => sum + Math.pow(v - actualMean, 2), 0) / finalSampleCount : 0;
            const actualStdDev = Math.sqrt(actualVariance);

            let maxDeviation = 0;
            if (!hasActiveChain) {
                allValues.forEach(v => {
                    const dev = Math.abs((theoretical[v] || 0) - ((actualTallies[v] || 0) / finalSampleCount));
                    if (dev > maxDeviation) maxDeviation = dev;
                });
            }

            document.getElementById('auditor-min').innerText = minVal;
            document.getElementById('auditor-max').innerText = maxVal;
            document.getElementById('auditor-avg-math').innerText = hasActiveChain ? 'N/A' : mathMean.toFixed(2);
            document.getElementById('auditor-avg-actual').innerText = actualMean.toFixed(2);
            document.getElementById('auditor-stddev').innerText = actualStdDev.toFixed(2);
            document.getElementById('auditor-max-dev').innerText = hasActiveChain ? 'N/A' : (maxDeviation * 100).toFixed(2) + '%';
            document.getElementById('auditor-samples').innerText = finalSampleCount >= 1000000 ? (finalSampleCount / 1000000).toFixed(1) + 'M' : finalSampleCount.toLocaleString();

            // 5. Render Chart
            const ctx = document.getElementById('auditor-chart').getContext('2d');
            if (auditorChart) auditorChart.destroy();

            const datasets = [
                {
                    label: 'Rolls',
                    data: actualData,
                    backgroundColor: 'rgba(56, 189, 248, 0.4)',
                    borderColor: 'rgba(56, 189, 248, 0.8)',
                    borderWidth: 1,
                    borderRadius: 4,
                    order: 2
                }
            ];

            if (!hasActiveChain) {
                datasets.push({
                    label: 'Mathematical',
                    data: mathData,
                    type: 'line',
                    borderColor: '#f43f5e',
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 2,
                    pointBackgroundColor: '#f43f5e',
                    order: 1
                });
            }

            auditorChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 }, // Disable chart animation for instant feedback after calculation
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: { color: '#64748b', font: { size: 10, family: 'JetBrains Mono' } }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                            ticks: {
                                color: '#64748b',
                                font: { size: 10, family: 'JetBrains Mono' },
                                callback: (val) => (val * 100).toFixed(1) + '%'
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#020617',
                            titleColor: '#f8fafc',
                            bodyColor: '#94a3b8',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                label: (context) => ` ${context.dataset.label}: ${(context.raw * 100).toFixed(2)}%`
                            }
                        }
                    }
                }
            });

            btn.classList.remove('bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
            btn.classList.add('bg-sky-500/10', 'text-sky-400', 'border-sky-500/20');
            icon.classList.remove('animate-spin');
            text.innerText = 'Run';
            etaLabel.classList.add('opacity-0');
            auditorIsRunning = false;
        }

        function adjustStressCount(factor) {
            stressCount = Math.min(100000000, Math.max(1, Math.round(stressCount * factor)));
            updateStressUI();
            vibrate(5);
        }

        function updateStressUI() {
            const display = document.getElementById('stress-count-display');
            if (display) {
                let text = stressCount;
                if (stressCount >= 1000000) text = (stressCount / 1000000).toFixed(0) + 'M';
                else if (stressCount >= 1000) text = (stressCount / 1000).toFixed(0) + 'k';
                display.innerText = text;
            }
        }

        function toggleRollPad() {
            const container = document.getElementById('roll-pad-container');
            if (!container) return;
            const isCollapsed = container.classList.toggle('collapsed');
            localStorage.setItem('roll_pad_collapsed', isCollapsed ? 'true' : 'false');

            // Auto-close binder if roll pad is opened
            if (!isCollapsed) {
                const binderDrawer = document.getElementById('binder-drawer');
                const overlay = document.getElementById('binder-overlay');
                if (binderDrawer && binderDrawer.classList.contains('open')) {
                    binderDrawer.classList.remove('open');
                    overlay.classList.remove('open');
                    setTimeout(() => {
                        overlay.classList.add('hidden');
                    }, 300);
                }
            }
        }

        function autoExpandRollPad() {
            const container = document.getElementById('roll-pad-container');
            if (container && container.classList.contains('collapsed')) {
                container.classList.remove('collapsed');
                localStorage.setItem('roll_pad_collapsed', 'false');
            }
        }

        function initRollPad() {
            const collapsed = localStorage.getItem('roll_pad_collapsed') === 'true';
            const container = document.getElementById('roll-pad-container');
            if (container) {
                container.classList.toggle('collapsed', collapsed);
            }
        }

        function updateScrollSpacer() {
            const container = document.getElementById('roll-pad-container');
            if (container) {
                if (container.classList.contains('collapsed')) {
                    document.body.style.paddingBottom = '3rem';
                } else {
                    const h = container.offsetHeight;
                    document.body.style.paddingBottom = (h + 32) + 'px';
                }
            }
        }

        window.onload = () => {
            initRollPad();
            loadTemplates();

            updateScrollSpacer();
            const padContainer = document.getElementById('roll-pad-container');
            if (padContainer) {
                new ResizeObserver(updateScrollSpacer).observe(padContainer);
                padContainer.addEventListener('transitionend', updateScrollSpacer);
            }
            // Load arsenal (characters + groups) first so rendering has correct context
            const storedArsenal = localStorage.getItem('crypto_roller_arsenal');
            if (storedArsenal) {
                try {
                    const a = JSON.parse(storedArsenal);
                    characters = a.characters || [];
                    groups = a.groups || [];
                    activeCharacterId = a.activeCharacterId || null;
                    activeGroupId = a.activeGroupId || null;
                    campaigns = a.campaigns || [];
                    activeCampaignId = a.activeCampaignId || null;
                    openTabs = a.openTabs || [];
                } catch (e) { /* keep defaults */ }
            }

            // Ensure defaults only if no stored state exists
            if (!storedArsenal) {
                if (!campaigns || campaigns.length === 0) {
                    campaigns = [{ id: 'default_campaign', name: 'Default Campaign' }];
                }
                if (!activeCampaignId) {
                    activeCampaignId = campaigns[0].id;
                }
                if (!openTabs || openTabs.length === 0) {
                    openTabs = [activeCampaignId];
                }
            }

            characters.forEach(char => {
                if (!char.campaignId) {
                    char.campaignId = campaigns.length > 0 ? campaigns[0].id : 'default_campaign';
                }
                if (!char.dndType) {
                    char.dndType = 'standard';
                }
            });

            const stored = localStorage.getItem('crypto_roller_saved');
            if (stored) {
                try {
                    let queues = JSON.parse(stored);
                    if (Array.isArray(queues)) {
                        // Filter out the obsolete debug preset if it is still present in the user's localStorage
                        const filtered = queues.filter(q => q.id !== 'lots-preset');
                        if (filtered.length !== queues.length) {
                            localStorage.setItem('crypto_roller_saved', JSON.stringify(filtered));
                        }
                        engine.setSavedQueues(filtered);
                    } else {
                        engine.setSavedQueues([]);
                    }
                } catch (e) {
                    console.error("Failed to parse saved queues:", e);
                }
                renderSavedQueues();
                renderBinder();
            }


            const savedSettingsStr = localStorage.getItem('crypto_roller_settings');
            if (savedSettingsStr) {
                try {
                    const savedSettings = JSON.parse(savedSettingsStr);
                    if (savedSettings.soundEnabled !== undefined) soundEnabled = savedSettings.soundEnabled;
                    if (savedSettings.volume !== undefined) {
                        volume = savedSettings.volume;
                        updateVolume(volume);
                        document.getElementById('volume-slider').value = volume;
                    }
                    if (savedSettings.instaQueue !== undefined) {
                        isInstaQueue = savedSettings.instaQueue;
                        if (isInstaQueue === true) isInstaQueue = 'Queue Only';
                        else if (isInstaQueue === false) isInstaQueue = 'Roll Only';
                    }
                    if (savedSettings.arsenalQueue !== undefined) {
                        isArsenalQueue = savedSettings.arsenalQueue;
                        if (isArsenalQueue === true) isArsenalQueue = 'Roll & Queue';
                        else if (isArsenalQueue === false) isArsenalQueue = 'Roll Only';
                    }
                    if (savedSettings.moddedQuick !== undefined) {
                        isModdedQuick = savedSettings.moddedQuick;
                    }
                    if (savedSettings.customDice !== undefined) {
                        customDice = savedSettings.customDice;
                    }
                    if (savedSettings.currentTargetMode !== undefined) {
                        currentTargetMode = savedSettings.currentTargetMode;
                    }
                    if (savedSettings.headerHidden !== undefined) {
                        headerHidden = savedSettings.headerHidden;
                        document.body.classList.toggle('header-hidden', headerHidden);
                    }
                    updateUI();
                    updateSoundUI();
                } catch (e) { }
            }

            // Fallback for old instaQueueState if crypto_roller_settings doesn't have it
            if (!savedSettingsStr || !JSON.parse(savedSettingsStr).hasOwnProperty('instaQueue')) {
                const savedInstaQueue = localStorage.getItem('instaQueueState');
                if (savedInstaQueue !== null) {
                    isInstaQueue = savedInstaQueue === 'true' ? 'Queue Only' : 'Roll Only';
                }
            }

            updateStressUI();
            updateVolume(volume);
            renderDiceGrid();
            updateRulesUI();
            renderCharacterSelect();
            renderGroupTabs();
            updateShowHiddenWidgetsButton();
            updateGlobalLayoutBtn();
        };

        // =========================================================================
        // Auto Highlight & ENTER Confirm Layer for Popups
        // =========================================================================
        function autoHighlightFirstInput(overlay) {
            if (!overlay) return;
            const selector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="image"]):not([type="hidden"]), select, textarea';
            setTimeout(() => {
                const elements = Array.from(overlay.querySelectorAll(selector));
                const firstInput = elements.find(el => {
                    const style = window.getComputedStyle(el);
                    return !el.disabled &&
                        el.offsetWidth > 0 &&
                        el.offsetHeight > 0 &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0';
                });
                if (firstInput) {
                    firstInput.focus();
                    if (typeof firstInput.select === 'function') {
                        firstInput.select();
                    }
                }
            }, 100);
        }

        var popupObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const target = mutation.target;
                    const isVisible = !target.classList.contains('hidden');
                    const wasHidden = !mutation.oldValue || mutation.oldValue.includes('hidden');
                    if (isVisible && wasHidden) {
                        autoHighlightFirstInput(target);
                    }
                }
            });
        });

        var modalOverlaysList = [
            document.getElementById('chain-config-overlay'),
            document.getElementById('color-picker-overlay'),
            document.getElementById('char-creation-overlay'),
            document.getElementById('modal-overlay')
        ];

        modalOverlaysList.forEach(overlay => {
            if (overlay) {
                popupObserver.observe(overlay, { attributes: true, attributeOldValue: true });
            }
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const overlays = [
                    { id: 'modal-overlay', type: 'generic' },
                    { id: 'chain-config-overlay', type: 'chain' },
                    { id: 'char-creation-overlay', type: 'char' },
                    { id: 'color-picker-overlay', type: 'color' }
                ];

                const activeOverlay = overlays.find(o => {
                    const el = document.getElementById(o.id);
                    return el && !el.classList.contains('hidden') && el.offsetWidth > 0;
                });

                if (!activeOverlay) return;

                if (activeOverlay.type === 'generic') {
                    if (isCurrentModalDanger) {
                        // NEVER FOR DELETE OR OTHER WARNING POPUPS
                        return;
                    }
                    const okBtn = document.getElementById('modal-ok-btn');
                    const confirmBtn = document.getElementById('modal-confirm-btn');
                    if (okBtn && !okBtn.classList.contains('hidden') && okBtn.offsetWidth > 0) {
                        event.preventDefault();
                        okBtn.click();
                    } else if (confirmBtn && !confirmBtn.classList.contains('hidden') && confirmBtn.offsetWidth > 0) {
                        event.preventDefault();
                        confirmBtn.click();
                    }
                } else if (activeOverlay.type === 'char') {
                    event.preventDefault();
                    submitCharCreation();
                } else if (activeOverlay.type === 'chain') {
                    event.preventDefault();
                    saveChainConfig();
                }
            }
        }, true);

