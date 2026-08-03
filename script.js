const SERVER_URL = "https://professional-checkers-dama.onrender.com"; 
let socket;

let board = [];
let currentPlayer = 'white'; 
let myColor = 'white';
let selectedPiece = null;
let gameMode = 'ai'; 
let roomCode = null;
let playerScore = 0;
let opponentScore = 0;
let forcedPiece = null; 
let requiredMaxCaptures = 0; 

// متغيرات عناصر الصفحة
let boardElement, statusMessage;

// ==========================================
// محرك الصوت المتقدم (Web Audio API)
// ==========================================
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// صوت نقلة الخشب/القطعة
function playMoveSound() {
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.07);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.07);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.07);
    } catch (e) {
        console.log("Audio play error:", e);
    }
}

// صوت الفوز المبهج
function playWinSound() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // نغمات C4, E4, G4, C5
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.12);
            gain.gain.setValueAtTime(0.3, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.3);
        });
    } catch (e) {
        console.log("Win sound error:", e);
    }
}

// ==========================================
// تهيئة وإدارة اللعبة
// ==========================================
function initDOMElements() {
    boardElement = document.getElementById('gameBoard');
    statusMessage = document.getElementById('statusMessage');
}

function initBoard() {
    initDOMElements();
    if (!boardElement) return;

    board = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (r === 1 || r === 2) board[r][c] = { color: 'black', isKing: false };
            if (r === 5 || r === 6) board[r][c] = { color: 'white', isKing: false };
        }
    }
    forcedPiece = null;
    selectedPiece = null;
    calculateGlobalMaxCaptures();
    drawBoard();
    updateStatus();
}

function drawBoard() {
    if (!boardElement) initDOMElements();
    if (!boardElement) return;

    boardElement.innerHTML = '';
    
    let validMoves = [];
    if (selectedPiece) {
        validMoves = getValidTargetsForPiece(selectedPiece.r, selectedPiece.c);
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = `cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            
            const isValidTarget = validMoves.some(m => m.toR === r && m.toC === c);
            if (isValidTarget) {
                cell.classList.add('valid-target');
            }

            cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
            cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                cell.classList.remove('drag-over');
                if (selectedPiece) processMove(r, c);
            });
            cell.addEventListener('click', () => {
                initAudio(); // تفعيل الصوت مع أول كليك من المستخدم
                processClick(r, c);
            });

            if (board[r][c]) {
                const piece = document.createElement('div');
                piece.className = `piece ${board[r][c].color}`;
                if (board[r][c].isKing) {
                    piece.innerHTML = '<i class="fas fa-crown text-warning" style="margin-top:25%; font-size:1.2rem;"></i>';
                }
                
                if (board[r][c].color === currentPlayer && requiredMaxCaptures > 0) {
                    let pCap = getMaxCapturePath(r, c, board);
                    if (pCap === requiredMaxCaptures) {
                        piece.classList.add('forced-capture');
                    }
                }

                if (selectedPiece && selectedPiece.r === r && selectedPiece.c === c) {
                    piece.classList.add('selected');
                }

                if (board[r][c].color === myColor && currentPlayer === myColor) {
                    piece.draggable = true;
                    piece.addEventListener('dragstart', (e) => {
                        initAudio();
                        handlePieceSelection(r, c);
                        e.dataTransfer.effectAllowed = "move";
                    });
                }
                cell.appendChild(piece);
            }
            boardElement.appendChild(cell);
        }
    }
}

// ==========================================
// خوارزميات وقواعد اللعبة
// ==========================================
function getPieceCaptures(r, c, currentBoard = board) {
    const piece = currentBoard[r][c];
    if (!piece) return [];
    let captures = [];
    const color = piece.color;

    if (!piece.isKing) {
        const forward = color === 'white' ? -1 : 1;
        const directions = [
            { dr: forward * 2, dc: 0, midR: forward, midC: 0 },
            { dr: -forward * 2, dc: 0, midR: -forward, midC: 0 },
            { dr: 0, dc: 2, midR: 0, midC: 1 },
            { dr: 0, dc: -2, midR: 0, midC: -1 }
        ];

        for (let d of directions) {
            const tr = r + d.dr, tc = c + d.dc, mr = r + d.midR, mc = c + d.midC;
            if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
                if (!currentBoard[tr][tc] && currentBoard[mr][mc] && currentBoard[mr][mc].color !== color) {
                    captures.push({ fromR: r, fromC: c, toR: tr, toC: tc, midR: mr, midC: mc });
                }
            }
        }
    } else {
        const directions = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for (let d of directions) {
            let step = 1; let foundEnemy = null;
            while (true) {
                let cr = r + (d.r * step), cc = c + (d.c * step);
                if (cr < 0 || cr >= 8 || cc < 0 || cc >= 8) break;
                const target = currentBoard[cr][cc];
                if (!target) {
                    if (foundEnemy) captures.push({ fromR: r, fromC: c, toR: cr, toC: cc, midR: foundEnemy.r, midC: foundEnemy.c });
                } else {
                    if (target.color === color || foundEnemy) break;
                    foundEnemy = { r: cr, c: cc };
                }
                step++;
            }
        }
    }
    return captures;
}

function getMaxCapturePath(r, c, currentBoard, isPromoted = false) {
    let captures = getPieceCaptures(r, c, currentBoard);
    if (captures.length === 0 || isPromoted) return 0;

    let maxDepth = 0;
    for (let cap of captures) {
        let tempBoard = currentBoard.map(row => row.map(cell => cell ? {...cell} : null));
        tempBoard[cap.toR][cap.toC] = tempBoard[cap.fromR][cap.fromC];
        tempBoard[cap.fromR][cap.fromC] = null;
        tempBoard[cap.midR][cap.midC] = null;
        
        let promotedNow = false;
        if (!tempBoard[cap.toR][cap.toC].isKing && ((tempBoard[cap.toR][cap.toC].color === 'white' && cap.toR === 0) || (tempBoard[cap.toR][cap.toC].color === 'black' && cap.toR === 7))) {
            promotedNow = true; 
        }

        let depth = 1 + getMaxCapturePath(cap.toR, cap.toC, tempBoard, promotedNow);
        if (depth > maxDepth) maxDepth = depth;
    }
    return maxDepth;
}

function calculateGlobalMaxCaptures() {
    requiredMaxCaptures = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === currentPlayer) {
                let depth = getMaxCapturePath(r, c, board);
                if (depth > requiredMaxCaptures) requiredMaxCaptures = depth;
            }
        }
    }
}

function getValidTargetsForPiece(r, c) {
    const piece = board[r][c];
    if (!piece || piece.color !== myColor) return [];

    let captures = getPieceCaptures(r, c);
    if (requiredMaxCaptures > 0) {
        return captures;
    }

    let validMoves = [];
    if (!piece.isKing) {
        const forward = myColor === 'white' ? -1 : 1;
        const targets = [
            { r: r + forward, c: c },
            { r: r, c: c + 1 },
            { r: r, c: c - 1 }
        ];
        for (let t of targets) {
            if (t.r >= 0 && t.r < 8 && t.c >= 0 && t.c < 8 && !board[t.r][t.c]) {
                validMoves.push({ toR: t.r, toC: t.c });
            }
        }
    } else {
        const directions = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for (let d of directions) {
            let step = 1;
            while (true) {
                let cr = r + (d.r * step), cc = c + (d.c * step);
                if (cr < 0 || cr >= 8 || cc < 0 || cc >= 8 || board[cr][cc]) break;
                validMoves.push({ toR: cr, toC: cc });
                step++;
            }
        }
    }
    return validMoves;
}

// ==========================================
// معالجة النقلات
// ==========================================
function handlePieceSelection(r, c) {
    if (forcedPiece && (forcedPiece.r !== r || forcedPiece.c !== c)) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يجب متابعة الأكل بنفس القطعة!', showConfirmButton: false, timer: 2000 });
        return;
    }

    if (requiredMaxCaptures > 0) {
        let pCap = getMaxCapturePath(r, c, board);
        if (pCap < requiredMaxCaptures) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'اختر إحدى القطع المحددة بالأحمر (أكل إجباري)!', showConfirmButton: false, timer: 2000 });
            return;
        }
    }

    selectedPiece = { r, c };
    drawBoard();
}

function processClick(r, c) {
    if (currentPlayer !== myColor) return;

    if (board[r][c] && board[r][c].color === myColor) {
        handlePieceSelection(r, c);
    } else if (!board[r][c] && selectedPiece) {
        processMove(r, c);
    }
}

function processMove(r, c) {
    if (currentPlayer !== myColor || !selectedPiece) return;
    const sr = selectedPiece.r, sc = selectedPiece.c;
    const piece = board[sr][sc];

    let isValidMove = false, isCaptureMove = false, capturedPiece = null;
    let captures = getPieceCaptures(sr, sc);
    let matchedCapture = captures.find(cap => cap.toR === r && cap.toC === c);
    
    if (matchedCapture) {
        isValidMove = true; isCaptureMove = true;
        capturedPiece = { r: matchedCapture.midR, c: matchedCapture.midC };
    } else if (requiredMaxCaptures === 0 && !forcedPiece) {
        let validTargets = getValidTargetsForPiece(sr, sc);
        if (validTargets.some(t => t.toR === r && t.toC === c)) {
            isValidMove = true;
        }
    }

    if (isValidMove) {
        if (isCaptureMove) {
            board[capturedPiece.r][capturedPiece.c] = null;
            updateScore(myColor);
        }

        board[r][c] = board[sr][sc];
        board[sr][sc] = null;
        
        const wasPromoted = !board[r][c].isKing && ((myColor === 'white' && r === 0) || (myColor === 'black' && r === 7));
        if (wasPromoted) board[r][c].isKing = true;

        playMoveSound(); // تشغيل صوت النقلة الفوري
        checkWin();

        if (isCaptureMove && !wasPromoted) {
            let nextCaptures = getPieceCaptures(r, c);
            if (nextCaptures.length > 0) {
                forcedPiece = { r, c };
                selectedPiece = { r, c };
                requiredMaxCaptures--; 
                drawBoard();
                if (statusMessage) statusMessage.innerText = "واصل الأكل!";
                return;
            }
        }

        forcedPiece = null; selectedPiece = null;
        currentPlayer = myColor === 'white' ? 'black' : 'white';
        calculateGlobalMaxCaptures(); 
        updateStatus();

        if (gameMode === 'online') {
            socket.emit('makeMove', { room: roomCode, board: board, turn: currentPlayer });
        } else {
            drawBoard();
            setTimeout(makeAIMove, 800); 
            return;
        }
        drawBoard();
    } else {
        selectedPiece = null;
        drawBoard();
    }
}

// ==========================================
// النقاط والذكاء الاصطناعي والأونلاين
// ==========================================
function updateScore(color) {
    if (color === myColor) {
        playerScore++; 
        const el = document.getElementById('playerScore');
        if (el) el.innerText = playerScore;
    } else {
        opponentScore++; 
        const el = document.getElementById('opponentScore');
        if (el) el.innerText = opponentScore;
    }
}

function checkWin() {
    let w = 0, b = 0;
    board.forEach(row => row.forEach(cell => { if (cell) cell.color === 'white' ? w++ : b++; }));
    if (w === 0 || b === 0) {
        playWinSound(); // تشغيل صوت الفوز الفوري
        Swal.fire('🎉 انتهت اللعبة!', `الفائز هو: ${w === 0 ? "اللاعب الأسود" : "اللاعب الأبيض"}`, 'success').then(() => {
            initBoard(); playerScore = 0; opponentScore = 0;
            const pEl = document.getElementById('playerScore');
            const oEl = document.getElementById('opponentScore');
            if (pEl) pEl.innerText = '0';
            if (oEl) oEl.innerText = '0';
        });
    }
}

function updateStatus() {
    if (!statusMessage) initDOMElements();
    if (!statusMessage) return;

    if (gameMode === 'online') {
        statusMessage.innerText = currentPlayer === myColor ? "دورك الآن!" : "انتظر دور الخصم...";
        statusMessage.className = currentPlayer === myColor ? "alert alert-success text-center fw-bold fs-5" : "alert alert-warning text-center fw-bold fs-5";
    } else {
        statusMessage.innerText = currentPlayer === 'white' ? (requiredMaxCaptures > 0 ? "أكل إجباري! اختر القطعة المحددة بالأحمر." : "دورك الآن!") : "يفكر الذكاء الاصطناعي...";
        statusMessage.className = currentPlayer === 'white' ? (requiredMaxCaptures > 0 ? "alert alert-danger text-center fw-bold fs-5" : "alert alert-success text-center fw-bold fs-5") : "alert alert-warning text-center fw-bold fs-5";
    }
}

function makeAIMove() {
    if (currentPlayer !== 'black') return;
    
    let bestCap = null;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === 'black') {
                let caps = getPieceCaptures(r, c);
                if (caps.length > 0) { bestCap = caps[0]; break; }
            }
        }
        if(bestCap) break;
    }

    if (bestCap) {
        board[bestCap.toR][bestCap.toC] = board[bestCap.fromR][bestCap.fromC];
        board[bestCap.fromR][bestCap.fromC] = null;
        board[bestCap.midR][bestCap.midC] = null;
        
        opponentScore++; 
        const el = document.getElementById('opponentScore');
        if (el) el.innerText = opponentScore;

        const wasPromoted = !board[bestCap.toR][bestCap.toC].isKing && bestCap.toR === 7;
        if (wasPromoted) board[bestCap.toR][bestCap.toC].isKing = true;

        playMoveSound(); checkWin();
        
        if (!wasPromoted && getPieceCaptures(bestCap.toR, bestCap.toC).length > 0) {
            drawBoard(); setTimeout(makeAIMove, 800); return;
        }
    } else {
        let possibleMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (board[r][c] && board[r][c].color === 'black') {
                    if (r + 1 < 8 && !board[r + 1][c]) possibleMoves.push({ sr: r, sc: c, er: r + 1, ec: c });
                    if (c + 1 < 8 && !board[r][c + 1]) possibleMoves.push({ sr: r, sc: c, er: r, ec: c + 1 });
                    if (c - 1 >= 0 && !board[r][c - 1]) possibleMoves.push({ sr: r, sc: c, er: r, ec: c - 1 });
                }
            }
        }
        if (possibleMoves.length > 0) {
            const m = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            board[m.er][m.ec] = board[m.sr][m.sc]; board[m.sr][m.sc] = null;
            if (m.er === 7) board[m.er][m.ec].isKing = true;
            playMoveSound();
        }
    }
    
    currentPlayer = 'white';
    calculateGlobalMaxCaptures();
    drawBoard(); updateStatus(); checkWin();
}

// ==========================================
// تشغيل اللعبة وأحداث الواجهة
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initBoard();

    const modeSelect = document.getElementById('gameMode');
    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            gameMode = e.target.value;
            const onlineControls = document.getElementById('onlineControls');
            if (gameMode === 'online') {
                if (onlineControls) onlineControls.style.setProperty('display', 'flex', 'important');
                initSocket();
            } else {
                if (onlineControls) onlineControls.style.setProperty('display', 'none', 'important');
                const roomInfo = document.getElementById('roomInfo');
                if (roomInfo) roomInfo.classList.add('d-none');
                myColor = 'white'; currentPlayer = 'white'; initBoard();
            }
        });
    }

    // ==========================================
// إنشاء غرفة جديدة مع تنبيه السيرفر والاستجابة
// ==========================================
const createBtn = document.getElementById('createRoomBtn');
if (createBtn) {
    createBtn.addEventListener('click', () => {
        if (!socket || !socket.connected) {
            Swal.fire({
                icon: 'error',
                title: 'غير متصل بالخادم',
                text: 'جاري الاتصال بالخادم، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
                confirmButtonText: 'حسناً'
            });
            return;
        }

        // 1. إظهار رسالة تنبيه تفاعلية تفيد ببدء إنشاء الغرفة وتنبيه حالة السبات
        Swal.fire({
            title: 'جاري إنشاء الغرفة...',
            html: `
                <p class="mb-2">جاري التواصل مع الخادم لتجهيز طاولتك.</p>
                <small class="text-muted d-block">
                    <i class="fas fa-info-circle me-1"></i> 
                    ملاحظة: إذا كان الخادم في حالة سبات، قد يستغرق الاتصال من 15 إلى 30 ثانية لأول مرة.
                </small>
            `,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading(); // إظهار مؤشر الدوران
            }
        });

        // 2. إرسال طلب إنشاء الغرفة إلى الخادم
        socket.emit('createRoom');
    });
}

    const joinBtn = document.getElementById('joinRoomBtn');
    if (joinBtn) joinBtn.addEventListener('click', () => {
        const input = document.getElementById('roomCodeInput');
        if(input && input.value) { roomCode = input.value; myColor = 'black'; socket && socket.emit('joinRoom', roomCode); }
    });

    const copyBtn = document.getElementById('copyCodeBtn');
    if (copyBtn) copyBtn.addEventListener('click', () => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode);
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم النسخ!', showConfirmButton: false, timer: 1500 });
        }
    });

    const aboutBtn = document.getElementById('aboutBtn');
    const backBtn = document.getElementById('backToGameBtn');
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => {
            document.getElementById('mainGameView').classList.add('d-none'); 
            document.getElementById('aboutView').classList.remove('d-none'); 
            document.getElementById('aboutView').classList.add('fade-in'); 
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('aboutView').classList.add('d-none'); 
            document.getElementById('mainGameView').classList.remove('d-none');
        });
    }
    // ==========================================
// إدارة تثبيت تطبيق الويب (PWA Install Prompt)
// ==========================================
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');

// إلتقاط حدث إمكانية التثبيت من المتصفح
window.addEventListener('beforeinstallprompt', (e) => {
    // منع النافذة التلقائية المزعجة من المتصفح
    e.preventDefault();
    // حفظ الحدث لاستدعائه عند نقر الزر
    deferredPrompt = e;
    // إظهار زر التثبيت في الشريط العلوي
    if (installBtn) {
        installBtn.classList.remove('d-none');
    }
});

// عند نُقر المستخدم على زر التثبيت
if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        // إظهار نافذة التثبيت الرسمية الخاصة بالنظام/المتصفح
        deferredPrompt.prompt();
        
        // انتظار قرار المستخدم
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم تثبيت اللعبة بنجاح على جهازك!',
                showConfirmButton: false,
                timer: 2500
            });
        }
        
        // إعادة التعيين وإخفاء الزر
        deferredPrompt = null;
        installBtn.classList.add('d-none');
    });
}

// إخفاء الزر فور اكتمال التثبيت
window.addEventListener('appinstalled', () => {
    if (installBtn) {
        installBtn.classList.add('d-none');
    }
    deferredPrompt = null;
    console.log('تم تثبيت لعبة الداما بنجاح كـ PWA');
});
});

function initSocket() {
    if(!socket) {
        socket = io(SERVER_URL);
        
        // عند استقبال كود الغرفة الجديدة من الخادم
socket.on('roomCreated', (code) => {
    roomCode = code;
    myColor = 'white';
    
    // إظهار عناصر كود الغرفة ورابط المشاركة في الواجهة
    const roomInfo = document.getElementById('roomInfo');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    
    if (roomInfo) roomInfo.classList.remove('d-none');
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomCode;

    // إغلاق مؤشر التحميل وإظهار تنبيه بنجاح إنشاء الغرفة
    Swal.fire({
        icon: 'success',
        title: 'تم إنشاء الغرفة بنجاح! 🎉',
        html: `رمز الغرفة الخاص بك هو: <b class="text-primary fs-4">${roomCode}</b><br><small class="text-muted">شاركه مع صديقك للانضمام فوراً.</small>`,
        confirmButtonText: 'حسناً',
        timer: 4000,
        timerProgressBar: true
    });
});

        socket.on('gameStarted', () => {
            currentPlayer = 'white'; initBoard(); updateStatus(); 
            Swal.fire('بدأت اللعبة!', 'انضم الخصم، الأبيض يبدأ.', 'success');
        });

        socket.on('updateBoard', (data) => {
            board = data.board; currentPlayer = data.turn;
            calculateGlobalMaxCaptures();
            playMoveSound(); drawBoard(); updateStatus(); checkWin();
        });

        socket.on('opponentDisconnected', () => {
            Swal.fire({
                title: 'انقطع الاتصال!',
                text: 'لقد غادر الخصم الغرفة أو انقطع اتصاله. تم إنهاء اللعبة.',
                icon: 'error',
                confirmButtonText: 'حسناً'
            }).then(() => { window.location.reload(); });
        });
    }
}