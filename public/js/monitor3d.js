import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        
        // --- Configuração Básica ---
        this.pilePosition = new THREE.Vector3(150, 0, -85);
        // Posição temporária até carregar do banco
        this.cameraInitialPos = new THREE.Vector3(150, 100, 150); 
        
        // --- Variáveis Three.js ---
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControl = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // --- Objetos da Cena ---
        this.mainPile = null;
        this.groundPlane = null;
        this.hydrants = [];
        
        // --- Estado do Desenvolvedor ---
        this.isDevMode = false;
        this.currentTool = 'nav'; 
        this.isMouseDown = false;
        this.brushSize = 15;
        this.brushIntensity = 0.5;

        this.init();
        this.createEnvironment();       
        this.loadLayoutFromServer(); // Carrega e Ajusta a Câmera
        this.setupTransformControls();
        this.setupWebSocket();
        this.setupInteraction();
        this.animate();
        
        window.addEventListener('resize', () => this.onWindowResize());
        window.digitalTwin = this;
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);
        // REMOVIDO: this.scene.fog para limpar a visão do mapa
        // Se quiser neblina leve no futuro, use: new THREE.FogExp2(0x111827, 0.002);

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 2000); // Aumentei o alcance de visão (far)
        this.camera.position.copy(this.cameraInitialPos);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    }

    setupTransformControls() {
        this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.scene.add(this.transformControl);
    }

    createEnvironment() {
        const textureLoader = new THREE.TextureLoader();
        // Ajuste o caminho da textura se necessário
        const plantMap = textureLoader.load('assets/3.png');
        plantMap.colorSpace = THREE.SRGBColorSpace; 

        const planeGeometry = new THREE.PlaneGeometry(800, 800); // Aumentei o plano
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            map: plantMap, 
            color: 0xffffff, // Cor branca para não escurecer a imagem
            roughness: 0.8, 
            metalness: 0.1
        });

        this.groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.receiveShadow = true;
        this.groundPlane.position.y = -0.2; // Levemente abaixo para não z-fight
        this.scene.add(this.groundPlane);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); // Luz mais forte
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(150, 200, 50); 
        dirLight.castShadow = true;
        // Ajuste da sombra para cobrir área maior
        dirLight.shadow.camera.left = -400;
        dirLight.shadow.camera.right = 400;
        dirLight.shadow.camera.top = 400;
        dirLight.shadow.camera.bottom = -400;
        this.scene.add(dirLight);
    }

    // --- CARREGAMENTO E LOGICA DE CÂMERA ---
    
    async loadLayoutFromServer() {
        this.createMainPile(); // Garante que o objeto existe

        try {
            const res = await fetch('/api/v1/config/layout');
            const config = await res.json();

            // 1. Aplica posição da pilha
            if (config.pile_position) {
                this.mainPile.position.set(config.pile_position.x, config.pile_position.y, config.pile_position.z);
                this.focusCameraOnPile(); // <--- NOVA LÓGICA DE FOCO
            }

            // 2. Aplica hidrantes
            if (config.hydrants && Array.isArray(config.hydrants)) {
                this.hydrants.forEach(h => this.scene.remove(h));
                this.hydrants = [];
                config.hydrants.forEach(pos => this.addSingleHydrant(pos.x, pos.z));
            }
        } catch (e) {
            console.error("Erro ao carregar layout:", e);
            // Se der erro, foca na posição padrão
            this.focusCameraOnPile();
        }
    }

    // Nova função para posicionar a câmera de forma agradável
    focusCameraOnPile() {
        if (!this.mainPile) return;

        const target = this.mainPile.position;
        
        // Define um offset: +80 no X, +60 no Y (altura), +80 no Z
        // Isso cria uma vista isométrica diagonal
        const offset = new THREE.Vector3(80, 60, 80);
        
        const newCamPos = target.clone().add(offset);

        // Move a câmera suavemente (opcional, aqui é instantâneo na carga)
        this.camera.position.copy(newCamPos);
        
        // Aponta o centro da órbita para a pilha
        this.controls.target.copy(target);
        this.controls.update();
    }

    async exportConfig() {
        const hydrantData = this.hydrants.map(h => ({ x: h.position.x, z: h.position.z }));
        const pilePos = {
            x: this.mainPile.position.x,
            y: this.mainPile.position.y,
            z: this.mainPile.position.z
        };

        try {
            const res = await fetch('/api/v1/config/layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pile_position: pilePos, hydrants: hydrantData })
            });
            if (res.ok) alert("Layout salvo!");
        } catch (e) { alert("Erro ao salvar."); }
    }

    createMainPile() {
        if (this.mainPile) return;
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
    }

    addSingleHydrant(x, z) {
        const group = new THREE.Group();
        const redMaterial = new THREE.MeshStandardMaterial({ color: 0xc41f1f, roughness: 0.3, metalness: 0.4 });
        
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.8, 12), redMaterial);
        base.position.y = 0.9; base.castShadow = true; group.add(base);
        
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), redMaterial);
        top.position.y = 1.8; group.add(top);

        group.position.set(x, 0, z);
        this.scene.add(group);
        this.hydrants.push(group);
    }

    // --- INTERAÇÃO ---
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
            if(!this.transformControl.dragging) this.controls.enabled = true;
        });

        window.addEventListener('keydown', (e) => {
            if (!this.isDevMode) return;
            if (e.key === '[') { this.brushSize = Math.max(5, this.brushSize - 2); this.updateBrushCursor(); }
            if (e.key === ']') { this.brushSize = Math.min(50, this.brushSize + 2); this.updateBrushCursor(); }
            if (this.currentTool === 'move') {
                if(e.key === 't') this.transformControl.setMode('translate');
                if(e.key === 'r') this.transformControl.setMode('rotate');
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
                if (this.isMouseDown) this.sculptPile(intersects[0].point, e.shiftKey ? -1 : 1);
            } else { cursor.style.display = 'none'; }
        }
    }

    handleMouseDown(e) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.currentTool === 'hydrant') {
            const intersects = this.raycaster.intersectObject(this.groundPlane);
            if (intersects.length > 0) this.addSingleHydrant(intersects[0].point.x, intersects[0].point.z);
        }
        if (this.currentTool === 'sculpt') {
            const intersects = this.raycaster.intersectObject(this.mainPile);
            if (intersects.length > 0) this.sculptPile(intersects[0].point, e.shiftKey ? -1 : 1);
        }
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
        const btnMap = { 'nav': 'btn-nav', 'move': 'btn-move', 'sculpt': 'btn-sculpt', 'hydrant': 'btn-hydrant' };
        if(btnMap[tool]) document.getElementById(btnMap[tool]).classList.add('active');

        if (tool === 'move') {
            this.transformControl.attach(this.mainPile);
            this.transformControl.setMode('translate');
            this.transformControl.showY = false;
        } else { this.transformControl.detach(); }
        document.body.style.cursor = tool === 'nav' ? 'default' : (tool === 'move' ? 'move' : 'crosshair');
    }
    
    updateBrushCursor() {
        const cursor = document.getElementById('brush-cursor');
        cursor.style.width = (this.brushSize * 5) + 'px';
        cursor.style.height = (this.brushSize * 5) + 'px';
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
    
    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    }
}

new DigitalTwin();