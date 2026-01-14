/* ===========================================
   バンド変えアプリ - メインアプリケーション
   ドラッグ＆ドロップ対応版
=========================================== */

// パート定義
const PARTS = ['Vo', 'BaGt', 'LeGt', 'Ba', 'Dr', 'Key'];
const PART_NAMES = {
    'Vo': 'ボーカル',
    'BaGt': 'バッキングギター',
    'LeGt': 'リードギター',
    'Ba': 'ベース',
    'Dr': 'ドラム',
    'Key': 'キーボード'
};

// アプリケーション状態
let state = {
    members: [],
    bands: [],
    currentBands: [],
    bandCount: 3,
    editingMemberId: null,
    currentFilter: 'all',
    draggedMemberId: null,
    allowConcurrent: true, // 兼任許可フラグ
    concurrentMinLevel: 5, // 兼任に必要な最小レベル
    maxAssignments: 2, // 兼任上限
    minCollisionThreshold: 3 // 過去の共演表示の閾値 (3人以上)
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // テーマ初期化
    const savedTheme = localStorage.getItem('konband_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.textContent = '🌙';
    }

    loadState();
    setupEventListeners();
    render();
});

// 状態を読み込み
function loadState() {
    state.members = Storage.loadMembers();
    state.bands = Storage.loadBands();
    state.currentBands = Storage.loadCurrentBands();
    state.bandCount = Storage.loadBandCount();

    // 設定の読み込み
    const savedSettings = localStorage.getItem('konband_settings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            state.allowConcurrent = parsed.allowConcurrent ?? true;
            state.concurrentMinLevel = parsed.concurrentMinLevel ?? 5;
            state.maxAssignments = parsed.maxAssignments ?? 2;
            state.minCollisionThreshold = parsed.minCollisionThreshold ?? 3;
        } catch (e) {
            console.error('Settings parse error', e);
        }
    } else {
        // 旧設定からの移行用（互換性）
        const oldMax = localStorage.getItem('konband_maxAssignments');
        if (oldMax) state.maxAssignments = parseInt(oldMax);
    }

    // 以前のデータとの互換性：色や絵文字がない場合に割り当てる
    let changed = false;
    state.currentBands.forEach((band, index) => {
        if (!band.color) {
            band.color = COLOR_PALETTE[index % COLOR_PALETTE.length];
            changed = true;
        }
        if (!band.emoji) {
            band.emoji = EMOJI_PALETTE[index % EMOJI_PALETTE.length];
            changed = true;
        }
    });
    if (changed) saveState();

    // バンド数に合わせてバンドを初期化
    ensureBandsExist();
}

// バンドが存在することを確認
function ensureBandsExist() {
    while (state.bands.length < state.bandCount) {
        state.bands.push({
            id: generateId(),
            slots: PARTS.reduce((acc, part) => ({ ...acc, [part]: null }), {})
        });
    }
    if (state.bands.length > state.bandCount) {
        state.bands = state.bands.slice(0, state.bandCount);
    }
}

// IDを生成
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// イベントリスナーをセットアップ
function setupEventListeners() {
    // メンバー追加ボタン
    document.getElementById('addMemberBtn').addEventListener('click', () => {
        state.editingMemberId = null;
        openMemberModal();
    });

    // モーダルを閉じる
    document.getElementById('closeModal').addEventListener('click', closeMemberModal);
    document.getElementById('memberModal').addEventListener('click', (e) => {
        if (e.target.id === 'memberModal') closeMemberModal();
    });

    // メンバーフォーム送信
    document.getElementById('memberForm').addEventListener('submit', handleMemberSubmit);

    // メンバー削除
    document.getElementById('deleteMember').addEventListener('click', handleMemberDelete);

    // スプレッドシートインポート
    document.getElementById('toggleImportHelp').addEventListener('click', () => {
        document.getElementById('importHelp').classList.toggle('hidden');
    });
    document.getElementById('parseSpreadsheet').addEventListener('click', parseSpreadsheet);

    // バンド数調整
    document.getElementById('increaseBands').addEventListener('click', () => changeBandCount(1));
    document.getElementById('decreaseBands').addEventListener('click', () => changeBandCount(-1));

    // 現在のバンド追加
    document.getElementById('addCurrentBandBtn').addEventListener('click', addCurrentBand);

    // エクスポート/インポート
    document.getElementById('exportBtn').addEventListener('click', () => Storage.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', handleFileImport);

    // 全データ削除
    const resetBtn = document.getElementById('resetAllBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('本当に全てのデータを削除しますか？この操作は取り消せません。')) {
                Storage.clearAll();
                location.reload();
            }
        });
    }

    // フィルタータブ
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.currentFilter = tab.dataset.filter;
            render();
        });
    });

    // 設定モーダル
    const settingsModal = document.getElementById('settingsModal');
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettings = document.getElementById('closeSettingsModal');
    const saveSettings = document.getElementById('saveSettingsBtn');

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            document.getElementById('settingAllowConcurrent').checked = state.allowConcurrent;
            document.getElementById('settingMinLevel').value = state.concurrentMinLevel;
            document.getElementById('settingMaxAssignments').value = state.maxAssignments;
            document.getElementById('settingMinCollisionThreshold').value = state.minCollisionThreshold;
            settingsModal.classList.remove('hidden');
        });

        closeSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });

        saveSettings.addEventListener('click', () => {
            state.allowConcurrent = document.getElementById('settingAllowConcurrent').checked;
            state.concurrentMinLevel = parseInt(document.getElementById('settingMinLevel').value);
            let max = parseInt(document.getElementById('settingMaxAssignments').value);
            if (max < 2) max = 2;
            if (max > 10) max = 10;
            state.maxAssignments = max;

            let threshold = parseInt(document.getElementById('settingMinCollisionThreshold').value);
            if (threshold < 2) threshold = 2;
            state.minCollisionThreshold = threshold;

            localStorage.setItem('konband_settings', JSON.stringify({
                allowConcurrent: state.allowConcurrent,
                concurrentMinLevel: state.concurrentMinLevel,
                maxAssignments: state.maxAssignments,
                minCollisionThreshold: state.minCollisionThreshold
            }));

            settingsModal.classList.add('hidden');
            render();
        });
    }


    // テーマ切り替え
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            themeBtn.textContent = isLight ? '🌙' : '☀️';
            localStorage.setItem('konband_theme', isLight ? 'light' : 'dark');
        });
    }
}

// スプレッドシートをパース
function parseSpreadsheet() {
    const input = document.getElementById('spreadsheetInput').value.trim();
    if (!input) return;

    const lines = input.split('\n');
    let addedCount = 0;

    lines.forEach((line, index) => {
        const cols = line.split('\t').map(c => c.trim());

        // ヘッダー行をスキップ
        if (index === 0 && (cols[0].toLowerCase() === '名前' || cols[0].toLowerCase() === 'name')) {
            return;
        }

        if (cols.length < 2) return;

        const name = cols[0];
        if (!name) return;

        // 既存メンバーをチェック
        if (state.members.some(m => m.name === name)) {
            console.log(`Skipped duplicate: ${name}`);
            return;
        }

        const skills = {};
        PARTS.forEach((part, i) => {
            const val = cols[i + 1];
            if (val && val !== '-' && val !== '') {
                const num = parseInt(val, 10);
                if (num >= 1 && num <= 5) {
                    skills[part] = num;
                }
            }
        });

        // メインパートを取得（最後の列）
        let mainPart = cols[7] || '';
        // パート名を正規化
        mainPart = normalizePartName(mainPart);

        // メインパートが指定されていない場合、最高スキルのパートを選択
        if (!mainPart || !PARTS.includes(mainPart)) {
            const maxSkill = Math.max(...Object.values(skills));
            mainPart = Object.keys(skills).find(p => skills[p] === maxSkill) || '';
        }

        const member = {
            id: generateId(),
            name,
            skills,
            mainPart
        };

        state.members.push(member);
        addedCount++;
    });

    if (addedCount > 0) {
        saveState();
        render();
        document.getElementById('spreadsheetInput').value = '';
        alert(`${addedCount}人のメンバーを追加しました`);
    } else {
        alert('追加できるメンバーがありませんでした');
    }
}

// パート名を正規化
function normalizePartName(name) {
    const n = name.toLowerCase().trim();
    const mapping = {
        'vo': 'Vo', 'vocal': 'Vo', 'ボーカル': 'Vo',
        'bagt': 'BaGt', 'バッキングギター': 'BaGt', 'bg': 'BaGt',
        'legt': 'LeGt', 'リードギター': 'LeGt', 'lg': 'LeGt', 'lead': 'LeGt',
        'ba': 'Ba', 'bass': 'Ba', 'ベース': 'Ba',
        'dr': 'Dr', 'drum': 'Dr', 'drums': 'Dr', 'ドラム': 'Dr',
        'key': 'Key', 'keyboard': 'Key', 'キーボード': 'Key', 'kb': 'Key'
    };
    return mapping[n] || name;
}

// バンド数を変更
function changeBandCount(delta) {
    const newCount = Math.max(1, Math.min(10, state.bandCount + delta));
    if (newCount !== state.bandCount) {
        state.bandCount = newCount;
        ensureBandsExist();
        saveState();
        render();
    }
}

// カラーパレットと絵文字パレット
const COLOR_PALETTE = ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#fab1a0', '#fd79a8', '#fdcb6e', '#00cec9', '#d63031'];
const EMOJI_PALETTE = ['🎸', '🎹', '🥁', '🎤', '🎷', '🎺', '🎻', '🎨', '🚀', '🌟', '🍀', '🔥', '💧', '🌈'];

// 現在のバンドを追加
function addCurrentBand() {
    const randomColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    const randomEmoji = EMOJI_PALETTE[Math.floor(Math.random() * EMOJI_PALETTE.length)];

    state.currentBands.push({
        id: generateId(),
        name: `現バンド${state.currentBands.length + 1}`,
        color: randomColor,
        emoji: randomEmoji,
        slots: PARTS.reduce((acc, part) => ({ ...acc, [part]: null }), {})
    });
    saveState();
    render();
}

// 現在のバンドの色/絵文字変更
function handleCurrentBandColorEmojiChange(bandId, field, value) {
    const band = state.currentBands.find(b => b.id === bandId);
    if (band) {
        band[field] = value;
        saveState();
        render(); // 再描画して反映
    }
}

// 現在のバンドを削除
function removeCurrentBand(bandId) {
    state.currentBands = state.currentBands.filter(b => b.id !== bandId);
    saveState();
    render();
}

// メンバーモーダルを開く
function openMemberModal(memberId = null) {
    const modal = document.getElementById('memberModal');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteMember');

    if (memberId) {
        const member = state.members.find(m => m.id === memberId);
        if (!member) return;

        state.editingMemberId = memberId;
        title.textContent = 'メンバー編集';
        deleteBtn.classList.remove('hidden');

        document.getElementById('memberName').value = member.name;
        PARTS.forEach(part => {
            const input = document.getElementById(`skill${part}`);
            input.value = member.skills[part] || '';
        });
        document.getElementById('mainPart').value = member.mainPart || '';
    } else {
        state.editingMemberId = null;
        title.textContent = 'メンバー追加';
        deleteBtn.classList.add('hidden');
        document.getElementById('memberForm').reset();
    }

    modal.classList.remove('hidden');
}

// メンバーモーダルを閉じる
function closeMemberModal() {
    document.getElementById('memberModal').classList.add('hidden');
    state.editingMemberId = null;
}

// メンバーフォーム送信処理
function handleMemberSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('memberName').value.trim();
    if (!name) return;

    const skills = {};
    PARTS.forEach(part => {
        const val = document.getElementById(`skill${part}`).value;
        if (val) {
            const num = parseInt(val, 10);
            if (num >= 1 && num <= 5) {
                skills[part] = num;
            }
        }
    });

    const mainPart = document.getElementById('mainPart').value;

    if (state.editingMemberId) {
        // 編集
        const index = state.members.findIndex(m => m.id === state.editingMemberId);
        if (index >= 0) {
            state.members[index] = {
                ...state.members[index],
                name,
                skills,
                mainPart
            };
        }
    } else {
        // 新規追加
        state.members.push({
            id: generateId(),
            name,
            skills,
            mainPart
        });
    }

    saveState();
    closeMemberModal();
    render();
}

// メンバー削除処理
function handleMemberDelete() {
    if (!state.editingMemberId) return;

    if (confirm('このメンバーを削除しますか？')) {
        // バンドからも削除
        state.bands.forEach(band => {
            PARTS.forEach(part => {
                if (band.slots[part] === state.editingMemberId) {
                    band.slots[part] = null;
                }
            });
        });
        state.currentBands.forEach(band => {
            PARTS.forEach(part => {
                if (band.slots[part] === state.editingMemberId) {
                    band.slots[part] = null;
                }
            });
        });

        state.members = state.members.filter(m => m.id !== state.editingMemberId);
        saveState();
        closeMemberModal();
        render();
    }
}

// ファイルインポート処理
function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        if (Storage.importData(event.target.result)) {
            loadState();
            render();
            alert('データをインポートしました');
        } else {
            alert('インポートに失敗しました');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// スロットからメンバーを削除（アニメーション付き）
function removeFromSlot(bandId, part, isCurrentBand = false) {
    // 削除対象のDOM要素を探す
    // バンドリストの中の特定のスロットを探すためのIDがないため、DOM構造から探す必要があるが、
    // 確実性を高めるためにスロットの親コンテナにIDがあると良い。
    // 今回は親要素のクラスとdata属性などに依存せず、再レンダリング前の要素にアクセスする。
    // ただし、render()関数でIDを振っていないため、bandIdとpartから要素を特定するのは少し難しい。
    // 簡易的に、レンダリング時にIDを振るように `renderBands` も変更するのがベストだが、
    // ここではDOMトラバーサルを使って対象を見つけるか、単純に即時削除する。

    // UIアニメーションのために一旦 `executeRemoval` を直接呼ぶだけでなく、
    // 削除対象のメンバーIDを保持しておき、レンダリング後に強調表示する。

    const bands = isCurrentBand ? state.currentBands : state.bands;
    const band = bands.find(b => b.id === bandId);
    const memberId = band ? band.slots[part] : null;

    if (memberId) {
        // UI上の要素特定が難しいため、削除アニメーションはスキップして
        // 「戻った先」の強調表示に注力する
        executeRemoval(bandId, part, isCurrentBand, memberId);
    }
}

// 実際の削除処理
function executeRemoval(bandId, part, isCurrentBand, removedMemberId) {
    const bands = isCurrentBand ? state.currentBands : state.bands;
    const band = bands.find(b => b.id === bandId);
    if (band) {
        band.slots[part] = null;
        saveState();
        render();

        // メンバープールに戻ったカードを強調表示
        if (removedMemberId) {
            highlightPoolMember(removedMemberId);
        }
    }
}

// メンバープールのカードを強調表示
function highlightPoolMember(memberId) {
    // 描画完了を待つために少し遅延
    setTimeout(() => {
        const element = document.getElementById(`pool-member-${memberId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            element.classList.add('highlight-return');
            setTimeout(() => {
                element.classList.remove('highlight-return');
            }, 1000);
        }
    }, 50);
}

// 現在のバンド名変更
function handleCurrentBandNameChange(bandId, name) {
    const band = state.currentBands.find(b => b.id === bandId);
    if (band) {
        band.name = name;
        saveState();
    }
}

// 状態を保存
function saveState() {
    Storage.saveMembers(state.members);
    Storage.saveBands(state.bands);
    Storage.saveCurrentBands(state.currentBands);
    Storage.saveBandCount(state.bandCount);
}

// 重複と過去バンド被りを検出
function analyzeBands() {
    const memberNewBands = {}; // memberId -> [{ bandId, color, emoji, part }] (新バンドのみ)

    // 新しいバンド内での重複チェック
    state.bands.forEach((band) => {
        Object.entries(band.slots).forEach(([part, memberId]) => {
            if (memberId) {
                if (!memberNewBands[memberId]) {
                    memberNewBands[memberId] = [];
                }
                memberNewBands[memberId].push({
                    bandId: band.id,
                    color: band.color,
                    emoji: band.emoji,
                    part: part
                });
            }
        });
    });

    // 重複判定
    const duplicates = {}; // memberId -> [ { otherBandInfo } ]
    Object.entries(memberNewBands).forEach(([memberId, entries]) => {
        if (entries.length > 1) {
            const member = state.members.find(m => m.id === memberId);
            if (!member) return;

            // 各エントリー（アサイン箇所）から見て、自分以外の箇所を「重複相手」として抽出
            entries.forEach((entry, idx) => {
                const others = entries.filter((_, i) => i !== idx);

                // エラーチェック（兼任制約など）
                let errorMsg = '';
                if (state.allowConcurrent) {
                    const meetsLevel = (member.skills[entry.part] || 0) >= state.concurrentMinLevel;
                    const isWithinLimit = entries.length <= state.maxAssignments;
                    if (!meetsLevel) errorMsg = `兼任スキル不足 (Lv${state.concurrentMinLevel}必要)`;
                    else if (!isWithinLimit) errorMsg = `兼任上限オーバー (最大${state.maxAssignments}つ)`;
                } else {
                    errorMsg = '重複';
                }

                // エラーがある場合のみ duplicates に記録する (兼任許可が効くようにする)
                if (errorMsg) {
                    if (!duplicates[memberId]) duplicates[memberId] = [];
                    others.forEach(other => {
                        duplicates[memberId].push({
                            atPart: entry.part,
                            otherBandId: other.bandId,
                            color: other.color,
                            emoji: other.emoji,
                            error: errorMsg
                        });
                    });
                }
            });
        }
    });

    // 過去バンド（currentBands）での共演チェック
    const collisions = {}; // bandId -> [ { id, name, color, emoji, members } ]

    // 1. 各メンバーが所属していた過去バンドのマップを作成
    const memberPastBands = {}; // memberId -> [ { id, name, color, emoji } ]
    state.currentBands.forEach(cBand => {
        Object.values(cBand.slots).forEach(mId => {
            if (mId) {
                if (!memberPastBands[mId]) memberPastBands[mId] = [];
                memberPastBands[mId].push({
                    id: cBand.id,
                    name: cBand.name,
                    color: cBand.color,
                    emoji: cBand.emoji
                });
            }
        });
    });

    // 2. 各新バンドについてチェック
    state.bands.forEach(nBand => {
        const membersInBand = Object.values(nBand.slots).filter(id => id);
        if (membersInBand.length < state.minCollisionThreshold) return;

        const commonPastBands = {};

        membersInBand.forEach(mId => {
            const pasts = memberPastBands[mId] || [];
            pasts.forEach(p => {
                if (!commonPastBands[p.id]) {
                    commonPastBands[p.id] = {
                        id: p.id,
                        name: p.name,
                        color: p.color,
                        emoji: p.emoji,
                        members: []
                    };
                }
                commonPastBands[p.id].members.push(mId);
            });
        });

        Object.values(commonPastBands).forEach(info => {
            if (info.members.length >= state.minCollisionThreshold) {
                if (!collisions[nBand.id]) {
                    collisions[nBand.id] = [];
                }
                collisions[nBand.id].push(info);
            }
        });
    });

    return { duplicates, collisions };
}

// バンドの実力差を計算
function calculateSkillGap(band) {
    const skills = [];

    Object.entries(band.slots).forEach(([part, memberId]) => {
        if (memberId) {
            const member = state.members.find(m => m.id === memberId);
            if (member && member.skills[part]) {
                skills.push(member.skills[part]);
            }
        }
    });

    if (skills.length < 2) return 0;

    return Math.max(...skills) - Math.min(...skills);
}

// バンドごとの重複数をカウント
function countBandDuplicates(bandId, duplicates) {
    let count = 0;
    const band = state.bands.find(b => b.id === bandId);
    if (band) {
        Object.values(band.slots).forEach(memberId => {
            if (memberId && duplicates[memberId]) {
                count++;
            }
        });
    }
    return count;
}

// ドラッグ開始
function handleDragStart(e, memberId, fromBandId = null, fromPart = null) {
    state.draggedMemberId = memberId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', memberId);

    // 移動元の情報をセット
    if (fromBandId) {
        e.dataTransfer.setData('application/json', JSON.stringify({ fromBandId, fromPart }));
    }

    // 視覚補助を表示
    const member = state.members.find(m => m.id === memberId);
    if (member) {
        document.querySelectorAll('.drop-zone').forEach(zone => {
            const part = zone.dataset.part;
            if (part) {
                if (member.skills[part]) {
                    // スキルあり
                    zone.classList.add('allowed-part'); // 基本スタイル

                    if (member.mainPart === part) {
                        // メインパートは赤く強調
                        zone.classList.add('allowed-main');
                    } else {
                        // それ以外はレベルに応じて青の濃淡
                        const level = member.skills[part];
                        // 1-5の範囲に収める（念のため）
                        const safeLevel = Math.max(1, Math.min(5, level));
                        zone.classList.add(`allowed-level-${safeLevel}`);
                    }
                } else {
                    // スキルなし
                    zone.classList.add('forbidden-part');
                }
            }
        });
    }
}

// ドラッグ終了
function handleDragEnd(e) {
    state.draggedMemberId = null;
    e.target.classList.remove('dragging');

    // 視覚補助をクリア
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.classList.remove(
            'drag-over',
            'allowed-part', 'forbidden-part', 'allowed-main',
            'allowed-level-1', 'allowed-level-2', 'allowed-level-3', 'allowed-level-4', 'allowed-level-5'
        );
    });
}

// ドラッグオーバー
function handleDragOver(e) {
    e.preventDefault();

    // 禁止されている場合はドロップ不可
    if (e.currentTarget.classList.contains('forbidden-part')) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

// ドラッグリーブ
function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

// ドロップ
function handleDrop(e, bandId, part, isCurrentBand = false) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const memberId = e.dataTransfer.getData('text/plain');
    if (!memberId) return;

    // メンバーがこのパートを担当できるか確認
    const member = state.members.find(m => m.id === memberId);
    if (!member || !member.skills[part]) {
        return;
    }

    const bands = isCurrentBand ? state.currentBands : state.bands;
    const band = bands.find(b => b.id === bandId);

    if (band) {
        const sourceData = e.dataTransfer.getData('application/json');
        let fromBandId = null;
        let fromPart = null;

        if (sourceData) {
            try {
                const parsed = JSON.parse(sourceData);
                fromBandId = parsed.fromBandId;
                fromPart = parsed.fromPart;
            } catch (err) {
                console.error('Error parsing drag source data:', err);
            }
        }

        // スワップ（入れ替え）ロジック
        const targetMemberId = band.slots[part];
        if (targetMemberId && fromBandId && fromPart) {
            // 移動元のバンドを取得
            const fromBand = state.bands.find(b => b.id === fromBandId) ||
                state.currentBands.find(b => b.id === fromBandId);

            if (fromBand) {
                const targetMember = state.members.find(m => m.id === targetMemberId);
                // 相手がこちらの元のパートを演奏できるかチェック
                if (targetMember && targetMember.skills[fromPart]) {
                    // 入れ替え実行
                    fromBand.slots[fromPart] = targetMemberId;
                    band.slots[part] = memberId;
                    saveState();
                    render();
                    return;
                } else {
                    // スワップできない場合は通常のアサイン処理へ（上書きになる）
                    // あるいは、交換不可であることを通知しても良いが、
                    // ここでは「スキルがあれば交換、なければ上書き」という挙動にする
                }
            }
        }

        // 通常のアサイン/移動処理
        band.slots[part] = memberId;

        // 元の場所から削除（移動の場合）
        if (fromBandId && fromPart) {
            if (fromBandId !== bandId || fromPart !== part) {
                const fromBand = state.bands.find(b => b.id === fromBandId) ||
                    state.currentBands.find(b => b.id === fromBandId);
                if (fromBand && fromBand.slots[fromPart] === memberId) {
                    fromBand.slots[fromPart] = null;
                }
            }
        }

        saveState();
        render();
    }
}

// レンダリング
function render() {
    // 解析結果を一度だけ取得して渡す
    const analysis = analyzeBands();
    renderMemberPool(analysis);
    renderBands(analysis);
    renderCurrentBands(analysis);
    document.getElementById('bandCount').textContent = state.bandCount;
}

// メンバープールをレンダリング
function renderMemberPool({ duplicates }) {
    const container = document.getElementById('memberPool');

    // 新バンドのアサイン済みメンバーIDのみを収集（現在のバンドは除外）
    const assignedMemberIds = new Set();
    state.bands.forEach(band => {
        Object.values(band.slots).forEach(id => {
            if (id) assignedMemberIds.add(id);
        });
    });

    // フィルタリング
    let filteredMembers = state.members;
    if (state.currentFilter !== 'all') {
        filteredMembers = state.members.filter(m => m.skills[state.currentFilter]);
    }

    // ソートロジック
    const memberIndices = new Map(state.members.map((m, i) => [m.id, i]));

    // パートの優先順位
    const PART_ORDER = {
        'Vo': 1,
        'BaGt': 2, // Backing Guitar? ユーザー指定の表記に合わせる
        'Gt': 2,   // 通常のGtもここに含める
        'LeGt': 3, // Lead Guitar?
        'Ba': 4,
        'Dr': 5,
        'Key': 6
    };

    // パート名からオーダー値を取得するヘルパー
    const getPartOrder = (partName) => {
        // 部分一致や表記ゆれに対応
        if (!partName) return 99;
        if (PART_ORDER[partName]) return PART_ORDER[partName];

        // Gtを含む場合はGt扱いにするなど
        if (partName.includes('Vo')) return 1;
        if (partName.includes('BaGt')) return 2; // Gtより先に判定
        if (partName.includes('LeGt')) return 3;
        if (partName.includes('Gt')) return 2.5; // 指定外のGt
        if (partName.includes('Ba')) return 4;
        if (partName.includes('Dr')) return 5;
        if (partName.includes('Key')) return 6;

        return 99;
    };

    filteredMembers.sort((a, b) => {
        if (state.currentFilter === 'all') {
            // 全員表示時: パート順(Vo > BaGt > LeGt > Ba > Dr > Key)
            const orderA = getPartOrder(a.mainPart);
            const orderB = getPartOrder(b.mainPart);

            if (orderA !== orderB) return orderA - orderB;

            // 同じパートなら登録順
            return memberIndices.get(a.id) - memberIndices.get(b.id);
        } else {
            // パート絞り込み時: Lv順（降順）
            const skillA = a.skills[state.currentFilter] || 0;
            const skillB = b.skills[state.currentFilter] || 0;

            if (skillA !== skillB) return skillB - skillA; // 降順

            // 同じレベルなら登録順
            return memberIndices.get(a.id) - memberIndices.get(b.id);
        }
    });

    container.innerHTML = filteredMembers.map(member => {
        const isDuplicate = !!duplicates[member.id];
        const isAssigned = assignedMemberIds.has(member.id);
        const skillsDisplay = Object.entries(member.skills)
            .map(([part, level]) => `<span class="skill-tag">${part}:${level}</span>`)
            .join('');

        // 継続バンド所属チェック（色表示用）
        const memberInCurrentBands = state.currentBands.filter(cb =>
            Object.values(cb.slots).includes(member.id)
        );

        const originDots = memberInCurrentBands.map(cb => `
            <span class="origin-dot" style="--origin-color: ${cb.color}" title="${escapeHtml(cb.name)}"></span>
        `).join('');

        return `
            <div id="pool-member-${member.id}" 
                 class="draggable-member ${isDuplicate ? 'duplicate' : ''} ${isAssigned ? 'assigned' : ''}" 
                 draggable="true"
                 data-member-id="${member.id}"
                 ondragstart="handleDragStart(event, '${member.id}')"
                 ondragend="handleDragEnd(event)">
                <div class="member-info-row">
                    <span class="member-origin-dots">
                        ${originDots}
                    </span>
                    <span class="member-name">${formatMemberName(member.name)}</span>
                    ${isAssigned ? '<span class="status-badge">参戦中</span>' : ''}
                    ${!isAssigned && member.mainPart ? `<span class="member-main-part">${member.mainPart}</span>` : ''}
                </div>
                <div class="member-skills-row">
                    ${skillsDisplay}
                </div>
                <button class="btn btn-secondary edit-btn" onclick="event.stopPropagation(); openMemberModal('${member.id}')">✎</button>
            </div>
        `;
    }).join('');
}

// バンドをレンダリング
function renderBands({ duplicates, collisions }) {
    const container = document.getElementById('bandsContainer');

    container.innerHTML = state.bands.map((band, index) => {
        // このバンド内の重複メンバー数（他バンドとの重複）
        let duplicateCount = 0;
        Object.values(band.slots).forEach(id => {
            if (id && duplicates[id]) duplicateCount++;
        });

        // 過去バンド被り情報
        const bandCollisions = collisions[band.id] || [];
        const collisionCount = bandCollisions.length;

        const skillGap = calculateSkillGap(band);

        const slots = PARTS.map(part => {
            const memberId = band.slots[part];
            const member = memberId ? state.members.find(m => m.id === memberId) : null;

            // この特定のパートでの重複情報を取得
            const partDuplicates = memberId ? (duplicates[memberId] || []).filter(d => d.atPart === part) : [];
            const isDuplicate = partDuplicates.length > 0;
            const duplicateReason = isDuplicate ? partDuplicates[0].error : null;

            // 過去バンド被りのハイライト
            const memberCollisions = (collisions[band.id] || []).filter(c => c.members.includes(memberId));
            const hasCollision = memberCollisions.length > 0;

            const skill = member && member.skills[part] ? member.skills[part] : null;
            let skillClass = '';
            if (skill) {
                if (skill >= 4) skillClass = 'high';
                else if (skill <= 2) skillClass = 'low';
            }

            if (member) {
                // 1. 継続バンド所属チェック（色表示用）
                const memberInCurrentBands = state.currentBands.filter(cb =>
                    Object.values(cb.slots).includes(memberId)
                );

                const originDots = memberInCurrentBands.map(cb => `
                    <span class="origin-dot" style="--origin-color: ${cb.color}" title="${escapeHtml(cb.name)}"></span>
                `).join('');

                // 2. 新規バンド間重複
                const otherBandAssignments = partDuplicates.filter(d => d.otherBandId);
                const internalDuplicates = partDuplicates.filter(d => !d.otherBandId).length > 0;

                // スタイルの決定（優先順位: 重複 > 過去共演）
                let conflictClass = 'has-conflict';
                let conflictTypeClass = '';
                let conflictColor = '';

                if (otherBandAssignments.length > 0) {
                    conflictTypeClass = 'conflict-new';
                    conflictColor = otherBandAssignments[0].color || 'var(--danger)';
                } else if (internalDuplicates) {
                    conflictTypeClass = 'conflict-new';
                    conflictColor = 'var(--danger)';
                } else if (hasCollision) {
                    conflictTypeClass = 'conflict-past';
                    conflictColor = memberCollisions[0].color || 'var(--info)';
                } else {
                    conflictClass = '';
                }

                const styleVars = conflictColor ? `--conflict-color: ${conflictColor}; --conflict-glow: ${conflictColor}33;` : '';

                // ミニバッジの生成
                let badges = '';
                if (otherBandAssignments.length > 0 || internalDuplicates) badges += `<span class="mini-badge">🔴</span>`;
                if (hasCollision) badges += `<span class="mini-badge" title="${memberCollisions.map(c => c.name).join(', ')}で共演">🤝</span>`;

                return `
                    <div class="band-slot ${conflictClass} ${conflictTypeClass}" style="${styleVars}">
                        <span class="slot-part">${part}</span>
                        <div class="drop-zone has-member"
                             data-part="${part}"
                             ondragover="handleDragOver(event)"
                             ondragleave="handleDragLeave(event)"
                             ondrop="handleDrop(event, '${band.id}', '${part}', false)">
                            <div class="assigned-member" 
                                 draggable="true" 
                                 ondragstart="handleDragStart(event, '${member.id}', '${band.id}', '${part}')">
                                <span class="member-origin-dots">
                                    ${originDots}
                                </span>
                                <span class="assigned-name">${formatMemberName(member.name)}</span>
                                <div class="slot-badge-container">
                                    ${badges}
                                </div>
                                <span class="assigned-skill ${skillClass}"><span style="font-size:0.7em">Lv</span>${skill}</span>
                            </div>
                            <button class="remove-btn" onclick="removeFromSlot('${band.id}', '${part}', false)">✕</button>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="band-slot">
                        <span class="slot-part">${part}</span>
                        <div class="drop-zone"
                             data-part="${part}"
                             ondragover="handleDragOver(event)"
                             ondragleave="handleDragLeave(event)"
                             ondrop="handleDrop(event, '${band.id}', '${part}', false)">
                            ドロップ
                        </div>
                    </div>
                `;
            }
        }).join('');

        const collisionTitle = bandCollisions.map(c => `${c.name}: ${getMemberNames(c.members)}`).join('\n');

        return `
            <div class="band-card">
                <div class="band-header">
                    <div class="band-title">
                        Band ${index + 1}
                    </div>
                    <div class="band-badges">
                        ${duplicateCount > 0 ? `<span class="badge badge-duplicate" title="重複あり">🔴</span>` : ''}
                        ${skillGap >= 3 ? `<span class="badge badge-skill-gap" title="実力差: ${skillGap}">⚠</span>` : ''}
                        ${collisionCount > 0 ? `<span class="badge badge-info" title="${escapeHtml(collisionTitle)}">🤝</span>` : ''}
                    </div>
                </div>
                <div class="band-members">
                    ${slots}
                </div>
            </div>
        `;
    }).join('');
}

// 現在のバンドをレンダリング
function renderCurrentBands({ duplicates }) {
    const container = document.getElementById('currentBandsContainer');

    container.innerHTML = state.currentBands.map(band => {
        const slots = PARTS.map(part => {
            const memberId = band.slots[part];
            const member = memberId ? state.members.find(m => m.id === memberId) : null;

            if (member) {
                return `
                    <div class="band-slot">
                        <span class="slot-part">${part}</span>
                        <div class="drop-zone has-member"
                             data-part="${part}" 
                             ondragover="handleDragOver(event)"
                             ondragleave="handleDragLeave(event)"
                             ondrop="handleDrop(event, '${band.id}', '${part}', true)">
                            <div class="assigned-member">
                                <span class="assigned-name">${escapeHtml(member.name)}</span>
                            </div>
                            <button class="remove-btn" onclick="removeFromSlot('${band.id}', '${part}', true)">✕</button>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="band-slot">
                        <span class="slot-part">${part}</span>
                        <div class="drop-zone"
                             data-part="${part}"
                             ondragover="handleDragOver(event)"
                             ondragleave="handleDragLeave(event)"
                             ondrop="handleDrop(event, '${band.id}', '${part}', true)">
                            ドロップ
                        </div>
                    </div>
                `;
            }
        }).join('');

        const colorOptions = COLOR_PALETTE.map(c => `
            <button class="color-swatch-btn ${band.color === c ? 'active' : ''}" 
                    style="background-color: ${c}" 
                    onclick="handleCurrentBandColorEmojiChange('${band.id}', 'color', '${c}')"
                    title="${c}"></button>
        `).join('');

        return `
            <div class="band-card current-band-card" style="border-top: 4px solid ${band.color || 'var(--primary)'}">
                <div class="band-header">
                    <div class="band-meta-edit">
                        <input type="text" class="band-emoji-input" value="${escapeHtml(band.emoji || '🎸')}" 
                            maxlength="2" title="絵文字" 
                            onchange="handleCurrentBandColorEmojiChange('${band.id}', 'emoji', this.value)">
                        
                        <div class="color-popover-container">
                            <div class="color-indicator" style="background-color: ${band.color || '#4e73df'}"
                                 onclick="toggleColorPopover('${band.id}')" title="カラーを選択"></div>
                            <div id="popover-${band.id}" class="color-popover">
                                ${colorOptions}
                            </div>
                        </div>
                    </div>
                    <input type="text" class="band-name-input" value="${escapeHtml(band.name)}" 
                        onchange="handleCurrentBandNameChange('${band.id}', this.value)">
                    <button class="btn-icon" onclick="removeCurrentBand('${band.id}')" title="削除">✕</button>
                </div>
                <div class="band-members">
                    ${slots}
                </div>
            </div>
        `;
    }).join('');
}

// カラーパレットの表示切り替え
function toggleColorPopover(bandId) {
    const popover = document.getElementById(`popover-${bandId}`);
    if (popover) {
        const isShown = popover.classList.contains('show');
        // 全てのポップオーバーを一旦閉じる
        document.querySelectorAll('.color-popover').forEach(p => p.classList.remove('show'));
        // クリックされたものだけトグル
        if (!isShown) popover.classList.add('show');
    }
}

// 画面クリックでポップオーバーを閉じる
document.addEventListener('click', (e) => {
    if (!e.target.closest('.color-popover-container')) {
        document.querySelectorAll('.color-popover').forEach(p => p.classList.remove('show'));
    }
});

/**
 * メンバー名のフォーマット（カッコ内を小さく、エスケープ込み）
 */
function formatMemberName(name) {
    if (!name) return '';
    const escaped = escapeHtml(name);
    // 全角・半角のカッコとその中身を <small> で囲む
    return escaped.replace(/([\(（].*?[\)）])/g, '<small class="name-sub">$1</small>');
}

// メンバー名のリストを取得（デバッグ/チップ用）
function getMemberNames(memberIds) {
    return memberIds
        .map(id => state.members.find(m => m.id === id)?.name)
        .filter(n => n)
        .join(', ');
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
