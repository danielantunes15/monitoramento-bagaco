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

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// --- Banco de Dados em Memória ---
const memoryDb = {
    notifications: [],
    sensorHistory: {}, // Armazena leituras: { '1': [{time:..., val:...}], '2': [...] }
    webhooks: [],
    systemLogs: []     // Logs de auditoria
};

const MAX_HISTORY = 1000;

// Função de Log de Auditoria
function logSystemAction(action, user, details) {
    const log = {
        id: Date.now(),
        timestamp: new Date(),
        action: action, // Ex: 'LOGIN', 'EXPORT', 'CONFIG_CHANGE'
        user: user || 'Sistema',
        details: details
    };
    memoryDb.systemLogs.unshift(log);
    // Mantém apenas os últimos 500 logs
    if (memoryDb.systemLogs.length > 500) memoryDb.systemLogs.pop();
    console.log(`[AUDIT] ${action}: ${details}`);
}

// Log inicial
logSystemAction('SYSTEM_STARTUP', 'Admin', 'Servidor iniciado com sucesso');

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

// --- Notificações ---
async function notify(type, message) {
    const notification = {
        id: Date.now(),
        type,
        message,
        timestamp: new Date().toISOString()
    };

    memoryDb.notifications.unshift(notification);
    if (memoryDb.notifications.length > 200) memoryDb.notifications.pop();

    if (type === 'critical') {
        logSystemAction('ALERT_CRITICAL', 'Sistema', message);
        if (bot) {
            try { bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`); } catch (e) {}
        }
    }

    broadcast({ type: 'notification', alertType: type, message });
    triggerWebhooks(type, notification);
}

// --- Webhooks ---
async function triggerWebhooks(type, payload) {
    memoryDb.webhooks.forEach(async (hook) => {
        if (hook.events.includes(type) || hook.events.includes('all')) {
            try {
                await axios.post(hook.url, {
                    event: 'alert',
                    alert_type: type,
                    message: payload.message,
                    timestamp: payload.timestamp
                });
                logSystemAction('WEBHOOK_SENT', 'Sistema', `Enviado para ${hook.name}`);
            } catch (error) {
                console.error(`Falha webhook ${hook.name}`);
            }
        }
    });
}

// --- API: Exportação de Relatórios (CSV) ---
app.get('/api/v1/export/csv', (req, res) => {
    logSystemAction('DATA_EXPORT', 'Usuario_Web', 'Exportou relatório completo CSV');

    let csvContent = "SensorID,Timestamp,Data,Temperatura(C)\n";

    // Itera sobre o histórico e formata para CSV
    Object.keys(memoryDb.sensorHistory).forEach(sensorId => {
        const readings = memoryDb.sensorHistory[sensorId];
        readings.forEach(r => {
            const date = new Date(r.time).toISOString();
            csvContent += `${sensorId},${date},${date.split('T')[0]},${r.val.toFixed(2)}\n`;
        });
    });

    // Se estiver vazio, adiciona dados dummy para teste
    if (Object.keys(memoryDb.sensorHistory).length === 0) {
        csvContent += "1,2026-01-31T10:00:00.000Z,2026-01-31,45.50\n";
        csvContent += "1,2026-01-31T10:05:00.000Z,2026-01-31,46.10\n";
        csvContent += "2,2026-01-31T10:00:00.000Z,2026-01-31,52.30\n";
    }

    res.header('Content-Type', 'text/csv');
    res.attachment('relatorio_belfire.csv');
    res.send(csvContent);
});

// --- API: Logs do Sistema ---
app.get('/api/v1/logs', (req, res) => {
    res.json(memoryDb.systemLogs);
});

// --- API: Webhooks ---
app.get('/api/v1/webhooks', (req, res) => res.json(memoryDb.webhooks));
app.post('/api/v1/webhooks', (req, res) => {
    const { name, url, events } = req.body;
    const newHook = { id: Date.now(), name, url, events: events || ['critical'] };
    memoryDb.webhooks.push(newHook);
    logSystemAction('CONFIG_CHANGE', 'Admin', `Novo Webhook adicionado: ${name}`);
    res.json({ success: true });
});
app.delete('/api/v1/webhooks/:id', (req, res) => {
    const id = parseInt(req.params.id);
    memoryDb.webhooks = memoryDb.webhooks.filter(w => w.id !== id);
    logSystemAction('CONFIG_CHANGE', 'Admin', `Webhook removido (ID: ${id})`);
    res.json({ success: true });
});

// --- WebSocket & MQTT (Mantidos) ---
const sensorState = {};

function broadcast(data) {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); });
}

const mqttClient = mqtt.connect(CONFIG.mqttBroker);
mqttClient.on('connect', () => { mqttClient.subscribe('usina/bagaco/sensor/#'); });

mqttClient.on('message', (topic, message) => {
    try {
        let rawData;
        try { rawData = JSON.parse(message.toString()); } catch { rawData = { temp: parseFloat(message.toString()) }; }
        const sensorId = topic.split('/').pop();
        const data = { 
            temp: rawData.temp, 
            humidity: rawData.humidity || 50, 
            pressure: rawData.pressure || 1013 
        };

        // Salva histórico real
        if (!memoryDb.sensorHistory[sensorId]) memoryDb.sensorHistory[sensorId] = [];
        memoryDb.sensorHistory[sensorId].push({ time: Date.now(), val: data.temp });
        if (memoryDb.sensorHistory[sensorId].length > MAX_HISTORY) memoryDb.sensorHistory[sensorId].shift();

        // Lógica de alerta
        if (data.temp > 85) notify('critical', `Fogo no Sensor ${sensorId}`);
        
        sensorState[sensorId] = { ...data, lastUpdate: Date.now() };
        broadcast({ type: 'sensor_update', sensorId, data: sensorState[sensorId] });
    } catch (e) {}
});

// Servidor Web
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../public/index.html'));
});

server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
});