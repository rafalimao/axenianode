const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const PHPWebhookService = require('../services/PHPWebhookService');
const HandleIncomingMessage = require('../../application/use-cases/HandleIncomingMessage');

const clients = {};

function setupSocketEvents(io) {
    io.on('connection', (socket) => {
        socket.on('start', async (userId) => {
        if (clients[userId]) {
            const state = await clients[userId].getState().catch(() => null);

            if (state === 'CONNECTED' || state === 'READY' || state === 'OPENING') {
                socket.emit('msg', 'Já está conectando ou conectado...');
                console.log("Client ainda ativo com estado:", state);
                return;
            } else {
                // O client está com erro ou desconectado, podemos remover e reiniciar
                try {
                    await clients[userId].destroy();
                } catch (e) {
                    console.warn("Erro ao destruir client antigo:", e.message);
                }
                delete clients[userId];
                console.log("Client estava inválido, removido.");
            }
        }

            const client = new Client({
                authStrategy: new LocalAuth({ clientId: userId }),
                puppeteer: {
                    headless: true, // necessário para ambientes sem GUI
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                    ]
                }
            });
            clients[userId] = client;

            client.on('qr', async (qr) => {
                const qrCodeData = await qrcode.toDataURL(qr);
                socket.emit('qr', qrCodeData);
            });

            client.on('ready', () => {
                const info = client.info;
                socket.emit('ready', `✅ ${userId} conectado!`);
                PHPWebhookService.reportStatus(userId, 'connected', info.wid.user, info.pushname);
            });

            client.on('authenticated', () => {
                socket.emit('msg', `🔐 ${userId} autenticado.`);
            });

            client.on('auth_failure', () => {
                const info = client.info;
                socket.emit('msg', `❌ Falha de autenticação ${userId}.`);
                PHPWebhookService.reportStatus(userId, 'auth_failure', info.wid.user, info.pushname);
            });

            client.on('disconnected', () => {
                const info = client.info;
                socket.emit('msg', `🔌 ${userId} desconectado.`);
                PHPWebhookService.reportStatus(userId, 'disconnected', info.wid.user, info.pushname);
                delete clients[userId];
            });

            client.on('message', async (message) => {
                await HandleIncomingMessage(client, message, userId);
            });

            client.initialize();
        });
    });
}

module.exports = {
    setupSocketEvents,
    clients
};
