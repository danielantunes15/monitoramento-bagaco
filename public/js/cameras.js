class CameraSystem {
    constructor() {
        this.cameras = []; 
        this.recording = false;
        // Variáveis de controle de Zoom Global
        this.zoomState = {}; // Guarda {scale, x, y} por ID de câmera
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

    // --- ATUALIZAÇÃO DE IMAGEM (COM SUPORTE A ZOOM) ---
    refreshCameraFrames() {
        const timestamp = new Date().getTime();
        this.cameras.forEach(cam => {
            if (!cam.isSimulated && cam.url) {
                const img = document.getElementById(`cam-img-${cam.id}`);
                if (img) {
                    // Atualiza o SRC sem perder o zoom (o navegador lida com o replace)
                    let newSrc = '';
                    if (img.dataset.useDirect === 'true') {
                        const separator = cam.url.includes('?') ? '&' : '?';
                        newSrc = `${cam.url}${separator}t=${timestamp}`;
                    } else {
                        newSrc = `/api/v1/proxy/camera/${cam.id}?t=${timestamp}`;
                    }
                    
                    // Só troca se o usuário NÃO estiver arrastando (para evitar flickering)
                    if (!this.zoomState[cam.id]?.isDragging) {
                        img.src = newSrc;
                    }
                }
            }
        });
    }

    renderGrid() {
        const grid = document.getElementById('camera-grid');
        grid.innerHTML = '';

        // --- DETECÇÃO DE CÂMERA ÚNICA ---
        // Se tiver só 1 câmera, adiciona a classe especial no CSS
        if (this.cameras.length === 1) {
            grid.classList.add('single-view');
        } else {
            grid.classList.remove('single-view');
        }

        this.cameras.forEach(cam => {
            // Inicializa estado de zoom para esta câmera
            this.zoomState[cam.id] = { scale: 1, x: 0, y: 0, isDragging: false };

            let videoContent = '';
            
            if (cam.isSimulated) {
                videoContent = `
                    <div class="video-simulation">
                        <div class="bagaco-pile"></div>
                        <div class="temperature-glow" id="glow-${cam.id}"></div>
                    </div>
                `;
            } else {
                const proxyUrl = `/api/v1/proxy/camera/${cam.id}?t=${Date.now()}`;
                
                // Adicionei a classe 'zoomable-image' e o ID no container 'zoom-container-${cam.id}'
                videoContent = `
                    <div class="real-video-container zoom-container" id="zoom-container-${cam.id}" 
                         style="background:black; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        
                        <img id="cam-img-${cam.id}" class="zoomable-image" src="${proxyUrl}" 
                             style="width:100%; height:100%; object-fit:cover;" 
                             onerror="this.dataset.useDirect = 'true'; this.src='${cam.url}'">
                        
                        <div class="offline-indicator" style="position:absolute; pointer-events:none; display:none;">
                            <i class="fas fa-wifi" style="color:red"></i>
                        </div>
                    </div>
                `;
            }

            const html = `
                <div class="camera-card" id="card-${cam.id}" data-id="${cam.id}">
                    <div class="camera-header">
                        <div class="camera-title"><i class="fas fa-video"></i> ${cam.name}</div>
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
                        <button class="cam-control" onclick="window.cameraSystem.resetZoom(${cam.id})" title="Resetar Zoom"><i class="fas fa-compress"></i></button>
                        <button class="cam-control" onclick="window.cameraSystem.toggleRec(${cam.id})"><i class="fas fa-record-vinyl"></i></button>
                        <button class="cam-control" onclick="window.location.href='settings.html'"><i class="fas fa-cog"></i></button>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', html);

            // Se for câmera real, ativa o Zoom/Pan
            if (!cam.isSimulated) {
                setTimeout(() => this.enableZoomPan(cam.id), 100);
            }
        });
    }

    // --- NOVA FUNCIONALIDADE: ZOOM E PAN ---
    enableZoomPan(id) {
        const container = document.getElementById(`zoom-container-${id}`);
        const img = document.getElementById(`cam-img-${id}`);
        
        if (!container || !img) return;

        let startX, startY;

        // 1. ZOOM COM A RODINHA (Wheel)
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const state = this.zoomState[id];

            // Ajusta escala (0.1 por "clique" da roda)
            const delta = e.deltaY * -0.001;
            const newScale = Math.min(Math.max(1, state.scale + delta), 5); // Max Zoom 5x
            
            state.scale = newScale;
            this.applyTransform(id);
        });

        // 2. INICIAR ARRASTO (MouseDown)
        container.addEventListener('mousedown', (e) => {
            if (this.zoomState[id].scale > 1) { // Só arrasta se tiver zoom
                this.zoomState[id].isDragging = true;
                startX = e.clientX - this.zoomState[id].x;
                startY = e.clientY - this.zoomState[id].y;
                container.style.cursor = 'grabbing';
            }
        });

        // 3. MOVER (MouseMove)
        container.addEventListener('mousemove', (e) => {
            if (!this.zoomState[id].isDragging) return;
            e.preventDefault();
            
            const state = this.zoomState[id];
            state.x = e.clientX - startX;
            state.y = e.clientY - startY;
            
            this.applyTransform(id);
        });

        // 4. PARAR ARRASTO (MouseUp/Leave)
        const stopDrag = () => {
            this.zoomState[id].isDragging = false;
            container.style.cursor = 'grab';
        };
        container.addEventListener('mouseup', stopDrag);
        container.addEventListener('mouseleave', stopDrag);
    }

    applyTransform(id) {
        const img = document.getElementById(`cam-img-${id}`);
        const state = this.zoomState[id];
        if (img) {
            img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
        }
    }

    resetZoom(id) {
        this.zoomState[id] = { scale: 1, x: 0, y: 0, isDragging: false };
        this.applyTransform(id);
    }
    // ---------------------------------------

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