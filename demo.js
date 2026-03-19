(function () {
  const DEMO_KEY = 'voithos_demo_session';
  const profiles = {
    admin: {
      id: 'admin',
      roleLabel: 'Admin',
      summary: 'Visao ampla da operacao, configuracoes e panorama do produto.',
      badges: [
        { label: 'Escopo', value: 'Gestao e visao geral' },
        { label: 'Foco', value: 'Operacao e administracao' },
        { label: 'Modo', value: 'Demonstracao curada' }
      ]
    },
    recepcao: {
      id: 'recepcao',
      roleLabel: 'Recepcao',
      summary: 'Fluxo orientado a agenda, cadastro, atendimento e rotina diaria.',
      badges: [
        { label: 'Escopo', value: 'Agenda e atendimento' },
        { label: 'Foco', value: 'Recepcao e operacao' },
        { label: 'Modo', value: 'Demonstracao curada' }
      ]
    },
    dentista: {
      id: 'dentista',
      roleLabel: 'Dentista',
      summary: 'Fluxo voltado a prontuario, paciente e contexto clinico.',
      badges: [
        { label: 'Escopo', value: 'Prontuario e paciente' },
        { label: 'Foco', value: 'Contexto clinico' },
        { label: 'Modo', value: 'Demonstracao curada' }
      ]
    }
  };

  const modulesByProfile = {
    admin: [
      { title: 'Dashboard operacional', copy: 'Visao consolidada dos principais blocos do produto para leitura rapida da operacao.', media: 'docs/screenshots/02-dashboard.gif', link: 'index.html', cta: 'Ver tela base' },
      { title: 'Gestao e indicadores', copy: 'Painel administrativo com foco em visibilidade gerencial e acompanhamento operacional.', media: 'docs/screenshots/09-gestao.gif', link: 'gestao.html', cta: 'Abrir modulo' },
      { title: 'Configuracoes da clinica', copy: 'Parametros e ajustes do ambiente com foco em profundidade funcional do produto.', media: 'docs/screenshots/07-configuracoes.gif', link: 'clinica.html', cta: 'Abrir modulo' },
      { title: 'WhatsApp NG', copy: 'Engine dedicado de mensageria, isolado da aplicacao principal para reduzir acoplamento.', media: 'docs/screenshots/11-whatsapp-ng-dashboard.gif', link: 'whatsapp-engine/public/admin/index.html', cta: 'Ver engine' }
    ],
    recepcao: [
      { title: 'Agenda diaria', copy: 'Fluxo central para acompanhamento dos compromissos e da rotina de atendimento.', media: 'docs/screenshots/03-agenda-dia.gif', link: 'agenda-dia.html', cta: 'Abrir modulo' },
      { title: 'Agendamentos', copy: 'Tela dedicada para organizacao e acompanhamento das marcacoes da clinica.', media: 'docs/screenshots/04-agendamentos.png', link: 'agendamentos.html', cta: 'Abrir modulo' },
      { title: 'Cadastro de paciente', copy: 'Entrada cadastral simples para continuidade da jornada do paciente dentro da plataforma.', media: 'docs/screenshots/08-cadastro-paciente.gif', link: 'cadastro-paciente.html', cta: 'Abrir modulo' },
      { title: 'Dashboard', copy: 'Resumo rapido da operacao para orientar a recepcao no inicio do dia.', media: 'docs/screenshots/02-dashboard.gif', link: 'index.html', cta: 'Ver tela base' }
    ],
    dentista: [
      { title: 'Prontuario', copy: 'Concentracao de historico, dados clinicos e contexto do paciente.', media: 'docs/screenshots/06-prontuario.gif', link: 'prontuario.html', cta: 'Abrir modulo' },
      { title: 'Agenda diaria', copy: 'Leitura rapida da rotina de atendimentos do dia.', media: 'docs/screenshots/03-agenda-dia.gif', link: 'agenda-dia.html', cta: 'Abrir modulo' },
      { title: 'Configuracoes e contexto da clinica', copy: 'Parametrizacao do ambiente com foco em consistencia operacional.', media: 'docs/screenshots/07-configuracoes.gif', link: 'clinica.html', cta: 'Abrir modulo' },
      { title: 'WhatsApp NG', copy: 'Exemplo de camada de integracao separada do produto principal.', media: 'docs/screenshots/11-whatsapp-ng-dashboard.gif', link: 'whatsapp-engine/public/admin/index.html', cta: 'Ver engine' }
    ]
  };

  const persistSession = (profileId) => {
    if (!profiles[profileId]) return;
    localStorage.setItem(DEMO_KEY, JSON.stringify({ isDemo: true, profileId: profileId, createdAt: Date.now() }));
  };
  const clearSession = () => localStorage.removeItem(DEMO_KEY);
  const getSession = () => {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };
  const redirectToDashboard = () => { window.location.href = 'demo-dashboard.html'; };
  const redirectToEntry = () => { window.location.href = 'demo.html'; };

  const setupEntryPage = () => {
    document.querySelectorAll('[data-profile]').forEach((button) => {
      button.addEventListener('click', () => {
        persistSession(button.dataset.profile);
        redirectToDashboard();
      });
    });
  };

  const setupDashboardPage = () => {
    const session = getSession();
    const profile = session && session.profileId ? profiles[session.profileId] : null;
    if (!session || !session.isDemo || !profile) {
      redirectToEntry();
      return;
    }

    const title = document.getElementById('demo-profile-title');
    const description = document.getElementById('demo-profile-description');
    const summary = document.getElementById('demo-profile-summary');
    const grid = document.getElementById('demo-module-grid');

    if (title) title.textContent = 'Modo demonstracao: ' + profile.roleLabel;
    if (description) description.textContent = profile.summary;
    if (summary) {
      summary.innerHTML = profile.badges.map((item) => (
        '<article class="demo-summary-item"><strong>' + item.label + '</strong><p>' + item.value + '</p></article>'
      )).join('');
    }
    if (grid) {
      grid.innerHTML = (modulesByProfile[profile.id] || []).map((item) => (
        '<article class="demo-module-card">'
        + '<img class="demo-module-media" src="' + item.media + '" alt="' + item.title + '">'
        + '<div class="demo-module-copy">'
        + '<h3>' + item.title + '</h3>'
        + '<p>' + item.copy + '</p>'
        + '<a class="demo-module-link" href="' + item.link + '">' + item.cta + '</a>'
        + '</div></article>'
      )).join('');
    }

    document.getElementById('demo-switch-profile')?.addEventListener('click', redirectToEntry);
    document.getElementById('demo-exit')?.addEventListener('click', () => {
      clearSession();
      window.location.href = 'login.html';
    });
  };

  const path = window.location.pathname || '';
  if (path.endsWith('demo.html')) setupEntryPage();
  if (path.endsWith('demo-dashboard.html')) setupDashboardPage();

  window.__voithosDemo = { getSession, clearSession, persistSession };
})();
