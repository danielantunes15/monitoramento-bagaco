// Aplicação principal do sistema de monitoramento
class TemperatureMonitor {
    constructor() {
        this.currentTemperature = null;
        this.temperatureHistory = [];
        this.maxHistoryPoints = 50;
        this.alertStatus = {
            critical: false,
            warning: false,
            info: true
        };
        this.sensors = {
            1: { temp: null, status: 'active', location: 'Pilha Norte - Superior' },
            2: { temp: null, status: 'active', location: 'Pilha Norte - Central' },
            3: { temp: null, status: 'active', location: 'Pilha Sul - Superior' },
            4: { temp: null, status: 'active', location: 'Pilha Sul - Central' }
        };
        this.chart = null;
        this.chartHours = 24;
        this.connectionStatus = 'connected';
        this.simulatedMode = true;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateTime();
        this.initChart();
        
        // Simular dados iniciais
        this.simulateInitialData();
        
        // Iniciar atualização em tempo real
        setInterval(() => this.updateData(), 3000);
        setInterval(() => this.updateTime(), 1000);
        
        // Tentar conectar com WebSocket (modo real)
        this.connectWebSocket();
    }
    
    setupEventListeners() {
        // Botão de atualizar
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.updateData();
            this.showNotification('Dados atualizados manualmente');
        });
        
        // Botões de intervalo do gráfico
        document.querySelectorAll('.btn-time').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.chartHours = parseInt(btn.dataset.hours);
                this.updateChart();
            });
        });
        
        // Botão de exportar dados
        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportData();
        });
        
        // Botão de configurações
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettingsModal();
        });
    }
    
    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR');
        const dateString = now.toLocaleDateString('pt-BR');
        
        document.getElementById('current-time').textContent = timeString;
        document.getElementById('last-update').textContent = `${dateString} ${timeString}`;
    }
    
    simulateInitialData() {
        // Gerar dados históricos iniciais
        const now = new Date();
        for (let i = this.maxHistoryPoints; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 30 * 60000); // 30 minutos entre pontos
            const temp = 45 + Math.random() * 15; // Entre 45 e 60°C
            
            this.temperatureHistory.push({
                time: time,
                temperature: temp
            });
        }
        
        // Inicializar sensores
        for (let i = 1; i <= 4; i++) {
            this.sensors[i].temp = 48 + Math.random() * 12;
            this.updateSensorDisplay(i);
        }
        
        // Atualizar dados iniciais
        this.updateCurrentTemperature(50 + Math.random() * 10);
        this.updateStats();
        this.updateChart();
    }
    
    updateData() {
        if (this.simulatedMode) {
            // Modo simulado - gerar dados aleatórios
            const tempChange = (Math.random() - 0.5) * 2; // -1 a +1
            const newTemp = this.currentTemperature + tempChange;
            
            // Garantir que a temperatura não fique fora de limites razoáveis
            const clampedTemp = Math.max(30, Math.min(90, newTemp));
            
            this.updateCurrentTemperature(clampedTemp);
            
            // Atualizar sensores individualmente
            for (let i = 1; i <= 4; i++) {
                const sensorChange = (Math.random() - 0.5) * 1.5;
                this.sensors[i].temp = Math.max(30, Math.min(95, this.sensors[i].temp + sensorChange));
                this.updateSensorDisplay(i);
            }
            
            this.updateStats();
            this.updateChart();
        }
        // Em modo real, os dados viriam do WebSocket
    }
    
    updateCurrentTemperature(temp) {
        this.currentTemperature = temp;
        
        // Atualizar o medidor
        document.getElementById('gauge-value').textContent = temp.toFixed(1);
        
        // Atualizar a posição do medidor (0-120°C)
        const gaugePercentage = Math.min(100, (temp / 120) * 100);
        const gaugeRotation = (gaugePercentage / 100) * 180; // Meio círculo
        document.getElementById('gauge-fill').style.transform = `rotate(${gaugeRotation}deg)`;
        
        // Atualizar status do medidor
        let statusText = 'Normal';
        let statusColor = 'var(--temp-low)';
        
        if (temp < 35) {
            statusText = 'Baixa';
            statusColor = 'var(--temp-low)';
        } else if (temp >= 35 && temp < 65) {
            statusText = 'Normal';
            statusColor = 'var(--temp-normal)';
        } else if (temp >= 65 && temp < 80) {
            statusText = 'Alta';
            statusColor = 'var(--temp-high)';
            this.triggerWarningAlert(`Temperatura elevada: ${temp.toFixed(1)}°C`);
        } else {
            statusText = 'CRÍTICO';
            statusColor = 'var(--temp-critical)';
            this.triggerCriticalAlert(`PERIGO: Temperatura crítica: ${temp.toFixed(1)}°C - Risco de incêndio!`);
        }
        
        const gaugeStatus = document.getElementById('gauge-status');
        gaugeStatus.textContent = statusText;
        gaugeStatus.style.backgroundColor = statusColor;
        
        // Adicionar ao histórico
        this.temperatureHistory.push({
            time: new Date(),
            temperature: temp
        });
        
        // Manter apenas os últimos pontos
        if (this.temperatureHistory.length > this.maxHistoryPoints) {
            this.temperatureHistory.shift();
        }
    }
    
    updateSensorDisplay(sensorId) {
        const sensor = this.sensors[sensorId];
        const sensorElement = document.querySelector(`[data-sensor="${sensorId}"]`);
        const tempElement = document.getElementById(`sensor-${sensorId}-temp`);
        
        if (tempElement) {
            tempElement.textContent = `${sensor.temp.toFixed(1)}°C`;
            
            // Atualizar cor baseada na temperatura
            let sensorClass = '';
            if (sensor.temp >= 80) {
                sensorClass = 'critical';
                tempElement.style.color = 'var(--temp-critical)';
            } else if (sensor.temp >= 65) {
                sensorClass = 'warning';
                tempElement.style.color = 'var(--temp-high)';
            } else {
                tempElement.style.color = 'var(--primary-color)';
            }
            
            // Atualizar classe do cartão do sensor
            sensorElement.className = 'sensor-card';
            if (sensorClass) {
                sensorElement.classList.add(sensorClass);
            }
        }
    }
    
    updateStats() {
        if (this.temperatureHistory.length === 0) return;
        
        // Temperatura máxima
        const maxTemp = Math.max(...this.temperatureHistory.map(item => item.temperature));
        const maxTempItem = this.temperatureHistory.find(item => item.temperature === maxTemp);
        
        document.getElementById('max-temp').textContent = `${maxTemp.toFixed(1)}°C`;
        if (maxTempItem) {
            const timeString = maxTempItem.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            document.getElementById('max-temp-time').textContent = `${timeString}`;
        }
        
        // Temperatura média (últimas 24h)
        const now = new Date();
        const last24h = this.temperatureHistory.filter(item => 
            (now - item.time) <= 24 * 60 * 60 * 1000
        );
        
        if (last24h.length > 0) {
            const avgTemp = last24h.reduce((sum, item) => sum + item.temperature, 0) / last24h.length;
            document.getElementById('avg-temp').textContent = `${avgTemp.toFixed(1)}°C`;
        }
        
        // Variação (última hora)
        const lastHour = this.temperatureHistory.filter(item => 
            (now - item.time) <= 60 * 60 * 1000
        );
        
        if (lastHour.length >= 2) {
            const oldestTemp = lastHour[0].temperature;
            const newestTemp = lastHour[lastHour.length - 1].temperature;
            const change = newestTemp - oldestTemp;
            
            document.getElementById('temp-change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}°C`;
            document.getElementById('temp-change').style.color = change >= 0 ? 'var(--temp-high)' : 'var(--temp-low)';
        }
    }
    
    initChart() {
        const ctx = document.getElementById('temperatureChart').getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperatura (°C)',
                    data: [],
                    borderColor: 'var(--secondary-color)',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'var(--secondary-color)',
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `Temperatura: ${context.parsed.y.toFixed(1)}°C`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            color: 'var(--text-secondary)',
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        min: 30,
                        max: 100,
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            color: 'var(--text-secondary)',
                            callback: function(value) {
                                return value + '°C';
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                }
            }
        });
        
        this.updateChart();
    }
    
    updateChart() {
        if (!this.chart || this.temperatureHistory.length === 0) return;
        
        const now = new Date();
        const filteredData = this.temperatureHistory.filter(item => 
            (now - item.time) <= this.chartHours * 60 * 60 * 1000
        );
        
        // Limitar a quantidade de pontos para não sobrecarregar o gráfico
        const maxPoints = 30;
        const step = Math.max(1, Math.floor(filteredData.length / maxPoints));
        const chartData = [];
        const chartLabels = [];
        
        for (let i = 0; i < filteredData.length; i += step) {
            const item = filteredData[i];
            chartData.push(item.temperature);
            
            // Formatar o rótulo de tempo
            let timeLabel;
            if (this.chartHours <= 1) {
                timeLabel = item.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else if (this.chartHours <= 6) {
                timeLabel = item.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                timeLabel = item.time.toLocaleTimeString('pt-BR', { hour: '2-digit' });
            }
            
            chartLabels.push(timeLabel);
        }
        
        // Adicionar o último ponto se não estiver incluído
        if (filteredData.length > 0 && (filteredData.length - 1) % step !== 0) {
            const lastItem = filteredData[filteredData.length - 1];
            chartData.push(lastItem.temperature);
            
            let timeLabel;
            if (this.chartHours <= 1) {
                timeLabel = lastItem.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else if (this.chartHours <= 6) {
                timeLabel = lastItem.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                timeLabel = lastItem.time.toLocaleTimeString('pt-BR', { hour: '2-digit' });
            }
            
            chartLabels.push(timeLabel);
        }
        
        this.chart.data.labels = chartLabels;
        this.chart.data.datasets[0].data = chartData;
        this.chart.update();
    }
    
    triggerWarningAlert(message) {
        if (!this.alertStatus.warning) {
            this.alertStatus.warning = true;
            document.getElementById('warning-text').textContent = message;
            document.getElementById('warning-alert').classList.add('active');
            
            // Notificação de áudio (simulada)
            this.playAlertSound('warning');
            
            // Reset após 10 segundos
            setTimeout(() => {
                this.alertStatus.warning = false;
                document.getElementById('warning-text').textContent = 'Nenhum alerta de temperatura';
                document.getElementById('warning-alert').classList.remove('active');
            }, 10000);
        }
    }
    
    triggerCriticalAlert(message) {
        if (!this.alertStatus.critical) {
            this.alertStatus.critical = true;
            document.getElementById('critical-text').textContent = message;
            document.getElementById('critical-alert').classList.add('active');
            
            // Notificação de áudio (simulada)
            this.playAlertSound('critical');
            
            // Piscar o título da página para chamar atenção
            this.flashPageTitle('ALERTA CRÍTICO!');
            
            // Não resetar automaticamente - requer intervenção manual
        }
    }
    
    playAlertSound(type) {
        // Em um sistema real, isso tocaria um som de alerta
        console.log(`Tocando som de alerta: ${type}`);
        
        // Para simulação, apenas mostramos no console
        if (type === 'critical') {
            console.log('🚨 ALERTA CRÍTICO: RISCO DE INCÊNDIO! 🚨');
        }
    }
    
    flashPageTitle(alertText) {
        let originalTitle = document.title;
        let isOriginal = true;
        let flashCount = 0;
        const maxFlashes = 20;
        
        const flashInterval = setInterval(() => {
            document.title = isOriginal ? alertText : originalTitle;
            isOriginal = !isOriginal;
            flashCount++;
            
            if (flashCount >= maxFlashes) {
                clearInterval(flashInterval);
                document.title = originalTitle;
            }
        }, 500);
    }
    
    connectWebSocket() {
        // Em um sistema real, aqui conectaria a um WebSocket do servidor
        // Para demonstração, usamos modo simulado
        console.log('Conectando ao servidor WebSocket...');
        
        // Simular tentativa de conexão
        setTimeout(() => {
            if (Math.random() > 0.3) { // 70% de chance de sucesso
                this.connectionStatus = 'connected';
                document.getElementById('status-text').textContent = 'Conectado';
                document.getElementById('status-indicator').classList.add('active');
                document.getElementById('status-indicator').classList.remove('inactive');
                document.getElementById('info-text').textContent = 'Conectado ao servidor de monitoramento';
            } else {
                this.connectionStatus = 'disconnected';
                document.getElementById('status-text').textContent = 'Desconectado';
                document.getElementById('status-indicator').classList.remove('active');
                document.getElementById('status-indicator').classList.add('inactive');
                document.getElementById('info-text').textContent = 'Modo simulado - Servidor offline';
                this.simulatedMode = true;
            }
        }, 1000);
    }
    
    exportData() {
        // Em um sistema real, isso baixaria um arquivo CSV/JSON
        const dataStr = JSON.stringify({
            timestamp: new Date().toISOString(),
            currentTemperature: this.currentTemperature,
            temperatureHistory: this.temperatureHistory.slice(-100), // Últimos 100 pontos
            sensors: this.sensors,
            alerts: this.alertStatus
        }, null, 2);
        
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `dados-temperatura-${new Date().toISOString().slice(0, 10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.showNotification('Dados exportados com sucesso!');
    }
    
    showSettingsModal() {
        // Em um sistema real, abriria um modal de configurações
        this.showNotification('Abrindo configurações do sistema...');
        
        // Simulação simples
        const threshold = prompt('Defina o limite de temperatura para alerta (em °C):', '65');
        if (threshold && !isNaN(threshold)) {
            localStorage.setItem('tempThreshold', threshold);
            this.showNotification(`Limite de alerta definido para ${threshold}°C`);
        }
    }
    
    showNotification(message) {
        // Em um sistema real, mostraria uma notificação na tela
        console.log(`Notificação: ${message}`);
        
        // Para esta demonstração, vamos atualizar o campo de informações
        document.getElementById('info-text').textContent = message;
        
        // Reset após 5 segundos
        setTimeout(() => {
            if (!this.alertStatus.info) {
                document.getElementById('info-text').textContent = 'Sistema operando normalmente';
            }
        }, 5000);
    }
}

// Inicializar a aplicação quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    const monitor = new TemperatureMonitor();
    
    // Expor monitor para o console para testes (remover em produção)
    window.monitor = monitor;
});