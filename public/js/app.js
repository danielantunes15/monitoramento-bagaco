/**
 * BEL FIRE - Aplicação Principal
 * Coordena a recepção de dados via WebSocket e atualiza a interface.
 */
class TemperatureMonitor {
    constructor() {
        // Inicializa a conexão WebSocket com o servidor
        this.socket = new WebSocket(`ws://${window.location.host}`);
        
        // Instancia o sistema de alertas (deve estar no arquivo alerts.js)
        this.alertSystem = typeof AlertSystem !== 'undefined' ? new AlertSystem() : null;
        
        this.sensors = {};
        this.init();
    }

    init() {
        // Solicita permissão para notificações push se o sistema de alertas existir
        if (this.alertSystem) {
            this.alertSystem.requestPermission();
        }

        this.setupWebSocket();
        this.updateTime();
        
        // Atualiza o relógio da interface a cada segundo
        setInterval(() => this.updateTime(), 1000);
    }

    /**
     * Configura os ouvintes de eventos do WebSocket
     */
    setupWebSocket() {
        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Trata notificações de sistema (Push e Sirene)
                if (msg.type === 'notification') {
                    this.handleGlobalNotification(msg);
                }

                // Trata atualizações de dados dos sensores
                if (msg.type === 'sensor_update') {
                    this.updateSensorUI(msg);
                }
            } catch (error) {
                console.error("Erro ao processar mensagem do servidor:", error);
            }
        };

        this.socket.onclose = () => {
            console.warn("Conexão com o servidor BEL FIRE perdida. Tentando reconectar...");
            document.getElementById('status-text').textContent = "Desconectado";
            document.getElementById('status-indicator').className = "status-dot inactive";
        };
    }

    /**
     * Gerencia alertas globais enviados pelo backend
     */
    handleGlobalNotification(msg) {
        if (this.alertSystem) {
            this.alertSystem.showPush(msg.message);
            
            // Ativa a sirene virtual apenas para alertas críticos
            if (msg.alertType === 'critical') {
                this.alertSystem.playSiren();
            }
        }
        
        // Atualiza o banner de alerta na interface, se disponível
        const alertBanner = document.getElementById('alert-message');
        if (alertBanner) {
            alertBanner.textContent = msg.message;
        }
    }

    /**
     * Atualiza os elementos visuais dos sensores no Dashboard
     */
    updateSensorUI(data) {
        const sensorKey = `sensor-${data.sensorId}`;
        const tempDisplay = document.getElementById(`${sensorKey}-temp`);
        const sensorCard = document.querySelector(`[data-sensor="${data.sensorId}"]`);

        if (tempDisplay) {
            tempDisplay.textContent = `${data.temp.toFixed(1)}°C`;
        }

        if (sensorCard) {
            // Aplica as classes CSS de status (normal, warning, critical)
            // As animações são controladas pelo style.css
            sensorCard.className = `sensor-card ${data.status}`;
            
            // Exibe indicador de subida rápida se detectado pelo backend
            const trendLabel = sensorCard.querySelector('.temp-label');
            if (data.isRisingFast) {
                trendLabel.innerHTML = `<i class="fas fa-arrow-up"></i> Aquecimento Rápido`;
                trendLabel.style.color = "var(--danger-color)";
            } else {
                trendLabel.textContent = "Temperatura";
                trendLabel.style.color = "";
            }
        }
    }

    /**
     * Atualiza o relógio global da interface
     */
    updateTime() {
        const now = new Date();
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString('pt-BR');
        }
    }
}

// Inicializa o sistema BEL FIRE ao carregar o DOM
document.addEventListener('DOMContentLoaded', () => {
    window.monitor = new TemperatureMonitor();
});