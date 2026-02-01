import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        // Ajustando a câmera para longe pois a pilha agora é gigante (18m)
        this.cameraInitialPos = new THREE.Vector3(50, 40, 60); 
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        // Agora teremos apenas UMA pilha principal grande
        this.mainPile = null;
        this.pileData = { id: '1', name: 'Pilha Principal (Bagaço)' };

        this.init();
        this.createEnvironment();
        this.createMainPileAndHydrants(); // Nova função combinada
        this.setupWebSocket();
        this.animate();
        
        window.addEventListener('resize', () => this.onWindowResize());
        // Botão de reset agora existe no seu HTML? Se não, comente a linha abaixo.
        const resetBtn = document.getElementById('reset-cam');
        if(resetBtn) resetBtn.addEventListener('click', () => this.resetCamera());
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);
        this.scene.fog = new THREE.Fog(0x111827, 60, 200); // Fog mais distante

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 500);
        this.camera.position.copy(this.cameraInitialPos);
        this.camera.lookAt(0, 5, 0); // Olha um pouco acima do chão

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
        this.controls.minDistance = 20;
        this.controls.maxDistance = 150;
        this.controls.target.set(0, 5, 0);
    }

    createEnvironment() {
        // Chão (Pátio de terra/concreto)
        const planeGeometry = new THREE.PlaneGeometry(200, 200);
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3d342b, // Cor de terra escura
            roughness: 0.9,
            metalness: 0.1
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        this.scene.add(plane);

        // Iluminação
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(50, 80, 30); // Luz vindo de mais alto
        dirLight.castShadow = true;
        
        // Configuração de sombra para cobrir a área maior
        dirLight.shadow.mapSize.width = 4096; // Aumentei a resolução da sombra
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.left = -100;
        dirLight.shadow.camera.right = 100;
        dirLight.shadow.camera.top = 100;
        dirLight.shadow.camera.bottom = -100;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 300;
        dirLight.shadow.bias = -0.0005;
        
        this.scene.add(dirLight);
    }

    // --- FUNÇÃO AUXILIAR: CRIAR HIDRANTE ---
    createHydrantMesh() {
        const group = new THREE.Group();
        const redMaterial = new THREE.MeshStandardMaterial({ color: 0xc41f1f, roughness: 0.3, metalness: 0.4 });
        
        // Corpo base
        const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.8, 12);
        const base = new THREE.Mesh(baseGeo, redMaterial);
        base.position.y = 0.9;
        base.castShadow = true;
        group.add(base);

        // Saídas laterais
        const sideGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8);
        const side = new THREE.Mesh(sideGeo, redMaterial);
        side.rotation.z = Math.PI / 2;
        side.position.y = 1.2;
        side.castShadow = true;
        group.add(side);
        
        // Tampa superior
        const topGeo = new THREE.SphereGeometry(0.4, 12, 12);
        const top = new THREE.Mesh(topGeo, redMaterial);
        top.position.y = 1.8;
        group.add(top);

        return group;
    }

    // --- NOVA GEOMETRIA DE PILHA COM "CORTTE" ---
    createComplexPileGeometry(radiusBase, heightMax) {
        // Aumentamos muito os segmentos para permitir deformação detalhada
        // Raio 25m base, Altura 18m
        const geometry = new THREE.ConeGeometry(radiusBase, heightMax, 128, 64);
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        // Parâmetros do caminho da pá carregadeira
        const pathWidth = 8.0; // Largura do corredor central
        const pathDepthFactor = 0.85; // O quão fundo é o corte (0 a 1)

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // 1. Rugosidade Geral (Simula o bagaço solto)
            // Não deforma muito a base absoluta (y=0) para não flutuar
            if (vertex.y > 0.2) {
                const roughness = 0.5; 
                vertex.x += (Math.random() - 0.5) * roughness;
                vertex.z += (Math.random() - 0.5) * roughness;
                vertex.y += (Math.random() - 0.5) * 0.3;
            }

            // 2. O Corte Central (Caminho da Carregadeira)
            // Vamos assumir que o caminho passa ao longo do eixo Z, então cortamos onde X é próximo de 0.
            const distanceToPathCenter = Math.abs(vertex.x);

            if (distanceToPathCenter < pathWidth / 2) {
                // Cria uma curva suave de depressão usando cosseno
                // Quanto mais perto do centro (x=0), mais fundo o corte.
                const normalizedDist = distanceToPathCenter / (pathWidth / 2); // 0 no centro, 1 na borda do caminho
                const cutCurve = Math.cos(normalizedDist * (Math.PI / 2)); // 1 no centro, 0 na borda
                
                // Achata a altura baseada na curva
                vertex.y = vertex.y * (1 - (cutCurve * pathDepthFactor));

                // Garante que o chão do caminho não fique abaixo de um certo nível (ex: 1m do chão)
                // para parecer terra batida onde a máquina passa
                if(vertex.y < 1.0 && vertex.y > 0) {
                     vertex.y = 1.0 + (Math.random() * 0.1); // Leve irregularidade no chão do caminho
                }
            }

            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        // Recalcula as normais para a luz bater corretamente na nova forma irregular
        geometry.computeVertexNormals();
        
        // Adiciona atributo de cor para o mapa de calor
        const colors = [];
        for (let i = 0; i < posAttribute.count; i++) {
            colors.push(1, 1, 1);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        return geometry;
    }

    createMainPileAndHydrants() {
        // 1. Criar a Pilha Principal Gigante
        const pileHeight = 18;
        const pileRadius = 25;
        const geometry = this.createComplexPileGeometry(pileRadius, pileHeight);

        // Material "Procedural" de Palha/Bagaço sem imagem
        const material = new THREE.MeshStandardMaterial({
            color: 0xEAE0C8, // Cor de palha seca/bagaço claro
            roughness: 1.0,  // Muito rugoso, não reflete quase nada
            metalness: 0.0,
            flatShading: false, // Tenta suavizar as normais recalculadas
            vertexColors: true  // Permite pintar o calor
        });

        this.mainPile = new THREE.Mesh(geometry, material);
        // Ajusta a posição Y para que a base deformada fique no nível do chão
        this.mainPile.position.set(0, 0, 0); 
        this.mainPile.castShadow = true;
        this.mainPile.receiveShadow = true;
        this.mainPile.userData = this.pileData;
        
        this.scene.add(this.mainPile);

        // Inicializa com temperatura ambiente
        this.updatePileHeatmap(25);

        // 2. Criar os 6 Hidrantes em volta
        const numHydrants = 6;
        const placementRadius = pileRadius + 5; // 5 metros além da base da pilha

        for (let i = 0; i < numHydrants; i++) {
            const angle = (i / numHydrants) * Math.PI * 2;
            const x = Math.cos(angle) * placementRadius;
            const z = Math.sin(angle) * placementRadius;

            const hydrant = this.createHydrantMesh();
            hydrant.position.set(x, 0, z);
            // Rotaciona para ficar de frente para o centro
            hydrant.lookAt(0, 0, 0); 
            this.scene.add(hydrant);
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Se estiver rodando localmente, ajuste a porta se necessário (ex: localhost:3000)
        const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
        const wsUrl = `${protocol}//${wsHost}`;
        
        console.log("Tentando conectar WS em:", wsUrl);
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log("Websocket 3D Conectado");
        socket.onerror = (err) => console.error("Erro WS 3D:", err);

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                // Como agora só temos uma pilha, qualquer update de sensor afeta ela.
                // Num sistema real, você mapearia qual sensor está em qual parte da pilha grande.
                if (msg.type === 'sensor_update') {
                    // Usamos a temperatura recebida para atualizar o mapa de calor da pilha principal
                    this.updatePileHeatmap(msg.data.temp);
                }
            } catch (e) { console.error(e); }
        };
    }

    // --- ATUALIZAÇÃO DO GRADIENTE DE CALOR (Adaptado para 18m) ---
    updatePileHeatmap(temp) {
        if (!this.mainPile) return;

        const geometry = this.mainPile.geometry;
        const colorsAttr = geometry.attributes.color;
        const posAttr = geometry.attributes.position;
        const count = colorsAttr.count;

        // Cores base e de calor
        // Usamos uma cor base neutra (branco) para multiplicar pela cor do material (palha)
        const baseVertexColor = new THREE.Color(0xFFFFFF); 
        const heatColor = new THREE.Color();
        
        let heatIntensity = 0;

        // Lógica de temperatura (ajuste conforme sua regra de negócio)
        if (temp < 50) {
            heatColor.set(0x10b981); // Verde (só para debug, intensidade será 0)
            heatIntensity = 0;
        } else if (temp < 75) {
            heatColor.set(0xffaa00); // Laranja
            heatIntensity = (temp - 50) / 30; 
        } else {
            heatColor.set(0xff0000); // Vermelho vivo
            // Intensidade aumenta rápido acima de 75
            heatIntensity = 0.2 + Math.min(0.8, (temp - 75) / 20); 
        }

        const vertex = new THREE.Vector3();
        const finalColor = new THREE.Color();
        const maxPileHeight = 18.0; // Altura aproximada da nossa nova pilha

        for (let i = 0; i < count; i++) {
            vertex.fromBufferAttribute(posAttr, i);

            // Fator de Calor:
            // 1. Altura: O calor tende a subir.
            const heightFactor = Math.max(0, vertex.y / maxPileHeight); 

            // 2. Centro: O calor se concentra no "miolo" das partes altas.
            // Calculamos a distância do centro XZ
            const distXZ = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            // Quanto mais perto do centro (distância menor), maior o fator.
            // O divisor '15' controla quão largo é o núcleo quente.
            const centerFactor = Math.max(0, 1 - (distXZ / 15));

            // Combinação dos fatores: Prioriza altura, mas precisa estar no centro.
            let vertexHeatFactor = (heightFactor * 0.4) + (centerFactor * 0.6);
            
            // Se o vértice está no "caminho da carregadeira" (y baixo), ele esfria
            if(vertex.y < 2) vertexHeatFactor *= 0.1;

            vertexHeatFactor = Math.max(0, Math.min(1, vertexHeatFactor));

            // Mistura a cor base com a cor de calor
            finalColor.copy(baseVertexColor).lerp(heatColor, vertexHeatFactor * heatIntensity);

            colorsAttr.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
        }

        colorsAttr.needsUpdate = true;
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    resetCamera() {
        if(!this.camera || !this.controls) return;
        this.camera.position.copy(this.cameraInitialPos);
        this.controls.target.set(0, 5, 0);
        this.controls.update();
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