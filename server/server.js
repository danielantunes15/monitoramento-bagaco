const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const cors = require('cors');
const axios = require('axios');
const os = require('os');
const { exec } = require('child_process'); // Para abrir o navegador
const { loadData, saveData } = require('./utils/fileStorage'); // Persistência

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// --- Carrega Dados Persistidos (Não perde nada ao reiniciar) ---
console.log('📂 Carregando base de dados local...');
let memoryDb = loadData();

// --- INICIALIZAÇÃO SEGURA DA BASE DE DADOS ---
// Garante que as listas existam para evitar erros de "undefined"
if (!memoryDb.cameras) memoryDb.cameras = [];
if (!memoryDb.sensors) memoryDb.sensors = [];
if (!memoryDb.webhooks) memoryDb.webhooks = [];
if (!memoryDb.systemLogs) memoryDb.systemLogs = [];
if (!memoryDb.notifications) memoryDb.notifications = [];
if (!memoryDb.sensorHistory) memoryDb.sensorHistory = {};

const MAX_HISTORY = 1000;
const START_TIME = Date.now();

// Função auxiliar para salvar
function persist() {
    saveData(memoryDb);
}

// --- CONTROLE DE ACESSO (Usuários) ---
const USERS = {
    'admin': { pass: 'admin123', name: 'Administrador', role: 'admin' },
    'operador': { pass: 'operador123', name: 'Operador de Turno', role: 'operator' },
    'bombeiro': { pass: 'resgate193', name: 'Comando CBM', role: 'viewer' }
};

// --- Configurações Gerais ---
const CONFIG = {
    telegramToken: 'SEU_TELEGRAM_TOKEN_AQUI', 
    telegramChatId: 'SEU_CHAT_ID_AQUI',
    mqttBroker: 'mqtt://broker.hivemq.com',
    // Configuração de E-mail (Exemplo com Ethereal. Para Gmail, use App Password)
    emailUser: 'monitoramento@belfire.com', 
    emailPass: 'senha123' 
};

// Configuração dos Times de Emergência
const EMERGENCY_TEAMS = {
    1: { name: "Operacional", target: "Supervisor Industrial e TST", msg: "ALERTA NÍVEL 1: Anomalia térmica detectada. Verificar in loco." },
    2: { name: "Combate", target: "Equipe de Brigadistas", msg: "ALERTA NÍVEL 2: Princípio de incêndio. Brigada deslocar para o setor." },
    3: { name: "Gestão", target: "Liderança Bahia Etanol", msg: "ALERTA NÍVEL 3: Incêndio em progresso. Risco operacional crítico." },
    4: { name: "Externa", target: "Apoio Regional e Bombeiros (CBM)", msg: "ALERTA NÍVEL 4 (CRÍTICO): Solicitação de apoio externo. Evacuação." }
};

// Configuração do Transportador de E-mail
const mailTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email", 
    port: 587,
    secure: false, 
    auth: {
        user: 'maddison53@ethereal.email', 
        pass: 'jn7jnAPss4f63QBp6D'
    }
});

// Inicializa Bot Telegram (Opcional)
let bot = null;
if (CONFIG.telegramToken !== 'SEU_TELEGRAM_TOKEN_AQUI') {
    try {
        bot = new Telegraf(CONFIG.telegramToken);
        bot.launch().catch(err => console.error("Erro Telegram:", err));
    } catch (e) {
        console.log("Telegram não configurado.");
    }
}

// --- Logger de Auditoria ---
function logSystemAction(action, user, details) {
    const log = {
        id: Date.now(),
        timestamp: new Date(),
        action: action,
        user: user || 'Sistema',
        details: details
    };
    memoryDb.systemLogs.unshift(log);
    // Mantém os últimos 500 logs
    if (memoryDb.systemLogs.length > 500) memoryDb.systemLogs.pop();
    persist();
    console.log(`[AUDIT] ${action}: ${details}`);
}

// --- Sistema de Notificação Central ---
async function notify(type, message) {
    const notification = {
        id: Date.now(),
        type,
        message,
        timestamp: new Date().toISOString()
    };
    memoryDb.notifications.unshift(notification);
    if (memoryDb.notifications.length > 200) memoryDb.notifications.pop();
    persist();

    // Envia Telegram se for crítico
    if (type === 'critical' || type === 'prediction') {
        logSystemAction('ALERT_TRIGGERED', 'Inteligência Artificial', message);
        if (bot) try { bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`); } catch (e) {}
    }

    // Notifica Frontend via WebSocket
    broadcast({ type: 'notification', alertType: type, message });
    
    // Dispara Webhooks
    triggerWebhooks(type, notification);
}

// Disparador de Webhooks
async function triggerWebhooks(type, payload) {
    memoryDb.webhooks.forEach(async (hook) => {
        if (hook.events.includes(type) || hook.events.includes('all')) {
            try { await axios.post(hook.url, { ...payload, system: 'BEL FIRE AI' }); } catch (e) {}
        }
    });
}

// --- ROTAS DA API ---

// 1. Rota de Login (Autenticação)
app.post('/api/v1/login', (req, res) => {
    const { username, password } = req.body;
    const user = USERS[username];

    if (user && user.pass === password) {
        logSystemAction('LOGIN_SUCCESS', user.name, 'Acesso realizado com sucesso');
        res.json({ 
            success: true, 
            user: { name: user.name, role: user.role, username: username } 
        });
    } else {
        logSystemAction('LOGIN_FAILED', username || 'Anônimo', 'Tentativa de senha incorreta');
        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
});

// 2. Rota de Acionamento de Emergência (Protocolos)
app.post('/api/v1/emergency/trigger', (req, res) => {
    const { phase, user } = req.body;
    const phaseInfo = EMERGENCY_TEAMS[phase];

    if (!phaseInfo) return res.status(400).json({ error: "Fase inválida" });

    const alertMsg = `PROTOCOLOS: Fase ${phase} Iniciada (${phaseInfo.name}). Contatando: ${phaseInfo.target}`;
    
    logSystemAction(`EMERGENCY_PHASE_${phase}`, user || 'Operador', `Acionou equipe: ${phaseInfo.target}`);
    notify('critical', alertMsg);

    res.json({ success: true, message: `Fase ${phase} ativada.`, target: phaseInfo.target });
});

// 3. Monitoramento de Saúde do Servidor
app.get('/api/v1/health', (req, res) => {
    const uptimeSeconds = (Date.now() - START_TIME) / 1000;
    const usedMem = os.totalmem() - os.freemem();
    const memPercentage = (usedMem / os.totalmem()) * 100;

    res.json({
        status: 'online',
        uptime: formatUptime(uptimeSeconds),
        memory_usage: `${memPercentage.toFixed(1)}%`,
        active_connections: wss.clients.size,
        mqtt_status: mqttClient.connected ? 'Conectado' : 'Desconectado',
        database_type: 'JSON Persistence (Local)'
    });
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
}

// 4. Exportação de Relatório CSV
app.get('/api/v1/export/csv', (req, res) => {
    logSystemAction('DATA_EXPORT', 'Usuario_Web', 'Exportou relatório CSV');
    let csvContent = "SensorID,Timestamp,Data,Hora,Temperatura(C)\n";
    if (memoryDb.sensorHistory) {
        Object.keys(memoryDb.sensorHistory).forEach(id => {
            memoryDb.sensorHistory[id].forEach(r => {
                const d = new Date(r.time);
                csvContent += `${id},${d.toISOString()},${d.toLocaleDateString()},${d.toLocaleTimeString()},${r.val.toFixed(2)}\n`;
            });
        });
    }
    res.header('Content-Type', 'text/csv').attachment('belfire_report.csv').send(csvContent);
});

// 5. Rotas de Logs e Webhooks
app.get('/api/v1/logs', (req, res) => res.json(memoryDb.systemLogs));
app.get('/api/v1/webhooks', (req, res) => res.json(memoryDb.webhooks));
app.post('/api/v1/webhooks', (req, res) => {
    const webhook = { id: Date.now(), ...req.body };
    memoryDb.webhooks.push(webhook);
    persist();
    res.json({ success: true });
});
app.delete('/api/v1/webhooks/:id', (req, res) => {
    const id = parseInt(req.params.id);
    memoryDb.webhooks = memoryDb.webhooks.filter(w => w.id !== id);
    persist();
    res.json({ success: true });
});

// === [NOVO] GERENCIAMENTO DE CÂMERAS ===
app.get('/api/v1/cameras', (req, res) => res.json(memoryDb.cameras || []));

app.post('/api/v1/cameras', (req, res) => {
    const newCam = { 
        id: Date.now(), 
        ...req.body, 
        status: 'active' 
    };
    memoryDb.cameras.push(newCam);
    persist();
    res.json({ success: true, camera: newCam });
});

app.delete('/api/v1/cameras/:id', (req, res) => {
    const id = parseInt(req.params.id);
    memoryDb.cameras = memoryDb.cameras.filter(c => c.id !== id);
    persist();
    res.json({ success: true });
});

// === [NOVO] GERENCIAMENTO DE SENSORES ===
app.get('/api/v1/sensors', (req, res) => res.json(memoryDb.sensors || []));

app.post('/api/v1/sensors', (req, res) => {
    const newSensor = { id: Date.now(), ...req.body };
    memoryDb.sensors.push(newSensor);
    persist();
    res.json({ success: true, sensor: newSensor });
});

app.delete('/api/v1/sensors/:id', (req, res) => {
    const id = parseInt(req.params.id);
    memoryDb.sensors = memoryDb.sensors.filter(s => s.id !== id);
    persist();
    res.json({ success: true });
});

// --- CRON JOBS (Relatórios Automáticos) ---
// Roda todos os dias às 08:00
cron.schedule('0 8 * * *', async () => {
    console.log('📧 Iniciando envio de relatório diário...');
    logSystemAction('EMAIL_REPORT', 'CronJob', 'Gerando relatório automático');

    let csvContent = "SensorID,Timestamp,Val\n"; 
    if (memoryDb.sensorHistory) {
        Object.keys(memoryDb.sensorHistory).forEach(id => {
            memoryDb.sensorHistory[id].forEach(r => { csvContent += `${id},${r.time},${r.val}\n`; });
        });
    }

    try {
        await mailTransporter.sendMail({
            from: '"BEL FIRE System" <sistema@belfire.com>',
            to: "gerente@usina.com",
            subject: `📊 Relatório Diário - ${new Date().toLocaleDateString()}`,
            text: "Segue relatório anexo.",
            attachments: [{ filename: 'relatorio.csv', content: csvContent }]
        });
        logSystemAction('EMAIL_SENT', 'System', 'Relatório enviado');
    } catch (error) {
        logSystemAction('EMAIL_ERROR', 'System', 'Falha no envio');
    }
});

// --- INTELIGÊNCIA: Análise de Tendência (Delta T) ---
function analyzeRisk(sensorId, currentTemp) {
    if (!memoryDb.sensorHistory) return;
    const history = memoryDb.sensorHistory[sensorId];
    if (!history || history.length < 5) return;

    const oldReading = history[history.length - 5]; 
    const delta = currentTemp - oldReading.val;

    if (delta > 3) {
        const msg = `Predição de Risco: Sensor ${sensorId} subiu ${delta.toFixed(1)}°C rapidamente!`;
        // Evita flood de alertas iguais
        const lastAlert = memoryDb.notifications.find(n => n.message === msg && (Date.now() - n.id < 30000));
        
        if (!lastAlert) notify('prediction', msg);
    }
}

// --- MQTT & WebSocket ---
const sensorState = {};

function broadcast(data) {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); });
}

const mqttClient = mqtt.connect(CONFIG.mqttBroker);
mqttClient.on('connect', () => {
    console.log("📡 Conectado ao Broker MQTT");
    mqttClient.subscribe('usina/bagaco/sensor/#');
});

mqttClient.on('message', (topic, message) => {
    try {
        let rawData;
        try { rawData = JSON.parse(message.toString()); } catch { rawData = { temp: parseFloat(message.toString()) }; }
        const sensorId = topic.split('/').pop();
        const data = { temp: rawData.temp, humidity: rawData.humidity || 50, pressure: rawData.pressure || 1013, alerta: rawData.temp > 85 ? 'critical' : 'normal', sprinkler: rawData.sprinkler || 'OFF' };

        if (!memoryDb.sensorHistory[sensorId]) memoryDb.sensorHistory[sensorId] = [];
        memoryDb.sensorHistory[sensorId].push({ time: Date.now(), val: data.temp });
        if (memoryDb.sensorHistory[sensorId].length > MAX_HISTORY) memoryDb.sensorHistory[sensorId].shift();
        
        // Salva periodicamente
        if (memoryDb.sensorHistory[sensorId].length % 20 === 0) persist();

        analyzeRisk(sensorId, data.temp);

        if (data.temp > 85) notify('critical', `Fogo no Sensor ${sensorId}`);

        sensorState[sensorId] = { ...data, lastUpdate: Date.now() };
        broadcast({ type: 'sensor_update', sensorId, data: sensorState[sensorId] });
    } catch (e) {}
});

// --- Servidor Web (Arquivos Estáticos) ---
app.use(express.static(path.join(__dirname, '../public')));

// Redireciona tudo que não for API para o index (para lidar com SPA/PWA se necessário)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- INICIALIZAÇÃO ---
server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
    console.log('💾 Sistema de Persistência: ATIVO');
    console.log('🔒 Sistema de Autenticação: ATIVO');
    console.log('🌍 Abrindo navegador automaticamente...');

    const url = 'http://localhost:3000';
    const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
    
    exec(start + ' ' + url, (err) => {
        if(err) console.log('⚠️  Acesse manualmente: ' + url);
    });
});