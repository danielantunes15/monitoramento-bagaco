class SettingsManager {
    constructor() {
        this.init();
    }

    init() {
        this.loadWebhooks();
        this.loadLogs();
        this.loadServerHealth(); // Chama o monitor de saúde
        
        // Atualiza a saúde a cada 10 segundos
        setInterval(() => this.loadServerHealth(), 10000);
        
        this.setupListeners();
    }

    setupListeners() {
        document.getElementById('btn-add-webhook').addEventListener('click', () => this.addWebhook());
    }

    // --- HEALTH MONITOR (NOVO) ---
    async loadServerHealth() {
        try {
            const res = await fetch('/api/v1/health');
            const data = await res.json();
            
            document.getElementById('sys-uptime').textContent = data.uptime;
            document.getElementById('sys-memory').textContent = data.memory_usage;
            document.getElementById('sys-mqtt').textContent = data.mqtt_status;
            document.getElementById('sys-clients').textContent = data.active_connections;

            // Muda cor do status MQTT
            const mqttEl = document.getElementById('sys-mqtt');
            mqttEl.style.color = data.mqtt_status === 'Conectado' ? '#10b981' : '#ef4444';
        } catch (error) {
            console.error('Erro health check:', error);
        }
    }

    // --- LOGS ---
    async loadLogs() {
        try {
            const res = await fetch('/api/v1/logs');
            const logs = await res.json();
            this.renderLogs(logs);
        } catch (e) {}
    }

    renderLogs(logs) {
        const tbody = document.getElementById('logs-table-body');
        tbody.innerHTML = '';
        if (logs.length === 0) { tbody.innerHTML = '<tr><td colspan="4">Vazio.</td></tr>'; return; }
        
        logs.forEach(log => {
            let color = '#6b7280';
            if(log.action.includes('ALERT')) color = '#ef4444'; // Vermelho para alertas
            if(log.action.includes('TRIGGERED')) color = '#f59e0b'; // Laranja para IA preditiva
            
            const row = `<tr>
                <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
                <td><span style="background:${color}; padding:2px 6px; border-radius:4px; color:white; font-size:10px">${log.action}</span></td>
                <td>${log.user}</td>
                <td>${log.details}</td>
            </tr>`;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    }

    // --- WEBHOOKS ---
    async loadWebhooks() {
        try {
            const res = await fetch('/api/v1/webhooks');
            const data = await res.json();
            this.renderWebhookList(data);
        } catch (e) {}
    }

    async addWebhook() {
        const name = document.getElementById('wh-name').value;
        const url = document.getElementById('wh-url').value;
        if (!name || !url) return alert('Preencha tudo');
        
        await fetch('/api/v1/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url, events: ['critical', 'prediction'] })
        });
        
        document.getElementById('wh-name').value = '';
        document.getElementById('wh-url').value = '';
        this.loadWebhooks();
    }

    async deleteWebhook(id) {
        if(!confirm('Deletar?')) return;
        await fetch(`/api/v1/webhooks/${id}`, { method: 'DELETE' });
        this.loadWebhooks();
    }

    renderWebhookList(webhooks) {
        const list = document.getElementById('webhooks-list');
        list.innerHTML = '';
        webhooks.forEach(wh => {
            list.insertAdjacentHTML('beforeend', `
                <div class="webhook-item">
                    <div class="wh-info"><span class="wh-name">${wh.name}</span><span class="wh-url">${wh.url}</span></div>
                    <button class="btn-sm btn-danger" onclick="settingsManager.deleteWebhook(${wh.id})"><i class="fas fa-trash"></i></button>
                </div>
            `);
        });
    }
}

window.settingsManager = new SettingsManager();