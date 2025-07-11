const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const setupSocketEvents = require('./src/infrastructure/socket/SocketEvents');
const statusRoutes = require('./src/interfaces/http/routes/statusRoutes');
const messageRoutes = require('./src/interfaces/http/routes/messageRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rotas HTTP
app.use('/status', statusRoutes);
app.use('/send-message', messageRoutes);

// Socket.IO
setupSocketEvents(io);

// Start
server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
