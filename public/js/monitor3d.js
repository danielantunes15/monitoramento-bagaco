import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        
        // --- Configuração Básica ---
        this.pilePosition = new THREE.Vector3(150, 0, -85);
        this.cameraInitialPos = new THREE.Vector3(this.pilePosition.x + 80, 40, this.pilePosition.z + 50); 
        
        // --- Variáveis Three.js ---
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControl = null; // Controle para Mover Objetos
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // --- Objetos da Cena ---
        this.mainPile = null;
        this.groundPlane = null;
        this.hydrants = [];
        
        // --- Estado do Desenvolvedor ---
        this.isDevMode = false;
        this.currentTool = 'nav'; // 'nav', 'move', 'sculpt', 'hydrant'
        this.isMouseDown = false;
        this.brushSize = 15;
        this.brushIntensity = 0.5;

        this.init();
        this.createEnvironment();       
        this.createMainPileAndHydrants(); 
        this.setupTransformControls(); // Inicializa o gizmo de movimento
        this.setupWebSocket();
        this.setupInteraction();
        this.animate();
        
        window.addEventListener('resize', () => this.onWindowResize());
        window.digitalTwin = this;
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);
        this.scene.fog = new THREE.Fog(0x111827, 50, 350);

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.copy(this.cameraInitialPos);
        this.camera.lookAt(this.pilePosition);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 300;
        this.controls.target.copy(this.pilePosition);
    }

    setupTransformControls() {
        // Inicializa o controle de transformação (gizmo)
        this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
        
        // Quando o usuário está arrastando o gizmo, desativamos o OrbitControls da câmera
        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });

        this.scene.add(this.transformControl);
    }

    createEnvironment() {
        const textureLoader = new THREE.TextureLoader();
        const plantMap = textureLoader.load('assets/3.png', undefined, undefined, () => console.log('Textura padrão usada'));
        plantMap.colorSpace = THREE.SRGBColorSpace; 

        const planeGeometry = new THREE.PlaneGeometry(600, 600);
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            map: plantMap, color: 0x888888, roughness: 0.8, metalness: 0.1
        });

        this.groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.receiveShadow = true;
        this.groundPlane.position.y = -0.1;
        this.groundPlane.name = "ground";
        this.scene.add(this.groundPlane);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(150, 150, 50); 
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        const d = 300;
        dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
        this.scene.add(dirLight);
    }

    // --- LÓGICA DE INTERAÇÃO ---
    setupInteraction() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            this.handleMouseMove(e);
        });

        canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            if (this.isDevMode && this.currentTool !== 'nav' && this.currentTool !== 'move') {
                this.controls.enabled = false;
                this.handleMouseDown(e);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            // Só reativa controls se não estivermos movendo via TransformControls
            if(!this.transformControl.dragging) {
                this.controls.enabled = true;
            }
        });

        window.addEventListener('keydown', (e) => {
            if (!this.isDevMode) return;
            // Atalhos pincel
            if (e.key === '[') { this.brushSize = Math.max(5, this.brushSize - 2); this.updateBrushCursor(); }
            if (e.key === ']') { this.brushSize = Math.min(50, this.brushSize + 2); this.updateBrushCursor(); }
            
            // Atalhos Gizmo (quando em modo mover)
            if (this.currentTool === 'move') {
                if(e.key === 't') this.transformControl.setMode('translate'); // Mover
                if(e.key === 'r') this.transformControl.setMode('rotate');    // Rotacionar
                //if(e.key === 's') this.transformControl.setMode('scale');     // Escalar
            }
        });
    }

    handleMouseMove(e) {
        if (!this.isDevMode) return;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.currentTool === 'sculpt') {
            const intersects = this.raycaster.intersectObject(this.mainPile);
            const cursor = document.getElementById('brush-cursor');
            
            if (intersects.length > 0) {
                cursor.style.display = 'block';
                cursor.style.left = e.clientX + 'px';
                cursor.style.top = e.clientY + 'px';
                if (this.isMouseDown) {
                    this.sculptPile(intersects[0].point, e.shiftKey ? -1 : 1);
                }
            } else {
                cursor.style.display = 'none';
            }
        } else {
            document.getElementById('brush-cursor').style.display = 'none';
        }
    }

    handleMouseDown(e) {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.currentTool === 'hydrant') {
            const intersects = this.raycaster.intersectObject(this.groundPlane);
            if (intersects.length > 0) {
                this.addSingleHydrant(intersects[0].point.x, intersects[0].point.z);
            }
        }
        
        if (this.currentTool === 'sculpt') {
            const intersects = this.raycaster.intersectObject(this.mainPile);
            if (intersects.length > 0) {
                this.sculptPile(intersects[0].point, e.shiftKey ? -1 : 1);
            }
        }
        
        // Seleção de objeto para mover (se clicarmos em outro objeto enquanto estivermos no modo move)
        // Por padrão, 'move' já seleciona a Pilha Principal ao ativar a ferramenta.
        // Se quiser mover hidrantes, lógica extra seria necessária aqui.
    }

    sculptPile(point, direction) {
        if (!this.mainPile) return;
        const geometry = this.mainPile.geometry;
        const posAttr = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        const localPoint = this.mainPile.worldToLocal(point.clone());

        for (let i = 0; i < posAttr.count; i++) {
            vertex.fromBufferAttribute(posAttr, i);
            const dist = Math.sqrt(Math.pow(vertex.x - localPoint.x, 2) + Math.pow(vertex.z - localPoint.z, 2));

            if (dist < this.brushSize) {
                const falloff = Math.max(0, 1 - (dist / this.brushSize));
                const power = Math.pow(falloff, 2) * this.brushIntensity * direction;
                let newY = vertex.y + power;
                if(newY < 0) newY = 0;
                posAttr.setY(i, newY);
            }
        }
        posAttr.needsUpdate = true;
        geometry.computeVertexNormals();
        this.updatePileHeatmap(55); 
    }

    // --- INTERFACE & FERRAMENTAS ---
    toggleDevMode() {
        this.isDevMode = !this.isDevMode;
        const toolbar = document.getElementById('dev-toolbar');
        const btn = document.querySelector('.dev-toggle');
        
        if (this.isDevMode) {
            toolbar.classList.remove('hidden');
            btn.style.background = 'var(--accent-color)';
        } else {
            toolbar.classList.add('hidden');
            btn.style.background = 'rgba(0,0,0,0.5)';
            this.setTool('nav');
        }
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        
        // Mapeamento correto dos IDs
        const btnMap = { 'nav': 'btn-nav', 'move': 'btn-move', 'sculpt': 'btn-sculpt', 'hydrant': 'btn-hydrant' };
        if(btnMap[tool]) document.getElementById(btnMap[tool]).classList.add('active');

        // Lógica do Gizmo de Mover
        if (tool === 'move') {
            this.transformControl.attach(this.mainPile); // Anexa gizmo à pilha
            this.transformControl.setMode('translate');
            this.transformControl.showX = true; // Permite mover em X
            this.transformControl.showZ = true; // Permite mover em Z
            this.transformControl.showY = false; // Trava altura (opcional, mude para true se quiser voar com a pilha)
        } else {
            this.transformControl.detach(); // Remove gizmo
        }
        
        document.body.style.cursor = tool === 'nav' ? 'default' : (tool === 'move' ? 'move' : 'crosshair');
    }
    
    updateBrushCursor() {
        const cursor = document.getElementById('brush-cursor');
        cursor.style.width = (this.brushSize * 5) + 'px';
        cursor.style.height = (this.brushSize * 5) + 'px';
    }

    // --- CRIAÇÃO DE OBJETOS ---
    createHydrantMesh() {
        const group = new THREE.Group();
        const redMaterial = new THREE.MeshStandardMaterial({ color: 0xc41f1f, roughness: 0.3, metalness: 0.4 });
        const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.8, 12);
        const base = new THREE.Mesh(baseGeo, redMaterial);
        base.position.y = 0.9; base.castShadow = true; group.add(base);
        const sideGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8);
        const side = new THREE.Mesh(sideGeo, redMaterial);
        side.rotation.z = Math.PI / 2; side.position.y = 1.2; side.castShadow = true; group.add(side);
        const topGeo = new THREE.SphereGeometry(0.4, 12, 12);
        const top = new THREE.Mesh(topGeo, redMaterial);
        top.position.y = 1.8; group.add(top);
        return group;
    }

    addSingleHydrant(x, z) {
        const hydrant = this.createHydrantMesh();
        hydrant.position.set(x, 0, z);
        hydrant.lookAt(this.mainPile.position.x, 0, this.mainPile.position.z);
        this.scene.add(hydrant);
        this.hydrants.push(hydrant);
    }

    createMainPileAndHydrants() {
        // Pilha
        const pileHeight = 27;
        const pileRadius = 45;
        const geometry = new THREE.ConeGeometry(pileRadius, pileHeight, 128, 64); 
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        
        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            if (vertex.y > 0.5) {
                vertex.x += (Math.random() - 0.5) * 1.5;
                vertex.z += (Math.random() - 0.5) * 1.5;
            }
            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        geometry.computeVertexNormals();

        const colors = [];
        for (let i = 0; i < posAttribute.count; i++) { colors.push(1, 1, 1); }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.MeshStandardMaterial({
            color: 0xEAE0C8, roughness: 1.0, metalness: 0.0,
            vertexColors: true, flatShading: false
        });

        this.mainPile = new THREE.Mesh(geometry, material);
        this.mainPile.position.copy(this.pilePosition);
        this.mainPile.castShadow = true;
        this.mainPile.receiveShadow = true;
        this.scene.add(this.mainPile);
        this.updatePileHeatmap(45);

        // Hidrantes salvos ou padrão
        const savedHydrants = localStorage.getItem('fireguard_hydrants');
        // Verifica se há posição salva da pilha também
        const savedPilePos = localStorage.getItem('fireguard_pile_pos');
        
        if (savedPilePos) {
            const pos = JSON.parse(savedPilePos);
            this.mainPile.position.set(pos.x, pos.y, pos.z);
        }

        if (savedHydrants) {
            JSON.parse(savedHydrants).forEach(pos => this.addSingleHydrant(pos.x, pos.z));
        } else {
            [{ x: 150, z: -15 }, { x: 198, z: -18 }, { x: 198, z: -65 }, { x: 198, z: -115 }]
            .forEach(d => this.addSingleHydrant(d.x, d.z));
        }
    }

    // --- SALVAR TUDO ---
    exportConfig() {
        // 1. Hidrantes
        const hydrantData = this.hydrants.map(h => ({ x: h.position.x, z: h.position.z }));
        localStorage.setItem('fireguard_hydrants', JSON.stringify(hydrantData));
        
        // 2. Posição da Pilha
        const pilePos = {
            x: this.mainPile.position.x,
            y: this.mainPile.position.y,
            z: this.mainPile.position.z
        };
        localStorage.setItem('fireguard_pile_pos', JSON.stringify(pilePos));

        console.log("=== CONFIGURAÇÃO SALVA ===");
        console.log("Pilha:", pilePos);
        console.log("Hidrantes:", hydrantData);
        
        alert(`Layout salvo!\n- Pilha movida\n- ${hydrantData.length} hidrantes salvos`);
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
        const socket = new WebSocket(`${protocol}//${wsHost}`);
        socket.onopen = () => console.log("Monitor3D: WS Conectado");
        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'sensor_update') this.updatePileHeatmap(msg.data.temp);
            } catch (e) {}
        };
    }

    updatePileHeatmap(temp) {
        if (!this.mainPile) return;
        const geometry = this.mainPile.geometry;
        const colorsAttr = geometry.attributes.color;
        const posAttr = geometry.attributes.position;
        const count = colorsAttr.count;

        const baseColor = new THREE.Color(0xFFFFFF);
        const heatColor = new THREE.Color();
        let intensity = 0;

        if (temp < 50) { heatColor.set(0x10b981); intensity = 0; }
        else if (temp < 75) { heatColor.set(0xffaa00); intensity = (temp - 50) / 30; }
        else { heatColor.set(0xff0000); intensity = 0.3 + Math.min(0.7, (temp - 75) / 20); }

        const vertex = new THREE.Vector3();
        const finalColor = new THREE.Color();

        for (let i = 0; i < count; i++) {
            vertex.fromBufferAttribute(posAttr, i);
            let heatFactor = Math.max(0, vertex.y / 25); 
            heatFactor = Math.min(1, heatFactor);
            finalColor.copy(baseColor).lerp(heatColor, heatFactor * intensity);
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
        this.camera.position.copy(this.cameraInitialPos);
        this.controls.target.copy(this.mainPile ? this.mainPile.position : this.pilePosition); // Atualizado para seguir a pilha se ela mudou
        this.controls.update();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    }
}

new DigitalTwin();