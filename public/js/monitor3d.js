/**
 * BEL FIRE - Digital Twin 3D Engine
 * Versão: Gestão Completa de Setores e Hidrantes
 */

class DigitalTwin {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Listas
        this.objects = []; 
        this.activeAlerts = {}; 
        this.hydrants = []; // Lista visual (meshes)
        
        // Configuração Planta
        this.plantImage = './assets/3.png'; 
        this.plantWidth = 200; 
        this.floorPlane = null; 

        // Interatividade
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isAddMode = false; 
        this.tempClickCoords = null; 

        this.init();
        
        window.update3DAlert = (id, temp, status) => this.handleRealData(id, temp, status);
    }

    init() {
        // 1. Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x111111, 0.001); 

        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 100, 100); 

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

        // 2. Luzes
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // 3. Objetos
        this.loadPlantFloor();
        this.addPumpHouse(-27, -60); 

        // 4. Carregar Dados
        this.loadHydrantsFromAPI();

        // 5. Setup UI
        this.setupInteraction();
        this.setupSettingsUI(); // NOVO

        this.animate();

        window.addEventListener('resize', () => {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        });
    }

    setupInteraction() {
        // Reset Cam
        document.getElementById('btn-reset-view').addEventListener('click', () => {
            this.camera.position.set(0, 100, 100);
            this.controls.target.set(0,0,0);
        });

        // Modo Adição
        const btnAdd = document.getElementById('btn-add-mode');
        btnAdd.addEventListener('click', () => {
            this.isAddMode = !this.isAddMode;
            if(this.isAddMode) {
                btnAdd.classList.add('active-mode');
                this.container.style.cursor = 'crosshair';
            } else {
                btnAdd.classList.remove('active-mode');
                this.container.style.cursor = 'default';
            }
        });

        // Clique no Chão
        this.container.addEventListener('click', (event) => {
            if (!this.isAddMode || !this.floorPlane) return;
            
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.floorPlane);
            
            if (intersects.length > 0) {
                const point = intersects[0].point;
                this.openAddModal(point.x, point.z);
            }
        });

        // Modal de Cadastro
        document.getElementById('btn-save-hydrant').addEventListener('click', () => this.saveNewHydrant());
        document.getElementById('btn-cancel-hydrant').addEventListener('click', () => {
            document.getElementById('hydrant-modal').style.display = 'none';
        });
    }

    setupSettingsUI() {
        const modal = document.getElementById('settings-modal');
        const btnSettings = document.getElementById('btn-settings-3d');
        const btnClose = document.getElementById('btn-close-settings');

        // Abrir Modal de Config
        btnSettings.addEventListener('click', () => {
            modal.style.display = 'flex';
            this.loadHydrantsListUI();
            this.loadSectorsListUI();
        });

        // Fechar
        btnClose.addEventListener('click', () => modal.style.display = 'none');

        // Abas
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        // Adicionar Setor
        document.getElementById('btn-add-sector').addEventListener('click', async () => {
            const name = document.getElementById('new-sector-name').value;
            if(!name) return;
            
            try {
                await fetch('/api/sectors', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name })
                });
                document.getElementById('new-sector-name').value = '';
                this.loadSectorsListUI(); // Recarrega a lista
            } catch (e) { console.error(e); }
        });
    }

    // --- LÓGICA DO MODAL DE CADASTRO ---
    async openAddModal(x, z) {
        this.tempClickCoords = { x, z };
        document.getElementById('click-coords').textContent = `X: ${x.toFixed(1)}, Z: ${z.toFixed(1)}`;
        document.getElementById('hydrant-label').value = '';
        
        // Carrega os setores no SELECT antes de abrir
        const select = document.getElementById('hydrant-sector');
        select.innerHTML = '<option value="">Carregando...</option>';
        
        try {
            const res = await fetch('/api/sectors');
            const sectors = await res.json();
            
            select.innerHTML = '<option value="">Selecione um Setor...</option>';
            sectors.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.name;
                opt.textContent = s.name;
                select.appendChild(opt);
            });
        } catch (e) {
            select.innerHTML = '<option value="">Erro ao carregar setores</option>';
        }

        document.getElementById('hydrant-modal').style.display = 'flex';
    }

    async saveNewHydrant() {
        const label = document.getElementById('hydrant-label').value;
        const sector = document.getElementById('hydrant-sector').value; // Valor do Select
        
        if (!label || !sector) {
            alert("Preencha o nome e selecione o setor!");
            return;
        }

        const payload = {
            label, sector,
            x: this.tempClickCoords.x,
            z: this.tempClickCoords.z
        };

        try {
            const response = await fetch('/api/hydrants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const newHydrant = await response.json();
                this.addHydrantVisual(newHydrant.x, newHydrant.z, newHydrant.label);
                document.getElementById('hydrant-modal').style.display = 'none';
                this.isAddMode = false;
                document.getElementById('btn-add-mode').classList.remove('active-mode');
                this.container.style.cursor = 'default';
                alert("Hidrante cadastrado!");
            }
        } catch (error) { alert("Erro ao salvar."); }
    }

    // --- LÓGICA DAS LISTAS DE CONFIGURAÇÃO ---
    
    async loadHydrantsListUI() {
        const list = document.getElementById('hydrants-list');
        list.innerHTML = 'Carregando...';
        const res = await fetch('/api/hydrants');
        const data = await res.json();
        
        list.innerHTML = '';
        if(data.length === 0) list.innerHTML = '<p class="empty-msg">Nenhum hidrante cadastrado.</p>';

        data.forEach(h => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span><strong>${h.label}</strong> <small>(${h.sector})</small></span>
                <button class="delete-btn" onclick="deleteHydrantItem(${h.id})"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(item);
        });
    }

    async loadSectorsListUI() {
        const list = document.getElementById('sectors-list');
        list.innerHTML = 'Carregando...';
        const res = await fetch('/api/sectors');
        const data = await res.json();

        list.innerHTML = '';
        if(data.length === 0) list.innerHTML = '<p class="empty-msg">Nenhum setor cadastrado.</p>';

        data.forEach(s => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span>${s.name}</span>
                <button class="delete-btn" onclick="deleteSectorItem(${s.id})"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(item);
        });
    }

    // --- FUNÇÕES GLOBAIS (para serem chamadas pelo onclick do HTML) ---
    // Precisamos expor essas funções no window pois estão dentro da classe
}

// Funções globais de deleção
window.deleteHydrantItem = async (id) => {
    if(!confirm("Tem certeza que deseja excluir este hidrante?")) return;
    await fetch(`/api/hydrants/${id}`, { method: 'DELETE' });
    // Recarrega lista e cena (reload simples para atualizar visual)
    location.reload(); 
};

window.deleteSectorItem = async (id) => {
    if(!confirm("Excluir este setor?")) return;
    await fetch(`/api/sectors/${id}`, { method: 'DELETE' });
    // Recarrega apenas a lista visual do modal seria ideal, mas reload garante consistencia
    const btn = document.querySelector(`button[onclick="deleteSectorItem(${id})"]`);
    if(btn) btn.closest('.list-item').remove();
};

// Métodos visuais padrão
DigitalTwin.prototype.addHydrantVisual = function(x, z, label) {
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
    this.hydrants.push(hydrant); 
};

DigitalTwin.prototype.loadHydrantsFromAPI = async function() {
    try {
        const response = await fetch('/api/hydrants');
        if (response.ok) {
            const hydrants = await response.json();
            hydrants.forEach(h => this.addHydrantVisual(h.x, h.z, h.label));
        }
    } catch (error) { console.error(error); }
};

DigitalTwin.prototype.loadPlantFloor = function() {
    const loader = new THREE.TextureLoader();
    loader.load(this.plantImage, (texture) => {
        const aspect = texture.image.width / texture.image.height;
        const planeHeight = this.plantWidth / aspect;
        const geometry = new THREE.PlaneGeometry(this.plantWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        
        this.floorPlane = new THREE.Mesh(geometry, material); 
        this.floorPlane.rotation.x = -Math.PI / 2; 
        this.floorPlane.receiveShadow = true;
        this.scene.add(this.floorPlane);

        const border = new THREE.Mesh(new THREE.PlaneGeometry(this.plantWidth + 2, planeHeight + 2), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
        border.rotation.x = -Math.PI / 2; border.position.y = -0.1;
        this.scene.add(border);
    }, undefined, (err) => {
        const geo = new THREE.PlaneGeometry(200, 150);
        const mat = new THREE.MeshBasicMaterial({ color: 0x27ae60, side: THREE.DoubleSide });
        this.floorPlane = new THREE.Mesh(geo, mat);
        this.floorPlane.rotation.x = -Math.PI/2;
        this.scene.add(this.floorPlane);
    });
};

DigitalTwin.prototype.addPumpHouse = function(x, z) {
    const geometry = new THREE.BoxGeometry(7, 5, 10);
    const material = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.2 });
    const pump = new THREE.Mesh(geometry, material);
    pump.position.set(x, 2.5, z); 
    pump.castShadow = true;
    this.scene.add(pump);
};

DigitalTwin.prototype.handleRealData = function(sensorId, temp, status) {
    if ((status === 'critical' || temp > 80) && !this.activeAlerts[sensorId]) {
        this.createFireEffect(sensorId, 0, 0, temp);
    } else if (status !== 'critical' && temp <= 80 && this.activeAlerts[sensorId]) {
        this.removeFireEffect(sensorId);
    }
};

DigitalTwin.prototype.createFireEffect = function(id, x, z, temp) {
    const geometry = new THREE.SphereGeometry(4, 32, 32); 
    const material = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.7 });
    const fireMesh = new THREE.Mesh(geometry, material);
    fireMesh.position.set(x, 2, z);
    const fireLight = new THREE.PointLight(0xff4500, 3, 40);
    fireLight.position.set(x, 5, z);

    this.scene.add(fireMesh);
    this.scene.add(fireLight);
    this.activeAlerts[id] = { mesh: fireMesh, light: fireLight };

    const banner = document.getElementById('alert-banner-3d');
    if (banner) {
        document.getElementById('alert-location-text').innerHTML = `Sensor ${id}<br>Temp: ${temp.toFixed(1)}°C`;
        banner.style.display = 'flex';
    }
};

DigitalTwin.prototype.removeFireEffect = function(id) {
    const alertObj = this.activeAlerts[id];
    if (alertObj) {
        this.scene.remove(alertObj.mesh);
        this.scene.remove(alertObj.light);
        alertObj.mesh.geometry.dispose();
        alertObj.mesh.material.dispose();
        delete this.activeAlerts[id];
    }
    if (Object.keys(this.activeAlerts).length === 0) {
        document.getElementById('alert-banner-3d').style.display = 'none';
    }
};

DigitalTwin.prototype.animate = function() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
};

window.addEventListener('DOMContentLoaded', () => {
    new DigitalTwin();
});