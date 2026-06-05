        function safeEvalMath(expr) {
            // Replace floor/ceil/round with Math.floor/Math.ceil/Math.round
            let prepared = expr
                .replace(/floor\(/g, 'Math.floor(')
                .replace(/ceil\(/g, 'Math.ceil(')
                .replace(/round\(/g, 'Math.round(');
            
            // Check if there are any illegal characters/tokens
            let test = prepared;
            test = test.replace(/Math\.floor/g, '');
            test = test.replace(/Math\.ceil/g, '');
            test = test.replace(/Math\.round/g, '');
            
            // The remaining string should only contain digits, operators, dots, spaces, parentheses
            const illegal = test.replace(/[0-9+\-*/().\s]/g, '');
            if (illegal.length > 0) {
                // Contains illegal characters, do not evaluate
                return expr;
            }
            
            try {
                const fn = new Function(`return (${prepared});`);
                const result = fn();
                return typeof result === 'number' && !isNaN(result) ? result : expr;
            } catch (e) {
                return expr;
            }
        }

        function resolveDynamicText(text) {
            if (typeof text !== 'string') return text;
            if (typeof window === 'undefined' || !window.getActiveCharacterVariable) return text;
            
            // 1. Resolve $VAR$ placeholders
            let resolved = text.replace(/\$([a-zA-Z0-9_-]+)\$/g, (match, varName) => {
                const resolvedVal = window.getActiveCharacterVariable(varName);
                return resolvedVal !== null ? resolvedVal : match;
            });
            
            // 2. Resolve [[ expression ]] math placeholders
            resolved = resolved.replace(/\[\[([^\]]+)\]\]/g, (match, expr) => {
                return safeEvalMath(expr);
            });

            // 3. Resolve { expression } math placeholders with backslash escaping support
            resolved = resolved.replace(/(\\)?\{([^}]+)\}/g, (match, escaped, expr) => {
                if (escaped) {
                    return match.slice(1); // Remove the backslash escape
                }
                return safeEvalMath(expr);
            });
            
            // 4. Resolve $+-$ sign formatting placeholders next to numbers
            resolved = resolved.replace(/\$\+-\$\s*(-?\d+(?:\.\d+)?)/g, (match, numStr) => {
                const num = parseFloat(numStr);
                if (num >= 0) {
                    return '+' + numStr;
                } else {
                    return numStr; // negative number already has "-" sign
                }
            });
            
            return resolved;
        }
        window.resolveDynamicText = resolveDynamicText;

        function renderWidgetSubtext(q, formula, effectiveMode) {
            const resolvedNote = q.addonNote ? resolveDynamicText(q.addonNote) : '';
            const resolvedDetail = q.detailText ? resolveDynamicText(q.detailText) : '';

            const hasFormula = !!formula;
            const hasNote = !!resolvedNote;
            const hasDetail = !!resolvedDetail;

            if (effectiveMode === 'compact') {
                let compactShowFormula = q.compactShowFormula;
                let compactShowNote = q.compactShowNote;
                let compactShowDetail = q.compactShowDetail;

                // Legacy migration/fallback
                if (compactShowFormula === undefined && compactShowNote === undefined && compactShowDetail === undefined) {
                    const priority = q.compactDisplayPriority || 'auto';
                    if (priority === 'note') {
                        compactShowNote = true;
                    } else if (priority === 'detail') {
                        compactShowDetail = true;
                    } else if (priority === 'formula') {
                        compactShowFormula = true;
                    } else if (priority === 'auto') {
                        compactShowFormula = true;
                        compactShowNote = true;
                        compactShowDetail = true;
                    } else {
                        compactShowFormula = false;
                        compactShowNote = false;
                        compactShowDetail = false;
                    }
                }

                // Show only the first checked/matching item in natural priority order (Note > Details > Formula)
                if (compactShowNote && hasNote) {
                    return `<div class="text-[9px] font-bold text-slate-500 mt-0.5 leading-normal truncate widget-note">${resolvedNote}</div>`;
                }
                if (compactShowDetail && hasDetail) {
                    return `<div class="text-[9px] font-bold text-slate-500 mt-0.5 leading-normal truncate widget-detail">${resolvedDetail.replace(/\n/g, ' ')}</div>`;
                }
                if (compactShowFormula && hasFormula) {
                    return `<div class="text-[9px] mono text-[#94a3b8]/70 truncate mt-0.5 widget-formula">${formula}</div>`;
                }
                return '';
            }

            // Expanded view (either Full or Normal)
            const isFull = effectiveMode === 'full';
            const canShowFormula = isFull ? (q.fullShowFormula !== false) : (q.showFormula !== false);
            const canShowNote = isFull ? (q.fullShowNote !== false) : (q.showNote !== false);
            const canShowDetail = isFull ? (q.fullShowDetail !== false) : (q.showDetail !== false);

            let html = '';
            if (hasFormula && canShowFormula) {
                html += `<div class="text-xs mono text-[#94a3b8] truncate mt-0.5 opacity-80 widget-formula">${formula}</div>`;
            }
            if (hasNote && canShowNote) {
                html += `<div class="text-[9px] font-bold text-slate-500 mt-0.5 leading-normal truncate widget-note">${resolvedNote}</div>`;
            }
            if (hasDetail && canShowDetail) {
                html += `<div class="text-[9px] font-bold text-slate-500 mt-0.5 leading-normal whitespace-pre-wrap widget-detail">${resolvedDetail}</div>`;
            }

            return html;
        }

        function renderDiceGrid() {
            const grid = document.getElementById('dice-grid');
            if (!grid) return;
            let html = '';
            const allDice = [...defaultDice, ...customDice];

            allDice.forEach(cfg => {
                const path = cfg.path || "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z";

                let minusButtonHtml = `<button onclick="changeQueue(${cfg.d}, -1)" class="segmented-btn btn-side">－</button>`;

                const isCustom = !defaultDice.some(d => d.d === cfg.d);
                if (isCustom && deleteMode) {
                    minusButtonHtml = `
                        <button onclick="promptDeleteCustomDice(${cfg.d}, event)" class="segmented-btn btn-side text-rose-500 font-black text-xl hover:bg-rose-500/20 transition-colors delete-btn-active z-20 relative">
                            ✕
                        </button>
                    `;
                }

                html += `
                    <div class="segmented-row">
                        ${minusButtonHtml}
                        <button onclick="triggerRoll(event, { sides: ${cfg.d}, count: 1, isInstant: true })" class="segmented-btn btn-center group/dice relative">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="${path}" />
                            </svg>
                            <span class="font-black text-lg text-[#e2e8f0] z-10 mono">D${cfg.d}</span>
                        </button>
                        <button onclick="changeQueue(${cfg.d}, 1)" class="segmented-btn btn-side">＋</button>
                    </div>
                `;
            });

            html += `
                <div class="segmented-row">
                    <button onclick="toggleDeleteMode(event)" class="segmented-btn btn-side ${deleteMode ? 'bg-white/10 text-rose-400' : ''}">－</button>
                    <button onclick="addCustomDice()" class="segmented-btn btn-center group/dice flex flex-col justify-center">
                        <span class="font-black text-lg uppercase tracking-widest text-[#e2e8f0] leading-none">D?</span>
                    </button>
                    <button onclick="addCustomDice()" class="segmented-btn btn-side">＋</button>
                </div>
            `;
            grid.innerHTML = html;
        }
        function renderEvalCriteria() {
            const container = document.getElementById('eval-criteria-container');
            if (!container) return;
            const criteria = evalCriteria[currentEvalTab] || [];
            if (criteria.length === 0) {
                container.innerHTML = '<p class="text-[9px] text-slate-600 italic text-center py-2">No criteria yet — tap ＋ Add New</p>';
                return;
            }
            container.innerHTML = criteria.map((c, i) => {
                const gateHtml = i > 0 ? '<button onclick="toggleEvalGate(' + i + ')" class="w-full py-1 text-[9px] font-black uppercase tracking-widest text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-lg transition-all mb-1">' + c.gate + '</button>' : '';
                const modeVal = c.mode === 'NUM'
                    ? '<input type="text" value="' + c.numVal + '" inputmode="numeric" onchange="updateEvalCriteria(' + i + ', &quot;numVal&quot;, this.value)" class="w-14 bg-[#020617] text-sky-400 text-xs font-black rounded p-1 outline-none border border-white/10 text-center">'
                    : '<select onchange="updateEvalCriteria(' + i + ', &quot;varVal&quot;, this.value)" class="flex-1 bg-[#020617] text-sky-400 text-xs font-black rounded p-1 outline-none border border-white/10 text-center"><option value="target" ' + (c.varVal === 'target' ? 'selected' : '') + '>Target</option></select>';
                return gateHtml +
                    '<div class="bg-[#020617]/40 rounded-lg border border-white/5 p-2 space-y-2">' +
                    '<div class="flex items-center justify-between">' +
                    '<label class="flex items-center gap-1.5 cursor-pointer">' +
                    '<input type="checkbox" ' + (c.viewOnly ? 'checked' : '') + ' onchange="toggleEvalViewOnly(' + i + ',this.checked)" class="w-3 h-3 rounded accent-sky-400">' +
                    '<span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">View Only</span></label>' +
                    '<button onclick="removeEvalCriteria(' + i + ')" class="text-rose-500/50 hover:text-rose-400 text-[10px]">✕</button>' +
                    '</div>' +
                    '<div class="flex gap-1.5 items-center">' +
                    '<select onchange="updateEvalCriteria(' + i + ', &quot;op&quot;, this.value)" class="flex-1 bg-[#020617] text-sky-400 text-xs font-black rounded p-1 outline-none border border-white/10 text-center">' +
                    '<option value=">=" ' + (c.op === '>=' ? 'selected' : '') + '>≥</option>' +
                    '<option value=">" ' + (c.op === '>' ? 'selected' : '') + '>></option>' +
                    '<option value="=" ' + (c.op === '=' ? 'selected' : '') + '>=</option>' +
                    '<option value="<" ' + (c.op === '<' ? 'selected' : '') + '><</option>' +
                    '<option value="<=" ' + (c.op === '<=' ? 'selected' : '') + '>≤</option>' +
                    '</select>' +
                    '<div class="flex bg-[#020617] rounded border border-white/10 overflow-hidden shrink-0">' +
                    '<button onclick="setEvalCriteriaMode(' + i + ', &quot;NUM&quot;)" class="px-2 py-1 text-[8px] font-black uppercase ' + (c.mode === 'NUM' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-600') + ' transition-all">NUM</button>' +
                    '<button onclick="setEvalCriteriaMode(' + i + ', &quot;VAR&quot;)" class="px-2 py-1 text-[8px] font-black uppercase border-l border-white/10 ' + (c.mode === 'VAR' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-600') + ' transition-all">VAR</button>' +
                    '</div>' + modeVal + '</div></div>';
            }).join('');
            _syncEvalToEngine();
        }
        function renderModifierChips() {
            const listContainer = document.getElementById('modifier-nodes-list');
            const mainActiveRow = document.getElementById('main-active-nodes-row');
            const totalBadge = document.getElementById('nodes-total-badge');

            const nodes = engine._flatMod || [];

            // Calculate total badge resolved value
            const totalVal = engine.resolveModifier(nodes);
            if (totalBadge) {
                totalBadge.innerText = `Total: ${totalVal >= 0 ? '+' : ''}${totalVal}`;
            }

            // 1. Render in Advanced Rules Panel
            if (listContainer) {
                if (nodes.length === 0) {
                    listContainer.innerHTML = '<span class="text-[10px] text-slate-500 italic py-1 pl-1">No modifier nodes active</span>';
                } else {
                    listContainer.innerHTML = nodes.map((node, index) => {
                        const termStr = engine.getModifierTermString(node);
                        let resolvedStr = "";
                        if (node.type === 'variable') {
                            const resolved = window.getActiveCharacterVariable(node.value);
                            if (resolved !== null) {
                                resolvedStr = ` <span class="text-slate-400">(${resolved >= 0 ? '+' : ''}${resolved})</span>`;
                            }
                        }
                        return `
                            <div draggable="true" 
                                ondragstart="handleChipDragStart(event, ${index})" 
                                ondragend="handleChipDragEnd(event)" 
                                ondragover="handleChipDragOver(event)" 
                                ondrop="handleChipDrop(event, ${index})"
                                class="flex items-center gap-1.5 bg-[#020617] border border-white/10 text-sky-400 rounded-lg px-2 py-1 text-xs font-bold transition-all hover:border-[#00d4ff]/30 cursor-grab active:cursor-grabbing">
                                <span>${termStr}</span>${resolvedStr}
                                <button onclick="removeModifierChip(${index}, event)" class="text-slate-500 hover:text-rose-400 transition-colors ml-1 shrink-0" title="Remove Chip">✕</button>
                            </div>
                        `;
                    }).join('');
                }
            }

            // 2. Render on main screen below steppers (always hidden since they are in the queue now)
            if (mainActiveRow) {
                mainActiveRow.classList.add('hidden');
                mainActiveRow.innerHTML = '';
            }
        }
        function renderCampaignSelect() {
            const sel = document.getElementById('campaign-select');
            if (!sel) return;
            if (campaigns.length === 0) {
                sel.innerHTML = `<option value="" selected>No Campaigns</option>`;
                sel.classList.add('opacity-60');
            } else {
                sel.classList.remove('opacity-60');
                sel.innerHTML = campaigns.map(c =>
                    `<option value="${c.id}" ${c.id === activeCampaignId ? 'selected' : ''}>${c.name}</option>`
                ).join('');
            }
        }
        function renderCharacterSelect() {
            const input = document.getElementById('active-char-name-input');
            if (!input) return;
            const char = characters.find(c => c.id === activeCharacterId);
            if (char) {
                input.value = char.name;
                input.disabled = false;
                input.classList.remove('opacity-40');
            } else {
                input.value = '';
                input.placeholder = 'NO ACTIVE CHARACTER';
                input.disabled = true;
                input.classList.add('opacity-40');
            }
            populateRulesVariableDropdowns();
        }
        function renderGroupTabs() {
            const container = document.getElementById('group-tabs');
            if (!container) return;
            container.innerHTML = '';

            if (!activeCharacterId) {
                container.innerHTML = `<span class="text-[10px] text-slate-600 italic py-1 pl-1 select-none">No active sheet. Spawn or create one in the Binder!</span>`;
                return;
            }

            const charGroups = groups.filter(g => g.characterId === activeCharacterId);
            if (charGroups.length === 0) {
                const baseTime = Date.now();
                const defaultGrp = { id: `grp_default_${baseTime}`, name: 'Default', color: '#00d4ff', characterId: activeCharacterId };
                groups.push(defaultGrp);
                activeGroupId = defaultGrp.id;
                persistArsenal();
                renderGroupTabs();
                renderSavedQueues();
                return;
            }

            charGroups.forEach(g => {
                const btn = document.createElement('button');
                btn.className = `group-tab ${g.id === activeGroupId ? 'active' : ''}`;
                btn.setAttribute('draggable', 'true');
                btn.innerHTML = `<span class="group-dot" style="background:${g.color}"></span>${g.name}`;

                let isHold = false;          // used for native contextmenu guard
                let holdOpened = false;      // true only after the timer opens the menu
                let holdTimer = null;

                const startHold = (e) => {
                    isHold = false;
                    holdOpened = false;
                    holdTimer = setTimeout(() => {
                        holdOpened = true;    // timer succeeded, menu opened
                        openGroupContextMenu(g.id, e);
                    }, 500);
                };

                const cancelHold = () => {
                    clearTimeout(holdTimer);
                };

                btn.addEventListener('mousedown', startHold);
                btn.addEventListener('touchstart', startHold, { passive: true });

                const endClick = (e) => {
                    clearTimeout(holdTimer);
                    if (!holdOpened) {
                        selectGroup(g.id);
                    }
                    // reset for next interaction
                    holdOpened = false;
                };
                btn.addEventListener('mouseup', endClick);
                btn.addEventListener('touchend', endClick);
                btn.addEventListener('touchmove', cancelHold, { passive: true });
                btn.addEventListener('touchcancel', (e) => {
                    clearTimeout(holdTimer);
                }, { passive: true });
                btn.addEventListener('mouseleave', cancelHold);

                btn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelHold(); // stop the timer from double-toggling
                    if (!holdOpened) {
                        holdOpened = true;
                        openGroupContextMenu(g.id, e);
                    }
                });

                btn.addEventListener('dragstart', (e) => {
                    cancelHold();
                    dragSrcGroupId = g.id;
                    btn.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                btn.addEventListener('dragend', () => {
                    btn.classList.remove('dragging');
                    document.querySelectorAll('.group-tab').forEach(el => {
                        el.classList.remove('drag-over-left', 'drag-over-right', 'widget-drag-hover');
                    });
                    dragSrcGroupId = null;
                });

                btn.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (dragSrcId) {
                        btn.classList.add('widget-drag-hover');
                    } else if (dragSrcGroupId && dragSrcGroupId !== g.id) {
                        const rect = btn.getBoundingClientRect();
                        const middleX = rect.left + rect.width / 2;
                        const isRight = e.clientX > middleX;
                        if (isRight) {
                            btn.classList.remove('drag-over-left');
                            btn.classList.add('drag-over-right');
                        } else {
                            btn.classList.remove('drag-over-right');
                            btn.classList.add('drag-over-left');
                        }
                    }
                });

                btn.addEventListener('dragleave', () => {
                    btn.classList.remove('drag-over-left', 'drag-over-right', 'widget-drag-hover');
                });

                btn.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const isRight = btn.classList.contains('drag-over-right');
                    btn.classList.remove('drag-over-left', 'drag-over-right', 'widget-drag-hover');

                    if (dragSrcId) {
                        const srcIdx = engine.savedQueues.findIndex(x => x.id === dragSrcId);
                        if (srcIdx > -1) {
                            const [moved] = engine.savedQueues.splice(srcIdx, 1);
                            moved.groupId = g.id;
                            const targetGroupWidgets = engine.savedQueues.filter(x => x.groupId === g.id);
                            if (targetGroupWidgets.length > 0) {
                                const lastWidget = targetGroupWidgets[targetGroupWidgets.length - 1];
                                const lastIdx = engine.savedQueues.findIndex(x => x.id === lastWidget.id);
                                engine.savedQueues.splice(lastIdx + 1, 0, moved);
                            } else {
                                engine.savedQueues.push(moved);
                            }
                            persistSaved();
                            renderSavedQueues();
                            vibrate(10);
                        }
                        dragSrcId = null;
                    } else if (dragSrcGroupId && dragSrcGroupId !== g.id) {
                        const srcIdx = groups.findIndex(x => x.id === dragSrcGroupId);
                        const tgtIdx = groups.findIndex(x => x.id === g.id);
                        if (srcIdx > -1 && tgtIdx > -1) {
                            const [moved] = groups.splice(srcIdx, 1);
                            let newTgt = groups.findIndex(x => x.id === g.id);
                            if (isRight) {
                                newTgt = newTgt + 1;
                            }
                            groups.splice(newTgt, 0, moved);
                            persistArsenal();
                            renderGroupTabs();
                            renderSavedQueues();
                            vibrate(10);
                        }
                        dragSrcGroupId = null;
                    }
                });

                container.appendChild(btn);
            });
        }
        function renderTemplates() {
            const listContainer = document.getElementById('binder-templates-list');
            if (!listContainer) return;
            listContainer.innerHTML = '';

            templates.forEach(t => {
                const itemEl = document.createElement('div');
                itemEl.className = 'p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between gap-2 hover:bg-white/[0.04] transition-all text-xs';

                let typeBadge = t.dndType === 'monster' ? 'Monster' : 'Character';
                let badgeColor = t.dndType === 'monster' ? 'text-rose-400 border-rose-500/20 bg-rose-500/5' : 'text-sky-400 border-sky-500/20 bg-sky-500/5';

                let deleteBtn = '';
                if (!t.isDefault) {
                    deleteBtn = `
                        <button onclick="deleteTemplate('${t.id}', event)" class="p-1 hover:text-rose-500 text-slate-500 transition-colors" title="Delete Template">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    `;
                }

                itemEl.innerHTML = `
                    <div class="flex flex-col min-w-0 flex-grow">
                        <span class="font-bold text-slate-300 truncate">${t.name}</span>
                        <span class="text-[9px] font-black uppercase tracking-wider text-slate-500 mt-0.5 flex items-center gap-1">
                            <span class="px-1 py-0.2 rounded border ${badgeColor}">${typeBadge}</span>
                            <span>${t.system || 'Generic'}</span>
                        </span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button onclick="spawnTemplateInstance('${t.id}', event)" class="px-2 py-1 rounded bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 text-[#00d4ff] text-[10px] font-black uppercase tracking-wider transition-all border border-[#00d4ff]/20 active:scale-95" title="Spawn Sheet">
                            Spawn
                        </button>
                        ${deleteBtn}
                    </div>
                `;
                listContainer.appendChild(itemEl);
            });
        }
        function renderBinder() {
            // Update Instanced Sheets List (Now campaign folders!)
            const listContainer = document.getElementById('binder-sheets-list');
            if (!listContainer) return;
            listContainer.innerHTML = '';

            campaigns.forEach(camp => {
                const isExpanded = openTabs.includes(camp.id);
                const isActiveCampaign = camp.id === activeCampaignId;

                const folderWrapper = document.createElement('div');
                folderWrapper.className = 'border border-white/5 rounded-xl bg-white/[0.01] overflow-hidden space-y-1';

                // Campaign Folder Header
                const folderHeader = document.createElement('div');
                folderHeader.className = `p-2.5 flex items-center justify-between cursor-pointer transition-all hover:bg-white/5 ${isActiveCampaign ? 'bg-[#00d4ff]/5 border-b border-[#00d4ff]/10' : 'border-b border-white/5'
                    }`;

                folderHeader.ondblclick = (e) => {
                    e.stopPropagation();
                    startCampaignInlineRename(camp.id, folderHeader);
                };

                folderHeader.onclick = (e) => {
                    selectCampaign(camp.id);
                    toggleCampaignFolder(camp.id, e);
                };

                folderHeader.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0 flex-grow">
                        <span class="text-xs transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}">▶</span>
                        <span class="text-xs font-black uppercase tracking-wider truncate camp-inline-name">${camp.name}</span>
                    </div>
                    <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 shrink-0">
                        <button onclick="deleteCampaignFromBinder('${camp.id}', event)" class="p-1 hover:text-rose-500 transition-colors" title="Delete Campaign">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                `;
                folderWrapper.appendChild(folderHeader);

                // Sheets list inside campaign folder
                if (isExpanded) {
                    const sheetsContainer = document.createElement('div');
                    sheetsContainer.className = 'p-1.5 space-y-1';

                    const campChars = characters.filter(c => c.campaignId === camp.id);
                    if (campChars.length === 0) {
                        sheetsContainer.innerHTML = `<div class="text-[9px] text-slate-600 italic py-2 text-center">Empty campaign.</div>`;
                    } else {
                        campChars.forEach(char => {
                            const charEl = document.createElement('div');
                            const isCharActive = char.id === activeCharacterId;
                            charEl.className = `p-2 rounded-lg flex items-center justify-between cursor-pointer transition-all ${isCharActive
                                ? 'bg-[#00d4ff]/10 text-white font-bold'
                                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`;

                            charEl.ondblclick = (e) => {
                                e.stopPropagation();
                                startInlineRename(char.id, charEl);
                            };

                            let holdTimer = null;
                            let isHold = false;

                            const startHold = (e) => {
                                isHold = false;
                                holdTimer = setTimeout(() => {
                                    isHold = true;
                                    openCharContextMenu(char.id, e);
                                }, 500);
                            };
                            const cancelHold = () => {
                                clearTimeout(holdTimer);
                            };

                            charEl.addEventListener('mousedown', startHold);
                            charEl.addEventListener('touchstart', startHold, { passive: true });

                            const endClick = (e) => {
                                clearTimeout(holdTimer);
                                if (!isHold) {
                                    activeCampaignId = camp.id;
                                    selectCharacterFromBinder(char.id);
                                }
                            };
                            charEl.addEventListener('mouseup', endClick);
                            charEl.addEventListener('touchend', endClick);
                            charEl.addEventListener('touchmove', cancelHold, { passive: true });
                            charEl.addEventListener('touchcancel', cancelHold, { passive: true });
                            charEl.addEventListener('mouseleave', cancelHold);

                            charEl.addEventListener('contextmenu', (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                isHold = true;
                                openCharContextMenu(char.id, e);
                            });

                            let badgeHtml = '';
                            if (char.variables && char.variables.HP !== undefined) {
                                const hp = char.variables.HP;
                                const maxHp = char.variables.MaxHP ?? hp;
                                badgeHtml = `<span class="px-1 py-0.5 rounded bg-slate-950 border border-white/5 text-[8px] mono text-slate-500 font-bold ml-1.5 shrink-0">${hp}/${maxHp} HP</span>`;
                            }

                            charEl.innerHTML = `
                                <div class="flex items-center gap-1.5 min-w-0 flex-grow pl-3">
                                    <span class="text-xs truncate uppercase tracking-wide inline-name-label">${char.name}</span>
                                    ${badgeHtml}
                                </div>
                                <button class="text-slate-600 hover:text-rose-500 transition-colors p-0.5 shrink-0 delete-char-btn"
                                        onclick="deleteCharacterFromBinder('${char.id}', event)">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            `;
                            // Prevent the delete button's mousedown/mouseup from bubbling to charEl
                            // (which would trigger selectCharacterFromBinder and re-render the binder
                            // before the delete modal can fire)
                            const deleteBtn = charEl.querySelector('.delete-char-btn');
                            if (deleteBtn) {
                                deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
                                deleteBtn.addEventListener('mouseup', e => e.stopPropagation());
                                deleteBtn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
                                deleteBtn.addEventListener('touchend', e => e.stopPropagation());
                            }
                            sheetsContainer.appendChild(charEl);
                        });
                    }
                    folderWrapper.appendChild(sheetsContainer);
                }

                listContainer.appendChild(folderWrapper);
            });
            renderTemplates();
        }
        function renderSavedQueues() {
            const container = document.getElementById('arsenal-list-container');
            if (!container) return;
            const list = container.querySelector('.saved-queues-list');
            if (!list) return;

            const filtered = engine.savedQueues.filter(q => {
                const charMatch = q.characterId === activeCharacterId;
                const grpMatch = q.groupId === activeGroupId;

                let match = false;
                if (!q.characterId && !q.groupId) {
                    const firstChar = characters[0];
                    const firstCharFirstGroup = firstChar ? groups.find(g => g.characterId === firstChar.id)?.id : null;
                    match = activeCharacterId === (firstChar ? firstChar.id : null) && activeGroupId === firstCharFirstGroup;
                } else {
                    match = charMatch && grpMatch;
                }

                if (!match) return false;
                if (q.hidden && !showHiddenWidgets) return false;
                return true;
            });

            list.innerHTML = '';

            filtered.forEach(q => {
                const type = q.widgetType || 'roller';
                const resolvedName = resolveDynamicText(q.name || '');
                const resolvedText = q.text ? resolveDynamicText(q.text) : '';

                let holdTimer = null;
                let isHold = false;
                let hasMoved = false;
                let startX = 0, startY = 0;

                const startHold = (e) => {
                    if (e.target.closest('button, input, textarea, select, .timer-bar-container')) {
                        return;
                    }
                    isHold = false;
                    hasMoved = false;
                    const touch = e.touches ? e.touches[0] : e;
                    startX = touch.clientX;
                    startY = touch.clientY;
                    holdTimer = setTimeout(() => {
                        isHold = true;
                        vibrate(15);
                    }, 500);
                };

                const cancelHold = () => {
                    if (holdTimer) {
                        clearTimeout(holdTimer);
                        holdTimer = null;
                    }
                };

                const moveHold = (e) => {
                    if (e.type === 'mousemove' && e.buttons !== 1) return;
                    const touch = e.touches ? e.touches[0] : e;
                    if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
                        cancelHold();
                        hasMoved = true;
                    }
                };

                const bindHoldListeners = (el) => {
                    el.addEventListener('touchstart', startHold, { passive: true });
                    el.addEventListener('touchend', (e) => {
                        cancelHold();
                        if (isHold) {
                            if (!hasMoved) {
                                toggleArsenalMenu(q.id, e);
                            }
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        setTimeout(() => { hasMoved = false; isHold = false; }, 50);
                    });
                    el.addEventListener('touchmove', moveHold, { passive: true });
                    el.addEventListener('touchcancel', () => {
                        cancelHold();
                        hasMoved = false;
                        isHold = false;
                    });

                    el.addEventListener('mousedown', (e) => {
                        if (e.button === 0) startHold(e);
                    });
                    el.addEventListener('mouseup', (e) => {
                        cancelHold();
                        if (isHold) {
                            if (!hasMoved) {
                                toggleArsenalMenu(q.id, e);
                            }
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        setTimeout(() => { hasMoved = false; isHold = false; }, 50);
                    });
                    el.addEventListener('mousemove', moveHold);
                    el.addEventListener('mouseleave', () => {
                        cancelHold();
                        hasMoved = false;
                        isHold = false;
                    });

                    el.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (hasMoved) return;
                        cancelHold();
                        if (!isHold) {
                            toggleArsenalMenu(q.id, e);
                        }
                        isHold = false;
                    });
                };

                const wrapper = document.createElement('div');
                wrapper.className = `arsenal-item-wrapper flex items-center gap-2 relative w-full widget-type-${type}`;
                if (q.hidden) {
                    wrapper.classList.add('opacity-40', 'border-dashed', 'border', 'border-white/10', 'rounded-xl');
                }
                // Apply display mode class based on effective mode
                const effectiveMode = getEffectiveDisplayMode(q);
                if (effectiveMode === 'simple') wrapper.classList.add('widget-display-simple');
                else if (effectiveMode === 'compact') wrapper.classList.add('widget-display-compact');
                wrapper.draggable = true;
                wrapper.dataset.id = q.id;

                wrapper.addEventListener('dragstart', (e) => {
                    // Block drag if it started on an interactive element
                    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.timer-bar-container')) {
                        e.preventDefault();
                        return;
                    }
                    dragSrcId = q.id;
                    wrapper.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', q.id);
                    if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(wrapper, 15, 15);
                    cancelHold();
                    hasMoved = true;
                });
                wrapper.addEventListener('dragend', () => {
                    wrapper.classList.remove('dragging');
                    document.querySelectorAll('.drag-over-before, .drag-over-after').forEach(el => el.classList.remove('drag-over-before', 'drag-over-after'));
                    hasMoved = false;
                });
                wrapper.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (dragSrcId === q.id) return;

                    const rect = wrapper.getBoundingClientRect();
                    const middleY = rect.top + rect.height / 2;
                    const isAfter = e.clientY > middleY;

                    if (isAfter) {
                        wrapper.classList.remove('drag-over-before');
                        wrapper.classList.add('drag-over-after');
                    } else {
                        wrapper.classList.remove('drag-over-after');
                        wrapper.classList.add('drag-over-before');
                    }
                });
                wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over-before', 'drag-over-after'));
                wrapper.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const isAfter = wrapper.classList.contains('drag-over-after');
                    wrapper.classList.remove('drag-over-before', 'drag-over-after');

                    if (dragSrcId === null || dragSrcId === q.id) return;
                    const srcIdx = engine.savedQueues.findIndex(x => x.id === dragSrcId);
                    const tgtIdx = engine.savedQueues.findIndex(x => x.id === q.id);
                    if (srcIdx > -1 && tgtIdx > -1) {
                        const [moved] = engine.savedQueues.splice(srcIdx, 1);
                        moved.groupId = activeGroupId;
                        moved.characterId = activeCharacterId;
                        let newTgt = engine.savedQueues.findIndex(x => x.id === q.id);
                        if (isAfter) {
                            newTgt = newTgt + 1;
                        }
                        engine.savedQueues.splice(newTgt, 0, moved);
                        persistSaved();
                        renderSavedQueues();
                    }
                    dragSrcId = null;
                    hasMoved = false;
                });


                const item = document.createElement('div');
                item.className = 'saved-item pl-5 pr-3 py-2 rounded-xl flex items-center cursor-pointer group flex-grow min-w-0 relative overflow-hidden';
                item.dataset.id = q.id;

                bindHoldListeners(item);

                const isDiceless = type === 'roller' && !(q.unifiedQueue || []).some(node => node.nodeType === 'node');

                if (type === 'roller') {
                    item.onclick = (e) => {
                        if (isHold) {
                            isHold = false;
                            e.stopPropagation();
                            return;
                        }
                        if (isDiceless) {
                            if (q.addonToggle) {
                                toggleCardAddonState(q.id, !q.addonToggle.checked);
                            }
                            return;
                        }
                        triggerRoll(e, { arsenalId: q.id });
                    };
                } else if (type === 'number') {
                    item.onclick = (e) => {
                        if (isHold) {
                            isHold = false;
                            e.stopPropagation();
                            return;
                        }
                        if (q.addonToggle) {
                            toggleCardAddonState(q.id, !q.addonToggle.checked);
                        }
                    };
                } else if (type === 'text') {
                    item.onclick = (e) => {
                        if (isHold) {
                            isHold = false;
                            e.stopPropagation();
                            return;
                        }
                        toggleTextCardCollapsed(q.id);
                    };
                } else if (type === 'toggle') {
                    item.onclick = (e) => {
                        if (isHold) {
                            isHold = false;
                            e.stopPropagation();
                            return;
                        }
                        changeToggleValue(q.id, !q.checked);
                    };
                }

                let formula = '';
                if (type === 'roller' || type === 'number') {
                    if (q.unifiedQueue && Array.isArray(q.unifiedQueue) && q.unifiedQueue.length > 0) {
                        formula = q.unifiedQueue.map(node => {
                            if (node.nodeType === 'node') {
                                let txt = `${node.count}d${node.sides}`;
                                if (node.rerollOp && node.rerollVal !== null) {
                                    txt += ` rr${node.rerollOp.replace('>=', '≥').replace('<=', '≤')}${node.rerollVal}`;
                                }
                                if (node.explodeOp && node.explodeVal !== null) {
                                    txt += ` ex${node.explodeOp.replace('>=', '≥').replace('<=', '≤')}${node.explodeVal}`;
                                }
                                return txt;
                            } else if (node.nodeType === 'modifier' || node.nodeType === 'number') {
                                const op = node.operator === '-' ? '-' : '+';
                                let valStr = node.value;
                                let inlineResolved = "";
                                if (node.type === 'variable') {
                                    const resolvedVar = window.getActiveCharacterVariable(node.value);
                                    if (resolvedVar !== null) {
                                        inlineResolved = ` (${resolvedVar >= 0 ? '+' : ''}${resolvedVar})`;
                                    }
                                }
                                let mathIndicator = "";
                                if (node.multiplierType && node.multiplierType !== 'none') {
                                    mathIndicator += `*${node.multiplierValue}`;
                                }
                                if (node.divisorType && node.divisorType !== 'none') {
                                    mathIndicator += `/${node.divisorValue}`;
                                }
                                if (node.roundMode && node.roundMode !== 'none') {
                                    mathIndicator += ` (${node.roundMode === 'up' ? '↑' : node.roundMode === 'down' ? '↓' : '≈'})`;
                                }
                                return ` [${op}${valStr}${inlineResolved}${mathIndicator}]`;
                            } else if (node.nodeType === 'operator') {
                                const op = node.operator;
                                const isAdvDis = op === 'ADV' || op === 'DIS';
                                const opDisplay = op === '*' ? '×' : op === '/' ? '/' : (isAdvDis ? `${op}${node.modifierLevel > 1 ? '+' + (node.modifierLevel - 1) : ''}` : op);
                                return ` ${opDisplay} `;
                            }
                            return '';
                        }).join('').trim();
                    } else {
                        formula = (q.queue || []).map(dq => `${dq.count}d${dq.sides}`).join("+");
                        if (Array.isArray(q.flat) && q.flat.length > 0) {
                            q.flat.forEach(term => {
                                let termStr = term.value;
                                let suffix = "";
                                if (term.multiplierType && term.multiplierType !== 'none') suffix += `*${term.multiplierValue}`;
                                if (term.divisorType && term.divisorType !== 'none') suffix += `/${term.divisorValue}`;
                                if (term.roundMode === 'up') suffix += '↑';
                                if (term.roundMode === 'down') suffix += '↓';
                                if (term.roundMode === 'round') suffix += '≈';
                                let resolvedStr = "";
                                if (term.type === 'variable') {
                                    const resolved = window.getActiveCharacterVariable(term.value);
                                    if (resolved !== null) resolvedStr = ` (${resolved >= 0 ? '+' : ''}${resolved})`;
                                }
                                formula += ` [${term.operator === '-' ? '-' : '+'}${termStr}${suffix}${resolvedStr}]`;
                            });
                        } else if (typeof q.flat === 'string' && q.flat !== '') {
                            const resolvedVal = window.getActiveCharacterVariable(q.flat);
                            const valStr = resolvedVal !== null ? ` (${resolvedVal >= 0 ? '+' : ''}${resolvedVal})` : '';
                            formula += ` [${q.flat}${valStr}]`;
                        } else if (typeof q.flat === 'number' && q.flat !== 0) {
                            formula += ` [${q.flat > 0 ? '+' : ''}${q.flat}]`;
                        }
                    }
                    if (q.modifier) formula += ` [${q.modifier}${q.modLevel > 1 ? '+' + (q.modLevel - 1) : ''}]`;
                    if (q.rules) {
                        if (q.rules.rerollOp && q.rules.rerollVal !== null) formula += ` RR${q.rules.rerollOp}${q.rules.rerollVal}`;
                        if (q.rules.explodeOp && q.rules.explodeVal !== null) formula += ` EX${q.rules.explodeOp}${q.rules.explodeVal}`;
                        if (q.rules.targetOp && q.rules.targetVal !== null && q.rules.targetVal !== '') {
                            const opDisplay = q.rules.targetOp.replace(/>=/g, '≥').replace(/<=/g, '≤');
                            let valDisplay = q.rules.targetVal;
                            const resolvedVal = window.getActiveCharacterVariable(q.rules.targetVal);
                            if (resolvedVal !== null) valDisplay = `${q.rules.targetVal} (${resolvedVal})`;
                            formula += ` TARGET ${opDisplay} ${valDisplay}`;
                        }
                    }
                }

                if ((type === 'roller' || type === 'number') && q.addonToggle && !q.addonToggle.checked) {
                    item.classList.add('opacity-40');
                }

                const hasColor = q.color && q.color !== 'none';
                item.style.setProperty('--item-color', hasColor ? q.color : 'transparent');
                const hideLeftTab = type === 'stepper' && q.showTracker;
                let innerHtml = `
                    ${(hasColor && !hideLeftTab)
                        ? `<div class="absolute left-0 top-0 bottom-0 w-1.5 shadow-[2px_0_15px_currentColor]" style="background-color: ${q.color}; color: ${q.color}"></div>`
                        : (!hideLeftTab ? `<div class="absolute left-0 top-0 bottom-0 w-0.5 bg-white/5"></div>` : '')
                    }
                `;


                if (type === 'roller') {
                    if (isDiceless) {
                        let resolvedVal = 0;
                        const res = engine.calculateRoll(q.unifiedQueue || q.queue, true);
                        if (res) resolvedVal = parseInt(res.total) || 0;
                        innerHtml += `
                            <div class="flex-grow min-w-0 pl-1 ${q.addonToggle ? 'pr-8' : 'pr-2'}">
                                <div class="flex items-center gap-1.5">
                                    <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight">${resolvedName}</div>
                                </div>
                                ${renderWidgetSubtext(q, formula || 'Empty', effectiveMode)}
                            </div>
                            <div class="flex items-center gap-2 mr-8 shrink-0 select-none" onclick="event.stopPropagation()">
                                <div class="w-16 bg-[#020617]/60 border border-[#00ff88]/20 shadow-[0_0_10px_rgba(0,255,136,0.1)] rounded-lg py-1.5 text-center text-[#00ff88] font-black tabular-nums text-lg leading-none" title="Current value">
                                    ${resolvedVal}
                                </div>
                            </div>
                        `;
                    } else {
                        innerHtml += `
                            <div class="flex-grow min-w-0 pl-1 pr-8">
                                <div class="flex items-center gap-1.5">
                                    <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight">${resolvedName}</div>
                                </div>
                                ${renderWidgetSubtext(q, formula || 'Empty', effectiveMode)}
                            </div>
                        `;
                    }

                    if (q.addonToggle) {
                        const t = q.addonToggle;
                        innerHtml += `
                            <div class="absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center shadow-[-2px_0_15px_currentColor] transition-all duration-300 cursor-pointer" 
                                 onclick="event.stopPropagation(); toggleCardAddonState('${q.id}', !${t.checked})"
                                 style="background-color: ${t.checked ? (hasColor ? q.color : '#ffffff') : 'rgba(30, 41, 59, 0.3)'}; color: ${t.checked ? (hasColor ? q.color : '#ffffff') : 'transparent'}">
                                <svg class="w-3.5 h-3.5 transition-colors duration-300" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" style="color: ${t.checked ? '#090d16' : '#64748b'}">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 3v9" />
                                </svg>
                            </div>
                        `;
                    }
                } else if (type === 'stepper') {
                    const resolvedMax = (typeof q.max === 'string') ? (window.getActiveCharacterVariable(q.max) ?? 100) : (q.max ?? 100);
                    let trackerHtml = '';
                    if (q.showTracker) {
                        const trackerColor = hasColor ? q.color : '#ffffff';
                        const pct = resolvedMax > 0 ? Math.min(100, Math.max(0, ((q.value - (q.min || 0)) / (resolvedMax - (q.min || 0))) * 100)) : 0;
                        trackerHtml = `
                            <div class="absolute bottom-0 left-0 right-0 h-1 bg-[#020617]/60 overflow-hidden">
                                <div class="h-full transition-all duration-300" style="width: ${pct}%; background-color: ${trackerColor}; box-shadow: 0 0 10px ${trackerColor};"></div>
                            </div>
                        `;
                    }
                    innerHtml += `
                        <div class="flex-grow min-w-0 pl-1 pr-2">
                            <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight leading-tight">${resolvedName}</div>
                            ${renderWidgetSubtext(q, '', effectiveMode)}
                            ${trackerHtml}
                        </div>
                    `;
                } else if (type === 'toggle') {
                    innerHtml += `
                        <div class="flex-grow min-w-0 pl-1 pr-8">
                            <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight">${resolvedName}</div>
                            ${renderWidgetSubtext(q, '', effectiveMode)}
                        </div>
                        <div class="flex items-center gap-2 mr-8 shrink-0 select-none">
                            <span class="text-[11px] font-black uppercase tracking-wider min-w-[35px] text-center ${q.checked ? 'text-white' : 'text-slate-500'}">
                                    ${q.checked ? q.labelOn : q.labelOff}
                            </span>
                        </div>
                        <div class="absolute right-0 top-0 bottom-0 w-6 shadow-[-2px_0_15px_currentColor] transition-all duration-300" 
                             style="background-color: ${q.checked ? (hasColor ? q.color : '#ffffff') : 'rgba(30, 41, 59, 0.3)'}; color: ${q.checked ? (hasColor ? q.color : '#ffffff') : 'transparent'}">
                        </div>
                    `;
                } else if (type === 'number') {
                    let displayVal = q.value;
                    let isCalculated = false;
                    let hasVariable = false;

                    if (q.unifiedQueue && Array.isArray(q.unifiedQueue) && q.unifiedQueue.length > 0) {
                        isCalculated = true;
                        const res = engine.calculateRoll(q.unifiedQueue, true);
                        if (res) {
                            displayVal = parseInt(res.total) || 0;
                            if (q.value !== displayVal) {
                                q.value = displayVal;
                            }
                        }
                    } else if (q.bindsVariable) {
                        hasVariable = true;
                        const resolved = window.getActiveCharacterVariable(q.bindsVariable);
                        if (resolved !== null) {
                            displayVal = resolved;
                        }
                        const calculatedVars = ['STR_MOD', 'DEX_MOD', 'CON_MOD', 'INT_MOD', 'WIS_MOD', 'CHA_MOD', 'BACKSTAB_DICE'];
                        const upperBindVar = q.bindsVariable.toUpperCase();
                        if (calculatedVars.includes(upperBindVar)) {
                            isCalculated = true;
                        }
                    }

                    const isInputDisabled = isCalculated || (q.addonToggle && !q.addonToggle.checked);
                    
                    let inputHtml = '';
                    if (hasVariable) {
                        inputHtml = `
                            <input type="text" value="${displayVal >= 0 ? '+' : ''}${displayVal}" readonly 
                                   onclick="event.stopPropagation(); showVariableModal('${q.id}')" 
                                   class="w-16 bg-black/40 border border-white/10 rounded-lg px-1 py-0.5 text-center outline-none focus:border-[#00d4ff] text-[#00d4ff] font-black tabular-nums transition-colors text-lg cursor-pointer hover:border-[#00d4ff]/40">
                        `;
                    } else {
                        inputHtml = `
                            <input type="number" value="${displayVal}" ${isInputDisabled ? 'readonly disabled' : ''} 
                                   onchange="changeNumberValueDirect('${q.id}', this.value)" 
                                   class="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-center outline-none focus:border-[#00d4ff] text-[#00d4ff] font-black tabular-nums transition-colors text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isInputDisabled ? 'opacity-70 pointer-events-none' : ''}">
                        `;
                    }

                    innerHtml += `
                        <div class="flex-grow min-w-0 pl-1 ${q.addonToggle ? 'pr-8' : 'pr-2'}">
                            <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight">${resolvedName}</div>
                            ${renderWidgetSubtext(q, formula, effectiveMode)}
                        </div>
                        <div class="flex items-center gap-2 ${q.addonToggle ? 'mr-8' : 'mr-2'} shrink-0 select-none" onclick="event.stopPropagation()">
                            ${inputHtml}
                        </div>
                    `;
                    if (q.addonToggle) {
                        const t = q.addonToggle;
                        innerHtml += `
                            <div class="absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center shadow-[-2px_0_15px_currentColor] transition-all duration-300 cursor-pointer" 
                                 onclick="event.stopPropagation(); toggleCardAddonState('${q.id}', !${t.checked})"
                                 style="background-color: ${t.checked ? (hasColor ? q.color : '#ffffff') : 'rgba(30, 41, 59, 0.3)'}; color: ${t.checked ? (hasColor ? q.color : '#ffffff') : 'transparent'}">
                                <svg class="w-3.5 h-3.5 transition-colors duration-300" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" style="color: ${t.checked ? '#090d16' : '#64748b'}">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 3v9" />
                                </svg>
                            </div>
                        `;
                    }
                } else if (type === 'text') {
                    const isCollapsed = (globalLayout === 'force-full') ? false : (q.collapsed ?? false);
                    innerHtml += `
                        <div class="flex-grow min-w-0 pl-1">
                            <div class="flex items-center gap-1.5 justify-between">
                                <div class="text-sm font-black text-[#e2e8f0] truncate uppercase tracking-tight">${resolvedName}</div>
                                <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-2">${isCollapsed ? 'Show' : 'Hide'}</span>
                            </div>
                            ${renderWidgetSubtext(q, '', effectiveMode)}
                            ${resolvedText ? `<div class="text-[10px] text-slate-400 font-medium mt-1 leading-normal whitespace-pre-wrap ${isCollapsed || effectiveMode === 'compact' ? 'hidden' : ''}">${resolvedText}</div>` : ''}
                        </div>
                    `;
                }

                item.innerHTML = innerHtml;

                if (type !== 'countdown' && type !== 'timer') {
                    wrapper.appendChild(item);
                }

                if (type === 'roller' && q.includeAdvDis) {
                    const advBtn = document.createElement('button');
                    advBtn.className = 'shrink-0 w-[3rem] h-auto self-stretch flex flex-col items-center justify-center rounded-xl transition-all border border-white/5 bg-[#020617]/40 hover:bg-[#00d4ff]/10 hover:border-[#00d4ff]/30 active:scale-95 group/adv';
                    advBtn.title = "Roll with Advantage";
                    advBtn.onclick = (e) => {
                        e.stopPropagation();
                        triggerRoll(e, { arsenalId: q.id, forcedModifier: 'ADV' });
                    };
                    advBtn.innerHTML = `
                        <span class="text-[10px] font-black text-slate-400 group-hover/adv:text-[#00d4ff] transition-colors uppercase tracking-widest">ADV</span>
                    `;

                    const disBtn = document.createElement('button');
                    disBtn.className = 'shrink-0 w-[3rem] h-auto self-stretch flex flex-col items-center justify-center rounded-xl transition-all border border-white/5 bg-[#020617]/40 hover:bg-[#6366f1]/10 hover:border-[#6366f1]/30 active:scale-95 group/dis';
                    disBtn.title = "Roll with Disadvantage";
                    disBtn.onclick = (e) => {
                        e.stopPropagation();
                        triggerRoll(e, { arsenalId: q.id, forcedModifier: 'DIS' });
                    };
                    disBtn.innerHTML = `
                        <span class="text-[10px] font-black text-slate-400 group-hover/dis:text-[#6366f1] transition-colors uppercase tracking-widest">DIS</span>
                    `;

                    wrapper.appendChild(advBtn);
                    wrapper.appendChild(disBtn);
                } else if ((type === 'roller' || type === 'number') && q.addonCounter) {
                    const c = q.addonCounter;
                    const decBtn = document.createElement('button');
                    decBtn.className = 'shrink-0 w-[3rem] h-auto self-stretch flex flex-col items-center justify-center rounded-xl transition-all border border-white/5 bg-[#020617]/40 hover:bg-white/10 active:scale-95 text-slate-400 hover:text-white text-xl font-black';
                    decBtn.onclick = (e) => {
                        e.stopPropagation();
                        changeCardCounterVal(q.id, -1);
                    };
                    decBtn.innerHTML = `−`;

                    const valDisp = document.createElement('div');
                    valDisp.className = 'shrink-0 w-[3rem] h-auto self-stretch flex flex-col items-center justify-center rounded-xl border border-white/5 bg-[#020617]/40 text-center leading-none px-1 select-none';
                    valDisp.innerHTML = `
                        <span class="text-[10px] font-black mono text-slate-200">${c.value}/${c.max}</span>
                        <span class="text-[6px] font-black text-slate-500 uppercase tracking-widest mt-0.5 truncate max-w-full">${c.label}</span>
                    `;

                    const incBtn = document.createElement('button');
                    incBtn.className = 'shrink-0 w-[3rem] h-auto self-stretch flex flex-col items-center justify-center rounded-xl transition-all border border-white/5 bg-[#020617]/40 hover:bg-white/10 active:scale-95 text-slate-400 hover:text-white text-xl font-black';
                    incBtn.onclick = (e) => {
                        e.stopPropagation();
                        changeCardCounterVal(q.id, 1);
                    };
                    incBtn.innerHTML = `+`;

                    wrapper.appendChild(decBtn);
                    wrapper.appendChild(valDisp);
                    wrapper.appendChild(incBtn);
                } else if (type === 'stepper') {
                    const resolvedMax = (typeof q.max === 'string') ? (window.getActiveCharacterVariable(q.max) ?? 100) : (q.max ?? 100);
                    const stepperControls = document.createElement('div');
                    stepperControls.className = 'shrink-0 flex items-stretch border border-white/5 bg-[#020617]/40 rounded-xl select-none self-stretch overflow-hidden';
                    stepperControls.onclick = (e) => e.stopPropagation();

                    const decBtn = document.createElement('button');
                    decBtn.className = 'w-8 flex items-center justify-center transition-all hover:bg-white/5 active:scale-95 text-[#00d4ff] hover:text-white text-lg font-black focus:outline-none';
                    decBtn.onclick = (e) => {
                        e.stopPropagation();
                        changeStepperValue(q.id, -1);
                    };
                    decBtn.innerHTML = `−`;

                    const valDisp = document.createElement('div');
                    valDisp.className = 'flex items-center justify-center border-l border-r border-white/5 px-1.5 gap-0 shadow-[inset_0_1px_4px_rgba(255,255,255,0.05)]';
                    const maxDisabled = typeof q.max === 'string' ? 'readonly disabled' : '';
                    const maxOpacity = typeof q.max === 'string' ? 'opacity-70 pointer-events-none' : '';
                    valDisp.innerHTML = `
                        <input type="number" value="${q.value}" onchange="changeStepperValueDirect('${q.id}', this.value, true)" class="w-6 bg-transparent text-center outline-none focus:text-white text-[#00d4ff] font-black tabular-nums transition-colors text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        <span class="text-slate-600 font-bold text-xs mx-0.5 opacity-60 leading-none">|</span>
                        <input type="number" value="${resolvedMax}" ${maxDisabled} onchange="changeStepperValueDirect('${q.id}', this.value, false)" class="w-6 bg-transparent text-center outline-none focus:text-white text-slate-400 font-black tabular-nums transition-colors text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${maxOpacity}">
                    `;

                    const incBtn = document.createElement('button');
                    incBtn.className = 'w-8 flex items-center justify-center transition-all hover:bg-white/5 active:scale-95 text-[#00d4ff] hover:text-white text-lg font-black focus:outline-none';
                    incBtn.onclick = (e) => {
                        e.stopPropagation();
                        changeStepperValue(q.id, 1);
                    };
                    incBtn.innerHTML = `+`;

                    stepperControls.appendChild(decBtn);
                    stepperControls.appendChild(valDisp);
                    stepperControls.appendChild(incBtn);
                    wrapper.appendChild(stepperControls);
                } else if (type === 'countdown') {
                    // Countdown widgets build their own self-contained element
                    const ctEl = buildCountdownWidget(q);
                    bindHoldListeners(ctEl);
                    wrapper.appendChild(ctEl);
                } else if (type === 'timer') {
                    const ctEl = buildTimerWidget(q);
                    bindHoldListeners(ctEl);
                    wrapper.appendChild(ctEl);
                }


                const otherGroups = filtered.length > 0 ? groups.filter(g => g.characterId === activeCharacterId && g.id !== activeGroupId) : [];
                const moveGroupHtml = otherGroups.length > 0 ? `
                    <div class="h-px bg-white/5 my-1"></div>
                    <button onclick="moveQueueToGroup('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-sky-400"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                        <span>Move to Group</span>
                    </button>
                ` : '';

                const editLoadoutButtonHtml = (type === 'roller' || (type === 'number' && q.unifiedQueue && q.unifiedQueue.length > 0)) ? `
                    <button onclick="loadQueue('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-sky-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        <span>Edit Loadout</span>
                    </button>
                    <button onclick="updateSavedQueue('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-sky-400"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        <span>Overwrite</span>
                    </button>
                ` : '';

                const timerIsPaused = type === 'timer' ? (q.isPaused !== false) : true;
                const resetTimerMenuItemHtml = type === 'timer' ? `
                    <button onclick="toggleTimerPlay('${q.id}', event)" class="menu-item menu-timer-play-btn">
                        ${timerIsPaused
                            ? `<svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-emerald-400"><path d="M8 5v14l11-7z"/></svg>`
                            : `<svg viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-amber-400"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
                        }
                        <span>${timerIsPaused ? 'Start Timer' : 'Pause Timer'}</span>
                    </button>
                    <button onclick="resetTimerWidget('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-[#94a3b8]"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        <span>Reset Timer</span>
                    </button>
                ` : '';

                const menuContainer = document.createElement('div');
                menuContainer.id = `menu-${q.id}`;
                menuContainer.className = 'arsenal-menu absolute right-2 top-12 hidden';
                menuContainer.style.zIndex = '100';
                menuContainer.innerHTML = `
                    <button onclick="configureSavedWidget('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-[#94a3b8]"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        <span>Configure</span>
                    </button>
                    ${resetTimerMenuItemHtml}
                    ${editLoadoutButtonHtml}
                    <button onclick="openColorPicker('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-[#94a3b8]"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.941.732-1.688 1.688-1.688h1.906c2.327 0 4.625-1.811 4.625-4.125C21 5.438 17.438 2 12 2z"/></svg>
                        <span>Appearance</span>
                    </button>
                    <button onclick="duplicateWidget('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-[#94a3b8]"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>Duplicate</span>
                    </button>
                    <button onclick="toggleWidgetHiddenState('${q.id}', event)" class="menu-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-[#94a3b8]">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                        <span>${q.hidden ? 'Show Widget' : 'Hide Widget'}</span>
                    </button>
                    ${moveGroupHtml}
                    <div class="h-px bg-white/5 my-1"></div>
                    <button onclick="deleteQueue('${q.id}', event)" class="menu-item danger">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-rose-500"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        <span>Delete</span>
                    </button>
                `;

                wrapper.appendChild(menuContainer);
                list.appendChild(wrapper);
            });
        }
        function renderChainProgress(steps, scrambleVal, currentName, currentColor) {
            const container = document.getElementById('chain-cascade-container');
            const hero = document.getElementById('result-hero');
            const label = document.getElementById('result-label');
            const badges = document.getElementById('result-badges');
            const breakdown = document.getElementById('result-breakdown');

            // Hide standard outputs
            hero.classList.add('hidden');
            label.classList.add('hidden');
            badges.classList.add('hidden');
            breakdown.classList.add('hidden');
            container.classList.remove('hidden');

            let html = '';

            // Render resolved steps
            steps.forEach(step => {
                const stepColor = step.color || '#00d4ff';
                const badgesHtml = step.result.badges && step.result.badges.length > 0 ? `
                    <div class="flex gap-1.5 flex-wrap">
                        ${step.result.badges.map(b => `<span class="result-badge scale-75 text-[9px] py-0.5 px-1.5 rounded-full badge-${b.color}">${b.icon} ${b.text}</span>`).join('')}
                    </div>` : '';

                const labelsHtml = step.result.labels && step.result.labels.length > 0 ? `
                    <div class="text-[10px] font-black uppercase tracking-wider flex flex-col gap-0.5 mt-1">
                        ${step.result.labels.map(l => `<span class="text-${l.color}-400">${l.text}</span>`).join('')}
                    </div>` : '';

                html += `
                    <div class="bg-slate-900/40 p-3 rounded-xl border border-white/5 relative overflow-hidden flex flex-col gap-1 text-left"
                         style="animation: menu-pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)">
                        <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${stepColor}"></div>
                        <div class="pl-3.5 flex items-center justify-between">
                            <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${step.name}</span>
                            ${badgesHtml}
                        </div>
                        <div class="pl-3.5 flex items-baseline justify-between mt-1">
                            <span class="text-3xl font-black tabular-nums tracking-tighter text-[#e2e8f0]">${step.result.total}</span>
                            <span class="text-[10px] mono text-slate-400 font-bold">${step.result.flatDescription}</span>
                        </div>
                        <div class="pl-3.5">
                            ${labelsHtml}
                        </div>
                    </div>
                `;
            });

            // Render current scrambling step
            if (currentName) {
                html += `
                    <div class="bg-slate-900/40 p-3 rounded-xl border border-[#00d4ff]/10 relative overflow-hidden flex flex-col gap-1 text-left animate-pulse">
                        <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${currentColor}"></div>
                        <div class="pl-3.5 flex items-center justify-between">
                            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${currentName}</span>
                            <span class="text-[9px] font-black text-sky-400 uppercase tracking-wider animate-bounce">ROLLING...</span>
                        </div>
                        <div class="pl-3.5 flex items-baseline justify-between mt-1">
                            <span class="text-3xl font-black tabular-nums tracking-tighter text-[#e2e8f0]/40">${scrambleVal}</span>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = html;

            // Auto scroll container to bottom
            container.scrollTop = container.scrollHeight;
        }
        function renderChainFinal(steps, haltReason = null, haltColor = null) {
            renderChainProgress(steps, null, null, null);

            const container = document.getElementById('chain-cascade-container');

            if (haltReason) {
                const borderClr = haltColor === 'rose' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)';
                const textClr = haltColor === 'rose' ? 'text-rose-400' : 'text-amber-400';

                container.innerHTML += `
                    <div class="p-3 rounded-xl border border-dashed flex flex-col items-center justify-center text-center gap-1"
                         style="border-color: ${borderClr}; background: rgba(244, 63, 94, 0.02); animation: menu-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)">
                        <span class="text-[10px] font-black uppercase tracking-widest ${textClr}">${haltReason}</span>
                        <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">CHAIN TERMINATED PREMATURELY</span>
                    </div>
                `;
            } else {
                // Render a beautiful consolidated yield tag if there's more than 1 step!
                if (steps.length > 1) {
                    const finalTotal = steps.length > 0 ? steps[steps.length - 1].result.total : 0;
                    container.innerHTML += `
                        <div class="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between px-4"
                             style="animation: menu-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)">
                            <span class="text-[10px] font-black text-emerald-400 uppercase tracking-widest">FINAL OUTCOME</span>
                            <span class="text-2xl font-black text-emerald-400 tabular-nums tracking-tighter">${finalTotal}</span>
                        </div>
                    `;
                }
            }

            container.scrollTop = container.scrollHeight;
        }
