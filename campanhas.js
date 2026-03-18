const normalizeCampaign = (camp = {}) => ({
  ...camp,
  nome: camp.nome || 'Campanha',
  periodo: camp.periodo || '',
  cor: camp.cor || '#2a9d8f',
  descricao: camp.descricao || '',
  status: (() => {
    const raw = String(camp.status || '').trim().toLowerCase();
    if (raw === 'rascunho') return 'rascunho';
    if (raw === 'agendada') return 'agendada';
    if (raw === 'pausada') return 'pausada';
    if (raw === 'concluida' || raw === 'concluída') return 'concluida';
    if (raw === 'inativa') return 'inativa';
    return 'ativa';
  })(),
  origem: camp.origem || 'clinica',
  somenteLeitura: camp.origem === 'voithos',
  publico: camp.publico || 'pacientes_clinica',
  publicoLabel: camp.publicoLabel || 'Pacientes da clinica',
  segmentKey: String(camp.segmentKey || camp.segmento || 'all_active').trim().toLowerCase(),
});

const emitCampaignsUpdated = (source = 'campanhas') => {
  try {
    window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { source } }));
    localStorage.setItem('voithos-campaigns-updated', JSON.stringify({ at: Date.now(), source }));
  } catch (_) {
  }
};


let canManage = false;
const SEGMENT_LABELS = {
  all_active: 'Todos pacientes ativos',
  inactive_90: 'Inativos ha 90 dias',
  inactive_180: 'Inativos ha 180 dias',
  never_cleaning: 'Nunca fizeram limpeza',
  birthday_month: 'Aniversariantes do mes',
  plan_overdue: 'Pacientes com plano em atraso',
};

const formatDateTimeBr = (value) => {
  if (!value) return '--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatHourBr = (value) => {
  if (!value) return '--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return `${Math.round(Number(value) * 100)}%`;
};

const formatCurrencyBr = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const FALLBACK_ANNUAL_TEMPLATES = [
  { month: 1, id: 'annual-janeiro-sorriso-ano-novo', title: 'Sorriso do Ano Novo', description: 'Renovacao estetica no inicio do ano.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#0ea5e9', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! 😊\n\nO inicio do ano e o momento perfeito para cuidar do seu sorriso.\n\nAqui na {NOME_CLINICA}, estamos com uma condicao especial para avaliacao e clareamento dental.\n\nSe quiser saber mais ou agendar uma avaliacao, e so me chamar por aqui.' } },
  { month: 2, id: 'annual-fevereiro-pos-carnaval', title: 'Seu sorriso apos o Carnaval', description: 'Profilaxia e limpeza preventiva.', category: 'PREVENTION', estimatedConversionImpact: 'HIGH', color: '#22c55e', segmentKey: 'all_active', messages: { standard: 'Ola, {NOME_PACIENTE}!\n\nApos o periodo de festas, e sempre importante realizar uma limpeza e avaliacao preventiva.\n\nEstamos com agenda aberta para profilaxia e check-up.\n\nSe desejar, posso verificar um horario para voce.' } },
  { month: 3, id: 'annual-marco-checkup-preventivo', title: 'Check-up Preventivo', description: 'Avaliacao preventiva mensal.', category: 'PREVENTION', estimatedConversionImpact: 'HIGH', color: '#14b8a6', segmentKey: 'inactive_90', messages: { standard: 'Ola, {NOME_PACIENTE}! Estamos com agenda aberta para check-up preventivo na {NOME_CLINICA}.' } },
  { month: 4, id: 'annual-abril-saude-gengival', title: 'Saude da gengiva e prevencao', description: 'Prevencao e cuidado gengival.', category: 'PREVENTION', estimatedConversionImpact: 'HIGH', color: '#0f766e', segmentKey: 'never_cleaning', messages: { standard: 'Ola, {NOME_PACIENTE}! Abril e um excelente momento para avaliar saude gengival e prevencao.' } },
  { month: 5, id: 'annual-maio-cuidado-especial', title: 'Cuidado especial com o sorriso', description: 'Campanha estetica de maio.', category: 'AESTHETICS', estimatedConversionImpact: 'MEDIUM', color: '#ec4899', segmentKey: 'all_active', messages: { standard: 'Ola, {NOME_PACIENTE}! Maio e um bom momento para investir no cuidado do sorriso.' } },
  { month: 6, id: 'annual-junho-sorriso-destaque', title: 'Seu sorriso em destaque', description: 'Estetica para junho.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#f43f5e', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! Junho e ideal para dar destaque ao seu sorriso com planejamento estetico.' } },
  { month: 7, id: 'annual-julho-avaliacao-ferias', title: 'Avaliacao nas ferias', description: 'Revisao ortodontica e avaliacao.', category: 'ORTHODONTICS', estimatedConversionImpact: 'HIGH', color: '#6366f1', segmentKey: 'inactive_90', messages: { standard: 'Ola, {NOME_PACIENTE}! Nas ferias, aproveite para colocar sua avaliacao odontologica em dia.' } },
  { month: 8, id: 'annual-agosto-checkup', title: 'Check-up preventivo', description: 'Acao preventiva de agosto.', category: 'PREVENTION', estimatedConversionImpact: 'MEDIUM', color: '#0f172a', segmentKey: 'all_active', messages: { standard: 'Ola, {NOME_PACIENTE}! Agosto e um bom mes para seu check-up preventivo.' } },
  { month: 9, id: 'annual-setembro-primavera', title: 'Primavera do sorriso', description: 'Renovacao estetica na primavera.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#84cc16', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! Que tal aproveitar a primavera para renovar seu sorriso?' } },
  { month: 10, id: 'annual-outubro-cuidado-prevencao', title: 'Cuidado e prevencao com sua saude', description: 'Abordagem preventiva respeitosa.', category: 'PREVENTION', estimatedConversionImpact: 'MEDIUM', color: '#f97316', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}!\n\nA prevencao e sempre o melhor caminho para cuidar da saude.\n\nEsse e um bom momento para realizar sua avaliacao odontologica e garantir que esta tudo bem.\n\nSe desejar, posso verificar um horario para voce.' } },
  { month: 11, id: 'annual-novembro-avaliacao-preventiva', title: 'Avaliacao preventiva e cuidado com sua saude', description: 'Prevencao e bem-estar em novembro.', category: 'PREVENTION', estimatedConversionImpact: 'MEDIUM', color: '#1d4ed8', segmentKey: 'inactive_90', messages: { standard: 'Ola, {NOME_PACIENTE}!\n\nManter sua saude bucal em dia faz toda a diferenca no seu bem-estar.\n\nEstamos com agenda aberta para avaliacoes preventivas.\n\nSe desejar, posso verificar um horario para voce.' } },
  { month: 12, id: 'annual-dezembro-sorriso-fim-ano', title: 'Seu sorriso para o fim do ano', description: 'Preparacao para eventos e festas.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#0f766e', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! Prepare seu sorriso para o fim do ano com uma avaliacao na {NOME_CLINICA}.' } },
];

const validateGlobalsPayload = (list) => {
  if (!Array.isArray(list)) return 'O JSON deve ser uma lista de campanhas.';
  const errors = [];
  list.forEach((camp, idx) => {
    if (!camp || typeof camp !== 'object') {
      errors.push(`#${idx + 1}: item invalido`);
      return;
    }
    const nome = camp.nome || camp.titulo;
    if (!nome) {
      errors.push(`#${idx + 1}: nome/titulo obrigatorio`);
    }
  });
  return errors.length ? `Campanhas globais invalidas: ${errors.join('; ')}` : '';
};

const formatPeriodo = (valor) => {
  if (!valor) return '--';
  const [ano, mes] = valor.split('-');
  if (!ano || !mes) return valor;
  return `${mes}/${ano}`;
};

const getTodayValues = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    month: `${yyyy}-${mm}`,
  };
};

const createCard = (camp, campaignResult = null) => {
  const card = document.createElement('div');
  card.className = 'campanha-card campanha-clickable';
  if (camp.id) card.dataset.id = camp.id;

  const info = document.createElement('div');
  info.className = 'campanha-info';
  const inicio = camp.inicio || '--';
  const fim = camp.fim || '--';
  const canal = camp.canal || 'Nao definido';

  const periodoLabel = formatPeriodo(camp.periodo);

  info.innerHTML = `
    <h4>${camp.nome || 'Campanha'}</h4>
    <p>${camp.descricao || 'Sem descricao'}</p>
    <div class="campanha-extra">
      <span><strong>Periodo:</strong> ${periodoLabel}</span>
      <span><strong>Comeca:</strong> ${inicio}</span>
      <span><strong>Termina:</strong> ${fim}</span>
      <span><strong>Canal:</strong> ${canal}</span>
      <span><strong>Segmento:</strong> ${SEGMENT_LABELS[camp.segmentKey] || SEGMENT_LABELS.all_active}</span>
    </div>
    <div class="campaign-result">
      <span><strong>Ultimo disparo:</strong> ${campaignResult?.lastDispatch ? `${formatDateTimeBr(campaignResult.lastDispatch.createdAt)} | Audiencia ${campaignResult.lastDispatch.audienceCount ?? 0} | SENT ${campaignResult.lastDispatch.sentCount ?? 0} | FAILED ${campaignResult.lastDispatch.failedCount ?? 0}` : '--'}</span>
      <span><strong>Agendamentos apos campanha (7 dias):</strong> ${campaignResult?.conversions7d ?? 0}</span>
      <span><strong>Receita estimada (7 dias):</strong> ${campaignResult?.revenue7d != null ? formatCurrencyBr(campaignResult.revenue7d) : '--'}</span>
      <span><strong>Total de conversoes no mes:</strong> ${campaignResult?.monthlyConversions7d ?? 0}</span>
    </div>
  `;

  const meta = document.createElement('div');
  meta.className = 'campanha-meta';

  const tagPeriodo = document.createElement('div');
  tagPeriodo.className = 'tag';
  tagPeriodo.innerHTML = `<span class="color-dot" style="background:${camp.cor || '#2a9d8f'}"></span> ${formatPeriodo(camp.periodo)}`;

  const tagPublico = document.createElement('div');
  tagPublico.className = 'tag';
  tagPublico.textContent = camp.publicoLabel || 'Pacientes da clinica';

  meta.appendChild(tagPeriodo);
  meta.appendChild(tagPublico);

  card.appendChild(info);
  card.appendChild(meta);

  if (canManage && String(camp.canal || '').toLowerCase().includes('whatsapp')) {
    const actions = document.createElement('div');
    actions.className = 'campanha-actions';
    const btnDisparar = document.createElement('button');
    btnDisparar.className = 'btn-secondary';
    btnDisparar.type = 'button';
    btnDisparar.textContent = 'Disparar WhatsApp';
    btnDisparar.setAttribute('data-action', 'send-whatsapp');
    btnDisparar.setAttribute('data-id', camp.id || '');
    actions.appendChild(btnDisparar);
    card.appendChild(actions);
  }
  return card;
};

document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const campanhasApi = appApi.campanhas || {};
  const campanhasGlobalApi = appApi.campanhasGlobal || {};
  const clinicApi = appApi.clinic || {};
  const patientsApi = appApi.patients || {};
  const whatsappApi = appApi.whatsapp || {};
  const listEl = document.getElementById('campanhas-list');
  const templatesPanel = document.getElementById('templates-panel');
  const monthlyTemplateCard = document.getElementById('monthly-template-card');
  const monthlyTemplateTitle = document.getElementById('monthly-template-title');
  const monthlyTemplateDesc = document.getElementById('monthly-template-desc');
  const monthlyTemplateCta = document.getElementById('monthly-template-cta');
  const activateMonthlyTemplateBtn = document.getElementById('btn-activate-monthly-template');
  const quickTemplatesGrid = document.getElementById('quick-templates-grid');
  const kpiSentToday = document.getElementById('kpi-sent-today');
  const kpiFailedToday = document.getElementById('kpi-failed-today');
  const kpiDeliveryRate = document.getElementById('kpi-delivery-rate');
  const kpiLastSend = document.getElementById('kpi-last-send');
  const kpiNextSend = document.getElementById('kpi-next-send');
  const openLogsTodayBtn = document.getElementById('btn-logs-hoje');
  const openStrategyVideoBtn = document.getElementById('btn-open-strategy-video');
  const modal = document.getElementById('campanha-modal');
  const openBtn = document.getElementById('btn-nova-campanha');
  const openGlobalsBtn = document.getElementById('btn-globais');
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancelar-modal');
  const form = document.getElementById('campanha-form');
  const inputNome = document.getElementById('camp-nome');
  const inputPeriodo = document.getElementById('camp-periodo');
  const inputCor = document.getElementById('camp-cor');
  const inputDescricao = document.getElementById('camp-descricao');
  const inputInicio = document.getElementById('camp-inicio');
  const inputFim = document.getElementById('camp-fim');
  const selectCanal = document.getElementById('camp-canal');
  const selectStatus = document.getElementById('camp-status');
  const selectPublico = document.getElementById('camp-publico');
  const selectSegmento = document.getElementById('camp-segmento');
  const segmentPreview = document.getElementById('segment-preview');

  const globalsModal = document.getElementById('campanhas-globais-modal');
  const globalsCloseBtn = document.getElementById('close-globais-modal');
  const globalsCancelBtn = document.getElementById('cancelar-globais');
  const globalsForm = document.getElementById('campanhas-globais-form');
  const globalsTextarea = document.getElementById('campanhas-globais-json');
  const logsModal = document.getElementById('campanha-logs-modal');
  const closeLogsModalBtn = document.getElementById('close-logs-modal');
  const logsTbody = document.getElementById('logs-tbody');
  const strategyVideoModal = document.getElementById('strategy-video-modal');
  const closeStrategyVideoModalBtn = document.getElementById('close-strategy-video-modal');
  const strategyVideoIframe = document.getElementById('strategy-video-iframe');
  const strategyVideoSrc = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

  let currentUser = null;
  let campanhas = [];
  let templatesData = { monthly: null, annualTemplates: [] };
  let campaignResults = new Map();
  let editingCampaignId = null;
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');

  const ensureUser = async () => {
    try {
      const user = await authApi.currentUser();
      if (!user) {
        window.location.href = 'login.html';
        return null;
      }
      return user;
    } catch (err) {
      console.error('Erro ao obter usuario logado', err);
      window.location.href = 'login.html';
      return null;
    }
  };

  const loadCampaigns = async () => {
    try {
      const data = await campanhasApi.list?.();
      if (!Array.isArray(data)) return [];
      return data.map(normalizeCampaign);
    } catch (err) {
      console.warn('Erro ao carregar campanhas', err);
      return [];
    }
  };

  const updateHealthPanel = async () => {
    if (!campanhasApi.dashboard) return;
    try {
      const dashboard = await campanhasApi.dashboard();
      if (kpiSentToday) kpiSentToday.textContent = String(dashboard?.sentToday ?? 0);
      if (kpiFailedToday) kpiFailedToday.textContent = String(dashboard?.failedToday ?? 0);
      if (kpiDeliveryRate) kpiDeliveryRate.textContent = formatPercent(dashboard?.deliveryRateToday);
      if (kpiLastSend) kpiLastSend.textContent = formatDateTimeBr(dashboard?.lastSendAt);
      if (kpiNextSend) {
        if (dashboard?.nextEligibleSend?.inicio) {
          kpiNextSend.textContent = `${dashboard.nextEligibleSend.nome || 'Campanha'} - ${formatDateTimeBr(dashboard.nextEligibleSend.inicio)}`;
        } else {
          kpiNextSend.textContent = 'Sem campanhas agendadas';
        }
      }
    } catch (err) {
      console.warn('Erro ao atualizar painel de saude de campanhas', err);
    }
  };

  const loadCampaignResults = async () => {
    if (!campanhasApi.result) {
      campaignResults = new Map();
      return;
    }
    const map = new Map();
    const ids = campanhas.map((camp) => String(camp?.id || '').trim()).filter(Boolean);
    await Promise.all(ids.map(async (id) => {
      try {
        const data = await campanhasApi.result({ campaignId: id, windowDays: 7 });
        map.set(id, data || null);
      } catch (_) {
      }
    }));
    campaignResults = map;
  };

  const refreshSegmentPreview = async () => {
    if (!segmentPreview) return;
    if (!campanhasApi.resolveAudience) {
      segmentPreview.textContent = 'Segmentacao indisponivel.';
      return;
    }
    const segmentKey = String(selectSegmento?.value || 'all_active').trim().toLowerCase();
    segmentPreview.textContent = 'Calculando audiencia...';
    try {
      const data = await campanhasApi.resolveAudience({ segmentKey });
      if (data?.unavailable) {
        segmentPreview.textContent = data?.reason || 'Segmento indisponivel.';
        segmentPreview.title = data?.reason || 'Segmento indisponivel.';
        return;
      }
      segmentPreview.textContent = `${data?.total ?? 0} pacientes selecionados`;
      segmentPreview.title = '';
    } catch (err) {
      segmentPreview.textContent = 'Falha ao calcular audiencia.';
      segmentPreview.title = err?.message || '';
    }
  };

  const loadTodayLogs = async () => {
    if (!logsTbody || !campanhasApi.logsList) return;
    const today = getTodayValues().date;
    logsTbody.innerHTML = '<tr><td colspan="5" class="logs-empty">Carregando logs...</td></tr>';
    try {
      const payload = await campanhasApi.logsList({ dateFrom: today, dateTo: today, page: 1, limit: 200 });
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) {
        logsTbody.innerHTML = '<tr><td colspan="5" class="logs-empty">Sem logs hoje.</td></tr>';
        return;
      }
      logsTbody.innerHTML = items.map((item) => `
        <tr>
          <td>${formatHourBr(item.createdAt)}</td>
          <td>${item.campaignName || '--'}</td>
          <td>${item.patientName || '--'}</td>
          <td><span class="status-pill ${String(item.status || '').toLowerCase() === 'failed' ? 'failed' : 'sent'}">${item.status || '--'}</span></td>
          <td>${item.errorMessage || '--'}</td>
        </tr>
      `).join('');
    } catch (err) {
      logsTbody.innerHTML = '<tr><td colspan="5" class="logs-empty">Falha ao carregar logs.</td></tr>';
      console.error('Erro ao carregar logs de campanhas', err);
    }
  };

  const openLogsModal = async () => {
    if (!logsModal) return;
    logsModal.classList.add('open');
    logsModal.setAttribute('aria-hidden', 'false');
    await loadTodayLogs();
  };

  const closeLogsModal = () => {
    if (!logsModal) return;
    logsModal.classList.remove('open');
    logsModal.setAttribute('aria-hidden', 'true');
  };

  const openStrategyVideoModal = () => {
    if (!strategyVideoModal) return;
    strategyVideoModal.classList.add('open');
    strategyVideoModal.setAttribute('aria-hidden', 'false');
    if (strategyVideoIframe && !strategyVideoIframe.src) {
      strategyVideoIframe.src = strategyVideoSrc;
    }
  };

  const closeStrategyVideoModal = () => {
    if (!strategyVideoModal) return;
    strategyVideoModal.classList.remove('open');
    strategyVideoModal.setAttribute('aria-hidden', 'true');
  };

  const buildTemplatePayload = (template = {}, options = {}) => {
    const today = getTodayValues();
    const templateName = template.title || template.nome || 'Campanha';
    const description = template.description || template.descricao || '';
    const standardMsg = template.messages?.standard || '';
    const mergedDescription = [description, standardMsg].filter(Boolean).join('\n\n');
    return {
      nome: templateName,
      periodo: today.month,
      cor: template.color || template.cor || '#2a9d8f',
      descricao: mergedDescription || 'Campanha criada a partir da biblioteca anual Voithos.',
      inicio: options.inicio || today.date,
      fim: options.fim || '',
      canal: 'WhatsApp',
      status: 'rascunho',
      origem: 'clinica',
      publico: 'pacientes_clinica',
      segmentKey: options.segmentKey || template.segmentKey || 'all_active',
    };
  };

  const createCampaignFromTemplate = async (template = {}, source = 'campanhas-template') => {
    if (!canManage) {
      alert('Apenas admin e recepcionista podem criar campanhas.');
      return;
    }
    try {
      const created = await campanhasApi.create(buildTemplatePayload(template));
      if (!created) throw new Error('Nao foi possivel criar campanha a partir do template.');
      const normalized = normalizeCampaign(created);
      await reloadCampaignsData();
      emitCampaignsUpdated(source);
      openModalWith(normalized);
    } catch (err) {
      console.error('Erro ao criar campanha por template', err);
      alert(err?.message || 'Nao foi possivel ativar template.');
    }
  };

  const renderTemplates = () => {
    if (!templatesPanel) return;
    const monthly = templatesData.monthly || null;
    if (monthlyTemplateTitle) monthlyTemplateTitle.textContent = monthly?.nome || 'Template mensal indisponivel';
    if (monthlyTemplateDesc) monthlyTemplateDesc.textContent = monthly?.descricao || 'Sem template mensal no momento.';
    if (monthlyTemplateCta) monthlyTemplateCta.textContent = monthly?.cta ? `Sugestao: ${monthly.cta}` : '';
    if (monthlyTemplateCard) {
      monthlyTemplateCard.style.borderColor = monthly?.cor || '';
      monthlyTemplateCard.style.boxShadow = monthly?.cor ? `0 10px 24px ${monthly.cor}22` : '';
    }
    if (activateMonthlyTemplateBtn) {
      activateMonthlyTemplateBtn.disabled = !canManage || !monthly;
    }
    if (!quickTemplatesGrid) return;
    const templates = Array.isArray(templatesData.annualTemplates) ? templatesData.annualTemplates : [];
    if (!templates.length) {
      quickTemplatesGrid.innerHTML = '<div class="empty-state">Sem templates anuais disponiveis.</div>';
      return;
    }
    quickTemplatesGrid.innerHTML = templates.map((template, idx) => `
      <article class="quick-template-item" style="--tpl-accent:${template.color || template.cor || '#2a9d8f'}">
        <h4>${template.title || template.nome || 'Template'}</h4>
        <p>${template.description || template.descricao || 'Sem descricao'}</p>
        <small>${template.category || ''} | Impacto ${template.estimatedConversionImpact || template.priority || '--'}</small>
        <button type="button" class="btn ghost" data-action="use-template" data-template-index="${idx}" ${canManage ? '' : 'disabled'}>Usar template</button>
      </article>
    `).join('');
  };

  const loadTemplates = async () => {
    const currentMonth = new Date().getMonth() + 1;
    const applyFallbackTemplates = () => {
      const annualTemplates = [...FALLBACK_ANNUAL_TEMPLATES];
      const monthly = annualTemplates.find((item) => Number(item?.month) === currentMonth) || annualTemplates[0] || null;
      templatesData = { monthly, annualTemplates };
    };

    if (!campanhasApi.templates) {
      applyFallbackTemplates();
      renderTemplates();
      return;
    }
    try {
      const data = await campanhasApi.templates();
      const annualTemplatesFromApi = Array.isArray(data?.annualTemplates)
        ? data.annualTemplates
        : (Array.isArray(data?.quickTemplates) ? data.quickTemplates : []);
      const annualTemplates = Array.isArray(annualTemplatesFromApi) ? annualTemplatesFromApi.filter(Boolean) : [];
      const monthly = data?.monthly || annualTemplates.find((item) => Number(item?.month) === currentMonth) || null;
      templatesData = {
        monthly,
        annualTemplates,
      };
      if (!templatesData.monthly || !templatesData.annualTemplates.length) {
        applyFallbackTemplates();
      }
    } catch (err) {
      console.warn('Erro ao carregar templates de campanha', err);
      applyFallbackTemplates();
    }
    renderTemplates();
  };

  const reloadCampaignsData = async () => {
    campanhas = await loadCampaigns();
    await loadCampaignResults();
    render();
    await updateHealthPanel();
  };

  const render = () => {
    listEl.innerHTML = '';
    const visibleCampaigns = (currentUser?.tipo === 'dentista')
      ? campanhas.filter((c) => (c.status || 'ativa') === 'ativa')
      : campanhas;

    if (!visibleCampaigns.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhuma campanha criada';
      listEl.appendChild(empty);
      return;
    }
    visibleCampaigns.forEach((camp) => {
      listEl.appendChild(createCard(camp, campaignResults.get(camp.id) || null));
    });
  };

  const setSubmitLabel = (label) => {
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = label;
  };

  const openModalWith = (camp = null) => {
    if (!canManage) return;
    setupPublicoField();
    if (camp) {
      editingCampaignId = camp.id || null;
      if (inputNome) inputNome.value = camp.nome || '';
      if (inputDescricao) inputDescricao.value = camp.descricao || '';
      if (inputInicio) inputInicio.value = camp.inicio || '';
      if (inputFim) inputFim.value = camp.fim || '';
      if (selectCanal) selectCanal.value = camp.canal || '';
      if (inputPeriodo) inputPeriodo.value = camp.periodo || '';
      if (inputCor) inputCor.value = camp.cor || '#2a9d8f';
      if (selectStatus) selectStatus.value = camp.status || 'ativa';
      if (selectSegmento) selectSegmento.value = camp.segmentKey || 'all_active';
      setSubmitLabel('Salvar');
    } else {
      editingCampaignId = null;
      const today = getTodayValues();
      if (inputInicio && !inputInicio.value) inputInicio.value = today.date;
      if (inputFim && !inputFim.value) inputFim.value = today.date;
      if (inputPeriodo && !inputPeriodo.value) inputPeriodo.value = today.month;
      if (selectCanal && !selectCanal.value) selectCanal.value = 'WhatsApp';
      if (selectStatus && !selectStatus.value) selectStatus.value = 'ativa';
      if (selectSegmento && !selectSegmento.value) selectSegmento.value = 'all_active';
      setSubmitLabel('Adicionar');
    }
    refreshSegmentPreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => inputNome?.focus(), 50);
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    form?.reset();
    editingCampaignId = null;
    setSubmitLabel('Adicionar');
    if (selectPublico) selectPublico.value = 'pacientes_clinica';
    if (selectSegmento) selectSegmento.value = 'all_active';
    if (segmentPreview) segmentPreview.textContent = '';
  };

  const setupPublicoField = () => {
    if (selectPublico) {
      selectPublico.innerHTML = '';
      const option = document.createElement('option');
      option.value = 'pacientes_clinica';
      option.textContent = 'Pacientes da clinica';
      selectPublico.appendChild(option);
      selectPublico.value = 'pacientes_clinica';
      selectPublico.disabled = true;
    }
  };

  const openGlobalsModal = async () => {
    if (!canManage) return;
    globalsModal.classList.add('open');
    globalsModal.setAttribute('aria-hidden', 'false');
    try {
      const globals = await campanhasGlobalApi.list();
      globalsTextarea.value = JSON.stringify(globals || [], null, 2);
    } catch (err) {
      console.error('Erro ao carregar campanhas globais', err);
      globalsTextarea.value = '[]';
    }
    setTimeout(() => globalsTextarea?.focus(), 50);
  };

  const closeGlobalsModal = () => {
    globalsModal.classList.remove('open');
    globalsModal.setAttribute('aria-hidden', 'true');
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!canManage) {
      alert('Apenas admin e recepcionista podem criar campanhas.');
      return;
    }
    const periodoVal = inputPeriodo?.value || '';
    const inicioVal = inputInicio?.value || '';
    const fimVal = inputFim?.value || '';
    if (inicioVal && fimVal) {
      const inicioDate = new Date(inicioVal);
      const fimDate = new Date(fimVal);
      if (fimDate < inicioDate) {
        alert('A data de termino nao pode ser anterior ao inicio.');
        return;
      }
    }
    if (!selectCanal?.value) {
      alert('Selecione o meio de comunicacao.');
      return;
    }
    const payload = {
      nome: inputNome?.value.trim() || 'Campanha',
      periodo: periodoVal,
      cor: inputCor?.value || '#2a9d8f',
      descricao: inputDescricao?.value.trim() || '',
      inicio: inicioVal,
      fim: fimVal,
      canal: selectCanal?.value || '',
      status: selectStatus?.value || 'ativa',
      origem: 'clinica',
      publico: 'pacientes_clinica',
      segmentKey: String(selectSegmento?.value || 'all_active').trim().toLowerCase(),
    };

    try {
      if (editingCampaignId) {
        const updated = await campanhasApi.update({ id: editingCampaignId, changes: payload });
        if (updated) {
          await reloadCampaignsData();
          emitCampaignsUpdated('campanhas-update');
          closeModal();
        }
        return;
      }
      const created = await campanhasApi.create(payload);
      if (created) {
        await reloadCampaignsData();
        emitCampaignsUpdated('campanhas-create');
        closeModal();
      }
    } catch (err) {
      console.error('Erro ao salvar campanha', err);
      alert('Nao foi possivel salvar a campanha.');
    }
  };

  const buildCampaignMessage = (camp, paciente) => {
    const nomePaciente = paciente?.nome || paciente?.fullName || 'paciente';
    const nomeCampanha = camp?.nome || 'Campanha';
    const descricao = camp?.descricao || '';
    return `Ola, ${nomePaciente}. ${nomeCampanha}: ${descricao}`.trim();
  };

  const toDigits = (value) => String(value || '').replace(/\D/g, '');

  const dispatchCampaignWhatsApp = async (camp) => {
    const canSendCampaign = typeof whatsappApi.sendCampaign === 'function' || typeof clinicApi.queueWhatsApp === 'function';
    if (!camp || !canSendCampaign) {
      alert('Envio de WhatsApp indisponivel.');
      return;
    }
    const pacientes = await (patientsApi.list?.() || []);
    const segmentKey = String(camp?.segmentKey || 'all_active').trim().toLowerCase();
    let allowedPatients = null;
    if (campanhasApi.resolveAudience) {
      try {
        const audience = await campanhasApi.resolveAudience({ segmentKey });
        if (audience?.unavailable) {
          alert(audience?.reason || 'Segmento indisponivel para disparo.');
          return;
        }
        const ids = new Set((Array.isArray(audience?.patientIds) ? audience.patientIds : []).map((id) => String(id || '').trim()).filter(Boolean));
        allowedPatients = ids;
      } catch (err) {
        console.warn('Falha ao resolver audiencia da campanha', err);
      }
    }
    const elegiveis = (Array.isArray(pacientes) ? pacientes : [])
      .filter((p) => p?.allowsMessages !== false)
      .filter((p) => {
        if (!allowedPatients) return true;
        const keys = [p?.prontuario, p?.id, p?._id, p?.patientId, p?.pacienteId]
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        return keys.some((key) => allowedPatients.has(key));
      })
      .map((p) => ({
        patient: p,
        phone: p?.telefone || p?.phone || p?.celular || p?.whatsapp || '',
      }))
      .filter((item) => toDigits(item.phone).length >= 10);

    if (!elegiveis.length) {
      alert('Nao ha pacientes elegiveis para envio.');
      return;
    }
    const ok = confirm(`Disparar campanha para ${elegiveis.length} paciente(s)?`);
    if (!ok) return;

    let sendBatchId = '';
    try {
      const batch = await campanhasApi.createSendBatch?.({
        campaignId: camp.id || '',
        segmentKey,
        audienceCount: elegiveis.length,
      });
      sendBatchId = String(batch?.sendBatchId || '').trim();
    } catch (err) {
      console.warn('Falha ao criar lote de disparo de campanha', err);
    }

    let sent = 0;
    let failed = 0;
    for (const item of elegiveis) {
      const patientId = item.patient?.prontuario || item.patient?.id || item.patient?._id || '';
      try {
        if (typeof whatsappApi.sendCampaign === 'function') {
          const dispatchResult = await whatsappApi.sendCampaign({
            patient: item.patient,
            campaign: {
              id: camp.id || '',
              campaignId: camp.id || '',
              nome: camp.nome || '',
              descricao: camp.descricao || '',
              message: buildCampaignMessage(camp, item.patient),
            },
          });
          if (!dispatchResult?.success) {
            throw new Error(dispatchResult?.error || 'Falha no envio do WhatsApp');
          }
        } else {
          await clinicApi.queueWhatsApp({
            phone: item.phone,
            message: buildCampaignMessage(camp, item.patient),
            type: 'campaign',
            meta: {
              campaignId: camp.id || '',
              campaignName: camp.nome || '',
              patientId,
            },
            throttleMs: 1000,
            maxAttempts: 2,
            retryDelayMs: 1500,
          });
        }
        await campanhasApi.logDelivery?.({
          campaignId: camp.id || '',
          patientId,
          sendBatchId,
          channel: 'WHATSAPP',
          status: 'SENT',
        });
        sent += 1;
      } catch (err) {
        await campanhasApi.logDelivery?.({
          campaignId: camp.id || '',
          patientId,
          sendBatchId,
          channel: 'WHATSAPP',
          status: 'FAILED',
          errorMessage: err?.message || 'Falha no envio',
        });
        failed += 1;
      }
    }
    alert(`Disparo concluido. Sucesso: ${sent} | Falhas: ${failed}`);
    await reloadCampaignsData();
    emitCampaignsUpdated('campanhas-dispatch');
  };

  const init = async () => {
    currentUser = await ensureUser();
    canManage = ['admin', 'recepcionista'].includes(currentUser?.tipo);
    if (!canManage && openBtn) {
      openBtn.style.display = 'none';
    }
    if (!canManage && openGlobalsBtn) {
      openGlobalsBtn.style.display = 'none';
    }
    if (!canManage && activateMonthlyTemplateBtn) {
      activateMonthlyTemplateBtn.style.display = 'none';
    }
    campanhas = await loadCampaigns();
    await loadCampaignResults();
    await loadTemplates();
    setupPublicoField();
    render();
    await updateHealthPanel();
    await refreshSegmentPreview();
    if (editId) {
      const camp = campanhas.find((c) => String(c.id) === String(editId));
      if (camp) openModalWith(camp);
    }
  };
  const handleGlobalsSubmit = async (ev) => {
    ev.preventDefault();
    if (!canManage) return;
    const raw = globalsTextarea?.value || '[]';
    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      alert('JSON invalido.');
      return;
    }
    const validationError = validateGlobalsPayload(parsed);
    if (validationError) {
      alert(validationError);
      return;
    }
    try {
      await campanhasGlobalApi.save(parsed);
      await reloadCampaignsData();
      emitCampaignsUpdated('campanhas-globais-save');
      closeGlobalsModal();
    } catch (err) {
      console.error('Erro ao salvar campanhas globais', err);
      const message = err?.message || 'Nao foi possivel salvar as campanhas globais.';
      alert(message);
    }
  };

  openBtn?.addEventListener('click', () => openModalWith());
  activateMonthlyTemplateBtn?.addEventListener('click', () => {
    if (!templatesData.monthly) return;
    createCampaignFromTemplate(templatesData.monthly, 'campanhas-monthly-template');
  });

  openGlobalsBtn?.addEventListener('click', openGlobalsModal);
  closeBtn?.addEventListener('click', closeModal);
  globalsCloseBtn?.addEventListener('click', closeGlobalsModal);
  cancelBtn?.addEventListener('click', closeModal);

  listEl?.addEventListener('click', async (ev) => {
    const target = ev.target;
    const actionButton = target instanceof HTMLElement ? target.closest('button[data-action]') : null;
    if (actionButton) {
      const action = actionButton.dataset.action;
      const id = actionButton.dataset.id || '';
      if (!action || !id) return;
      const camp = campanhas.find((c) => c.id === id);
      if (!camp) return;
      if (!canManage || camp.somenteLeitura) return;
      if (action === 'edit') {
        openModalWith(camp);
        return;
      }
      if (action === 'send-whatsapp') {
        try {
          await dispatchCampaignWhatsApp(camp);
        } catch (err) {
          console.error('Erro ao disparar campanha', err);
          alert(err?.message || 'Nao foi possivel disparar a campanha.');
        }
        return;
      }
      if (action === 'delete') {
        if (!confirm('Excluir esta campanha?')) return;
        try {
          await campanhasApi.remove(id);
          await reloadCampaignsData();
          emitCampaignsUpdated('campanhas-delete');
        } catch (err) {
          console.error('Erro ao excluir campanha', err);
          alert('Nao foi possivel excluir a campanha.');
        }
      }
      return;
    }

    const card = target instanceof HTMLElement ? target.closest('.campanha-card') : null;
    if (!card) return;
    const id = card.dataset.id || '';
    if (!id || !canManage) return;
    const camp = campanhas.find((c) => c.id === id);
    if (!camp || camp.somenteLeitura) return;
    openModalWith(camp);
  });
  quickTemplatesGrid?.addEventListener('click', (ev) => {
    const btn = ev.target instanceof HTMLElement ? ev.target.closest('[data-action="use-template"]') : null;
    if (!btn) return;
    const index = Number(btn.dataset.templateIndex || -1);
    if (!Number.isInteger(index) || index < 0) return;
    const template = (Array.isArray(templatesData.annualTemplates) ? templatesData.annualTemplates : [])[index];
    if (!template) return;
    createCampaignFromTemplate(template, 'campanhas-quick-template');
  });
  globalsCancelBtn?.addEventListener('click', closeGlobalsModal);
  openLogsTodayBtn?.addEventListener('click', openLogsModal);
  closeLogsModalBtn?.addEventListener('click', closeLogsModal);
  openStrategyVideoBtn?.addEventListener('click', openStrategyVideoModal);
  closeStrategyVideoModalBtn?.addEventListener('click', closeStrategyVideoModal);
  selectSegmento?.addEventListener('change', refreshSegmentPreview);

  modal?.addEventListener('click', (ev) => {
    if (ev.target === modal) closeModal();
  });

  globalsModal?.addEventListener('click', (ev) => {
    if (ev.target === globalsModal) closeGlobalsModal();
  });
  logsModal?.addEventListener('click', (ev) => {
    if (ev.target === logsModal) closeLogsModal();
  });
  strategyVideoModal?.addEventListener('click', (ev) => {
    if (ev.target === strategyVideoModal) closeStrategyVideoModal();
  });

  window.addEventListener('campaigns-updated', () => {
    reloadCampaignsData();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'voithos-campaigns-updated') {
      reloadCampaignsData();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal?.classList.contains('open')) closeModal();
    if (ev.key === 'Escape' && globalsModal?.classList.contains('open')) closeGlobalsModal();
    if (ev.key === 'Escape' && logsModal?.classList.contains('open')) closeLogsModal();
    if (ev.key === 'Escape' && strategyVideoModal?.classList.contains('open')) closeStrategyVideoModal();
  });

  form?.addEventListener('submit', handleSubmit);
  globalsForm?.addEventListener('submit', handleGlobalsSubmit);

  init();
});
