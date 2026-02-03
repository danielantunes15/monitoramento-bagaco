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

// --- Aumenta limite para aceitar geometria 3D pesada e JSONs grandes ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const START_TIME = Date.now();

// --- CONTROLE DE ACESSO (Usuários Estáticos) ---
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
    } catch (e) { console.log("Telegram não configurado."); }
}

// --- FUNÇÕES AUXILIARES COM SUPABASE ---

// 1. Logger de Auditoria
async function logSystemAction(action, user, details) {
    try {
        await supabase.from('system_logs').insert([{
            action,
            user: user || 'Sistema',
            details: details,
            timestamp: new Date()
        }]);
        console.log(`[AUDIT] ${action}: ${details}`);
    } catch (e) { console.error("Erro ao salvar log:", e); }
}

// 2. Sistema de Notificação
async function notify(type, message) {
    try {
        const { data: notification } = await supabase.from('notifications').insert([{ 
            type, 
            message, 
            timestamp: new Date().toISOString() 
        }]).select().single();

        if (type === 'critical' || type === 'prediction') {
            logSystemAction('ALERT_TRIGGERED', 'Inteligência Artificial', message);
            if (bot) try { bot.telegram.sendMessage(CONFIG.telegramChatId, `🚨 ${message}`); } catch (e) {}
        }

        broadcast({ type: 'notification', alertType: type, message });
        triggerWebhooks(type, { ...notification, system: 'BEL FIRE AI' });
    } catch (e) { console.error("Erro notificação:", e); }
}

// 3. Webhooks
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
        logSystemAction('LOGIN_SUCCESS', user.name, 'Acesso realizado com sucesso');
        res.json({ success: true, user: { name: user.name, role: user.role, username: username } });
    } else {
        logSystemAction('LOGIN_FAILED', username || 'Anônimo', 'Tentativa de senha incorreta');
        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
});

// Acionamento de Emergência
app.post('/api/v1/emergency/trigger', (req, res) => {
    const { phase, user } = req.body;
    const phaseInfo = EMERGENCY_TEAMS[phase];

    if (!phaseInfo) return res.status(400).json({ error: "Fase inválida" });

    const alertMsg = `PROTOCOLOS: Fase ${phase} Iniciada (${phaseInfo.name}). Contatando: ${phaseInfo.target}`;
    
    logSystemAction(`EMERGENCY_PHASE_${phase}`, user || 'Operador', `Acionou equipe: ${phaseInfo.target}`);
    notify('critical', alertMsg);

    res.json({ success: true, message: `Fase ${phase} ativada.`, target: phaseInfo.target });
});

// Saúde do Servidor
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
        database_type: 'Supabase (Cloud)'
    });
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
}

// Exportação CSV
app.get('/api/v1/export/csv', async (req, res) => {
    logSystemAction('DATA_EXPORT', 'Usuario_Web', 'Exportou relatório CSV');
    
    const { data: history } = await supabase
        .from('sensor_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1000);

    let csvContent = "SensorID,Timestamp,Data,Hora,Temperatura(C)\n";
    if (history) {
        history.forEach(r => {
            const d = new Date(r.timestamp);
            csvContent += `${r.sensor_id},${d.toISOString()},${d.toLocaleDateString()},${d.toLocaleTimeString()},${r.val}\n`;
        });
    }
    res.header('Content-Type', 'text/csv').attachment('belfire_report.csv').send(csvContent);
});

// Logs e Webhooks
app.get('/api/v1/logs', async (req, res) => {
    const { data } = await supabase.from('system_logs').select('*').order('timestamp', { ascending: false }).limit(100);
    res.json(data || []);
});

app.get('/api/v1/webhooks', async (req, res) => {
    const { data } = await supabase.from('webhooks').select('*');
    res.json(data || []);
});

app.post('/api/v1/webhooks', async (req, res) => {
    await supabase.from('webhooks').insert([req.body]);
    res.json({ success: true });
});

app.delete('/api/v1/webhooks/:id', async (req, res) => {
    await supabase.from('webhooks').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// ========================================================
// >>> GESTÃO DE CÂMERAS E PROXY <<<
// ========================================================

// 1. Buscar todas as câmeras
app.get('/api/v1/cameras', async (req, res) => {
    try {
        const { data, error } = await supabase.from('cameras').select('*').order('id', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (e) {
        console.error("Erro ao buscar câmeras:", e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Salvar nova câmera (COM AUTOMATIZAÇÃO DE URL)
app.post('/api/v1/cameras', async (req, res) => {
    try {
        let { name, location, url, type } = req.body;
        
        // SE O USUÁRIO DIGITOU SÓ O IP, MONTA A URL INTELBRAS
        if (url && !url.startsWith('http') && !url.startsWith('rtsp')) {
            const ip = url.trim();
            // URL Padrão Intelbras com usuario e senha fixos
            url = `http://${ip}/cgi-bin/snapshot.cgi?loginuse=admin&loginpas=bel123456`;
        }

        const { data, error } = await supabase
            .from('cameras')
            .insert([{ name, location, url, type, status: 'active' }])
            .select();

        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (e) {
        console.error("Erro ao salvar câmera:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. Deletar câmera
app.delete('/api/v1/cameras/:id', async (req, res) => {
    try {
        await supabase.from('cameras').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. PROXY DE IMAGEM BLINDADO (CORRIGE TELA PRETA E ERRO 503)
app.get('/api/v1/proxy/camera/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // A. Busca a URL real no banco
        const { data: cam } = await supabase
            .from('cameras')
            .select('url')
            .eq('id', id)
            .single();

        if (!cam || !cam.url) {
            console.log(`[PROXY] Câmera ${id} não encontrada ou sem URL.`);
            return res.status(404).send("Câmera não encontrada");
        }

        // B. TRATAMENTO INTELIGENTE (Se for só IP, corrige de novo para garantir)
        let targetUrl = cam.url;
        if (!targetUrl.startsWith('http') && !targetUrl.startsWith('rtsp')) {
            // Se o link no banco estiver "sujo" (só IP), usamos o padrão Intelbras
            const ip = targetUrl.trim();
            targetUrl = `http://${ip}/cgi-bin/snapshot.cgi?loginuse=admin&loginpas=bel123456`;
        }

        // C. Tenta baixar a imagem com Timeout curto (3s)
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream', 
            timeout: 3000
        });

        // D. Repassa a imagem
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        response.data.pipe(res);

    } catch (error) {
        // LOGS DETALHADOS NO TERMINAL PARA DIAGNÓSTICO
        console.error(`[PROXY ERROR] Falha na Câmera ${req.params.id}:`);
        console.error(`--> Mensagem: ${error.message}`);
        
        if (error.code === 'ECONNREFUSED') console.error("--> CAUSA: Conexão recusada. O IP está errado ou a porta 80 está fechada.");
        else if (error.code === 'ETIMEDOUT') console.error("--> CAUSA: Tempo esgotado. A câmera está desligada ou fora da rede.");
        else if (error.response && error.response.status === 401) console.error("--> CAUSA: Senha ou Usuário incorretos.");
        else if (error.code === 'ENOTFOUND') console.error("--> CAUSA: Domínio/IP não encontrado.");

        res.status(503).send("Offline"); 
    }
});

// ========================================================
// >>> OUTRAS ROTAS (Sensores, 3D, etc) <<<
// ========================================================

// Sensores
app.get('/api/v1/sensors', async (req, res) => {
    const { data } = await supabase.from('sensors').select('*');
    res.json(data || []);
});

app.post('/api/v1/sensors', async (req, res) => {
    await supabase.from('sensors').insert([req.body]);
    res.json({ success: true });
});

app.delete('/api/v1/sensors/:id', async (req, res) => {
    await supabase.from('sensors').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// --- HIDRANTES (3D) ---
app.get('/api/hydrants', async (req, res) => {
    try {
        const { data } = await supabase.from('hydrants').select('*');
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/hydrants', async (req, res) => {
    try {
        const { data, error } = await supabase.from('hydrants').insert([req.body]).select();
        if(error) throw error;
        res.json(data[0]); 
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/hydrants/:id', async (req, res) => {
    try {
        await supabase.from('hydrants').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- SETORES (3D) ---
app.get('/api/sectors', async (req, res) => {
    try {
        const { data } = await supabase.from('sectors').select('*').order('name', { ascending: true });
        res.json(data || []);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/sectors', async (req, res) => {
    try {
        const { data, error } = await supabase.from('sectors').insert([req.body]).select();
        if(error) throw error;
        res.json(data[0]); 
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/sectors/:id', async (req, res) => {
    try {
        await supabase.from('sectors').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- CONFIGURAÇÃO 3D (Compatibilidade) ---
app.get('/api/v1/config/layout', async (req, res) => {
    const { data } = await supabase.from('digital_twin_config').select('*').eq('id', 'main_layout').single();
    res.json(data || {});
});

app.post('/api/v1/config/layout', async (req, res) => {
    const { pile_position, hydrants, pile_scale, geometry } = req.body;
    const { error } = await supabase.from('digital_twin_config').upsert({ 
        id: 'main_layout', pile_position, hydrants, pile_scale, geometry, updated_at: new Date()
    });
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

// --- CRON JOBS (Relatório Diário) ---
cron.schedule('0 8 * * *', async () => {
    console.log('📧 Iniciando envio de relatório diário...');
    logSystemAction('EMAIL_REPORT', 'CronJob', 'Gerando relatório automático');

    const { data: history } = await supabase.from('sensor_history')
        .select('*')
        .gt('timestamp', new Date(Date.now() - 86400000).toISOString()); 

    let csvContent = "SensorID,Timestamp,Val\n"; 
    if (history) {
        history.forEach(r => { csvContent += `${r.sensor_id},${r.timestamp},${r.val}\n`; });
    }

    try {
        await mailTransporter.sendMail({
            from: '"BEL FIRE System" <sistema@belfire.com>',
            to: "gerente@usina.com",
            subject: `📊 Relatório Diário - ${new Date().toLocaleDateString()}`,
            text: "Segue relatório anexo das últimas 24h.",
            attachments: [{ filename: 'relatorio.csv', content: csvContent }]
        });
        logSystemAction('EMAIL_SENT', 'System', 'Relatório enviado');
    } catch (error) {
        console.error(error);
        logSystemAction('EMAIL_ERROR', 'System', 'Falha no envio');
    }
});

// --- INTELIGÊNCIA: Análise de Tendência ---
async function analyzeRisk(sensorId, currentTemp) {
    const { data: history } = await supabase
        .from('sensor_history')
        .select('val')
        .eq('sensor_id', sensorId)
        .order('timestamp', { ascending: false })
        .limit(5);

    if (!history || history.length < 5) return;

    const oldReading = history[4].val; 
    const delta = currentTemp - oldReading;

    if (delta > 3) {
        const msg = `Predição de Risco: Sensor ${sensorId} subiu ${delta.toFixed(1)}°C rapidamente!`;
        const { data: recentAlerts } = await supabase
            .from('notifications')
            .select('*')
            .eq('message', msg)
            .gt('timestamp', new Date(Date.now() - 30000).toISOString());
        
        if (!recentAlerts || recentAlerts.length === 0) notify('prediction', msg);
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

mqttClient.on('message', async (topic, message) => {
    try {
        let rawData;
        try { rawData = JSON.parse(message.toString()); } catch { rawData = { temp: parseFloat(message.toString()) }; }
        const sensorId = topic.split('/').pop();
        const data = { temp: rawData.temp, humidity: rawData.humidity || 50, pressure: rawData.pressure || 1013, alerta: rawData.temp > 85 ? 'critical' : 'normal' };

        // 1. Salva no Supabase
        await supabase.from('sensor_history').insert([{ 
            sensor_id: sensorId, 
            val: data.temp,
            timestamp: new Date().toISOString()
        }]);

        // 2. Análise
        analyzeRisk(sensorId, data.temp);
        if (data.temp > 85) notify('critical', `Fogo no Sensor ${sensorId}`);

        // 3. Atualiza Frontend
        sensorState[sensorId] = { ...data, lastUpdate: Date.now() };
        broadcast({ type: 'sensor_update', sensorId, data: sensorState[sensorId] });
    } catch (e) { console.error("Erro MQTT:", e); }
});

// --- Servidor Web (Arquivos Estáticos) ---
app.use(express.static(path.join(__dirname, '../public')));

// Redireciona tudo que não for API para o index
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- INICIALIZAÇÃO ---
server.listen(3000, () => {
    console.log('🔥 BEL FIRE Enterprise rodando na porta 3000');
    console.log('☁️  Sistema conectado ao Supabase');
    
    // Tenta abrir o navegador (Opcional)
    const url = 'http://localhost:3000';
    const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
    exec(start + ' ' + url, (err) => {});
});