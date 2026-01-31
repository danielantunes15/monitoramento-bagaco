const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const mqtt = require('mqtt'); // Necessário: npm install mqtt

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Configuração MQTT (Simulado para exemplo, substituir por broker real da usina)
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com'); 

// Estrutura para controle de "Debounce" e Taxa de Variação
const sensorState = {}; 

mqttClient.on('connect', () => {
    console.log('✅ Conectado ao Broker MQTT Industrial');
    mqttClient.subscribe('usina/bagaco/sensor/#'); // Inscreve em todos os sensores
});

mqttClient.on('message', (topic, message) => {
    const data = JSON.parse(message.toString());
    const sensorId = topic.split('/').pop();
    const now = Date.now();

    // Inicializa estado do sensor se não existir
    if (!sensorState[sensorId]) {
        sensorState[sensorId] = { 
            lastValues: [], 
            alertStartTime: null,
            lastTemp: data.temp 
        };
    }

    const state = sensorState[sensorId];
    
    // Lógica de Taxa de Variação (Derivada)
    const tempDiff = data.temp - state.lastTemp;
    const isRisingFast = tempDiff > 2.0; // Alerta se subir mais de 2°C entre leituras
    state.lastTemp = data.temp;

    // Lógica de Debounce (Persistência)
    let status = 'normal';
    if (data.temp > 80) {
        if (!state.alertStartTime) state.alertStartTime = now;
        const duration = (now - state.alertStartTime) / 1000;
        
        if (duration > 30) { // Só fica crítico após 30 segundos mantidos
            status = 'critical';
        } else {
            status = 'warning';
        }
    } else {
        state.alertStartTime = null;
        if (data.temp > 65 || isRisingFast) status = 'warning';
    }

    // Prepara pacote de dados para o Frontend
    const payload = JSON.stringify({
        type: 'sensor_update',
        sensorId,
        temp: data.temp,
        type_sensor: data.type || 'nucleo', // 'superficie' ou 'nucleo'
        status,
        isRisingFast,
        timestamp: new Date().toISOString()
    });

    // Envia para todos os clientes conectados via WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
});

app.use(express.static(path.join(__dirname, '../public')));

server.listen(PORT, () => {
    console.log(`🚀 FireGuard Rodando em http://localhost:${PORT}`);
});