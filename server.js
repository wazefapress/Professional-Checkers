const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // للسماح للواجهة بالاتصال من أي مكان
        methods: ["GET", "POST"]
    }
});

// للتحقق من عمل السيرفر بنجاح على Render
app.get('/', (req, res) => {
    res.send('سيرفر لعبة الداما يعمل بنجاح!');
});

io.on('connection', (socket) => {
    console.log('لاعب جديد متصل:', socket.id);

    // إنشاء غرفة برقم عشوائي من 5 خانات
    socket.on('createRoom', () => {
        const roomCode = Math.floor(10000 + Math.random() * 90000).toString();
        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
    });

    // الانضمام لغرفة
    socket.on('joinRoom', (roomCode) => {
        const room = io.sockets.adapter.rooms.get(roomCode);
        if (room && room.size === 1) {
            socket.join(roomCode);
            io.to(roomCode).emit('gameStarted');
        } else {
            socket.emit('error', 'الغرفة ممتلئة أو غير موجودة');
        }
    });

    // تبادل الحركات بين اللاعبين
    socket.on('makeMove', (data) => {
        // إرسال الحركة للخصم فقط وليس للمرسل
        socket.to(data.room).emit('updateBoard', { board: data.board, turn: data.turn });
    });

    socket.on('disconnect', () => {
        console.log('لاعب غادر:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل على البورت ${PORT}`);
});