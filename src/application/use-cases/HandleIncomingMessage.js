const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = async function (client, message, userId) {
    try {
        const contact = await message.getContact();
        const chat = await message.getChat();
        let audioUrl = '';

        if ((message.type === 'audio' || message.type === 'ptt') && message.hasMedia) {
            const media = await message.downloadMedia();
            const audioFileName = `audio_${Date.now()}.ogg`;
            const filePath = path.join(__dirname, '../../../public/audios', audioFileName);
            fs.writeFileSync(filePath, media.data, 'base64');
            audioUrl = `https://SEU_DOMINIO/audios/${audioFileName}`;
        }

        const payload = {
            message_id: message.id._serialized,
            from: message.from,
            to: message.to,
            body: message.body,
            timestamp: message.timestamp,
            type: message.type,
            userId,
            name: contact.pushname || '',
            from_number: contact.number || '',
            isBusiness: contact.isBusiness,
            audio_url: audioUrl
        };

        const response = await axios.post('https://axeniabot.com.br/webhooks/nodewebhook.php', payload);

        if (response.data?.reply) {
            await message.reply(response.data.reply);
        } else if (typeof response.data === 'string') {
            await message.reply(response.data);
        } else {
            await message.reply('⚠️ Resposta inválida do servidor externo.');
        }

    } catch (error) {
        console.error('Erro ao processar webhook:', error.message);
        await message.reply('❌ Erro ao processar sua mensagem.');
    }
};
