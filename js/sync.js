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

    setupUI() {
        document.getElementById('syncBtn').addEventListener('click', () => {
            document.getElementById('syncModal').classList.remove('hidden');
        });

        document.getElementById('closeSyncModal').addEventListener('click', () => {
            document.getElementById('syncModal').classList.add('hidden');
        });

        document.getElementById('startHostBtn').addEventListener('click', () => {
            this.startHost();
        });

        document.getElementById('stopHostBtn').addEventListener('click', () => {
            this.stopHost();
        });
    },

    startHost() {
        if (this.peer) return;

        this.peer = new Peer();
        this.isHost = true;

        this.peer.on('open', (id) => {
            this.peerId = id;
            this.showHostUI(id);
        });

        this.peer.on('connection', (conn) => {
            console.log('New connection:', conn.peer);
            this.connections.push(conn);

            conn.on('open', () => {
                // 初回接続時に現在の状態を送信
                this.broadcastState();
            });

            conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            alert('通信エラーが発生しました: ' + err.type);
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

        const url = `${window.location.origin}${window.location.pathname}?join=${id}`;
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

        console.log('Starting guest mode to join:', hostId);
        this.peer = new Peer();
        this.isGuest = true;

        this.peer.on('open', () => {
            this.conn = this.peer.connect(hostId);

            this.conn.on('open', () => {
                console.log('Connected to host');
                document.getElementById('guestSection').classList.remove('hidden');
                document.getElementById('hostSection').classList.add('hidden');
                document.getElementById('syncBtn').classList.add('hidden'); // ゲストは同期ボタンを隠す

                // ホストからのデータ受信
                this.conn.on('data', (data) => {
                    this.handleReceivedData(data);
                });
            });

            this.conn.on('close', () => {
                console.log('Connection closed');
                alert('ホストとの接続が切断されました。');
                window.location.href = window.location.pathname; // ゲストモード終了
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            alert('接続に失敗しました。URLを確認してください。');
            window.location.href = window.location.pathname;
        });
    },

    handleReceivedData(data) {
        if (data.type === 'STATE_UPDATE') {
            console.log('State update received');

            // アプリケーションの状態を更新
            if (typeof updateStateFromSync === 'function') {
                updateStateFromSync(data.state);
            }
        }
    },

    broadcastState() {
        if (!this.isHost || this.connections.length === 0) return;

        const data = {
            type: 'STATE_UPDATE',
            state: {
                members: state.members,
                bands: state.bands,
                currentBands: state.currentBands,
                bandCount: state.bandCount,
                allowConcurrent: state.allowConcurrent,
                concurrentMinLevel: state.concurrentMinLevel,
                maxAssignments: state.maxAssignments,
                minCollisionThreshold: state.minCollisionThreshold
            }
        };

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
