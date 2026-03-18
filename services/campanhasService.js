const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const createCampanhasService = ({
  campaignsPath,
  campaignsFile,
  campaignsGlobalPath,
  campaignsGlobalFile,
  patientsPath,
  agendaPath,
  plansFile,
  financeFile,
  fsPromises,
  readJsonFile,
  writeJsonFile,
  pathExists,
  ensureDir,
  getCurrentUser,
}) => {
  const campaignLogsFile = path.join(campaignsPath, 'campaign_logs.json');
  const campaignBatchesFile = path.join(campaignsPath, 'campaign_send_batches.json');
  const getCurrentClinicId = () => {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return String(user?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  };

  const normalizeClinicId = (value) => String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;

  const buildGlobalId = (camp, fallbackIndex) => {
    const nome = String(camp?.nome || camp?.titulo || 'campanha')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const periodo = String(camp?.periodo || '')
      .replace(/[^0-9]+/g, '')
      .slice(0, 6);
    const base = [nome, periodo].filter(Boolean).join('-') || `campanha-${fallbackIndex}`;
    return `global-${base}`;
  };

  const normalizeCampaign = (camp = {}, overrides = {}) => {
    const raw = { ...camp };
    if (!raw.nome && raw.titulo) raw.nome = raw.titulo;

    const origem = overrides.origem || raw.origem || 'clinica';
    const clinicId = normalizeClinicId(overrides.clinicId || raw.clinicId);

    return {
      ...raw,
      ...overrides,
      clinicId,
      id: raw.id || overrides.id || '',
      nome: raw.nome || 'Campanha',
      periodo: raw.periodo || '',
      cor: raw.cor || '#2a9d8f',
      descricao: raw.descricao || '',
      status: ['rascunho', 'ativa', 'agendada', 'pausada', 'concluida', 'inativa'].includes(raw.status) ? raw.status : 'ativa',
      origem,
      somenteLeitura: origem === 'voithos',
      publico: raw.publico || 'pacientes_clinica',
      publicoLabel: raw.publicoLabel || 'Pacientes da clinica',
      criadoPor: raw.criadoPor || '',
      dataCriacao: raw.dataCriacao || '',
      dataAtualizacao: raw.dataAtualizacao || '',
    };
  };

  const nowIso = () => new Date().toISOString();
  const dayKey = (dateLike) => {
    const dt = dateLike ? new Date(dateLike) : new Date();
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const toCampaignDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00`);
    if (/^\d{4}-\d{2}$/.test(raw)) return new Date(`${raw}-01T00:00:00`);
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };
  const normalizeCampaignStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'rascunho') return 'rascunho';
    if (raw === 'ativa') return 'ativa';
    if (raw === 'agendada') return 'agendada';
    if (raw === 'pausada') return 'pausada';
    if (raw === 'concluida' || raw === 'concluída') return 'concluida';
    if (raw === 'inativa') return 'inativa';
    return 'ativa';
  };

  const normalizeLogStatus = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'FAILED') return 'FAILED';
    if (raw === 'DELIVERED') return 'DELIVERED';
    if (raw === 'READ') return 'READ';
    if (raw === 'REPLIED') return 'REPLIED';
    return 'SENT';
  };
  const normalizeLogChannel = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'SMS') return 'SMS';
    if (raw === 'EMAIL') return 'EMAIL';
    return 'WHATSAPP';
  };
  const generateLogId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const generateSendBatchId = () => `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const ensureCampaignLogsFile = async () => {
    await ensureDir(campaignsPath);
    if (!(await pathExists(campaignLogsFile))) {
      await writeJsonFile(campaignLogsFile, { logs: [] });
    }
  };

  const readCampaignLogs = async () => {
    await ensureCampaignLogsFile();
    const payload = await readJsonFile(campaignLogsFile);
    const list = Array.isArray(payload?.logs) ? payload.logs : [];
    return list.map((item) => ({
      logId: String(item?.logId || generateLogId()),
      clinicId: normalizeClinicId(item?.clinicId),
      campaignId: String(item?.campaignId || '').trim(),
      patientId: String(item?.patientId || '').trim(),
      sendBatchId: String(item?.sendBatchId || '').trim(),
      channel: normalizeLogChannel(item?.channel),
      status: normalizeLogStatus(item?.status),
      createdAt: item?.createdAt || nowIso(),
      errorMessage: String(item?.errorMessage || '').trim(),
    }));
  };

  const writeCampaignLogs = async (logs) => {
    await ensureCampaignLogsFile();
    await writeJsonFile(campaignLogsFile, { logs: Array.isArray(logs) ? logs : [] });
  };

  const ensureCampaignBatchesFile = async () => {
    await ensureDir(campaignsPath);
    if (!(await pathExists(campaignBatchesFile))) {
      await writeJsonFile(campaignBatchesFile, { batches: [], recipients: [] });
    }
  };

  const readCampaignBatchesPayload = async () => {
    await ensureCampaignBatchesFile();
    const payload = await readJsonFile(campaignBatchesFile).catch(() => null);
    return {
      batches: Array.isArray(payload?.batches) ? payload.batches : [],
      recipients: Array.isArray(payload?.recipients) ? payload.recipients : [],
    };
  };

  const writeCampaignBatchesPayload = async ({ batches, recipients }) => {
    await ensureCampaignBatchesFile();
    await writeJsonFile(campaignBatchesFile, {
      batches: Array.isArray(batches) ? batches : [],
      recipients: Array.isArray(recipients) ? recipients : [],
    });
  };

  const isValidPeriodo = (value) => {
    if (!value) return true;
    return /^\d{4}-\d{2}$/.test(String(value));
  };

  const isValidHexColor = (value) => {
    if (!value) return true;
    const raw = String(value).trim();
    return /^#?[0-9a-fA-F]{6}$/.test(raw);
  };

  const validateGlobalCampaignList = (payload = []) => {
    if (!Array.isArray(payload)) {
      throw new Error('Lista de campanhas invalida.');
    }
    const errors = [];
    payload.forEach((camp, idx) => {
      if (!camp || typeof camp !== 'object') {
        errors.push(`#${idx + 1}: item invalido`);
        return;
      }
      const nome = camp.nome || camp.titulo;
      if (!nome) {
        errors.push(`#${idx + 1}: nome/titulo obrigatorio`);
      }
      if (!isValidPeriodo(camp.periodo)) {
        errors.push(`#${idx + 1}: periodo invalido (use AAAA-MM)`);
      }
      if (!isValidHexColor(camp.cor)) {
        errors.push(`#${idx + 1}: cor invalida (use #RRGGBB)`);
      }
      if (camp.status && !['ativa', 'inativa'].includes(camp.status)) {
        errors.push(`#${idx + 1}: status invalido`);
      }
      if (camp.publico && camp.publico !== 'pacientes_clinica') {
        errors.push(`#${idx + 1}: publico invalido`);
      }
    });
    if (errors.length) {
      throw new Error(`Campanhas globais invalidas: ${errors.join('; ')}`);
    }
  };

  const normalizeGlobalCampaign = (camp = {}, index = 0) => {
    const id = camp.id || buildGlobalId(camp, index);
    return normalizeCampaign(camp, { origem: 'voithos', id, clinicId: DEFAULT_CLINIC_ID });
  };

  const generateCampaignId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const readAllLocalCampaigns = async () => {
    await ensureDir(campaignsPath);
    if (!(await pathExists(campaignsFile))) return [];
    try {
      const data = await readJsonFile(campaignsFile);
      if (!Array.isArray(data)) return [];
      return data.map((camp) => normalizeCampaign(camp, { origem: 'clinica' }));
    } catch (err) {
      console.error('Erro ao ler campanhas locais:', err);
      return [];
    }
  };

  const writeAllLocalCampaigns = async (data) => {
    await ensureDir(campaignsPath);
    await writeJsonFile(campaignsFile, data);
  };

  const readClinicPatients = async (clinicId) => {
    if (!patientsPath || !fsPromises) return [];
    if (!(await pathExists(patientsPath))) return [];
    const files = await fsPromises.readdir(patientsPath).catch(() => []);
    const list = [];
    for (const file of files) {
      if (!String(file).endsWith('.json')) continue;
      try {
        const item = await readJsonFile(path.join(patientsPath, file));
        if (!item || typeof item !== 'object') continue;
        if (normalizeClinicId(item.clinicId) !== clinicId) continue;
        list.push(item);
      } catch (_) {
      }
    }
    return list;
  };

  const toPatientKeyCandidates = (item = {}) => {
    const keys = [
      item.prontuario,
      item.patientId,
      item.pacienteId,
      item.id,
      item._id,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return Array.from(new Set(keys));
  };

  const readAgendaAppointments = async ({ clinicId, dateFrom = null } = {}) => {
    if (!agendaPath || !fsPromises) return [];
    if (!(await pathExists(agendaPath))) return [];
    const files = await fsPromises.readdir(agendaPath).catch(() => []);
    const result = [];
    for (const file of files) {
      if (!String(file).endsWith('.json')) continue;
      try {
        const payload = await readJsonFile(path.join(agendaPath, file));
        const list = Array.isArray(payload?.agendamentos) ? payload.agendamentos : [];
        for (const appt of list) {
          if (normalizeClinicId(appt?.clinicId) !== clinicId) continue;
          if (dateFrom && String(appt?.data || '') < dateFrom) continue;
          result.push(appt);
        }
      } catch (_) {
      }
    }
    return result;
  };

  const getAppointmentCreatedAt = (appt = {}) => {
    const dataCriacao = String(appt?.dataCriacao || '').trim();
    const horaCriacao = String(appt?.horaCriacao || '').trim();
    if (dataCriacao) {
      const dt = new Date(`${dataCriacao}T${horaCriacao || '00:00'}:00`);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
    const data = String(appt?.data || '').trim();
    const hora = String(appt?.horaInicio || '').trim();
    if (data) {
      const dt = new Date(`${data}T${hora || '00:00'}:00`);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
    return null;
  };

  const readPlans = async () => {
    if (!plansFile || !(await pathExists(plansFile))) return [];
    const payload = await readJsonFile(plansFile).catch(() => null);
    return Array.isArray(payload?.plans) ? payload.plans : [];
  };

  const readFinanceRows = async () => {
    if (!financeFile || !(await pathExists(financeFile))) return [];
    const payload = await readJsonFile(financeFile).catch(() => null);
    return Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  };

  const normalizeMoney = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value).trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      raw = raw.replace(',', '.');
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeDateOnly = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  };

  const getPatientIdentityMap = (patients = []) => {
    const map = new Map();
    patients.forEach((patient) => {
      const keys = toPatientKeyCandidates(patient);
      keys.forEach((key) => {
        if (!map.has(key)) map.set(key, patient);
      });
    });
    return map;
  };

  const readLocalCampaigns = async () => {
    const clinicId = getCurrentClinicId();
    const list = await readAllLocalCampaigns();
    return list.filter((camp) => normalizeClinicId(camp.clinicId) === clinicId);
  };

  const readGlobalCampaigns = async () => {
    if (!campaignsGlobalPath || !campaignsGlobalFile) return [];
    await ensureDir(campaignsGlobalPath);
    if (!(await pathExists(campaignsGlobalFile))) return [];
    try {
      const data = await readJsonFile(campaignsGlobalFile);
      if (!Array.isArray(data)) return [];
      return data.map((camp, idx) => normalizeGlobalCampaign(camp, idx));
    } catch (err) {
      console.error('Erro ao ler campanhas globais:', err);
      return [];
    }
  };

  const listGlobalCampaigns = async () => readGlobalCampaigns();

  const saveGlobalCampaigns = async (payload = []) => {
    if (!campaignsGlobalPath || !campaignsGlobalFile) {
      throw new Error('Campanhas globais indisponiveis.');
    }
    validateGlobalCampaignList(payload);
    await ensureDir(campaignsGlobalPath);
    const list = payload.map((camp, idx) => normalizeGlobalCampaign(camp, idx));
    const seen = new Set();
    const unique = list.map((camp, idx) => {
      let id = camp.id;
      if (seen.has(id)) {
        id = `${id}-${idx + 1}`;
      }
      seen.add(id);
      return { ...camp, id };
    });
    await writeJsonFile(campaignsGlobalFile, unique);
    return unique;
  };

  const listCampaigns = async () => {
    const [locals, globals] = await Promise.all([
      readLocalCampaigns(),
      readGlobalCampaigns(),
    ]);

    const mergedMap = new Map();
    globals.forEach((camp) => {
      mergedMap.set(camp.id, camp);
    });
    locals.forEach((camp) => {
      mergedMap.set(camp.id, camp);
    });

    const merged = Array.from(mergedMap.values());
    const currentUser = getCurrentUser();
    if (currentUser?.tipo === 'dentista') {
      return merged.filter((c) => (c.status || 'ativa') === 'ativa');
    }
    return merged;
  };

  const createCampaignSendBatch = async (payload = {}) => {
    const clinicId = getCurrentClinicId();
    const campaignId = String(payload?.campaignId || '').trim();
    if (!campaignId) throw new Error('campaignId obrigatorio.');
    const sendBatchId = String(payload?.sendBatchId || generateSendBatchId()).trim();
    const segmentKey = String(payload?.segmentKey || 'all_active').trim().toLowerCase();
    const audienceCount = Math.max(0, Number(payload?.audienceCount) || 0);
    const createdAt = payload?.createdAt || nowIso();
    const state = await readCampaignBatchesPayload();
    state.batches.push({
      sendBatchId,
      clinicId,
      campaignId,
      createdAt,
      segmentKey,
      audienceCount,
      sentCount: 0,
      failedCount: 0,
      updatedAt: createdAt,
    });
    await writeCampaignBatchesPayload(state);
    return {
      sendBatchId,
      clinicId,
      campaignId,
      createdAt,
      segmentKey,
      audienceCount,
      sentCount: 0,
      failedCount: 0,
    };
  };

  const recordCampaignDeliveryLog = async (payload = {}) => {
    const clinicId = getCurrentClinicId();
    const campaignId = String(payload?.campaignId || '').trim();
    if (!campaignId) throw new Error('campaignId obrigatorio.');
    const logs = await readCampaignLogs();
    const entry = {
      logId: generateLogId(),
      clinicId,
      campaignId,
      patientId: String(payload?.patientId || '').trim(),
      sendBatchId: String(payload?.sendBatchId || '').trim(),
      channel: normalizeLogChannel(payload?.channel),
      status: normalizeLogStatus(payload?.status),
      createdAt: payload?.createdAt || nowIso(),
      errorMessage: String(payload?.errorMessage || '').trim(),
    };
    logs.push(entry);
    await writeCampaignLogs(logs);

    const sendBatchId = String(payload?.sendBatchId || '').trim();
    if (sendBatchId) {
      const state = await readCampaignBatchesPayload();
      const batchIdx = state.batches.findIndex((item) =>
        normalizeClinicId(item?.clinicId) === clinicId
        && String(item?.campaignId || '').trim() === campaignId
        && String(item?.sendBatchId || '').trim() === sendBatchId);
      if (batchIdx >= 0) {
        const recipientKey = `${sendBatchId}::${entry.patientId}`;
        const recipientIdx = state.recipients.findIndex((item) =>
          `${String(item?.sendBatchId || '').trim()}::${String(item?.patientId || '').trim()}` === recipientKey);
        const recipientPayload = {
          sendBatchId,
          clinicId,
          campaignId,
          patientId: entry.patientId,
          status: entry.status,
          createdAt: entry.createdAt,
          errorMessage: entry.errorMessage,
        };
        if (recipientIdx >= 0) {
          state.recipients[recipientIdx] = { ...state.recipients[recipientIdx], ...recipientPayload };
        } else {
          state.recipients.push(recipientPayload);
        }

        const recipients = state.recipients.filter((item) =>
          normalizeClinicId(item?.clinicId) === clinicId
          && String(item?.sendBatchId || '').trim() === sendBatchId);
        const sentCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'SENT').length;
        const failedCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'FAILED').length;
        state.batches[batchIdx] = {
          ...state.batches[batchIdx],
          sentCount,
          failedCount,
          updatedAt: nowIso(),
        };
        await writeCampaignBatchesPayload(state);
      }
    }

    return entry;
  };

  const annualTemplateCatalog = [
    {
      month: 1,
      id: 'annual-janeiro-sorriso-ano-novo',
      title: 'Sorriso do Ano Novo',
      description: 'Campanha estrategica para renovacao estetica no inicio do ano.',
      category: 'AESTHETICS',
      objective: 'Converter pacientes interessados em renovar o sorriso',
      segmentSuggestion: 'Pacientes ativos e inativos 180 dias',
      validityDays: 31,
      priority: 'HIGH',
      color: '#0ea5e9',
      messages: {
        short: 'Inicio de ano com avaliacao e clareamento especial. Quer que eu reserve um horario?',
        standard: 'Ola, {NOME_PACIENTE}! 😊\n\nO inicio do ano e o momento perfeito para cuidar do seu sorriso.\n\nAqui na {NOME_CLINICA}, estamos com uma condicao especial para avaliacao e clareamento dental.\n\nSe quiser saber mais ou agendar uma avaliacao, e so me chamar por aqui.',
        humanized: 'Oi, {NOME_PACIENTE}! Que seu ano comece com saude e confianca no sorriso. Se quiser, eu te ajudo a organizar uma avaliacao para clareamento com a equipe da {NOME_CLINICA}.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 2,
      id: 'annual-fevereiro-pos-carnaval',
      title: 'Seu sorriso apos o Carnaval',
      description: 'Aproveita o periodo pos-festas para retomar prevencao e limpeza.',
      category: 'PREVENTION',
      objective: 'Profilaxia e limpeza',
      segmentSuggestion: 'Pacientes ativos',
      validityDays: 28,
      priority: 'HIGH',
      color: '#22c55e',
      messages: {
        short: 'Pos-Carnaval: limpeza e check-up preventivo com agenda aberta.',
        standard: 'Ola, {NOME_PACIENTE}!\n\nApos o periodo de festas, e sempre importante realizar uma limpeza e avaliacao preventiva.\n\nEstamos com agenda aberta para profilaxia e check-up.\n\nSe desejar, posso verificar um horario para voce.',
        humanized: 'Oi, {NOME_PACIENTE}! Depois do ritmo das festas, uma limpeza e um check-up ajudam muito a manter tudo em dia. Se quiser, eu vejo os melhores horarios para voce na {NOME_CLINICA}.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 3,
      id: 'annual-marco-checkup-preventivo',
      title: 'Check-up Preventivo',
      description: 'Mes ideal para revisao completa e identificacao precoce de riscos.',
      category: 'PREVENTION',
      objective: 'Avaliacao preventiva',
      segmentSuggestion: 'Pacientes inativos ha 90 dias',
      validityDays: 31,
      priority: 'HIGH',
      color: '#14b8a6',
      messages: {
        short: 'Marco do check-up: revise sua saude bucal com antecedencia.',
        standard: 'Ola, {NOME_PACIENTE}! Passando para lembrar que o check-up preventivo ajuda a evitar tratamentos mais complexos no futuro.\n\nA agenda da {NOME_CLINICA} esta aberta para avaliacao completa.',
        humanized: 'Oi, {NOME_PACIENTE}! Um check-up agora pode evitar dor e custo la na frente. Se fizer sentido, te ajudo a agendar na {NOME_CLINICA}.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 4,
      id: 'annual-abril-saude-gengival',
      title: 'Saude da gengiva e prevencao',
      description: 'Campanha de cuidado gengival e controle de placa bacteriana.',
      category: 'PREVENTION',
      objective: 'Prevenir inflamacao e sangramento gengival',
      segmentSuggestion: 'Pacientes que nao fizeram limpeza',
      validityDays: 30,
      priority: 'HIGH',
      color: '#0f766e',
      messages: {
        short: 'Abril da gengiva saudavel: avaliacao preventiva e orientacao personalizada.',
        standard: 'Ola, {NOME_PACIENTE}! A saude da gengiva e essencial para manter os dentes fortes e evitar desconfortos.\n\nEstamos com horario para avaliacao preventiva e orientacoes de cuidado diario.',
        humanized: 'Oi, {NOME_PACIENTE}! Se voce tem notado sensibilidade ou sangramento, vale uma avaliacao tranquila para prevenir evolucoes. Posso te ajudar com o agendamento.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 5,
      id: 'annual-maio-dia-das-maes',
      title: 'Cuidado especial com o sorriso',
      description: 'Acao sazonal com foco em autoestima e estetica no Dia das Maes.',
      category: 'AESTHETICS',
      objective: 'Estimular cuidado estetico com abordagem afetiva',
      segmentSuggestion: 'Pacientes ativos',
      validityDays: 31,
      priority: 'MEDIUM',
      color: '#ec4899',
      messages: {
        short: 'Maio especial: cuidado estetico com condicoes de avaliacao.',
        standard: 'Ola, {NOME_PACIENTE}! Em maio, estamos com uma acao especial para quem quer cuidar do sorriso com mais carinho e planejamento.\n\nSe quiser, posso te apresentar as opcoes de avaliacao na {NOME_CLINICA}.',
        humanized: 'Oi, {NOME_PACIENTE}! Maio e um mes de cuidado e reconhecimento. Se voce quiser dar esse passo com seu sorriso, posso organizar uma avaliacao para voce.',
      },
      estimatedConversionImpact: 'MEDIUM',
    },
    {
      month: 6,
      id: 'annual-junho-dia-dos-namorados',
      title: 'Seu sorriso em destaque',
      description: 'Campanha de valorizacao estetica para periodo de eventos e encontros.',
      category: 'AESTHETICS',
      objective: 'Aumentar adesao a tratamentos esteticos',
      segmentSuggestion: 'Pacientes ativos e inativos 180 dias',
      validityDays: 30,
      priority: 'HIGH',
      color: '#f43f5e',
      messages: {
        short: 'Junho com sorriso em destaque: avaliacao estetica e planejamento.',
        standard: 'Ola, {NOME_PACIENTE}! Junho e um periodo em que muita gente busca deixar o sorriso ainda mais bonito.\n\nEstamos com agenda para avaliacao estetica e planejamento personalizado.',
        humanized: 'Oi, {NOME_PACIENTE}! Se estiver pensando em realcar seu sorriso, posso te ajudar a dar o primeiro passo com uma avaliacao tranquila na {NOME_CLINICA}.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 7,
      id: 'annual-julho-ferias-avaliacao',
      title: 'Avaliacao nas ferias',
      description: 'Aproveita o periodo de ferias para revisao ortodontica e ajustes.',
      category: 'ORTHODONTICS',
      objective: 'Aumentar consultas de ortodontia e manutencao',
      segmentSuggestion: 'Pacientes inativos ha 90 dias',
      validityDays: 31,
      priority: 'HIGH',
      color: '#6366f1',
      messages: {
        short: 'Ferias: bom momento para revisao ortodontica e ajustes.',
        standard: 'Ola, {NOME_PACIENTE}! As ferias sao uma otima oportunidade para atualizar sua avaliacao odontologica e ortodontica com mais calma.\n\nSe quiser, posso sugerir um horario.',
        humanized: 'Oi, {NOME_PACIENTE}! Nas ferias fica mais facil encaixar aquela revisao pendente. Se fizer sentido para voce, te ajudo a agendar.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 8,
      id: 'annual-agosto-dia-dos-pais',
      title: 'Check-up preventivo',
      description: 'Campanha preventiva de agosto com foco em rotina de saude.',
      category: 'PREVENTION',
      objective: 'Retomar consultas preventivas',
      segmentSuggestion: 'Pacientes ativos',
      validityDays: 31,
      priority: 'MEDIUM',
      color: '#0f172a',
      messages: {
        short: 'Agosto preventivo: check-up para manter a saude bucal em dia.',
        standard: 'Ola, {NOME_PACIENTE}! Agosto e um bom momento para colocar o check-up preventivo em dia e evitar imprevistos.\n\nSe desejar, posso verificar um horario para voce.',
        humanized: 'Oi, {NOME_PACIENTE}! Manter a prevencao em dia faz toda diferenca no longo prazo. Se quiser, vejo um horario que fique confortavel para voce.',
      },
      estimatedConversionImpact: 'MEDIUM',
    },
    {
      month: 9,
      id: 'annual-setembro-primavera-sorriso',
      title: 'Primavera do sorriso',
      description: 'Campanha estetica para renovacao no periodo da primavera.',
      category: 'AESTHETICS',
      objective: 'Converter interesse em estetica dental',
      segmentSuggestion: 'Pacientes ativos e inativos 180 dias',
      validityDays: 30,
      priority: 'HIGH',
      color: '#84cc16',
      messages: {
        short: 'Primavera do sorriso: renovacao estetica com avaliacao personalizada.',
        standard: 'Ola, {NOME_PACIENTE}! A primavera e um convite para renovacao, inclusive do sorriso.\n\nEstamos com agenda aberta para avaliacao estetica e plano individualizado.',
        humanized: 'Oi, {NOME_PACIENTE}! Que tal aproveitar este periodo para renovar seu sorriso com seguranca? Posso te ajudar com uma avaliacao inicial.',
      },
      estimatedConversionImpact: 'HIGH',
    },
    {
      month: 10,
      id: 'annual-outubro-cuidado-prevencao',
      title: 'Cuidado e prevencao com sua saude',
      description: 'Comunicacao preventiva com abordagem respeitosa e profissional.',
      category: 'PREVENTION',
      objective: 'Incentivar avaliacao odontologica preventiva',
      segmentSuggestion: 'Pacientes inativos ha 180 dias',
      validityDays: 31,
      priority: 'MEDIUM',
      color: '#f97316',
      messages: {
        short: 'Outubro da prevencao: avaliacao odontologica com cuidado integral.',
        standard: 'Ola, {NOME_PACIENTE}!\n\nA prevencao e sempre o melhor caminho para cuidar da saude.\n\nEsse e um bom momento para realizar sua avaliacao odontologica e garantir que esta tudo bem.\n\nSe desejar, posso verificar um horario para voce.',
        humanized: 'Oi, {NOME_PACIENTE}! Cuidar da saude com antecedencia traz mais tranquilidade. Se quiser, eu organizo uma avaliacao preventiva para voce na {NOME_CLINICA}.',
      },
      estimatedConversionImpact: 'MEDIUM',
    },
    {
      month: 11,
      id: 'annual-novembro-avaliacao-preventiva',
      title: 'Avaliacao preventiva e cuidado com sua saude',
      description: 'Acao de novembro com foco em bem-estar e rotina preventiva.',
      category: 'PREVENTION',
      objective: 'Aumentar volume de avaliacao preventiva',
      segmentSuggestion: 'Pacientes inativos ha 90 dias',
      validityDays: 30,
      priority: 'MEDIUM',
      color: '#1d4ed8',
      messages: {
        short: 'Novembro preventivo: agenda aberta para avaliacoes.',
        standard: 'Ola, {NOME_PACIENTE}!\n\nManter sua saude bucal em dia faz toda a diferenca no seu bem-estar.\n\nEstamos com agenda aberta para avaliacoes preventivas.\n\nSe desejar, posso verificar um horario para voce.',
        humanized: 'Oi, {NOME_PACIENTE}! Pequenos cuidados frequentes evitam grandes problemas. Se fizer sentido, te ajudo a agendar uma avaliacao preventiva.',
      },
      estimatedConversionImpact: 'MEDIUM',
    },
    {
      month: 12,
      id: 'annual-dezembro-sorriso-fim-ano',
      title: 'Seu sorriso para o fim do ano',
      description: 'Campanha de fim de ano para eventos, fotos e confraternizacoes.',
      category: 'AESTHETICS',
      objective: 'Preparacao para festas e eventos',
      segmentSuggestion: 'Pacientes ativos e inativos 180 dias',
      validityDays: 31,
      priority: 'HIGH',
      color: '#0f766e',
      messages: {
        short: 'Fim de ano com sorriso preparado para eventos e celebracoes.',
        standard: 'Ola, {NOME_PACIENTE}! O fim do ano e um excelente momento para deixar seu sorriso pronto para eventos e encontros especiais.\n\nSe quiser, posso te orientar sobre a melhor avaliacao para este periodo.',
        humanized: 'Oi, {NOME_PACIENTE}! Se voce quer chegar nas festas com mais confianca no sorriso, posso te ajudar a organizar uma avaliacao com a equipe.',
      },
      estimatedConversionImpact: 'HIGH',
    },
  ];

  const segmentSuggestionToKey = (value) => {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('180')) return 'inactive_180';
    if (raw.includes('90')) return 'inactive_90';
    if (raw.includes('limpeza')) return 'never_cleaning';
    if (raw.includes('anivers')) return 'birthday_month';
    if (raw.includes('atras')) return 'plan_overdue';
    return 'all_active';
  };

  const toLegacyTemplateShape = (item = {}) => ({
    ...item,
    nome: item.title || item.nome || 'Template',
    descricao: item.description || item.descricao || '',
    cor: item.color || item.cor || '#2a9d8f',
    cta: item.messages?.short || '',
    segmentKey: segmentSuggestionToKey(item.segmentSuggestion),
  });

  const listCampaignTemplates = async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const annualTemplates = annualTemplateCatalog.map((item) => toLegacyTemplateShape(item));
    const monthly = annualTemplates.find((item) => item.month === month) || annualTemplates[0];
    return {
      month,
      monthly,
      monthlyCampaignTemplates: annualTemplates,
      annualTemplates,
      quickTemplates: annualTemplates,
    };
  };

  const getCampaignsDashboard = async () => {
    const clinicId = getCurrentClinicId();
    const [campaigns, logs] = await Promise.all([listCampaigns(), readCampaignLogs()]);
    const clinicLogs = logs.filter((item) => normalizeClinicId(item?.clinicId) === clinicId);
    const today = dayKey(new Date());
    const logsToday = clinicLogs.filter((item) => dayKey(item?.createdAt) === today);
    const sentToday = logsToday.filter((item) => item.status === 'SENT').length;
    const failedToday = logsToday.filter((item) => item.status === 'FAILED').length;
    const attempts = sentToday + failedToday;
    const deliveryRateToday = attempts > 0 ? (sentToday / attempts) : null;

    const eligible = (Array.isArray(campaigns) ? campaigns : [])
      .map((camp) => ({ ...camp, status: normalizeCampaignStatus(camp?.status) }))
      .filter((camp) => camp.status === 'ativa' || camp.status === 'agendada')
      .map((camp) => ({ ...camp, inicioDate: toCampaignDate(camp?.inicio) }))
      .filter((camp) => camp.inicioDate && !Number.isNaN(camp.inicioDate.getTime()))
      .filter((camp) => camp.inicioDate.getTime() > Date.now())
      .sort((a, b) => a.inicioDate.getTime() - b.inicioDate.getTime());

    const next = eligible[0] || null;
    const lastSent = clinicLogs
      .filter((item) => item.status === 'SENT')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

    const activeCampaigns = (Array.isArray(campaigns) ? campaigns : [])
      .map((camp) => normalizeCampaignStatus(camp?.status))
      .filter((status) => status === 'ativa' || status === 'agendada')
      .length;

    return {
      sentToday,
      failedToday,
      deliveryRateToday,
      responseRate: null,
      nextEligibleSend: next ? {
        id: String(next.id || '').trim(),
        nome: next.nome || 'Campanha',
        inicio: next.inicio || '',
        status: normalizeCampaignStatus(next.status),
        canal: next.canal || '',
      } : null,
      activeCampaigns,
      lastSendAt: lastSent?.createdAt || null,
      updatedAt: nowIso(),
    };
  };

  const listCampaignLogs = async ({
    dateFrom,
    dateTo,
    status,
    campaignId,
    page = 1,
    limit = 50,
  } = {}) => {
    const clinicId = getCurrentClinicId();
    const [allLogs, campaigns, patients] = await Promise.all([
      readCampaignLogs(),
      listCampaigns(),
      readClinicPatients(clinicId),
    ]);
    const campaignMap = new Map((Array.isArray(campaigns) ? campaigns : []).map((camp) => [String(camp?.id || '').trim(), camp]));
    const patientMap = getPatientIdentityMap(patients);
    const statusFilter = normalizeLogStatus(status || '');
    const hasStatusFilter = Boolean(String(status || '').trim());
    const fromKey = normalizeDateOnly(dateFrom);
    const toKey = normalizeDateOnly(dateTo);
    const filtered = allLogs
      .filter((item) => normalizeClinicId(item?.clinicId) === clinicId)
      .filter((item) => !campaignId || String(item?.campaignId || '').trim() === String(campaignId || '').trim())
      .filter((item) => !hasStatusFilter || item.status === statusFilter)
      .filter((item) => {
        const key = dayKey(item?.createdAt);
        if (fromKey && key < fromKey) return false;
        if (toKey && key > toKey) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const safePage = Math.max(1, Number(page) || 1);
    const start = (safePage - 1) * safeLimit;
    const pageItems = filtered.slice(start, start + safeLimit).map((item) => {
      const camp = campaignMap.get(String(item.campaignId || '').trim());
      const patient = patientMap.get(String(item.patientId || '').trim());
      return {
        ...item,
        campaignName: camp?.nome || 'Campanha',
        patientName: patient?.fullName || patient?.nome || item.patientId || '--',
        sendBatchId: String(item?.sendBatchId || '').trim(),
      };
    });

    return {
      items: pageItems,
      total: filtered.length,
      page: safePage,
      limit: safeLimit,
      hasMore: start + safeLimit < filtered.length,
    };
  };

  const resolveAudience = async ({ segmentKey, filters = {} } = {}) => {
    const clinicId = getCurrentClinicId();
    const normalizedKey = String(segmentKey || 'all_active').trim().toLowerCase();
    const patients = await readClinicPatients(clinicId);
    const patientMap = getPatientIdentityMap(patients);
    const getAllActiveKeys = () => patients
      .filter((patient) => patient?.allowsMessages !== false)
      .map((patient) => String(patient?.prontuario || patient?.id || patient?._id || '').trim())
      .filter(Boolean);

    if (!patients.length) {
      return { segmentKey: normalizedKey, unavailable: true, reason: 'Sem pacientes cadastrados.', total: 0, patientIds: [] };
    }

    if (normalizedKey === 'all_active') {
      const patientIds = getAllActiveKeys();
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'inactive_90' || normalizedKey === 'inactive_180') {
      const days = normalizedKey === 'inactive_180' ? 180 : 90;
      const limitDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      const appointments = await readAgendaAppointments({ clinicId });
      const lastByPatient = new Map();

      appointments.forEach((appt) => {
        const dt = new Date(`${String(appt?.data || '').trim()}T00:00:00`);
        if (Number.isNaN(dt.getTime())) return;
        toPatientKeyCandidates(appt).forEach((key) => {
          const current = lastByPatient.get(key);
          if (!current || current < dt.getTime()) lastByPatient.set(key, dt.getTime());
        });
      });

      patients.forEach((patient) => {
        const consultas = Array.isArray(patient?.consultas) ? patient.consultas : [];
        consultas.forEach((consulta) => {
          const dt = new Date(`${String(consulta?.data || '').trim()}T00:00:00`);
          if (Number.isNaN(dt.getTime())) return;
          toPatientKeyCandidates(patient).forEach((key) => {
            const current = lastByPatient.get(key);
            if (!current || current < dt.getTime()) lastByPatient.set(key, dt.getTime());
          });
        });
      });

      const patientIds = getAllActiveKeys().filter((id) => {
        const time = lastByPatient.get(id);
        return !time || time < limitDate.getTime();
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'never_cleaning') {
      const hasServiceData = patients.some((patient) => Array.isArray(patient?.servicos));
      if (!hasServiceData) {
        return { segmentKey: normalizedKey, unavailable: true, reason: 'Segmento indisponivel sem historico de servicos.', total: 0, patientIds: [] };
      }
      const patientIds = getAllActiveKeys().filter((id) => {
        const patient = patientMap.get(id);
        const services = Array.isArray(patient?.servicos) ? patient.servicos : [];
        const hasCleaning = services.some((service) => {
          const text = String(service?.nome || service?.procedimento || service?.descricao || '').toLowerCase();
          return text.includes('limpeza') || text.includes('profilaxia');
        });
        return !hasCleaning;
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'birthday_month') {
      const month = Math.max(1, Math.min(12, Number(filters?.month) || (new Date().getMonth() + 1)));
      const patientIds = getAllActiveKeys().filter((id) => {
        const patient = patientMap.get(id);
        const birth = normalizeDateOnly(patient?.dataNascimento || patient?.birthDate);
        if (!birth) return false;
        const birthMonth = Number(birth.split('-')[1] || 0);
        return birthMonth === month;
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'plan_overdue') {
      const plans = await readPlans();
      const today = normalizeDateOnly(new Date());
      const overdueKeys = new Set();
      plans.forEach((plan) => {
        if (normalizeClinicId(plan?.clinicId) !== clinicId) return;
        if (plan?.deletedAt) return;
        const status = String(plan?.statusAtual || '').trim().toUpperCase();
        if (status === 'CANCELADO') return;
        const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
        const hasOverdue = schedule.some((parcel) => {
          const parcelStatus = String(parcel?.status || '').trim().toUpperCase();
          const dueDate = normalizeDateOnly(parcel?.dueDate);
          return parcelStatus === 'PENDING' && dueDate && dueDate < today;
        });
        if (!hasOverdue) return;
        const key = String(plan?.patientId || plan?.prontuario || '').trim();
        if (key) overdueKeys.add(key);
      });
      const patientIds = Array.from(overdueKeys).filter((id) => {
        const patient = patientMap.get(id);
        return patient?.allowsMessages !== false;
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    return { segmentKey: normalizedKey, unavailable: true, reason: 'Segmento indisponivel.', total: 0, patientIds: [] };
  };

  const getCampaignResult = async ({ campaignId, windowDays = 7 } = {}) => {
    const clinicId = getCurrentClinicId();
    const campaignKey = String(campaignId || '').trim();
    if (!campaignKey) throw new Error('campaignId obrigatorio.');

    const [state, appointments, financeRows] = await Promise.all([
      readCampaignBatchesPayload(),
      readAgendaAppointments({ clinicId }),
      readFinanceRows(),
    ]);
    const safeWindowDays = Math.max(1, Number(windowDays) || 7);
    const batches = state.batches
      .filter((item) => normalizeClinicId(item?.clinicId) === clinicId)
      .filter((item) => String(item?.campaignId || '').trim() === campaignKey)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (!batches.length) {
      return {
        campaignId: campaignKey,
        windowDays: safeWindowDays,
        windowStart: null,
        windowEnd: null,
        recipients: 0,
        conversions7d: 0,
        revenue7d: null,
        lastDispatch: null,
        monthlyConversions7d: 0,
        monthlyRevenue7d: null,
      };
    }

    const evaluateBatch = (batch) => {
      const sendBatchId = String(batch?.sendBatchId || '').trim();
      const createdAt = new Date(batch?.createdAt || '');
      if (!sendBatchId || Number.isNaN(createdAt.getTime())) {
        return {
          conversions7d: 0,
          revenue7d: null,
          recipientsSent: 0,
          sentCount: Math.max(0, Number(batch?.sentCount) || 0),
          failedCount: Math.max(0, Number(batch?.failedCount) || 0),
          audienceCount: Math.max(0, Number(batch?.audienceCount) || 0),
          windowStart: null,
          windowEnd: null,
        };
      }
      const windowEnd = new Date(createdAt.getTime() + (safeWindowDays * 24 * 60 * 60 * 1000));
      const recipients = state.recipients.filter((item) =>
        normalizeClinicId(item?.clinicId) === clinicId
        && String(item?.sendBatchId || '').trim() === sendBatchId);
      const sentRecipients = recipients
        .filter((item) => normalizeLogStatus(item?.status) === 'SENT')
        .map((item) => String(item?.patientId || '').trim())
        .filter(Boolean);
      const sentSet = new Set(sentRecipients);
      const conversionList = [];
      appointments.forEach((appt) => {
        const createdAtIso = getAppointmentCreatedAt(appt);
        if (!createdAtIso) return;
        const createdAtAppt = new Date(createdAtIso);
        if (Number.isNaN(createdAtAppt.getTime())) return;
        if (!(createdAtAppt > createdAt && createdAtAppt <= windowEnd)) return;
        const keys = toPatientKeyCandidates(appt);
        if (!keys.some((key) => sentSet.has(key))) return;
        conversionList.push({
          appointmentId: String(appt?.id || '').trim(),
          patientId: String(appt?.prontuario || appt?.patientId || appt?.pacienteId || '').trim(),
        });
      });
      const uniqueAppointments = new Map();
      conversionList.forEach((item) => {
        const key = item.appointmentId || `${item.patientId}-${Math.random().toString(36).slice(2, 8)}`;
        if (!uniqueAppointments.has(key)) uniqueAppointments.set(key, item);
      });
      const conversionPatientSet = new Set(Array.from(uniqueAppointments.values()).map((item) => item.patientId).filter(Boolean));
      const revenueSum = financeRows
        .filter((row) => normalizeClinicId(row?.clinicId) === clinicId)
        .filter((row) => {
          const status = String(row?.paymentStatus || row?.status || '').trim().toUpperCase();
          return status === 'PAID' || status === 'PAGO';
        })
        .filter((row) => {
          const key = String(row?.patientId || row?.prontuario || '').trim();
          return key && conversionPatientSet.has(key);
        })
        .filter((row) => {
          const stamp = row?.updatedAt || row?.paidAt || row?.dataPagamento || row?.createdAt || row?.dueDate || row?.vencimento;
          const dt = stamp ? new Date(stamp) : null;
          if (!dt || Number.isNaN(dt.getTime())) return false;
          return dt > createdAt && dt <= windowEnd;
        })
        .reduce((acc, row) => acc + normalizeMoney(row?.valor ?? row?.valorTotal ?? row?.amount ?? 0), 0);
      const sentCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'SENT').length;
      const failedCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'FAILED').length;
      return {
        conversions7d: uniqueAppointments.size,
        revenue7d: revenueSum > 0 ? Math.round(revenueSum * 100) / 100 : null,
        recipientsSent: sentSet.size,
        sentCount,
        failedCount,
        audienceCount: Math.max(0, Number(batch?.audienceCount) || (sentCount + failedCount)),
        windowStart: createdAt.toISOString(),
        windowEnd: windowEnd.toISOString(),
      };
    };

    const lastBatch = batches[0];
    const lastEval = evaluateBatch(lastBatch);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthBatches = batches.filter((item) => dayKey(item?.createdAt).startsWith(monthKey));
    let monthlyConversions7d = 0;
    let monthlyRevenueRaw = 0;
    let monthlyHasRevenue = false;
    monthBatches.forEach((batch) => {
      const data = evaluateBatch(batch);
      monthlyConversions7d += data.conversions7d;
      if (data.revenue7d != null) {
        monthlyHasRevenue = true;
        monthlyRevenueRaw += Number(data.revenue7d) || 0;
      }
    });

    return {
      campaignId: campaignKey,
      windowDays: safeWindowDays,
      windowStart: lastEval.windowStart,
      windowEnd: lastEval.windowEnd,
      recipients: lastEval.recipientsSent,
      conversions7d: lastEval.conversions7d,
      revenue7d: lastEval.revenue7d,
      lastDispatch: {
        sendBatchId: String(lastBatch?.sendBatchId || '').trim(),
        createdAt: lastBatch?.createdAt || null,
        segmentKey: String(lastBatch?.segmentKey || 'all_active').trim().toLowerCase(),
        audienceCount: lastEval.audienceCount,
        sentCount: lastEval.sentCount,
        failedCount: lastEval.failedCount,
      },
      monthlyConversions7d,
      monthlyRevenue7d: monthlyHasRevenue ? Math.round(monthlyRevenueRaw * 100) / 100 : null,
    };
  };

  const createCampaign = async (payload = {}) => {
    const clinicId = getCurrentClinicId();
    const currentUser = getCurrentUser();
    const now = new Date().toISOString();
    const normalized = normalizeCampaign(payload, { origem: 'clinica', clinicId });
    const campaign = {
      ...normalized,
      id: normalized.id || generateCampaignId(),
      clinicId,
      criadoPor: normalized.criadoPor || currentUser?.id || '',
      dataCriacao: normalized.dataCriacao || now,
      dataAtualizacao: now,
    };

    const all = await readAllLocalCampaigns();
    all.unshift(campaign);
    await writeAllLocalCampaigns(all);
    return campaign;
  };

  const updateCampaign = async ({ id, changes } = {}) => {
    if (!id) throw new Error('Id obrigatorio.');
    const clinicId = getCurrentClinicId();
    const list = await readAllLocalCampaigns();
    const idx = list.findIndex((c) => c.id === id && normalizeClinicId(c.clinicId) === clinicId);
    if (idx === -1) throw new Error('Campanha nao encontrada.');

    const existing = list[idx];
    if (existing.origem === 'voithos') {
      throw new Error('Campanha global nao pode ser editada.');
    }

    const updated = normalizeCampaign({
      ...existing,
      ...(changes || {}),
      id: existing.id,
      clinicId,
      origem: existing.origem || 'clinica',
      criadoPor: existing.criadoPor,
      dataCriacao: existing.dataCriacao,
      dataAtualizacao: new Date().toISOString(),
    });
    list[idx] = updated;
    await writeAllLocalCampaigns(list);
    return updated;
  };

  const deleteCampaign = async (id) => {
    if (!id) throw new Error('Id obrigatorio.');
    const clinicId = getCurrentClinicId();
    const list = await readAllLocalCampaigns();
    const idx = list.findIndex((c) => c.id === id && normalizeClinicId(c.clinicId) === clinicId);
    if (idx === -1) throw new Error('Campanha nao encontrada.');
    if (list[idx].origem === 'voithos') {
      throw new Error('Campanha global nao pode ser removida.');
    }
    list.splice(idx, 1);
    await writeAllLocalCampaigns(list);
    return { success: true };
  };

  return {
    listCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    listGlobalCampaigns,
    saveGlobalCampaigns,
    createCampaignSendBatch,
    recordCampaignDeliveryLog,
    getCampaignsDashboard,
    listCampaignTemplates,
    listCampaignLogs,
    resolveAudience,
    getCampaignResult,
  };
};

module.exports = { createCampanhasService };




