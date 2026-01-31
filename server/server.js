const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const cors = require('cors');
const axios = require('axios'); // Necessário para Webhooks

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// --- Banco de Dados em Memória ---
const memoryDb = {
    notifications: [],
    sensorHistory: {},
    // Nova estrutura para Webhooks
    webhooks: [
        // Exemplo: { id: 1, name: 'Discord TI', url: 'https://discord...', events: ['critical'] }
    ]
};

const MAX_HISTORY = 1000;

// --- Configurações ---
const CONFIG = {
    telegramToken: 'SEU_TELEGRAM_TOKEN_AQUI', 
    telegramChatId: 'SEU_CHAT_ID_AQUI',
    emailUser: 'seu-email@gmail.com',
    emailPass: 'sua-senha-de-app',
    mqttBroker: 'mqtt://broker.hivemq.com'
};

// Inicializa Bot (Opcional)
let bot = null;
if (CONFIG.telegramToken !== 'SEU_TELEGRAM_TOKEN_AQUI') {
    bot = new Telegraf(CONFIG.telegramToken);
    bot.launch().catch(err => console.error("Erro Telegram:", err));
}

// --- Sistema de Notificações Unificado ---
async function notify(type, message) {
    const notification = {
        id: Date.now(),
        type,
        message,
        timestamp: new Date().toISOString()
    };

    // 1. Salvar na Memória
    memoryDb.notifications.unshift(notification);
    if (memoryDb.notifications.length > 200) memoryDb.notifications.pop();

    // 2. Telegram
    if (type === 'critical' && bot) {
        try { bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`); } catch (e) {}
    }

    // 3. WebSocket (Frontend)
    broadcast({ type: 'notification', alertType: type, message });

    // 4. WEBHOOKS (Novo)
    triggerWebhooks(type, notification);
}

// --- Lógica de Disparo de Webhooks ---
async function triggerWebhooks(type, payload) {
    console.log(`[Webhook] Processando disparos para tipo: ${type}`);
    
    memoryDb.webhooks.forEach(async (hook) => {
        // Verifica se este webhook assina este tipo de evento
        if (hook.events.includes(type) || hook.events.includes('all')) {
            try {
                console.log(`[Webhook] Enviando para: ${hook.name}`);
                await axios.post(hook.url, {
                    event: 'alert',
                    alert_type: type,
                    message: payload.message,
                    timestamp: payload.timestamp,
                    system: 'BEL FIRE Enterprise'
                });
            } catch (error) {
                console.error(`[Webhook] Falha ao enviar para ${hook.name}:`, error.message);
            }
        }
    });
}

// --- API REST para Webhooks (Gerenciamento) ---

// Listar Webhooks
app.get('/api/v1/webhooks', (req, res) => {
    res.json(memoryDb.webhooks);
});

// Adicionar Webhook
app.post('/api/v1/webhooks', (req, res) => {
    const { name, url, events } = req.body;
    
    if (!name || !url) return res.status(400).json({ error: 'Nome e URL obrigatórios' });

    const newHook = {
        id: Date.now(),
        name,
        url,
        events: events || ['critical'], // Por padrão, só críticos
        active: true,
        created_at: new Date()
    };
    
    memoryDb.webhooks.push(newHook);
    console.log(`[Webhook] Novo webhook cadastrado: ${name}`);
    res.json({ success: true, hook: newHook });
});

// Remover Webhook
app.delete('/api/v1/webhooks/:id', (req, res) => {
    const id = parseInt(req.params.id);
    memoryDb.webhooks = memoryDb.webhooks.filter(w => w.id !== id);
    res.json({ success: true });
});

// Testar Webhook
app.post('/api/v1/webhooks/test', async (req, res) => {
    const { url } = req.body;
    try {
        await axios.post(url, {
            event: 'test',
            message: 'Esta é uma mensagem de teste do BEL FIRE.',
            timestamp: new Date()
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Outras APIs e Lógicas (Mantidas) ---
const sensorState = {};

function checkIndustrialLogic(sensorId, data) {
    const status = { ventilador: 'OFF', sprinkler: 'OFF', alerta: 'normal' };
    if (data.temp > 60) status.ventilador = 'ON';
    if (data.temp > 85) {
        status.sprinkler = 'ON';
        status.alerta = 'critical';
        notify('critical', `FOGO IMINENTE: Sprinklers ativados no Sensor ${sensorId}!`);
    } else if (data.temp > 70) {
        status.alerta = 'warning';
        // notify apenas se mudar de estado (simplificado aqui)
    }
    return status;
}

// WebSocket Broadcast
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
    });
}

// MQTT Handler
const mqttClient = mqtt.connect(CONFIG.mqttBroker);
mqttClient.on('connect', () => {
    console.log('📡 Conectado ao Broker MQTT');
    mqttClient.subscribe('usina/bagaco/sensor/#');
});

mqttClient.on('message', (topic, message) => {
    try {
        let rawData;
        try { rawData = JSON.parse(message.toString()); } 
        catch { rawData = { temp: parseFloat(message.toString()) }; }

        const sensorId = topic.split('/').pop();
        const data = {
            temp: rawData.temp,
            humidity: rawData.humidity || (50 + Math.random() * 20),
            pressure: rawData.pressure || (1013 + Math.random() * 10),
            battery: rawData.battery || 100
        };

        const logicStatus = checkIndustrialLogic(sensorId, data);
        sensorState[sensorId] = { ...data, ...logicStatus, lastUpdate: Date.now() };

        broadcast({ type: 'sensor_update', sensorId, data: sensorState[sensorId] });
    } catch (error) { console.error('Erro MQTT:', error); }
});

// API Status
app.get('/api/v1/status', (req, res) => res.json({ success: true, sensors: sensorState }));

// Servidor Web
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../public/index.html'));
});

server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
    console.log('🔗 Integrações via Webhook ativas');
});