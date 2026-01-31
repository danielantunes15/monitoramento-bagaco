/**
 * BEL FIRE - Core Application Logic
 * Inclui: WebSocket, i18n, Atalhos e Gestão de Dados
 */

// --- Configuração de Idiomas ---
const translations = {
    pt: {
        title: "Monitoramento",
        status: "Status do Sistema",
        temp: "Temperatura",
        humidity: "Umidade",
        pressure: "Pressão",
        online: "Online",
        disconnected: "Desconectado",
        sprinkler: "Sprinkler Ativo",
        fan: "Ventilação Ativa"
    },
    en: {
        title: "Monitoring",
        status: "System Status",
        temp: "Temperature",
        humidity: "Humidity",
        pressure: "Pressure",
        online: "Online",
        disconnected: "Disconnected",
        sprinkler: "Sprinkler ON",
        fan: "Fan ON"
    },
    es: {
        title: "Monitoreo",
        status: "Estado del Sistema",
        temp: "Temperatura",
        humidity: "Humedad",
        pressure: "Presión",
        online: "En Línea",
        disconnected: "Desconectado",
        sprinkler: "Rociador Activo",
        fan: "Ventilación Activa"
    }
};

class SystemController {
    constructor() {
        this.socket = null;
        this.currentLang = localStorage.getItem('belfire_lang') || 'pt';
        this.isDarkMode = localStorage.getItem('belfire_theme') === 'dark';
        
        this.init();
    }

    init() {
        this.setupWebSocket();
        this.setupKeyboardShortcuts();
        this.applyTheme();
        this.applyLanguage(this.currentLang);
        
        // Atualiza relógio
        setInterval(() => this.updateClock(), 1000);

        console.log("🚀 BEL FIRE Client Iniciado");
    }

    // --- WebSocket ---
    setupWebSocket() {
        // Detecção automática do host (funciona local e em rede)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log("Conectado ao servidor");
            this.updateConnectionStatus(true);
        };

        this.socket.onclose = () => {
            console.warn("Desconectado. Tentando reconectar em 3s...");
            this.updateConnectionStatus(false);
            setTimeout(() => this.setupWebSocket(), 3000);
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'sensor_update') this.handleSensorUpdate(msg);
                if (msg.type === 'notification') this.handleNotification(msg);
            } catch (e) {
                console.error("Erro no parse:", e);
            }
        };
    }

    // --- Manipulação de Dados ---
    handleSensorUpdate(msg) {
        const { sensorId, data } = msg;
        
        // Atualiza Cards de Sensores (se existirem na tela)
        const card = document.querySelector(`[data-sensor="${sensorId}"]`);
        if (card) {
            // Atualiza Texto
            const tempEl = document.getElementById(`sensor-${sensorId}-temp`);
            if (tempEl) tempEl.textContent = `${data.temp.toFixed(1)}°C`;
            
            // Novos Campos: Umidade e Pressão (se você adicionar ao HTML depois)
            const humidEl = document.getElementById(`sensor-${sensorId}-humid`);
            if (humidEl) humidEl.textContent = `${data.humidity.toFixed(0)}%`;

            // Indicadores Visuais de Sprinkler/Ventilador
            if (data.sprinkler === 'ON') {
                card.classList.add('sprinkler-active'); // Classe CSS para efeito visual
                this.showToast(`💦 Sprinkler ativado no Sensor ${sensorId}!`, 'critical');
            } else {
                card.classList.remove('sprinkler-active');
            }

            // Atualiza classes de alerta
            card.className = `sensor-card ${data.alerta}`;
            if (data.sprinkler === 'ON') card.classList.add('critical-animation');
        }
        
        // Se estiver no Dashboard principal (Gauge)
        if (sensorId === '1') { // Exemplo: Sensor 1 é o principal
            this.updateMainGauge(data.temp);
        }
    }

    updateMainGauge(temp) {
        const gaugeVal = document.getElementById('gauge-value');
        const gaugeFill = document.getElementById('gauge-fill');
        
        if (gaugeVal) gaugeVal.textContent = temp.toFixed(1);
        if (gaugeFill) {
            const rotation = Math.min(180, (temp / 100) * 180);
            gaugeFill.style.transform = `rotate(${rotation}deg)`;
        }
    }

    handleNotification(msg) {
        // Exibe notificação visual
        const banner = document.getElementById('alert-banner');
        const msgSpan = document.getElementById('alert-message');
        
        if (banner && msgSpan) {
            msgSpan.textContent = msg.message;
            banner.style.display = 'flex';
            
            // Sons de alerta
            if (msg.alertType === 'critical') this.playAlertSound();
        }
    }

    // --- Interface e UX ---
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Atalhos com ALT + Tecla
            if (e.altKey) {
                switch(e.key.toLowerCase()) {
                    case 'd': // Dashboard
                        window.location.href = 'dashboard.html';
                        break;
                    case 'c': // Câmeras
                        window.location.href = 'index.html'; // ou cameras.html
                        break;
                    case 't': // Alternar Tema
                        this.toggleTheme();
                        break;
                    case 'l': // Alternar Idioma
                        this.cycleLanguage();
                        break;
                }
            }
        });
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('belfire_theme', this.isDarkMode ? 'dark' : 'light');
        this.applyTheme();
    }

    applyTheme() {
        if (this.isDarkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    cycleLanguage() {
        const langs = ['pt', 'en', 'es'];
        const currentIndex = langs.indexOf(this.currentLang);
        const nextIndex = (currentIndex + 1) % langs.length;
        this.currentLang = langs[nextIndex];
        localStorage.setItem('belfire_lang', this.currentLang);
        this.applyLanguage(this.currentLang);
    }

    applyLanguage(lang) {
        const t = translations[lang];
        // Exemplo simples de tradução de elementos com data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });
    }

    updateConnectionStatus(isOnline) {
        const statusEl = document.querySelector('.system-status span');
        const dot = document.querySelector('.status-dot');
        if (statusEl && dot) {
            statusEl.textContent = isOnline ? translations[this.currentLang].online : translations[this.currentLang].disconnected;
            dot.style.backgroundColor = isOnline ? '#10b981' : '#ef4444';
        }
    }

    updateClock() {
        const now = new Date();
        const el = document.getElementById('current-time');
        if (el) el.textContent = now.toLocaleTimeString();
    }

    playAlertSound() {
        // Implementação simples de beep
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    }
    
    showToast(msg, type) {
        // Lógica simples de toast/notificação flutuante
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }
}

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SystemController();
});