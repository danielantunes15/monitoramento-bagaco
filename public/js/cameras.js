class CameraSystem {
    constructor() {
        // Configuração Inicial das Câmeras (Dados que antes estavam no HTML)
        this.cameras = [
            { id: 1, name: 'Câmera 01 - Pilha Norte', location: 'Setor A - Superior', temp: 64, status: 'active' },
            { id: 2, name: 'Câmera 02 - Pilha Norte', location: 'Setor A - Central', temp: 58, status: 'active' },
            { id: 3, name: 'Câmera 03 - Pilha Norte', location: 'Setor A - Inferior', temp: 52, status: 'active' },
            { id: 4, name: 'Câmera 04 - Pilha Sul', location: 'Setor B - Superior', temp: 67, status: 'active' },
            { id: 5, name: 'Câmera 05 - Pilha Sul', location: 'Setor B - Central', temp: 61, status: 'active' },
            { id: 6, name: 'Câmera 06 - Pilha Sul', location: 'Setor B - Inferior', temp: 55, status: 'active' }
        ];
        
        this.recording = false;
        this.init();
    }
    
    init() {
        this.renderGrid(); // Gera o HTML das câmeras
        this.setupGlobalListeners();
        this.updateSystemStatus();
        
        // Loops de atualização
        setInterval(() => this.updateTime(), 1000);
        setInterval(() => this.simulateTelemetry(), 2000); // Simula dados novos
    }

    // --- GERAÇÃO DE HTML DINÂMICO ---
    renderGrid() {
        const grid = document.getElementById('camera-grid');
        grid.innerHTML = ''; // Limpa o grid atual

        this.cameras.forEach(cam => {
            const html = `
                <div class="camera-card" id="card-${cam.id}" data-id="${cam.id}">
                    <div class="camera-header">
                        <div class="camera-title"><i class="fas fa-video"></i> ${cam.name}</div>
                        <div class="camera-status active"><div class="status-dot"></div> LIVE</div>
                    </div>
                    <div class="camera-view">
                        <div class="video-placeholder">
                            <div class="recording-indicator" id="rec-${cam.id}">
                                <div class="recording-dot"></div> REC
                            </div>
                            <div class="video-overlay">
                                <div class="video-time">--:--:--</div>
                                <div class="video-temp" id="temp-${cam.id}">${cam.temp}°C</div>
                            </div>
                            <div class="video-simulation">
                                <div class="bagaco-pile"></div>
                                <div class="temperature-glow" id="glow-${cam.id}"></div>
                            </div>
                        </div>
                    </div>
                    <div class="camera-controls">
                        <button class="cam-control" onclick="window.cameraSystem.toggleRec(${cam.id})">
                            <i class="fas fa-record-vinyl"></i>
                        </button>
                        <button class="cam-control" onclick="alert('Zoom Câmera ${cam.id}')">
                            <i class="fas fa-search-plus"></i>
                        </button>
                    </div>
                    <div class="camera-info">
                        <span><i class="fas fa-map-marker-alt"></i> ${cam.location}</span>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', html);
        });
    }

    // --- LÓGICA DE NEGÓCIO ---

    simulateTelemetry() {
        // Simula a chegada de dados via MQTT
        this.cameras.forEach(cam => {
            // Varia a temperatura levemente
            cam.temp += (Math.random() - 0.5) * 2;
            cam.temp = parseFloat(cam.temp.toFixed(1));
            
            this.updateCameraUI(cam);
        });
        this.updateSystemStatus();
    }

    updateCameraUI(cam) {
        // Atualiza texto
        const tempEl = document.getElementById(`temp-${cam.id}`);
        if (tempEl) {
            tempEl.textContent = `${cam.temp}°C`;
            
            // Lógica de Cores
            let color = 'rgba(16, 185, 129, 0.8)'; // Verde
            let glowClass = '';
            
            if (cam.temp > 70) {
                color = 'rgba(239, 68, 68, 0.9)'; // Vermelho
                glowClass = 'high';
                this.triggerAlert(cam);
            } else if (cam.temp > 60) {
                color = 'rgba(245, 158, 11, 0.9)'; // Laranja
                glowClass = 'medium';
            }
            
            tempEl.style.backgroundColor = color;
            
            // Atualiza efeito visual (glow)
            const glowEl = document.getElementById(`glow-${cam.id}`);
            if (glowEl) glowEl.className = `temperature-glow ${glowClass}`;
        }
    }

    triggerAlert(cam) {
        const banner = document.getElementById('alert-banner');
        const msg = document.getElementById('alert-message');
        banner.style.display = 'flex';
        banner.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        msg.textContent = `ALERTA: Superaquecimento na ${cam.name} (${cam.temp}°C)`;
    }

    toggleRec(id) {
        const recInd = document.getElementById(`rec-${id}`);
        recInd.classList.toggle('active');
        // Em produção: enviar comando para backend
    }

    toggleGlobalRecord() {
        this.recording = !this.recording;
        const btn = document.getElementById('record-all');
        
        if (this.recording) {
            btn.innerHTML = '<i class="fas fa-stop"></i> Parar Tudo';
            btn.style.backgroundColor = 'var(--danger-color)';
            // Ativa todos
            this.cameras.forEach(c => document.getElementById(`rec-${c.id}`).classList.add('active'));
        } else {
            btn.innerHTML = '<i class="fas fa-record-vinyl"></i> Gravar Tudo';
            btn.style.backgroundColor = '';
            // Desativa todos
            this.cameras.forEach(c => document.getElementById(`rec-${c.id}`).classList.remove('active'));
        }
        this.updateSystemStatus();
    }

    updateSystemStatus() {
        document.getElementById('active-cameras').textContent = `${this.cameras.length}/${this.cameras.length}`;
        document.getElementById('recording-status').textContent = this.recording ? 'Gravando' : 'Inativo';
        
        // Temp Máxima
        const max = Math.max(...this.cameras.map(c => c.temp));
        document.getElementById('max-temperature').textContent = `${max.toFixed(1)}°C`;
    }

    updateTime() {
        const now = new Date().toLocaleTimeString();
        document.getElementById('current-time').textContent = now;
        document.querySelectorAll('.video-time').forEach(el => el.textContent = now);
    }

    setupGlobalListeners() {
        document.getElementById('record-all').addEventListener('click', () => this.toggleGlobalRecord());
        
        document.getElementById('night-vision').addEventListener('click', () => {
            document.body.classList.toggle('night-vision');
        });

        document.getElementById('thermal-view').addEventListener('click', () => {
            document.body.classList.toggle('thermal-view');
        });
        
        // Modal Handlers
        const modal = document.getElementById('add-camera-modal');
        document.getElementById('add-camera-btn').addEventListener('click', () => modal.classList.add('active'));
        document.getElementById('close-modal').addEventListener('click', () => modal.classList.remove('active'));
        document.getElementById('cancel-add').addEventListener('click', () => modal.classList.remove('active'));
        
        document.getElementById('save-camera').addEventListener('click', () => {
            const name = document.getElementById('camera-name').value;
            if(name) {
                const newId = this.cameras.length + 1;
                this.cameras.push({ 
                    id: newId, 
                    name: name, 
                    location: 'Nova Localização', 
                    temp: 40, 
                    status: 'active' 
                });
                this.renderGrid(); // Regera o grid com a nova câmera
                modal.classList.remove('active');
            }
        });
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    window.cameraSystem = new CameraSystem();
});