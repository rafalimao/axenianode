const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');

const { setupSocketEvents } = require('./src/infrastructure/socket/SocketEvents');
const statusRoutes = require('./src/interfaces/http/routes/statusRoutes');
const messageRoutes = require('./src/interfaces/http/routes/messageRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const clients = require('./src/infrastructure/whatsapp/clients');

const SESSIONS_DIR = path.join(__dirname, '.wwebjs_auth');

// Função que carrega todas as sessões existentes
async function initializeAllSessions() {
    if (!fs.existsSync(SESSIONS_DIR)) return;

    const sessionDirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const sessionId of sessionDirs) {
        if (clients[sessionId]) continue; // já inicializado

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionId,
                dataPath: SESSIONS_DIR
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        clients[sessionId] = client;

        client.on('ready', () => {
            console.log(`✅ Cliente restaurado [${sessionId}] está pronto`);
        });

        client.on('auth_failure', (msg) => {
            console.error(`❌ Falha de autenticação na sessão [${sessionId}]:`, msg);
        });

        client.on('disconnected', (reason) => {
            console.log(`⚠️ Cliente [${sessionId}] foi desconectado:`, reason);
            delete clients[sessionId];
        });

        await client.initialize();
    }
}

// Auto-executa a função ao iniciar o app
(async () => {
    try {
        await initializeAllSessions();
    } catch (err) {
        console.error('Erro ao iniciar sessões:', err);
    }
})();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rotas HTTP
app.use('/status', statusRoutes);
app.use('/send-message', messageRoutes);
app.get('/status/clients', (req, res) => {
    res.json(Object.keys(require('./src/infrastructure/whatsapp/clients')));
});
// Socket.IO
setupSocketEvents(io);


// Start
server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
