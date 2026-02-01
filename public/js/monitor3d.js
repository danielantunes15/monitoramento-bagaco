import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        
        // --- CONFIGURAÇÃO DE POSIÇÃO ---
        // Posição da Pilha (Central)
        this.pilePosition = new THREE.Vector3(150, 0, -85);

        // Posição da Câmera:
        // Colocamos X e Z próximos da pilha, mas Y bem alto (50) para ver de cima.
        // O offset (+40 no X, +40 no Z) dá uma perspectiva isométrica bonita.
        this.cameraInitialPos = new THREE.Vector3(
            this.pilePosition.x + 40, 
            50, 
            this.pilePosition.z + 40
        ); 
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.mainPile = null;
        this.pileData = { id: '1', name: 'Pilha Principal (Bagaço)' };

        this.init();
        this.createEnvironment();       
        this.createMainPileAndHydrants(); 
        this.setupWebSocket();
        this.animate();
        
        window.addEventListener('resize', () => this.onWindowResize());
        
        const resetBtn = document.getElementById('reset-cam');
        if(resetBtn) {
            resetBtn.addEventListener('click', () => this.resetCamera());
        }
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111827);
        this.scene.fog = new THREE.Fog(0x111827, 50, 250);

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.copy(this.cameraInitialPos);
        // A câmera inicia olhando diretamente para a pilha
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
        this.controls.maxDistance = 200;
        
        // IMPORTANTE: O ponto de giro agora é a posição da sua pilha
        this.controls.target.copy(this.pilePosition);
    }

    createEnvironment() {
        const textureLoader = new THREE.TextureLoader();
        const plantMap = textureLoader.load('assets/3.png');
        plantMap.colorSpace = THREE.SRGBColorSpace; 

        // Aumentei um pouco o chão para garantir que cobre toda a área
        const planeGeometry = new THREE.PlaneGeometry(400, 400);
        
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            map: plantMap,
            color: 0xffffff,
            roughness: 0.8,
            metalness: 0.1
        });

        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        plane.position.y = -0.1;
        
        this.scene.add(plane);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); 
        this.scene.add(ambientLight);

        // Luz ajustada para iluminar a área
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(150, 100, 0); 
        dirLight.castShadow = true;
        
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        const d = 200;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.bias = -0.0005;
        
        this.scene.add(dirLight);
    }

    createHydrantMesh() {
        const group = new THREE.Group();
        const redMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xc41f1f, 
            roughness: 0.3, 
            metalness: 0.4 
        });
        
        const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.8, 12);
        const base = new THREE.Mesh(baseGeo, redMaterial);
        base.position.y = 0.9;
        base.castShadow = true;
        group.add(base);

        const sideGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8);
        const side = new THREE.Mesh(sideGeo, redMaterial);
        side.rotation.z = Math.PI / 2;
        side.position.y = 1.2;
        side.castShadow = true;
        group.add(side);
        
        const topGeo = new THREE.SphereGeometry(0.4, 12, 12);
        const top = new THREE.Mesh(topGeo, redMaterial);
        top.position.y = 1.8;
        group.add(top);

        return group;
    }

    createComplexPileGeometry(radiusBase, heightMax) {
        const geometry = new THREE.ConeGeometry(radiusBase, heightMax, 128, 64);
        const posAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        const pathWidth = 10.0;
        const pathDepthFactor = 0.9;

        for (let i = 0; i < posAttribute.count; i++) {
            vertex.fromBufferAttribute(posAttribute, i);
            
            if (vertex.y > 0.5) {
                const roughness = 0.6;
                vertex.x += (Math.random() - 0.5) * roughness;
                vertex.z += (Math.random() - 0.5) * roughness;
                vertex.y += (Math.random() - 0.5) * 0.4;
            }

            const distanceToPathCenter = Math.abs(vertex.x);

            if (distanceToPathCenter < pathWidth / 2) {
                const normalizedDist = distanceToPathCenter / (pathWidth / 2);
                const cutCurve = Math.cos(normalizedDist * (Math.PI / 2)); 
                
                vertex.y = vertex.y * (1 - (cutCurve * pathDepthFactor));

                if(vertex.y < 1.5 && vertex.y > 0) {
                     vertex.y = 1.0 + (Math.random() * 0.2); 
                }
            }

            posAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        geometry.computeVertexNormals();
        
        const colors = [];
        for (let i = 0; i < posAttribute.count; i++) {
            colors.push(1, 1, 1);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        return geometry;
    }

    createMainPileAndHydrants() {
        // --- 1. Criar a Pilha Gigante ---
        const pileHeight = 18;
        const pileRadius = 25;
        
        const geometry = this.createComplexPileGeometry(pileRadius, pileHeight);

        const material = new THREE.MeshStandardMaterial({
            color: 0xEAE0C8,
            roughness: 1.0,
            metalness: 0.0,
            vertexColors: true,
            flatShading: false
        });

        this.mainPile = new THREE.Mesh(geometry, material);
        
        this.mainPile.position.copy(this.pilePosition); // Usa a posição definida no constructor
        
        this.mainPile.castShadow = true;
        this.mainPile.receiveShadow = true;
        this.mainPile.userData = this.pileData;
        
        this.scene.add(this.mainPile);

        this.updatePileHeatmap(25);

        // --- 2. Criar os Hidrantes (POSIÇÃO MANUAL) ---
        // A pilha está centrada em: X=150, Z=-85
        // Edite os valores abaixo para mover os hidrantes.
        const hydrantLocations = [
            { x: 150, z: -15 },  // Leste da pilha
            { x: 198, z: -18 },  // Oeste da pilha
            { x: 198, z: -65 },  // Sul da pilha
            { x: 198, z: -115 }, // Norte da pilha
            { x: 113, z: -65 },  // Sudeste
            { x: 113, z: -115 }  // Noroeste
        ];

        hydrantLocations.forEach(loc => {
            const hydrant = this.createHydrantMesh();
            
            // Define a posição baseada na lista acima (Y=0 é o chão)
            hydrant.position.set(loc.x, 0, loc.z);
            
            // Faz o hidrante "olhar" para o centro da pilha
            hydrant.lookAt(this.mainPile.position.x, 0, this.mainPile.position.z); 
            
            this.scene.add(hydrant);
        });
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
                    this.updatePileHeatmap(msg.data.temp);
                }
            } catch (e) { console.error("Erro no WS 3D:", e); }
        };

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

        const baseVertexColor = new THREE.Color(0xFFFFFF);
        const heatColor = new THREE.Color();
        
        let heatIntensity = 0;

        if (temp < 50) {
            heatColor.set(0x10b981);
            heatIntensity = 0;
        } else if (temp < 75) {
            heatColor.set(0xffaa00);
            heatIntensity = (temp - 50) / 30; 
        } else {
            heatColor.set(0xff0000);
            heatIntensity = 0.3 + Math.min(0.7, (temp - 75) / 20); 
        }

        const vertex = new THREE.Vector3();
        const finalColor = new THREE.Color();
        const maxPileHeight = 18.0;

        for (let i = 0; i < count; i++) {
            vertex.fromBufferAttribute(posAttr, i);

            const heightFactor = Math.max(0, vertex.y / maxPileHeight); 

            // Distância do centro no plano XZ (local space, pois geometry é relativa ao pivot)
            const distXZ = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
            const centerFactor = Math.max(0, 1 - (distXZ / 12));

            let vertexHeatFactor = (heightFactor * 0.5) + (centerFactor * 0.5);
            
            if(vertex.y < 2) vertexHeatFactor *= 0.1;
            vertexHeatFactor = Math.max(0, Math.min(1, vertexHeatFactor));

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
        // Reseta o foco para a pilha também
        this.controls.target.copy(this.pilePosition);
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

new DigitalTwin();