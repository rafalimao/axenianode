const express = require('express');
const { MessageMedia } = require('whatsapp-web.js');
const router = express.Router();

const { clients } = require('../../../infrastructure/socket/SocketEvents');


router.post('/', async (req, res) => {
    const { type, to, message, url, userId } = req.body;
    console.log('[INFO] Mensagem',message);
    console.log('[INFO] URL recebida:', url);
    console.log('[INFO] to',to);
    console.log('[INFO] userId :', userId);

    const client = clients[userId];
    if (!client) {
        return res.status(404).json({ error: 'Cliente não conectado' });
    }

    try {
        if (type === 'text') {
            await client.sendMessage(to, message);
        } else if (type === 'image' && url) {
            console.log('[INFO] Tipo imagem detectado');
            console.log('[INFO] URL recebida:', url);
            try {
                console.log('[DEBUG] Iniciando download da mídia');
                const media = await MessageMedia.fromUrl(url);
                console.log('[DEBUG] Mídia baixada com sucesso');
                
                const cleanTo = to.includes('@c.us') ? to : `${to}@c.us`;
                console.log('[DEBUG] Enviando mídia para:', cleanTo);

                await client.sendMessage(cleanTo, media);
                console.log('[SUCCESS] Imagem enviada com sucesso');
            } catch (error) {
                console.error('[ERROR] Falha ao baixar ou enviar a imagem:', error.message);
                return res.status(500).json({
                    error: 'Erro ao baixar ou enviar imagem',
                    details: error.message
                });
            }
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
