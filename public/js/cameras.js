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
        
        // Loops de atualização
        setInterval(() => this.updateTime(), 1000);
        setInterval(() => this.simulateTelemetry(), 2000);
    }

    async loadCameras() {
        // DADOS DE APRESENTAÇÃO (SIMULAÇÃO)
        // Temperaturas iniciais ajustadas para não começarem gritando alerta
        const demoCameras = [
            { id: 1, name: 'Simulação - Pilha Norte', location: 'Setor A (Demo)', temp: 54, status: 'active', isSimulated: true, type: 'normal' },
            { id: 2, name: 'Simulação - Pilha Sul', location: 'Setor B (Demo)', temp: 58, status: 'active', isSimulated: true, type: 'ir' },
            { id: 3, name: 'Simulação - Processo', location: 'Moenda (Demo)', temp: 62, status: 'active', isSimulated: true, type: 'thermal' }, // Baixei de 82 para 62
            { id: 4, name: 'Simulação - Caldeira', location: 'Gerador (Demo)', temp: 45, status: 'active', isSimulated: true, type: 'normal' }
        ];

        try {
            // Tenta buscar do servidor
            const res = await fetch('/api/v1/cameras');
            
            if (!res.ok) throw new Error("API Indisponível");

            const dbCameras = await res.json();
            
            // Se tiver câmeras reais cadastradas, usa elas. Se não, usa Demo.
            if (Array.isArray(dbCameras) && dbCameras.length > 0) {
                console.log("Câmeras reais detectadas. Modo Operacional.");
                this.cameras = dbCameras;
            } else {
                console.log("Nenhuma câmera cadastrada. Ativando Modo Apresentação.");
                this.cameras = demoCameras;
            }

        } catch (e) {
            console.warn("Servidor offline ou sem dados. Usando Simulação.", e);
            this.cameras = demoCameras;
        }
    }

    renderGrid() {
        const grid = document.getElementById('camera-grid');
        grid.innerHTML = '';

        this.cameras.forEach(cam => {
            let videoContent = '';
            
            // Mostra simulação se for demo ou não tiver IP configurado
            if (cam.isSimulated || !cam.url) {
                videoContent = `
                    <div class="video-simulation">
                        <div class="bagaco-pile"></div>
                        <div class="temperature-glow" id="glow-${cam.id}"></div>
                    </div>
                `;
            } else {
                // Tenta carregar stream real
                videoContent = `
                    <div class="simulated-video" style="background:black; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        <img src="${cam.url}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                        <div style="display:none; color:white; text-align:center;">
                            <i class="fas fa-video-slash fa-2x"></i><br>Sinal Interrompido
                        </div>
                    </div>
                `;
            }

            // Badges
            let typeBadge = '';
            if (cam.type === 'ir') typeBadge = '<span style="margin-left:5px; color:#10b981; font-size:10px; border:1px solid #10b981; padding:1px 4px; border-radius:4px;">IR</span>';
            if (cam.type === 'thermal') typeBadge = '<span style="margin-left:5px; color:#f59e0b; font-size:10px; border:1px solid #f59e0b; padding:1px 4px; border-radius:4px;">TERM</span>';
            const simBadge = cam.isSimulated ? '<span style="margin-left:auto; font-size:9px; background:#f59e0b; color:black; padding:2px 4px; border-radius:2px;">DEMO</span>' : '';

            const html = `
                <div class="camera-card ${cam.type === 'ir' ? 'night-vision-capable' : ''}" id="card-${cam.id}" data-id="${cam.id}">
                    <div class="camera-header">
                        <div class="camera-title">
                            <i class="fas fa-video"></i> ${cam.name}
                            ${typeBadge}
                        </div>
                        ${simBadge}
                        <div class="camera-status active"><div class="status-dot"></div> LIVE</div>
                    </div>
                    <div class="camera-view">
                        <div class="video-placeholder">
                            <div class="recording-indicator" id="rec-${cam.id}">
                                <div class="recording-dot"></div> REC
                            </div>
                            <div class="video-overlay">
                                <div class="video-time">--:--:--</div>
                                <div class="video-temp" id="temp-${cam.id}">${cam.temp || '--'}°C</div>
                            </div>
                            ${videoContent}
                        </div>
                    </div>
                    <div class="camera-controls">
                        <button class="cam-control" onclick="window.cameraSystem.toggleRec(${cam.id})"><i class="fas fa-record-vinyl"></i></button>
                        <button class="cam-control" onclick="alert('Configuração IP: ${cam.url || 'N/A'}')"><i class="fas fa-cog"></i></button>
                    </div>
                    <div class="camera-info">
                        <span><i class="fas fa-map-marker-alt"></i> ${cam.location}</span>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', html);
        });
    }

    // --- NOVA LÓGICA DE SIMULAÇÃO INTELIGENTE ---
    simulateTelemetry() {
        this.cameras.forEach(cam => {
            if (cam.isSimulated) {
                // Temperatura alvo segura (para onde ela tende a voltar)
                const targetTemp = 55;

                // Inicializa variáveis de controle de simulação se não existirem
                if (typeof cam.heatingEvent === 'undefined') cam.heatingEvent = false;
                if (typeof cam.heatingSteps === 'undefined') cam.heatingSteps = 0;

                // Chance RARA (0.5%) de iniciar um evento de superaquecimento
                if (!cam.heatingEvent && Math.random() < 0.005) {
                    cam.heatingEvent = true;
                    cam.heatingSteps = 15; // Vai esquentar por 15 ciclos (30 segundos)
                    console.log(`[SIMULAÇÃO] Iniciando pico de calor na câmera ${cam.id}`);
                }

                if (cam.heatingEvent) {
                    // Modo Crítico: Sobe rápido
                    cam.temp += 1.5 + Math.random(); 
                    cam.heatingSteps--;
                    
                    // Se acabou o tempo do evento, desliga o modo crítico
                    if (cam.heatingSteps <= 0) cam.heatingEvent = false;
                } else {
                    // Modo Normal: Tende a voltar para 55°C suavemente (Resfriamento)
                    const diff = targetTemp - cam.temp;
                    cam.temp += diff * 0.1; // Corrige 10% da diferença por ciclo
                    
                    // Adiciona um ruído natural pequeno (+/- 0.4 grau)
                    cam.temp += (Math.random() - 0.5) * 0.8;
                }

                // Garante limites físicos (não desce abaixo de 20 nem explode acima de 120)
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
            
            let glowClass = '';
            if (cam.temp > 75) { // Subi um pouco a régua do alerta visual
                this.triggerAlert(cam);
                glowClass = 'high';
            } else if (cam.temp > 65) {
                glowClass = 'medium';
            }
            
            const glowEl = document.getElementById(`glow-${cam.id}`);
            if (glowEl) glowEl.className = `temperature-glow ${glowClass}`;
        }
    }

    triggerAlert(cam) {
        const banner = document.getElementById('alert-banner');
        const msg = document.getElementById('alert-message');
        if (banner && msg) {
            // Só mostra o banner se ele já não estiver visível (evita piscar)
            if(banner.style.display === 'none' || banner.style.display === '') {
                banner.style.display = 'flex';
                banner.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
                msg.textContent = `ALERTA: Superaquecimento em ${cam.name} (${cam.temp.toFixed(1)}°C)`;
                
                // Esconde automaticamente após 8 segundos
                setTimeout(() => { banner.style.display = 'none'; }, 8000);
            }
        }
    }

    toggleRec(id) {
        const recInd = document.getElementById(`rec-${id}`);
        if(recInd) recInd.classList.toggle('active');
    }

    toggleGlobalRecord() {
        this.recording = !this.recording;
        const btn = document.getElementById('record-all');
        if(btn) {
            btn.innerHTML = this.recording ? '<i class="fas fa-stop"></i> Parar Tudo' : '<i class="fas fa-record-vinyl"></i> Gravar Tudo';
            btn.style.backgroundColor = this.recording ? 'var(--danger-color)' : '';
        }
        this.cameras.forEach(c => {
            const el = document.getElementById(`rec-${c.id}`);
            if(el) this.recording ? el.classList.add('active') : el.classList.remove('active');
        });
        this.updateSystemStatus();
    }

    updateSystemStatus() {
        const activeEl = document.getElementById('active-cameras');
        if(activeEl) activeEl.textContent = `${this.cameras.length}/${this.cameras.length}`;
        const recEl = document.getElementById('recording-status');
        if(recEl) recEl.textContent = this.recording ? 'Gravando' : 'Inativo';
        
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
        document.getElementById('record-all')?.addEventListener('click', () => this.toggleGlobalRecord());
        document.getElementById('night-vision')?.addEventListener('click', () => document.body.classList.toggle('night-vision'));
        document.getElementById('thermal-view')?.addEventListener('click', () => document.body.classList.toggle('thermal-view'));
        
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