const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    }
});

// مسار تجريبي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.send('سيرفر لعبة الداما الاحترافية يعمل بنجاح! جاهز لاستقبال اتصالات Socket.io');
});

// تتبع الغرف لكل لاعب للتعامل مع الانقطاع والانسحاب
const socketRooms = {}; 

io.on('connection', (socket) => {
    console.log('لاعب متصل جديد. معرف الاتصال:', socket.id);

    // إنشاء غرفة
    socket.on('createRoom', () => {
        // توليد كود غرفة من 5 أرقام
        const roomCode = Math.floor(10000 + Math.random() * 90000).toString();
        socket.join(roomCode);
        socketRooms[socket.id] = roomCode; 
        socket.emit('roomCreated', roomCode);
    });

    // الانضمام لغرفة
    socket.on('joinRoom', (roomCode) => {
        const room = io.sockets.adapter.rooms.get(roomCode);
        // التأكد من أن الغرفة موجودة وفيها لاعب واحد فقط
        if (room && room.size === 1) {
            socket.join(roomCode);
            socketRooms[socket.id] = roomCode; 
            io.to(roomCode).emit('gameStarted');
        } else {
            socket.emit('error', 'الغرفة ممتلئة أو الكود غير صحيح');
        }
    });

    // تمرير حركة اللاعب للخصم
    socket.on('makeMove', (data) => {
        socket.to(data.room).emit('updateBoard', { board: data.board, turn: data.turn });
    });

    // معالجة الانقطاع المفاجئ عن الاتصال
    socket.on('disconnect', () => {
        console.log('اللاعب غادر:', socket.id);
        const room = socketRooms[socket.id];
        if (room) {
            // إبلاغ الخصم بانسحاب اللاعب ليتم إنهاء اللعبة عنده
            socket.to(room).emit('opponentDisconnected');
            delete socketRooms[socket.id];
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});