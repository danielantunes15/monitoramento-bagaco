class VideoWall {
    constructor() {
        // Simulação de Fonte de Câmeras (Poderia vir da API)
        this.cameras = Array.from({ length: 12 }, (_, i) => ({
            id: i + 1,
            name: `CAM-${(i + 1).toString().padStart(2, '0')} ${['Pilha A', 'Pilha B', 'Processo', 'Pátio'][i % 4]}`,
            status: 'online',
            temp: 45 + Math.random() * 20
        }));

        this.currentLayout = '3x2';
        this.autoRotate = false;
        this.rotateInterval = null;
        this.currentPage = 0;
        
        this.init();
    }

    init() {
        this.render();
        this.startClock();
        
        // Atalho 'F11' para browser fullscreen é nativo, mas podemos forçar via botão se quiser
        document.addEventListener('keydown', (e) => {
            if(e.key === 'r') this.toggleRotation();
            if(e.key === '1') this.setLayout('2x2');
            if(e.key === '2') this.setLayout('3x2');
        });
    }

    // --- RENDERIZAÇÃO ---
    render() {
        const grid = document.getElementById('wall-grid');
        grid.className = `wall-grid layout-${this.currentLayout}`;
        grid.innerHTML = '';

        // Determina quantas câmeras cabem no layout atual
        const slots = this.getSlotsCount(this.currentLayout);
        
        // Paginação (se tiver mais câmeras que slots)
        const start = this.currentPage * slots;
        const visibleCameras = this.cameras.slice(start, start + slots);
        
        // Se a página não encher, completa com o início (loop)
        if (visibleCameras.length < slots) {
            visibleCameras.push(...this.cameras.slice(0, slots - visibleCameras.length));
        }

        visibleCameras.forEach((cam, index) => {
            const isMain = (this.currentLayout === 'focus' && index === 0);
            
            const div = document.createElement('div');
            div.className = `wall-item ${isMain ? 'focus-main' : ''}`;
            if(cam.temp > 60) div.classList.add('alert'); // Simula alerta visual

            div.innerHTML = `
                <div class="wall-overlay">
                    <div class="cam-tag">${cam.name}</div>
                    <div class="cam-alert">ALERTA CALOR</div>
                </div>
                
                <div class="video-content" style="
                    width:100%; height:100%; 
                    background: linear-gradient(45deg, #111, #222);
                    display:flex; align-items:center; justify-content:center;
                ">
                    <div style="text-align:center; opacity:0.3;">
                        <i class="fas fa-video fa-3x"></i>
                        <br>Sinal ao Vivo
                    </div>
                    <div style="
                        position:absolute; bottom:0; left:0; right:0; height:40%;
                        background: radial-gradient(circle at center, rgba(${cam.temp > 55 ? '255,0,0' : '0,255,0'}, 0.2), transparent);
                    "></div>
                </div>

                <div class="wall-stats">
                    <span><i class="fas fa-thermometer-half"></i> ${cam.temp.toFixed(1)}°C</span>
                    <span><i class="fas fa-wifi"></i> 12ms</span>
                    <span>REC ●</span>
                </div>
            `;
            grid.appendChild(div);
        });
    }

    getSlotsCount(layout) {
        switch(layout) {
            case '2x2': return 4;
            case '3x2': return 6;
            case '4x4': return 16;
            case 'focus': return 4; // 1 grande + 3 pequenos
            default: return 6;
        }
    }

    // --- CONTROLES ---
    setLayout(layout) {
        this.currentLayout = layout;
        this.currentPage = 0; // Reseta paginação ao mudar layout
        
        // Atualiza botões visuais
        document.querySelectorAll('.wall-btn').forEach(btn => btn.classList.remove('active'));
        event.target.closest('button')?.classList.add('active'); // Correção simples de UX
        
        this.render();
    }

    toggleRotation() {
        this.autoRotate = !this.autoRotate;
        const btn = document.querySelector('button[onclick="videoWall.toggleRotation()"]');
        
        if (this.autoRotate) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Rotacionando...';
            
            this.rotateInterval = setInterval(() => {
                this.nextPage();
            }, 5000); // Muda a cada 5 segundos
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
            const now = new Date();
            document.getElementById('clock').textContent = now.toLocaleTimeString();
        }, 1000);
    }
}

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
    window.videoWall = new VideoWall();
});