class SensorDashboard {
    constructor() {
        // Dados Iniciais (Simulando Banco de Dados)
        this.sensors = {
            1: { id: 1, temp: 45, status: 'active', location: 'Pilha Norte - Superior', battery: 98, signal: 'Excelente' },
            2: { id: 2, temp: 48, status: 'active', location: 'Pilha Norte - Central', battery: 95, signal: 'Excelente' },
            3: { id: 3, temp: 52, status: 'active', location: 'Pilha Sul - Superior', battery: 82, signal: 'Bom' },
            4: { id: 4, temp: 42, status: 'active', location: 'Pilha Sul - Central', battery: 68, signal: 'Moderado' }
        };
        
        this.history = []; // Histórico global
        this.alerts = [];
        this.chart = null;
        this.detailChart = null;
        
        this.init();
    }
    
    init() {
        this.setupListeners();
        this.initCharts();
        this.renderSensors(); // Gera o HTML dos sensores
        this.updateTime();
        
        // Simulação de dados em tempo real
        setInterval(() => this.simulateData(), 2000);
        setInterval(() => this.updateTime(), 1000);
    }

    // --- GERAÇÃO DE HTML DINÂMICO ---
    renderSensors() {
        const grid = document.getElementById('sensors-grid');
        grid.innerHTML = ''; // Limpa grid existente
        
        Object.values(this.sensors).forEach(sensor => {
            // Define classes baseadas no status
            let statusClass = '';
            if (sensor.temp > 80) statusClass = 'critical';
            else if (sensor.temp > 65) statusClass = 'warning';

            // HTML do Card
            const html = `
                <div class="sensor-card ${statusClass}" data-id="${sensor.id}">
                    <div class="sensor-header">
                        <div class="sensor-id"><i class="fas fa-thermometer"></i> Sensor #${sensor.id.toString().padStart(2, '0')}</div>
                        <div class="sensor-status active"><div class="status-dot"></div> Ativo</div>
                    </div>
                    <div class="sensor-temperature">
                        <div class="temp-value" id="temp-${sensor.id}">${sensor.temp.toFixed(1)}°C</div>
                        <div class="temp-label">Temperatura</div>
                    </div>
                    <div class="sensor-info">
                        <div class="info-row"><i class="fas fa-map-marker-alt"></i> ${sensor.location}</div>
                        <div class="info-row"><i class="fas fa-battery-half"></i> Bateria: ${sensor.battery}%</div>
                        <div class="info-row"><i class="fas fa-wifi"></i> Sinal: ${sensor.signal}</div>
                    </div>
                    <div class="sensor-controls">
                        <button class="sensor-btn" onclick="window.dashboard.openModal(${sensor.id})">
                            <i class="fas fa-chart-bar"></i> Detalhes
                        </button>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', html);
        });
        
        document.getElementById('sensor-count').textContent = `${Object.keys(this.sensors).length} sensores`;
        document.getElementById('active-sensors').textContent = `${Object.keys(this.sensors).length}/${Object.keys(this.sensors).length}`;
    }

    // --- LÓGICA E DADOS ---
    simulateData() {
        // Atualiza cada sensor com variação aleatória
        let globalSum = 0;
        let count = 0;
        let maxTemp = 0;

        Object.keys(this.sensors).forEach(key => {
            const sensor = this.sensors[key];
            const change = (Math.random() - 0.5) * 1.5;
            sensor.temp = Math.max(20, Math.min(100, sensor.temp + change));
            
            // Atualiza UI específica deste sensor
            const tempEl = document.getElementById(`temp-${sensor.id}`);
            if (tempEl) {
                tempEl.textContent = `${sensor.temp.toFixed(1)}°C`;
                // Atualiza cor do texto se crítico
                tempEl.style.color = sensor.temp > 80 ? 'var(--danger-color)' : 
                                     sensor.temp > 65 ? 'var(--warning-color)' : 'var(--text-primary)';
            }

            // Verifica Alertas
            if (sensor.temp > 80) this.triggerAlert(sensor, 'critical');
            else if (sensor.temp > 70) this.triggerAlert(sensor, 'warning');

            // Estatísticas Globais
            globalSum += sensor.temp;
            if (sensor.temp > maxTemp) maxTemp = sensor.temp;
            count++;
        });

        // Atualiza Painel Principal
        const avg = globalSum / count;
        this.updateMainGauge(avg);
        document.getElementById('current-temp').textContent = `${avg.toFixed(1)}°C`;
        document.getElementById('max-temp').textContent = `${maxTemp.toFixed(1)}°C`;
        
        // Atualiza Gráfico
        this.updateChart(avg);
    }

    triggerAlert(sensor, type) {
        // Evita flood de alertas (simples debounce)
        const lastAlert = this.alerts[0];
        if (lastAlert && lastAlert.sensorId === sensor.id && (Date.now() - lastAlert.time < 10000)) return;

        const msg = `Sensor ${sensor.id} (${sensor.location}) atingiu ${sensor.temp.toFixed(1)}°C`;
        this.alerts.unshift({ sensorId: sensor.id, msg, type, time: Date.now() });
        
        // Atualiza Lista de Alertas
        const list = document.getElementById('alerts-list');
        const icon = type === 'critical' ? 'fa-fire' : 'fa-exclamation-triangle';
        const colorClass = type;
        
        const html = `
            <div class="alert-item">
                <div class="alert-icon ${colorClass}"><i class="fas ${icon}"></i></div>
                <div class="alert-content">
                    <div class="alert-title">${type.toUpperCase()}</div>
                    <div class="alert-message">${msg}</div>
                    <div class="alert-time">Agora</div>
                </div>
            </div>
        `;
        list.insertAdjacentHTML('afterbegin', html);
        
        // Atualiza Contador
        document.getElementById('active-alerts').textContent = this.alerts.length;
    }

    updateMainGauge(value) {
        const fill = document.getElementById('gauge-fill');
        const valTxt = document.getElementById('gauge-value');
        const statusTxt = document.getElementById('gauge-status');
        
        if(fill) {
            const deg = Math.min(180, (value / 120) * 180); // 120 é o max do gauge
            fill.style.transform = `rotate(${deg}deg)`;
            valTxt.textContent = value.toFixed(1);
            
            if(value > 80) { statusTxt.textContent = "CRÍTICO"; statusTxt.style.background = "var(--danger-color)"; }
            else if(value > 65) { statusTxt.textContent = "ALERTA"; statusTxt.style.background = "var(--warning-color)"; }
            else { statusTxt.textContent = "NORMAL"; statusTxt.style.background = "var(--success-color)"; }
        }
    }

    // --- GRÁFICOS (Chart.js) ---
    initCharts() {
        const ctx = document.getElementById('temperatureChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    label: 'Temp Média',
                    data: Array(20).fill(null),
                    borderColor: '#3b82f6',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 20, max: 100 } }
            }
        });
    }

    updateChart(val) {
        if (!this.chart) return;
        const data = this.chart.data.datasets[0].data;
        data.push(val);
        data.shift(); // Remove antigo
        this.chart.update('none'); // Atualização performática
    }

    // --- MODAL ---
    openModal(id) {
        const sensor = this.sensors[id];
        const modal = document.getElementById('sensor-modal');
        const content = document.getElementById('modal-details-content');
        
        content.innerHTML = `
            <div class="detail-row"><span class="detail-label">Local:</span> <span class="detail-value">${sensor.location}</span></div>
            <div class="detail-row"><span class="detail-label">Status:</span> <span class="detail-value">${sensor.status}</span></div>
            <div class="detail-row"><span class="detail-label">Bateria:</span> <span class="detail-value">${sensor.battery}%</span></div>
            <div class="detail-row"><span class="detail-label">Última Calibração:</span> <span class="detail-value">15/01/2026</span></div>
        `;
        
        modal.classList.add('active');
        
        // Renderiza mini-gráfico do sensor
        this.renderDetailChart();
    }

    renderDetailChart() {
        const ctx = document.getElementById('sensorDetailChart').getContext('2d');
        if (this.detailChart) this.detailChart.destroy();
        
        this.detailChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['-4h', '-3h', '-2h', '-1h', 'Agora'],
                datasets: [{
                    label: 'Histórico',
                    data: [42, 45, 48, 46, 49], // Dados fictícios para exemplo
                    backgroundColor: '#10b981'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    setupListeners() {
        document.getElementById('close-sensor-modal').addEventListener('click', () => document.getElementById('sensor-modal').classList.remove('active'));
        document.getElementById('close-modal-btn').addEventListener('click', () => document.getElementById('sensor-modal').classList.remove('active'));
        document.getElementById('refresh-data').addEventListener('click', () => {
            this.simulateData();
            alert('Dados atualizados!');
        });
    }

    updateTime() {
        document.getElementById('current-time').textContent = new Date().toLocaleTimeString();
    }
}

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new SensorDashboard();
});