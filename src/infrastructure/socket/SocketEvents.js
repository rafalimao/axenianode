const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const PHPWebhookService = require('../services/PHPWebhookService');
const HandleIncomingMessage = require('../../application/use-cases/HandleIncomingMessage');

const clients = require('../whatsapp/clients');
const clientStates = new Map();
const activeQRCodes = new Map();

function setupSocketEvents(io) {
    io.on('connection', (socket) => {
        console.log(`[SOCKET] Novo cliente conectado: ${socket.id}`);

        socket.on('start', async (userId) => {
            console.log(`[${userId}] Iniciando sessão...`);
            
            const sessionId = `session-${userId}`;
            const sessionPath = path.join(".wwebjs_auth", sessionId);

            // Limpeza de instância anterior
            if (clients[userId]) {
                console.log(`[${userId}] Client existente encontrado, limpando...`);
                try {
                    clients[userId].removeAllListeners();
                    await clients[userId].destroy();
                    console.log(`[${userId}] Client anterior destruído com sucesso`);
                } catch (e) {
                    console.warn(`[${userId}] Erro ao limpar client anterior:`, e.message);
                } finally {
                    delete clients[userId];
                    clientStates.delete(userId);
                    activeQRCodes.delete(userId);
                }
            }

            // Configuração do novo client
            console.log(`[${userId}] Criando novo client`);
            const client = new Client({
                authStrategy: new LocalAuth({ clientId: userId }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage'
                    ]
                },
                takeoverOnConflict: false,
                restartOnAuthFail: false
            });

            clients[userId] = client;
            let qrTimeout = null;
            let lastQR = activeQRCodes.get(userId) || null;

            // Configurar timeout para QR code
            const setupQRTimeout = () => {
                clearTimeout(qrTimeout);
                qrTimeout = setTimeout(() => {
                    if (!client.info) {
                        console.log(`[${userId}] Timeout no QR code`);
                        socket.emit('error', 'Tempo esgotado para escanear o QR Code');
                        cleanupClient(userId);
                    }
                }, 120000); // 2 minutos
            };

            // Função de limpeza
            const cleanupClient = (userId) => {
                if (clients[userId]) {
                    try {
                        clients[userId].removeAllListeners();
                        clients[userId].destroy();
                    } catch (e) {
                        console.warn(`[${userId}] Erro na limpeza:`, e.message);
                    }
                    delete clients[userId];
                    clientStates.delete(userId);
                    activeQRCodes.delete(userId);
                }
            };

            // Evento QR
            client.on('qr', async (qr) => {
                if (!socket.connected) return;
                
                // Sistema de debounce para evitar loops
                if (this.lastQR && this.lastQR.qr === qr && 
                    Date.now() - this.lastQR.timestamp < 15000) {
                    console.log(`[${userId}] QR repetido (últimos 15s), ignorando...`);
                    return;
                }

                console.log(`[${userId}] Processando novo QR Code`);
                
                try {
                    // Gera a imagem do QR Code

                    // Envia para o frontend de forma segura
                    if (socket.connected) {
                        const qrCodeData = await qrcode.toDataURL(qr);
                        socket.emit('qr', qrCodeData);
                        console.log(`[${userId}] QR Code enviado com sucesso`);
                    } else {
                        console.warn(`[${userId}] Socket desconectado, não foi possível enviar QR`);
                    }
                } catch (error) {
                    console.error(`[${userId}] Falha ao gerar QR Code:`, error);
                    if (socket.connected) {
                        socket.emit('error', 'Falha ao gerar QR Code');
                    }
                }
            });
            // Evento Ready
            client.on('ready', () => {
                clearTimeout(qrTimeout);
                console.log(`[${userId}] Client pronto`);
                const info = client.info;
                clientStates.set(userId, 'READY');
                
                socket.emit('ready', `✅ ${userId} conectado!`);
                PHPWebhookService.reportStatus(userId, 'connected', info.wid.user, info.pushname);
            });

            // Evento Authenticated
            client.on('authenticated', () => {
                console.log(`[${userId}] Autenticado com sucesso`);
                socket.emit('msg', `🔐 ${userId} autenticado.`);
                clientStates.set(userId, 'AUTHENTICATED');
            });

            // Evento Auth Failure
            client.on('auth_failure', (msg) => {
                console.log(`[${userId}] Falha de autenticação:`, msg);
                const info = client.info || {};
                
                socket.emit('msg', `❌ Falha de autenticação ${userId}.`);
                PHPWebhookService.reportStatus(userId, 'auth_failure', info.wid?.user, info.pushname);
                
                // Limpar sessão apenas em caso de falha de autenticação
                if (fs.existsSync(sessionPath)) {
                    console.log(`[${userId}] Removendo sessão após falha de autenticação`);
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
                
                cleanupClient(userId);
            });

            // Evento Disconnected
            client.on('disconnected', (reason) => {
                clearTimeout(qrTimeout);
                console.log(`[${userId}] Desconectado:`, reason);
                const info = client.info || {};
                
                socket.emit('msg', `🔌 ${userId} desconectado: ${reason}`);
                PHPWebhookService.reportStatus(userId, 'disconnected', info.wid?.user, info.pushname);
                
                cleanupClient(userId);
            });

            // Evento Change State
            client.on('change_state', (state) => {
                console.log(`[${userId}] Mudança de estado:`, state);
                clientStates.set(userId, state);
            });

            // Evento Message
            client.on("message", async (message) => {
                try {
                    await HandleIncomingMessage(client, message, userId);
                } catch (error) {
                    console.error(`[${userId}] Erro ao processar mensagem:`, error);
                }
            });

            // Inicialização com tratamento de erro
            client.initialize().catch(error => {
                console.error(`[${userId}] Erro na inicialização:`, error);
                socket.emit('error', `Falha na inicialização: ${error.message}`);
                cleanupClient(userId);
            });
        });

        // Limpeza ao desconectar
        socket.on('disconnect', () => {
            console.log(`[SOCKET] Cliente ${socket.id} desconectado`);
        });
    });
}

module.exports = {
    setupSocketEvents,
    clients
};