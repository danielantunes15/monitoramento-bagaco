class SettingsManager {
    constructor() {
        this.apiUrl = '/api/v1/webhooks';
        this.init();
    }

    init() {
        this.loadWebhooks();
        this.setupListeners();
    }

    setupListeners() {
        document.getElementById('btn-add-webhook').addEventListener('click', () => this.addWebhook());
    }

    async loadWebhooks() {
        try {
            const res = await fetch(this.apiUrl);
            const data = await res.json();
            this.renderList(data);
        } catch (error) {
            console.error('Erro ao carregar webhooks:', error);
        }
    }

    async addWebhook() {
        const nameInput = document.getElementById('wh-name');
        const urlInput = document.getElementById('wh-url');
        const critCheck = document.getElementById('evt-critical');
        const warnCheck = document.getElementById('evt-warning');

        if (!nameInput.value || !urlInput.value) {
            alert('Por favor, preencha o nome e a URL.');
            return;
        }

        const events = [];
        if (critCheck.checked) events.push('critical');
        if (warnCheck.checked) events.push('warning');

        try {
            const res = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: nameInput.value,
                    url: urlInput.value,
                    events: events
                })
            });

            if (res.ok) {
                // Limpar form e recarregar
                nameInput.value = '';
                urlInput.value = '';
                this.loadWebhooks();
                alert('Integração adicionada com sucesso!');
            } else {
                alert('Erro ao salvar webhook.');
            }
        } catch (error) {
            console.error('Erro:', error);
        }
    }

    async deleteWebhook(id) {
        if (!confirm('Tem certeza que deseja remover esta integração?')) return;
        
        try {
            await fetch(`${this.apiUrl}/${id}`, { method: 'DELETE' });
            this.loadWebhooks();
        } catch (error) {
            console.error('Erro ao deletar:', error);
        }
    }

    async testWebhook(url) {
        try {
            alert('Enviando disparo de teste...');
            const res = await fetch(`${this.apiUrl}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            
            const data = await res.json();
            if(data.success) alert('Teste enviado com sucesso! Verifique o outro software.');
            else alert('Falha no teste: ' + data.error);
        } catch (error) {
            alert('Erro de conexão ao testar.');
        }
    }

    renderList(webhooks) {
        const list = document.getElementById('webhooks-list');
        list.innerHTML = '';

        if (webhooks.length === 0) {
            list.innerHTML = '<div class="empty-state" style="text-align:center; padding:20px; color:#666;">Nenhuma integração ativa.</div>';
            return;
        }

        webhooks.forEach(wh => {
            const item = document.createElement('div');
            item.className = 'webhook-item';
            
            // Badges de eventos
            const badges = wh.events.map(e => {
                const color = e === 'critical' ? '#ef4444' : '#f59e0b';
                return `<span style="color:${color}; border-color:${color}40">${e.toUpperCase()}</span>`;
            }).join(' ');

            item.innerHTML = `
                <div class="wh-info">
                    <span class="wh-name">${wh.name}</span>
                    <span class="wh-url">${wh.url}</span>
                    <div class="wh-badges">${badges}</div>
                </div>
                <div class="wh-actions">
                    <button class="btn-sm btn-outline" onclick="settingsManager.testWebhook('${wh.url}')">
                        <i class="fas fa-paper-plane"></i> Testar
                    </button>
                    <button class="btn-sm btn-danger" onclick="settingsManager.deleteWebhook(${wh.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
    }
}

// Inicializa globalmente para os botões inline funcionarem
window.settingsManager = new SettingsManager();