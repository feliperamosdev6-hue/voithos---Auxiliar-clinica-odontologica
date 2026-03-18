(function () {
  const TOKEN_KEY = 'whatsapp_engine_admin_token';
  const page = document.body.dataset.page;
  const toastEl = document.getElementById('toast');
  const INSTANCES_PER_PAGE = 10;

  const VIEW_META = {
    dashboard: {
      eyebrow: 'Dashboard',
      title: 'Visao operacional do ambiente',
      description: 'Resumo do engine, saude da API, risco operacional e atividade recente das clinicas.',
    },
    instances: {
      eyebrow: 'Instancias',
      title: 'Centro operacional das clinicas',
      description: 'Filtros multi-clinica, lista paginada e drawer lateral de suporte por instancia.',
    },
    messages: {
      eyebrow: 'Mensagens',
      title: 'Operacao de jobs e envios',
      description: 'Resumo do dia, filtros fortes e navegacao cruzada para clinicas e instancias relacionadas.',
    },
    webhooks: {
      eyebrow: 'Webhooks',
      title: 'Estrutura inicial de integracao',
      description: 'Base funcional para eventos suportados, payloads e futuras configuracoes persistidas.',
    },
    security: {
      eyebrow: 'Seguranca',
      title: 'Visao segura do ambiente',
      description: 'Token interno mascarado e estrutura visual preparada para sessoes, allowlist e auditoria.',
    },
    logs: {
      eyebrow: 'Logs',
      title: 'Suporte e diagnostico operacional',
      description: 'Eventos recentes com filtros por clinica, instancia e integracao cruzada com o modulo de suporte.',
    },
    settings: {
      eyebrow: 'Configuracoes',
      title: 'Modulo em preparacao',
      description: 'Estrutura reservada para preferencias do produto e parametros do ambiente.',
    },
  };

  const state = {
    instances: [],
    filteredInstances: [],
    paginatedInstances: [],
    selectedInstanceId: null,
    selectedInstanceDetails: null,
    selectedInstanceJobs: [],
    autoRefreshTimer: null,
    currentView: 'dashboard',
    apiHealthy: false,
    instanceSegment: '',
    instancesPage: 1,
    messagesLoaded: false,
    logsLoaded: false,
    webhooksLoaded: false,
    webhooksOverview: null,
    securityLoaded: false,
    selectedWebhookEvent: '',
    selectedDetailsTab: 'overview',
    messageSummary: {
      sentToday: 0,
      failedToday: 0,
      queuedToday: 0,
      processingToday: 0,
    },
  };

  function showToast(message, type) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `toast ${type || ''}`.trim();
    toastEl.classList.remove('hidden');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 3200);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  async function apiFetch(url, options) {
    const headers = new Headers(options?.headers || {});
    if (options?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data?.error?.message || 'Falha na requisicao.');
    }

    return data.data;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'connected') return 'status-connected';
    if (normalized === 'connecting') return 'status-connecting';
    if (normalized === 'error') return 'status-error';
    if (normalized === 'created') return 'status-created';
    return 'status-disconnected';
  }

  function jobStatusClass(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'SENT') return 'status-connected';
    if (normalized === 'PROCESSING') return 'status-connecting';
    if (normalized === 'FAILED' || normalized === 'BLOCKED') return 'status-error';
    return 'status-created';
  }

  function formatWebhookEventLabel(eventName) {
    const value = String(eventName || '').trim();
    if (!value) return 'Evento nao informado';
    const normalized = value.toLowerCase();
    if (normalized === 'connected') return 'Ao conectar';
    if (normalized === 'disconnected') return 'Ao desconectar';
    if (normalized === 'message received') return 'Ao receber';
    if (normalized === 'message sent') return 'Ao enviar';
    if (normalized === 'error') return 'Erros e falhas';
    return value;
  }

  function formatWebhookEventSupport(eventName) {
    const normalized = String(eventName || '').trim().toLowerCase();
    if (normalized === 'message received') return 'Entrega eventos de entrada e contexto do remetente.';
    if (normalized === 'message sent') return 'Cobertura de envio, confirmacao e rastreio basico.';
    if (normalized === 'connected') return 'Sinal de pareamento e socket ativo.';
    if (normalized === 'disconnected') return 'Sinaliza perda de sessao ou socket encerrado.';
    if (normalized === 'error') return 'Falhas operacionais e eventos criticos.';
    return 'Evento suportado pela camada estrutural atual.';
  }

  function setDetailsTab(tab) {
    state.selectedDetailsTab = tab === 'webhooks' ? 'webhooks' : 'overview';
    if (state.selectedDetailsTab === 'webhooks' && !state.webhooksLoaded) {
      void loadWebhooksModule();
    }
    document.querySelectorAll('.detail-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.detailTab === state.selectedDetailsTab);
    });
    document.querySelectorAll('.detail-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.detailPanel === state.selectedDetailsTab);
    });
  }

  function isRecentActivity(value, hours) {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp <= (hours || 24) * 60 * 60 * 1000;
  }

  function copyText(value, label) {
    navigator.clipboard.writeText(String(value || ''))
      .then(() => showToast(`${label} copiado.`, 'success'))
      .catch(() => showToast(`Falha ao copiar ${label.toLowerCase()}.`, 'error'));
  }

  function updateViewMeta(view) {
    const meta = VIEW_META[view] || VIEW_META.dashboard;
    const eyebrow = document.getElementById('page-eyebrow');
    const title = document.getElementById('page-title');
    const description = document.getElementById('page-description');
    if (eyebrow) eyebrow.textContent = meta.eyebrow;
    if (title) title.textContent = meta.title;
    if (description) description.textContent = meta.description;
  }

  function updateSummary(summary) {
    document.getElementById('summary-total').textContent = String(summary.total || 0);
    document.getElementById('summary-connected').textContent = String(summary.CONNECTED || 0);
    document.getElementById('summary-connecting').textContent = String(summary.CONNECTING || 0);
    document.getElementById('summary-disconnected').textContent = String(summary.DISCONNECTED || 0);
    document.getElementById('summary-error').textContent = String(summary.ERROR || 0);
    document.getElementById('dashboard-instances-error').textContent = String(summary.ERROR || 0);
  }

  function updateMessageSummary(summary) {
    state.messageSummary = {
      sentToday: summary.sentToday || 0,
      failedToday: summary.failedToday || 0,
      queuedToday: summary.queuedToday || 0,
      processingToday: summary.processingToday || 0,
    };

    document.getElementById('messages-sent-today').textContent = String(state.messageSummary.sentToday);
    document.getElementById('messages-failed-today').textContent = String(state.messageSummary.failedToday);
    document.getElementById('messages-queued-today').textContent = String(state.messageSummary.queuedToday);
    document.getElementById('messages-processing-today').textContent = String(state.messageSummary.processingToday);
    document.getElementById('dashboard-sent-today').textContent = String(state.messageSummary.sentToday);
    document.getElementById('dashboard-failed-today').textContent = String(state.messageSummary.failedToday);
    document.getElementById('dashboard-queued-today').textContent = String(state.messageSummary.queuedToday);
    document.getElementById('dashboard-processing-today').textContent = String(state.messageSummary.processingToday);
  }

  function updateConnectionIndicator(ok) {
    state.apiHealthy = ok;
    const indicator = document.getElementById('connection-indicator');
    const dashboardStatus = document.getElementById('dashboard-api-status');
    const dashboardRefresh = document.getElementById('dashboard-last-refresh');
    const lastRefresh = document.getElementById('last-refresh')?.textContent || 'Sem sincronizacao';

    if (indicator) {
      indicator.textContent = ok ? 'API online' : 'API com erro';
      indicator.className = `pill ${ok ? 'connected' : 'error'}`;
    }
    if (dashboardStatus) dashboardStatus.textContent = ok ? 'Online e respondendo' : 'Falha de comunicacao';
    if (dashboardRefresh) dashboardRefresh.textContent = lastRefresh;
  }

  function renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;
    const items = [...state.instances]
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.createdAt || 0) - new Date(a.lastSeenAt || a.updatedAt || a.createdAt || 0))
      .slice(0, 5);

    if (!items.length) {
      container.className = 'activity-list empty-state';
      container.textContent = 'Nenhuma atividade recente disponivel.';
      return;
    }

    container.className = 'activity-list';
    container.innerHTML = items.map((instance) => `
      <article class="activity-item">
        <div class="activity-item-head">
          <strong>${escapeHtml(instance.clinicId)}</strong>
          <span class="status-badge ${statusClass(instance.status)}">${escapeHtml(instance.status)}</span>
        </div>
        <p class="muted">${escapeHtml(instance.displayName || instance.id)}</p>
        <p class="muted">Ultima atividade em ${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt || instance.createdAt))}</p>
      </article>
    `).join('');
  }

  function renderRecentClinics() {
    const container = document.getElementById('recent-clinics');
    if (!container) return;
    const inactiveCount = state.instances.filter((item) => !isRecentActivity(item.lastSeenAt || item.updatedAt || item.createdAt, 24)).length;
    document.getElementById('dashboard-inactive-count').textContent = String(inactiveCount);

    const clinics = [...state.instances]
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.createdAt || 0) - new Date(a.lastSeenAt || a.updatedAt || a.createdAt || 0))
      .slice(0, 5);

    if (!clinics.length) {
      container.className = 'activity-list empty-state';
      container.textContent = 'Nenhuma clinica com atividade recente.';
      return;
    }

    container.className = 'activity-list';
    container.innerHTML = clinics.map((instance) => `
      <article class="activity-item">
        <div class="activity-item-head">
          <strong>${escapeHtml(instance.clinicId)}</strong>
          <span class="muted">${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt || instance.createdAt))}</span>
        </div>
        <p class="muted">${escapeHtml(instance.displayName || 'Sem displayName')}</p>
        <p class="muted">${escapeHtml(instance.phoneNumber || 'Sem numero vinculado')}</p>
      </article>
    `).join('');
  }

  function updateSegmentButtons() {
    document.querySelectorAll('.instance-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.instanceSegment === state.instanceSegment);
    });
  }

  function renderInstancesPagination() {
    const totalItems = state.filteredInstances.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / INSTANCES_PER_PAGE));
    const start = totalItems ? ((state.instancesPage - 1) * INSTANCES_PER_PAGE) + 1 : 0;
    const end = Math.min(totalItems, state.instancesPage * INSTANCES_PER_PAGE);
    const meta = document.getElementById('instances-pagination-meta');
    const prev = document.getElementById('instances-prev-page');
    const next = document.getElementById('instances-next-page');
    if (meta) meta.textContent = totalItems ? `Mostrando ${start}-${end} de ${totalItems} instancias` : 'Nenhuma instancia para exibir';
    if (prev) prev.disabled = state.instancesPage <= 1;
    if (next) next.disabled = state.instancesPage >= totalPages;
  }

  function renderInstancesTable() {
    const tbody = document.getElementById('instances-table-body');
    if (!tbody) return;

    if (!state.filteredInstances.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhuma instancia encontrada para os filtros atuais.</td></tr>';
      renderInstancesPagination();
      return;
    }

    const start = (state.instancesPage - 1) * INSTANCES_PER_PAGE;
    state.paginatedInstances = state.filteredInstances.slice(start, start + INSTANCES_PER_PAGE);
    tbody.innerHTML = state.paginatedInstances.map((instance) => `
      <tr class="${state.selectedInstanceId === instance.id ? 'selected-row' : ''} instance-row" data-open-instance-id="${escapeHtml(instance.id)}">
        <td>
          <span class="status-badge ${statusClass(instance.status)}">${escapeHtml(instance.status)}</span>
          <div class="row-hint">Clique para abrir o cockpit da clinica</div>
        </td>
        <td>
          <button class="table-link" data-open-instance-id="${escapeHtml(instance.id)}" type="button">${escapeHtml(instance.clinicId)}</button>
          <div class="row-secondary">${escapeHtml(instance.displayName || 'Clinica sem nome operacional')}</div>
        </td>
        <td>
          <button class="table-link" data-open-instance-id="${escapeHtml(instance.id)}" type="button">${escapeHtml(instance.id)}</button>
          <div class="row-secondary">${escapeHtml(instance.connectedInRuntime ? `Runtime ${instance.runtimeSocketState || 'OPEN'}` : `Runtime ${instance.runtimeSocketState || 'inativo'}`)}</div>
        </td>
        <td>${escapeHtml(instance.phoneNumber || '-')}</td>
        <td>${escapeHtml(instance.displayName || '-')}</td>
        <td>${escapeHtml(formatDate(instance.createdAt))}</td>
        <td>${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt))}</td>
        <td>
          <div class="instance-actions actions-inline">
            <button class="btn btn-secondary btn-small" data-action="details" data-id="${escapeHtml(instance.id)}" type="button">Detalhes</button>
            <button class="btn btn-secondary btn-small" data-action="status" data-id="${escapeHtml(instance.id)}" type="button">Status</button>
            <button class="btn btn-secondary btn-small" data-action="qr" data-id="${escapeHtml(instance.id)}" type="button">QR</button>
            <button class="btn btn-secondary btn-small" data-action="disconnect" data-id="${escapeHtml(instance.id)}" type="button">Desconectar</button>
            <button class="btn btn-ghost btn-small" data-action="delete" data-id="${escapeHtml(instance.id)}" type="button">Excluir</button>
            <button class="btn btn-secondary btn-small" data-action="test" data-id="${escapeHtml(instance.id)}" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button">Teste</button>
            <button class="btn btn-ghost btn-small" data-action="copy-instance" data-id="${escapeHtml(instance.id)}" type="button">Copiar instanceId</button>
            <button class="btn btn-ghost btn-small" data-action="copy-clinic" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button">Copiar clinicId</button>
          </div>
        </td>
      </tr>
    `).join('');
    renderInstancesPagination();
  }

  function renderInstanceShortcuts(instance) {
    const container = document.getElementById('instance-shortcuts');
    if (!container) return;

    if (!instance) {
      container.className = 'actions-inline empty-state';
      container.textContent = 'Selecione uma instancia para habilitar os atalhos.';
      return;
    }

    container.className = 'actions-inline';
    container.innerHTML = `
      <button class="btn btn-secondary btn-small" data-action="qr" data-id="${escapeHtml(instance.id)}" type="button">Gerar QR</button>
      <button class="btn btn-secondary btn-small" data-action="status" data-id="${escapeHtml(instance.id)}" type="button">Atualizar status</button>
      <button class="btn btn-secondary btn-small" data-action="disconnect" data-id="${escapeHtml(instance.id)}" type="button">Desconectar</button>
      <button class="btn btn-ghost btn-small" data-action="delete" data-id="${escapeHtml(instance.id)}" type="button">Excluir</button>
      <button class="btn btn-secondary btn-small" data-action="test" data-id="${escapeHtml(instance.id)}" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button">Teste de mensagem</button>
      <button class="btn btn-ghost btn-small" data-action="copy-instance" data-id="${escapeHtml(instance.id)}" type="button">Copiar instanceId</button>
      <button class="btn btn-ghost btn-small" data-action="copy-clinic" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button">Copiar clinicId</button>
    `;
  }

  function renderInstanceHealth(instance) {
    const container = document.getElementById('instance-health');
    if (!container) return;

    if (!instance) {
      container.className = 'stack empty-state';
      container.textContent = 'Selecione uma instancia para ver a saude operacional.';
      return;
    }

    const recent = isRecentActivity(instance.lastSeenAt || instance.updatedAt || instance.createdAt, 24);
    const webhookReady = Boolean(state.webhooksOverview?.supportedEvents?.length);
    container.className = 'stack';
    container.innerHTML = `
      <article class="security-item">
        <div>
          <strong>Saude da instancia</strong>
          <p class="muted">${instance.connectedInRuntime ? `Socket ativo em runtime (${instance.runtimeSocketState || 'OPEN'}).` : `Socket inativo no runtime atual (${instance.runtimeSocketState || 'CLOSED'}).`}</p>
        </div>
        <span class="toggle-chip">${instance.connectedInRuntime ? 'Runtime ativo' : 'Runtime inativo'}</span>
      </article>
      <article class="security-item">
        <div>
          <strong>Atividade recente</strong>
          <p class="muted">${recent ? 'A instancia teve atividade nas ultimas 24h.' : 'Sem atividade recente nas ultimas 24h.'}</p>
        </div>
        <span class="toggle-chip">${recent ? 'Recente' : 'Atencao'}</span>
      </article>
      <article class="security-item">
        <div>
          <strong>Webhook relacionado</strong>
          <p class="muted">${webhookReady ? 'Eventos e payloads ja estao mapeados para esta instancia no modulo visual.' : 'O modulo de webhooks ainda nao foi carregado nesta sessao.'}</p>
        </div>
        <span class="toggle-chip">${webhookReady ? 'Base pronta' : 'Pendente'}</span>
      </article>
    `;
  }

  function renderInstanceWebhooks(instance) {
    const container = document.getElementById('instance-webhooks');
    if (!container) return;

    if (!instance) {
      container.className = 'stack empty-state';
      container.textContent = 'Selecione uma instancia para configurar os webhooks desta clinica.';
      return;
    }

    const webhooks = state.webhooksOverview || {};
    const supportedEvents = Array.isArray(webhooks.supportedEvents) ? webhooks.supportedEvents : [];
    const configured = Boolean(webhooks.configured);
    const selectedEvent = state.selectedWebhookEvent && supportedEvents.includes(state.selectedWebhookEvent)
      ? state.selectedWebhookEvent
      : supportedEvents[0];
    const samplePayload = webhooks.samplePayloads?.[selectedEvent] || {};

    container.className = 'stack';
    container.innerHTML = `
      <div class="instance-webhook-hero">
        <div>
          <span class="pill ${instance.connectedInRuntime ? 'connected' : 'error'}">${instance.connectedInRuntime ? 'Instancia ativa' : 'Instancia em alerta'}</span>
          <h4>${escapeHtml(instance.clinicId)} <span class="muted">/ ${escapeHtml(instance.id)}</span></h4>
          <p class="muted">Painel de configuracao visual da instancia, mantendo o escopo compartilhado atual e preparando o desenho por clinica.</p>
        </div>
        <div class="instance-webhook-meta">
          <div class="health-card compact-card">
            <span class="health-label">URL de destino</span>
            <strong>${escapeHtml(webhooks.baseUrl || 'Nao configurada')}</strong>
            <p class="muted">${configured ? 'Configuracao estrutural carregada.' : 'Sem persistencia por instancia nesta fase.'}</p>
          </div>
          <div class="health-card compact-card">
            <span class="health-label">Escopo atual</span>
            <strong>${webhooks.supportsPerInstanceConfig ? 'Por instancia' : 'Compartilhado'}</strong>
            <p class="muted">${webhooks.supportsPerInstanceConfig ? 'A clinica pode ter regra propria.' : 'A regra visual segue a base global do engine.'}</p>
          </div>
        </div>
      </div>
      <div class="instance-webhook-grid">
        ${supportedEvents.map((eventName) => `
          <button
            class="instance-webhook-card ${selectedEvent === eventName ? 'active' : ''}"
            type="button"
            data-instance-webhook-event="${escapeHtml(eventName)}"
          >
            <span class="instance-webhook-card-copy">
              <strong>${escapeHtml(formatWebhookEventLabel(eventName))}</strong>
              <span class="muted">${escapeHtml(formatWebhookEventSupport(eventName))}</span>
            </span>
            <span class="toggle-chip">${configured ? 'Configurado' : 'Estrutural'}</span>
          </button>
        `).join('') || '<div class="empty-state">Nenhum evento suportado foi informado pelo engine.</div>'}
      </div>
      <div class="instance-webhook-preview-grid">
        <div class="health-card compact-card">
          <span class="health-label">Evento em foco</span>
          <strong>${escapeHtml(formatWebhookEventLabel(selectedEvent))}</strong>
          <p class="muted">${escapeHtml(formatWebhookEventSupport(selectedEvent))}</p>
        </div>
        <div class="health-card compact-card">
          <span class="health-label">Payload de exemplo</span>
          <pre>${escapeHtml(JSON.stringify(samplePayload, null, 2))}</pre>
        </div>
      </div>
    `;
  }

  function renderDetails(instance) {
    const container = document.getElementById('instance-details');
    const subtitle = document.getElementById('instance-details-subtitle');
    const refreshButton = document.getElementById('details-refresh');
    const connectionTestButton = document.getElementById('details-connection-test');
    const openMessagesButton = document.getElementById('details-open-messages');
    const openLogsButton = document.getElementById('details-open-logs');
    if (!container || !subtitle || !refreshButton || !connectionTestButton || !openMessagesButton || !openLogsButton) return;

    if (!instance) {
      subtitle.textContent = 'Selecione uma instancia para ver detalhes operacionais.';
      refreshButton.disabled = true;
      connectionTestButton.disabled = true;
      openMessagesButton.disabled = true;
      openLogsButton.disabled = true;
      container.className = 'details-card empty-state';
      container.textContent = 'Nenhuma instancia selecionada.';
      renderInstanceShortcuts(null);
      renderInstanceHealth(null);
      renderInstanceWebhooks(null);
      return;
    }

    refreshButton.disabled = false;
    connectionTestButton.disabled = false;
    openMessagesButton.disabled = false;
    openLogsButton.disabled = false;
    subtitle.textContent = `${instance.clinicId} - ${instance.id}`;
    container.className = 'details-card';
    container.innerHTML = `
      <div class="detail-row"><span class="detail-label">Status</span><span><span class="status-badge ${statusClass(instance.status)}">${escapeHtml(instance.status)}</span></span></div>
      <div class="detail-row"><span class="detail-label">Status persistido</span><span>${escapeHtml(instance.persistedStatus || instance.status)}</span></div>
      <div class="detail-row"><span class="detail-label">Clinic ID</span><span>${escapeHtml(instance.clinicId)}</span></div>
      <div class="detail-row"><span class="detail-label">Instance ID</span><span>${escapeHtml(instance.id)}</span></div>
      <div class="detail-row"><span class="detail-label">Numero</span><span>${escapeHtml(instance.phoneNumber || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Display name</span><span>${escapeHtml(instance.displayName || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Ultima atividade</span><span>${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt))}</span></div>
      <div class="detail-row"><span class="detail-label">Socket em runtime</span><span>${instance.connectedInRuntime ? 'Sim' : 'Nao'}</span></div>
      <div class="detail-row"><span class="detail-label">Runtime socket state</span><span>${escapeHtml(instance.runtimeSocketState || '-')}</span></div>
    `;
    renderInstanceShortcuts(instance);
    renderInstanceHealth(instance);
    renderInstanceWebhooks(instance);
  }

  function renderLogs(logs) {
    const container = document.getElementById('instance-logs');
    if (!container) return;

    if (!logs || !logs.length) {
      container.className = 'log-list empty-state';
      container.textContent = 'Nenhum log recente para esta instancia.';
      return;
    }

    container.className = 'log-list';
    container.innerHTML = logs.map((log) => `
      <article class="log-item ${String(log.eventType || '').toUpperCase() === 'FAILED' ? 'failed' : ''}">
        <div class="log-head">
          <strong>${escapeHtml(log.eventType)}</strong>
          <span class="log-meta">${escapeHtml(formatDate(log.createdAt))}</span>
        </div>
        <div class="log-meta">jobId: ${escapeHtml(log.job?.id || '-')} - destino: ${escapeHtml(log.job?.toPhone || '-')}</div>
        <pre>${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre>
      </article>
    `).join('');
  }

  function renderInstanceJobs(jobs) {
    const container = document.getElementById('instance-jobs');
    if (!container) return;

    if (!jobs || !jobs.length) {
      container.className = 'jobs-list empty-state';
      container.textContent = 'Nenhum job recente relacionado a esta instancia.';
      return;
    }

    container.className = 'jobs-list';
    container.innerHTML = jobs.map((job) => `
      <article class="job-item ${String(job.status || '').toUpperCase() === 'FAILED' ? 'failed' : ''}">
        <div class="job-head">
          <div>
            <strong>${escapeHtml(job.toPhone)}</strong>
            <p class="muted">${escapeHtml(formatDate(job.createdAt))}</p>
          </div>
          <span class="status-badge ${jobStatusClass(job.status)}">${escapeHtml(job.status)}</span>
        </div>
        <div class="job-preview">${escapeHtml(job.body || '-')}</div>
        ${job.lastError ? `<div class="muted">Erro: ${escapeHtml(job.lastError)}</div>` : ''}
      </article>
    `).join('');
  }

  function renderMessagesList(jobs) {
    const container = document.getElementById('messages-list');
    if (!container) return;

    if (!jobs || !jobs.length) {
      container.className = 'jobs-list empty-state';
      container.textContent = 'Nenhum job encontrado para os filtros atuais.';
      return;
    }

    container.className = 'jobs-list';
    container.innerHTML = jobs.map((job) => `
      <article class="job-item ${String(job.status || '').toUpperCase() === 'FAILED' ? 'failed' : ''}">
        <div class="job-head">
          <div>
            <button class="table-link" data-open-instance-id="${escapeHtml(job.instanceId)}" type="button">${escapeHtml(job.clinicId)}</button>
            <p class="muted"><button class="table-link" data-open-instance-id="${escapeHtml(job.instanceId)}" type="button">${escapeHtml(job.instanceId)}</button></p>
          </div>
          <span class="status-badge ${jobStatusClass(job.status)}">${escapeHtml(job.status)}</span>
        </div>
        <div class="job-meta">
          <span>Destino: ${escapeHtml(job.toPhone)}</span>
          <span>Retry: ${escapeHtml(job.retryCount)}</span>
          <span>Criado em ${escapeHtml(formatDate(job.createdAt))}</span>
        </div>
        <div class="job-preview">${escapeHtml(job.body || '-')}</div>
        ${job.lastError ? `<div class="muted">Erro: ${escapeHtml(job.lastError)}</div>` : ''}
      </article>
    `).join('');
  }

  function renderModuleLogs(logs) {
    const container = document.getElementById('logs-list');
    if (!container) return;

    if (!logs || !logs.length) {
      container.className = 'log-list empty-state';
      container.textContent = 'Nenhum log encontrado para os filtros atuais.';
      return;
    }

    container.className = 'log-list';
    container.innerHTML = logs.map((log) => `
      <article class="log-item ${String(log.eventType || log.type || '').toUpperCase().includes('FAILED') ? 'failed' : ''}">
        <div class="log-head">
          <strong>${escapeHtml(log.eventType || log.type || 'EVENT')}</strong>
          <span class="log-meta">${escapeHtml(formatDate(log.createdAt))}</span>
        </div>
        <div class="log-meta">
          Clinic: <button class="table-link" data-open-instance-id="${escapeHtml(log.job?.instanceId || log.instanceId || '')}" type="button">${escapeHtml(log.job?.clinicId || log.clinicId || '-')}</button>
          - Instance: <button class="table-link" data-open-instance-id="${escapeHtml(log.job?.instanceId || log.instanceId || '')}" type="button">${escapeHtml(log.job?.instanceId || log.instanceId || '-')}</button>
        </div>
        <div class="log-meta">Destino: ${escapeHtml(log.job?.toPhone || log.phone || '-')} - Job: ${escapeHtml(log.job?.id || log.messageJobId || '-')}</div>
        ${log.summary ? `<div class="job-preview">${escapeHtml(log.summary)}</div>` : ''}
        ${log.job?.lastError ? `<div class="muted">Erro: ${escapeHtml(log.job.lastError)}</div>` : ''}
        <pre>${escapeHtml(JSON.stringify(log.payload || {}, null, 2))}</pre>
      </article>
    `).join('');
  }

  function renderWebhookOverview(data) {
    const baseUrl = document.getElementById('webhooks-base-url');
    const baseUrlNote = document.getElementById('webhooks-base-url-note');
    const scopeStatus = document.getElementById('webhooks-scope-status');
    const scopeNote = document.getElementById('webhooks-scope-note');
    const eventCount = document.getElementById('webhooks-event-count');
    const events = document.getElementById('webhooks-events');
    const payload = document.getElementById('webhooks-sample-payload');
    const history = document.getElementById('webhooks-history');

    state.webhooksOverview = data;
    const supportedEvents = Array.isArray(data.supportedEvents) ? data.supportedEvents : [];
    if (!state.selectedWebhookEvent || !supportedEvents.includes(state.selectedWebhookEvent)) {
      state.selectedWebhookEvent = supportedEvents[0] || '';
    }
    if (baseUrl) baseUrl.textContent = data.baseUrl || 'Nao configurada';
    if (baseUrlNote) {
      baseUrlNote.textContent = data.configured
        ? 'Destino estrutural carregado pelo modulo de suporte.'
        : 'Ainda sem destino persistido no engine para esta fase.';
    }
    if (scopeStatus) scopeStatus.textContent = data.supportsPerInstanceConfig ? 'Configuracao por instancia' : 'Estrutura compartilhada';
    if (scopeNote) {
      scopeNote.textContent = data.supportsPerInstanceConfig
        ? 'O modulo aceita isolamento por instancia.'
        : 'O desenho atual reaproveita a base estrutural em todas as clinicas.';
    }
    if (eventCount) eventCount.textContent = `${supportedEvents.length} ${supportedEvents.length === 1 ? 'evento' : 'eventos'}`;
    if (payload) {
      payload.className = 'json-preview';
      payload.textContent = state.selectedWebhookEvent
        ? JSON.stringify(data.samplePayloads?.[state.selectedWebhookEvent] || {}, null, 2)
        : 'Selecione um evento para ver o payload de exemplo.';
    }
    if (history) {
      if (data.recentDeliveries?.length) {
        history.className = 'log-list';
        history.innerHTML = data.recentDeliveries.map((delivery) => `
          <article class="log-item">
            <div class="log-head">
              <strong>${escapeHtml(delivery.event || 'Entrega')}</strong>
              <span class="log-meta">${escapeHtml(formatDate(delivery.timestamp || delivery.createdAt))}</span>
            </div>
            <div class="muted">${escapeHtml(delivery.targetUrl || data.baseUrl || 'Destino nao informado')}</div>
            <div class="log-meta">Clinica: ${escapeHtml(delivery.clinicId || '-')} - Telefone: ${escapeHtml(delivery.fromPhone || '-')}</div>
            <div class="log-meta">Intent: ${escapeHtml(delivery.intent || 'UNKNOWN')} - Status: ${escapeHtml(delivery.status || '-')}</div>
            ${delivery.appointmentId ? `<div class="log-meta">Appointment: ${escapeHtml(delivery.appointmentId)}</div>` : ''}
            ${delivery.bodyPreview ? `<div class="muted">${escapeHtml(delivery.bodyPreview)}</div>` : ''}
          </article>
        `).join('');
      } else {
        history.className = 'log-list empty-state';
        history.textContent = 'Nenhum inbound recente sincronizado com o backend central.';
      }
    }

    if (!events) return;
    events.className = 'webhook-event-grid';
    events.innerHTML = supportedEvents.map((eventName) => `
      <button class="webhook-event-card ${state.selectedWebhookEvent === eventName ? 'active' : ''}" type="button" data-webhook-event="${escapeHtml(eventName)}">
        <span class="webhook-event-copy">
          <strong>${escapeHtml(formatWebhookEventLabel(eventName))}</strong>
          <span class="muted">${escapeHtml(formatWebhookEventSupport(eventName))}</span>
        </span>
        <span class="toggle-chip">${data.configured ? 'Configurado' : 'Estrutural'}</span>
      </button>
    `).join('');

    events.querySelectorAll('[data-webhook-event]').forEach((button) => {
      button.addEventListener('click', () => {
        const eventName = button.getAttribute('data-webhook-event');
        state.selectedWebhookEvent = eventName || '';
        renderWebhookOverview(data);
        if (state.selectedInstanceDetails) renderInstanceWebhooks(state.selectedInstanceDetails);
      });
    });
    if (state.selectedInstanceDetails) renderInstanceWebhooks(state.selectedInstanceDetails);
  }

  function renderSecurityOverview(data) {
    const maskedToken = document.getElementById('security-masked-token');
    const placeholders = document.getElementById('security-placeholders');
    if (maskedToken) maskedToken.textContent = data.maskedServiceToken || 'Nao configurado';
    if (!placeholders) return;

    const items = [
      ['Token de servico', data.hasServiceToken ? 'Token de servico separado e usado para integracao interna.' : 'Nenhum token de servico configurado.'],
      ['Token do painel', data.hasAdminPanelToken ? 'Painel autenticado com token proprio, sem reutilizar o token de servico.' : 'Nenhum token de painel configurado.'],
      ['Sessoes administrativas', data.adminSessions?.summary],
      ['Allowlist de IP', data.ipAllowlist?.summary],
      ['Auditoria basica', data.audit?.summary],
      ['Rotacao de token', data.rotation?.summary],
    ];

    placeholders.innerHTML = items.map(([title, description], index) => `
      <article class="security-item">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p class="muted">${escapeHtml(description || 'Em definicao.')}</p>
        </div>
        <span class="toggle-chip">${index === 0 ? 'Ativo' : 'Planejado'}</span>
      </article>
    `).join('');
  }

  async function runConnectionTest(instanceId, notifySuccess) {
    try {
      const status = await apiFetch(`/instances/${encodeURIComponent(instanceId)}/status`);
      const runtimeLabel = status.connectedInRuntime
        ? `socket ativo (${status.runtimeSocketState || 'OPEN'})`
        : `socket inativo (${status.runtimeSocketState || 'CLOSED'})`;
      if (notifySuccess !== false) {
        showToast(`Status ${status.status} para ${status.clinicId} (${runtimeLabel}).`, 'success');
      }
      return status;
    } catch (error) {
      showToast(error.message || 'Falha no teste de conexao.', 'error');
      return null;
    }
  }

  function applyFilters() {
    const quickSearch = String(document.getElementById('instance-search')?.value || '').trim().toLowerCase();
    const clinicFilter = String(document.getElementById('instance-clinic-filter')?.value || '').trim().toLowerCase();
    const nameFilter = String(document.getElementById('instance-name-filter')?.value || '').trim().toLowerCase();
    const phoneFilter = String(document.getElementById('instance-phone-filter')?.value || '').trim().toLowerCase();
    const statusFilter = String(document.getElementById('status-filter')?.value || '').trim().toUpperCase();
    const createdFilter = String(document.getElementById('created-filter')?.value || '').trim();
    const activityFilter = String(document.getElementById('activity-filter')?.value || '').trim();

    state.filteredInstances = state.instances.filter((instance) => {
      const activityDate = instance.lastSeenAt || instance.updatedAt || instance.createdAt;
      const createdTime = new Date(instance.createdAt || 0).getTime();
      const now = Date.now();

      const matchesQuickSearch = !quickSearch || [instance.id, instance.clinicId, instance.phoneNumber, instance.displayName]
        .some((value) => String(value || '').toLowerCase().includes(quickSearch));
      const matchesClinic = !clinicFilter || String(instance.clinicId || '').toLowerCase().includes(clinicFilter);
      const matchesName = !nameFilter || String(instance.displayName || '').toLowerCase().includes(nameFilter);
      const matchesPhone = !phoneFilter || String(instance.phoneNumber || '').toLowerCase().includes(phoneFilter);
      const matchesStatus = !statusFilter || String(instance.status || '').toUpperCase() === statusFilter;
      const matchesSegment = !state.instanceSegment || String(instance.status || '').toUpperCase() === state.instanceSegment;

      let matchesCreated = true;
      if (createdFilter === 'today') matchesCreated = new Date(instance.createdAt || 0).toDateString() === new Date().toDateString();
      if (createdFilter === '7d') matchesCreated = now - createdTime <= 7 * 24 * 60 * 60 * 1000;
      if (createdFilter === '30d') matchesCreated = now - createdTime <= 30 * 24 * 60 * 60 * 1000;

      let matchesActivity = true;
      const recent = isRecentActivity(activityDate, 24);
      if (activityFilter === '24h') matchesActivity = recent;
      if (activityFilter === 'inactive') matchesActivity = !recent;

      return matchesQuickSearch && matchesClinic && matchesName && matchesPhone && matchesStatus && matchesSegment && matchesCreated && matchesActivity;
    });

    state.instancesPage = 1;
    renderInstancesTable();
    updateSegmentButtons();
  }

  async function loadMessageSummary() {
    try {
      const summary = await apiFetch('/messages/summary');
      updateMessageSummary(summary || {});
    } catch (_error) {
      updateMessageSummary({});
    }
  }

  async function loadInstances() {
    try {
      const result = await apiFetch('/instances');
      state.instances = Array.isArray(result.items) ? result.items : [];
      updateSummary(result.summary || {});
      applyFilters();
      renderRecentActivity();
      renderRecentClinics();
      updateConnectionIndicator(true);

      const timestampLabel = `Atualizado em ${formatDate(new Date().toISOString())}`;
      const lastRefresh = document.getElementById('last-refresh');
      const dashboardRefresh = document.getElementById('dashboard-last-refresh');
      if (lastRefresh) lastRefresh.textContent = timestampLabel;
      if (dashboardRefresh) dashboardRefresh.textContent = timestampLabel;

      if (state.selectedInstanceId) {
        const stillExists = state.instances.find((item) => item.id === state.selectedInstanceId);
        if (stillExists) {
          await loadInstanceDetails(state.selectedInstanceId, false);
        } else {
          state.selectedInstanceId = null;
          state.selectedInstanceDetails = null;
          renderDetails(null);
          renderLogs([]);
          renderInstanceJobs([]);
        }
      }
    } catch (error) {
      updateConnectionIndicator(false);
      showToast(error.message || 'Falha ao carregar instancias.', 'error');
    }
  }

  async function loadInstanceDetails(instanceId, notifyOnError) {
    const detailsContainer = document.getElementById('instance-details');
    const logsContainer = document.getElementById('instance-logs');
    const jobsContainer = document.getElementById('instance-jobs');
    if (detailsContainer) {
      detailsContainer.className = 'details-card empty-state';
      detailsContainer.textContent = 'Carregando detalhes da instancia...';
    }
    if (logsContainer) {
      logsContainer.className = 'log-list empty-state';
      logsContainer.textContent = 'Carregando logs recentes...';
    }
    if (jobsContainer) {
      jobsContainer.className = 'jobs-list empty-state';
      jobsContainer.textContent = 'Carregando jobs relacionados...';
    }

    try {
      const [details, logs, jobs] = await Promise.all([
        apiFetch(`/instances/${encodeURIComponent(instanceId)}`),
        apiFetch(`/instances/${encodeURIComponent(instanceId)}/logs?limit=12`),
        apiFetch(`/messages/jobs?instanceId=${encodeURIComponent(instanceId)}&limit=8`),
      ]);
      state.selectedInstanceId = instanceId;
      state.selectedInstanceDetails = details;
      state.selectedInstanceJobs = jobs || [];
      renderDetails(details);
      renderLogs(logs || []);
      renderInstanceJobs(jobs || []);
      setView('instances', false);
      renderInstancesTable();
    } catch (error) {
      state.selectedInstanceDetails = null;
      state.selectedInstanceJobs = [];
      renderDetails(null);
      renderLogs([]);
      renderInstanceJobs([]);
      if (notifyOnError !== false) showToast(error.message || 'Falha ao carregar detalhes.', 'error');
    }
  }

  async function loadMessagesModule() {
    const list = document.getElementById('messages-list');
    if (list) {
      list.className = 'jobs-list empty-state';
      list.textContent = 'Carregando mensagens...';
    }

    try {
      const clinicId = String(document.getElementById('messages-clinic-filter')?.value || '').trim();
      const status = String(document.getElementById('messages-status-filter')?.value || '').trim();
      const search = String(document.getElementById('messages-search')?.value || '').trim();
      const params = new URLSearchParams();
      if (clinicId) params.set('clinicId', clinicId);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      params.set('limit', '40');

      const [summary, jobs] = await Promise.all([
        apiFetch('/messages/summary'),
        apiFetch(`/messages/jobs?${params.toString()}`),
      ]);

      updateMessageSummary(summary || {});
      renderMessagesList(jobs || []);
      state.messagesLoaded = true;
    } catch (error) {
      if (list) {
        list.className = 'jobs-list empty-state';
        list.textContent = error.message || 'Falha ao carregar mensagens.';
      }
    }
  }

  async function loadLogsModule() {
    const list = document.getElementById('logs-list');
    if (list) {
      list.className = 'log-list empty-state';
      list.textContent = 'Carregando logs...';
    }

    try {
      const clinicId = String(document.getElementById('logs-clinic-filter')?.value || '').trim();
      const instanceId = String(document.getElementById('logs-instance-filter')?.value || '').trim();
      const eventType = String(document.getElementById('logs-type-filter')?.value || '').trim();
      const search = String(document.getElementById('logs-search')?.value || '').trim();
      const params = new URLSearchParams();
      if (clinicId) params.set('clinicId', clinicId);
      if (instanceId) params.set('instanceId', instanceId);
      if (eventType) params.set('eventType', eventType);
      if (search) params.set('search', search);
      params.set('limit', '50');

      const [logs, operationalEvents] = await Promise.all([
        apiFetch(`/logs/recent?${params.toString()}`),
        apiFetch(`/operational-events/recent?${params.toString()}`),
      ]);
      const merged = [...(logs || []), ...(operationalEvents || [])]
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
      renderModuleLogs(merged);
      state.logsLoaded = true;
    } catch (error) {
      if (list) {
        list.className = 'log-list empty-state';
        list.textContent = error.message || 'Falha ao carregar logs.';
      }
    }
  }

  async function loadWebhooksModule() {
    try {
      const data = await apiFetch('/webhooks/overview');
      renderWebhookOverview(data || {});
      state.webhooksLoaded = true;
    } catch (error) {
      const events = document.getElementById('webhooks-events');
      if (events) {
        events.className = 'webhook-event-grid empty-state';
        events.textContent = error.message || 'Falha ao carregar webhooks.';
      }
    }
  }

  async function loadSecurityModule() {
    try {
      const data = await apiFetch('/security/overview');
      renderSecurityOverview(data || {});
      state.securityLoaded = true;
    } catch (error) {
      const token = document.getElementById('security-masked-token');
      if (token) token.textContent = error.message || 'Falha ao carregar seguranca.';
    }
  }

  function setView(view, updateButtons) {
    state.currentView = view;
    updateViewMeta(view);
    document.querySelectorAll('.view-panel').forEach((section) => {
      section.classList.toggle('active', section.dataset.view === view);
    });

    if (updateButtons !== false) {
      document.querySelectorAll('.nav-link').forEach((button) => {
        button.classList.toggle('active', button.dataset.nav === view);
      });
    }

    if (view === 'messages') void loadMessagesModule();
    if (view === 'logs') void loadLogsModule();
    if (view === 'webhooks' && !state.webhooksLoaded) void loadWebhooksModule();
    if (view === 'security' && !state.securityLoaded) void loadSecurityModule();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function openQrModal(instanceId) {
    const content = document.getElementById('qr-modal-content');
    if (!content) return;
    content.innerHTML = '<div class="empty-state">Gerando QR da instancia...</div>';
    openModal('qr-modal');

    try {
      const qr = await apiFetch(`/instances/${encodeURIComponent(instanceId)}/qr`);
      content.innerHTML = `
        <div class="qr-wrapper">
          ${qr.qrDataUrl ? `<img class="qr-image" src="${qr.qrDataUrl}" alt="QR Code da instancia">` : '<div class="empty-state">Nenhum QR disponivel no momento. Consulte o status e tente novamente.</div>'}
          <div class="stack compact">
            <div><strong>Status:</strong> ${escapeHtml(qr.status || '-')}</div>
            <div><strong>Pairing code:</strong> ${escapeHtml(qr.pairingCode || '-')}</div>
            <div><strong>Atualizado em:</strong> ${escapeHtml(formatDate(qr.qrUpdatedAt))}</div>
          </div>
        </div>
      `;
    } catch (error) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'Falha ao gerar QR.')}</div>`;
    }
  }

  async function disconnectInstance(instanceId) {
    if (!window.confirm('Deseja desconectar esta instancia e limpar a sessao atual?')) return;

    try {
      await apiFetch(`/instances/${encodeURIComponent(instanceId)}/disconnect`, {
        method: 'POST',
      });
      showToast('Instancia desconectada com sucesso.', 'success');
      await loadInstances();
      if (state.selectedInstanceId === instanceId) {
        await loadInstanceDetails(instanceId, false);
      }
    } catch (error) {
      showToast(error.message || 'Falha ao desconectar instancia.', 'error');
    }
  }

  async function deleteInstance(instanceId) {
    if (!window.confirm('Deseja excluir esta instancia? Essa acao remove a sessao e exige novo pareamento.')) return;

    try {
      await apiFetch(`/instances/${encodeURIComponent(instanceId)}`, {
        method: 'DELETE',
      });
      showToast('Instancia excluida com sucesso.', 'success');
      if (state.selectedInstanceId === instanceId) {
        state.selectedInstanceId = null;
        state.selectedInstanceDetails = null;
      }
      await loadInstances();
    } catch (error) {
      showToast(error.message || 'Falha ao excluir instancia.', 'error');
    }
  }

  function openMessageModal(instanceId, clinicId) {
    document.getElementById('message-instance-id').value = instanceId;
    document.getElementById('message-clinic-id').value = clinicId;
    document.getElementById('message-to-phone').value = '';
    openModal('message-modal');
  }

  function focusInstance(instanceId, targetView) {
    if (!instanceId) return;
    const search = document.getElementById('instance-search');
    const clinicFilter = document.getElementById('instance-clinic-filter');
    const nameFilter = document.getElementById('instance-name-filter');
    const phoneFilter = document.getElementById('instance-phone-filter');
    const statusFilter = document.getElementById('status-filter');
    const createdFilter = document.getElementById('created-filter');
    const activityFilter = document.getElementById('activity-filter');

    if (search) search.value = instanceId;
    if (clinicFilter) clinicFilter.value = '';
    if (nameFilter) nameFilter.value = '';
    if (phoneFilter) phoneFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (createdFilter) createdFilter.value = '';
    if (activityFilter) activityFilter.value = '';
    state.instanceSegment = '';
    applyFilters();
    setView(targetView || 'instances');
    void loadInstanceDetails(instanceId);
  }

  function focusMessagesForInstance(instance) {
    if (!instance) return;
    const clinicFilter = document.getElementById('messages-clinic-filter');
    const search = document.getElementById('messages-search');
    const status = document.getElementById('messages-status-filter');
    if (clinicFilter) clinicFilter.value = instance.clinicId || '';
    if (search) search.value = instance.id || '';
    if (status) status.value = '';
    setView('messages');
  }

  function focusLogsForInstance(instance) {
    if (!instance) return;
    const clinicFilter = document.getElementById('logs-clinic-filter');
    const instanceFilter = document.getElementById('logs-instance-filter');
    const search = document.getElementById('logs-search');
    const typeFilter = document.getElementById('logs-type-filter');
    if (clinicFilter) clinicFilter.value = instance.clinicId || '';
    if (instanceFilter) instanceFilter.value = instance.id || '';
    if (search) search.value = '';
    if (typeFilter) typeFilter.value = '';
    setView('logs');
  }

  async function handleCreateInstance(event) {
    event.preventDefault();
    const clinicId = document.getElementById('clinic-id').value.trim();
    const displayName = document.getElementById('display-name').value.trim();

    try {
      const created = await apiFetch('/instances', {
        method: 'POST',
        body: JSON.stringify({ clinicId, displayName: displayName || undefined }),
      });
      showToast(`Instancia ${created.id} criada para ${created.clinicId}.`, 'success');
      event.target.reset();
      await loadInstances();
      await loadInstanceDetails(created.id, false);
      setView('instances');
    } catch (error) {
      showToast(error.message || 'Falha ao criar instancia.', 'error');
    }
  }

  async function handleMessageSubmit(event) {
    event.preventDefault();
    const clinicId = document.getElementById('message-clinic-id').value.trim();
    const toPhone = document.getElementById('message-to-phone').value.trim();
    const body = document.getElementById('message-body').value.trim();

    try {
      const result = await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ clinicId, toPhone, body }),
      });
      showToast(`Job ${result.jobId} enviado para fila.`, 'success');
      closeModal('message-modal');
      await loadMessageSummary();
      if (state.currentView === 'messages') await loadMessagesModule();
      if (state.selectedInstanceId) await loadInstanceDetails(state.selectedInstanceId, false);
    } catch (error) {
      showToast(error.message || 'Falha ao enviar teste.', 'error');
    }
  }

  async function handleTableAction(event) {
    const button = event.target.closest('[data-action], [data-open-instance-id], [data-instance-webhook-event]');
    if (!button) return;

    if (button.dataset.instanceWebhookEvent) {
      state.selectedWebhookEvent = button.dataset.instanceWebhookEvent;
      if (state.selectedInstanceDetails) renderInstanceWebhooks(state.selectedInstanceDetails);
      return;
    }

    const openInstanceId = button.dataset.openInstanceId;
    if (openInstanceId) {
      focusInstance(openInstanceId, 'instances');
      return;
    }

    const action = button.dataset.action;
    const instanceId = button.dataset.id;
    const clinicId = button.dataset.clinicId;

    if (action === 'details' || action === 'status') {
      await loadInstanceDetails(instanceId);
      if (action === 'status') {
        const status = await runConnectionTest(instanceId, true);
        if (status) {
          state.selectedInstanceDetails = status;
          renderDetails(status);
        }
      }
      return;
    }

    if (action === 'qr') {
      await openQrModal(instanceId);
      return;
    }

    if (action === 'disconnect') {
      await disconnectInstance(instanceId);
      return;
    }

    if (action === 'delete') {
      await deleteInstance(instanceId);
      return;
    }

    if (action === 'test') {
      openMessageModal(instanceId, clinicId);
      return;
    }

    if (action === 'copy-instance') {
      copyText(instanceId, 'Instance ID');
      return;
    }

    if (action === 'copy-clinic') {
      copyText(clinicId, 'Clinic ID');
    }
  }

  function startAutoRefresh() {
    if (state.autoRefreshTimer) {
      window.clearInterval(state.autoRefreshTimer);
    }

    if (!document.getElementById('auto-refresh')?.checked) return;

    state.autoRefreshTimer = window.setInterval(() => {
      void loadInstances();
      void loadMessageSummary();
      if (state.currentView === 'messages') void loadMessagesModule();
      if (state.currentView === 'logs') void loadLogsModule();
    }, 15000);
  }

  function registerModalEvents() {
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal.id);
      });
    });
  }

  function registerNavigation() {
    document.querySelectorAll('.nav-link').forEach((button) => {
      button.addEventListener('click', () => {
        setView(button.dataset.nav);
      });
    });
  }

  function registerInstanceFilters() {
    document.getElementById('instance-search')?.addEventListener('input', applyFilters);
    document.getElementById('instance-clinic-filter')?.addEventListener('input', applyFilters);
    document.getElementById('instance-name-filter')?.addEventListener('input', applyFilters);
    document.getElementById('instance-phone-filter')?.addEventListener('input', applyFilters);
    document.getElementById('status-filter')?.addEventListener('change', applyFilters);
    document.getElementById('created-filter')?.addEventListener('change', applyFilters);
    document.getElementById('activity-filter')?.addEventListener('change', applyFilters);

    document.querySelectorAll('.instance-tab').forEach((button) => {
      button.addEventListener('click', () => {
        state.instanceSegment = button.dataset.instanceSegment || '';
        applyFilters();
      });
    });

    document.getElementById('instances-prev-page')?.addEventListener('click', () => {
      state.instancesPage = Math.max(1, state.instancesPage - 1);
      renderInstancesTable();
    });

    document.getElementById('instances-next-page')?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredInstances.length / INSTANCES_PER_PAGE));
      state.instancesPage = Math.min(totalPages, state.instancesPage + 1);
      renderInstancesTable();
    });
  }

  function registerOperationalFilters() {
    document.getElementById('messages-search')?.addEventListener('input', () => { void loadMessagesModule(); });
    document.getElementById('messages-clinic-filter')?.addEventListener('input', () => { void loadMessagesModule(); });
    document.getElementById('messages-status-filter')?.addEventListener('change', () => { void loadMessagesModule(); });

    document.getElementById('logs-search')?.addEventListener('input', () => { void loadLogsModule(); });
    document.getElementById('logs-clinic-filter')?.addEventListener('input', () => { void loadLogsModule(); });
    document.getElementById('logs-instance-filter')?.addEventListener('input', () => { void loadLogsModule(); });
    document.getElementById('logs-type-filter')?.addEventListener('change', () => { void loadLogsModule(); });

    document.getElementById('webhooks-test-button')?.addEventListener('click', () => {
      showToast('Teste visual executado. Persistencia real de webhooks continua parcial e segura nesta fase.', 'success');
    });

    document.getElementById('security-copy-token')?.addEventListener('click', () => {
      showToast('Copia de token desabilitada nesta fase para evitar exposicao do segredo operacional.', 'info');
    });

    document.getElementById('details-open-messages')?.addEventListener('click', () => {
      if (state.selectedInstanceDetails) focusMessagesForInstance(state.selectedInstanceDetails);
    });

    document.getElementById('details-open-logs')?.addEventListener('click', () => {
      if (state.selectedInstanceDetails) focusLogsForInstance(state.selectedInstanceDetails);
    });

    document.getElementById('details-refresh-list')?.addEventListener('click', () => {
      void loadInstances();
    });

    document.querySelectorAll('.detail-tab').forEach((button) => {
      button.addEventListener('click', () => {
        setDetailsTab(button.dataset.detailTab);
      });
    });
  }

  function resolveInitialView() {
    const pathname = window.location.pathname || '';
    if (pathname.endsWith('/instances')) return 'instances';
    return 'dashboard';
  }

  async function handleLogin(event) {
    event.preventDefault();
    const token = String(document.getElementById('internal-token')?.value || '').trim();

    try {
      const response = await fetch('/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload?.error?.message || 'Falha ao autenticar.');
      }

      sessionStorage.setItem(TOKEN_KEY, 'authenticated');
      window.location.href = '/admin/instances';
    } catch (error) {
      showToast(error.message || 'Falha ao autenticar.', 'error');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/admin/session', { method: 'DELETE' });
    } catch (_error) {
      // noop
    }

    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = '/admin/login';
  }

  async function ensureAdminSession() {
    if (getToken()) return true;

    try {
      const response = await fetch('/admin/session');
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.data?.authenticated === true) {
        sessionStorage.setItem(TOKEN_KEY, 'authenticated');
        return true;
      }
    } catch (_error) {
      // noop
    }

    sessionStorage.removeItem(TOKEN_KEY);
    return false;
  }

  function initLoginPage() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  }

  async function initDashboard() {
    const authenticated = await ensureAdminSession();
    if (!authenticated) {
      window.location.href = '/admin/login';
      return;
    }

    document.getElementById('create-instance-form')?.addEventListener('submit', handleCreateInstance);
    document.getElementById('message-form')?.addEventListener('submit', handleMessageSubmit);
  document.getElementById('instances-table-body')?.addEventListener('click', handleTableAction);
  document.getElementById('instance-shortcuts')?.addEventListener('click', handleTableAction);
  document.getElementById('instance-webhooks')?.addEventListener('click', handleTableAction);
  document.getElementById('messages-list')?.addEventListener('click', handleTableAction);
  document.getElementById('logs-list')?.addEventListener('click', handleTableAction);
    document.getElementById('refresh-all')?.addEventListener('click', () => {
      void loadInstances();
      void loadMessageSummary();
      if (state.currentView === 'messages') void loadMessagesModule();
      if (state.currentView === 'logs') void loadLogsModule();
    });
    document.getElementById('logout-button')?.addEventListener('click', handleLogout);
    document.getElementById('details-refresh')?.addEventListener('click', () => {
      if (state.selectedInstanceId) void loadInstanceDetails(state.selectedInstanceId);
    });
    document.getElementById('details-connection-test')?.addEventListener('click', async () => {
      if (!state.selectedInstanceId) return;
      const status = await runConnectionTest(state.selectedInstanceId, true);
      if (status) {
        state.selectedInstanceDetails = status;
        renderDetails(status);
      }
    });
    document.getElementById('auto-refresh')?.addEventListener('change', startAutoRefresh);

    registerNavigation();
    registerInstanceFilters();
    registerOperationalFilters();
    registerModalEvents();
    setView(resolveInitialView());
    startAutoRefresh();
    void loadMessageSummary();
    void loadInstances();
  }

  if (page === 'login') initLoginPage();
  if (page === 'dashboard') void initDashboard();
})();
