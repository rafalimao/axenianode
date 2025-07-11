const express = require('express');
const router = express.Router();

const clients = require('../../../infrastructure/socket/SocketEvents').clients;

router.get('/:userId', async (req, res) => {
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

module.exports = router;
