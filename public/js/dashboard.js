class SensorDashboard {
    constructor() {
        this.sensors = []; 
        this.chart = null;
        this.init();
    }
    
    async init() {
        await this.loadSensors();
        this.setupListeners();
        this.initCharts();
        this.renderSensors();
        this.updateTime();
        
        setInterval(() => this.simulateData(), 2000);
        setInterval(() => this.updateTime(), 1000);
    }

    async loadSensors() {
        const demoSensors = [
            { id: 1, name: "Sensor Demo 1", location: 'Pilha Norte - Topo', temp: 45, battery: 98, isSimulated: true },
            { id: 2, name: "Sensor Demo 2", location: 'Pilha Norte - Base', temp: 48, battery: 95, isSimulated: true },
            { id: 3, name: "Sensor Demo 3", location: 'Pilha Sul - Topo', temp: 52, battery: 82, isSimulated: true },
            { id: 4, name: "Sensor Demo 4", location: 'Pilha Sul - Base', temp: 42, battery: 68, isSimulated: true }
        ];

        try {
            const res = await fetch('/api/v1/sensors');
            if (!res.ok) throw new Error("API Offline");
            
            const dbSensors = await res.json();

            if (Array.isArray(dbSensors) && dbSensors.length > 0) {
                console.log("Sensores reais carregados.");
                this.sensors = dbSensors.map(s => ({
                    ...s,
                    temp: s.temp || 25, 
                    battery: s.battery || 100,
                    location: s.topic || 'MQTT Device'
                }));
            } else {
                this.sensors = demoSensors;
            }
        } catch (e) {
            this.sensors = demoSensors;
        }
    }

    setupListeners() {
        document.getElementById('export-data')?.addEventListener('click', () => this.exportCSV());
        document.getElementById('refresh-data')?.addEventListener('click', () => {
            this.loadSensors().then(() => this.renderSensors());
        });
        document.getElementById('close-sensor-modal')?.addEventListener('click', () => document.getElementById('sensor-modal').classList.remove('active'));
        document.getElementById('close-modal-btn')?.addEventListener('click', () => document.getElementById('sensor-modal').classList.remove('active'));
    }

    renderSensors() {
        const grid = document.getElementById('sensors-grid');
        if(!grid) return;
        grid.innerHTML = ''; 
        
        this.sensors.forEach(sensor => {
            let statusClass = sensor.temp > 80 ? 'critical' : (sensor.temp > 65 ? 'warning' : '');
            const html = `
                <div class="sensor-card ${statusClass}" data-id="${sensor.id}" id="sensor-card-${sensor.id}">
                    <div class="sensor-header">
                        <div class="sensor-id"><i class="fas fa-thermometer"></i> ${sensor.name || 'Sensor ' + sensor.id}</div>
                        <div class="sensor-status active"><div class="status-dot"></div> Ativo</div>
                    </div>
                    <div class="sensor-temperature">
                        <div class="temp-value" id="temp-${sensor.id}">${(sensor.temp || 0).toFixed(1)}°C</div>
                        <div class="temp-label">Temperatura</div>
                    </div>
                    <div class="sensor-info">
                        <div class="info-row"><i class="fas fa-map-marker-alt"></i> ${sensor.location || 'N/A'}</div>
                        <div class="info-row"><i class="fas fa-battery-half"></i> Bateria: ${sensor.battery || '--'}%</div>
                    </div>
                    <div class="sensor-controls">
                        <button class="sensor-btn" onclick="dashboard.openModal(${sensor.id})">
                            <i class="fas fa-chart-bar"></i> Detalhes
                        </button>
                    </div>
                </div>`;
            grid.insertAdjacentHTML('beforeend', html);
        });

        const countEl = document.getElementById('sensor-count');
        if(countEl) countEl.textContent = `${this.sensors.length} sensores`;
        const activeEl = document.getElementById('active-sensors');
        if(activeEl) activeEl.textContent = `${this.sensors.length}/${this.sensors.length}`;
    }

    simulateData() {
        let globalSum = 0;
        let count = 0;
        
        this.sensors.forEach(sensor => {
            if (sensor.isSimulated) {
                // --- LÓGICA DE SIMULAÇÃO SUAVE ---
                const target = 45; // Temperatura base para sensores
                
                // Ruído natural
                let change = (Math.random() - 0.5) * 0.5;
                
                // Tende a voltar ao normal
                if (sensor.temp > target + 5) change -= 0.2;
                if (sensor.temp < target - 5) change += 0.2;
                
                // Evento raro de pico (1%)
                if (Math.random() < 0.01) change += 3.0;

                sensor.temp = Math.max(20, Math.min(100, sensor.temp + change));
                this.updateSensorUI(sensor);
            }
            globalSum += sensor.temp || 0;
            count++;
        });

        if (count > 0) {
            const avg = globalSum / count;
            const curEl = document.getElementById('current-temp');
            if(curEl) curEl.textContent = `${avg.toFixed(1)}°C`;
            this.updateChart(avg);
            this.updateGauge(avg);
        }
    }

    updateSensorUI(sensor) {
        const el = document.getElementById(`temp-${sensor.id}`);
        const card = document.getElementById(`sensor-card-${sensor.id}`);
        
        if(el) {
            el.textContent = `${sensor.temp.toFixed(1)}°C`;
            el.style.color = sensor.temp > 80 ? 'var(--danger-color)' : (sensor.temp > 65 ? 'var(--warning-color)' : 'var(--text-primary)');
        }
        if (card) {
            card.classList.remove('critical', 'warning');
            if (sensor.temp > 80) card.classList.add('critical');
            else if (sensor.temp > 65) card.classList.add('warning');
        }
    }

    openModal(id) {
        document.getElementById('sensor-modal').classList.add('active');
        // Gráfico demo no modal
        new Chart(document.getElementById('sensorDetailChart'), {
            type: 'bar', 
            data: { labels: ['-30m', '-20m', '-10m', 'Agora'], datasets: [{ label: 'Histórico', data: [40, 42, 45, 48], backgroundColor: '#3b82f6' }] },
            options: { responsive: true, plugins: { legend: {display:false} } }
        });
    }

    updateGauge(val) {
        const fill = document.getElementById('gauge-fill');
        const txt = document.getElementById('gauge-value');
        if(fill) {
            fill.style.transform = `rotate(${Math.min(180, (val/120)*180)}deg)`;
            txt.textContent = val.toFixed(1);
        }
    }

    initCharts() {
        const ctx = document.getElementById('temperatureChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(20).fill(''), datasets: [{ label: 'Temp Média', data: Array(20).fill(null), borderColor: '#3b82f6', tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 20, max: 100 } } }
        });
    }

    updateChart(val) {
        if(!this.chart) return;
        const data = this.chart.data.datasets[0].data;
        data.push(val); data.shift();
        this.chart.update('none');
    }

    updateTime() { 
        const el = document.getElementById('current-time');
        if(el) el.textContent = new Date().toLocaleTimeString(); 
    }
    
    async exportCSV() { 
        try {
            const response = await fetch('/api/v1/export/csv');
            if(response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `relatorio.csv`;
                document.body.appendChild(a);
                a.click();
            }
        } catch(e) { alert('Erro exportação'); }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.dashboard = new SensorDashboard(); });