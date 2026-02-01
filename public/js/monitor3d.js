/**
 * BEL FIRE - Digital Twin 3D Engine
 * Utiliza Three.js para renderizar a planta e os alertas
 */

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.objects = []; // Armazena referências para hidrantes/bombas
        this.alertMarkers = []; // Armazena marcadores de fogo ativos
        
        // Configurações da Planta
        this.plantImage = 'assets/3.png'; // Caminho da sua imagem
        this.plantWidth = 200; // Tamanho arbitrário no mundo 3D (proporcional)
        this.plantHeight = 150; // Ajustaremos dinamicamente ao carregar a imagem
        
        this.init();
    }

    init() {
        // 1. Cena
        this.scene = new THREE.Scene();
        // Adiciona neblina para dar profundidade e esconder bordas abruptas
        this.scene.fog = new THREE.FogExp2(0x111111, 0.002);

        // 2. Câmera
        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 150, 150); // Posição inicial elevada
        this.camera.lookAt(0, 0, 0);

        // 3. Renderizador
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // 4. Controles (OrbitControls)
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1; // Impede a câmera de ir para baixo do chão
        this.controls.minDistance = 20;
        this.controls.maxDistance = 400;

        // 5. Luzes
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // 6. Carregar o Chão (Planta)
        this.loadPlantFloor();

        // 7. Iniciar Loop
        this.animate();

        // 8. Eventos de Janela
        window.addEventListener('resize', () => this.onWindowResize());
        
        // 9. Configurar Botões da Interface
        document.getElementById('btn-reset-view').addEventListener('click', () => {
            this.camera.position.set(0, 150, 150);
            this.controls.target.set(0,0,0);
        });

        // --- SIMULAÇÃO: Adicionar Objetos Iniciais ---
        // Aqui você pode mudar as posições X, Z conforme sua planta real
        this.addPumpHouse(-50, -30, "Casa de Bombas Principal");
        this.addHydrant(20, 20, "H-01");
        this.addHydrant(60, -40, "H-02");
        this.addHydrant(-40, 40, "H-03");

        // --- EXIBIR ALERTA DE TESTE (Para você ver funcionando offline) ---
        // Simula um alerta de incêndio após 3 segundos
        setTimeout(() => {
            this.triggerFireAlert(20, 20, "Setor Produção - H-01");
        }, 3000);
    }

    loadPlantFloor() {
        const loader = new THREE.TextureLoader();
        
        loader.load(this.plantImage, (texture) => {
            // Ajusta proporção baseado na imagem
            const aspect = texture.image.width / texture.image.height;
            const planeHeight = this.plantWidth / aspect;
            
            const geometry = new THREE.PlaneGeometry(this.plantWidth, planeHeight);
            const material = new THREE.MeshStandardMaterial({ 
                map: texture, 
                side: THREE.DoubleSide,
                roughness: 0.8
            });
            
            const plane = new THREE.Mesh(geometry, material);
            plane.rotation.x = -Math.PI / 2; // Deita o plano horizontalmente
            plane.receiveShadow = true;
            this.scene.add(plane);
            
            // Adiciona um "grid" sutil para ajudar na perspectiva
            const gridHelper = new THREE.GridHelper(300, 50, 0x444444, 0x222222);
            gridHelper.position.y = -0.1; // Logo abaixo da planta
            this.scene.add(gridHelper);

        }, undefined, (err) => {
            console.error("Erro ao carregar imagem da planta. Verifique se está rodando em um servidor local.", err);
            // Fallback visual se a imagem falhar (chão cinza)
            const geometry = new THREE.PlaneGeometry(200, 200);
            const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const plane = new THREE.Mesh(geometry, material);
            plane.rotation.x = -Math.PI / 2;
            this.scene.add(plane);
        });
    }

    // Cria a "Casa de Bomba" (Um bloco azulado/metálico)
    addPumpHouse(x, z, label) {
        const geometry = new THREE.BoxGeometry(15, 10, 20); // Largura, Altura, Profundidade
        const material = new THREE.MeshStandardMaterial({ color: 0x3498db });
        const pump = new THREE.Mesh(geometry, material);
        
        pump.position.set(x, 5, z); // Y=5 (metade da altura) para ficar no chão
        pump.castShadow = true;
        pump.userData = { type: 'pump', label: label };
        
        this.scene.add(pump);
        this.objects.push(pump);
        this.addLabel(x, 12, z, label); // Rótulo flutuante
    }

    // Cria Hidrantes (Cilindros Amarelos/Vermelhos)
    addHydrant(x, z, label) {
        const geometry = new THREE.CylinderGeometry(1, 1, 4, 16);
        const material = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
        const hydrant = new THREE.Mesh(geometry, material);
        
        hydrant.position.set(x, 2, z);
        hydrant.castShadow = true;
        hydrant.userData = { type: 'hydrant', label: label };
        
        this.scene.add(hydrant);
        this.objects.push(hydrant);
    }

    // Simula um efeito de fogo/alerta em uma posição
    triggerFireAlert(x, z, locationName) {
        // 1. Atualizar UI HTML
        const banner = document.getElementById('alert-banner-3d');
        const locText = document.getElementById('alert-location-text');
        if (banner) {
            locText.textContent = locationName;
            banner.style.display = 'flex';
        }

        // 2. Criar Marcador 3D (Esfera Pulsante Vermelha)
        const geometry = new THREE.SphereGeometry(3, 32, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.8 
        });
        const fireMarker = new THREE.Mesh(geometry, material);
        fireMarker.position.set(x, 5, z);
        
        // Adicionar uma luz vermelha no local do fogo
        const fireLight = new THREE.PointLight(0xff0000, 2, 50);
        fireLight.position.set(x, 10, z);
        
        this.scene.add(fireMarker);
        this.scene.add(fireLight);
        
        this.alertMarkers.push({ mesh: fireMarker, light: fireLight, time: 0 });

        // Focar câmera no alerta automaticamente
        this.focusCamera(x, z);
    }

    focusCamera(x, z) {
        const offset = 40;
        // Animação suave da câmera (simulada)
        // Em um projeto real, usaria TWEEN.js, aqui faremos um "pulo" direto mas suave pelo OrbitControls
        this.controls.target.set(x, 0, z);
        this.camera.position.set(x + offset, 40, z + offset);
        this.controls.update();
    }

    // Cria rótulo HTML sobre o objeto 3D
    addLabel(x, y, z, text) {
        // Nota: Para rótulos perfeitos que seguem a câmera, precisaria projetar coordenadas 3D para 2D.
        // Simplificação: Apenas log no console ou implementação futura.
        // (Deixei comentado para não poluir o código se não tiver a função de projeção pronta)
    }

    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();

        // Animar Alertas (Pulsar)
        const time = Date.now() * 0.005;
        this.alertMarkers.forEach(alert => {
            const scale = 1 + Math.sin(time * 3) * 0.3; // Pulsa tamanho
            alert.mesh.scale.set(scale, scale, scale);
            alert.mesh.material.opacity = 0.5 + Math.sin(time * 5) * 0.5; // Pulsa transparência
        });

        this.renderer.render(this.scene, this.camera);
    }
}

// Inicializa quando a página carregar
window.addEventListener('DOMContentLoaded', () => {
    // Integração com o sistema existente
    if (window.app) {
        console.log("Sistema 3D Integrado ao App Principal");
    }
    
    // Função global para o botão "Ver Local"
    window.focarAlerta = function() {
        // Lógica para focar no ultimo alerta
        // Já feito automaticamente no trigger, mas pode ser refeito aqui
    };

    const digitalTwin = new DigitalTwin();
});