// ===================== CONFIGURAÇÃO =====================
const API_BASE = "https://script.google.com/macros/s/AKfycbzUAtKnQALTRGdCG7u78lJPY33Gwp16hoddCMtJXUmMgN8xgZBAlwSETlSYJOIEcXGW/exec";

// ===================== CONFIGURAÇÕES DE TESTE =====================
// Altere para true se quiser TESTAR SEM CÂMERA (simula leitura da peça P001)
const MODO_SIMULACAO = false;

// Variáveis globais
let currentOperator = null;
let currentPart = null;
let cameraStream = null;
let scanInterval = null;

// ===================== ELEMENTOS DO DOM =====================
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const operatorInfoDiv = document.getElementById('operator-info');
const scanPartBtn = document.getElementById('scan-part-btn');
const partInfoDiv = document.getElementById('part-info');
const partNameSpan = document.getElementById('part-name');
const currentLocationSpan = document.getElementById('current-location');
const fromLocationInput = document.getElementById('from-location');
const movementForm = document.getElementById('movement-form');
const scanBadgeBtn = document.getElementById('scan-badge-btn');
const matriculaInput = document.getElementById('matricula');
const loginBtn = document.getElementById('login-btn');

// Elementos da câmera
const cameraScreen = document.getElementById('camera-screen');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const closeCameraBtn = document.getElementById('close-camera-btn');
const scanMessage = document.getElementById('scan-message');

// ===================== FUNÇÕES DA API =====================

async function authenticate(matricula) {
    try {
        const url = `${API_BASE}?action=authenticate&matricula=${encodeURIComponent(matricula)}`;
        console.log("🔐 Autenticando:", url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("✅ Resposta autenticação:", data);
        return data;
    } catch (error) {
        console.error("❌ Erro na autenticação:", error);
        throw error;
    }
}

async function getPartInfo(partId) {
    try {
        const url = `${API_BASE}?action=getPartInfo&partId=${encodeURIComponent(partId)}`;
        console.log("🔍 Buscando peça:", url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("✅ Resposta peça:", data);
        return data;
    } catch (error) {
        console.error("❌ Erro ao buscar peça:", error);
        throw error;
    }
}

async function addLog(data) {
    try {
        const params = new URLSearchParams({
            action: "addLog",
            operatorMatricula: data.operatorMatricula,
            partId: data.partId,
            fromLocation: data.fromLocation,
            toLocation: data.toLocation,
            status: data.status,
            notes: data.notes || ""
        });
        
        const url = `${API_BASE}?${params.toString()}`;
        console.log("📤 Enviando log (GET):", url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log("✅ Resposta log:", result);
        return result;
    } catch (error) {
        console.error("❌ Erro ao enviar log:", error);
        throw error;
    }
}

// ===================== FUNÇÕES DE CÂMERA =====================

async function startCamera(callback) {
    // Modo simulação
    if (MODO_SIMULACAO) {
        console.log("🎮 Modo simulação: usando peça P001");
        alert("🔧 MODO TESTE: Simulando leitura da peça P001");
        callback("P001");
        return;
    }
    
    // Verificar suporte a câmera
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Seu navegador não suporta acesso à câmera.");
        return;
    }
    
    // Mostrar tela da câmera
    cameraScreen.style.display = 'block';
    scanMessage.innerText = '📷 Iniciando câmera...';
    scanMessage.style.background = 'rgba(0,0,0,0.8)';
    
    try {
        // Tentar câmera traseira primeiro
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { exact: "environment" } }
            });
        } catch (e) {
            // Se não conseguir câmera traseira, tenta qualquer câmera
            console.log("Tentando câmera padrão...");
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        
        cameraVideo.srcObject = cameraStream;
        
        // Aguardar o vídeo carregar
        await new Promise((resolve) => {
            cameraVideo.onloadedmetadata = () => {
                cameraVideo.play();
                resolve();
            };
        });
        
        scanMessage.innerText = '📷 Aponte para o QR Code';
        scanMessage.style.background = 'rgba(0,0,0,0.8)';
        
        // Iniciar a leitura contínua
        startQRScanning(callback);
        
    } catch (error) {
        console.error("❌ Erro ao acessar câmera:", error);
        scanMessage.innerText = '❌ Erro ao acessar câmera';
        scanMessage.style.background = 'rgba(220, 53, 69, 0.9)';
        
        setTimeout(() => {
            stopCamera();
            alert("Não foi possível acessar a câmera.\n\nVerifique as permissões do navegador.");
        }, 2000);
    }
}

function startQRScanning(callback) {
    const canvas = cameraCanvas;
    const context = canvas.getContext('2d');
    let lastScanTime = 0;
    const SCAN_DELAY = 1000; // Aguardar 1 segundo entre leituras
    
    scanInterval = setInterval(() => {
        if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) return;
        
        const now = Date.now();
        if (now - lastScanTime < SCAN_DELAY) return;
        
        // Configurar canvas com o tamanho do vídeo
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        
        // Desenhar o frame do vídeo no canvas
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
        
        // Obter os dados da imagem
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Tentar decodificar QR Code
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });
        
        if (code) {
            // QR Code encontrado!
            console.log("✅ QR Code detectado:", code.data);
            lastScanTime = now;
            
            // Mostrar mensagem de sucesso
            scanMessage.innerText = '✅ QR Code detectado!';
            scanMessage.style.background = 'rgba(40, 167, 69, 0.9)';
            
            // Parar a leitura
            clearInterval(scanInterval);
            scanInterval = null;
            
            // Parar câmera e chamar callback
            setTimeout(() => {
                stopCamera();
                callback(code.data);
            }, 500);
        }
    }, 200); // Verifica a cada 200ms para maior fluidez
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

// Fechar câmera manualmente
if (closeCameraBtn) {
    closeCameraBtn.onclick = () => {
        stopCamera();
    };
}

// ===================== FUNÇÕES DE INTERFACE =====================

function showMainScreen() {
    loginScreen.style.display = 'none';
    mainScreen.style.display = 'block';
    operatorInfoDiv.innerText = `👤 Operador: ${currentOperator.name} (${currentOperator.matricula})`;
    console.log("🎉 Login realizado com sucesso!");
}

function resetPartInfo() {
    partInfoDiv.style.display = 'none';
    movementForm.reset();
    currentPart = null;
    console.log("🔄 Informações da peça resetadas");
}

// ===================== EVENTOS =====================

// Login com matrícula
loginBtn.onclick = async () => {
    const matricula = matriculaInput.value.trim();
    if (!matricula) {
        alert("Digite a matrícula");
        return;
    }
    
    try {
        console.log("🔐 Tentando login com matrícula:", matricula);
        const result = await authenticate(matricula);
        
        if (result.success) {
            currentOperator = result;
            showMainScreen();
        } else {
            alert(result.error || "Operador não encontrado");
        }
    } catch (error) {
        console.error("❌ Erro no login:", error);
        alert("Erro ao conectar com o servidor. Verifique sua conexão.");
    }
};

// Login com QR Code do crachá
scanBadgeBtn.onclick = () => {
    console.log("🎫 Iniciando leitura do QR Code do crachá...");
    startCamera(async (qrCode) => {
        try {
            console.log("📱 QR Code do crachá lido:", qrCode);
            const result = await authenticate(qrCode);
            
            if (result.success) {
                currentOperator = result;
                showMainScreen();
            } else {
                alert("QR Code inválido - Operador não encontrado");
            }
        } catch (error) {
            console.error("❌ Erro na autenticação por QR:", error);
            alert("Erro ao autenticar com QR Code");
        }
    });
};

// Escanear peça
scanPartBtn.onclick = () => {
    console.log("🔍 Iniciando leitura do QR Code da peça...");
    resetPartInfo();
    startCamera(async (qrCode) => {
        try {
            const partId = qrCode;
            console.log("📦 Peça escaneada:", partId);
            const partInfo = await getPartInfo(partId);
            
            if (partInfo.error) {
                alert(partInfo.error);
                return;
            }
            
            currentPart = partInfo;
            partNameSpan.innerText = partInfo.partName;
            currentLocationSpan.innerText = partInfo.currentLocation;
            fromLocationInput.value = partInfo.currentLocation;
            partInfoDiv.style.display = 'block';
            
            console.log("✅ Informações da peça carregadas:", partInfo);
            
        } catch (error) {
            console.error("❌ Erro ao obter informações da peça:", error);
            alert("Erro ao obter informações da peça");
        }
    });
};

// Envio do formulário de movimentação
movementForm.onsubmit = async (e) => {
    e.preventDefault();
    
    if (!currentPart) {
        alert("Nenhuma peça selecionada");
        return;
    }
    
    const toLocation = document.getElementById('to-location').value;
    const status = document.getElementById('status').value;
    const notes = document.getElementById('notes').value;
    
    const data = {
        operatorMatricula: currentOperator.matricula,
        partId: currentPart.partId,
        fromLocation: fromLocationInput.value,
        toLocation: toLocation,
        status: status,
        notes: notes || ""
    };
    
    console.log("📝 Dados da movimentação:", data);
    
    try {
        const result = await addLog(data);
        
        if (result.success) {
            alert("✅ Movimentação registrada com sucesso!");
            console.log("✅ Movimentação registrada:", result);
            resetPartInfo();
        } else {
            alert("❌ Erro ao registrar: " + (result.error || "Erro desconhecido"));
        }
    } catch (error) {
        console.error("❌ Erro ao enviar movimentação:", error);
        alert("Erro ao enviar movimentação. Verifique sua conexão.");
    }
};

// ===================== VERIFICAÇÃO INICIAL =====================
console.log("=== 🚀 App Iniciado ===");
console.log("📡 API Base:", API_BASE);
console.log("🎮 Modo simulação:", MODO_SIMULACAO ? "ATIVADO ✅" : "DESATIVADO ❌");

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    console.log("✅ Camera API suportada");
} else {
    console.warn("⚠️ Camera API NÃO suportada");
}

if (typeof jsQR !== 'undefined') {
    console.log("✅ Biblioteca jsQR carregada");
} else {
    console.warn("⚠️ Biblioteca jsQR NÃO carregada");
}

console.log("=== 🚀 App Pronto ===");