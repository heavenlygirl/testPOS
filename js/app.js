// 메인 앱 로직

// 유틸리티 함수
function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR').format(price) + '원';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// 날짜 표시
function updateDateDisplay() {
    const today = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    document.getElementById('today-date').textContent = today.toLocaleDateString('ko-KR', options);
}

// 뷰 전환
function switchView(viewId) {
    // 모든 뷰 숨기기
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // 선택된 뷰 표시
    document.getElementById(viewId).classList.add('active');

    // 네비게이션 버튼 상태 업데이트
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewId) {
            btn.classList.add('active');
        }
    });

    // 헤더 타이틀 업데이트
    const titles = {
        'seats-view': '좌석',
        'sales-view': '매출',
        'menu-view': '메뉴설정',
        'seat-config-view': '좌석설정'
    };
    document.getElementById('header-title').textContent = titles[viewId] || '좌석';

    // 뷰별 렌더링
    if (viewId === 'seats-view') {
        renderSeatsView();
        renderBusinessStatus();
    } else if (viewId === 'sales-view') {
        renderSalesView();
    } else if (viewId === 'menu-view') {
        renderMenuList();
    } else if (viewId === 'seat-config-view') {
        renderSeatConfigView();
    }
}

// 네비게이션 이벤트 초기화
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            const viewId = btn.dataset.view;
            if (viewId) {
                switchView(viewId);
            }
        };
    });
}

// 앱 초기화
async function initApp() {
    console.log('POS 시스템 초기화 중...');

    // 날짜 표시
    updateDateDisplay();

    // Firebase 초기화
    initFirebase();

    // 네비게이션 초기화
    initNavigation();

    // 각 모듈 이벤트 초기화
    initMenuEvents();
    initSeatEvents();
    initOrderEvents();
    initSalesEvents();

    // 데이터 로드
    await Promise.all([
        MenuManager.loadMenus(),
        SeatManager.loadSeats(),
        OrderManager.loadOrders(),
        BusinessManager.loadStatus()
    ]);

    // 매출 월 초기화
    viewMonth = new Date();

    // 초기 뷰 렌더링
    renderBusinessStatus();
    renderSeatsView();

    console.log('POS 시스템 초기화 완료');

    // Firebase 미설정 경고
    if (!isFirebaseConfigured()) {
        showToast('Firebase 미설정: 로컬 저장 모드');
    }
}

// Service Worker 등록
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker 등록 성공:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker 등록 실패:', error);
            });
    });
}

// 앱 시작
document.addEventListener('DOMContentLoaded', initApp);
