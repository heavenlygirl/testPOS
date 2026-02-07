// Firebase 설정
// TODO: 아래 설정을 Firebase Console에서 가져온 값으로 교체하세요
// https://console.firebase.google.com > 프로젝트 설정 > 웹 앱 추가

const firebaseConfig = {
    apiKey: "AIzaSyArDvLW_oRXtKksB6CMmZd2XIylAreIdpM",
    authDomain: "nabipos.firebaseapp.com",
    projectId: "nabipos",
    storageBucket: "nabipos.firebasestorage.app",
    messagingSenderId: "181590029939",
    appId: "1:181590029939:web:b41a3eae54295b7aaf5c06",
    measurementId: "G-MGBE0MDGWJ"
};

// Firebase 초기화
let db = null;
let isFirebaseReady = false;

function initFirebase() {
    try {
        // 이미 Firebase가 설정되어 있는지 확인
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn('Firebase 설정이 필요합니다. firebase-config.js 파일을 수정해주세요.');
            // 로컬 스토리지 폴백 모드로 동작
            isFirebaseReady = false;
            return false;
        }

        console.log('Firebase 초기화 시작...', firebaseConfig.projectId);
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        isFirebaseReady = true;
        console.log('Firebase 초기화 완료 - Firestore 연결됨');
        return true;
    } catch (error) {
        console.error('Firebase 초기화 실패:', error);
        alert('Firebase 초기화 실패: ' + error.message);
        isFirebaseReady = false;
        return false;
    }
}

// Firestore 참조 가져오기
function getFirestore() {
    return db;
}

// Firebase 준비 상태 확인
function isFirebaseConfigured() {
    return isFirebaseReady;
}

// 로컬 스토리지 폴백 (Firebase 미설정 시)
const LocalStorage = {
    get(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(key);
    }
};

// DB 초기화 (모든 데이터 삭제)
async function resetAllData() {
    if (!confirm('모든 데이터를 초기화하시겠습니까?\n메뉴, 좌석, 주문, 매출 데이터가 모두 삭제됩니다.')) {
        return false;
    }

    console.log('DB 초기화 시작...');

    // 로컬 스토리지 초기화
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('menus') ||
            key.startsWith('seats') ||
            key.startsWith('orders') ||
            key.startsWith('business') ||
            key.startsWith('dailySales'))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('로컬 스토리지 초기화 완료');

    // Firebase 초기화 (설정된 경우)
    if (isFirebaseConfigured()) {
        try {
            // 메뉴 삭제
            const menusSnapshot = await db.collection('menus').get();
            const menuDeletes = menusSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(menuDeletes);
            console.log('Firebase 메뉴 삭제 완료');

            // 좌석 설정 삭제
            const seatsSnapshot = await db.collection('seatConfigs').get();
            const seatDeletes = seatsSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(seatDeletes);
            console.log('Firebase 좌석 삭제 완료');

            // 주문 삭제
            const ordersSnapshot = await db.collection('orders').get();
            const orderDeletes = ordersSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(orderDeletes);
            console.log('Firebase 주문 삭제 완료');

            // 영업 상태 삭제
            const statusSnapshot = await db.collection('businessStatus').get();
            const statusDeletes = statusSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(statusDeletes);
            console.log('Firebase 영업상태 삭제 완료');

            // 일별 매출 삭제
            const salesSnapshot = await db.collection('dailySales').get();
            const salesDeletes = salesSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(salesDeletes);
            console.log('Firebase 매출 삭제 완료');

            // 결제 내역 삭제
            const paymentSnapshot = await db.collection('paymentHistory').get();
            const paymentDeletes = paymentSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(paymentDeletes);
            console.log('Firebase 결제내역 삭제 완료');

        } catch (error) {
            console.error('Firebase 초기화 실패:', error);
            alert('Firebase 데이터 초기화 중 오류가 발생했습니다.\n' + error.message);
            return false;
        }
    }

    console.log('DB 초기화 완료');
    alert('모든 데이터가 초기화되었습니다.\n페이지를 새로고침합니다.');
    location.reload();
    return true;
}
// 좌석 정보 삭제
async function resetSeatsData() {
    if (!confirm('좌석 정보를 삭제하시겠습니까?\n모든 좌석 배치가 초기화됩니다.')) return;

    // 로컬 삭제
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('seats')) {
            localStorage.removeItem(key);
        }
    }

    // Firebase 삭제
    if (isFirebaseConfigured()) {
        try {
            const snapshot = await db.collection('seatConfigs').get();
            const deletes = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletes);
        } catch (error) {
            console.error('좌석 삭제 실패:', error);
            alert('좌석 데이터 삭제 중 오류가 발생했습니다.');
            return;
        }
    }

    alert('좌석 정보가 삭제되었습니다.\n페이지를 새로고침합니다.');
    location.reload();
}

// 전체 매출 정보 삭제
async function resetSalesData() {
    if (!confirm('전체 매출 정보를 삭제하시겠습니까?\n지금까지의 모든 판매 기록이 영구적으로 삭제됩니다.')) return;

    // 로컬 삭제
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('dailySales') || key.startsWith('business'))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Firebase 삭제
    if (isFirebaseConfigured()) {
        try {
            // 매출, 영업상태, 결제내역 삭제
            const collections = ['dailySales', 'businessStatus', 'paymentHistory'];
            for (const col of collections) {
                const snapshot = await db.collection(col).get();
                const deletes = snapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deletes);
            }
        } catch (error) {
            console.error('매출 삭제 실패:', error);
            alert('매출 데이터 삭제 중 오류가 발생했습니다.');
            return;
        }
    }

    alert('전체 매출 정보가 삭제되었습니다.\n페이지를 새로고침합니다.');
    location.reload();
}

// 메뉴 정보 삭제
async function resetMenuData() {
    if (!confirm('메뉴 정보를 삭제하시겠습니까?\n등록된 모든 메뉴가 삭제됩니다.')) return;

    // 로컬 삭제
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('menus')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Firebase 삭제
    if (isFirebaseConfigured()) {
        try {
            const snapshot = await db.collection('menus').get();
            const deletes = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletes);
        } catch (error) {
            console.error('메뉴 삭제 실패:', error);
            alert('메뉴 데이터 삭제 중 오류가 발생했습니다.');
            return;
        }
    }

    alert('메뉴 정보가 삭제되었습니다.\n페이지를 새로고침합니다.');
    location.reload();
}
