// ===================== CONFIGURAÇÃO =====================
const API_BASE = "https://script.google.com/macros/s/AKfycbz5XgXIHsaSLgQ4NxvM2Ay-NaBjJvq20txCUDNDJFI9SODK7O7JZQJ4w9-raHaUMdGl/exec";

// ===================== CONFIGURAÇÕES =====================
const MODO_SIMULACAO = false;

// Variáveis globais
let currentOperator = null;
let currentPart = null;
let cameraStream = null;
let scanInterval = null;

// Offline - movimentações pendentes
let pendingMovements = [];

// ===================== ELEMENTOS DO DOM =====================
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const operatorInfoDiv = document.getElementById('operator-info');
const scanPartBtn = document.getElementById('scan-part-btn');
const partInfoDiv = document.getElementById('part-info');
const partNameSpan = document.getElementById('part-name');
const partSondaSpan = document.getElementById('part-sonda');
const currentLocationSpan = document.getElementById('current-location');
const fromLocationInput = document.getElementById('from-location');
const movementForm = document.getElementById('movement-form');
const scanBadgeBtn = document.getElementById('scan-badge-btn');
const matriculaInput = document.getElementById('matricula');
const loginBtn = document.getElementById('login-btn');
const toLocationSelect = document.getElementById('to-location');
const sondaSelector = document.getElementById('sonda-selector');
const sondaNumberSelect = document.getElementById('sonda-number');
const submitBtn = document.getElementById('submit-btn');

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
    document.querySelector('.loading-text').textContent = text;
    loading.style.display = 'flex';
}

function hideLoading() {
    loading.style.display = 'none';
}

// ===================== OFFLINE - SALVAR MOVIMENTAÇÕES =====================
function savePendingMovement(data) {
    pendingMovements.push({
        ...data,
        timestamp: new Date().toISOString(),
        operator: currentOperator
    });
    localStorage.setItem('pendingMovements', JSON.stringify(pendingMovements));
    showToast('📱 Sem conexão. Movimentação salva localmente.', 'warning');
}

async function syncPendingMovements() {
    if (!navigator.onLine) return;
    if (pendingMovements.length === 0) return;
    
    showToast(`🔄 Sincronizando ${pendingMovements.length} movimentações...`, 'info');
    showLoading('Sincronizando dados...');
    
    const failed = [];
    
    for (const movement of pendingMovements) {
        try {
            const result = await addLog(movement);
            if (!result.success) failed.push(movement);
        } catch (error) {
            failed.push(movement);
        }
    }
    
    if (failed.length === 0) {
        pendingMovements = [];
        localStorage.removeItem('pendingMovements');
        showToast('✅ Todas as movimentações sincronizadas!', 'success');
    } else {
        pendingMovements = failed;
        localStorage.setItem('pendingMovements', JSON.stringify(failed));
        showToast(`⚠️ ${failed.length} movimentações pendentes`, 'warning');
    }
    
    hideLoading();
}

// Carregar movimentações pendentes do localStorage
try {
    const saved = localStorage.getItem('pendingMovements');
    if (saved) pendingMovements = JSON.parse(saved);
    if (pendingMovements.length > 0) {
        showToast(`📦 ${pendingMovements.length} movimentações pendentes`, 'info');
    }
} catch(e) {}

window.syncPendingMovements = syncPendingMovements;

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
            sonda: data.sonda || "",
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

// ===================== CÂMERA CORRIGIDA =====================
async function startCamera(callback) {
    if (MODO_SIMULACAO) {
        showToast('🔧 Modo simulação: Peça P001', 'info');
        callback("P001");
        return;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('❌ Navegador não suporta câmera', 'error');
        return;
    }
    
    cameraScreen.style.display = 'block';
    scanMessage.innerText = '📷 Solicitando permissão...';
    
    // Configurações de fallback para celular
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
        scanMessage.innerText = '❌ Erro ao acessar câmera';
        showToast('❌ Não foi possível acessar a câmera', 'error');
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
    
    scanMessage.innerText = '📷 Aponte para o QR Code';
    startQRScanning(callback);
}

function startQRScanning(callback) {
    const canvas = cameraCanvas;
    const context = canvas.getContext('2d');
    let lastScanTime = 0;
    const SCAN_DELAY = 1000;
    
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
            scanMessage.innerText = '✅ QR Code detectado!';
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
    operatorInfoDiv.innerText = `👤 Operador: ${currentOperator.name} (${currentOperator.matricula})`;
    showToast(`Bem-vindo, ${currentOperator.name}!`, 'success');
}

function resetPartInfo() {
    partInfoDiv.style.display = 'none';
    movementForm.reset();
    currentPart = null;
}

// Mostrar seletor de sonda quando escolher "Praça de Sondagem"
toLocationSelect.addEventListener('change', () => {
    if (toLocationSelect.value === 'Praça de Sondagem') {
        sondaSelector.style.display = 'block';
    } else {
        sondaSelector.style.display = 'none';
    }
});

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
            const partInfo = await getPartInfo(qrCode);
            if (partInfo.error) {
                showToast(partInfo.error, 'error');
                hideLoading();
                return;
            }
            
            currentPart = partInfo;
            partNameSpan.innerText = partInfo.partName;
            partSondaSpan.innerText = partInfo.sonda || 'Não informada';
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

movementForm.onsubmit = async (e) => {
    e.preventDefault();
    
    if (!currentPart) {
        showToast('Nenhuma peça selecionada', 'warning');
        return;
    }
    
    let toLocation = toLocationSelect.value;
    let sonda = '';
    
    if (toLocation === 'Praça de Sondagem') {
        sonda = sondaNumberSelect.value;
        toLocation = `${sonda}`;
    }
    
    const data = {
        operatorMatricula: currentOperator.matricula,
        partId: currentPart.partId,
        sonda: currentPart.sonda || '',
        fromLocation: fromLocationInput.value,
        toLocation: toLocation,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value || ""
    };
    
    showLoading('Registrando movimentação...');
    
    // Alerta se for para oficina
    if (toLocationSelect.value === 'Oficina') {
        showToast('🔧 ATENÇÃO: Acionar time de manutenção!', 'warning');
    }
    
    try {
        let result;
        if (navigator.onLine) {
            result = await addLog(data);
        } else {
            result = { success: false, offline: true };
        }
        
        if (result.success) {
            showToast('✅ Movimentação registrada!', 'success');
            resetPartInfo();
            // Tentar sincronizar pendentes
            await syncPendingMovements();
        } else if (!navigator.onLine || result.offline) {
            savePendingMovement(data);
            resetPartInfo();
        } else {
            showToast('❌ Erro ao registrar', 'error');
        }
    } catch (error) {
        savePendingMovement(data);
        resetPartInfo();
    }
    hideLoading();
};

// ===================== VERIFICAÇÃO INICIAL =====================
console.log("=== 🚀 Tools Scan Iniciado ===");
console.log("🎮 Modo simulação:", MODO_SIMULACAO ? "ATIVADO" : "DESATIVADO");

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    console.log("✅ Camera API suportada");
} else {
    console.warn("⚠️ Camera API NÃO suportada");
}

if (typeof jsQR !== 'undefined') {
    console.log("✅ Biblioteca jsQR carregada");
}

if (navigator.onLine) {
    syncPendingMovements();
}
