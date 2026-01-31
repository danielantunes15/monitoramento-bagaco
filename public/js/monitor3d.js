import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.piles = {}; // Armazena as malhas 3D das pilhas: { '1': mesh, '2': mesh }
        
        this.init();
        this.createEnvironment();
        this.createPiles();
        this.setupWebSocket();
        this.animate();
        
        // Listener para redimensionar
        window.addEventListener('resize', () => this.onWindowResize());
        document.getElementById('reset-cam').addEventListener('click', () => this.resetCamera());
    }

    init() {
        // Cena
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827); // Cor de fundo escura
        this.scene.fog = new THREE.Fog(0x111827, 20, 100);

        // Câmera
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(20, 20, 30);
        this.camera.lookAt(0, 0, 0);

        // Renderizador
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // Controles de Órbita (Mouse)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1; // Não deixa ir para baixo do chão
    }

    createEnvironment() {
        // Chão (Pátio)
        const planeGeometry = new THREE.PlaneGeometry(100, 100);
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1f2937,
            roughness: 0.8,
            metalness: 0.2
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        this.scene.add(plane);

        // Grade (Grid Helper)
        const gridHelper = new THREE.GridHelper(100, 50, 0x374151, 0x374151);
        this.scene.add(gridHelper);

        // Luz Ambiente
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);

        // Luz Direcional (Sol/Holofote)
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);
    }

    createPiles() {
        // Geometria básica da pilha (Cone achatado)
        const geometry = new THREE.ConeGeometry(3, 4, 32);
        
        // Dados das Pilhas (Posições no mundo 3D)
        const pileConfig = [
            { id: '1', x: -10, z: -10, name: 'Pilha Norte A' },
            { id: '2', x: -10, z: 5,   name: 'Pilha Norte B' },
            { id: '3', x: 10,  z: -10, name: 'Pilha Sul A' },
            { id: '4', x: 10,  z: 5,   name: 'Pilha Sul B' }
        ];

        pileConfig.forEach(config => {
            const material = new THREE.MeshStandardMaterial({ color: 0x10b981 }); // Começa Verde
            const cone = new THREE.Mesh(geometry, material);
            
            cone.position.set(config.x, 2, config.z); // Y=2 porque a altura é 4
            cone.castShadow = true;
            cone.receiveShadow = true;
            
            // Adiciona dados customizados ao objeto 3D
            cone.userData = { id: config.id, name: config.name };
            
            this.scene.add(cone);
            this.piles[config.id] = cone;

            // Adiciona Texto (Sprite Simples) - Opcional, mas ajuda a identificar
            // Para simplificar, não vamos carregar fontes externas agora.
        });
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'sensor_update') {
                    this.updatePileColor(msg.sensorId, msg.data.temp);
                }
            } catch (e) { console.error(e); }
        };
    }

    updatePileColor(id, temp) {
        const pile = this.piles[id];
        if (!pile) return;

        let colorHex;
        // Lógica de Cores (Mesma do Dashboard)
        if (temp > 70) colorHex = 0xef4444; // Vermelho
        else if (temp > 50) colorHex = 0xf59e0b; // Laranja/Amarelo
        else colorHex = 0x10b981; // Verde

        // Interpolação suave de cor seria ideal, mas troca direta funciona bem
        pile.material.color.setHex(colorHex);
        
        // Efeito de pulsação se estiver crítico (Escala)
        if (temp > 70) {
            pile.scale.setScalar(1.1); // Aumenta um pouco
        } else {
            pile.scale.setScalar(1.0);
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    resetCamera() {
        this.camera.position.set(20, 20, 30);
        this.camera.lookAt(0, 0, 0);
        this.controls.reset();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Inicializa
new DigitalTwin();