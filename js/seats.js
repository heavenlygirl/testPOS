// 좌석 관리 모듈

const SeatManager = {
    seats: [],
    currentDate: '',
    _debugDate: null, // 디버깅용 가상 날짜

    // 오늘 날짜 가져오기
    getTodayDate() {
        if (this._debugDate) return this._debugDate;
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(now - offset)).toISOString().slice(0, 10);
        return localISOTime;
    },

    // 디버그용 날짜 설정 (예: '2024-02-09')
    setDebugDate(dateStr) {
        this._debugDate = dateStr;
        console.log(`[DEBUG] 가상 날짜 설정됨: ${dateStr}. 앱 동작 시 이 날짜를 오늘로 인식합니다.`);
        // 날짜 변경 체크 트리거
        if (typeof checkDateChange === 'function') {
            checkDateChange();
        }
    },

    // 디버그 모드 해제
    clearDebugDate() {
        this._debugDate = null;
        console.log('[DEBUG] 가상 날짜 해제. 시스템 날짜를 사용합니다.');
        if (typeof checkDateChange === 'function') {
            checkDateChange();
        }
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

        console.log('좌석 저장 시도 - Firebase 설정:', isFirebaseConfigured());

        if (isFirebaseConfigured()) {
            try {
                await db.collection('seatConfigs').doc(this.currentDate).set(configData);
                console.log('Firebase에 좌석 저장 성공');
            } catch (error) {
                console.error('Firebase 좌석 저장 실패:', error);
                showToast('Firebase 저장 실패: ' + error.message);
            }
        }

        // 로컬에도 저장
        LocalStorage.set(`seats_${this.currentDate}`, this.seats);
        LocalStorage.set('seats_latest', this.seats);
        console.log('좌석 저장 완료. 총 좌석 수:', this.seats.length);

        return true;
    },

    // 좌석 ID로 찾기
    getSeatById(seatId) {
        return this.seats.find(s => s.id === seatId);
    }
};

// 그리드 스케일 및 너비 관리
let gridScale = 1;
let baseWidth = 300; // 기본 너비

function updateGridScale() {
    const containers = [
        document.getElementById('seats-grid'),
        document.getElementById('config-seats-grid')
    ];

    baseWidth = 300; // 기본 너비 (모바일)
    if (window.innerWidth >= 768) {
        baseWidth = 600; // 아이패드/태블릿
    }

    // 스크롤 방식으로 변경하여 스케일링 비활성화
    gridScale = 1;

    containers.forEach(container => {
        if (container) {
            let width = baseWidth;

            // 설정 화면은 모바일에서도 넓게 사용하여 스크롤 가능하게 함
            if (container.id === 'config-seats-grid' && baseWidth < 600) {
                width = 600;
            }

            // 스타일 적용 (고정 크기)
            container.style.width = `${width}px`;
            container.style.height = `${width * 1.33}px`; // 3:4 비율
            container.style.transform = 'none';
            container.style.transformOrigin = 'top left';
        }
    });
}

// 좌석 뷰 렌더링 (메인 화면 - 절대 위치)
function renderSeatsView() {
    const container = document.getElementById('seats-grid');
    const noSeatsMsg = document.getElementById('no-seats-msg');

    // 초기화 전 스케일 업데이트
    updateGridScale();

    container.innerHTML = '<div class="entrance-label">출입구</div>';

    if (SeatManager.seats.length === 0) {
        noSeatsMsg.style.display = 'block';
        return;
    }

    noSeatsMsg.style.display = 'none';

    // 화면 비율에 따른 좌표 스케일링 (가로 600이면 2배)
    const coordScale = baseWidth / 300;

    SeatManager.seats.forEach(seat => {
        const order = OrderManager.getOrderBySeat(seat.id);
        const hasOrder = order && order.items.length > 0;
        const totalAmount = hasOrder ? order.totalPrice : 0;

        const seatEl = document.createElement('div');
        seatEl.className = `seat-item ${hasOrder ? 'has-order' : ''}`;
        seatEl.style.position = 'absolute';

        // 아이패드 등 큰 화면에서는 좌표를 비율대로 늘림
        const scaledX = (seat.x || 0) * coordScale;
        const scaledY = (seat.y || 0) * coordScale;

        seatEl.style.left = `${scaledX}px`;
        seatEl.style.top = `${scaledY}px`;
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

    // 초기화 전 스케일 업데이트
    updateGridScale();

    container.innerHTML = '<div class="entrance-label">출입구</div>';

    if (SeatManager.seats.length === 0) {
        // 출입구 라벨은 유지
        return;
    }

    // 화면 비율에 따른 좌표 스케일링
    // 설정 뷰는 모바일에서도 600px로 고정되므로, 모바일(baseWidth < 600)인 경우 2배 확대
    let coordScale = baseWidth / 300;
    if (baseWidth < 600) {
        coordScale = 600 / 300; // 2배
    }

    SeatManager.seats.forEach(seat => {
        const seatEl = document.createElement('div');
        seatEl.className = 'seat-item draggable';
        seatEl.dataset.seatId = seat.id;
        seatEl.style.position = 'absolute';

        // 아이패드 등 큰 화면에서는 좌표를 비율대로 늘림
        const scaledX = (seat.x || 0) * coordScale;
        const scaledY = (seat.y || 0) * coordScale;

        seatEl.style.left = `${scaledX}px`;
        seatEl.style.top = `${scaledY}px`;
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
        // 오프셋도 스케일 고려하여 계산 (Screen Diff / Scale = Internal Diff)
        offsetX: (clientX - rect.left) / gridScale,
        offsetY: (clientY - rect.top) / gridScale,
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

    // Screen 좌표 차이를 Scale로 나누어 Internal 좌표로 변환
    const newX = (clientX - dragState.containerLeft) / gridScale - dragState.offsetX;
    const newY = (clientY - dragState.containerTop) / gridScale - dragState.offsetY;

    // 컨테이너 범위 내로 제한
    const container = dragState.seatEl.parentElement;
    // clientWidth는 내부 픽셀 기준이므로 그대로 사용
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

    // 위치 저장 - 화면 비율 고려하여 원본 좌표(300px 기준)로 변환
    // 모바일 설정 뷰의 경우 600px 기준이므로 coordScale 재계산 필요
    let coordScale = baseWidth / 300;
    if (baseWidth < 600) {
        coordScale = 600 / 300;
    }

    const currentX = parseInt(seatEl.style.left) || 0;
    const currentY = parseInt(seatEl.style.top) || 0;

    const newX = Math.round(currentX / coordScale);
    const newY = Math.round(currentY / coordScale);

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
async function handleSeatSubmit(e) {
    e.preventDefault();

    const seatName = document.getElementById('seat-name').value.trim();
    if (!seatName) {
        showToast('좌석 이름을 입력해주세요.');
        return;
    }

    SeatManager.addSeat(seatName);

    // 좌석 추가 후 자동 저장
    await SeatManager.saveSeats();

    closeSeatModal();
    renderSeatConfigView();
    showToast('좌석이 추가되었습니다.');
}

// 좌석 삭제
async function handleDeleteSeat(seatId) {
    if (confirm('이 좌석을 삭제하시겠습니까?')) {
        SeatManager.removeSeat(seatId);

        // 좌석 삭제 후 자동 저장
        await SeatManager.saveSeats();

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
