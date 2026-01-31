/**
 * BEL FIRE - Core Application Logic
 * Inclui: WebSocket, i18n, Atalhos, Gestão de Dados e PWA (Offline)
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
        this.isDarkMode = localStorage.getItem('belfire_theme') !== 'light'; // Default Dark
        
        this.init();
    }

    init() {
        this.setupWebSocket();
        this.setupKeyboardShortcuts();
        this.applyTheme();
        this.applyLanguage(this.currentLang);
        this.registerServiceWorker(); // PWA
        
        // Atualiza relógio
        setInterval(() => this.updateClock(), 1000);

        console.log("🚀 BEL FIRE Client Iniciado");
    }

    // --- WebSocket ---
    setupWebSocket() {
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
        
        // Atualiza Cards de Sensores (se existirem na tela - Dashboard/Index)
        const card = document.querySelector(`[data-sensor="${sensorId}"]`) || document.getElementById(`card-${sensorId}`);
        
        if (card) {
            // Atualiza Texto Temp
            const tempEl = document.getElementById(`sensor-${sensorId}-temp`) || document.getElementById(`temp-${sensorId}`);
            if (tempEl) tempEl.textContent = `${data.temp.toFixed(1)}°C`;
            
            // Novos Campos
            const humidEl = document.getElementById(`sensor-${sensorId}-humid`);
            if (humidEl) humidEl.textContent = `${data.humidity.toFixed(0)}%`;

            // Indicadores Visuais de Sprinkler/Ventilador (Dashboard)
            if (data.sprinkler === 'ON') {
                card.classList.add('sprinkler-active');
                this.showToast(`💦 Sprinkler ativado no Sensor ${sensorId}!`, 'critical');
            } else {
                card.classList.remove('sprinkler-active');
            }

            // Atualiza classes de alerta
            card.className = card.className.replace(/normal|warning|critical/g, ''); // Limpa anteriores
            card.classList.add(data.alerta || 'normal');
            
            if (data.sprinkler === 'ON') card.classList.add('critical-animation');
        }
        
        // Se estiver no Dashboard principal (Gauge do Sensor 1 como exemplo)
        if (sensorId === '1' && typeof this.updateMainGauge === 'function') {
            this.updateMainGauge(data.temp);
        }
    }

    handleNotification(msg) {
        const banner = document.getElementById('alert-banner');
        const msgSpan = document.getElementById('alert-message');
        
        if (banner && msgSpan) {
            msgSpan.textContent = msg.message;
            banner.style.display = 'flex';
            
            if (msg.alertType === 'critical') {
                banner.style.background = 'linear-gradient(90deg, #ef4444, #b91c1c)';
                this.playAlertSound();
            } else {
                banner.style.background = '#3b82f6';
            }

            // Auto-hide após 10s
            setTimeout(() => { banner.style.display = 'none'; }, 10000);
        }
    }

    // --- Interface e UX ---
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.altKey) {
                switch(e.key.toLowerCase()) {
                    case 'd': window.location.href = 'dashboard.html'; break;
                    case 'c': window.location.href = 'index.html'; break;
                    case '3': window.location.href = 'monitor3d.html'; break;
                    case 't': this.toggleTheme(); break;
                    case 'l': this.cycleLanguage(); break;
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
        if (this.isDarkMode) document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');
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
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });
    }

    updateConnectionStatus(isOnline) {
        const statusEl = document.querySelector('.system-status span');
        const dot = document.querySelector('.status-dot');
        if (statusEl && dot) {
            const text = isOnline ? translations[this.currentLang].online : translations[this.currentLang].disconnected;
            statusEl.textContent = text;
            dot.style.backgroundColor = isOnline ? '#10b981' : '#ef4444';
        }
    }

    updateClock() {
        const now = new Date();
        const el = document.getElementById('current-time');
        if (el) el.textContent = now.toLocaleTimeString();
    }

    playAlertSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch(e) { console.log("Áudio bloqueado pelo navegador"); }
    }
    
    showToast(msg, type) {
        console.log(`[${type.toUpperCase()}] ${msg}`);
    }

    // --- PWA & OFFLINE SUPPORT ---
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => console.log('✅ PWA Registrado:', registration.scope))
                    .catch(err => console.log('❌ Erro PWA:', err));
            });
        }

        // Listeners de Status de Rede
        window.addEventListener('online', () => {
            document.body.classList.remove('offline-mode');
            this.handleNotification({ message: 'Conexão Restaurada! Sincronizando...', alertType: 'info' });
        });

        window.addEventListener('offline', () => {
            document.body.classList.add('offline-mode');
            this.handleNotification({ message: 'VOCÊ ESTÁ OFFLINE. Modo Local Ativado.', alertType: 'warning' });
        });
    }
}

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SystemController();
});