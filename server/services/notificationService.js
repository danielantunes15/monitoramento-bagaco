const { Telegraf } = require('telegraf'); // Necessário: npm install telegraf
const sqlite3 = require('sqlite3').verbose(); //
const db = new sqlite3.Database('./database/fireguard.db'); //

// Configuração do Bot (BEL FIRE)
const bot = new Telegraf('SEU_TELEGRAM_TOKEN'); 

// Inicializa tabela de logs se não existir
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const sendNotification = async (wss, type, message) => {
    // 1. Salva no histórico para consultas futuras
    db.run('INSERT INTO notifications (type, message) VALUES (?, ?)', [type, message]);

    // 2. Envia para Telegram se for Crítico
    if (type === 'critical') {
        try {
            await bot.telegram.sendMessage('SEU_CHAT_ID', `🚨 BEL FIRE CRÍTICO: ${message}`);
        } catch (err) {
            console.error('Erro Telegram:', err);
        }
    }

    // 3. Notifica o Frontend via WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // 1 = OPEN
            client.send(JSON.stringify({ 
                type: 'notification', 
                alertType: type, 
                message 
            }));
        }
    });
};

module.exports = { sendNotification };