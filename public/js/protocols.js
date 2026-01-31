class ProtocolManager {
    constructor() {
        this.currentPhase = 1;
    }

    async activatePhase(phaseId) {
        const btn = document.querySelector(`#phase-${phaseId} .btn-activate`);
        const originalText = btn.innerHTML;
        
        // Feedback visual de carregamento
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Enviando Alertas...';
        btn.disabled = true;

        try {
            // Chama o Backend para registrar e notificar
            const response = await fetch('/api/v1/emergency/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phase: phaseId,
                    user: 'Operador (Manual)'
                })
            });

            const data = await response.json();

            if (data.success) {
                // Marca atual como concluída
                const currentCard = document.getElementById(`phase-${phaseId}`);
                currentCard.classList.add('completed');
                currentCard.classList.remove('active');
                
                // Atualiza botão para indicar sucesso (ou esconde, dependendo do CSS)
                btn.innerHTML = `<i class="fas fa-check"></i> Acionado: ${new Date().toLocaleTimeString()}`;

                // --- LÓGICA ESPECÍFICA DA FASE 4 (BOMBEIROS) ---
                if (phaseId === 4) {
                    // Mostra o painel de integração automaticamente
                    const integrationPanel = document.getElementById('fire-integration-ui');
                    if (integrationPanel) {
                        integrationPanel.style.display = 'block';
                        // Animação simples de entrada
                        integrationPanel.style.opacity = '0';
                        setTimeout(() => integrationPanel.style.opacity = '1', 100);
                        integrationPanel.style.transition = 'opacity 0.5s ease';
                    }
                }

                // Desbloqueia próxima fase (se houver)
                const nextPhaseId = phaseId + 1;
                const nextCard = document.getElementById(`phase-${nextPhaseId}`);
                
                if (nextCard) {
                    setTimeout(() => {
                        nextCard.classList.add('active');
                        nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 500);
                } else if (phaseId !== 4) {
                    // Se não for a fase 4 e não tiver próxima, alerta final
                    alert("⚠️ PROTOCOLO FINAL EXECUTADO.");
                }

            } else {
                throw new Error(data.message);
            }

        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao acionar protocolo. Use o rádio manual!');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// Inicializa
const protocolManager = new ProtocolManager();