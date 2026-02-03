class CameraSystem {
    constructor() {
        this.cameras = []; 
        this.recording = false;
        this.init();
    }
    
    async init() {
        await this.loadCameras(); 
        this.renderGrid();
        this.setupGlobalListeners();
        this.updateSystemStatus();
        
        setInterval(() => this.updateTime(), 1000);
        setInterval(() => this.simulateTelemetry(), 2000);
        setInterval(() => this.refreshCameraFrames(), 2000);
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
            if (!res.ok) throw new Error("API Indisponível");
            const dbCameras = await res.json();
            
            if (Array.isArray(dbCameras) && dbCameras.length > 0) {
                this.cameras = dbCameras;
            } else {
                this.cameras = demoCameras;
            }
        } catch (e) {
            console.warn("Usando Simulação.", e);
            this.cameras = demoCameras;
        }
    }

    refreshCameraFrames() {
        const timestamp = new Date().getTime();
        this.cameras.forEach(cam => {
            if (!cam.isSimulated && cam.url) {
                const img = document.getElementById(`cam-img-${cam.id}`);
                if (img) {
                    // Se estiver marcado que o proxy falhou, usa URL direta
                    if (img.dataset.useDirect === 'true') {
                        const separator = cam.url.includes('?') ? '&' : '?';
                        img.src = `${cam.url}${separator}t=${timestamp}`;
                    } else {
                        // Tenta pelo Proxy padrão
                        img.src = `/api/v1/proxy/camera/${cam.id}?t=${timestamp}`;
                    }
                }
            }
        });
    }

    renderGrid() {
        const grid = document.getElementById('camera-grid');
        grid.innerHTML = '';

        this.cameras.forEach(cam => {
            let videoContent = '';
            
            if (cam.isSimulated) {
                videoContent = `
                    <div class="video-simulation">
                        <div class="bagaco-pile"></div>
                        <div class="temperature-glow" id="glow-${cam.id}"></div>
                    </div>
                `;
            } else {
                // Tenta carregar primeiro pelo Proxy. Se der erro, ativa o modo direto.
                const proxyUrl = `/api/v1/proxy/camera/${cam.id}?t=${Date.now()}`;
                
                videoContent = `
                    <div class="real-video-container" style="background:black; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        <img id="cam-img-${cam.id}" src="${proxyUrl}" 
                             style="width:100%; height:100%; object-fit:cover;" 
                             onerror="this.dataset.useDirect = 'true'; this.src='${cam.url}'">
                        
                        <div class="offline-indicator" style="position:absolute; pointer-events:none; display:none;">
                            <i class="fas fa-wifi" style="color:red"></i>
                        </div>
                    </div>
                `;
            }

            let typeBadge = '';
            if (cam.type === 'ir') typeBadge = '<span style="margin-left:5px; color:#10b981; font-size:10px; border:1px solid #10b981; padding:1px 4px; border-radius:4px;">IR</span>';
            if (cam.type === 'thermal') typeBadge = '<span style="margin-left:5px; color:#f59e0b; font-size:10px; border:1px solid #f59e0b; padding:1px 4px; border-radius:4px;">TERM</span>';
            const simBadge = cam.isSimulated ? '<span style="margin-left:auto; font-size:9px; background:#f59e0b; color:black; padding:2px 4px; border-radius:2px;">DEMO</span>' : '';

            const html = `
                <div class="camera-card" id="card-${cam.id}" data-id="${cam.id}">
                    <div class="camera-header">
                        <div class="camera-title"><i class="fas fa-video"></i> ${cam.name} ${typeBadge}</div>
                        ${simBadge}
                        <div class="camera-status active"><div class="status-dot"></div> LIVE</div>
                    </div>
                    <div class="camera-view">
                        <div class="video-placeholder">
                            <div class="recording-indicator" id="rec-${cam.id}"><div class="recording-dot"></div> REC</div>
                            <div class="video-overlay">
                                <div class="video-time">--:--:--</div>
                                <div class="video-temp" id="temp-${cam.id}">${cam.temp || '--'}°C</div>
                            </div>
                            ${videoContent}
                        </div>
                    </div>
                    <div class="camera-controls">
                        <button class="cam-control" onclick="window.cameraSystem.toggleRec(${cam.id})"><i class="fas fa-record-vinyl"></i></button>
                        <button class="cam-control" onclick="window.location.href='settings.html'"><i class="fas fa-cog"></i></button>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', html);
        });
    }

    simulateTelemetry() {
        this.cameras.forEach(cam => {
            if (cam.isSimulated) {
                const targetTemp = 55;
                if (typeof cam.heatingEvent === 'undefined') cam.heatingEvent = false;
                
                if (!cam.heatingEvent && Math.random() < 0.005) {
                    cam.heatingEvent = true;
                    cam.heatingSteps = 15;
                }

                if (cam.heatingEvent) {
                    cam.temp += 1.5 + Math.random(); 
                    cam.heatingSteps--;
                    if (cam.heatingSteps <= 0) cam.heatingEvent = false;
                } else {
                    const diff = targetTemp - cam.temp;
                    cam.temp += diff * 0.1 + (Math.random() - 0.5) * 0.8;
                }
                cam.temp = Math.max(20, Math.min(120, cam.temp));
                this.updateCameraUI(cam);
            }
        });
        this.updateSystemStatus();
    }

    updateCameraUI(cam) {
        const tempEl = document.getElementById(`temp-${cam.id}`);
        if (tempEl) {
            tempEl.textContent = `${cam.temp.toFixed(1)}°C`;
            const glowEl = document.getElementById(`glow-${cam.id}`);
            if (glowEl) {
                if (cam.temp > 75) glowEl.className = 'temperature-glow high';
                else if (cam.temp > 65) glowEl.className = 'temperature-glow medium';
                else glowEl.className = 'temperature-glow';
            }
        }
    }

    toggleRec(id) {
        document.getElementById(`rec-${id}`)?.classList.toggle('active');
    }

    updateSystemStatus() {
        const activeEl = document.getElementById('active-cameras');
        if(activeEl) activeEl.textContent = `${this.cameras.length}/${this.cameras.length}`;
        const temps = this.cameras.map(c => c.temp || 0);
        const max = temps.length > 0 ? Math.max(...temps) : 0;
        const maxEl = document.getElementById('max-temperature');
        if(maxEl) maxEl.textContent = `${max.toFixed(1)}°C`;
    }

    updateTime() {
        const now = new Date().toLocaleTimeString();
        document.getElementById('current-time').textContent = now;
        document.querySelectorAll('.video-time').forEach(el => el.textContent = now);
    }

    setupGlobalListeners() {
        document.getElementById('record-all')?.addEventListener('click', () => {
            this.recording = !this.recording;
            document.querySelectorAll('.recording-indicator').forEach(el => 
                this.recording ? el.classList.add('active') : el.classList.remove('active')
            );
        });
        
        const addBtn = document.getElementById('add-camera-btn');
        if(addBtn) {
            addBtn.innerHTML = '<i class="fas fa-cog"></i> Configurar';
            addBtn.onclick = () => window.location.href = 'settings.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.cameraSystem = new CameraSystem();
});