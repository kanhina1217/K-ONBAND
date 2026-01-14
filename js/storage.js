/* ===========================================
   ストレージ管理モジュール
=========================================== */

const Storage = {
    KEYS: {
        MEMBERS: 'bandApp_members',
        BANDS: 'bandApp_bands',
        CURRENT_BANDS: 'bandApp_currentBands',
        BAND_COUNT: 'bandApp_bandCount'
    },

    // メンバーデータを保存
    saveMembers(members) {
        localStorage.setItem(this.KEYS.MEMBERS, JSON.stringify(members));
    },

    // メンバーデータを読み込み
    loadMembers() {
        const data = localStorage.getItem(this.KEYS.MEMBERS);
        return data ? JSON.parse(data) : [];
    },

    // バンド編成データを保存
    saveBands(bands) {
        localStorage.setItem(this.KEYS.BANDS, JSON.stringify(bands));
    },

    // バンド編成データを読み込み
    loadBands() {
        const data = localStorage.getItem(this.KEYS.BANDS);
        return data ? JSON.parse(data) : [];
    },

    // 現在のバンドデータを保存
    saveCurrentBands(currentBands) {
        localStorage.setItem(this.KEYS.CURRENT_BANDS, JSON.stringify(currentBands));
    },

    // 現在のバンドデータを読み込み
    loadCurrentBands() {
        const data = localStorage.getItem(this.KEYS.CURRENT_BANDS);
        return data ? JSON.parse(data) : [];
    },

    // バンド数を保存
    saveBandCount(count) {
        localStorage.setItem(this.KEYS.BAND_COUNT, count.toString());
    },

    // バンド数を読み込み
    loadBandCount() {
        const data = localStorage.getItem(this.KEYS.BAND_COUNT);
        return data ? parseInt(data, 10) : 3;
    },

    // 全データをエクスポート
    exportData() {
        const data = {
            members: this.loadMembers(),
            bands: this.loadBands(),
            currentBands: this.loadCurrentBands(),
            bandCount: this.loadBandCount(),
            settings: JSON.parse(localStorage.getItem('konband_settings') || '{}'),
            theme: localStorage.getItem('konband_theme') || 'dark',
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `band-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // データをインポート
    importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);

            // インポート時は全データを一度クリアするのが安全（不整合防止）
            // this.clearAll(); // ただし、テーマなどは残したいかもしれないので個別上書きにする

            if (data.members) {
                this.saveMembers(data.members);
            }
            if (data.bands) {
                this.saveBands(data.bands);
                if (!data.bandCount) {
                    this.saveBandCount(data.bands.length);
                }
            }
            if (data.currentBands) {
                this.saveCurrentBands(data.currentBands);
            }
            if (data.bandCount) {
                this.saveBandCount(data.bandCount);
            }
            if (data.settings) {
                localStorage.setItem('konband_settings', JSON.stringify(data.settings));
            }
            if (data.theme) {
                localStorage.setItem('konband_theme', data.theme);
            }

            return true;
        } catch (e) {
            console.error('Import error:', e);
            return false;
        }
    },

    // 全データをクリア
    clearAll() {
        localStorage.removeItem(this.KEYS.MEMBERS);
        localStorage.removeItem(this.KEYS.BANDS);
        localStorage.removeItem(this.KEYS.CURRENT_BANDS);
        localStorage.removeItem(this.KEYS.BAND_COUNT);
    }
};
