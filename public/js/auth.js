class AuthManager {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('belfire_user'));
        this.checkAuth();
    }

    checkAuth() {
        const path = window.location.pathname;
        const page = path.split("/").pop();

        // Se estiver na tela de login, não faz nada
        if (page === 'login.html') {
            if (this.currentUser) window.location.href = 'index.html'; // Já tá logado
            return;
        }

        // Se não tiver usuário e não for tela pública (como emergency.html), chuta pro login
        if (!this.currentUser && page !== 'emergency.html') {
            window.location.href = 'login.html';
            return;
        }

        // Se for Operador, bloqueia Configurações
        if (this.currentUser && this.currentUser.role === 'operator') {
            if (page === 'settings.html') {
                alert('Acesso Negado: Apenas Administradores.');
                window.location.href = 'index.html';
            }
            // Esconde o menu visualmente
            this.hideRestrictedMenus();
        }

        this.updateUI();
    }

    async login(username, password) {
        const btn = document.querySelector('.btn-login');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        
        try {
            const res = await fetch('/api/v1/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (data.success) {
                localStorage.setItem('belfire_user', JSON.stringify(data.user));
                window.location.href = 'index.html';
            } else {
                document.getElementById('error-msg').style.display = 'block';
                btn.innerHTML = 'ENTRAR';
            }
        } catch (e) {
            alert('Erro de conexão com o servidor.');
            btn.innerHTML = 'ENTRAR';
        }
    }

    logout() {
        if(confirm('Deseja sair do sistema?')) {
            localStorage.removeItem('belfire_user');
            window.location.href = 'login.html';
        }
    }

    hideRestrictedMenus() {
        // Aguarda o DOM carregar
        window.addEventListener('DOMContentLoaded', () => {
            const settingsLink = document.querySelector('a[href="settings.html"]');
            if (settingsLink) settingsLink.style.display = 'none';
        });
    }

    updateUI() {
        // Adiciona botão de logout no menu se não existir
        window.addEventListener('DOMContentLoaded', () => {
            const menu = document.querySelector('.menu-items');
            if (menu && !document.getElementById('btn-logout')) {
                const logoutHtml = `
                    <a href="#" class="menu-item" id="btn-logout" onclick="authManager.logout()" style="margin-top:auto; border-top:1px solid #334155;">
                        <i class="fas fa-sign-out-alt"></i><span>Sair (${this.currentUser.name})</span>
                    </a>
                `;
                menu.insertAdjacentHTML('beforeend', logoutHtml);
            }
        });
    }
}

const authManager = new AuthManager();