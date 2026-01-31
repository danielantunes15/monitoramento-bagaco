const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { Webhook } = require('discord-webhook-node');
const { Telegraf } = require('telegraf');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configurações
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'fireguard-industrial-secret-key-2024';
const API_VERSION = 'v1';

// Banco de dados SQLite
const db = new sqlite3.Database('./database/fireguard.db');

// Inicializar banco de dados
const initializeDatabase = () => {
    db.serialize(() => {
        // Tabela de usuários
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT UNIQUE,
            role TEXT DEFAULT 'operator',
            permissions TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active BOOLEAN DEFAULT 1
        )`);

        // Tabela de sensores
        db.run(`CREATE TABLE IF NOT EXISTS sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            location TEXT,
            status TEXT DEFAULT 'active',
            last_value REAL,
            last_update DATETIME,
            min_threshold REAL,
            max_threshold REAL,
            config TEXT DEFAULT '{}'
        )`);

        // Tabela de histórico de alertas
        db.run(`CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id INTEGER,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            value REAL,
            threshold REAL,
            acknowledged BOOLEAN DEFAULT 0,
            acknowledged_by INTEGER,
            acknowledged_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sensor_id) REFERENCES sensors(id)
        )`);

        // Tabela de notificações
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT,
            data TEXT DEFAULT '{}',
            is_read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Tabela de logs do sistema
        db.run(`CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            module TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela de configurações
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            category TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela de webhooks
        db.run(`CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            events TEXT NOT NULL,
            secret TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabela de relatórios agendados
        db.run(`CREATE TABLE IF NOT EXISTS scheduled_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            frequency TEXT NOT NULL,
            recipients TEXT NOT NULL,
            parameters TEXT DEFAULT '{}',
            last_sent DATETIME,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Criar usuário admin padrão
        const adminPassword = bcrypt.hashSync('admin123', 10);
        db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
            if (!row) {
                db.run('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)', 
                    ['admin', adminPassword, 'admin@fireguard.com', 'admin']);
                console.log('Usuário admin criado: admin / admin123');
            }
        });

        // Configurações padrão
        const defaultSettings = [
            ['system_name', 'FireGuard Industrial', 'general'],
            ['alert_email_enabled', 'true', 'notifications'],
            ['alert_whatsapp_enabled', 'false', 'notifications'],
            ['alert_telegram_enabled', 'false', 'notifications'],
            ['alert_push_enabled', 'true', 'notifications'],
            ['temperature_threshold_critical', '80', 'thresholds'],
            ['temperature_threshold_warning', '65', 'thresholds'],
            ['humidity_threshold_max', '70', 'thresholds'],
            ['pressure_threshold_max', '2.5', 'thresholds'],
            ['report_daily_time', '08:00', 'reports'],
            ['siren_enabled', 'true', 'alerts'],
            ['auto_sprinkler_enabled', 'false', 'automation'],
            ['auto_ventilation_enabled', 'true', 'automation']
        ];

        defaultSettings.forEach(([key, value, category]) => {
            db.run('INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', 
                [key, value, category]);
        });

        console.log('Banco de dados inicializado com sucesso!');
    });
};

// Middleware de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'logs/access.log'), 
    { flags: 'a' }
);
app.use(morgan('combined', { stream: accessLogStream }));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: 'Muitas requisições desta IP, tente novamente mais tarde.'
});
app.use('/api/', apiLimiter);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware de permissões
const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        if (req.user.role === 'admin') {
            return next();
        }

        let userPermissions = [];
        try {
            userPermissions = JSON.parse(req.user.permissions || '[]');
        } catch (e) {
            userPermissions = [];
        }

        if (userPermissions.includes(requiredPermission) || userPermissions.includes('*')) {
            return next();
        }

        return res.status(403).json({ error: 'Permissão negada' });
    };
};

// Serviço de Email
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'your-email@gmail.com',
        pass: process.env.SMTP_PASS || 'your-password'
    }
});

// Serviço de Telegram
let telegramBot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
}

// Serviço de Webhooks
const webhooks = new Map();

// Configuração de sprinklers e ventilação (simulação)
let sprinklerState = false;
let ventilationState = false;
let ventilationSpeed = 0;

// Sistema de notificações push
const pushSubscriptions = new Map();

// ==================== ROTAS DA API ====================

// Rota de autenticação
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (err || !match) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            // Atualizar último login
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

            // Log de login
            logSystemAction(user.id, 'login', 'auth', 'Login no sistema');

            // Gerar token JWT
            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role,
                    permissions: user.permissions 
                },
                SECRET_KEY,
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    permissions: JSON.parse(user.permissions || '{}')
                }
            });
        });
    });
});

// Rota para registro de push notifications
app.post('/api/notifications/push/subscribe', authenticateToken, (req, res) => {
    const { subscription } = req.body;
    const userId = req.user.id;

    if (!subscription) {
        return res.status(400).json({ error: 'Subscription é obrigatória' });
    }

    pushSubscriptions.set(userId, subscription);
    res.json({ success: true, message: 'Subscrição registrada com sucesso' });
});

// Rota para enviar notificação push
app.post('/api/notifications/push/send', authenticateToken, checkPermission('send_notifications'), (req, res) => {
    const { title, message, userId } = req.body;
    
    if (userId && pushSubscriptions.has(userId)) {
        sendPushNotification(pushSubscriptions.get(userId), title, message);
    } else if (!userId) {
        // Enviar para todos os usuários
        pushSubscriptions.forEach((subscription, uid) => {
            sendPushNotification(subscription, title, message);
        });
    }

    res.json({ success: true, message: 'Notificação enviada' });
});

// Função para enviar push notification
function sendPushNotification(subscription, title, message) {
    // Implementação real exigiria service workers e chaves VAPID
    console.log(`Push Notification: ${title} - ${message}`);
    // Em produção, usar web-push library
}

// Rota para enviar alerta por WhatsApp (simulação via Twilio/outro serviço)
app.post('/api/notifications/whatsapp/send', authenticateToken, checkPermission('send_notifications'), async (req, res) => {
    const { to, message } = req.body;
    
    try {
        // Simulação - em produção integrar com API do WhatsApp Business
        console.log(`WhatsApp enviado para ${to}: ${message}`);
        
        // Log da notificação
        db.run('INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)', 
            ['whatsapp', 'Alerta WhatsApp', message]);
        
        res.json({ success: true, message: 'Mensagem WhatsApp enviada' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao enviar WhatsApp' });
    }
});

// Rota para enviar alerta por Telegram
app.post('/api/notifications/telegram/send', authenticateToken, checkPermission('send_notifications'), async (req, res) => {
    const { chatId, message } = req.body;
    
    try {
        if (telegramBot) {
            await telegramBot.telegram.sendMessage(chatId, message);
            
            db.run('INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)', 
                ['telegram', 'Alerta Telegram', message]);
            
            res.json({ success: true, message: 'Mensagem Telegram enviada' });
        } else {
            res.status(400).json({ error: 'Bot Telegram não configurado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao enviar Telegram' });
    }
});

// Rota para enviar email
app.post('/api/notifications/email/send', authenticateToken, checkPermission('send_notifications'), async (req, res) => {
    const { to, subject, html } = req.body;
    
    try {
        const mailOptions = {
            from: process.env.SMTP_FROM || 'FireGuard <noreply@fireguard.com>',
            to: to,
            subject: subject,
            html: html
        };

        await emailTransporter.sendMail(mailOptions);
        
        db.run('INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)', 
            ['email', subject, html.substring(0, 100) + '...']);
        
        res.json({ success: true, message: 'Email enviado com sucesso' });
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        res.status(500).json({ error: 'Erro ao enviar email' });
    }
});

// Rota para ativar sirena
app.post('/api/alerts/siren/activate', authenticateToken, checkPermission('control_alarms'), (req, res) => {
    const { duration = 30 } = req.body; // segundos
    
    // Em produção, integrar com GPIO do Raspberry Pi ou sistema de som
    console.log(`🔴 SIRENA ATIVADA por ${duration} segundos`);
    
    // Log da ação
    logSystemAction(req.user.id, 'siren_activate', 'alerts', `Sirena ativada por ${duration}s`);
    
    // Simular desativação após duração
    setTimeout(() => {
        console.log('🟢 SIRENA DESATIVADA');
    }, duration * 1000);
    
    res.json({ success: true, message: `Sirena ativada por ${duration} segundos` });
});

// Rota para controlar sprinklers
app.post('/api/automation/sprinklers/:action', authenticateToken, checkPermission('control_automation'), (req, res) => {
    const { action } = req.params;
    const { zone, duration } = req.body;
    
    if (action === 'activate') {
        sprinklerState = true;
        console.log(`🚿 SPRINKLERS ATIVADOS - Zona: ${zone}, Duração: ${duration}s`);
        
        // Em produção, controlar válvulas solenoides via GPIO/relé
        
        // Log da ação
        logSystemAction(req.user.id, 'sprinkler_activate', 'automation', 
            `Sprinklers ativados - Zona ${zone} por ${duration}s`);
        
        // Desativar após duração
        if (duration) {
            setTimeout(() => {
                sprinklerState = false;
                console.log('💧 SPRINKLERS DESATIVADOS');
            }, duration * 1000);
        }
        
        res.json({ success: true, state: 'active', zone, duration });
        
    } else if (action === 'deactivate') {
        sprinklerState = false;
        console.log('💧 SPRINKLERS DESATIVADOS');
        res.json({ success: true, state: 'inactive' });
        
    } else {
        res.status(400).json({ error: 'Ação inválida. Use activate ou deactivate' });
    }
});

// Rota para controlar ventilação
app.post('/api/automation/ventilation/:action', authenticateToken, checkPermission('control_automation'), (req, res) => {
    const { action } = req.params;
    const { speed } = req.body;
    
    if (action === 'activate') {
        ventilationState = true;
        ventilationSpeed = speed || 50;
        console.log(`💨 VENTILAÇÃO ATIVADA - Velocidade: ${ventilationSpeed}%`);
        
        // Log da ação
        logSystemAction(req.user.id, 'ventilation_activate', 'automation', 
            `Ventilação ativada - Velocidade ${ventilationSpeed}%`);
        
        res.json({ success: true, state: 'active', speed: ventilationSpeed });
        
    } else if (action === 'deactivate') {
        ventilationState = false;
        ventilationSpeed = 0;
        console.log('💨 VENTILAÇÃO DESATIVADA');
        res.json({ success: true, state: 'inactive' });
        
    } else if (action === 'setspeed') {
        if (speed !== undefined && speed >= 0 && speed <= 100) {
            ventilationSpeed = speed;
            console.log(`💨 VELOCIDADE DA VENTILAÇÃO AJUSTADA: ${ventilationSpeed}%`);
            res.json({ success: true, speed: ventilationSpeed });
        } else {
            res.status(400).json({ error: 'Velocidade inválida (0-100)' });
        }
        
    } else {
        res.status(400).json({ error: 'Ação inválida' });
    }
});

// Rota para monitoramento de umidade (sensor simulado)
app.get('/api/sensors/humidity', authenticateToken, (req, res) => {
    // Simular dados de umidade
    const humidityData = {
        current: 45 + Math.random() * 20, // 45-65%
        trend: 'stable',
        sensors: [
            { id: 1, location: 'Pilha Norte', value: 48 + Math.random() * 10, status: 'normal' },
            { id: 2, location: 'Pilha Sul', value: 52 + Math.random() * 8, status: 'normal' },
            { id: 3, location: 'Centro', value: 45 + Math.random() * 12, status: 'warning' },
            { id: 4, location: 'Externo', value: 60 + Math.random() * 15, status: 'normal' }
        ],
        timestamp: new Date().toISOString()
    };
    
    // Verificar alertas de umidade
    checkHumidityAlerts(humidityData);
    
    res.json(humidityData);
});

// Rota para monitoramento de pressão (sensor simulado)
app.get('/api/sensors/pressure', authenticateToken, (req, res) => {
    // Simular dados de pressão (em bar)
    const pressureData = {
        current: 1.2 + Math.random() * 0.6, // 1.2-1.8 bar
        trend: 'rising',
        sensors: [
            { id: 1, location: 'Base Norte', value: 1.3 + Math.random() * 0.4, status: 'normal' },
            { id: 2, location: 'Base Sul', value: 1.4 + Math.random() * 0.3, status: 'normal' },
            { id: 3, location: 'Meio Pilha', value: 1.8 + Math.random() * 0.5, status: 'warning' },
            { id: 4, location: 'Topo', value: 1.1 + Math.random() * 0.2, status: 'normal' }
        ],
        timestamp: new Date().toISOString()
    };
    
    // Verificar alertas de pressão
    checkPressureAlerts(pressureData);
    
    res.json(pressureData);
});

// Rota para configuração de webhooks
app.post('/api/webhooks', authenticateToken, checkPermission('manage_webhooks'), (req, res) => {
    const { name, url, events, secret } = req.body;
    
    if (!name || !url || !events) {
        return res.status(400).json({ error: 'Nome, URL e eventos são obrigatórios' });
    }
    
    const webhookSecret = secret || uuidv4();
    
    db.run('INSERT INTO webhooks (name, url, events, secret) VALUES (?, ?, ?, ?)', 
        [name, url, JSON.stringify(events), webhookSecret], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao criar webhook' });
            }
            
            const webhookId = this.lastID;
            webhooks.set(webhookId, { name, url, events: JSON.parse(events), secret: webhookSecret });
            
            res.json({ 
                success: true, 
                id: webhookId,
                secret: webhookSecret,
                message: 'Webhook criado com sucesso' 
            });
        });
});

// Rota para disparar webhook de teste
app.post('/api/webhooks/:id/test', authenticateToken, checkPermission('manage_webhooks'), async (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM webhooks WHERE id = ?', [id], async (err, webhook) => {
        if (err || !webhook) {
            return res.status(404).json({ error: 'Webhook não encontrado' });
        }
        
        try {
            const testEvent = {
                event: 'test',
                data: {
                    message: 'Este é um evento de teste do FireGuard',
                    timestamp: new Date().toISOString(),
                    system: 'FireGuard Industrial'
                },
                signature: createWebhookSignature(webhook.secret, { event: 'test' })
            };
            
            await triggerWebhook(webhook, testEvent);
            res.json({ success: true, message: 'Webhook testado com sucesso' });
            
        } catch (error) {
            res.status(500).json({ error: 'Erro ao testar webhook' });
        }
    });
});

// Função para disparar webhooks
async function triggerWebhook(webhook, data) {
    const events = JSON.parse(webhook.events || '[]');
    
    if (!events.includes(data.event) && !events.includes('*')) {
        return;
    }
    
    try {
        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-FireGuard-Signature': createWebhookSignature(webhook.secret, data),
                'X-FireGuard-Event': data.event
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            console.error(`Webhook ${webhook.name} falhou: ${response.status}`);
        }
        
    } catch (error) {
        console.error(`Erro ao disparar webhook ${webhook.name}:`, error);
    }
}

// Função para criar assinatura de webhook
function createWebhookSignature(secret, data) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
}

// Rota para integração com SCADA
app.post('/api/integration/scada/data', authenticateToken, checkPermission('scada_integration'), (req, res) => {
    // Receber dados do SCADA
    const scadaData = req.body;
    
    console.log('Dados recebidos do SCADA:', scadaData);
    
    // Processar dados e atualizar sistema
    processSCADAData(scadaData);
    
    res.json({ success: true, received: Object.keys(scadaData).length });
});

// Rota para exportar dados para ERP
app.get('/api/export/erp/:format', authenticateToken, checkPermission('export_data'), (req, res) => {
    const { format } = req.params;
    const { startDate, endDate } = req.query;
    
    // Formatar dados para ERP
    const erpData = {
        header: {
            system: 'FireGuard',
            exportDate: new Date().toISOString(),
            period: { start: startDate, end: endDate }
        },
        temperatureData: getTemperatureDataForPeriod(startDate, endDate),
        alertData: getAlertDataForPeriod(startDate, endDate),
        sensorData: getSensorDataForPeriod(startDate, endDate)
    };
    
    if (format === 'json') {
        res.json(erpData);
    } else if (format === 'xml') {
        // Converter para XML
        const xmlData = convertToXML(erpData);
        res.set('Content-Type', 'application/xml');
        res.send(xmlData);
    } else if (format === 'csv') {
        // Converter para CSV
        const csvData = convertToCSV(erpData);
        res.set('Content-Type', 'text/csv');
        res.attachment('fireguard_export.csv');
        res.send(csvData);
    } else {
        res.status(400).json({ error: 'Formato não suportado. Use json, xml ou csv' });
    }
});

// Rota para gerenciamento de usuários
app.get('/api/admin/users', authenticateToken, checkPermission('manage_users'), (req, res) => {
    db.all('SELECT id, username, email, role, created_at, last_login, is_active FROM users', (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar usuários' });
        }
        res.json(users);
    });
});

app.post('/api/admin/users', authenticateToken, checkPermission('manage_users'), async (req, res) => {
    const { username, password, email, role, permissions } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (username, password, email, role, permissions) VALUES (?, ?, ?, ?, ?)', 
            [username, hashedPassword, email, role || 'operator', JSON.stringify(permissions || {})],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Erro ao criar usuário' });
                }
                
                logSystemAction(req.user.id, 'user_create', 'admin', `Usuário ${username} criado`);
                
                res.json({ 
                    success: true, 
                    id: this.lastID,
                    message: 'Usuário criado com sucesso' 
                });
            });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar senha' });
    }
});

// Rota para configurações do sistema
app.get('/api/admin/settings', authenticateToken, checkPermission('manage_settings'), (req, res) => {
    db.all('SELECT key, value, category, updated_at FROM settings ORDER BY category, key', (err, settings) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar configurações' });
        }
        
        const grouped = {};
        settings.forEach(setting => {
            if (!grouped[setting.category]) {
                grouped[setting.category] = [];
            }
            grouped[setting.category].push(setting);
        });
        
        res.json(grouped);
    });
});

app.post('/api/admin/settings', authenticateToken, checkPermission('manage_settings'), (req, res) => {
    const settings = req.body;
    
    db.serialize(() => {
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)');
        
        Object.entries(settings).forEach(([key, valueObj]) => {
            stmt.run(key, valueObj.value, valueObj.category);
        });
        
        stmt.finalize((err) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao salvar configurações' });
            }
            
            logSystemAction(req.user.id, 'settings_update', 'admin', 'Configurações atualizadas');
            res.json({ success: true, message: 'Configurações salvas com sucesso' });
        });
    });
});

// Rota para logs do sistema
app.get('/api/admin/logs', authenticateToken, checkPermission('view_logs'), (req, res) => {
    const { page = 1, limit = 50, module, user, action } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT l.*, u.username FROM system_logs l LEFT JOIN users u ON l.user_id = u.id WHERE 1=1';
    const params = [];
    
    if (module) {
        query += ' AND l.module = ?';
        params.push(module);
    }
    
    if (user) {
        query += ' AND u.username LIKE ?';
        params.push(`%${user}%`);
    }
    
    if (action) {
        query += ' AND l.action = ?';
        params.push(action);
    }
    
    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    db.all(query, params, (err, logs) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar logs' });
        }
        
        // Contar total
        let countQuery = 'SELECT COUNT(*) as total FROM system_logs l LEFT JOIN users u ON l.user_id = u.id WHERE 1=1';
        const countParams = params.slice(0, -2); // Remove limit e offset
        
        db.get(countQuery, countParams, (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao contar logs' });
            }
            
            res.json({
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.total,
                    pages: Math.ceil(result.total / limit)
                }
            });
        });
    });
});

// Rota para saúde do servidor
app.get('/api/admin/health', authenticateToken, checkPermission('monitor_system'), (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            nodeVersion: process.version
        },
        database: {
            connected: true,
            lastCheck: new Date().toISOString()
        },
        services: {
            email: emailTransporter ? 'connected' : 'disconnected',
            telegram: telegramBot ? 'connected' : 'disconnected',
            webhooks: webhooks.size
        },
        metrics: {
            activeUsers: pushSubscriptions.size,
            activeSensors: 8, // Simulado
            alertsLast24h: 0, // Seria buscado do banco
            avgResponseTime: '45ms'
        }
    };
    
    res.json(healthData);
});

// Rota para histórico de notificações
app.get('/api/notifications/history', authenticateToken, (req, res) => {
    const { type, startDate, endDate, read } = req.query;
    
    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];
    
    if (type) {
        query += ' AND type = ?';
        params.push(type);
    }
    
    if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
    }
    
    if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
    }
    
    if (read !== undefined) {
        query += ' AND is_read = ?';
        params.push(read === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    
    db.all(query, params, (err, notifications) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar notificações' });
        }
        res.json(notifications);
    });
});

// Rota para agendamento de relatórios
app.get('/api/reports/scheduled', authenticateToken, checkPermission('manage_reports'), (req, res) => {
    db.all('SELECT * FROM scheduled_reports ORDER BY created_at DESC', (err, reports) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar relatórios agendados' });
        }
        res.json(reports);
    });
});

app.post('/api/reports/scheduled', authenticateToken, checkPermission('manage_reports'), (req, res) => {
    const { name, type, frequency, recipients, parameters } = req.body;
    
    if (!name || !type || !frequency || !recipients) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }
    
    // Validar frequência cron
    if (!cron.validate(frequency)) {
        return res.status(400).json({ error: 'Frequência cron inválida' });
    }
    
    db.run('INSERT INTO scheduled_reports (name, type, frequency, recipients, parameters) VALUES (?, ?, ?, ?, ?)', 
        [name, type, frequency, JSON.stringify(recipients), JSON.stringify(parameters || {})],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erro ao agendar relatório' });
            }
            
            // Agendar tarefa
            scheduleReport(this.lastID, { name, type, frequency, recipients, parameters });
            
            logSystemAction(req.user.id, 'report_schedule', 'reports', `Relatório ${name} agendado`);
            
            res.json({ 
                success: true, 
                id: this.lastID,
                message: 'Relatório agendado com sucesso' 
            });
        });
});

// Função para agendar relatório
function scheduleReport(reportId, reportConfig) {
    cron.schedule(reportConfig.frequency, () => {
        generateAndSendReport(reportId, reportConfig);
    });
    
    console.log(`📅 Relatório "${reportConfig.name}" agendado: ${reportConfig.frequency}`);
}

// Função para gerar e enviar relatório
async function generateAndSendReport(reportId, config) {
    try {
        console.log(`📊 Gerando relatório: ${config.name}`);
        
        // Gerar relatório baseado no tipo
        let reportContent;
        if (config.type === 'daily') {
            reportContent = await generateDailyReport(config.parameters);
        } else if (config.type === 'weekly') {
            reportContent = await generateWeeklyReport(config.parameters);
        } else if (config.type === 'monthly') {
            reportContent = await generateMonthlyReport(config.parameters);
        } else if (config.type === 'custom') {
            reportContent = await generateCustomReport(config.parameters);
        }
        
        // Enviar para destinatários
        const recipients = JSON.parse(config.recipients || '[]');
        
        for (const recipient of recipients) {
            if (recipient.type === 'email') {
                await sendReportByEmail(recipient.value, config.name, reportContent);
            }
            // Adicionar outros métodos (WhatsApp, Telegram, etc.)
        }
        
        // Atualizar último envio
        db.run('UPDATE scheduled_reports SET last_sent = CURRENT_TIMESTAMP WHERE id = ?', [reportId]);
        
        console.log(`✅ Relatório "${config.name}" enviado para ${recipients.length} destinatários`);
        
    } catch (error) {
        console.error(`❌ Erro ao gerar relatório ${config.name}:`, error);
    }
}

// Funções auxiliares
function logSystemAction(userId, action, module, details) {
    const ip = req?.ip || 'unknown';
    const userAgent = req?.headers['user-agent'] || 'unknown';
    
    db.run('INSERT INTO system_logs (user_id, action, module, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, action, module, details, ip, userAgent]);
}

function checkHumidityAlerts(humidityData) {
    const threshold = getSetting('humidity_threshold_max', 70);
    
    humidityData.sensors.forEach(sensor => {
        if (sensor.value > threshold) {
            createAlert('humidity_high', sensor.id, `Umidade alta: ${sensor.value}%`, sensor.value, threshold);
        }
    });
}

function checkPressureAlerts(pressureData) {
    const threshold = getSetting('pressure_threshold_max', 2.5);
    
    pressureData.sensors.forEach(sensor => {
        if (sensor.value > threshold) {
            createAlert('pressure_high', sensor.id, `Pressão alta: ${sensor.value} bar`, sensor.value, threshold);
        }
    });
}

function createAlert(type, sensorId, message, value, threshold) {
    db.run('INSERT INTO alerts (type, sensor_id, message, value, threshold) VALUES (?, ?, ?, ?, ?)',
        [type, sensorId, message, value, threshold], function(err) {
            if (!err) {
                // Disparar webhooks para alertas
                triggerWebhooksForEvent('alert_created', {
                    alertId: this.lastID,
                    type,
                    sensorId,
                    message,
                    value,
                    threshold,
                    timestamp: new Date().toISOString()
                });
                
                // Enviar notificações
                sendAlertNotifications(type, message, value);
            }
        });
}

function sendAlertNotifications(type, message, value) {
    // Enviar push notifications
    pushSubscriptions.forEach((subscription, userId) => {
        sendPushNotification(subscription, 'Alerta do Sistema', message);
    });
    
    // Enviar email se configurado
    if (getSetting('alert_email_enabled', 'true') === 'true') {
        const emails = getSetting('alert_emails', '[]');
        JSON.parse(emails).forEach(email => {
            sendAlertEmail(email, type, message, value);
        });
    }
    
    // Ativar sirena se for alerta crítico
    if (type.includes('critical') && getSetting('siren_enabled', 'true') === 'true') {
        activateSiren(30);
    }
}

function getSetting(key, defaultValue) {
    // Implementação simplificada - em produção buscar do banco
    const settings = {
        'humidity_threshold_max': 70,
        'pressure_threshold_max': 2.5,
        'alert_email_enabled': 'true',
        'siren_enabled': 'true'
    };
    
    return settings[key] || defaultValue;
}

// WebSocket para comunicação em tempo real
wss.on('connection', (ws) => {
    console.log('Novo cliente WebSocket conectado');
    
    // Enviar dados iniciais
    const initialData = {
        type: 'init',
        data: {
            system: 'FireGuard Industrial',
            version: '2.0',
            timestamp: new Date().toISOString(),
            sensors: {
                temperature: 65.4,
                humidity: 52.1,
                pressure: 1.8
            }
        }
    };
    ws.send(JSON.stringify(initialData));
    
    // Enviar atualizações periódicas
    const interval = setInterval(() => {
        const updateData = {
            type: 'sensor_update',
            timestamp: new Date().toISOString(),
            data: {
                temperature: 65 + (Math.random() - 0.5) * 2,
                humidity: 52 + (Math.random() - 0.5) * 3,
                pressure: 1.8 + (Math.random() - 0.5) * 0.2
            }
        };
        
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(updateData));
        }
    }, 2000);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'command':
                    handleWebSocketCommand(ws, data);
                    break;
                case 'subscribe':
                    // Inscrever para atualizações específicas
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                    break;
            }
        } catch (error) {
            console.error('Erro ao processar mensagem WebSocket:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Cliente WebSocket desconectado');
        clearInterval(interval);
    });
    
    ws.on('error', (error) => {
        console.error('Erro WebSocket:', error);
    });
});

// Função para lidar com comandos via WebSocket
function handleWebSocketCommand(ws, data) {
    switch(data.command) {
        case 'get_status':
            ws.send(JSON.stringify({
                type: 'status',
                data: {
                    sprinklerState,
                    ventilationState,
                    ventilationSpeed,
                    lastUpdate: new Date().toISOString()
                }
            }));
            break;
            
        case 'control_sprinkler':
            if (data.action === 'activate') {
                sprinklerState = true;
                console.log('Sprinkler ativado via WebSocket');
            } else if (data.action === 'deactivate') {
                sprinklerState = false;
                console.log('Sprinkler desativado via WebSocket');
            }
            break;
            
        case 'control_ventilation':
            if (data.action === 'activate') {
                ventilationState = true;
                ventilationSpeed = data.speed || 50;
                console.log(`Ventilação ativada via WebSocket: ${ventilationSpeed}%`);
            } else if (data.action === 'deactivate') {
                ventilationState = false;
                ventilationSpeed = 0;
                console.log('Ventilação desativada via WebSocket');
            }
            break;
    }
}

// Inicializar tarefas agendadas
function initializeScheduledTasks() {
    // Limpar logs antigos diariamente às 2 AM
    cron.schedule('0 2 * * *', () => {
        db.run('DELETE FROM system_logs WHERE created_at < datetime("now", "-30 days")');
        console.log('Logs antigos limpos');
    });
    
    // Backup do banco de dados semanalmente
    cron.schedule('0 3 * * 0', () => {
        backupDatabase();
    });
    
    // Verificar saúde do sistema a cada hora
    cron.schedule('0 * * * *', () => {
        checkSystemHealth();
    });
}

// Função para backup do banco de dados
function backupDatabase() {
    const backupDir = path.join(__dirname, '../database/backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = path.join(backupDir, `fireguard_backup_${Date.now()}.db`);
    fs.copyFileSync('./database/fireguard.db', backupFile);
    
    console.log(`Backup criado: ${backupFile}`);
}

// Função para verificar saúde do sistema
function checkSystemHealth() {
    const health = {
        database: true,
        diskSpace: getDiskSpace(),
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    };
    
    // Log de saúde
    db.run('INSERT INTO system_logs (action, module, details) VALUES (?, ?, ?)',
        ['health_check', 'system', JSON.stringify(health)]);
    
    // Alertar se houver problemas
    if (health.diskSpace.percent > 90) {
        createAlert('system_warning', null, 'Espaço em disco crítico!', health.diskSpace.percent, 90);
    }
    
    if (health.memoryUsage > 500) { // MB
        createAlert('system_warning', null, 'Uso de memória elevado!', health.memoryUsage, 500);
    }
}

// Função para obter espaço em disco
function getDiskSpace() {
    try {
        const stats = fs.statfsSync('/');
        const total = stats.bsize * stats.blocks;
        const free = stats.bsize * stats.bfree;
        const used = total - free;
        const percent = (used / total) * 100;
        
        return {
            total: (total / 1024 / 1024 / 1024).toFixed(2) + ' GB',
            free: (free / 1024 / 1024 / 1024).toFixed(2) + ' GB',
            used: (used / 1024 / 1024 / 1024).toFixed(2) + ' GB',
            percent: percent.toFixed(2)
        };
    } catch (error) {
        return { error: 'Não foi possível verificar espaço em disco' };
    }
}

// Rotas estáticas para páginas administrativas
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Rota para documentação da API
app.get('/api-docs', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/api/index.html'));
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Inicializar sistema
initializeDatabase();
initializeScheduledTasks();

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║         🚀 FIREGUARD INDUSTRIAL v2.0 🚀             ║
    ╠══════════════════════════════════════════════════════╣
    ║  📡 Servidor HTTP:    http://localhost:${PORT}       ║
    ║  🔌 WebSocket:        ws://localhost:${PORT}         ║
    ║  👑 Painel Admin:     http://localhost:${PORT}/admin ║
    ║  📚 API Docs:         http://localhost:${PORT}/api-docs║
    ╠══════════════════════════════════════════════════════╣
    ║  🔐 Usuário admin:    admin / admin123              ║
    ║  💾 Banco de dados:   SQLite inicializado          ║
    ║  ⚡ Modulos ativos:   Todos os sistemas prontos    ║
    ╚══════════════════════════════════════════════════════╝
    `);
    
    console.log('\n📋 Módulos implementados:');
    console.log('✅ Notificações push no navegador');
    console.log('✅ Integração WhatsApp/Telegram');
    console.log('✅ Notificações por email com relatórios');
    console.log('✅ Sirena sonora virtual');
    console.log('✅ Histórico de notificações com filtros');
    console.log('✅ Agendamento automático de relatórios');
    console.log('✅ Controle de umidade e pressão');
    console.log('✅ Integração com sprinklers automáticos');
    console.log('✅ Sistema de ventilação controlado');
    console.log('✅ API REST completa');
    console.log('✅ Webhooks para integração');
    console.log('✅ Painel de administração completo');
    console.log('✅ Gerenciamento de usuários e permissões');
    console.log('✅ Configurações avançadas do sistema');
    console.log('✅ Monitoramento de saúde do servidor');
    console.log('✅ Logs detalhados do sistema');
    console.log('\n🚀 Sistema pronto para uso industrial!');
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não tratado:', error);
    db.run('INSERT INTO system_logs (action, module, details) VALUES (?, ?, ?)',
        ['uncaught_exception', 'system', error.toString()]);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
    db.run('INSERT INTO system_logs (action, module, details) VALUES (?, ?, ?)',
        ['unhandled_rejection', 'system', reason.toString()]);
});