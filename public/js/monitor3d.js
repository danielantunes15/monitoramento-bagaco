import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        
        // Ajuste da posição inicial da câmera para visualizar a planta inteira e a pilha grande
        this.cameraInitialPos = new THREE.Vector3(50, 60, 80); 
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Referência para a pilha principal para atualizações de calor
        this.mainPile = null;
        this.pileData = { id: '1', name: 'Pilha Principal (Bagaço)' };

        this.init();
        this.createEnvironment();       // Carrega o chão com a imagem 3.png
        this.createMainPileAndHydrants(); // Cria a pilha deformada e os hidrantes
        this.setupWebSocket();
        this.animate();
        
        // Listeners de eventos
        window.addEventListener('resize', () => this.onWindowResize());
        
        const resetBtn = document.getElementById('reset-cam');
        if(resetBtn) {
            resetBtn.addEventListener('click', () => this.resetCamera());
        }
    }

    init() {
        // Cena com fundo escuro profissional
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);
        // Nevoeiro distante para suavizar o horizonte
        this.scene.fog = new THREE.Fog(0x111827, 100, 300); 

        // Câmera
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.copy(this.cameraInitialPos);
        this.camera.lookAt(0, 0, 0);

        // Renderizador
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Sombras suaves
        this.container.appendChild(this.renderer.domElement);

        // Controles de Órbita (Mouse)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; // Movimento suave
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Não deixa a câmera entrar no chão
        this.controls.minDistance = 10;
        this.controls.maxDistance = 200;
        this.controls.target.set(0, 5, 0);
    }

    createEnvironment() {
        // --- 1. Carregar a Planta Baixa (3.png) ---
        const textureLoader = new THREE.TextureLoader();
        
        // Carrega a imagem da pasta assets
        const plantMap = textureLoader.load('assets/3.png');
        plantMap.colorSpace = THREE.SRGBColorSpace; 

        // --- 2. Criar o Chão ---
        // Tamanho 300x300 para caber uma planta grande. 
        // Se a imagem for retangular, você pode alterar para (400, 300) por exemplo.
        const planeGeometry = new THREE.PlaneGeometry(300, 300);
        
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            map: plantMap,       // Textura da planta
            color: 0xffffff,     // Base branca para manter cores originais
            roughness: 0.8,      // Fosco (papel/concreto)
            metalness: 0.1
        });

        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2; // Deita o plano
        plane.receiveShadow = true;      // Permite sombras na planta
        plane.position.y = -0.1;         // Levemente abaixo de zero para evitar bugs visuais
        
        this.scene.add(plane);

        // --- 3. Iluminação ---
        // Luz ambiente mais forte para ver bem a planta
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); 
        this.scene.add(ambientLight);

        // Luz Direcional (Sol)
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        
        // Configuração de sombras para cobrir a área grande da planta
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        const d = 150; // Área de cobertura da sombra
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.bias = -0.0005;
        
        this.scene.add(dirLight);
    }

    // Função auxiliar para criar o modelo do Hidrante
    createHydrantMesh() {
        const group = new THREE.Group();
        const redMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xc41f1f, 
            roughness: 0.3, 
            metalness: 0.4 
        });
        
        // Base (Corpo)
        const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.8, 12);
        const base = new THREE.Mesh(baseGeo, redMaterial);
        base.position.y = 0.9;
        base.castShadow = true;
        group.add(base);

        // Braços laterais (saídas)
        const sideGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8);
        const side = new THREE.Mesh(sideGeo, redMaterial);
        side.rotation.z = Math.PI / 2;
        side.position.y = 1.2;
        side.castShadow = true;
        group.add(side);
        
        // Tampa
        const topGeo = new THREE.SphereGeometry(0.4, 12, 12);
        const top = new THREE.Mesh(topGeo, redMaterial);
        top.position.y = 1.8;
        group.add(top);

        return group;
    }

    // Cria a geometria da pilha com deformação do caminho da máquina
    createComplexPileGeometry(radiusBase, heightMax) {
        // Alta resolução (128 radial, 64 altura) para deformação suave
        const geometry = new THREE.ConeGeometry(radiusBase, heightMax, 128, 64);
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        // Configuração do "corte" (caminho da pá carregadeira)
        const pathWidth = 10.0;    // Largura do corredor (metros)
        const pathDepthFactor = 0.9; // Profundidade do corte (0.0 a 1.0)

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            // 1. Irregularidade (Textura de Bagaço)
            // Apenas acima da base para não estragar o contato com o chão
            if (vertex.y > 0.5) {
                const roughness = 0.6; // Intensidade da rugosidade
                vertex.x += (Math.random() - 0.5) * roughness;
                vertex.z += (Math.random() - 0.5) * roughness;
                vertex.y += (Math.random() - 0.5) * 0.4;
            }

            // 2. Criar o Corredor Central (Onde passa a máquina)
            // Vamos assumir que o caminho é no eixo Z, cortando o eixo X
            const distanceToPathCenter = Math.abs(vertex.x);

            if (distanceToPathCenter < pathWidth / 2) {
                // Cálculo de curva suave para o buraco
                const normalizedDist = distanceToPathCenter / (pathWidth / 2);
                // Cosine ease-in-out para suavizar as bordas do buraco
                const cutCurve = Math.cos(normalizedDist * (Math.PI / 2)); 
                
                // Aplica o rebaixamento
                vertex.y = vertex.y * (1 - (cutCurve * pathDepthFactor));

                // Garante um chão irregular no caminho (terra batida/bagaço pisado)
                if(vertex.y < 1.5 && vertex.y > 0) {
                     vertex.y = 1.0 + (Math.random() * 0.2); 
                }
            }

            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        // Recalcular normais para a luz reagir à nova forma
        geometry.computeVertexNormals();
        
        // Adicionar atributo de cor aos vértices (obrigatório para o mapa de calor)
        const colors = [];
        for (let i = 0; i < posAttribute.count; i++) {
            colors.push(1, 1, 1); // Branco inicial
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        return geometry;
    }

    createMainPileAndHydrants() {
        // --- 1. Criar a Pilha Gigante ---
        const pileHeight = 18; // 18 metros
        const pileRadius = 25; // Base larga
        
        const geometry = this.createComplexPileGeometry(pileRadius, pileHeight);

        // Material Procedural (Sem imagem, simulando palha seca)
        const material = new THREE.MeshStandardMaterial({
            color: 0xEAE0C8,     // Cor de palha/bagaço seco (Bege claro)
            roughness: 1.0,      // Totalmente fosco
            metalness: 0.0,
            vertexColors: true,  // Habilita pintura de calor
            flatShading: false   // Sombreamento suave
        });

        this.mainPile = new THREE.Mesh(geometry, material);
        // Ajuste de posição na planta (Mova X e Z aqui para alinhar com o desenho 3.png)
        this.mainPile.position.set(119, 0, -60); 
        this.mainPile.castShadow = true;
        this.mainPile.receiveShadow = true;
        this.mainPile.userData = this.pileData;
        
        this.scene.add(this.mainPile);

        // Inicializa mapa de calor (temperatura ambiente)
        this.updatePileHeatmap(25);


        // --- 2. Criar os 6 Hidrantes ---
        const numHydrants = 6;
        const placementRadius = pileRadius + 4; // 4m afastado da base da pilha

        for (let i = 0; i < numHydrants; i++) {
            // Distribuição circular
            const angle = (i / numHydrants) * Math.PI * 2;
            
            // Posição X, Z baseada no centro da pilha (0,0)
            // Se mover a pilha, lembre de somar a posição da pilha aqui também
            const x = this.mainPile.position.x + Math.cos(angle) * placementRadius;
            const z = this.mainPile.position.z + Math.sin(angle) * placementRadius;

            const hydrant = this.createHydrantMesh();
            hydrant.position.set(x, 0, z);
            
            // Faz o hidrante "olhar" para o centro da pilha
            hydrant.lookAt(this.mainPile.position.x, 0, this.mainPile.position.z); 
            
            this.scene.add(hydrant);
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
        const wsUrl = `${protocol}//${wsHost}`;
        
        console.log("Monitor3D: Conectando WS em", wsUrl);
        
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log("Monitor3D: WebSocket Conectado");
        
        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'sensor_update') {
                    // Recebeu temperatura de um sensor. 
                    // Atualiza a visualização da pilha principal.
                    this.updatePileHeatmap(msg.data.temp);
                }
            } catch (e) { console.error("Erro no WS 3D:", e); }
        };

        // Reconexão simples em caso de queda
        socket.onclose = () => {
            setTimeout(() => this.setupWebSocket(), 5000);
        };
    }

    updatePileHeatmap(temp) {
        if (!this.mainPile) return;

        const geometry = this.mainPile.geometry;
        const colorsAttr = geometry.attributes.color;
        const posAttr = geometry.attributes.position;
        const count = colorsAttr.count;

        // Definição das cores
        const baseVertexColor = new THREE.Color(0xFFFFFF); // Branco (mantém a cor da palha)
        const heatColor = new THREE.Color();
        
        let heatIntensity = 0;

        // Lógica de Cores baseada na Temperatura
        if (temp < 50) {
            heatColor.set(0x10b981); // Verde (seguro)
            heatIntensity = 0;       // Invisível (mostra só a palha)
        } else if (temp < 75) {
            heatColor.set(0xffaa00); // Laranja (alerta)
            // Intensidade aumenta de 0 a 0.8 conforme sobe de 50 a 75
            heatIntensity = (temp - 50) / 30; 
        } else {
            heatColor.set(0xff0000); // Vermelho (fogo)
            // Intensidade forte e rápida
            heatIntensity = 0.3 + Math.min(0.7, (temp - 75) / 20); 
        }

        const vertex = new THREE.Vector3();
        const finalColor = new THREE.Color();
        const maxPileHeight = 18.0; // Altura da nossa pilha

        // Percorre todos os vértices para pintar
        for (let i = 0; i < count; i++) {
            vertex.fromBufferAttribute(posAttr, i);

            // Fator de Localização do Calor:
            // O calor deve aparecer no CENTRO e em CIMA.
            
            // 1. Fator Altura (Calor sobe)
            const heightFactor = Math.max(0, vertex.y / maxPileHeight); 

            // 2. Fator Centro (Núcleo)
            const distXZ = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            // Quanto mais longe do centro (25m raio), menos calor.
            // O divisor '12' define o tamanho do núcleo quente.
            const centerFactor = Math.max(0, 1 - (distXZ / 12));

            // Combinação ponderada
            let vertexHeatFactor = (heightFactor * 0.5) + (centerFactor * 0.5);
            
            // Se o vértice está no chão ou no caminho rebaixado, esfria
            if(vertex.y < 2) vertexHeatFactor *= 0.1;

            vertexHeatFactor = Math.max(0, Math.min(1, vertexHeatFactor));

            // Interpolação: Cor Base -> Cor de Calor
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

// Inicializa a aplicação 3D
new DigitalTwin();