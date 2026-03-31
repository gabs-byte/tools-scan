// ===================== CONFIGURAÇÃO =====================
const API_BASE = "https://script.google.com/macros/s/AKfycbyd_7YvNgc_sn9ax8IhWLBNd47RZXGIjkNvBWp-IE2TdtCr8cvlmzlxM529FYaLBxgj/exechttps://script.google.com/macros/s/AKfycbyd_7YvNgc_sn9ax8IhWLBNd47RZXGIjkNvBWp-IE2TdtCr8cvlmzlxM529FYaLBxgj/exec";

// ===================== CONFIGURAÇÕES =====================
const MODO_SIMULACAO = false;

// Cache de peças e sondas
let partsCache = [];
let sondasCache = [];

// Variáveis globais
let currentOperator = null;
let currentPart = null;
let cameraStream = null;
let scanInterval = null;

// Offline - movimentações pendentes
let pendingMovements = [];

// Status de rede
let connectionType = "unknown";

// ===================== ELEMENTOS DO DOM =====================
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const operatorInfoDiv = document.getElementById('operator-info');
const scanPartBtn = document.getElementById('scan-part-btn');
const partInfoDiv = document.getElementById('part-info');
const partNameSpan = document.getElementById('part-name');
const partSondaSpan = document.getElementById('part-sonda');
const sondaModeloSpan = document.getElementById('sonda-modelo');
const sondaResponsavelSpan = document.getElementById('sonda-responsavel');
const currentLocationSpan = document.getElementById('current-location');
const fromLocationInput = document.getElementById('from-location');
const movementForm = document.getElementById('movement-form');
const scanBadgeBtn = document.getElementById('scan-badge-btn');
const matriculaInput = document.getElementById('matricula');
const loginBtn = document.getElementById('login-btn');
const toLocationSelect = document.getElementById('to-location');
const submitBtn = document.getElementById('submit-btn');
const manualPartCode = document.getElementById('manual-part-code');
const manualSearchBtn = document.getElementById('manual-search-btn');
const pendingBadge = document.getElementById('pending-badge');
const pendingSection = document.getElementById('pending-section');
const pendingList = document.getElementById('pending-list');
const syncNowBtn = document.getElementById('sync-now-btn');
const connectionStatus = document.getElementById('connection-status');

// Elementos câmera
const cameraScreen = document.getElementById('camera-screen');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const closeCameraBtn = document.getElementById('close-camera-btn');
const scanMessage = document.getElementById('scan-message');

// Elementos toast e loading
const toast = document.getElementById('toast');
const loading = document.getElementById('loading');

// ===================== TOAST E LOADING =====================
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading(text = 'Processando...') {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) loadingText.textContent = text;
    loading.style.display = 'flex';
}

function hideLoading() {
    loading.style.display = 'none';
}

// ===================== STATUS DE REDE MELHORADO =====================
async function checkNetworkQuality() {
    if (!navigator.onLine) {
        connectionType = "offline";
        updateConnectionStatusDisplay();
        return "offline";
    }
    
    const startTime = Date.now();
    try {
        const response = await fetch(`${API_BASE}?action=getStats`, { method: 'HEAD' });
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        if (latency < 200) {
            connectionType = "excelente";
        } else if (latency < 500) {
            connectionType = "boa";
        } else if (latency < 1000) {
            connectionType = "regular";
        } else {
            connectionType = "lenta";
        }
        
        updateConnectionStatusDisplay();
        return connectionType;
    } catch (error) {
        connectionType = "instavel";
        updateConnectionStatusDisplay();
        return "instavel";
    }
}

function updateConnectionStatusDisplay() {
    const statusDiv = document.getElementById('connection-status');
    if (!statusDiv) return;
    
    if (!navigator.onLine) {
        statusDiv.innerHTML = '⚠️ Offline - Dados salvos localmente';
        statusDiv.className = 'connection-status offline';
    } else {
        switch(connectionType) {
            case 'excelente':
                statusDiv.innerHTML = '📶 Conexão Excelente';
                statusDiv.className = 'connection-status online';
                break;
            case 'boa':
                statusDiv.innerHTML = '📶 Conexão Boa';
                statusDiv.className = 'connection-status online';
                break;
            case 'regular':
                statusDiv.innerHTML = '📶 Conexão Regular';
                statusDiv.className = 'connection-status online';
                break;
            case 'lenta':
                statusDiv.innerHTML = '🐢 Conexão Lenta';
                statusDiv.className = 'connection-status online';
                break;
            default:
                statusDiv.innerHTML = '📡 Online';
                statusDiv.className = 'connection-status online';
        }
    }
}

// Monitorar mudanças de rede
window.addEventListener('online', async () => {
    showToast('Conexão restaurada. Sincronizando dados...', 'info');
    await checkNetworkQuality();
    if (window.syncPendingMovements) await syncPendingMovements();
});

window.addEventListener('offline', () => {
    connectionType = "offline";
    updateConnectionStatusDisplay();
    showToast('Sem conexão. Os dados serão salvos localmente.', 'warning');
});

// Verificar qualidade da rede periodicamente
setInterval(async () => {
    if (navigator.onLine) {
        await checkNetworkQuality();
    }
}, 30000);

// ===================== OFFLINE - CARREGAR CATÁLOGO =====================
async function loadPartsCache() {
    try {
        const saved = localStorage.getItem('partsCache');
        if (saved) {
            partsCache = JSON.parse(saved);
            console.log(`Cache de peças carregado: ${partsCache.length} peças`);
        }
        
        const savedSondas = localStorage.getItem('sondasCache');
        if (savedSondas) {
            sondasCache = JSON.parse(savedSondas);
            console.log(`Cache de sondas carregado: ${sondasCache.length} sondas`);
        }
        
        if (navigator.onLine) {
            const [partsResponse, sondasResponse] = await Promise.all([
                fetch(`${API_BASE}?action=getAllParts`),
                fetch(`${API_BASE}?action=getAllSondas`)
            ]);
            
            const partsData = await partsResponse.json();
            if (partsData.success && partsData.parts) {
                partsCache = partsData.parts;
                localStorage.setItem('partsCache', JSON.stringify(partsCache));
                console.log(`Cache de peças atualizado: ${partsCache.length} peças`);
            }
            
            const sondasData = await sondasResponse.json();
            if (sondasData.success && sondasData.sondas) {
                sondasCache = sondasData.sondas;
                localStorage.setItem('sondasCache', JSON.stringify(sondasCache));
                console.log(`Cache de sondas atualizado: ${sondasCache.length} sondas`);
            }
        }
    } catch (error) {
        console.log('Erro ao carregar cache:', error);
    }
}

async function getPartInfoOfflineFirst(partId) {
    const cachedPart = partsCache.find(p => p.partId === partId);
    
    if (cachedPart) {
        const movements = JSON.parse(localStorage.getItem('movementsHistory') || '[]');
        const lastMovement = movements.filter(m => m.partId === partId).pop();
        
        let sondaInfo = null;
        if (cachedPart.sondaId && cachedPart.sondaId !== "Não informada") {
            sondaInfo = sondasCache.find(s => s.sondaId === cachedPart.sondaId);
        }
        
        return {
            partId: partId,
            partName: cachedPart.partName,
            sondaId: cachedPart.sondaId || 'Não informada',
            sondaInfo: sondaInfo,
            currentLocation: lastMovement ? lastMovement.toLocation : 'Desconhecida',
            fromCache: true
        };
    }
    
    if (!navigator.onLine) {
        return { error: "Peça não encontrada no cache offline. Conecte-se para sincronizar." };
    }
    
    try {
        const result = await getPartInfo(partId);
        return result;
    } catch (error) {
        return { error: error.message };
    }
}

// ===================== FUNÇÕES API =====================
async function authenticate(matricula) {
    try {
        const url = `${API_BASE}?action=authenticate&matricula=${encodeURIComponent(matricula)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Erro autenticação:", error);
        throw error;
    }
}

async function getPartInfo(partId) {
    try {
        const url = `${API_BASE}?action=getPartInfo&partId=${encodeURIComponent(partId)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Erro peça:", error);
        throw error;
    }
}

async function addLog(data) {
    try {
        const params = new URLSearchParams({
            action: "addLog",
            operatorMatricula: data.operatorMatricula,
            partId: data.partId,
            sondaId: data.sondaId || "",
            fromLocation: data.fromLocation,
            toLocation: data.toLocation,
            status: data.status,
            notes: data.notes || ""
        });
        
        const url = `${API_BASE}?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Erro log:", error);
        throw error;
    }
}

// ===================== OFFLINE - SALVAR MOVIMENTAÇÕES =====================
function savePendingMovement(data) {
    pendingMovements.push({
        ...data,
        timestamp: new Date().toISOString(),
        operator: currentOperator,
        synced: false
    });
    localStorage.setItem('pendingMovements', JSON.stringify(pendingMovements));
    
    const history = JSON.parse(localStorage.getItem('movementsHistory') || '[]');
    history.push({
        ...data,
        timestamp: new Date().toISOString(),
        operator: currentOperator.name,
        synced: false
    });
    localStorage.setItem('movementsHistory', JSON.stringify(history));
    
    updatePendingBadge();
    showToast('Sem conexão. Movimentação salva localmente.', 'warning');
}

async function syncPendingMovements() {
    if (!navigator.onLine) return;
    if (pendingMovements.length === 0) return;
    
    showToast(`Sincronizando ${pendingMovements.length} movimentações...`, 'info');
    showLoading('Sincronizando dados...');
    
    const failed = [];
    
    for (const movement of pendingMovements) {
        try {
            const result = await addLog(movement);
            if (result.success) {
                const history = JSON.parse(localStorage.getItem('movementsHistory') || '[]');
                const idx = history.findIndex(h => h.timestamp === movement.timestamp);
                if (idx !== -1) history[idx].synced = true;
                localStorage.setItem('movementsHistory', JSON.stringify(history));
            } else {
                failed.push(movement);
            }
        } catch (error) {
            failed.push(movement);
        }
    }
    
    if (failed.length === 0) {
        pendingMovements = [];
        localStorage.removeItem('pendingMovements');
        showToast('Todas as movimentações sincronizadas!', 'success');
        updatePendingBadge();
        hidePendingSection();
    } else {
        pendingMovements = failed;
        localStorage.setItem('pendingMovements', JSON.stringify(failed));
        showToast(`${failed.length} movimentações pendentes`, 'warning');
        updatePendingBadge();
        showPendingSection();
    }
    
    hideLoading();
}

function updatePendingBadge() {
    const count = pendingMovements.length;
    const badge = document.getElementById('pending-badge');
    if (count > 0) {
        badge.textContent = `${count} movimentação${count > 1 ? 'ões' : ''} pendente${count > 1 ? 's' : ''}`;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function showPendingSection() {
    if (pendingMovements.length === 0) return;
    
    pendingList.innerHTML = '';
    pendingMovements.forEach((mov, idx) => {
        const div = document.createElement('div');
        div.className = 'pending-item';
        div.innerHTML = `
            <strong>${mov.partId}</strong> - ${mov.toLocation}<br>
            <small>${new Date(mov.timestamp).toLocaleString()}</small>
        `;
        pendingList.appendChild(div);
    });
    pendingSection.style.display = 'block';
}

function hidePendingSection() {
    pendingSection.style.display = 'none';
}

// Carregar pendências do localStorage
try {
    const saved = localStorage.getItem('pendingMovements');
    if (saved) pendingMovements = JSON.parse(saved);
    if (pendingMovements.length > 0) {
        updatePendingBadge();
        showPendingSection();
        showToast(`${pendingMovements.length} movimentações pendentes`, 'info');
    }
} catch(e) {}

window.syncPendingMovements = syncPendingMovements;

// ===================== CÂMERA CORRIGIDA =====================
async function startCamera(callback) {
    if (MODO_SIMULACAO) {
        showToast('Modo simulação: Peça P001', 'info');
        callback("P001");
        return;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Navegador não suporta câmera', 'error');
        return;
    }
    
    cameraScreen.style.display = 'block';
    scanMessage.innerText = 'Solicitando permissão...';
    
    const constraintsList = [
        { video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: "environment" } },
        { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: true }
    ];
    
    let stream = null;
    
    for (const constraints of constraintsList) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
        } catch (e) {
            console.log("Fallback tentativa falhou:", e);
        }
    }
    
    if (!stream) {
        scanMessage.innerText = 'Erro ao acessar câmera';
        showToast('Não foi possível acessar a câmera', 'error');
        setTimeout(() => stopCamera(), 2000);
        return;
    }
    
    cameraVideo.srcObject = stream;
    cameraStream = stream;
    
    await new Promise((resolve) => {
        cameraVideo.onloadedmetadata = () => {
            cameraVideo.play();
            resolve();
        };
    });
    
    scanMessage.innerText = 'Aponte para o QR Code';
    startQRScanning(callback);
}

function startQRScanning(callback) {
    const canvas = cameraCanvas;
    const context = canvas.getContext('2d');
    let lastScanTime = 0;
    const SCAN_DELAY = 1000;
    
    if (scanInterval) clearInterval(scanInterval);
    
    scanInterval = setInterval(() => {
        if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) return;
        
        const now = Date.now();
        if (now - lastScanTime < SCAN_DELAY) return;
        
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        
        if (code) {
            lastScanTime = now;
            scanMessage.innerText = 'QR Code detectado!';
            clearInterval(scanInterval);
            scanInterval = null;
            setTimeout(() => {
                stopCamera();
                callback(code.data);
            }, 500);
        }
    }, 200);
}

function stopCamera() {
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    cameraVideo.srcObject = null;
    cameraScreen.style.display = 'none';
}

if (closeCameraBtn) closeCameraBtn.onclick = stopCamera;

// ===================== FUNÇÕES INTERFACE =====================
function showMainScreen() {
    loginScreen.style.display = 'none';
    mainScreen.style.display = 'block';
    operatorInfoDiv.innerText = `Operador: ${currentOperator.name} (${currentOperator.matricula})`;
    showToast(`Bem-vindo, ${currentOperator.name}!`, 'success');
    checkNetworkQuality();
}

function resetPartInfo() {
    partInfoDiv.style.display = 'none';
    movementForm.reset();
    currentPart = null;
}

// ===================== EVENTOS =====================
loginBtn.onclick = async () => {
    const matricula = matriculaInput.value.trim();
    if (!matricula) {
        showToast('Digite sua matrícula', 'warning');
        return;
    }
    
    showLoading('Autenticando...');
    try {
        const result = await authenticate(matricula);
        if (result.success) {
            currentOperator = result;
            showMainScreen();
            await loadPartsCache();
        } else {
            showToast(result.error || 'Operador não encontrado', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
    hideLoading();
};

scanBadgeBtn.onclick = () => {
    showToast('Aponte a câmera para o QR Code do crachá', 'info');
    startCamera(async (qrCode) => {
        try {
            const result = await authenticate(qrCode);
            if (result.success) {
                currentOperator = result;
                showMainScreen();
                await loadPartsCache();
            } else {
                showToast('QR Code inválido', 'error');
            }
        } catch (error) {
            showToast('Erro na autenticação', 'error');
        }
    });
};

scanPartBtn.onclick = () => {
    resetPartInfo();
    showToast('Aponte a câmera para o QR Code da peça', 'info');
    startCamera(async (qrCode) => {
        try {
            showLoading('Buscando peça...');
            const partInfo = await getPartInfoOfflineFirst(qrCode);
            if (partInfo.error) {
                showToast(partInfo.error, 'error');
                hideLoading();
                return;
            }
            
            currentPart = partInfo;
            partNameSpan.innerText = partInfo.partName;
            
            if (partInfo.sondaInfo && !partInfo.sondaInfo.error) {
                partSondaSpan.innerText = partInfo.sondaId;
                sondaModeloSpan.innerText = partInfo.sondaInfo.modelo || 'Não informado';
                sondaResponsavelSpan.innerText = partInfo.sondaInfo.responsavel || 'Não informado';
            } else {
                partSondaSpan.innerText = partInfo.sondaId || 'Não informada';
                sondaModeloSpan.innerText = 'Não informado';
                sondaResponsavelSpan.innerText = 'Não informado';
            }
            
            currentLocationSpan.innerText = partInfo.currentLocation;
            fromLocationInput.value = partInfo.currentLocation;
            partInfoDiv.style.display = 'block';
            hideLoading();
            showToast('Peça carregada!', 'success');
        } catch (error) {
            hideLoading();
            showToast('Erro ao buscar peça', 'error');
        }
    });
};

manualSearchBtn.onclick = async () => {
    const partId = manualPartCode.value.trim();
    if (!partId) {
        showToast('Digite o código da peça', 'warning');
        return;
    }
    
    resetPartInfo();
    showLoading('Buscando peça...');
    
    try {
        const partInfo = await getPartInfoOfflineFirst(partId);
        if (partInfo.error) {
            showToast(partInfo.error, 'error');
            hideLoading();
            return;
        }
        
        currentPart = partInfo;
        partNameSpan.innerText = partInfo.partName;
        
        if (partInfo.sondaInfo && !partInfo.sondaInfo.error) {
            partSondaSpan.innerText = partInfo.sondaId;
            sondaModeloSpan.innerText = partInfo.sondaInfo.modelo || 'Não informado';
            sondaResponsavelSpan.innerText = partInfo.sondaInfo.responsavel || 'Não informado';
        } else {
            partSondaSpan.innerText = partInfo.sondaId || 'Não informada';
            sondaModeloSpan.innerText = 'Não informado';
            sondaResponsavelSpan.innerText = 'Não informado';
        }
        
        currentLocationSpan.innerText = partInfo.currentLocation;
        fromLocationInput.value = partInfo.currentLocation;
        partInfoDiv.style.display = 'block';
        hideLoading();
        showToast(`Peça ${partInfo.partName} carregada!`, 'success');
        manualPartCode.value = '';
    } catch (error) {
        hideLoading();
        showToast('Erro ao buscar peça', 'error');
    }
};

manualPartCode.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') manualSearchBtn.click();
});

movementForm.onsubmit = async (e) => {
    e.preventDefault();
    
    if (!currentPart) {
        showToast('Nenhuma peça selecionada', 'warning');
        return;
    }
    
    const toLocation = toLocationSelect.value;
    
    if (toLocation === 'Oficina') {
        showToast('ATENÇÃO: Peça enviada para manutenção! Alerta enviado por e-mail.', 'warning');
    }
    
    const data = {
        operatorMatricula: currentOperator.matricula,
        partId: currentPart.partId,
        sondaId: currentPart.sondaId || '',
        fromLocation: fromLocationInput.value,
        toLocation: toLocation,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value || ""
    };
    
    showLoading('Registrando movimentação...');
    
    try {
        let result;
        if (navigator.onLine) {
            result = await addLog(data);
        } else {
            result = { success: false, offline: true };
        }
        
        if (result.success) {
            showToast('Movimentação registrada!', 'success');
            resetPartInfo();
            await syncPendingMovements();
        } else if (!navigator.onLine || result.offline) {
            savePendingMovement(data);
            resetPartInfo();
        } else {
            showToast('Erro ao registrar', 'error');
        }
    } catch (error) {
        savePendingMovement(data);
        resetPartInfo();
    }
    hideLoading();
};

syncNowBtn.onclick = async () => {
    await syncPendingMovements();
    if (pendingMovements.length === 0) {
        hidePendingSection();
    }
};

// ===================== VERIFICAÇÃO INICIAL =====================
console.log("Tools Scan Iniciado");
console.log("Modo simulação:", MODO_SIMULACAO ? "ATIVADO" : "DESATIVADO");

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    console.log("Camera API suportada");
} else {
    console.warn("Camera API NÃO suportada");
}

if (typeof jsQR !== 'undefined') {
    console.log("Biblioteca jsQR carregada");
}

if (navigator.onLine) {
    setTimeout(() => syncPendingMovements(), 2000);
}
