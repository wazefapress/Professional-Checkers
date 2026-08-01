// ==========================================
// 1. إعدادات السيرفر (Render) والاتصال
// ==========================================
// استبدل هذا الرابط برابط سيرفر Render الخاص بك بعد رفعه
const SERVER_URL = "https://professional-checkers-dama.onrender.com"; 
let socket;

// ==========================================
// 2. متغيرات اللعبة الأساسية
// ==========================================
let board = [];
let currentPlayer = 'white'; // اللاعب الأبيض يبدأ دائماً
let myColor = 'white';
let selectedPiece = null;
let gameMode = 'ai'; 
let roomCode = null;
let playerScore = 0;
let opponentScore = 0;

// عناصر الواجهة
const boardElement = document.getElementById('gameBoard');
const statusMessage = document.getElementById('statusMessage');
const moveSound = document.getElementById('moveSound');
const winSound = document.getElementById('winSound');

// ==========================================
// 3. تهيئة وبناء الرقعة (الداما التركية/العربية)
// ==========================================
function initBoard() {
    board = Array(8).fill(null).map(() => Array(8).fill(null));
    // ترتيب القطع: الصف 1 و 2 للأسود، الصف 5 و 6 للأبيض
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (r === 1 || r === 2) board[r][c] = { color: 'black', isKing: false };
            if (r === 5 || r === 6) board[r][c] = { color: 'white', isKing: false };
        }
    }
    drawBoard();
    updateStatus();
}

function drawBoard() {
    boardElement.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            // تلوين المربعات (بالتبادل)
            cell.className = `cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            if (board[r][c]) {
                const piece = document.createElement('div');
                piece.className = `piece ${board[r][c].color}`;
                if (board[r][c].isKing) piece.innerHTML = '<i class="fas fa-crown text-warning" style="margin-top:25%; font-size:1.2rem;"></i>';
                cell.appendChild(piece);
            }
            
            cell.addEventListener('click', () => handleCellClick(r, c));
            boardElement.appendChild(cell);
        }
    }
}

// ==========================================
// 4. منطق الحركة والأكل
// ==========================================
function handleCellClick(r, c) {
    if (currentPlayer !== myColor) return; // ليس دورك

    const cellContent = board[r][c];

    // تحديد القطعة
    if (cellContent && cellContent.color === myColor) {
        selectedPiece = { r, c };
        drawBoard();
        highlightCell(r, c);
        return;
    }

    // التحرك إلى مربع فارغ
    if (!cellContent && selectedPiece) {
        const sr = selectedPiece.r;
        const sc = selectedPiece.c;
        
        // التحقق من صحة الحركة (أفقي أو عمودي خطوة واحدة للداما)
        const isNormalMove = (Math.abs(r - sr) === 1 && c === sc) || (Math.abs(c - sc) === 1 && r === sr);
        // منطق الأكل المبسط (تخطي قطعة واحدة)
        const isCaptureMove = (Math.abs(r - sr) === 2 && c === sc) || (Math.abs(c - sc) === 2 && r === sr);

        if (isNormalMove || isCaptureMove) {
            if (isCaptureMove) {
                // إزالة القطعة المأكولة
                const midR = (r + sr) / 2;
                const midC = (c + sc) / 2;
                if (board[midR][midC] && board[midR][midC].color !== myColor) {
                    board[midR][midC] = null; // أكل القطعة
                    updateScore(myColor);
                } else {
                    return; // حركة غير صالحة إذا لم يكن هناك قطعة للخصم
                }
            }

            // تنفيذ الحركة
            board[r][c] = board[sr][sc];
            board[sr][sc] = null;
            
            // الترقية لشيخ (الملك) عند الوصول للطرف الآخر
            if ((myColor === 'white' && r === 0) || (myColor === 'black' && r === 7)) {
                board[r][c].isKing = true;
            }

            playSound(moveSound);
            checkWin();

          if (gameMode === 'online') {
                // نغير الدور محلياً أولاً
                currentPlayer = myColor === 'white' ? 'black' : 'white';
                updateStatus(); // تحديث الواجهة فوراً
                
                // نرسل الدور الجديد للخصم
                socket.emit('makeMove', { room: roomCode, board: board, turn: currentPlayer });
            } else {
                currentPlayer = 'black';
                updateStatus();
                setTimeout(makeAIMove, 1000); // دور الذكاء الاصطناعي
            }
            
            selectedPiece = null;
            drawBoard();
        }
    }
}

function highlightCell(r, c) {
    const index = r * 8 + c;
    boardElement.children[index].firstChild.classList.add('selected');
}

// ==========================================
// 5. المؤثرات والنقاط والفوز
// ==========================================
function updateScore(color) {
    if (color === myColor) {
        playerScore++;
        document.getElementById('playerScore').innerText = playerScore;
    } else {
        opponentScore++;
        document.getElementById('opponentScore').innerText = opponentScore;
    }
}

function playSound(soundElement) {
    soundElement.currentTime = 0;
    soundElement.play().catch(e => console.log("تحتاج لتفاعل المستخدم أولاً لتشغيل الصوت"));
}

function checkWin() {
    let whitePieces = 0, blackPieces = 0;
    board.forEach(row => row.forEach(cell => {
        if (cell) {
            if (cell.color === 'white') whitePieces++;
            else blackPieces++;
        }
    }));

    if (whitePieces === 0 || blackPieces === 0) {
        playSound(winSound);
        document.body.classList.add('win-celebration');
        const winner = whitePieces === 0 ? "اللاعب الأسود" : "اللاعب الأبيض";
        
        Swal.fire({
            title: '🎉 انتهت اللعبة! 🎉',
            text: `الفائز هو: ${winner}`,
            icon: 'success',
            confirmButtonText: 'العب مجدداً'
        }).then(() => {
            document.body.classList.remove('win-celebration');
            initBoard();
            playerScore = 0; opponentScore = 0;
            document.getElementById('playerScore').innerText = '0';
            document.getElementById('opponentScore').innerText = '0';
        });
    }
}

function updateStatus() {
    if (gameMode === 'online') {
        // في وضع الأونلاين، نقارن دور اللاعب الحالي بلونه في هذه الجلسة
        statusMessage.innerText = currentPlayer === myColor ? "دورك الآن! (أنت " + (myColor === 'white' ? 'الأبيض' : 'الأسود') + ")" : "انتظر دور الخصم...";
        statusMessage.className = currentPlayer === myColor ? "alert alert-success text-center fw-bold fs-5" : "alert alert-warning text-center fw-bold fs-5";
    } else {
        // وضع الذكاء الاصطناعي
        statusMessage.innerText = currentPlayer === 'white' ? "دورك الآن!" : "يفكر الذكاء الاصطناعي...";
        statusMessage.className = currentPlayer === 'white' ? "alert alert-success text-center fw-bold fs-5" : "alert alert-warning text-center fw-bold fs-5";
    }
}

// ==========================================
// 6. الذكاء الاصطناعي (حركة عشوائية كبداية)
// ==========================================
function makeAIMove() {
    if (currentPlayer !== 'black') return;
    
    let possibleMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === 'black') {
                // فحص الحركات المتاحة (للأمام فقط للتبسيط)
                if (r + 1 < 8 && !board[r+1][c]) possibleMoves.push({ sr: r, sc: c, er: r+1, ec: c });
            }
        }
    }

    if (possibleMoves.length > 0) {
        const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        board[move.er][move.ec] = board[move.sr][move.sc];
        board[move.sr][move.sc] = null;
        playSound(moveSound);
        
        // الترقية للملك
        if (move.er === 7) board[move.er][move.ec].isKing = true;
    }
    
    currentPlayer = 'white';
    drawBoard();
    updateStatus();
    checkWin();
}

// ==========================================
// 7. إدارة الأونلاين والغرف والمشاركة
// ==========================================
document.getElementById('gameMode').addEventListener('change', (e) => {
    gameMode = e.target.value;
    const onlineControls = document.getElementById('onlineControls');
    if (gameMode === 'online') {
        onlineControls.style.setProperty('display', 'flex', 'important');
        initSocket();
    } else {
        onlineControls.style.setProperty('display', 'none', 'important');
        document.getElementById('roomInfo').style.display = 'none';
        myColor = 'white';
        currentPlayer = 'white';
        initBoard();
    }
});

function initSocket() {
    if(!socket) {
        // الاتصال بالسيرفر
        socket = io(SERVER_URL);
        
        socket.on('roomCreated', (code) => {
            roomCode = code;
            myColor = 'white'; // منشئ الغرفة أبيض
            document.getElementById('displayRoomCode').innerText = code;
            document.getElementById('roomInfo').style.display = 'block';
            statusMessage.innerText = "في انتظار انضمام الخصم...";
        });

        socket.on('gameStarted', () => {
            // عند بدء اللعبة، اللاعب الأبيض هو من يبدأ دائماً
            currentPlayer = 'white';
            initBoard(); // إعادة رسم الرقعة
            updateStatus(); // تحديث رسالة الدور (هنا التعديل الأهم)
            Swal.fire('بدأت اللعبة!', 'انضم الخصم بنجاح، اللاعب الأبيض يبدأ اللعب.', 'success');
        });

        socket.on('updateBoard', (data) => {
            board = data.board;
            currentPlayer = data.turn;
            playSound(moveSound);
            drawBoard();
            updateStatus();
            checkWin();
        });
    }
}

document.getElementById('createRoomBtn').addEventListener('click', () => {
    socket.emit('createRoom');
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const code = document.getElementById('roomCodeInput').value;
    if(code) {
        roomCode = code;
        myColor = 'black'; // المنضم أسود
        socket.emit('joinRoom', code);
    }
});

// نسخ الكود
document.getElementById('copyCodeBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم النسخ!', showConfirmButton: false, timer: 1500 });
});

// زر المشاركة (Web Share API)
document.getElementById('shareBtn').addEventListener('click', async () => {
    const playerName = document.getElementById('playerName').value || 'صديقك';
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'لعبة الداما الاحترافية',
                text: `تحداني ${playerName} في لعبة الداما! كود الغرفة هو: ${roomCode}`,
                url: window.location.href
            });
        } catch (err) { console.log('تم إلغاء المشاركة'); }
    } else {
        Swal.fire('خطأ', 'متصفحك لا يدعم خاصية المشاركة المباشرة', 'error');
    }
});

// بدء اللعبة محلياً عند فتح الصفحة
window.onload = initBoard;
// ==========================================
// 8. التبديل بين صفحة اللعبة وصفحة القوانين
// ==========================================
const aboutBtn = document.getElementById('aboutBtn');
const backToGameBtn = document.getElementById('backToGameBtn');
const mainGameView = document.getElementById('mainGameView');
const aboutView = document.getElementById('aboutView');

// عند الضغط على "قوانين اللعبة"
aboutBtn.addEventListener('click', () => {
    mainGameView.classList.add('d-none'); // إخفاء اللعبة
    aboutView.classList.remove('d-none'); // إظهار القوانين
    
    // تأثير حركي خفيف باستخدام Bootstrap
    aboutView.classList.add('fade-in'); 
});

// عند الضغط على "رجوع للعبة"
backToGameBtn.addEventListener('click', () => {
    aboutView.classList.add('d-none'); // إخفاء القوانين
    mainGameView.classList.remove('d-none'); // إظهار اللعبة
});