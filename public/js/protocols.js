class ProtocolSystem {
    constructor() {
        this.currentPhase = 0;
        this.pendingLevel = 0;
        
        this.settings = {
            radioChannel: 'CANAL 5 (Frequência 462.5625)',
            radioContact: 'Supervisor de Turno',
            forceRadio: false,
            simulateFailure: false
        };
        
        this.init();
    }

    init() {
        this.loadSettings();
        this.restoreState(); // RECUPERA O ESTADO AO INICIAR
        this.setupListeners();
    }

    setupListeners() {
        const check = document.getElementById('radio-confirmed-check');
        if(check) {
            check.addEventListener('change', (e) => {
                const btn = document.getElementById('btn-confirm-radio');
                if(btn) btn.disabled = !e.target.checked;
            });
        }
        document.getElementById('cancel-trigger')?.addEventListener('click', () => this.closeModal());
        document.getElementById('close-confirm-modal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('btn-do-trigger')?.addEventListener('click', () => this.executeTrigger());
    }

    // --- PERSISTÊNCIA DE ESTADO (NOVO) ---
    saveState(level) {
        localStorage.setItem('belfire_protocol_active', level);
    }

    restoreState() {
        const savedLevel = localStorage.getItem('belfire_protocol_active');
        if (savedLevel && parseInt(savedLevel) > 0) {
            console.log("Restaurando protocolo nível:", savedLevel);
            // Pequeno delay para garantir que o DOM renderizou
            setTimeout(() => this.activateUI(parseInt(savedLevel)), 100);
        }
    }

    clearState() {
        localStorage.removeItem('belfire_protocol_active');
    }

    // --- CONFIGURAÇÕES ---
    loadSettings() {
        const saved = localStorage.getItem('belfire_protocol_settings');
        if (saved) this.settings = JSON.parse(saved);
        
        const el = document.getElementById('conf-channel');
        if(el) {
            el.value = this.settings.radioChannel;
            document.getElementById('conf-contact').value = this.settings.radioContact;
            document.getElementById('conf-force-radio').checked = this.settings.forceRadio;
            document.getElementById('conf-sim-fail').checked = this.settings.simulateFailure;
        }
    }

    saveSettings() {
        this.settings = {
            radioChannel: document.getElementById('conf-channel').value,
            radioContact: document.getElementById('conf-contact').value,
            forceRadio: document.getElementById('conf-force-radio').checked,
            simulateFailure: document.getElementById('conf-sim-fail').checked
        };
        localStorage.setItem('belfire_protocol_settings', JSON.stringify(this.settings));
        this.closeSettings();
    }

    openSettings() { this.loadSettings(); document.getElementById('settings-modal').classList.add('active'); }
    closeSettings() { document.getElementById('settings-modal').classList.remove('active'); }

    // --- ACIONAMENTO ---
    confirmTrigger(level) {
        this.pendingLevel = level;
        document.getElementById('modal-level-num').textContent = level;
        document.getElementById('confirm-modal').classList.add('active');
    }

    closeModal() {
        document.getElementById('confirm-modal').classList.remove('active');
        this.pendingLevel = 0;
    }

    async executeTrigger() {
        const level = this.pendingLevel;
        this.closeModal();

        try {
            if (this.settings.simulateFailure) throw new Error("Falha simulada");

            const response = await fetch('/api/v1/emergency/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase: level, user: 'Operador Web' })
            });

            if (response.ok) {
                if (this.settings.forceRadio) {
                    this.openRadioConfirmation(level);
                } else {
                    this.activateUI(level);
                }
            } else {
                throw new Error("Erro API");
            }
        } catch (error) {
            this.openRadioConfirmation(level);
        }
    }

    openRadioConfirmation(level) {
        document.getElementById('radio-channel-display').textContent = this.settings.radioChannel;
        document.getElementById('radio-contact-display').textContent = this.settings.radioContact;
        document.getElementById('radio-level-display').textContent = level;
        
        const check = document.getElementById('radio-confirmed-check');
        const btn = document.getElementById('btn-confirm-radio');
        check.checked = false;
        btn.disabled = true;

        document.getElementById('radio-modal').classList.add('active');
    }

    async confirmRadioAction() {
        try { await fetch('/api/v1/webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: "CONFIRMAÇÃO RÁDIO", url: "Local", details: `Nível ${this.pendingLevel} confirmado verbalmente.` }) }); } catch(e) {}

        this.activateUI(this.pendingLevel);
        document.getElementById('radio-modal').classList.remove('active');
    }

    closeRadioModal() { document.getElementById('radio-modal').classList.remove('active'); }

    // --- LÓGICA VISUAL ---
    activateUI(level) {
        this.currentPhase = level;
        this.saveState(level); // SALVA O PROGRESSO
        
        const banner = document.getElementById('active-protocol-banner');
        if(banner) {
            banner.style.display = 'flex';
            document.getElementById('banner-phase').textContent = `NÍVEL ${level}`;
        }

        document.querySelectorAll('.phase-card').forEach(card => {
            const phase = parseInt(card.dataset.phase);
            const originalBtn = card.querySelector('.btn-activate');
            
            const oldControls = card.querySelector('.flow-controls');
            if(oldControls) oldControls.remove();

            card.classList.remove('active', 'completed');
            if(originalBtn) originalBtn.style.display = 'flex';

            if (phase < level) {
                card.classList.add('completed');
                if(originalBtn) originalBtn.style.display = 'none';
            
            } else if (phase === level) {
                card.classList.add('active');
                if(originalBtn) originalBtn.style.display = 'none';

                const nextLevel = level + 1;
                const escalateHtml = level < 4 
                    ? `<button class="btn-escalate" onclick="protocolSystem.confirmTrigger(${nextLevel})">
                         <i class="fas fa-arrow-up"></i> ESCALAR PARA NÍVEL ${nextLevel}
                       </button>` 
                    : '';

                const controlsHtml = `
                    <div class="flow-controls">
                        <div style="text-align:center; color:#f59e0b; font-size:12px; margin-bottom:5px; font-weight:bold; letter-spacing:1px;">
                            <i class="fas fa-spinner fa-spin"></i> EM ANDAMENTO
                        </div>
                        ${escalateHtml}
                        <button class="btn-resolve" onclick="protocolSystem.resetProtocol()">
                            <i class="fas fa-check-circle"></i> OCORRÊNCIA RESOLVIDA
                        </button>
                    </div>
                `;
                card.insertAdjacentHTML('beforeend', controlsHtml);
            }
        });

        const painel = document.getElementById('fire-integration-ui');
        if(painel) painel.style.display = (level === 4) ? 'block' : 'none';
    }

    resetProtocol() {
        if(!confirm("Tem certeza que a situação está controlada e deseja encerrar o protocolo?")) return;
        
        this.currentPhase = 0;
        this.clearState(); // LIMPA A MEMÓRIA
        
        document.getElementById('active-protocol-banner').style.display = 'none';
        
        document.querySelectorAll('.phase-card').forEach(card => {
            card.classList.remove('active', 'completed');
            const btn = card.querySelector('.btn-activate');
            if(btn) btn.style.display = 'flex';
            
            const controls = card.querySelector('.flow-controls');
            if(controls) controls.remove();
        });
        
        const painel = document.getElementById('fire-integration-ui');
        if(painel) painel.style.display = 'none';
        
        alert("Protocolo encerrado. Sistema retornando ao monitoramento padrão.");
    }
}

window.protocolSystem = new ProtocolSystem();