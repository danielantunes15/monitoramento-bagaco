class ProtocolSystem {
    constructor() {
        this.currentPhase = 0;
        this.pendingLevel = 0;
        
        // Estrutura de Contatos (Mapeia ID do Input -> Nome Exibido)
        this.contactsMap = {
            1: [
                { id: 'link-sup', name: 'Supervisor Ind.', icon: 'fa-user-hard-hat' },
                { id: 'link-tst', name: 'Técnico TST', icon: 'fa-user-shield' }
            ],
            2: [
                { id: 'link-brigada-lider', name: 'Líder Brigada', icon: 'fa-fire-extinguisher' },
                { id: 'link-brigada-team', name: 'Equipe Brigada', icon: 'fa-users' }
            ],
            3: [
                { id: 'link-dir', name: 'Diretoria BEL', icon: 'fa-user-tie' },
                { id: 'link-lid', name: 'Liderança', icon: 'fa-user-friends' },
                { id: 'link-ssma', name: 'Coord. SSMA', icon: 'fa-helmet-safety' }
            ],
            4: [
                { id: 'link-cbm', name: 'Bombeiros (193)', icon: 'fa-truck-medical' },
                { id: 'link-pam', name: 'PAM (Auxílio)', icon: 'fa-hands-helping' }
            ]
        };

        // Links padrão (exemplo)
        this.links = {
            'link-sup': '101', 'link-tst': '102',
            'link-brigada-lider': '201', 'link-brigada-team': '200',
            'link-dir': '300', 'link-lid': '301', 'link-ssma': '302',
            'link-cbm': '193', 'link-pam': '0800-PAM'
        };

        this.settings = { radioChannel: 'CANAL 5', simulateFailure: false };
        this.init();
    }

    init() {
        this.loadSettings();
        this.renderAllContacts(); // Renderiza a lista inicial
        this.restoreState();
        this.setupListeners();
    }

    // --- RENDERIZAÇÃO DE CONTATOS ---
    renderAllContacts() {
        for (let level = 1; level <= 4; level++) {
            const container = document.getElementById(`contacts-${level}`);
            if (!container) continue;
            container.innerHTML = ''; // Limpa

            const contacts = this.contactsMap[level];
            contacts.forEach(contact => {
                const link = this.links[contact.id] || '#';
                const hasLink = link && link !== '#';
                
                // HTML do item de contato
                const html = `
                    <div class="contact-row">
                        <div class="contact-info">
                            <i class="fas ${contact.icon}"></i> ${contact.name}
                        </div>
                        ${hasLink ? `
                        <button class="btn-call-mini" onclick="protocolSystem.call3CX('${link}')">
                            <i class="fas fa-phone"></i> Ligar
                        </button>
                        ` : '<span style="font-size:10px; opacity:0.5">Sem link</span>'}
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
            });
        }
    }

    call3CX(destination) {
        // Lógica de discagem inteligente
        if (destination.startsWith('http')) {
            window.open(destination, '_blank');
        } else {
            // Se for número curto, tenta tel: ou formato customizado 3CX se tiver
            window.location.href = `tel:${destination}`;
            // Alternativa: window.open(`https://seupabx.3cx.br/webclient/#/call?phone=${destination}`, '_blank');
        }
    }

    // --- CONFIGURAÇÕES ---
    loadSettings() {
        const savedLinks = localStorage.getItem('belfire_3cx_links');
        if (savedLinks) this.links = JSON.parse(savedLinks);

        const savedSettings = localStorage.getItem('belfire_protocol_settings');
        if (savedSettings) this.settings = JSON.parse(savedSettings);

        // Popula Inputs
        Object.keys(this.links).forEach(key => {
            const el = document.getElementById(key);
            if(el) el.value = this.links[key];
        });
        
        const elRadio = document.getElementById('conf-radio-channel');
        if(elRadio) elRadio.value = this.settings.radioChannel;
        const elSim = document.getElementById('conf-sim-fail');
        if(elSim) elSim.checked = this.settings.simulateFailure;
    }

    saveSettings() {
        // Salva Links
        Object.keys(this.links).forEach(key => {
            const el = document.getElementById(key);
            if(el) this.links[key] = el.value;
        });
        localStorage.setItem('belfire_3cx_links', JSON.stringify(this.links));

        // Salva Configs Gerais
        this.settings.radioChannel = document.getElementById('conf-radio-channel').value;
        this.settings.simulateFailure = document.getElementById('conf-sim-fail').checked;
        localStorage.setItem('belfire_protocol_settings', JSON.stringify(this.settings));

        this.renderAllContacts(); // Atualiza a tela com novos links
        this.closeSettings();
        alert("Contatos atualizados!");
    }

    // --- PADRÃO (LISTENERS, STATE, ACIONAMENTO) ---
    setupListeners() {
        document.getElementById('cancel-trigger')?.addEventListener('click', () => this.closeModal());
        document.getElementById('close-confirm-modal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('btn-do-trigger')?.addEventListener('click', () => this.executeTrigger());
        
        const check = document.getElementById('radio-confirmed-check');
        if(check) check.addEventListener('change', (e) => document.getElementById('btn-confirm-radio').disabled = !e.target.checked);
    }
    
    openSettings() { this.loadSettings(); document.getElementById('settings-modal').classList.add('active'); }
    closeSettings() { document.getElementById('settings-modal').classList.remove('active'); }
    
    saveState(level) { localStorage.setItem('belfire_protocol_active', level); }
    restoreState() { 
        const lvl = localStorage.getItem('belfire_protocol_active'); 
        if(lvl > 0) setTimeout(() => this.activateUI(parseInt(lvl)), 100); 
    }
    clearState() { localStorage.removeItem('belfire_protocol_active'); }

    confirmTrigger(level) {
        this.pendingLevel = level;
        document.getElementById('modal-level-num').textContent = level;
        document.getElementById('confirm-modal').classList.add('active');
    }
    closeModal() { document.getElementById('confirm-modal').classList.remove('active'); }

    async executeTrigger() {
        const level = this.pendingLevel;
        this.closeModal();
        try {
            if (this.settings.simulateFailure) throw new Error("Simulação Falha");
            await fetch('/api/v1/emergency/trigger', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({phase:level})});
            this.activateUI(level);
        } catch(e) {
            this.openRadioConfirmation(level);
        }
    }

    openRadioConfirmation(level) {
        document.getElementById('radio-channel-display').textContent = this.settings.radioChannel;
        document.getElementById('radio-modal').classList.add('active');
    }
    async confirmRadioAction() {
        this.activateUI(this.pendingLevel);
        document.getElementById('radio-modal').classList.remove('active');
    }
    closeRadioModal() { document.getElementById('radio-modal').classList.remove('active'); }

    activateUI(level) {
        this.currentPhase = level;
        this.saveState(level);
        
        const banner = document.getElementById('active-protocol-banner');
        banner.style.display = 'flex';
        document.getElementById('banner-phase').textContent = `NÍVEL ${level}`;

        document.querySelectorAll('.phase-card').forEach(card => {
            const phase = parseInt(card.dataset.phase);
            const btn = card.querySelector('.btn-activate');
            const flow = card.querySelector('.flow-controls');
            if(flow) flow.remove();
            
            card.classList.remove('active', 'completed');
            if(btn) btn.style.display = 'flex';

            if (phase < level) {
                card.classList.add('completed');
                if(btn) btn.style.display = 'none';
            } else if (phase === level) {
                card.classList.add('active');
                if(btn) btn.style.display = 'none';
                
                const next = level + 1;
                const escBtn = level < 4 ? `<button class="btn-escalate" onclick="protocolSystem.confirmTrigger(${next})">ESCALAR NIVEL ${next}</button>` : '';
                
                card.insertAdjacentHTML('beforeend', `
                    <div class="flow-controls">
                        <div style="text-align:center; color:#f59e0b; font-size:12px; font-weight:bold;">EM ANDAMENTO</div>
                        ${escBtn}
                        <button class="btn-resolve" onclick="protocolSystem.resetProtocol()">RESOLVIDO</button>
                    </div>
                `);
            }
        });
        
        const fireUi = document.getElementById('fire-integration-ui');
        if(fireUi) fireUi.style.display = level === 4 ? 'block' : 'none';
    }

    resetProtocol() {
        if(!confirm("Encerrar?")) return;
        this.clearState();
        location.reload(); // Maneira mais limpa de resetar visualmente
    }
}

window.protocolSystem = new ProtocolSystem();