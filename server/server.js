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
const { exec } = require('child_process'); 
const supabase = require('./utils/supabaseClient'); 

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

// --- Limites de Upload ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const START_TIME = Date.now();

// --- CONTROLE DE ACESSO ---
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
    emailUser: 'monitoramento@belfire.com', 
    emailPass: 'senha123' 
};

// Times de Emergência
const EMERGENCY_TEAMS = {
    1: { name: "Operacional", target: "Supervisor Industrial e TST", msg: "ALERTA NÍVEL 1: Anomalia térmica detectada." },
    2: { name: "Combate", target: "Equipe de Brigadistas", msg: "ALERTA NÍVEL 2: Princípio de incêndio." },
    3: { name: "Gestão", target: "Liderança Bahia Etanol", msg: "ALERTA NÍVEL 3: Incêndio em progresso." },
    4: { name: "Externa", target: "Apoio Regional e Bombeiros (CBM)", msg: "ALERTA NÍVEL 4 (CRÍTICO): Evacuação." }
};

// Email
const mailTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email", 
    port: 587,
    secure: false, 
    auth: { user: 'maddison53@ethereal.email', pass: 'jn7jnAPss4f63QBp6D' }
});

// Telegram
let bot = null;
if (CONFIG.telegramToken !== 'SEU_TELEGRAM_TOKEN_AQUI') {
    try {
        bot = new Telegraf(CONFIG.telegramToken);
        bot.launch().catch(err => console.error("Erro Telegram:", err));
    } catch (e) {}
}

// --- FUNÇÕES AUXILIARES ---
async function logSystemAction(action, user, details) {
    try {
        await supabase.from('system_logs').insert([{ action, user: user || 'Sistema', details, timestamp: new Date() }]);
        console.log(`[AUDIT] ${action}: ${details}`);
    } catch (e) { console.error("Erro log:", e); }
}

async function notify(type, message) {
    try {
        const { data: notification } = await supabase.from('notifications').insert([{ type, message, timestamp: new Date().toISOString() }]).select().single();
        if (type === 'critical' || type === 'prediction') {
            logSystemAction('ALERT_TRIGGERED', 'AI', message);
            if (bot) try { bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`); } catch (e) {}
        }
        broadcast({ type: 'notification', alertType: type, message });
        triggerWebhooks(type, { ...notification, system: 'BEL FIRE AI' });
    } catch (e) { console.error("Erro notificação:", e); }
}

async function triggerWebhooks(type, payload) {
    const { data: webhooks } = await supabase.from('webhooks').select('*');
    if(webhooks) {
        webhooks.forEach(async (hook) => {
            const events = Array.isArray(hook.events) ? hook.events : JSON.parse(hook.events || '[]');
            if (events.includes(type) || events.includes('all')) {
                try { await axios.post(hook.url, payload); } catch (e) {}
            }
        });
    }
}

// --- ROTAS DA API ---

// Login
app.post('/api/v1/login', (req, res) => {
    const { username, password } = req.body;
    const user = USERS[username];
    if (user && user.pass === password) {
        logSystemAction('LOGIN_SUCCESS', user.name, 'Sucesso');
        res.json({ success: true, user: { name: user.name, role: user.role, username: username } });
    } else {
        res.status(401).json({ success: false, message: 'Inválido' });
    }
});

// Emergência
app.post('/api/v1/emergency/trigger', (req, res) => {
    const { phase, user } = req.body;
    const phaseInfo = EMERGENCY_TEAMS[phase];
    if (!phaseInfo) return res.status(400).json({ error: "Inválido" });
    const alertMsg = `Fase ${phase} (${phaseInfo.name}). Contatando: ${phaseInfo.target}`;
    logSystemAction(`EMERGENCY_PHASE_${phase}`, user, alertMsg);
    notify('critical', alertMsg);
    res.json({ success: true, message: alertMsg });
});

// Saúde
app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'online', clients: wss.clients.size });
});

// ========================================================
// >>> ROTAS 3D (HIDRANTES E SETORES) <<<
// ========================================================

// --- HIDRANTES ---
app.get('/api/hydrants', async (req, res) => {
    try {
        const { data, error } = await supabase.from('hydrants').select('*');
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/hydrants', async (req, res) => {
    try {
        const { label, sector, x, z } = req.body;
        console.log("Salvando hidrante:", req.body);
        const { data, error } = await supabase.from('hydrants').insert([{ label, sector, x, z }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// NOVA ROTA: Deletar Hidrante
app.delete('/api/hydrants/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('hydrants').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- SETORES (NOVO) ---
app.get('/api/sectors', async (req, res) => {
    try {
        const { data, error } = await supabase.from('sectors').select('*').order('name');
        if (error) throw error;
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/sectors', async (req, res) => {
    try {
        const { name } = req.body;
        const { data, error } = await supabase.from('sectors').insert([{ name }]).select();
        if (error) throw error;
        res.json(data[0]);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/sectors/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('sectors').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
// ========================================================

// --- Outras Rotas (Compatibilidade) ---
app.get('/api/v1/config/layout', async (req, res) => { res.json({}); });
app.post('/api/v1/config/layout', async (req, res) => { res.json({ success: true }); });

// MQTT & WebSocket
const sensorState = {};
function broadcast(data) {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); });
}

const mqttClient = mqtt.connect(CONFIG.mqttBroker);
mqttClient.on('connect', () => {
    console.log("📡 Conectado MQTT");
    mqttClient.subscribe('usina/bagaco/sensor/#');
});

mqttClient.on('message', async (topic, message) => {
    try {
        let rawData = JSON.parse(message.toString());
        const sensorId = topic.split('/').pop();
        const data = { temp: rawData.temp, humidity: rawData.humidity || 50, pressure: 1013, alerta: rawData.temp > 85 ? 'critical' : 'normal' };

        await supabase.from('sensor_history').insert([{ sensor_id: sensorId, val: data.temp, timestamp: new Date().toISOString() }]);
        if (data.temp > 85) notify('critical', `Fogo no Sensor ${sensorId}`);
        sensorState[sensorId] = { ...data, lastUpdate: Date.now() };
        broadcast({ type: 'sensor_update', sensorId, data: sensorState[sensorId] });
    } catch (e) {}
});

app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../public/index.html')); });

server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
    const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
    exec(start + ' http://localhost:3000', (err) => {});
});