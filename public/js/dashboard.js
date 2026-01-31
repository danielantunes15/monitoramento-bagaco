class SensorDashboard {
    constructor() {
        this.sensors = {
            1: { id: 1, temp: 45, status: 'active', location: 'Pilha Norte - Superior', battery: 98, signal: 'Excelente' },
            2: { id: 2, temp: 48, status: 'active', location: 'Pilha Norte - Central', battery: 95, signal: 'Excelente' },
            3: { id: 3, temp: 52, status: 'active', location: 'Pilha Sul - Superior', battery: 82, signal: 'Bom' },
            4: { id: 4, temp: 42, status: 'active', location: 'Pilha Sul - Central', battery: 68, signal: 'Moderado' }
        };
        this.chart = null;
        this.init();
    }
    
    init() {
        this.setupListeners();
        this.initCharts();
        this.renderSensors();
        this.updateTime();
        setInterval(() => this.simulateData(), 2000);
        setInterval(() => this.updateTime(), 1000);
    }

    setupListeners() {
        // --- FUNÇÃO DE EXPORTAÇÃO REAL ---
        document.getElementById('export-data').addEventListener('click', () => {
            this.exportCSV();
        });

        document.getElementById('refresh-data').addEventListener('click', () => {
            this.simulateData();
            // Efeito visual no botão
            const btn = document.getElementById('refresh-data');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spin fa-sync-alt"></i> Atualizando...';
            setTimeout(() => btn.innerHTML = originalHtml, 1000);
        });
        
        // Listeners dos Modais
        document.getElementById('close-sensor-modal').addEventListener('click', () => document.getElementById('sensor-modal').classList.remove('active'));
        document.getElementById('close-modal-btn').addEventListener('click', () => document.getElementById('sensor-modal').classList.remove('active'));
    }

    async exportCSV() {
        try {
            const btn = document.getElementById('export-data');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Baixando...';
            
            // Chama a API do Backend
            const response = await fetch('/api/v1/export/csv');
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                // Nome do arquivo com data
                const date = new Date().toISOString().split('T')[0];
                a.download = `relatorio_belfire_${date}.csv`;
                
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                
                setTimeout(() => alert('Relatório baixado com sucesso! Verifique sua pasta de Downloads.'), 500);
            } else {
                alert('Erro ao gerar relatório no servidor.');
            }
        } catch (error) {
            console.error('Erro no download:', error);
            alert('Falha na conexão ao tentar exportar.');
        } finally {
            document.getElementById('export-data').innerHTML = '<i class="fas fa-download"></i> Exportar';
        }
    }

    // --- (Restante do código igual ao anterior: renderSensors, simulateData, etc...) ---
    // Vou manter as funções essenciais para garantir que o dashboard funcione
    
    renderSensors() {
        const grid = document.getElementById('sensors-grid');
        grid.innerHTML = ''; 
        Object.values(this.sensors).forEach(sensor => {
            let statusClass = sensor.temp > 80 ? 'critical' : (sensor.temp > 65 ? 'warning' : '');
            const html = `
                <div class="sensor-card ${statusClass}" data-id="${sensor.id}">
                    <div class="sensor-header">
                        <div class="sensor-id"><i class="fas fa-thermometer"></i> Sensor #${sensor.id}</div>
                        <div class="sensor-status active"><div class="status-dot"></div> Ativo</div>
                    </div>
                    <div class="sensor-temperature">
                        <div class="temp-value" id="temp-${sensor.id}">${sensor.temp.toFixed(1)}°C</div>
                        <div class="temp-label">Temperatura</div>
                    </div>
                    <div class="sensor-info">
                        <div class="info-row"><i class="fas fa-map-marker-alt"></i> ${sensor.location}</div>
                        <div class="info-row"><i class="fas fa-battery-half"></i> Bateria: ${sensor.battery}%</div>
                    </div>
                    <div class="sensor-controls">
                        <button class="sensor-btn" onclick="dashboard.openModal(${sensor.id})">
                            <i class="fas fa-chart-bar"></i> Detalhes
                        </button>
                    </div>
                </div>`;
            grid.insertAdjacentHTML('beforeend', html);
        });
        document.getElementById('sensor-count').textContent = `${Object.keys(this.sensors).length} sensores`;
        document.getElementById('active-sensors').textContent = `${Object.keys(this.sensors).length}/${Object.keys(this.sensors).length}`;
    }

    simulateData() {
        let globalSum = 0;
        let count = 0;
        Object.keys(this.sensors).forEach(key => {
            const sensor = this.sensors[key];
            sensor.temp = Math.max(20, Math.min(100, sensor.temp + (Math.random() - 0.5) * 1.5));
            const el = document.getElementById(`temp-${sensor.id}`);
            if(el) {
                el.textContent = `${sensor.temp.toFixed(1)}°C`;
                el.style.color = sensor.temp > 80 ? 'var(--danger-color)' : (sensor.temp > 65 ? 'var(--warning-color)' : 'var(--text-primary)');
            }
            globalSum += sensor.temp;
            count++;
        });
        const avg = globalSum / count;
        document.getElementById('current-temp').textContent = `${avg.toFixed(1)}°C`;
        this.updateChart(avg);
        this.updateGauge(avg);
    }

    openModal(id) {
        document.getElementById('sensor-modal').classList.add('active');
        // Renderiza gráfico simples no modal
        new Chart(document.getElementById('sensorDetailChart'), {
            type: 'bar', data: { labels: ['A', 'B', 'C'], datasets: [{ label: 'Histórico', data: [40, 45, 42], backgroundColor: '#10b981' }] }
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

    updateTime() { document.getElementById('current-time').textContent = new Date().toLocaleTimeString(); }
}

// Inicializa globalmente
document.addEventListener('DOMContentLoaded', () => { window.dashboard = new SensorDashboard(); });