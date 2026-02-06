// 좌석 관리 모듈

const SeatManager = {
    seats: [],
    currentDate: '',

    // 오늘 날짜 가져오기
    getTodayDate() {
        const now = new Date();
        return now.toISOString().split('T')[0];
    },

    // 좌석 설정 불러오기
    async loadSeats(date = null) {
        this.currentDate = date || this.getTodayDate();

        if (isFirebaseConfigured()) {
            try {
                const doc = await db.collection('seatConfigs').doc(this.currentDate).get();
                if (doc.exists) {
                    this.seats = doc.data().seats || [];
                } else {
                    // 이전 날짜 설정 불러오기 시도
                    this.seats = await this.loadPreviousConfig() || [];
                }
            } catch (error) {
                console.error('좌석 로드 실패:', error);
                this.seats = LocalStorage.get(`seats_${this.currentDate}`) || [];
            }
        } else {
            this.seats = LocalStorage.get(`seats_${this.currentDate}`) || [];
            // 오늘 설정이 없으면 가장 최근 설정 불러오기
            if (this.seats.length === 0) {
                this.seats = LocalStorage.get('seats_latest') || [];
            }
        }

        return this.seats;
    },

    // 이전 좌석 설정 불러오기
    async loadPreviousConfig() {
        if (isFirebaseConfigured()) {
            try {
                const snapshot = await db.collection('seatConfigs')
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get();

                if (!snapshot.empty) {
                    return snapshot.docs[0].data().seats || [];
                }
            } catch (error) {
                console.error('이전 설정 로드 실패:', error);
            }
        }
        return null;
    },

    // 좌석 추가 (x, y 좌표 포함)
    addSeat(seatName, x = null, y = null) {
        const seatId = 'seat_' + Date.now();
        // 기본 위치: 기존 좌석 개수에 따라 배치 (70px 좌석 + 10px 간격)
        const defaultX = (this.seats.length % 4) * 80 + 10;
        const defaultY = Math.floor(this.seats.length / 4) * 80 + 10;

        const seat = {
            id: seatId,
            name: seatName.trim(),
            x: x !== null ? x : defaultX,
            y: y !== null ? y : defaultY
        };
        this.seats.push(seat);
        return seat;
    },

    // 좌석 위치 업데이트
    updateSeatPosition(seatId, x, y) {
        const seat = this.seats.find(s => s.id === seatId);
        if (seat) {
            seat.x = x;
            seat.y = y;
            return true;
        }
        return false;
    },

    // 좌석 삭제
    removeSeat(seatId) {
        const index = this.seats.findIndex(s => s.id === seatId);
        if (index !== -1) {
            this.seats.splice(index, 1);
            return true;
        }
        return false;
    },

    // 좌석 설정 저장
    async saveSeats() {
        const configData = {
            seats: this.seats,
            createdAt: new Date().toISOString()
        };

        if (isFirebaseConfigured()) {
            try {
                await db.collection('seatConfigs').doc(this.currentDate).set(configData);
            } catch (error) {
                console.error('좌석 저장 실패:', error);
            }
        }

        // 로컬에도 저장
        LocalStorage.set(`seats_${this.currentDate}`, this.seats);
        LocalStorage.set('seats_latest', this.seats);

        return true;
    },

    // 좌석 ID로 찾기
    getSeatById(seatId) {
        return this.seats.find(s => s.id === seatId);
    }
};

// 좌석 뷰 렌더링 (메인 화면 - 절대 위치)
function renderSeatsView() {
    const container = document.getElementById('seats-grid');
    const noSeatsMsg = document.getElementById('no-seats-msg');
    container.innerHTML = '';

    if (SeatManager.seats.length === 0) {
        noSeatsMsg.style.display = 'block';
        return;
    }

    noSeatsMsg.style.display = 'none';

    SeatManager.seats.forEach(seat => {
        const order = OrderManager.getOrderBySeat(seat.id);
        const hasOrder = order && order.items.length > 0;
        const totalAmount = hasOrder ? order.totalPrice : 0;

        const seatEl = document.createElement('div');
        seatEl.className = `seat-item ${hasOrder ? 'has-order' : ''}`;
        seatEl.style.position = 'absolute';
        seatEl.style.left = `${seat.x || 0}px`;
        seatEl.style.top = `${seat.y || 0}px`;
        seatEl.innerHTML = `
            <span class="seat-name">${escapeHtml(seat.name)}</span>
            ${hasOrder ? `<span class="seat-amount">${formatPrice(totalAmount)}</span>` : ''}
        `;
        seatEl.onclick = () => openOrderModal(seat);
        container.appendChild(seatEl);
    });
}

// 드래그 상태
let dragState = {
    isDragging: false,
    seatId: null,
    seatEl: null,
    offsetX: 0,
    offsetY: 0
};

// 좌석 설정 뷰 렌더링 (드래그 가능)
function renderSeatConfigView() {
    const container = document.getElementById('config-seats-grid');
    container.innerHTML = '';

    if (SeatManager.seats.length === 0) {
        container.innerHTML = '<p class="empty-msg">좌석을 추가해주세요.</p>';
        return;
    }

    SeatManager.seats.forEach(seat => {
        const seatEl = document.createElement('div');
        seatEl.className = 'seat-item draggable';
        seatEl.dataset.seatId = seat.id;
        seatEl.style.position = 'absolute';
        seatEl.style.left = `${seat.x || 0}px`;
        seatEl.style.top = `${seat.y || 0}px`;
        seatEl.innerHTML = `
            <span class="seat-name">${escapeHtml(seat.name)}</span>
            <button class="delete-seat" onclick="event.stopPropagation(); handleDeleteSeat('${seat.id}')">&times;</button>
        `;

        // 드래그 이벤트 등록
        seatEl.addEventListener('mousedown', handleDragStart);
        seatEl.addEventListener('touchstart', handleDragStart, { passive: false });

        container.appendChild(seatEl);
    });
}

// 드래그 시작
function handleDragStart(e) {
    // 삭제 버튼 클릭 시 드래그 안함
    if (e.target.classList.contains('delete-seat')) return;

    e.preventDefault();
    const seatEl = e.currentTarget;
    const seatId = seatEl.dataset.seatId;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = seatEl.getBoundingClientRect();
    const containerRect = seatEl.parentElement.getBoundingClientRect();

    dragState = {
        isDragging: true,
        seatId: seatId,
        seatEl: seatEl,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        containerLeft: containerRect.left,
        containerTop: containerRect.top
    };

    seatEl.classList.add('dragging');

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
}

// 드래그 중
function handleDragMove(e) {
    if (!dragState.isDragging) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const newX = clientX - dragState.containerLeft - dragState.offsetX;
    const newY = clientY - dragState.containerTop - dragState.offsetY;

    // 컨테이너 범위 내로 제한
    const container = dragState.seatEl.parentElement;
    const maxX = container.clientWidth - dragState.seatEl.offsetWidth;
    const maxY = container.clientHeight - dragState.seatEl.offsetHeight;

    const boundedX = Math.max(0, Math.min(newX, maxX));
    const boundedY = Math.max(0, Math.min(newY, maxY));

    dragState.seatEl.style.left = `${boundedX}px`;
    dragState.seatEl.style.top = `${boundedY}px`;
}

// 드래그 종료
function handleDragEnd(e) {
    if (!dragState.isDragging) return;

    const seatEl = dragState.seatEl;
    const seatId = dragState.seatId;

    // 위치 저장
    const newX = parseInt(seatEl.style.left) || 0;
    const newY = parseInt(seatEl.style.top) || 0;
    SeatManager.updateSeatPosition(seatId, newX, newY);

    seatEl.classList.remove('dragging');

    // 이벤트 리스너 제거
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);

    dragState = {
        isDragging: false,
        seatId: null,
        seatEl: null,
        offsetX: 0,
        offsetY: 0
    };
}

// 좌석 추가 모달 열기
function openSeatModal() {
    document.getElementById('seat-form').reset();
    document.getElementById('seat-modal').classList.add('active');
}

// 좌석 추가 폼 제출
function handleSeatSubmit(e) {
    e.preventDefault();

    const seatName = document.getElementById('seat-name').value.trim();
    if (!seatName) {
        showToast('좌석 이름을 입력해주세요.');
        return;
    }

    SeatManager.addSeat(seatName);
    closeSeatModal();
    renderSeatConfigView();
    showToast('좌석이 추가되었습니다.');
}

// 좌석 삭제
function handleDeleteSeat(seatId) {
    if (confirm('이 좌석을 삭제하시겠습니까?')) {
        SeatManager.removeSeat(seatId);
        renderSeatConfigView();
        showToast('좌석이 삭제되었습니다.');
    }
}

// 좌석 설정 저장
async function handleSaveSeats() {
    await SeatManager.saveSeats();
    showToast('좌석 설정이 저장되었습니다.');
    renderSeatsView();
}

// 좌석 모달 닫기
function closeSeatModal() {
    document.getElementById('seat-modal').classList.remove('active');
}

// 좌석 이벤트 초기화
function initSeatEvents() {
    document.getElementById('add-seat-btn').onclick = openSeatModal;
    document.getElementById('save-seats-btn').onclick = handleSaveSeats;
    document.getElementById('close-seat-modal').onclick = closeSeatModal;
    document.getElementById('seat-form').onsubmit = handleSeatSubmit;

    // 모달 외부 클릭 시 닫기
    document.getElementById('seat-modal').onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            closeSeatModal();
        }
    };
}
