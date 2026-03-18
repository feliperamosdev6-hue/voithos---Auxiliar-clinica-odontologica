document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  const emailInput = document.getElementById('login-email');
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const authApi = window.appApi?.auth || window.auth;

  const setError = (message) => {
    if (errorMessage) errorMessage.textContent = message || '';
  };

  const redirectAfterLogin = (user) => {
    if (user?.tipo === 'super_admin') {
      window.location.href = 'super-admin.html';
      return;
    }
    if (user?.mustChangePassword && !user?.isImpersonatedSession) {
      window.location.href = 'change-password.html';
      return;
    }
    window.location.href = 'index.html';
  };

  const checkActiveSession = async () => {
    if (!authApi?.currentUser) return;
    try {
      const user = await authApi.currentUser();
      if (user) {
        if (user.tipo === 'super_admin') {
          // Evita prender o usuario na area de super admin por sessao antiga.
          return;
        }
        redirectAfterLogin(user);
      }
    } catch (err) {
      console.warn('Nao foi possivel validar sessao existente.', err);
    }
  };

  forgotPasswordLink?.addEventListener('click', (event) => {
    event.preventDefault();
    window.alert('Fluxo de recuperacao de senha em desenvolvimento. Contate o administrador da clinica.');
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const email = String(emailInput?.value || '').trim().toLowerCase();
    const senha = String(loginForm?.senha?.value || '').trim();

    if (!email || !senha) {
      setError('Informe e-mail e senha.');
      return;
    }

    if (!authApi?.login) {
      setError('Login indisponivel neste ambiente.');
      return;
    }

    try {
      const result = await authApi.login({ email, senha });
      if (result?.success && result?.user) {
        redirectAfterLogin(result.user);
        return;
      }
      setError('Falha no login. Verifique suas credenciais.');
    } catch (err) {
      console.error('Erro no login', err);
      setError(err?.message || 'Falha no login. Verifique suas credenciais.');
    }
  });

  checkActiveSession();
});
