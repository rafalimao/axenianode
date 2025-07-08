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

app.use(express.json()); // para aceitar JSON no body

process.on('uncaughtException', function (err) {
    console.error('Erro não tratado:', err);
});

process.on('unhandledRejection', function (reason, promise) {
    console.error('Rejeição não tratada:', reason);
});

async function reportStatusToPHP(userId, status, number, ag_name) {
    try {
        await axios.post('https://axeniabot.com.br/webhooks/sessao_agente.php', {
            userId: userId,
            status: status,
            number: number,
            ag_name: ag_name,
            timestamp: new Date().toISOString()
        });
        console.log(`Status enviado para o PHP: ${userId} => ${status}`);
    } catch (e) {
        console.error(`Erro ao enviar status para PHP: ${e.message}`);
    }
}

app.get('/status/:userId', async (req, res) => {
    const userId = req.params.userId;
    const client = clients[userId];

    if (!client) {
        return res.json({ status: 'NÃO_INICIADO' });
    }

    try {
        const state = await client.getState();
        return res.json({ status: state });
    } catch (e) {
        return res.json({ status: 'ERRO', erro: e.message });
    }
});

app.post('/send-message', async (req, res) => {
    const { type, to, message, url, userId } = req.body;

    const client = clients[userId];
    if (!client) {
        return res.status(404).json({ error: 'Cliente não conectado' });
    }

    try {
        if (type === 'text') {
            await client.sendMessage(to, message);
        } else if (type === 'image' && url) {
            const { MessageMedia } = require('whatsapp-web.js');
            const media = await MessageMedia.fromUrl(url);
            await client.sendMessage(to, media);
        } else {
            return res.status(400).json({ error: 'Tipo de mensagem inválido ou dados incompletos' });
        }

        res.json({ status: 'Mensagem enviada com sucesso' });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

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
            const info = client.info;
            socket.emit('ready', `✅ ${userId} conectado!`);
            reportStatusToPHP(userId, 'connected',info.wid.user, info.pushname);
        });

        client.on('authenticated', () => {
            socket.emit('msg', `🔐 ${userId} autenticado.`);
        });

        client.on('auth_failure', () => {
            const info = client.info;
            socket.emit('msg', `❌ Falha de autenticação ${userId}.`);
            reportStatusToPHP(userId, 'auth_failure',info.wid.user, info.pushname);
        });

        client.on('disconnected', () => {
            const info = client.info;
            socket.emit('msg', `🔌 ${userId} desconectado.`);
            reportStatusToPHP(userId, 'disconnected',info.wid.user, info.pushname);
            delete clients[userId];
        });

        client.on('change_state', (state) => {
            console.log(`Estado do cliente [${userId}]: ${state}`);
            socket.emit('state', state);
        });

        client.on('message', async (message) => {
            try {
                const contact = await message.getContact();
                //await message.markAsRead(); 

                const chat = await message.getChat();
                let audioUrl = '';

                await chat.sendStateTyping(); 

                if (message.type === 'audio' && message.hasMedia) {
                    const media = await message.downloadMedia();

                    const audioFileName = `audio_${Date.now()}.ogg`;
                    const filePath = path.join(__dirname, 'public', 'audios', audioFileName);

                    fs.writeFileSync(filePath, media.data, 'base64');

                    // Gera URL pública
                    audioUrl = `https://15b3-2804-14c-63-2f8d-1042-4435-153a-cb4f.ngrok-free.app/audios/${audioFileName}`;
                    bodyText = '[mensagem de áudio]';
                }

                const payload = {
                    message_id: message.id._serialized,
                    from: message.from,        
                    to: message.to,             
                    body: message.body,        
                    timestamp: message.timestamp,
                    type: message.type,
                    userId: userId,              
                    name: contact.pushname || '',   
                    from_number: contact.number || '',   
                    isBusiness: contact.isBusiness,
                    audio_url: audioUrl               
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
