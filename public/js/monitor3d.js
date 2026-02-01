/**
 * BEL FIRE - Digital Twin 3D Engine
 * Versão Integrada: Recebe dados reais do app.js
 * Atualizado: Casa de Bombas menor e na posição -27, -60
 */

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.objects = []; 
        this.activeAlerts = {}; // Dicionário para rastrear alertas ativos por ID
        
        this.plantImage = './assets/3.png'; 
        this.plantWidth = 200; 
        
        // Mapeamento: Onde fica cada sensor no mapa 3D?
        this.sensorLocations = {
            '1': { x: 20, z: 20, label: "Setor A" },
            '2': { x: 60, z: -40, label: "Setor B" },
            '3': { x: -40, z: 40, label: "Caldeira" }
        };

        this.init();
        
        // Expõe função global para o app.js chamar quando chegar dados
        window.update3DAlert = (id, temp, status) => this.handleRealData(id, temp, status);
    }

    init() {
        // --- 1. Cena e Câmera ---
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x111111, 0.001); 

        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 100, 100); 
        this.camera.lookAt(0, 0, 0);

        // --- 2. Renderizador ---
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // --- 3. Controles ---
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 500;

        // --- 4. Luzes ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // --- 5. Carregar Mapa ---
        this.loadPlantFloor();

        // --- 6. Objetos Estáticos ---
        
        // >>> POSIÇÃO ATUALIZADA (-27, -60) <<<
        this.addPumpHouse(-27, -60, "Casa de Bombas");
        
        // Hidrantes (Posições correspondentes aos sensores para exemplo)
        this.addHydrant(20, 20);   // Perto do Sensor 1
        this.addHydrant(60, -40);  // Perto do Sensor 2
        this.addHydrant(-40, 40);  // Perto do Sensor 3

        // --- 7. Loop ---
        this.animate();

        window.addEventListener('resize', () => {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        });

        // Botão Reset
        const btnReset = document.getElementById('btn-reset-view');
        if(btnReset) btnReset.addEventListener('click', () => {
            this.camera.position.set(0, 100, 100);
            this.controls.target.set(0,0,0);
        });
    }

    // Recebe dados REAIS do app.js
    handleRealData(sensorId, temp, status) {
        const location = this.sensorLocations[sensorId];
        
        // Se não tivermos esse sensor mapeado no 3D, ignoramos
        if (!location) return;

        // Lógica de Alerta
        if ((status === 'critical' || temp > 80) && !this.activeAlerts[sensorId]) {
            console.log(`🔥 FOGO detectado no Sensor ${sensorId} (${temp}°C)`);
            this.createFireEffect(sensorId, location.x, location.z, temp);
        } 
        else if (status !== 'critical' && temp <= 80 && this.activeAlerts[sensorId]) {
            console.log(`✅ Sensor ${sensorId} normalizado.`);
            this.removeFireEffect(sensorId);
        }
    }

    createFireEffect(id, x, z, temp) {
        const geometry = new THREE.SphereGeometry(4, 32, 32); 
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff3300, 
            transparent: true, 
            opacity: 0.7 
        });
        const fireMesh = new THREE.Mesh(geometry, material);
        fireMesh.position.set(x, 2, z);

        const fireLight = new THREE.PointLight(0xff4500, 3, 40);
        fireLight.position.set(x, 5, z);

        this.scene.add(fireMesh);
        this.scene.add(fireLight);

        this.activeAlerts[id] = { mesh: fireMesh, light: fireLight };

        const banner = document.getElementById('alert-banner-3d');
        const locText = document.getElementById('alert-location-text');
        if (banner) {
            locText.innerHTML = `Sensor ${id}<br>Temp: ${temp.toFixed(1)}°C`;
            banner.style.display = 'flex';
        }
        
        this.focusCamera(x, z);
    }

    removeFireEffect(id) {
        const alertObj = this.activeAlerts[id];
        if (alertObj) {
            this.scene.remove(alertObj.mesh);
            this.scene.remove(alertObj.light);
            alertObj.mesh.geometry.dispose();
            alertObj.mesh.material.dispose();
            delete this.activeAlerts[id];
        }

        if (Object.keys(this.activeAlerts).length === 0) {
            const banner = document.getElementById('alert-banner-3d');
            if(banner) banner.style.display = 'none';
        }
    }

    loadPlantFloor() {
        const loader = new THREE.TextureLoader();
        loader.load(this.plantImage, (texture) => {
            const aspect = texture.image.width / texture.image.height;
            const planeHeight = this.plantWidth / aspect;
            const geometry = new THREE.PlaneGeometry(this.plantWidth, planeHeight);
            const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            const plane = new THREE.Mesh(geometry, material);
            plane.rotation.x = -Math.PI / 2; 
            plane.receiveShadow = true;
            this.scene.add(plane);
        }, undefined, (err) => {
            console.error("Erro na imagem. Usando chão provisório.");
            const p = new THREE.Mesh(
                new THREE.PlaneGeometry(200, 150),
                new THREE.MeshBasicMaterial({ color: 0x27ae60, side: THREE.DoubleSide })
            );
            p.rotation.x = -Math.PI/2;
            this.scene.add(p);
        });
    }

    addPumpHouse(x, z, label) {
        // >>> TAMANHO REDUZIDO NOVAMENTE <<<
        // Anterior: (10, 8, 14) -> Agora: (7, 5, 10)
        const geometry = new THREE.BoxGeometry(7, 5, 10);
        const material = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.2 });
        const pump = new THREE.Mesh(geometry, material);
        
        // Posição Y = Altura/2 (5/2 = 2.5) para ficar exatamente no chão
        pump.position.set(x, 2.5, z); 
        pump.castShadow = true;
        this.scene.add(pump);
    }

    addHydrant(x, z) {
        // --- HIDRANTE PEQUENO ---
        const baseGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 12); 
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 }); 
        const hydrant = new THREE.Mesh(baseGeo, material);
        hydrant.position.set(x, 0.75, z);
        hydrant.castShadow = true;

        const top = new THREE.Mesh(new THREE.SphereGeometry(0.3), material);
        top.position.y = 0.75;
        hydrant.add(top);

        const side = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1), material);
        side.rotation.z = Math.PI / 2;
        side.position.y = 0.3;
        hydrant.add(side);
        
        this.scene.add(hydrant);
    }

    focusCamera(x, z) {
        if (this.camera.position.y > 50) {
            this.camera.position.set(x + 20, 30, z + 20);
            this.controls.target.set(x, 0, z);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();

        const time = Date.now() * 0.005;
        for (const id in this.activeAlerts) {
            const alert = this.activeAlerts[id];
            const scale = 1 + Math.sin(time * 5) * 0.2;
            alert.mesh.scale.set(scale, scale, scale);
            alert.light.intensity = 2 + Math.sin(time * 10);
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new DigitalTwin();
});