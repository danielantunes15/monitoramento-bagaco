class AlertSystem {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Solicita permissão para Push
    async requestPermission() {
        if (Notification.permission !== "granted") {
            await Notification.requestPermission();
        }
    }

    // Dispara Push no navegador
    showPush(message) {
        if (Notification.permission === "granted") {
            new Notification("BEL FIRE ALERT", {
                body: message,
                icon: '/img/fire-icon.png'
            });
        }
    }

    // Sirene Virtual (Audio Sintetizado)
    playSiren() {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 1.5);
    }
}