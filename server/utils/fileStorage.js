const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../database_local.json');

// Estrutura inicial padrão
const defaultData = {
    webhooks: [],
    sensorHistory: {},
    systemLogs: [],
    notifications: []
};

module.exports = {
    // Carrega os dados do arquivo (ou cria se não existir)
    loadData: () => {
        try {
            if (!fs.existsSync(DATA_FILE)) {
                fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
                return { ...defaultData };
            }
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            return { ...defaultData };
        }
    },

    // Salva os dados no arquivo
    saveData: (data) => {
        try {
            // Salva de forma assíncrona para não travar o servidor
            fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), (err) => {
                if (err) console.error('Erro ao salvar persistência:', err);
            });
        } catch (error) {
            console.error('Erro crítico ao salvar:', error);
        }
    }
};