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
const { loadData, saveData } = require('./utils/fileStorage'); // Importa a persistência

// --- Configuração do Servidor ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// --- Carrega Dados Persistidos (Não perde nada ao reiniciar) ---
console.log('📂 Carregando base de dados local...');
let memoryDb = loadData();
const MAX_HISTORY = 1000;
const START_TIME = Date.now();

// Função auxiliar para salvar (chama o utilitário)
function persist() {
    saveData(memoryDb);
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
    if (memoryDb.systemLogs.length > 500) memoryDb.systemLogs.pop();
    persist(); // Salva no arquivo
    console.log(`[AUDIT] ${action}: ${details}`);
}

// --- Configurações ---
const CONFIG = {
    telegramToken: 'SEU_TELEGRAM_TOKEN_AQUI', 
    telegramChatId: 'SEU_CHAT_ID_AQUI',
    mqttBroker: 'mqtt://broker.hivemq.com',
    // Configuração de E-mail (Exemplo com Ethereal para testes, ou Gmail)
    emailUser: 'monitoramento@belfire.com', 
    emailPass: 'senha123' 
};

// Configuração do Transportador de E-mail
// Para testes reais, recomendamos usar uma Senha de App do Gmail ou Ethereal.email
const mailTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email", // Use 'smtp.gmail.com' para produção
    port: 587,
    secure: false, 
    auth: {
        user: 'maddison53@ethereal.email', // Troque por credenciais reais
        pass: 'jn7jnAPss4f63QBp6D'
    }
});

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
    persist();

    if (type === 'critical' || type === 'prediction') {
        logSystemAction('ALERT_TRIGGERED', 'Inteligência Artificial', message);
        if (bot) try { bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`); } catch (e) {}
    }

    broadcast({ type: 'notification', alertType: type, message });
    triggerWebhooks(type, notification);
}

async function triggerWebhooks(type, payload) {
    memoryDb.webhooks.forEach(async (hook) => {
        if (hook.events.includes(type) || hook.events.includes('all')) {
            try { await axios.post(hook.url, { ...payload, system: 'BEL FIRE AI' }); } catch (e) {}
        }
    });
}

// --- CRON JOBS: Relatórios Automáticos ---
// Roda todos os dias às 08:00 da manhã
cron.schedule('0 8 * * *', async () => {
    console.log('📧 Iniciando envio de relatório diário...');
    logSystemAction('EMAIL_REPORT', 'CronJob', 'Gerando relatório automático');

    // 1. Gera o CSV em memória
    let csvContent = "SensorID,Timestamp,Data,Hora,Temperatura(C)\n";
    Object.keys(memoryDb.sensorHistory).forEach(id => {
        memoryDb.sensorHistory[id].forEach(r => {
            const d = new Date(r.time);
            csvContent += `${id},${d.toISOString()},${d.toLocaleDateString()},${d.toLocaleTimeString()},${r.val.toFixed(2)}\n`;
        });
    });

    // 2. Envia o E-mail
    try {
        const info = await mailTransporter.sendMail({
            from: '"BEL FIRE System" <sistema@belfire.com>',
            to: "gerente@usina.com", // Defina o destinatário real aqui
            subject: `📊 Relatório Diário - ${new Date().toLocaleDateString()}`,
            text: "Segue em anexo o relatório consolidado das últimas 24h das pilhas de bagaço.",
            attachments: [
                {
                    filename: `relatorio_${new Date().toISOString().split('T')[0]}.csv`,
                    content: csvContent
                }
            ]
        });
        console.log("Message sent: %s", info.messageId);
        logSystemAction('EMAIL_SENT', 'System', 'Relatório diário enviado com sucesso');
    } catch (error) {
        console.error("Erro ao enviar email:", error);
        logSystemAction('EMAIL_ERROR', 'System', 'Falha no envio do relatório');
    }
});

// --- INTELIGÊNCIA: Análise de Tendência (Delta T) ---
function analyzeRisk(sensorId, currentTemp) {
    const history = memoryDb.sensorHistory[sensorId];
    if (!history || history.length < 5) return;

    const oldReading = history[history.length - 5]; 
    const delta = currentTemp - oldReading.val;

    if (delta > 3) {
        const msg = `Predição de Risco: Sensor ${sensorId} subiu ${delta.toFixed(1)}°C rapidamente!`;
        const lastAlert = memoryDb.notifications.find(n => n.message === msg && (Date.now() - n.id < 30000));
        
        if (!lastAlert) {
            notify('prediction', msg);
        }
    }
}

// --- API: Monitoramento de Saúde ---
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

// --- Rotas API ---
app.get('/api/v1/export/csv', (req, res) => {
    logSystemAction('DATA_EXPORT', 'Usuario_Web', 'Exportou relatório CSV');
    let csvContent = "SensorID,Timestamp,Temperatura(C)\n";
    Object.keys(memoryDb.sensorHistory).forEach(id => {
        memoryDb.sensorHistory[id].forEach(r => {
            csvContent += `${id},${new Date(r.time).toISOString()},${r.val.toFixed(2)}\n`;
        });
    });
    res.header('Content-Type', 'text/csv').attachment('belfire_report.csv').send(csvContent);
});

app.get('/api/v1/logs', (req, res) => res.json(memoryDb.systemLogs));

app.get('/api/v1/webhooks', (req, res) => res.json(memoryDb.webhooks));
app.post('/api/v1/webhooks', (req, res) => {
    memoryDb.webhooks.push({ id: Date.now(), ...req.body });
    persist(); // Salva
    res.json({ success: true });
});
app.delete('/api/v1/webhooks/:id', (req, res) => {
    memoryDb.webhooks = memoryDb.webhooks.filter(w => w.id !== parseInt(req.params.id));
    persist(); // Salva
    res.json({ success: true });
});

// --- MQTT & WebSocket ---
const sensorState = {};

function broadcast(data) {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); });
}

const mqttClient = mqtt.connect(CONFIG.mqttBroker);
mqttClient.on('connect', () => mqttClient.subscribe('usina/bagaco/sensor/#'));

mqttClient.on('message', (topic, message) => {
    try {
        let rawData;
        try { rawData = JSON.parse(message.toString()); } catch { rawData = { temp: parseFloat(message.toString()) }; }
        const sensorId = topic.split('/').pop();
        const data = { temp: rawData.temp, humidity: rawData.humidity || 50, pressure: rawData.pressure || 1013 };

        if (!memoryDb.sensorHistory[sensorId]) memoryDb.sensorHistory[sensorId] = [];
        memoryDb.sensorHistory[sensorId].push({ time: Date.now(), val: data.temp });
        if (memoryDb.sensorHistory[sensorId].length > MAX_HISTORY) memoryDb.sensorHistory[sensorId].shift();
        
        // Salva periodicamente o histórico (a cada 10 leituras para não pesar o disco)
        if (memoryDb.sensorHistory[sensorId].length % 10 === 0) persist();

        analyzeRisk(sensorId, data.temp);

        if (data.temp > 85) notify('critical', `Fogo no Sensor ${sensorId}`);

        sensorState[sensorId] = { ...data, lastUpdate: Date.now() };
        broadcast({ type: 'sensor_update', sensorId, data: sensorState[sensorId] });
    } catch (e) {}
});

// Servidor Web
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../public/index.html')); });

// --- INICIALIZAÇÃO DO SERVIDOR ---
server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
    console.log('💾 Sistema de Persistência: ATIVO');
    console.log('🌍 Abrindo navegador automaticamente...');

    const url = 'http://localhost:3000';
    const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
    exec(start + ' ' + url, (err) => {
        if(err) console.log('⚠️  Acesse manualmente: ' + url);
    });
});