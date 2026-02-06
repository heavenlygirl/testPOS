// Firebase 설정
// TODO: 아래 설정을 Firebase Console에서 가져온 값으로 교체하세요
// https://console.firebase.google.com > 프로젝트 설정 > 웹 앱 추가

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
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

        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        isFirebaseReady = true;
        console.log('Firebase 초기화 완료');
        return true;
    } catch (error) {
        console.error('Firebase 초기화 실패:', error);
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
