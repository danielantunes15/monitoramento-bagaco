// Sistema de Monitoramento por Câmeras
class CameraSystem {
    constructor() {
        this.cameras = {};
        this.recording = false;
        this.nightVision = false;
        this.thermalView = false;
        this.gridLayout = 'grid'; // grid, list, focus
        this.alerts = [];
        this.maxCameras = 6;
        this.cameraCount = 6;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateTime();
        this.simulateCameraFeeds();
        
        // Atualizar tempo a cada segundo
        setInterval(() => this.updateTime(), 1000);
        
        // Simular atualizações das câmeras
        setInterval(() => this.updateCameraFeeds(), 2000);
        
        // Simular alertas ocasionais
        setInterval(() => this.simulateAlerts(), 10000);
    }
    
    setupEventListeners() {
        // Menu
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!item.href || item.href === '#') {
                    e.preventDefault();
                }
                document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
        
        // Controles de grade
        document.getElementById('grid-toggle').addEventListener('click', () => {
            this.toggleGridLayout();
        });
        
        // Gravação
        document.getElementById('record-toggle').addEventListener('click', () => {
            this.toggleRecording();
        });
        
        document.getElementById('record-all').addEventListener('click', () => {
            this.toggleRecording();
        });
        
        // Tela cheia
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            this.toggleFullscreen();
        });
        
        // Visão noturna/térmica
        document.getElementById('night-vision').addEventListener('click', () => {
            this.toggleNightVision();
        });
        
        document.getElementById('thermal-view').addEventListener('click', () => {
            this.toggleThermalView();
        });
        
        // Pausar todas
        document.getElementById('pause-all').addEventListener('click', () => {
            this.pauseAllCameras();
        });
        
        // Adicionar câmera
        document.getElementById('add-camera-btn').addEventListener('click', () => {
            this.showAddCameraModal();
        });
        
        document.getElementById('close-modal').addEventListener('click', () => {
            this.hideAddCameraModal();
        });
        
        document.getElementById('cancel-add').addEventListener('click', () => {
            this.hideAddCameraModal();
        });
        
        document.getElementById('save-camera').addEventListener('click', () => {
            this.addNewCamera();
        });
        
        // Fechar alerta
        document.getElementById('close-alert').addEventListener('click', () => {
            document.getElementById('alert-banner').style.display = 'none';
        });
        
        // Controles individuais das câmeras
        document.querySelectorAll('.cam-control').forEach(button => {
            button.addEventListener('click', (e) => {
                const cameraId = e.target.closest('.cam-control').dataset.camera;
                const action = e.target.closest('.cam-control').dataset.action;
                this.handleCameraControl(cameraId, action);
            });
        });
        
        // Histórico de alertas
        document.getElementById('alert-history').addEventListener('click', () => {
            this.showAlertHistory();
        });
    }
    
    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR');
        const dateString = now.toLocaleDateString('pt-BR');
        
        document.getElementById('current-time').textContent = timeString;
        
        // Atualizar tempo nos vídeos simulados
        document.querySelectorAll('.video-time').forEach(element => {
            element.textContent = timeString;
        });
    }
    
    simulateCameraFeeds() {
        // Temperaturas iniciais para cada câmera
        const initialTemps = {
            1: { temp: 64, status: 'high' },
            2: { temp: 58, status: 'medium' },
            3: { temp: 52, status: 'low' },
            4: { temp: 67, status: 'high' },
            5: { temp: 61, status: 'medium' },
            6: { temp: 55, status: 'low' }
        };
        
        for (let i = 1; i <= 6; i++) {
            this.cameras[i] = {
                id: i,
                name: `Câmera ${i.toString().padStart(2, '0')}`,
                temperature: initialTemps[i].temp,
                status: 'active',
                recording: false,
                location: i <= 3 ? 'Pilha Norte' : 'Pilha Sul',
                position: i % 3 === 1 ? 'Superior' : i % 3 === 2 ? 'Central' : 'Inferior'
            };
            
            this.updateCameraDisplay(i);
        }
        
        this.updateSystemStatus();
    }
    
    updateCameraFeeds() {
        // Simular variação de temperatura nas câmeras
        for (let i = 1; i <= 6; i++) {
            if (this.cameras[i] && this.cameras[i].status === 'active') {
                // Variação aleatória de temperatura (-1 a +1 grau)
                const change = (Math.random() - 0.5) * 2;
                this.cameras[i].temperature = Math.max(30, Math.min(90, this.cameras[i].temperature + change));
                
                // Atualizar display
                this.updateCameraDisplay(i);
                
                // Verificar alertas
                this.checkCameraAlerts(i);
            }
        }
        
        this.updateSystemStatus();
    }
    
    updateCameraDisplay(cameraId) {
        const camera = this.cameras[cameraId];
        if (!camera) return;
        
        // Atualizar temperatura no display
        const tempElement = document.querySelector(`#camera-${cameraId} .video-temp`);
        if (tempElement) {
            tempElement.textContent = `${camera.temperature.toFixed(1)}°C`;
            
            // Atualizar cor baseada na temperatura
            if (camera.temperature >= 70) {
                tempElement.style.backgroundColor = 'rgba(239, 68, 68, 0.8)';
            } else if (camera.temperature >= 60) {
                tempElement.style.backgroundColor = 'rgba(249, 115, 22, 0.8)';
            } else {
                tempElement.style.backgroundColor = 'rgba(16, 185, 129, 0.8)';
            }
        }
        
        // Atualizar informação da câmera
        const infoElements = document.querySelectorAll(`[data-camera="${cameraId}"]`);
        infoElements.forEach(element => {
            const tempSpan = element.querySelector('.camera-info span:last-child');
            if (tempSpan) {
                tempSpan.innerHTML = `<i class="fas fa-thermometer"></i> ${camera.temperature.toFixed(1)}°C`;
            }
        });
        
        // Atualizar efeito visual de temperatura
        const glowElement = document.querySelector(`#camera-${cameraId} .temperature-glow`);
        if (glowElement) {
            glowElement.className = 'temperature-glow';
            
            if (camera.temperature >= 70) {
                glowElement.classList.add('high');
                glowElement.style.animationDuration = '1.5s';
            } else if (camera.temperature >= 60) {
                glowElement.classList.add('medium');
                glowElement.style.animationDuration = '2s';
            } else {
                glowElement.classList.add('low');
                glowElement.style.animationDuration = '3s';
            }
        }
    }
    
    checkCameraAlerts(cameraId) {
        const camera = this.cameras[cameraId];
        if (!camera) return;
        
        const cameraCard = document.querySelector(`#camera-${cameraId}`).closest('.camera-card');
        
        // Remover classes de alerta anteriores
        cameraCard.classList.remove('alert', 'critical');
        
        // Verificar se precisa de alerta
        if (camera.temperature >= 80) {
            // Crítico
            cameraCard.classList.add('critical');
            this.addAlert(`ALERTA CRÍTICO: Câmera ${cameraId} - ${camera.temperature.toFixed(1)}°C`, 'critical');
        } else if (camera.temperature >= 70) {
            // Alerta
            cameraCard.classList.add('alert');
            this.addAlert(`Alerta: Câmera ${cameraId} - ${camera.temperature.toFixed(1)}°C`, 'warning');
        }
    }
    
    addAlert(message, type) {
        const now = new Date();
        const alert = {
            id: Date.now(),
            message: message,
            type: type,
            timestamp: now.toISOString(),
            camera: message.includes('Câmera') ? parseInt(message.match(/Câmera (\d+)/)[1]) : null
        };
        
        this.alerts.unshift(alert);
        
        // Manter apenas os últimos 50 alertas
        if (this.alerts.length > 50) {
            this.alerts.pop();
        }
        
        // Mostrar alerta no banner
        this.showAlertBanner(message, type);
        
        // Atualizar status do sistema
        document.getElementById('last-alert').textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    
    showAlertBanner(message, type) {
        const banner = document.getElementById('alert-banner');
        const alertMessage = document.getElementById('alert-message');
        
        // Alterar cor do banner baseada no tipo
        if (type === 'critical') {
            banner.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        } else if (type === 'warning') {
            banner.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            banner.style.background = 'linear-gradient(90deg, #3b82f6, #60a5fa)';
        }
        
        alertMessage.textContent = message;
        banner.style.display = 'flex';
        
        // Se for crítico, piscar o título da página
        if (type === 'critical') {
            this.flashPageTitle('ALERTA CRÍTICO!');
        }
    }
    
    flashPageTitle(alertText) {
        let originalTitle = document.title;
        let isOriginal = true;
        let flashCount = 0;
        const maxFlashes = 15;
        
        const flashInterval = setInterval(() => {
            document.title = isOriginal ? alertText : originalTitle;
            isOriginal = !isOriginal;
            flashCount++;
            
            if (flashCount >= maxFlashes) {
                clearInterval(flashInterval);
                document.title = originalTitle;
            }
        }, 500);
    }
    
    updateSystemStatus() {
        // Contar câmeras ativas
        const activeCameras = Object.values(this.cameras).filter(cam => cam.status === 'active').length;
        document.getElementById('active-cameras').textContent = `${activeCameras}/${this.cameraCount}`;
        
        // Status de gravação
        document.getElementById('recording-status').textContent = this.recording ? 'Ativa' : 'Inativa';
        document.getElementById('recording-status').style.color = this.recording ? 'var(--danger-color)' : 'var(--text-muted)';
        
        // Temperatura máxima
        const temps = Object.values(this.cameras).map(cam => cam.temperature);
        const maxTemp = Math.max(...temps);
        document.getElementById('max-temperature').textContent = `${maxTemp.toFixed(1)}°C`;
        
        // Cor da temperatura máxima
        if (maxTemp >= 70) {
            document.getElementById('max-temperature').style.color = 'var(--danger-color)';
        } else if (maxTemp >= 60) {
            document.getElementById('max-temperature').style.color = 'var(--warning-color)';
        } else {
            document.getElementById('max-temperature').style.color = 'var(--success-color)';
        }
    }
    
    toggleGridLayout() {
        const grid = document.getElementById('camera-grid');
        const toggleBtn = document.getElementById('grid-toggle');
        
        if (this.gridLayout === 'grid') {
            // Mudar para lista (1 coluna)
            grid.style.gridTemplateColumns = '1fr';
            this.gridLayout = 'list';
            toggleBtn.innerHTML = '<i class="fas fa-th-large"></i> Grade 2x3';
        } else if (this.gridLayout === 'list') {
            // Mudar para foco (câmera principal maior)
            grid.style.gridTemplateColumns = '2fr 1fr 1fr';
            this.gridLayout = 'focus';
            toggleBtn.innerHTML = '<i class="fas fa-th"></i> Grade Normal';
        } else {
            // Voltar para grade normal
            grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(400px, 1fr))';
            this.gridLayout = 'grid';
            toggleBtn.innerHTML = '<i class="fas fa-list"></i> Lista';
        }
    }
    
    toggleRecording() {
        this.recording = !this.recording;
        
        const recordBtn = document.getElementById('record-toggle');
        const recordAllBtn = document.getElementById('record-all');
        
        if (this.recording) {
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Parar';
            recordBtn.style.backgroundColor = 'var(--danger-color)';
            recordAllBtn.innerHTML = '<i class="fas fa-stop"></i> <span>Parar Todas</span>';
            recordAllBtn.style.backgroundColor = 'var(--danger-color)';
            
            // Atualizar ícones nas câmeras individuais
            document.querySelectorAll('[data-action="record"]').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-stop"></i>';
            });
            
            this.addAlert('Gravação iniciada em todas as câmeras', 'info');
        } else {
            recordBtn.innerHTML = '<i class="fas fa-record-vinyl"></i> Gravar';
            recordBtn.style.backgroundColor = '';
            recordAllBtn.innerHTML = '<i class="fas fa-record-vinyl"></i> <span>Gravar Todas</span>';
            recordAllBtn.style.backgroundColor = '';
            
            // Atualizar ícones nas câmeras individuais
            document.querySelectorAll('[data-action="record"]').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-record-vinyl"></i>';
            });
            
            this.addAlert('Gravação parada', 'info');
        }
        
        this.updateSystemStatus();
    }
    
    toggleFullscreen() {
        const elem = document.documentElement;
        
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
            
            document.getElementById('fullscreen-btn').innerHTML = '<i class="fas fa-compress"></i> Sair Tela Cheia';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            
            document.getElementById('fullscreen-btn').innerHTML = '<i class="fas fa-expand"></i> Tela Cheia';
        }
    }
    
    toggleNightVision() {
        this.nightVision = !this.nightVision;
        const nightBtn = document.getElementById('night-vision');
        
        if (this.nightVision) {
            document.body.classList.add('night-vision');
            nightBtn.innerHTML = '<i class="fas fa-sun"></i> <span>Visão Normal</span>';
            nightBtn.style.backgroundColor = 'var(--warning-color)';
            this.addAlert('Visão noturna ativada', 'info');
        } else {
            document.body.classList.remove('night-vision');
            nightBtn.innerHTML = '<i class="fas fa-moon"></i> <span>Visão Noturna</span>';
            nightBtn.style.backgroundColor = '';
            this.addAlert('Visão noturna desativada', 'info');
        }
    }
    
    toggleThermalView() {
        this.thermalView = !this.thermalView;
        const thermalBtn = document.getElementById('thermal-view');
        
        if (this.thermalView) {
            document.body.classList.add('thermal-view');
            thermalBtn.innerHTML = '<i class="fas fa-eye"></i> <span>Visão Normal</span>';
            thermalBtn.style.backgroundColor = 'var(--danger-color)';
            this.addAlert('Visão térmica ativada', 'info');
        } else {
            document.body.classList.remove('thermal-view');
            thermalBtn.innerHTML = '<i class="fas fa-fire"></i> <span>Visão Térmica</span>';
            thermalBtn.style.backgroundColor = '';
            this.addAlert('Visão térmica desativada', 'info');
        }
    }
    
    pauseAllCameras() {
        const pauseBtn = document.getElementById('pause-all');
        const isPaused = pauseBtn.innerHTML.includes('Retomar');
        
        if (isPaused) {
            // Retomar todas
            Object.keys(this.cameras).forEach(id => {
                this.cameras[id].status = 'active';
            });
            
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> <span>Pausar Todas</span>';
            this.addAlert('Todas as câmeras retomadas', 'info');
        } else {
            // Pausar todas
            Object.keys(this.cameras).forEach(id => {
                this.cameras[id].status = 'paused';
            });
            
            pauseBtn.innerHTML = '<i class="fas fa-play"></i> <span>Retomar Todas</span>';
            this.addAlert('Todas as câmeras pausadas', 'info');
        }
        
        // Atualizar status das câmeras
        for (let i = 1; i <= 6; i++) {
            this.updateCameraStatusDisplay(i);
        }
        
        this.updateSystemStatus();
    }
    
    updateCameraStatusDisplay(cameraId) {
        const camera = this.cameras[cameraId];
        const statusElement = document.querySelector(`#camera-${cameraId}`).closest('.camera-card').querySelector('.camera-status');
        
        if (camera.status === 'active') {
            statusElement.innerHTML = '<div class="status-dot"></div><span>LIVE</span>';
            statusElement.classList.remove('inactive');
        } else {
            statusElement.innerHTML = '<div class="status-dot"></div><span>PAUSED</span>';
            statusElement.classList.add('inactive');
        }
    }
    
    handleCameraControl(cameraId, action) {
        const camera = this.cameras[cameraId];
        if (!camera) return;
        
        switch (action) {
            case 'zoom-in':
                this.zoomCamera(cameraId);
                break;
            case 'record':
                this.toggleCameraRecording(cameraId);
                break;
            case 'settings':
                this.showCameraSettings(cameraId);
                break;
            case 'fullscreen':
                this.fullscreenCamera(cameraId);
                break;
        }
    }
    
    zoomCamera(cameraId) {
        this.addAlert(`Zoom ativado na Câmera ${cameraId}`, 'info');
        // Em um sistema real, isso controlaria o zoom óptico/digital da câmera
    }
    
    toggleCameraRecording(cameraId) {
        const camera = this.cameras[cameraId];
        camera.recording = !camera.recording;
        
        const recordBtn = document.querySelector(`[data-camera="${cameraId}"][data-action="record"]`);
        
        if (camera.recording) {
            recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
            recordBtn.style.color = 'var(--danger-color)';
            this.addAlert(`Gravação iniciada - Câmera ${cameraId}`, 'info');
        } else {
            recordBtn.innerHTML = '<i class="fas fa-record-vinyl"></i>';
            recordBtn.style.color = '';
            this.addAlert(`Gravação parada - Câmera ${cameraId}`, 'info');
        }
    }
    
    showCameraSettings(cameraId) {
        this.addAlert(`Abrindo configurações da Câmera ${cameraId}`, 'info');
        // Em um sistema real, abriria um modal com configurações específicas da câmera
    }
    
    fullscreenCamera(cameraId) {
        const cameraElement = document.getElementById(`camera-${cameraId}`);
        
        if (!document.fullscreenElement) {
            if (cameraElement.requestFullscreen) {
                cameraElement.requestFullscreen();
            }
            this.addAlert(`Câmera ${cameraId} em tela cheia`, 'info');
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            this.addAlert(`Saindo do modo tela cheia`, 'info');
        }
    }
    
    showAddCameraModal() {
        document.getElementById('add-camera-modal').classList.add('active');
    }
    
    hideAddCameraModal() {
        document.getElementById('add-camera-modal').classList.remove('active');
        
        // Limpar formulário
        document.getElementById('camera-name').value = '';
        document.getElementById('camera-url').value = '';
        document.getElementById('camera-location').value = 'norte-superior';
        document.getElementById('camera-type').value = 'normal';
    }
    
    addNewCamera() {
        const name = document.getElementById('camera-name').value;
        const url = document.getElementById('camera-url').value;
        const location = document.getElementById('camera-location').value;
        const type = document.getElementById('camera-type').value;
        
        if (!name || !url) {
            alert('Por favor, preencha o nome e a URL da câmera');
            return;
        }
        
        // Em um sistema real, aqui adicionaria a câmera ao sistema
        this.addAlert(`Câmera "${name}" adicionada com sucesso`, 'success');
        
        // Fechar modal
        this.hideAddCameraModal();
        
        // Aqui você implementaria a lógica para adicionar uma nova câmera à interface
        // Por enquanto, apenas mostra uma mensagem
        console.log(`Nova câmera adicionada: ${name} (${url}) - ${location} - ${type}`);
    }
    
    showAlertHistory() {
        if (this.alerts.length === 0) {
            alert('Nenhum alerta registrado ainda.');
            return;
        }
        
        let historyMessage = 'Histórico de Alertas:\n\n';
        this.alerts.slice(0, 10).forEach(alert => {
            const time = new Date(alert.timestamp).toLocaleTimeString('pt-BR');
            historyMessage += `${time} - ${alert.message}\n`;
        });
        
        alert(historyMessage);
    }
    
    simulateAlerts() {
        // Simular alertas aleatórios
        if (Math.random() > 0.7) { // 30% de chance
            const cameraId = Math.floor(Math.random() * 6) + 1;
            const camera = this.cameras[cameraId];
            
            if (camera && camera.temperature > 65) {
                this.addAlert(`Movimento detectado na Câmera ${cameraId} - ${camera.location}`, 'warning');
            }
        }
    }
}

// Inicializar o sistema quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    const cameraSystem = new CameraSystem();
    
    // Expor para o console para testes
    window.cameraSystem = cameraSystem;
    
    // Adicionar estilos para visão noturna e térmica
    const style = document.createElement('style');
    style.textContent = `
        .night-vision .video-simulation {
            filter: grayscale(100%) brightness(0.5) contrast(2) sepia(1) hue-rotate(60deg);
        }
        
        .thermal-view .video-simulation {
            filter: brightness(1.2) contrast(1.5) saturate(2);
        }
        
        .thermal-view .temperature-glow {
            opacity: 0.9 !important;
        }
    `;
    document.head.appendChild(style);
});