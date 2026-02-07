// 주문/결제 관리 모듈

const OrderManager = {
    orders: {},  // seatId -> order
    currentSeatId: null,

    // 주문 목록 불러오기
    async loadOrders() {
        const today = SeatManager.getTodayDate();

        if (isFirebaseConfigured()) {
            try {
                const snapshot = await db.collection('orders')
                    .where('date', '==', today)
                    .where('status', '==', 'active')
                    .get();

                this.orders = {};
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    this.orders[data.seatId] = {
                        id: doc.id,
                        ...data
                    };
                });
            } catch (error) {
                console.error('주문 로드 실패:', error);
                this.orders = LocalStorage.get(`orders_${today}`) || {};
            }
        } else {
            this.orders = LocalStorage.get(`orders_${today}`) || {};
        }

        return this.orders;
    },

    // 좌석별 주문 가져오기
    getOrderBySeat(seatId) {
        return this.orders[seatId] || null;
    },

    // 주문에 메뉴 추가
    async addItemToOrder(seatId, menu, quantity = 1) {
        // 영업 중이 아니면 주문 불가
        if (BusinessManager.status !== 'open') {
            showToast('영업을 먼저 시작해주세요.');
            return;
        }

        if (!this.orders[seatId]) {
            this.orders[seatId] = {
                seatId: seatId,
                date: SeatManager.getTodayDate(),
                items: [],
                totalPrice: 0,
                status: 'active'
            };
        }

        const order = this.orders[seatId];
        const existingItem = order.items.find(item => item.menuId === menu.id);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            order.items.push({
                menuId: menu.id,
                name: menu.name,
                price: menu.price,
                quantity: quantity
            });
        }

        this.calculateTotal(seatId);
        await this.saveOrder(seatId);
    },

    // 주문에서 메뉴 수량 변경
    async updateItemQuantity(seatId, menuId, quantity) {
        const order = this.orders[seatId];
        if (!order) return;

        const item = order.items.find(item => item.menuId === menuId);
        if (!item) return;

        if (quantity <= 0) {
            // 수량이 0 이하면 삭제
            order.items = order.items.filter(item => item.menuId !== menuId);
        } else {
            item.quantity = quantity;
        }

        this.calculateTotal(seatId);
        await this.saveOrder(seatId);
    },

    // 총액 계산
    calculateTotal(seatId) {
        const order = this.orders[seatId];
        if (!order) return 0;

        order.totalPrice = order.items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        return order.totalPrice;
    },

    // 주문 저장
    async saveOrder(seatId) {
        const order = this.orders[seatId];
        if (!order) return;

        order.updatedAt = new Date().toISOString();

        if (isFirebaseConfigured()) {
            try {
                const docId = `${order.date}_${seatId}`;
                if (order.items.length === 0) {
                    await db.collection('orders').doc(docId).delete();
                } else {
                    await db.collection('orders').doc(docId).set(order);
                }
            } catch (error) {
                console.error('주문 저장 실패:', error);
            }
        }

        // 로컬에도 저장
        this.saveToLocal();
    },

    // 결제 완료 처리
    async completePayment(seatId) {
        const order = this.orders[seatId];
        if (!order) return false;

        const now = new Date();
        const paidAt = now.toISOString();
        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        // 결제 기록 저장
        const paymentRecord = {
            ...order,
            status: 'paid',
            paidAt: paidAt,
            time: timeStr
        };

        if (isFirebaseConfigured()) {
            try {
                await db.collection('paymentHistory').add(paymentRecord);

                // 현재 주문 삭제
                const docId = `${order.date}_${seatId}`;
                await db.collection('orders').doc(docId).delete();
            } catch (error) {
                console.error('결제 처리 실패:', error);
            }
        }

        // 오늘 매출에 추가
        BusinessManager.addPayment(paymentRecord);

        // 주문 초기화
        delete this.orders[seatId];
        this.saveToLocal();

        // 영업 상태 UI 업데이트
        renderBusinessStatus();

        return true;
    },

    // 로컬 저장
    saveToLocal() {
        const today = SeatManager.getTodayDate();
        LocalStorage.set(`orders_${today}`, this.orders);
    },

    // 현재 활성 주문 총액
    getActiveOrdersTotal() {
        return Object.values(this.orders).reduce((sum, order) => {
            return sum + (order.totalPrice || 0);
        }, 0);
    },

    // 미결제 주문이 있는지 확인
    hasActiveOrders() {
        return Object.keys(this.orders).length > 0;
    }
};

// 영업 상태 관리 모듈
const BusinessManager = {
    status: 'closed',  // closed | open | settled
    todayPayments: [], // 오늘 결제 내역
    todayTotal: 0,     // 오늘 총 매출

    // 영업 상태 불러오기
    async loadStatus() {
        const today = SeatManager.getTodayDate();

        if (isFirebaseConfigured()) {
            try {
                const doc = await db.collection('businessStatus').doc(today).get();
                if (doc.exists) {
                    const data = doc.data();
                    this.status = data.status || 'closed';
                    this.todayPayments = data.payments || [];
                    this.todayTotal = data.totalSales || 0;
                } else {
                    this.status = 'closed';
                    this.todayPayments = [];
                    this.todayTotal = 0;
                }
            } catch (error) {
                console.error('영업 상태 로드 실패:', error);
                this.loadFromLocal();
            }
        } else {
            this.loadFromLocal();
        }

        return this.status;
    },

    loadFromLocal() {
        const today = SeatManager.getTodayDate();
        const data = LocalStorage.get(`business_${today}`) || {};
        this.status = data.status || 'closed';
        this.todayPayments = data.payments || [];
        this.todayTotal = data.totalSales || 0;
    },

    // 영업 시작
    async startBusiness() {
        this.status = 'open';
        this.todayPayments = [];
        this.todayTotal = 0;

        await this.saveStatus();
        showToast('영업을 시작합니다!');
    },

    // 영업 완료 (정산)
    async endBusiness() {
        // 미결제 주문 확인 (총액이 0보다 클 때만 확인)
        const activeTotal = OrderManager.getActiveOrdersTotal();
        if (OrderManager.hasActiveOrders() && activeTotal > 0) {
            const confirmed = confirm(`미결제 주문이 ${formatPrice(activeTotal)} 있습니다. 영업을 종료하시겠습니까?`);
            if (!confirmed) return false;
        }

        this.status = 'settled';
        await this.saveStatus();

        // 일별 매출 데이터 저장
        await SalesManager.saveDailySales(this.todayPayments, this.todayTotal);

        showToast('영업이 완료되었습니다!');
        return true;
    },

    // 영업 재시작
    async restartBusiness() {
        this.status = 'open';
        await this.saveStatus();
        showToast('영업을 다시 시작합니다!');
    },

    // 결제 추가
    addPayment(payment) {
        this.todayPayments.push(payment);
        this.todayTotal += payment.totalPrice;
        this.saveStatus();
    },

    // 상태 저장
    async saveStatus() {
        const today = SeatManager.getTodayDate();
        const data = {
            status: this.status,
            payments: this.todayPayments,
            totalSales: this.todayTotal,
            updatedAt: new Date().toISOString()
        };

        if (isFirebaseConfigured()) {
            try {
                await db.collection('businessStatus').doc(today).set(data);
            } catch (error) {
                console.error('영업 상태 저장 실패:', error);
            }
        }

        LocalStorage.set(`business_${today}`, data);
    },

    // 오늘 매출 메뉴별 집계
    getTodayItemsSummary() {
        const summary = {};

        this.todayPayments.forEach(payment => {
            payment.items.forEach(item => {
                if (!summary[item.menuId]) {
                    summary[item.menuId] = {
                        menuId: item.menuId,
                        name: item.name,
                        quantity: 0,
                        total: 0
                    };
                }
                summary[item.menuId].quantity += item.quantity;
                summary[item.menuId].total += item.price * item.quantity;
            });
        });

        return Object.values(summary);
    },

    // 일별 상태 초기화 (날짜 변경 시)
    async resetDailyStatus() {
        this.status = 'closed';
        this.todayPayments = [];
        this.todayTotal = 0;
        await this.saveStatus();
        console.log('BusinessManager 상태 초기화 완료');
    }
};

// 영업 상태 UI 렌더링
function renderBusinessStatus() {
    const container = document.getElementById('business-status-bar');
    if (!container) return;

    const status = BusinessManager.status;
    const total = BusinessManager.todayTotal;
    const pendingTotal = OrderManager.getActiveOrdersTotal();

    let statusText = '';
    let statusClass = '';
    let buttonHtml = '';
    let salesHtml = '';

    switch (status) {
        case 'closed':
            statusText = '영업 전';
            statusClass = 'closed';
            buttonHtml = '<button class="btn success" onclick="handleStartBusiness()">영업 시작</button>';
            break;
        case 'open':
            statusText = '영업 중';
            statusClass = 'open';
            salesHtml = `
                <div class="current-sales">
                    <div class="current-sales-label">현재 매출</div>
                    <div class="current-sales-value">${formatPrice(total)}</div>
                </div>
            `;
            buttonHtml = '<button class="btn warning" onclick="handleEndBusiness()">영업 완료</button>';
            break;
        case 'settled':
            statusText = '정산 완료';
            statusClass = 'settled';
            salesHtml = `
                <div class="current-sales">
                    <div class="current-sales-label">오늘 총 매출</div>
                    <div class="current-sales-value">${formatPrice(total)}</div>
                </div>
            `;
            buttonHtml = '<button class="btn primary" onclick="handleRestartBusiness()">다시 시작</button>';
            break;
    }

    container.innerHTML = `
        <div class="business-status-info">
            <div class="business-status-label">영업 상태</div>
            <div class="business-status-value ${statusClass}">${statusText}</div>
        </div>
        ${salesHtml}
        ${buttonHtml}
    `;
}

// 영업 시작 핸들러
async function handleStartBusiness() {
    console.log('영업 시작 핸들러 호출');
    try {
        await BusinessManager.startBusiness();
        console.log('영업 상태:', BusinessManager.status);
        renderBusinessStatus();
        renderSeatsView();
        console.log('영업 시작 완료');
    } catch (error) {
        console.error('영업 시작 오류:', error);
        showToast('오류 발생: ' + error.message);
    }
}

// 영업 완료 핸들러
async function handleEndBusiness() {
    const success = await BusinessManager.endBusiness();
    if (success) {
        renderBusinessStatus();
        renderSeatsView();
    }
}

// 영업 재시작 핸들러
async function handleRestartBusiness() {
    await BusinessManager.restartBusiness();
    renderBusinessStatus();
    renderSeatsView();
}

// 현재 선택된 좌석
let currentSeat = null;

// 주문 모달 열기
function openOrderModal(seat) {
    // 영업 중이 아니면 경고
    if (BusinessManager.status !== 'open') {
        showToast('영업을 먼저 시작해주세요.');
        return;
    }

    currentSeat = seat;
    OrderManager.currentSeatId = seat.id;

    document.getElementById('order-seat-name').textContent = seat.name;
    renderOrderMenuList();
    renderCurrentOrderItems();
    updateOrderTotal();

    document.getElementById('order-modal').classList.add('active');
}

// 주문 메뉴 목록 렌더링
function renderOrderMenuList() {
    const container = document.getElementById('order-menu-list');
    container.innerHTML = '';

    const availableMenus = MenuManager.getAvailableMenus();

    if (availableMenus.length === 0) {
        container.innerHTML = '<p class="empty-msg">사용 가능한 메뉴가 없습니다.</p>';
        return;
    }

    availableMenus.forEach(menu => {
        const order = OrderManager.getOrderBySeat(currentSeat.id);
        const orderItem = order?.items.find(item => item.menuId === menu.id);
        const quantity = orderItem?.quantity || 0;

        const itemEl = document.createElement('div');
        itemEl.className = 'order-menu-item';
        itemEl.innerHTML = `
            <div class="menu-info">
                <div class="menu-name">${escapeHtml(menu.name)}</div>
                <div class="menu-price">${formatPrice(menu.price)}</div>
            </div>
            <div class="quantity-control">
                <button class="qty-btn" onclick="handleQuantityChange('${menu.id}', -1)">-</button>
                <span class="quantity">${quantity}</span>
                <button class="qty-btn" onclick="handleQuantityChange('${menu.id}', 1)">+</button>
            </div>
        `;
        container.appendChild(itemEl);
    });
}

// 현재 주문 내역 렌더링
function renderCurrentOrderItems() {
    const container = document.getElementById('current-order-items');
    const order = OrderManager.getOrderBySeat(currentSeat.id);

    if (!order || order.items.length === 0) {
        container.innerHTML = '<p style="color: var(--dark-gray); font-size: 0.9rem;">주문 내역이 없습니다.</p>';
        return;
    }

    container.innerHTML = order.items.map(item => `
        <div class="current-order-item">
            <span>${escapeHtml(item.name)} x ${item.quantity}</span>
            <span>${formatPrice(item.price * item.quantity)}</span>
        </div>
    `).join('');
}

// 총액 업데이트
function updateOrderTotal() {
    const order = OrderManager.getOrderBySeat(currentSeat.id);
    const total = order?.totalPrice || 0;
    document.getElementById('order-total-price').textContent = formatPrice(total);
}

// 수량 변경 처리
async function handleQuantityChange(menuId, delta) {
    const menu = MenuManager.getMenuById(menuId);
    if (!menu) return;

    const order = OrderManager.getOrderBySeat(currentSeat.id);
    const orderItem = order?.items.find(item => item.menuId === menuId);
    const currentQty = orderItem?.quantity || 0;
    const newQty = currentQty + delta;

    if (newQty < 0) return;

    if (newQty === 0 && currentQty > 0) {
        await OrderManager.updateItemQuantity(currentSeat.id, menuId, 0);
    } else if (delta > 0 && currentQty === 0) {
        await OrderManager.addItemToOrder(currentSeat.id, menu, 1);
    } else {
        await OrderManager.updateItemQuantity(currentSeat.id, menuId, newQty);
    }

    renderOrderMenuList();
    renderCurrentOrderItems();
    updateOrderTotal();
    renderSeatsView();
}

// 결제 버튼 클릭
function handlePayClick() {
    const order = OrderManager.getOrderBySeat(currentSeat.id);

    if (!order) {
        showToast('주문 내역이 없습니다.');
        return;
    }

    // 주문 내역이 0개이거나 0원인 경우 주문 삭제 처리
    if (order.items.length === 0 || order.totalPrice === 0) {
        if (confirm('주문 내역이 없습니다. 해당 좌석의 주문 정보를 초기화하시겠습니까?')) {
            // 주문 객체 삭제
            delete OrderManager.orders[currentSeat.id];
            OrderManager.saveToLocal();

            // Firebase 삭제
            if (isFirebaseConfigured()) {
                const docId = `${order.date}_${currentSeat.id}`;
                db.collection('orders').doc(docId).delete().catch(e => console.error(e));
            }

            closeOrderModal();
            renderSeatsView();
            showToast('주문 정보가 초기화되었습니다.');
        }
        return;
    }

    // 결제 확인 모달 열기
    document.getElementById('payment-summary').innerHTML = order.items.map(item => `
        <div class="current-order-item">
            <span>${escapeHtml(item.name)} x ${item.quantity}</span>
            <span>${formatPrice(item.price * item.quantity)}</span>
        </div>
    `).join('');

    document.getElementById('payment-total-price').textContent = formatPrice(order.totalPrice);
    document.getElementById('payment-modal').classList.add('active');
}

// 결제 확정
async function handleConfirmPayment() {
    const success = await OrderManager.completePayment(currentSeat.id);

    if (success) {
        showToast('결제가 완료되었습니다!');
        closePaymentModal();
        closeOrderModal();
        renderSeatsView();
    } else {
        showToast('결제 처리 중 오류가 발생했습니다.');
    }
}

// 모달 닫기
function closeOrderModal() {
    document.getElementById('order-modal').classList.remove('active');
    currentSeat = null;
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('active');
}

// 주문 취소
async function handleCancelOrder() {
    const order = OrderManager.getOrderBySeat(currentSeat.id);
    if (!order) {
        showToast('취소할 주문 내역이 없습니다.');
        return;
    }

    if (confirm('현재 좌석의 모든 주문 내역을 삭제하시겠습니까?')) {
        // 주문 객체 삭제
        delete OrderManager.orders[currentSeat.id];
        OrderManager.saveToLocal();

        // Firebase 삭제
        if (isFirebaseConfigured()) {
            const docId = `${order.date}_${currentSeat.id}`;
            db.collection('orders').doc(docId).delete().catch(e => console.error(e));
        }

        closeOrderModal();
        renderSeatsView();
        showToast('주문이 취소되었습니다.');
    }
}

// 주문 이벤트 초기화
function initOrderEvents() {
    document.getElementById('close-order-modal').onclick = closeOrderModal;
    document.getElementById('pay-btn').onclick = handlePayClick;
    document.getElementById('cancel-order-btn').onclick = handleCancelOrder;
    document.getElementById('cancel-payment-btn').onclick = closePaymentModal;
    document.getElementById('confirm-payment-btn').onclick = handleConfirmPayment;

    // 모달 외부 클릭 시 닫기
    document.getElementById('order-modal').onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            closeOrderModal();
        }
    };

    document.getElementById('payment-modal').onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            closePaymentModal();
        }
    };
}
