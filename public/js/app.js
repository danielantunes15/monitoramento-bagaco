/**
 * BEL FIRE - Core Application Logic
 * Integrado com Monitoramento 3D
 */

const translations = {
    pt: { title: "Monitoramento", status: "Status", online: "Online", disconnected: "Offline" },
    en: { title: "Monitoring", status: "Status", online: "Online", disconnected: "Offline" },
    es: { title: "Monitoreo", status: "Estado", online: "En Línea", disconnected: "Desconectado" }
};

class SystemController {
    constructor() {
        this.socket = null;
        this.currentLang = localStorage.getItem('belfire_lang') || 'pt';
        this.isDarkMode = localStorage.getItem('belfire_theme') !== 'light';
        this.init();
    }

    init() {
        this.setupWebSocket();
        this.setupKeyboardShortcuts();
        this.applyTheme();
        setInterval(() => this.updateClock(), 1000);
        console.log("🚀 BEL FIRE Client Iniciado");
    }

    setupWebSocket() {
        if (window.location.protocol === 'file:' || !window.location.host) {
            console.warn("⚠️ Modo Offline. WebSocket desativado.");
            this.updateConnectionStatus(false);
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.socket = new WebSocket(wsUrl);
            this.socket.onopen = () => {
                console.log("Conectado ao servidor");
                this.updateConnectionStatus(true);
            };
            this.socket.onclose = () => {
                this.updateConnectionStatus(false);
                setTimeout(() => this.setupWebSocket(), 3000);
            };
            this.socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'sensor_update') this.handleSensorUpdate(msg);
                    if (msg.type === 'notification') this.handleNotification(msg);
                } catch (e) { console.error(e); }
            };
        } catch (error) { console.error(error); }
    }

    handleSensorUpdate(msg) {
        const { sensorId, data } = msg;
        
        // 1. Atualiza Dashboard (HTML)
        const card = document.querySelector(`[data-sensor="${sensorId}"]`) || document.getElementById(`card-${sensorId}`);
        if (card) {
            const tempEl = document.getElementById(`sensor-${sensorId}-temp`) || document.getElementById(`temp-${sensorId}`);
            if (tempEl) tempEl.textContent = `${data.temp.toFixed(1)}°C`;
            
            // Classes visuais
            card.className = card.className.replace(/normal|warning|critical/g, ''); 
            card.classList.add(data.alerta || 'normal');
        }

        // 2. Atualiza Digital Twin 3D (Se estiver aberto ou rodando)
        // Chama a função global definida no monitor3d.js
        if (typeof window.update3DAlert === 'function') {
            window.update3DAlert(sensorId, data.temp, data.alerta);
        }
    }

    handleNotification(msg) {
        const banner = document.getElementById('alert-banner');
        const msgSpan = document.getElementById('alert-message');
        if (banner && msgSpan) {
            msgSpan.textContent = msg.message;
            banner.style.display = 'flex';
            setTimeout(() => { banner.style.display = 'none'; }, 10000);
        }
    }

    // --- Helpers de UI ---
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 't') this.toggleTheme();
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

    updateConnectionStatus(isOnline) {
        const statusEl = document.querySelector('.system-status span');
        const dot = document.querySelector('.status-dot');
        if (statusEl && dot) {
            statusEl.textContent = isOnline ? "Online" : "Offline";
            dot.style.backgroundColor = isOnline ? '#10b981' : '#ef4444';
        }
    }

    updateClock() {
        const el = document.getElementById('current-time');
        if(el) el.textContent = new Date().toLocaleTimeString();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(console.error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new SystemController();
});