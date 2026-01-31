const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const cors = require('cors');

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Habilita CORS para API REST externa
app.use(cors());
app.use(express.json());

// --- Banco de Dados em Memória (Sem SQLite) ---
const memoryDb = {
    notifications: [], // Histórico de alertas
    sensorHistory: {}, // Histórico de leituras para gráficos
    systemLogs: []     // Logs do sistema
};

// Limite de histórico (para não estourar a memória RAM)
const MAX_HISTORY = 1000;

// --- Configurações (Substitua por variáveis de ambiente em produção) ---
const CONFIG = {
    telegramToken: 'SEU_TELEGRAM_TOKEN_AQUI', 
    telegramChatId: 'SEU_CHAT_ID_AQUI',
    emailUser: 'seu-email@gmail.com',
    emailPass: 'sua-senha-de-app', // Use Senha de App do Google
    mqttBroker: 'mqtt://broker.hivemq.com'
};

// Inicializa Bot e Email (apenas se configurado, para não crashar)
let bot = null;
if (CONFIG.telegramToken !== 'SEU_TELEGRAM_TOKEN_AQUI') {
    bot = new Telegraf(CONFIG.telegramToken);
    bot.launch().catch(err => console.error("Erro Telegram:", err));
}

const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: CONFIG.emailUser, pass: CONFIG.emailPass }
});

// --- Estado Atual dos Sensores ---
const sensorState = {};

// --- Lógica Industrial e de Controle ---
function checkIndustrialLogic(sensorId, data) {
    const status = {
        ventilador: 'OFF',
        sprinkler: 'OFF',
        alerta: 'normal'
    };

    // 1. Controle de Ventilação (Baseado em Temperatura)
    // Se passar de 60°C, liga ventilação forçada
    if (data.temp > 60) {
        status.ventilador = 'ON';
        // Simulação de envio de comando para o atuador físico
        // mqttClient.publish(`usina/atuadores/${sensorId}/fan`, 'ON');
    }

    // 2. Integração com Sprinklers (Baseado em Temperatura Crítica)
    // Se passar de 85°C, aciona sprinklers automaticamente
    if (data.temp > 85) {
        status.sprinkler = 'ON';
        status.alerta = 'critical';
        notify('critical', `FOGO IMINENTE: Sprinklers ativados no Sensor ${sensorId}!`);
        // mqttClient.publish(`usina/atuadores/${sensorId}/sprinkler`, 'ON');
    } else if (data.temp > 70) {
        status.alerta = 'warning';
    }

    // 3. Monitoramento de Pressão (Segurança da Pilha)
    // Pressão alta pode indicar compactação excessiva e risco de explosão de gás
    if (data.pressure && data.pressure > 1200) { // hPa
        notify('warning', `Pressão alta detectada na pilha do Sensor ${sensorId}`);
    }

    return status;
}

// --- Sistema de Notificações ---
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

    // 2. Enviar para Telegram (Críticos)
    if (type === 'critical' && bot) {
        try {
            bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`);
        } catch (e) { console.error('Erro Telegram:', e.message); }
    }

    // 3. Broadcast WebSocket (Frontend)
    broadcast({ type: 'notification', alertType: type, message });
}

// --- Funções Auxiliares WebSocket ---
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// --- MQTT (Recepção de Dados dos Sensores) ---
const mqttClient = mqtt.connect(CONFIG.mqttBroker);

mqttClient.on('connect', () => {
    console.log('📡 Conectado ao Broker MQTT');
    mqttClient.subscribe('usina/bagaco/sensor/#');
});

mqttClient.on('message', (topic, message) => {
    try {
        // Simulação de dados extras se o sensor enviar apenas temperatura
        // Em produção, o sensor deve enviar o JSON completo
        let rawData;
        try {
            rawData = JSON.parse(message.toString());
        } catch {
            // Fallback se vier apenas um número
            rawData = { temp: parseFloat(message.toString()) };
        }

        const sensorId = topic.split('/').pop();
        
        // Dados completos (simulando umidade/pressão se não vierem)
        const data = {
            temp: rawData.temp,
            humidity: rawData.humidity || (50 + Math.random() * 20), // Simulação
            pressure: rawData.pressure || (1013 + Math.random() * 10), // Simulação
            battery: rawData.battery || 100
        };

        // Aplica lógica industrial
        const logicStatus = checkIndustrialLogic(sensorId, data);

        // Atualiza Estado Global
        sensorState[sensorId] = {
            ...data,
            ...logicStatus,
            lastUpdate: Date.now()
        };

        // Salva Histórico para Gráficos
        if (!memoryDb.sensorHistory[sensorId]) memoryDb.sensorHistory[sensorId] = [];
        memoryDb.sensorHistory[sensorId].push({ time: Date.now(), val: data.temp });
        if (memoryDb.sensorHistory[sensorId].length > MAX_HISTORY) memoryDb.sensorHistory[sensorId].shift();

        // Envia para o Dashboard em Tempo Real
        broadcast({
            type: 'sensor_update',
            sensorId,
            data: sensorState[sensorId]
        });

    } catch (error) {
        console.error('Erro no processamento MQTT:', error);
    }
});

// --- API REST (Integração com ERP/Outros Sistemas) ---
// Rota para outros sistemas consultarem o status atual
app.get('/api/v1/status', (req, res) => {
    res.json({
        success: true,
        timestamp: new Date(),
        sensors: sensorState,
        system_status: 'online'
    });
});

// Rota para obter histórico (útil para gráficos)
app.get('/api/v1/history/:sensorId', (req, res) => {
    const id = req.params.sensorId;
    res.json(memoryDb.sensorHistory[id] || []);
});

// --- Agendamento de Relatórios (Sem DB) ---
cron.schedule('0 8 * * *', () => {
    console.log('📧 Enviando relatório diário automático...');
    // Aqui iria a lógica do nodemailer
    // emailTransporter.sendMail(...)
});

// --- Servidor Web ---
app.use(express.static(path.join(__dirname, '../public')));

// Rota padrão para SPA (Single Page Application) se necessário
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
    console.log('📊 API REST disponível em http://localhost:3000/api/v1/status');
});