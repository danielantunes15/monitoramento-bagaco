class ProtocolSystem {
    constructor() {
        this.currentPhase = 0;
        this.pendingLevel = 0;
        
        // Configurações Padrão
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
        this.setupListeners();
        console.log("Sistema de Protocolos Iniciado");
    }

    setupListeners() {
        // Listener da Checkbox do Rádio (CORREÇÃO DO PROBLEMA)
        const check = document.getElementById('radio-confirmed-check');
        if(check) {
            check.addEventListener('change', (e) => {
                const btn = document.getElementById('btn-confirm-radio');
                if(btn) btn.disabled = !e.target.checked;
            });
        }

        // Listeners dos Modais
        document.getElementById('cancel-trigger')?.addEventListener('click', () => this.closeModal());
        document.getElementById('close-confirm-modal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('btn-do-trigger')?.addEventListener('click', () => this.executeTrigger());
    }

    // --- LOGICA DE CONFIGURAÇÕES ---
    loadSettings() {
        const saved = localStorage.getItem('belfire_protocol_settings');
        if (saved) {
            this.settings = JSON.parse(saved);
        }
        // Aplica nos inputs se o modal estiver aberto ou existirem
        const elChannel = document.getElementById('conf-channel');
        if(elChannel) {
            elChannel.value = this.settings.radioChannel;
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
        alert('Configurações salvas!');
    }

    openSettings() {
        this.loadSettings(); 
        document.getElementById('settings-modal').classList.add('active');
    }

    closeSettings() {
        document.getElementById('settings-modal').classList.remove('active');
    }

    // --- LOGICA DE ACIONAMENTO (Início) ---
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

        // 1. Tenta acionar via API
        try {
            // Verifica simulação de falha
            if (this.settings.simulateFailure) {
                throw new Error("Falha simulada de rede");
            }

            const response = await fetch('/api/v1/emergency/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase: level, user: 'Operador Web' })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Se a configuração exigir rádio SEMPRE, abre o modal mesmo com sucesso
                if (this.settings.forceRadio) {
                    this.openRadioConfirmation(level);
                } else {
                    this.activateUI(level);
                    alert(`SUCESSO: ${data.message}`);
                }
            } else {
                throw new Error("Erro na API");
            }

        } catch (error) {
            console.warn("Falha de conexão ou erro API:", error);
            // 2. Falha detectada -> Abre Protocolo de Rádio
            this.openRadioConfirmation(level);
        }
    }

    // --- LOGICA DE RÁDIO ---
    openRadioConfirmation(level) {
        // Preenche os dados
        document.getElementById('radio-channel-display').textContent = this.settings.radioChannel;
        document.getElementById('radio-contact-display').textContent = this.settings.radioContact;
        document.getElementById('radio-level-display').textContent = level;
        
        // Reseta o checkbox e trava o botão
        const check = document.getElementById('radio-confirmed-check');
        const btn = document.getElementById('btn-confirm-radio');
        
        check.checked = false;
        btn.disabled = true;

        document.getElementById('radio-modal').classList.add('active');
    }

    async confirmRadioAction() {
        // Registra a ação manual
        try {
            await fetch('/api/v1/webhooks', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: "CONFIRMAÇÃO RÁDIO",
                    url: "Local",
                    details: `Protocolo Nível ${this.pendingLevel} confirmado verbalmente pelo Operador.`
                })
            });
        } catch(e) { console.log("Log local (offline)."); }

        this.activateUI(this.pendingLevel);
        this.closeRadioModal();
        alert("Confirmação via Rádio Registrada. Protocolo Ativo.");
    }

    closeRadioModal() {
        document.getElementById('radio-modal').classList.remove('active');
    }

    // --- UI ATUALIZAÇÃO ---
    activateUI(level) {
        this.currentPhase = level;
        
        // Mostra banner
        const banner = document.getElementById('active-protocol-banner');
        if(banner) {
            banner.style.display = 'flex';
            document.getElementById('banner-phase').textContent = `NÍVEL ${level}`;
        }

        // Destaca o card
        document.querySelectorAll('.phase-card').forEach(card => {
            card.classList.remove('active');
            // Marca anteriores como completados
            if (parseInt(card.dataset.phase) < level) {
                card.classList.add('completed');
            }
        });
        
        // Ativa o card atual
        const current = document.querySelector(`.phase-card[data-phase="${level}"]`);
        if(current) current.classList.add('active');

        // Se for fase 4, mostra integração bombeiros
        if (level === 4) {
            const painel = document.getElementById('fire-integration-ui');
            if(painel) painel.style.display = 'block';
        }
    }

    resetProtocol() {
        if(!confirm("Tem certeza que deseja encerrar o protocolo de emergência?")) return;
        
        this.currentPhase = 0;
        document.getElementById('active-protocol-banner').style.display = 'none';
        document.querySelectorAll('.phase-card').forEach(card => {
            card.classList.remove('active', 'completed');
        });
        document.getElementById('fire-integration-ui').style.display = 'none';
    }
}

// Inicializa a instância Global
window.protocolSystem = new ProtocolSystem();