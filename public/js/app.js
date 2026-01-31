class TemperatureMonitor {
    constructor() {
        this.socket = new WebSocket(`ws://${window.location.host}`);
        this.sensors = {};
        this.init();
    }

    init() {
        this.setupWebSocket();
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
    }

    setupWebSocket() {
        this.socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'sensor_update') {
                this.handleSensorData(msg);
            }
        };
    }

    handleSensorData(data) {
        // Atualiza ou cria o card do sensor
        const sensorKey = `sensor-${data.sensorId}`;
        let sensorElem = document.getElementById(sensorKey);

        if (!sensorElem) {
            sensorElem = this.createSensorCard(data);
            document.querySelector('.sensors-grid').appendChild(sensorElem);
        }

        this.updateSensorUI(sensorElem, data);
    }

    createSensorCard(data) {
        const div = document.createElement('div');
        div.id = `sensor-${data.sensorId}`;
        div.className = 'sensor-card';
        // Diferenciação visual baseada no tipo
        const icon = data.type_sensor === 'superficie' ? 'fa-video' : 'fa-probe';
        
        div.innerHTML = `
            <div class="sensor-header">
                <span class="sensor-id"><i class="fas ${icon}"></i> #${data.sensorId}</span>
                <span class="sensor-type">${data.type_sensor.toUpperCase()}</span>
            </div>
            <div class="temp-value">--°C</div>
            <div class="sensor-trend"></div>
            <div class="sensor-location">Pilha de Bagaço</div>
        `;
        return div;
    }

    updateSensorUI(elem, data) {
        const tempDisplay = elem.querySelector('.temp-value');
        const trendDisplay = elem.querySelector('.sensor-trend');

        tempDisplay.textContent = `${data.temp.toFixed(1)}°C`;
        
        // Aplica cores baseadas no status validado pelo servidor
        elem.className = `sensor-card ${data.status}`;

        // Alerta de subida rápida
        if (data.isRisingFast) {
            trendDisplay.innerHTML = `<i class="fas fa-arrow-up"></i> Aquecimento Rápido`;
            trendDisplay.style.color = 'var(--danger-color)';
        } else {
            trendDisplay.innerHTML = '';
        }
    }

    updateTime() {
        const now = new Date();
        document.getElementById('current-time').textContent = now.toLocaleTimeString('pt-BR');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.monitor = new TemperatureMonitor();
});