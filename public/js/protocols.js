class ProtocolManager {
    constructor() {
        // Fase 1 já começa "ativa" visualmente para confirmação
        this.currentPhase = 1;
    }

    async activatePhase(phaseId) {
        const btn = document.querySelector(`#phase-${phaseId} .action-btn`);
        const originalText = btn.innerHTML;
        
        // Feedback visual de carregamento
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Enviando Alertas...';
        btn.disabled = true;

        try {
            // Chama o Backend
            const response = await fetch('/api/v1/emergency/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phase: phaseId,
                    user: 'Operador (Manual)' // Em um sistema real, viria do login
                })
            });

            const data = await response.json();

            if (data.success) {
                // Marca atual como concluída
                const currentCard = document.getElementById(`phase-${phaseId}`);
                currentCard.classList.add('completed');
                currentCard.classList.remove('active');
                
                // Atualiza botão
                btn.innerHTML = `<i class="fas fa-check"></i> Enviado: ${new Date().toLocaleTimeString()}`;

                // Desbloqueia próxima fase (se houver)
                const nextPhaseId = phaseId + 1;
                const nextCard = document.getElementById(`phase-${nextPhaseId}`);
                
                if (nextCard) {
                    // Pequeno delay para animação
                    setTimeout(() => {
                        nextCard.classList.add('active');
                        // Scroll suave até o próximo card
                        nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 500);
                } else {
                    alert("⚠️ PROTOCOLO FINAL EXECUTADO. Mantenha a calma e aguarde as autoridades.");
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