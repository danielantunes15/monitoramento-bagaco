const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const db = new sqlite3.Database('./database/fireguard.db'); // Histórico de notificações

// Configurações de Integração (Substitua pelos seus dados reais)
const bot = new Telegraf('SEU_TELEGRAM_TOKEN');
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'seu-email@gmail.com', pass: 'sua-senha' }
});

// Inicialização do Banco de Dados para Histórico
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const sensorState = {};

// Função Central de Notificações
async function notify(type, message) {
    // 1. Salvar no Histórico (Filtros e Buscas)
    db.run('INSERT INTO notifications (type, message) VALUES (?, ?)', [type, message]);

    // 2. Enviar Telegram (Alertas Críticos)
    if (type === 'critical') {
        bot.telegram.sendMessage('SEU_CHAT_ID', `🚨 BEL FIRE CRÍTICO: ${message}`);
    }

    // 3. WebSocket para Alerta Sonoro e Push no Navegador
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'notification', alertType: type, message }));
        }
    });
}

// Relatório Diário por E-mail (Agendado para as 08:00)
cron.schedule('0 8 * * *', () => {
    emailTransporter.sendMail({
        from: 'belfire@monitoramento.com',
        to: 'gerente@usina.com',
        subject: 'BEL FIRE - Relatório Diário de Operação',
        text: 'O sistema operou normalmente nas últimas 24h.'
    });
});

const mqttClient = mqtt.connect('mqtt://broker.hivemq.com');
mqttClient.on('connect', () => {
    mqttClient.subscribe('usina/bagaco/sensor/#');
});

mqttClient.on('message', (topic, message) => {
    const data = JSON.parse(message.toString());
    const sensorId = topic.split('/').pop();
    const now = Date.now();

    if (!sensorState[sensorId]) {
        sensorState[sensorId] = { alertStartTime: null, lastTemp: data.temp };
    }

    const state = sensorState[sensorId];
    let status = 'normal';

    if (data.temp > 80) {
        if (!state.alertStartTime) state.alertStartTime = now;
        if ((now - state.alertStartTime) / 1000 > 30) {
            status = 'critical';
            notify('critical', `Sensor ${sensorId} atingiu nível crítico: ${data.temp}°C`);
        }
    } else {
        state.alertStartTime = null;
    }

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'sensor_update', sensorId, temp: data.temp, status }));
        }
    });
});

app.use(express.static(path.join(__dirname, '../public')));
server.listen(3000, () => console.log('🔥 BEL FIRE Online na Porta 3000'));