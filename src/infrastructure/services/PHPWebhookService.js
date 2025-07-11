const axios = require('axios');

const PHPWebhookService = {
    async reportStatus(userId, status, number, ag_name) {
        try {
            await axios.post('https://axeniabot.com.br/webhooks/sessao_agente.php', {
                userId,
                status,
                number,
                ag_name,
                timestamp: new Date().toISOString()
            });
            console.log(`Status enviado para PHP: ${userId} => ${status}`);
        } catch (e) {
            console.error(`Erro ao enviar status para PHP: ${e.message}`);
        }
    }
};

module.exports = PHPWebhookService;
