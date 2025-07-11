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
                socket.emit('msg', 'Já está conectando...');
                return;
            }

            const client = new Client({
                authStrategy: new LocalAuth({ clientId: userId }),
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

module.exports = setupSocketEvents;
