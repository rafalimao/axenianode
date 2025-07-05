const express = require('express');
const http = require('http');
const axios = require('axios');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const clients = {}; // <userId>: Client

io.on('connection', (socket) => {
    console.log('Novo cliente conectado');

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
            socket.emit('ready', `✅ ${userId} conectado!`);
        });

        client.on('authenticated', () => {
            socket.emit('msg', `🔐 ${userId} autenticado.`);
        });

        client.on('auth_failure', () => {
            socket.emit('msg', `❌ Falha de autenticação ${userId}.`);
        });

        client.on('disconnected', () => {
            socket.emit('msg', `🔌 ${userId} desconectado.`);
            delete clients[userId];
        });

        client.on('message', async (message) => {
            try {
                const contact = await message.getContact();
                await message.markAsRead(); 

                const chat = await message.getChat();

                await chat.sendStateTyping(); 

                const payload = {
                    message_id: message.id._serialized,
                    from: message.from,         // número do cliente
                    to: message.to,             // número do bot
                    body: message.body,         // mensagem recebida
                    timestamp: message.timestamp,
                    type: message.type,
                    userId: userId,              // seu identificador local da sessão
                    name: contact.pushname || '',   // nome do contato (se disponível)
                    from_number: contact.number || '',   // número sem o "@c.us"
                    isBusiness: contact.isBusiness // true se for conta comercial                
                 };

                const response = await axios.post('https://axeniabot.com.br/webhooks/nodewebhook.php', payload);

                if (response.data && typeof response.data === 'string') {
                    await message.reply(response.data);
                } else if (response.data && response.data.reply) {
                    await message.reply(response.data.reply);
                } else {
                    await message.reply('⚠️ Resposta inválida do servidor externo.');
                }

            } catch (error) {
                console.error('Erro ao processar webhook:', error.message);
                await message.reply('❌ Erro ao tentar processar sua mensagem. Tente novamente mais tarde.');
            }
        });
        
        client.initialize();
    });
});

server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
