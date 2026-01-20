/* ===========================================
   同期管理モジュール (PeerJS)
=========================================== */

const Sync = {
    peer: null,
    conn: null,
    isHost: false,
    isGuest: false,
    peerId: null,
    connections: [],

    init() {
        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');

        if (joinId) {
            this.startGuest(joinId);
        }

        this.setupUI();
    },

    updateStatus(message, type = 'info') {
        const overlay = document.querySelector('.guest-overlay');
        if (overlay) {
            const statusSpan = overlay.querySelector('.sync-status') || document.createElement('span');
            statusSpan.className = 'sync-status';
            statusSpan.style.marginLeft = '8px';
            statusSpan.style.fontSize = '0.7em';
            statusSpan.style.opacity = '0.8';
            statusSpan.textContent = `[${message}]`;
            if (!overlay.querySelector('.sync-status')) {
                overlay.appendChild(statusSpan);
            }
        }
        console.log(`[Sync Status] ${message}`);
    },

    setupUI() {
        document.getElementById('syncBtn').addEventListener('click', () => {
            document.getElementById('syncModal').classList.remove('hidden');
        });

        document.getElementById('closeSyncModal').addEventListener('click', () => {
            document.getElementById('syncModal').classList.add('hidden');
        });

        document.getElementById('startHostBtn').addEventListener('click', () => {
            if (window.location.protocol === 'file:') {
                alert('警告: 現在ローカルファイル(file://)として開いています。別のデバイスと同期するには、GitHub Pagesにアップロードするか、ローカルサーバー(VSCode Live Server等)を使用してください。');
            }
            this.startHost();
        });

        document.getElementById('stopHostBtn').addEventListener('click', () => {
            this.stopHost();
        });
    },

    startHost() {
        if (this.peer) return;

        console.log('--- Starting Host Mode ---');
        this.peer = new Peer();
        this.isHost = true;

        this.peer.on('open', (id) => {
            this.peerId = id;
            this.showHostUI(id);
        });

        this.peer.on('connection', (conn) => {
            console.log('New connection from:', conn.peer);
            this.connections.push(conn);

            conn.on('open', () => {
                console.log('Connection with guest open. Sending state...');
                // 接続直後はデータ送信が不安定な場合があるため、遅延を入れて複数回送る
                setTimeout(() => this.broadcastState(), 200);
                setTimeout(() => this.broadcastState(), 1000);
            });

            conn.on('data', (data) => {
                if (data.type === 'REQUEST_STATE') {
                    console.log('Guest requested state. Resending...');
                    this.broadcastState();
                }
            });

            conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Host Error:', err);
            if (err.type === 'browser-incompatible') {
                alert('お使いのブラウザは同期機能に対応していません。');
            } else {
                alert('同期サーバーとの接続エラー: ' + err.type);
            }
            this.stopHost();
        });
    },

    stopHost() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connections = [];
        this.isHost = false;
        this.peerId = null;

        document.getElementById('hostSection').classList.remove('hidden');
        document.getElementById('activeSyncSection').classList.add('hidden');
        document.getElementById('syncBtn').classList.remove('active');
        document.getElementById('qrcodeContainer').innerHTML = '';
    },

    showHostUI(id) {
        const hostSection = document.getElementById('hostSection');
        const activeSyncSection = document.getElementById('activeSyncSection');
        const qrcodeContainer = document.getElementById('qrcodeContainer');
        const syncUrl = document.getElementById('syncUrl');

        hostSection.classList.add('hidden');
        activeSyncSection.classList.remove('hidden');
        document.getElementById('syncBtn').classList.add('active');

        const protocol = window.location.protocol === 'file:' ? 'http://[あなたのIP]' : window.location.origin;
        const url = `${protocol}${window.location.pathname}?join=${id}`;
        syncUrl.href = url;
        syncUrl.textContent = url;

        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: url,
            width: 180,
            height: 180,
            colorDark: "#2d3436",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    },

    startGuest(hostId) {
        if (this.peer) return;

        console.log('--- Guest Mode Start ---');
        this.updateStatus('接続中...');
        this.peer = new Peer();
        this.isGuest = true;

        this.peer.on('open', (id) => {
            console.log('Guest Peer opened. My ID:', id);
            console.log('Attempting PeerJS connection to:', hostId);

            // reliable: trueを削除
            this.conn = this.peer.connect(hostId);

            // 接続タイムアウト監視 (10秒)
            const connTimeout = setTimeout(() => {
                if (this.conn && !this.conn.open) {
                    console.error('Connection timeout');
                    this.updateStatus('接続タイムアウト', 'error');
                    alert('接続がタイムアウトしました。ホストがアクティブか確認してください。');
                }
            }, 10000);

            this.conn.on('open', () => {
                clearTimeout(connTimeout);
                console.log('SUCCESS: Connected to host');
                this.updateStatus('同期待ち...');

                document.getElementById('guestSection').classList.remove('hidden');
                document.getElementById('hostSection').classList.add('hidden');
                document.getElementById('syncBtn').classList.add('hidden');

                // 2秒待ってもデータが来ない場合はリクエストを送る
                setTimeout(() => {
                    if (window.state && window.state.members.length === 0) {
                        console.log('No data received yet. Requesting from host...');
                        this.updateStatus('再試行中...');
                        this.conn.send({ type: 'REQUEST_STATE' });
                    }
                }, 2000);

                this.conn.on('data', (data) => {
                    console.log('Data received:', data.type);
                    if (data.type === 'STATE_UPDATE') {
                        this.updateStatus('同期完了');
                        // 3秒後にステータスを消す
                        setTimeout(() => this.updateStatus(''), 3000);
                        this.handleReceivedData(data);
                    }
                });
            });

            this.conn.on('close', () => {
                alert('ホストとの接続が切断されました。');
                window.location.href = window.location.pathname;
            });
        });

        this.peer.on('error', (err) => {
            console.error('Guest Peer Error:', err);
            this.updateStatus('Peerエラー', 'error');
            if (err.type === 'peer-unavailable') {
                alert('ホストが見つかりません。');
            } else {
                alert('接続エラー: ' + err.type);
            }
            window.location.href = window.location.pathname;
        });
    },

    handleReceivedData(data) {
        if (data.type === 'STATE_UPDATE') {
            if (typeof updateStateFromSync === 'function') {
                updateStateFromSync(data.state);
            }
        }
    },

    broadcastState() {
        if (!this.isHost || this.connections.length === 0) return;

        const currentState = window.state || (typeof state !== 'undefined' ? state : null);
        if (!currentState) return;

        const data = {
            type: 'STATE_UPDATE',
            state: {
                members: currentState.members,
                bands: currentState.bands,
                currentBands: currentState.currentBands,
                bandCount: currentState.bandCount,
                allowConcurrent: currentState.allowConcurrent,
                concurrentMinLevel: currentState.concurrentMinLevel,
                maxAssignments: currentState.maxAssignments,
                minCollisionThreshold: currentState.minCollisionThreshold
            }
        };

        console.log(`Broadcasting to ${this.connections.length} clients...`);
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    Sync.init();
});
