class SettingsManager {
    constructor() {
        this.apiUrl = '/api/v1/webhooks';
        this.logsUrl = '/api/v1/logs';
        this.init();
    }

    init() {
        this.loadWebhooks();
        this.loadLogs(); // Carrega os logs ao iniciar
        this.setupListeners();
    }

    setupListeners() {
        document.getElementById('btn-add-webhook').addEventListener('click', () => this.addWebhook());
    }

    // --- LOGS ---
    async loadLogs() {
        try {
            const res = await fetch(this.logsUrl);
            const logs = await res.json();
            this.renderLogs(logs);
        } catch (error) {
            console.error('Erro ao carregar logs:', error);
        }
    }

    renderLogs(logs) {
        const tbody = document.getElementById('logs-table-body');
        tbody.innerHTML = '';

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Nenhum registro encontrado.</td></tr>';
            return;
        }

        logs.forEach(log => {
            const date = new Date(log.timestamp).toLocaleString();
            
            // Cores para as tags de ação
            let color = '#6b7280';
            if(log.action.includes('ALERT')) color = '#ef4444';
            if(log.action.includes('EXPORT')) color = '#10b981';
            if(log.action.includes('CONFIG')) color = '#f59e0b';

            const row = `
                <tr>
                    <td style="color:var(--text-secondary)">${date}</td>
                    <td><span style="background:${color}; padding:2px 6px; border-radius:4px; color:white; font-size:10px">${log.action}</span></td>
                    <td style="font-weight:600">${log.user}</td>
                    <td>${log.details}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    }

    // --- WEBHOOKS (Lógica anterior mantida) ---
    async loadWebhooks() {
        try {
            const res = await fetch(this.apiUrl);
            const data = await res.json();
            this.renderWebhookList(data);
        } catch (error) { console.error(error); }
    }

    async addWebhook() {
        const name = document.getElementById('wh-name').value;
        const url = document.getElementById('wh-url').value;
        if (!name || !url) return alert('Preencha os campos!');

        await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url, events: ['critical'] })
        });
        
        document.getElementById('wh-name').value = '';
        document.getElementById('wh-url').value = '';
        this.loadWebhooks();
        alert('Webhook adicionado!');
    }

    async deleteWebhook(id) {
        if (!confirm('Remover?')) return;
        await fetch(`${this.apiUrl}/${id}`, { method: 'DELETE' });
        this.loadWebhooks();
    }

    renderWebhookList(webhooks) {
        const list = document.getElementById('webhooks-list');
        list.innerHTML = '';
        if (webhooks.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:10px; color:#666">Nada configurado.</div>';
            return;
        }
        webhooks.forEach(wh => {
            const item = `
                <div class="webhook-item">
                    <div class="wh-info">
                        <span class="wh-name">${wh.name}</span>
                        <span class="wh-url">${wh.url}</span>
                    </div>
                    <button class="btn-sm btn-danger" onclick="settingsManager.deleteWebhook(${wh.id})"><i class="fas fa-trash"></i></button>
                </div>`;
            list.insertAdjacentHTML('beforeend', item);
        });
    }
}

window.settingsManager = new SettingsManager();