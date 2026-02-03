class VideoWall {
    constructor() {
        this.cameras = []; 
        this.currentLayout = '3x2';
        this.autoRotate = false;
        this.rotateInterval = null;
        this.currentPage = 0;
        this.refreshInterval = null;
        
        this.init();
    }

    async init() {
        await this.loadCameras(); 
        this.render();
        this.startClock();
        
        // Loop de telemetria
        setInterval(() => this.simulateTelemetry(), 2000);
        // Loop de atualização de imagens (Híbrido)
        this.refreshInterval = setInterval(() => this.refreshImages(), 2000);
        
        document.addEventListener('keydown', (e) => {
            if(e.key === 'r') this.toggleRotation();
            if(e.key === '1') this.setLayout('2x2');
            if(e.key === '2') this.setLayout('3x2');
        });
    }

    async loadCameras() {
        const demoCameras = [
            { id: 1, name: 'Simulação - Pilha Norte', location: 'Setor A (Demo)', temp: 54, status: 'active', isSimulated: true, type: 'normal' },
            { id: 2, name: 'Simulação - Pilha Sul', location: 'Setor B (Demo)', temp: 58, status: 'active', isSimulated: true, type: 'ir' },
            { id: 3, name: 'Simulação - Processo', location: 'Moenda (Demo)', temp: 62, status: 'active', isSimulated: true, type: 'thermal' },
            { id: 4, name: 'Simulação - Caldeira', location: 'Gerador (Demo)', temp: 45, status: 'active', isSimulated: true, type: 'normal' }
        ];

        try {
            const res = await fetch('/api/v1/cameras');
            if (!res.ok) throw new Error("API Offline");
            
            const dbCameras = await res.json();
            if (Array.isArray(dbCameras) && dbCameras.length > 0) {
                this.cameras = dbCameras;
            } else {
                this.cameras = demoCameras;
            }
        } catch (e) {
            this.cameras = demoCameras;
        }
    }

    refreshImages() {
        const timestamp = new Date().getTime();
        this.cameras.forEach((cam, index) => {
            if (!cam.isSimulated && cam.url) {
                const img = document.getElementById(`wall-img-${cam.id}-${index}`);
                if (img) {
                    // Lógica Híbrida: Tenta Proxy, se falhar (marcado no render), vai direto
                    if (img.dataset.useDirect === 'true') {
                        const separator = cam.url.includes('?') ? '&' : '?';
                        img.src = `${cam.url}${separator}t=${timestamp}`;
                    } else {
                        img.src = `/api/v1/proxy/camera/${cam.id}?t=${timestamp}`;
                    }
                }
            }
        });
    }

    render() {
        const grid = document.getElementById('wall-grid');
        if (!grid) return;
        
        grid.className = `wall-grid layout-${this.currentLayout}`;
        grid.innerHTML = '';

        const slots = this.getSlotsCount(this.currentLayout);
        const start = this.currentPage * slots;
        const visibleCameras = this.cameras.slice(start, start + slots);
        
        if (visibleCameras.length < slots && this.cameras.length > 0) {
            let i = 0;
            while (visibleCameras.length < slots) {
                visibleCameras.push(this.cameras[i % this.cameras.length]);
                i++;
            }
        }

        visibleCameras.forEach((cam, index) => {
            const isMain = (this.currentLayout === 'focus' && index === 0);
            const div = document.createElement('div');
            div.className = `wall-item ${isMain ? 'focus-main' : ''}`;
            div.id = `wall-item-${cam.id}-${index}`; 

            let videoContent = '';
            if (cam.isSimulated || !cam.url) {
                videoContent = `
                    <div class="video-simulation" style="width:100%; height:100%; position:relative; overflow:hidden;">
                        <div class="bagaco-pile"></div>
                        <div class="temperature-glow" id="glow-${cam.id}-${index}"></div>
                    </div>
                `;
            } else {
                // Configuração Inicial: Proxy com Fallback no 'onerror'
                const proxyUrl = `/api/v1/proxy/camera/${cam.id}?t=${Date.now()}`;
                videoContent = `
                    <div style="width:100%; height:100%; background:black; display:flex; align-items:center; justify-content:center;">
                        <img id="wall-img-${cam.id}-${index}" 
                             src="${proxyUrl}" 
                             style="width:100%; height:100%; object-fit:cover;" 
                             onerror="this.dataset.useDirect='true'; this.src='${cam.url}'">
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="wall-overlay">
                    <div class="cam-tag">${cam.name}</div>
                    <div class="cam-alert" id="alert-${cam.id}-${index}" style="display:none;">ALERTA CALOR</div>
                </div>
                <div class="video-content" style="width:100%; height:100%; background: #111;">
                    ${videoContent}
                </div>
                <div class="wall-stats">
                    <span><i class="fas fa-thermometer-half"></i> <span id="temp-${cam.id}-${index}">${(cam.temp || 0).toFixed(1)}</span>°C</span>
                    <span><i class="fas fa-wifi"></i> LIVE</span>
                </div>
            `;
            grid.appendChild(div);
        });
    }

    simulateTelemetry() {
        this.cameras.forEach(cam => {
            if (cam.isSimulated) {
                const targetTemp = 55;
                const diff = targetTemp - cam.temp;
                cam.temp += diff * 0.1 + (Math.random() - 0.5) * 0.8;
                cam.temp = Math.max(20, Math.min(120, cam.temp));
            }
        });
        this.updateUI();
    }

    updateUI() {
        const slots = this.getSlotsCount(this.currentLayout);
        const start = this.currentPage * slots;
        const visibleCams = this.cameras.slice(start, start + slots);
        
        if (visibleCams.length < slots && this.cameras.length > 0) {
            let i = 0;
            while (visibleCams.length < slots) {
                visibleCams.push(this.cameras[i % this.cameras.length]);
                i++;
            }
        }

        visibleCams.forEach((cam, index) => {
            const tempEl = document.getElementById(`temp-${cam.id}-${index}`);
            if (tempEl) tempEl.textContent = cam.temp.toFixed(1);

            const alertEl = document.getElementById(`alert-${cam.id}-${index}`);
            const itemEl = document.getElementById(`wall-item-${cam.id}-${index}`);
            
            if (cam.temp > 70) {
                if(alertEl) alertEl.style.display = 'block';
                if(itemEl) itemEl.style.border = '2px solid #ef4444';
            } else {
                if(alertEl) alertEl.style.display = 'none';
                if(itemEl) itemEl.style.border = '1px solid #222';
            }

            const glowEl = document.getElementById(`glow-${cam.id}-${index}`);
            if (glowEl) {
                let glowClass = '';
                if (cam.temp > 70) glowClass = 'high';
                else if (cam.temp > 60) glowClass = 'medium';
                glowEl.className = `temperature-glow ${glowClass}`;
            }
        });
    }

    getSlotsCount(layout) {
        switch(layout) {
            case '2x2': return 4;
            case '3x2': return 6;
            case '4x4': return 16;
            case 'focus': return 4;
            default: return 6;
        }
    }

    setLayout(layout) {
        this.currentLayout = layout;
        this.currentPage = 0;
        document.querySelectorAll('.wall-btn').forEach(btn => btn.classList.remove('active'));
        event.target.closest('button')?.classList.add('active');
        this.render();
    }

    toggleRotation() {
        this.autoRotate = !this.autoRotate;
        const btn = document.querySelector('button[onclick="videoWall.toggleRotation()"]');
        if (this.autoRotate) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Rotacionando...';
            this.rotateInterval = setInterval(() => this.nextPage(), 5000);
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fas fa-sync"></i> Auto-Rotate';
            clearInterval(this.rotateInterval);
        }
    }

    nextPage() {
        const slots = this.getSlotsCount(this.currentLayout);
        const maxPages = Math.ceil(this.cameras.length / slots);
        this.currentPage++;
        if (this.currentPage >= maxPages) this.currentPage = 0;
        this.render();
    }

    startClock() {
        setInterval(() => {
            document.getElementById('clock').textContent = new Date().toLocaleTimeString();
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.videoWall = new VideoWall();
});