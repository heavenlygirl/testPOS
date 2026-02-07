// 메뉴 관리 모듈

const MenuManager = {
    menus: [],

    // 메뉴 목록 불러오기
    async loadMenus() {
        if (isFirebaseConfigured()) {
            try {
                // order 필드가 있으면 order로 정렬, 없으면 createdAt으로 정렬
                const snapshot = await db.collection('menus').get();
                this.menus = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // order 필드로 정렬 (order가 없으면 맨 뒤로)
                this.menus.sort((a, b) => {
                    const orderA = a.order !== undefined ? a.order : 9999;
                    const orderB = b.order !== undefined ? b.order : 9999;
                    return orderA - orderB;
                });
            } catch (error) {
                console.error('메뉴 로드 실패:', error);
                this.menus = LocalStorage.get('menus') || [];
            }
        } else {
            this.menus = LocalStorage.get('menus') || [];
        }
        return this.menus;
    },

    // 메뉴 추가
    async addMenu(menuData) {
        const menu = {
            name: menuData.name,
            price: parseInt(menuData.price),
            category: menuData.category || '',
            available: true,
            createdAt: new Date().toISOString()
        };

        console.log('메뉴 추가 시도:', menu.name, '- Firebase 설정:', isFirebaseConfigured());

        // 가장 마지막 순서 찾기
        const maxOrder = this.menus.reduce((max, m) => Math.max(max, m.order || 0), -1);
        menu.order = maxOrder + 1;

        if (isFirebaseConfigured()) {
            try {
                const docRef = await db.collection('menus').add(menu);
                menu.id = docRef.id;
                console.log('Firebase에 메뉴 저장 성공:', menu.id);
            } catch (error) {
                console.error('Firebase 메뉴 추가 실패:', error);
                showToast('Firebase 저장 실패: ' + error.message);
                menu.id = 'local_' + Date.now();
            }
        } else {
            menu.id = 'local_' + Date.now();
            console.log('로컬 저장 모드:', menu.id);
        }

        this.menus.push(menu);
        this.saveToLocal();
        console.log('메뉴 추가 완료. 총 메뉴 수:', this.menus.length);
        return menu;
    },

    // 메뉴 수정
    async updateMenu(menuId, updates) {
        const index = this.menus.findIndex(m => m.id === menuId);
        if (index === -1) return null;

        const updatedMenu = { ...this.menus[index], ...updates };

        if (isFirebaseConfigured() && !menuId.startsWith('local_')) {
            try {
                await db.collection('menus').doc(menuId).update(updates);
            } catch (error) {
                console.error('메뉴 수정 실패:', error);
            }
        }

        this.menus[index] = updatedMenu;
        this.saveToLocal();
        return updatedMenu;
    },

    // 메뉴 삭제
    async deleteMenu(menuId) {
        const index = this.menus.findIndex(m => m.id === menuId);
        if (index === -1) return false;

        if (isFirebaseConfigured() && !menuId.startsWith('local_')) {
            try {
                await db.collection('menus').doc(menuId).delete();
            } catch (error) {
                console.error('메뉴 삭제 실패:', error);
            }
        }

        this.menus.splice(index, 1);
        this.saveToLocal();
        return true;
    },

    // 메뉴 활성/비활성 토글
    async toggleAvailable(menuId) {
        const menu = this.menus.find(m => m.id === menuId);
        if (!menu) return null;

        return this.updateMenu(menuId, { available: !menu.available });
    },

    // 활성화된 메뉴만 가져오기
    getAvailableMenus() {
        return this.menus.filter(m => m.available);
    },

    // 로컬 스토리지에 저장
    saveToLocal() {
        LocalStorage.set('menus', this.menus);
    },

    // 메뉴 ID로 찾기
    getMenuById(menuId) {
        return this.menus.find(m => m.id === menuId);
    },

    // 메뉴 순서 변경
    async moveMenu(menuId, direction) {
        const index = this.menus.findIndex(m => m.id === menuId);
        if (index === -1) return false;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= this.menus.length) return false;

        // 스왑
        [this.menus[index], this.menus[newIndex]] = [this.menus[newIndex], this.menus[index]];

        // 순서 저장 (Firebase에 순서 정보 업데이트)
        await this.saveMenuOrder();
        return true;
    },

    // 메뉴 순서 저장
    async saveMenuOrder() {
        this.saveToLocal();

        if (isFirebaseConfigured()) {
            try {
                // 각 메뉴에 순서(order) 필드 업데이트
                const batch = db.batch();
                this.menus.forEach((menu, index) => {
                    if (!menu.id.startsWith('local_')) {
                        const menuRef = db.collection('menus').doc(menu.id);
                        batch.update(menuRef, { order: index });
                    }
                });
                await batch.commit();
                console.log('메뉴 순서 Firebase 저장 완료');
            } catch (error) {
                console.error('메뉴 순서 저장 실패:', error);
            }
        }
    }
};

// 메뉴 UI 렌더링
function renderMenuList() {
    const container = document.getElementById('menu-list');
    container.innerHTML = '';

    if (MenuManager.menus.length === 0) {
        container.innerHTML = '<p class="empty-msg">등록된 메뉴가 없습니다.</p>';
        return;
    }

    MenuManager.menus.forEach((menu, index) => {
        const item = document.createElement('div');
        item.className = `menu-item ${menu.available ? '' : 'disabled'}`;
        item.innerHTML = `
            <div class="menu-order-btns">
                <button class="order-btn" data-dir="up" ${index === 0 ? 'disabled' : ''}>▲</button>
                <button class="order-btn" data-dir="down" ${index === MenuManager.menus.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
            <div class="menu-item-info" style="flex: 1;">
                <h3>${escapeHtml(menu.name)}</h3>
                <span class="category">${escapeHtml(menu.category || '미분류')}</span>
            </div>
            <div class="menu-item-price">${formatPrice(menu.price)}</div>
        `;

        // 순서 변경 버튼 이벤트
        item.querySelectorAll('.order-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const dir = btn.dataset.dir;
                await MenuManager.moveMenu(menu.id, dir);
                renderMenuList();
            };
        });

        // 메뉴 정보 클릭 시 수정 모달
        item.querySelector('.menu-item-info').onclick = () => openMenuModal(menu);
        item.querySelector('.menu-item-price').onclick = () => openMenuModal(menu);

        container.appendChild(item);
    });
}

// 메뉴 모달 열기
function openMenuModal(menu = null) {
    const modal = document.getElementById('menu-modal');
    const title = document.getElementById('menu-modal-title');
    const form = document.getElementById('menu-form');
    const deleteBtn = document.getElementById('delete-menu-btn');

    if (menu) {
        title.textContent = '메뉴 수정';
        document.getElementById('menu-id').value = menu.id;
        document.getElementById('menu-name').value = menu.name;
        document.getElementById('menu-price').value = menu.price;
        document.getElementById('menu-category').value = menu.category || '';
        deleteBtn.style.display = 'block';
    } else {
        title.textContent = '메뉴 추가';
        form.reset();
        document.getElementById('menu-id').value = '';
        deleteBtn.style.display = 'none';
    }

    modal.classList.add('active');
}

// 메뉴 폼 제출
async function handleMenuSubmit(e) {
    if (e) e.preventDefault();
    console.log('메뉴 폼 제출 시작');

    try {
        const menuId = document.getElementById('menu-id').value;
        const menuData = {
            name: document.getElementById('menu-name').value.trim(),
            price: document.getElementById('menu-price').value,
            category: document.getElementById('menu-category').value.trim()
        };

        console.log('메뉴 데이터:', menuData);

        if (!menuData.name || !menuData.price) {
            showToast('메뉴 이름과 가격을 입력해주세요.');
            return;
        }

        if (menuId) {
            await MenuManager.updateMenu(menuId, menuData);
            showToast('메뉴가 수정되었습니다.');
        } else {
            await MenuManager.addMenu(menuData);
            showToast('메뉴가 추가되었습니다.');
        }

        closeMenuModal();
        renderMenuList();
        console.log('메뉴 폼 제출 완료');
    } catch (error) {
        console.error('메뉴 폼 제출 오류:', error);
        showToast('오류 발생: ' + error.message);
    }
}

// 메뉴 삭제
async function handleMenuDelete() {
    const menuId = document.getElementById('menu-id').value;
    if (!menuId) return;

    if (confirm('이 메뉴를 삭제하시겠습니까?')) {
        await MenuManager.deleteMenu(menuId);
        showToast('메뉴가 삭제되었습니다.');
        closeMenuModal();
        renderMenuList();
    }
}

// 메뉴 모달 닫기
function closeMenuModal() {
    document.getElementById('menu-modal').classList.remove('active');
}

// 메뉴 이벤트 초기화
function initMenuEvents() {
    console.log('메뉴 이벤트 초기화');
    document.getElementById('add-menu-btn').onclick = () => openMenuModal();
    document.getElementById('close-menu-modal').onclick = closeMenuModal;
    document.getElementById('save-menu-btn').onclick = handleMenuSubmit;
    document.getElementById('delete-menu-btn').onclick = handleMenuDelete;
    console.log('메뉴 저장 버튼 onclick 등록 완료');

    // 모달 외부 클릭 시 닫기
    document.getElementById('menu-modal').onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            closeMenuModal();
        }
    };
}
