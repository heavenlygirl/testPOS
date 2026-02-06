// 매출 관리 모듈

const SalesManager = {
    salesData: {},     // date -> sales data
    currentMonth: null,

    // 현재 월 설정
    setCurrentMonth(date = new Date()) {
        this.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    },

    // 월별 매출 데이터 불러오기
    async loadMonthlySales(year, month) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

        if (isFirebaseConfigured()) {
            try {
                const snapshot = await db.collection('dailySales')
                    .where('date', '>=', startDate)
                    .where('date', '<=', endDate)
                    .orderBy('date', 'desc')
                    .get();

                this.salesData = {};
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    this.salesData[data.date] = data;
                });
            } catch (error) {
                console.error('매출 데이터 로드 실패:', error);
                this.loadFromLocal(year, month);
            }
        } else {
            this.loadFromLocal(year, month);
        }

        return this.salesData;
    },

    // 로컬에서 데이터 불러오기
    loadFromLocal(year, month) {
        this.salesData = {};
        // 로컬 스토리지에서 해당 월의 데이터 검색
        for (let day = 1; day <= 31; day++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const data = LocalStorage.get(`dailySales_${dateStr}`);
            if (data) {
                this.salesData[dateStr] = data;
            }
        }
    },

    // 일별 매출 저장
    async saveDailySales(payments, totalSales) {
        const today = SeatManager.getTodayDate();

        // 메뉴별 집계
        const itemsSummary = {};
        payments.forEach(payment => {
            payment.items.forEach(item => {
                if (!itemsSummary[item.menuId]) {
                    itemsSummary[item.menuId] = {
                        menuId: item.menuId,
                        name: item.name,
                        quantity: 0,
                        total: 0
                    };
                }
                itemsSummary[item.menuId].quantity += item.quantity;
                itemsSummary[item.menuId].total += item.price * item.quantity;
            });
        });

        const salesData = {
            date: today,
            totalSales: totalSales,
            totalOrders: payments.length,
            items: Object.values(itemsSummary),
            payments: payments.map(p => ({
                time: p.time,
                seatId: p.seatId,
                seatName: SeatManager.getSeatById(p.seatId)?.name || p.seatId,
                amount: p.totalPrice,
                items: p.items
            })),
            settledAt: new Date().toISOString()
        };

        if (isFirebaseConfigured()) {
            try {
                await db.collection('dailySales').doc(today).set(salesData);
            } catch (error) {
                console.error('일별 매출 저장 실패:', error);
            }
        }

        LocalStorage.set(`dailySales_${today}`, salesData);
        this.salesData[today] = salesData;
    },

    // 특정 날짜 매출 가져오기
    async getDailySales(date) {
        if (this.salesData[date]) {
            return this.salesData[date];
        }

        if (isFirebaseConfigured()) {
            try {
                const doc = await db.collection('dailySales').doc(date).get();
                if (doc.exists) {
                    this.salesData[date] = doc.data();
                    return this.salesData[date];
                }
            } catch (error) {
                console.error('매출 데이터 로드 실패:', error);
            }
        }

        const localData = LocalStorage.get(`dailySales_${date}`);
        if (localData) {
            this.salesData[date] = localData;
            return localData;
        }

        return null;
    },

    // 월 총 매출 계산
    getMonthlyTotal() {
        return Object.values(this.salesData).reduce((sum, data) => {
            return sum + (data.totalSales || 0);
        }, 0);
    },

    // 월 총 주문 수
    getMonthlyOrderCount() {
        return Object.values(this.salesData).reduce((sum, data) => {
            return sum + (data.totalOrders || 0);
        }, 0);
    },

    // 일별 매출 삭제
    async deleteDailySales(date) {
        if (isFirebaseConfigured()) {
            try {
                await db.collection('dailySales').doc(date).delete();
            } catch (error) {
                console.error('매출 삭제 실패:', error);
            }
        }

        LocalStorage.remove(`dailySales_${date}`);
        delete this.salesData[date];
    }
};

// 현재 보고 있는 월
let viewMonth = new Date();

// 현재 보고 있는 매출 상세 날짜
let currentSalesDetailDate = null;

// 매출 뷰 렌더링
async function renderSalesView() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth() + 1;

    await SalesManager.loadMonthlySales(year, month);

    renderMonthSelector();
    renderSalesList();
    renderMonthlyTotal();
}

// 월 선택기 렌더링
function renderMonthSelector() {
    const container = document.getElementById('month-selector');
    if (!container) return;

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth() + 1;

    container.innerHTML = `
        <button onclick="changeMonth(-1)">&lt;</button>
        <span>${year}년 ${month}월</span>
        <button onclick="changeMonth(1)">&gt;</button>
    `;
}

// 월 변경
async function changeMonth(delta) {
    viewMonth.setMonth(viewMonth.getMonth() + delta);
    await renderSalesView();
}

// 매출 목록 렌더링
function renderSalesList() {
    const container = document.getElementById('sales-list');
    if (!container) return;

    const today = SeatManager.getTodayDate();
    const salesDates = Object.keys(SalesManager.salesData).sort().reverse();

    if (salesDates.length === 0) {
        container.innerHTML = `
            <div class="no-sales">
                <div class="no-sales-icon">📊</div>
                <p>이 달의 매출 데이터가 없습니다.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = salesDates.map(date => {
        const data = SalesManager.salesData[date];
        const isToday = date === today;
        const dateObj = new Date(date);
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
        const displayDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

        return `
            <div class="sales-item ${isToday ? 'today' : ''}" onclick="openSalesDetail('${date}')">
                <div class="sales-date">
                    ${displayDate}
                    <span class="day-label">${isToday ? '(오늘)' : `(${dayOfWeek})`}</span>
                </div>
                <div class="sales-amount">
                    ${formatPrice(data.totalSales)}
                    <span class="arrow">›</span>
                </div>
            </div>
        `;
    }).join('');
}

// 월 총 매출 렌더링
function renderMonthlyTotal() {
    const container = document.getElementById('monthly-total');
    if (!container) return;

    const total = SalesManager.getMonthlyTotal();
    const orderCount = SalesManager.getMonthlyOrderCount();
    const month = viewMonth.getMonth() + 1;

    container.innerHTML = `
        <div>
            <div class="sales-total-label">${month}월 총 매출 (${orderCount}건)</div>
        </div>
        <div class="sales-total-value">${formatPrice(total)}</div>
    `;
}

// 매출 상세 모달 열기
async function openSalesDetail(date) {
    const data = await SalesManager.getDailySales(date);
    if (!data) {
        showToast('매출 데이터를 불러올 수 없습니다.');
        return;
    }

    currentSalesDetailDate = date;
    const dateObj = new Date(date);
    const displayDate = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;

    // 상세 모달 내용 생성
    const detailContent = document.getElementById('sales-detail-content');
    if (!detailContent) return;

    // 메뉴별 판매 현황
    const itemsHtml = data.items && data.items.length > 0 ? data.items.map(item => `
        <div class="sales-detail-item">
            <span class="item-name">${escapeHtml(item.name)}</span>
            <span class="item-qty">${item.quantity}개</span>
            <span class="item-amount">${formatPrice(item.total)}</span>
        </div>
    `).join('') : '<p class="empty-msg">판매 내역이 없습니다.</p>';

    // 결제 내역
    const paymentsHtml = data.payments && data.payments.length > 0 ? data.payments.map(payment => `
        <div class="payment-history-item">
            <div class="payment-history-header">
                <span class="payment-history-time">${payment.time}</span>
                <span class="payment-history-seat">${escapeHtml(payment.seatName || payment.seatId)}</span>
                <span class="payment-history-amount">${formatPrice(payment.amount)}</span>
            </div>
            <div class="payment-history-items">
                ${payment.items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(', ')}
            </div>
        </div>
    `).join('') : '';

    detailContent.innerHTML = `
        <div class="sales-detail-header">
            <div class="sales-detail-date">${displayDate}</div>
            <div class="sales-detail-total">${formatPrice(data.totalSales)}</div>
        </div>

        <div class="sales-detail-section">
            <h4>메뉴별 판매 현황</h4>
            ${itemsHtml}
        </div>

        ${paymentsHtml ? `
        <div class="sales-detail-section">
            <h4>결제 내역 (${data.totalOrders}건)</h4>
            ${paymentsHtml}
        </div>
        ` : ''}
    `;

    document.getElementById('sales-detail-modal').classList.add('active');
}

// 매출 상세 모달 닫기
function closeSalesDetailModal() {
    document.getElementById('sales-detail-modal').classList.remove('active');
}

// 매출 삭제 처리
async function handleDeleteSales() {
    if (!currentSalesDetailDate) return;

    if (confirm('이 날짜의 매출 데이터를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) {
        await SalesManager.deleteDailySales(currentSalesDetailDate);
        showToast('매출 데이터가 삭제되었습니다.');
        closeSalesDetailModal();
        renderSalesView();
    }
}

// 매출 이벤트 초기화
function initSalesEvents() {
    const closeBtn = document.getElementById('close-sales-detail-modal');
    if (closeBtn) {
        closeBtn.onclick = closeSalesDetailModal;
    }

    const deleteBtn = document.getElementById('delete-sales-btn');
    if (deleteBtn) {
        deleteBtn.onclick = handleDeleteSales;
    }

    const modal = document.getElementById('sales-detail-modal');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target.classList.contains('modal')) {
                closeSalesDetailModal();
            }
        };
    }
}
