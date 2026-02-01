class SettingsManager {
    constructor() {
        this.init();
    }

    init() {
        this.loadWebhooks();
        this.loadLogs();
        this.loadServerHealth();
        this.loadDevices(); 
        
        setInterval(() => this.loadServerHealth(), 10000);
        
        const btnWebhook = document.getElementById('btn-add-webhook');
        if(btnWebhook) btnWebhook.addEventListener('click', () => this.addWebhook());
    }

    switchTab(tabName) {
        document.getElementById('tab-cameras').style.display = tabName === 'cameras' ? 'block' : 'none';
        document.getElementById('tab-sensors').style.display = tabName === 'sensors' ? 'block' : 'none';
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.textContent.toLowerCase().includes(tabName === 'cameras' ? 'câmeras' : 'sensores');
            btn.style.borderBottom = isActive ? '2px solid var(--accent-color)' : 'none';
            btn.style.color = isActive ? 'var(--text-primary)' : 'var(--text-secondary)';
        });
    }

    // --- DISPOSITIVOS (SUPABASE) ---
    async loadDevices() {
        try {
            const [resCam, resSens] = await Promise.all([
                fetch('/api/v1/cameras'),
                fetch('/api/v1/sensors')
            ]);
            const cameras = await resCam.json();
            const sensors = await resSens.json();
            
            this.renderCameras(cameras);
            this.renderSensors(sensors);
        } catch (e) { console.error("Erro carga devices", e); }
    }

    async addCamera() {
        const payload = {
            name: document.getElementById('cam-name').value,
            location: document.getElementById('cam-loc').value,
            url: document.getElementById('cam-url').value,
            type: document.getElementById('cam-type').value,
            isSimulated: document.getElementById('cam-sim').checked
        };

        if(!payload.name) return alert("Nome obrigatório");

        await fetch('/api/v1/cameras', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        document.getElementById('cam-name').value = '';
        document.getElementById('cam-url').value = '';
        this.loadDevices();
    }

    async deleteCamera(id) {
        if(!confirm("Remover câmera?")) return;
        await fetch(`/api/v1/cameras/${id}`, { method: 'DELETE' });
        this.loadDevices();
    }

    renderCameras(cameras) {
        const container = document.getElementById('cameras-list-ui');
        container.innerHTML = '';
        
        if (!cameras || cameras.length === 0) {
            container.innerHTML = '<p style="color:#f59e0b; padding:10px;"><i class="fas fa-info-circle"></i> Nenhuma câmera cadastrada.</p>';
            return;
        }

        cameras.forEach(cam => {
            container.insertAdjacentHTML('beforeend', `
                <div class="webhook-item">
                    <div class="wh-info">
                        <span class="wh-name">${cam.name}</span>
                        <span class="wh-url">${cam.url || 'Sem IP'} | ${cam.location}</span>
                    </div>
                    <button class="btn-sm btn-danger" onclick="settingsManager.deleteCamera(${cam.id})"><i class="fas fa-trash"></i></button>
                </div>
            `);
        });
    }

    async addSensor() {
        const payload = {
            name: document.getElementById('sens-name').value,
            topic: document.getElementById('sens-topic').value,
            isSimulated: document.getElementById('sens-sim').checked
        };

        if(!payload.name) return alert("Nome obrigatório");

        await fetch('/api/v1/sensors', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        document.getElementById('sens-name').value = '';
        this.loadDevices();
    }

    async deleteSensor(id) {
        if(!confirm("Remover sensor?")) return;
        await fetch(`/api/v1/sensors/${id}`, { method: 'DELETE' });
        this.loadDevices();
    }

    renderSensors(sensors) {
        const container = document.getElementById('sensors-list-ui');
        container.innerHTML = '';

        if (!sensors || sensors.length === 0) {
            container.innerHTML = '<p style="color:#f59e0b; padding:10px;"><i class="fas fa-info-circle"></i> Nenhum sensor.</p>';
            return;
        }
        
        sensors.forEach(sens => {
            container.insertAdjacentHTML('beforeend', `
                <div class="webhook-item">
                    <div class="wh-info">
                        <span class="wh-name">${sens.name}</span>
                        <span class="wh-url">MQTT: ${sens.topic || 'N/A'}</span>
                    </div>
                    <button class="btn-sm btn-danger" onclick="settingsManager.deleteSensor(${sens.id})"><i class="fas fa-trash"></i></button>
                </div>
            `);
        });
    }

    async loadServerHealth() {
        try {
            const res = await fetch('/api/v1/health');
            const data = await res.json();
            document.getElementById('sys-uptime').textContent = data.uptime;
            document.getElementById('sys-memory').textContent = data.memory_usage;
            document.getElementById('sys-mqtt').textContent = data.mqtt_status;
            document.getElementById('sys-clients').textContent = data.active_connections;
            document.getElementById('sys-mqtt').style.color = data.mqtt_status === 'Conectado' ? '#10b981' : '#ef4444';
        } catch (e) {}
    }

    async loadLogs() {
        try {
            const res = await fetch('/api/v1/logs');
            const logs = await res.json();
            const tbody = document.getElementById('logs-table-body');
            tbody.innerHTML = '';
            if (logs.length === 0) tbody.innerHTML = '<tr><td colspan="4">Vazio.</td></tr>';
            logs.forEach(log => {
                tbody.insertAdjacentHTML('beforeend', `<tr>
                    <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td>${log.action}</td>
                    <td>${log.user}</td>
                    <td>${log.details}</td>
                </tr>`);
            });
        } catch (e) {}
    }

    async loadWebhooks() {
        try {
            const res = await fetch('/api/v1/webhooks');
            const data = await res.json();
            const list = document.getElementById('webhooks-list');
            list.innerHTML = '';
            data.forEach(wh => {
                list.insertAdjacentHTML('beforeend', `
                    <div class="webhook-item">
                        <div class="wh-info"><span class="wh-name">${wh.name || 'Sem nome'}</span><span class="wh-url">${wh.url}</span></div>
                        <button class="btn-sm btn-danger" onclick="settingsManager.deleteWebhook(${wh.id})"><i class="fas fa-trash"></i></button>
                    </div>
                `);
            });
        } catch (e) {}
    }

    async addWebhook() {
        const name = document.getElementById('wh-name').value;
        const url = document.getElementById('wh-url').value;
        if (!name || !url) return alert('Preencha tudo');
        await fetch('/api/v1/webhooks', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, url, events: ['all'] }) 
        });
        this.loadWebhooks();
    }
    
    async deleteWebhook(id) {
        if(confirm('Deletar?')) { await fetch(`/api/v1/webhooks/${id}`, { method: 'DELETE' }); this.loadWebhooks(); }
    }
}

window.settingsManager = new SettingsManager();