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
                console.log('Connection open, sending initial state in 100ms...');
                // 接続直後だと送信に失敗する場合があるため、わずかに遅延させる
                setTimeout(() => {
                    this.broadcastState();
                }, 100);
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

        console.log('--- Guest Mode Start ---');
        console.log('Attempting to join host:', hostId);
        this.peer = new Peer();
        this.isGuest = true;

        this.peer.on('open', (id) => {
            console.log('Guest Peer opened with ID:', id);
            console.log('Connecting to host...');
            this.conn = this.peer.connect(hostId);

            this.conn.on('open', () => {
                console.log('SUCCESS: Connected to host', hostId);
                document.getElementById('guestSection').classList.remove('hidden');
                document.getElementById('hostSection').classList.add('hidden');
                document.getElementById('syncBtn').classList.add('hidden'); // ゲストは同期ボタンを隠す

                // ホストからのデータ受信
                this.conn.on('data', (data) => {
                    console.log('Data received from host:', data.type);
                    this.handleReceivedData(data);
                });
            });

            this.conn.on('close', () => {
                console.warn('Connection closed by host');
                alert('ホストとの接続が切断されました。');
                window.location.href = window.location.pathname; // ゲストモード終了
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Error (Guest):', err);
            alert('接続に失敗しました。URLを確認してください。 エラー: ' + err.type);
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

        // グローバルなstateを明示的に取得
        const currentState = window.state || state;
        if (!currentState) {
            console.error('Cannot broadcast: state is not defined');
            return;
        }

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

        console.log(`Broadcasting state to ${this.connections.length} clients:`, {
            members: data.state.members.length,
            bands: data.state.bands.length
        });

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
