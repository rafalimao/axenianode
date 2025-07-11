const express = require('express');
const { MessageMedia } = require('whatsapp-web.js');
const router = express.Router();

const clients = require('../../../infrastructure/socket/SocketEvents').clients;

router.post('/', async (req, res) => {
    const { type, to, message, url, userId } = req.body;

    const client = clients[userId];
    if (!client) {
        return res.status(404).json({ error: 'Cliente não conectado' });
    }

    try {
        if (type === 'text') {
            await client.sendMessage(to, message);
        } else if (type === 'image' && url) {
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

module.exports = router;
