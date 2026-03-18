const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';
const DEFAULT_TIMER = {
  startedAt: null,
  isRunning: false,
  accumulatedSeconds: 0,
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sanitizeText = (value) => String(value || '').trim();

const normalizeMaterial = (item = {}) => {
  const quantidade = toNumber(item.quantidade);
  const custoUnitario = toNumber(item.custoUnitario);
  const custoTotal = toNumber(item.custoTotal) || (quantidade * custoUnitario);
  return {
    // TODO(estoque-fase2): mapear material -> itemEstoqueId e custoUnitario via estoque.
    itemEstoqueId: sanitizeText(item.itemEstoqueId),
    nome: sanitizeText(item.nome),
    categoria: sanitizeText(item.categoria) || 'Outros',
    unidade: sanitizeText(item.unidade),
    quantidade,
    custoUnitario,
    custoTotal,
  };
};

const normalizeOutrosCustos = (item = {}) => ({
  descricao: sanitizeText(item.descricao),
  valor: toNumber(item.valor),
});

const normalizeTimer = (timer = {}, existingTimer = {}) => {
  const startedAt = timer.startedAt !== undefined ? timer.startedAt : existingTimer.startedAt;
  return {
    startedAt: startedAt || null,
    isRunning: Boolean(timer.isRunning !== undefined ? timer.isRunning : existingTimer.isRunning),
    accumulatedSeconds: Math.max(0, Math.trunc(
      timer.accumulatedSeconds !== undefined
        ? toNumber(timer.accumulatedSeconds)
        : toNumber(existingTimer.accumulatedSeconds)
    )),
  };
};

const computeFinancialSnapshot = (service = {}) => {
  // TODO(estoque-fase2): aplicar baixa automática de estoque ao finalizar procedimento.
  const valorCobrado = toNumber(service.valorCobrado !== undefined ? service.valorCobrado : service.valor || service.value);
  const materiais = Array.isArray(service?.custos?.materiais) ? service.custos.materiais.map(normalizeMaterial) : [];
  const laboratorio = {
    descricao: sanitizeText(service?.custos?.laboratorio?.descricao),
    valor: toNumber(service?.custos?.laboratorio?.valor),
  };
  const outros = Array.isArray(service?.custos?.outros) ? service.custos.outros.map(normalizeOutrosCustos) : [];

  const custoMateriais = materiais.reduce((acc, item) => acc + toNumber(item.custoTotal), 0);
  const custoLaboratorio = toNumber(laboratorio.valor);
  const custoOutros = outros.reduce((acc, item) => acc + toNumber(item.valor), 0);
  const custoTotal = toNumber(service.custoTotal) || (custoMateriais + custoLaboratorio + custoOutros);
  const tempoMinutos = Math.max(0, toNumber(service.tempoMinutos));
  const lucro = toNumber(service.lucro) || (valorCobrado - custoTotal);
  const lucroPorHora = tempoMinutos > 0
    ? (lucro / (tempoMinutos / 60))
    : toNumber(service.lucroPorHora);

  return {
    valorCobrado,
    tempoMinutos,
    custos: { materiais, laboratorio, outros },
    custoTotal,
    lucro,
    lucroPorHora,
  };
};
const createServicesService = ({
  patientsPath,
  servicesPath,
  clinicPath,
  readJsonFile,
  writeJsonFile,
  pathExists,
  fsPromises,
  getCurrentUser,
  readUsers,
  loadAllPatients,
  loadAllServices,
  createAgendaFromService,
} ) => {
  const getCurrentUserSafe = () => (typeof getCurrentUser === 'function' ? (getCurrentUser() || null) : null);

  const getCurrentClinicId = () => {
    const user = getCurrentUserSafe();
    return String(user?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  };

  const ensurePatientForCurrentClinic = async (prontuario) => {
    if (!prontuario) throw new Error('Prontuario obrigatorio.');
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(filePath))) throw new Error('Paciente nao encontrado.');

    const patient = await readJsonFile(filePath);
    const currentClinicId = getCurrentClinicId();
    const patientClinicId = String(patient?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    if (patientClinicId !== currentClinicId) {
      throw new Error('Acesso negado. Paciente pertence a outra clinica.');
    }

    return { filePath, patient };
  };

  const addServiceRecord = async ({ prontuario, record }) => {
    const { filePath, patient } = await ensurePatientForCurrentClinic(prontuario);
    if (!Array.isArray(patient.servicos)) patient.servicos = [];

    const currentUser = getCurrentUserSafe();
    const nowIso = new Date().toISOString();
    const recordId = record.id || `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const merged = {
      ...record,
      id: recordId,
      clinicId: getCurrentClinicId(),
      patientId: patient.id || patient._id || patient.prontuario || prontuario,
      patientProntuario: patient.prontuario || prontuario,
      createdBy: record.createdBy || currentUser?.id || '',
      createdByNome: record.createdByNome || currentUser?.nome || '',
      updatedAt: nowIso,
      updatedBy: currentUser?.id || record.updatedBy || '',
      timer: normalizeTimer(record.timer, DEFAULT_TIMER),
    };
    const snapshot = computeFinancialSnapshot(merged);
    merged.valorCobrado = snapshot.valorCobrado;
    merged.tempoMinutos = snapshot.tempoMinutos;
    merged.custos = snapshot.custos;
    merged.custoTotal = snapshot.custoTotal;
    merged.lucro = snapshot.lucro;
    merged.lucroPorHora = snapshot.lucroPorHora;
    merged.statusFinanceiroProcedimento = sanitizeText(merged.statusFinanceiroProcedimento) || 'rascunho';
    patient.servicos.push(merged);

    await writeJsonFile(filePath, patient);
    return { success: true, record: merged };
  };

  const addServiceToPatientInternal = async (prontuario, service, options = {}) => {
    const resolved = options.patient && options.filePath
      ? { patient: options.patient, filePath: options.filePath }
      : await ensurePatientForCurrentClinic(prontuario);

    const patient = resolved.patient;
    const filePath = resolved.filePath;

    const services = patient.servicos || [];
    const serviceId = service.id || `${prontuario}-${Date.now()}`;
    const currentUser = getCurrentUserSafe();
    const nowIso = new Date().toISOString();

    const baseService = {
      id: serviceId,
      ...service,
      registeredAt: service.registeredAt || new Date().toISOString(),
      clinicId: getCurrentClinicId(),
      patientId: patient.id || patient._id || patient.prontuario || prontuario,
      patientProntuario: patient.prontuario || prontuario,
      createdBy: service.createdBy || currentUser?.id || '',
      createdByNome: service.createdByNome || currentUser?.nome || '',
      updatedAt: nowIso,
      updatedBy: currentUser?.id || service.updatedBy || '',
      timer: normalizeTimer(service.timer, DEFAULT_TIMER),
    };
    const snapshot = computeFinancialSnapshot(baseService);
    const newService = {
      ...baseService,
      valorCobrado: snapshot.valorCobrado,
      tempoMinutos: snapshot.tempoMinutos,
      custos: snapshot.custos,
      custoTotal: snapshot.custoTotal,
      lucro: snapshot.lucro,
      lucroPorHora: snapshot.lucroPorHora,
      statusFinanceiroProcedimento: sanitizeText(baseService.statusFinanceiroProcedimento) || 'rascunho',
    };

    services.push(newService);
    patient.servicos = services;

    await writeJsonFile(filePath, patient);

    if (typeof loadAllServices === 'function') {
      await loadAllServices();
    }
    return { success: true, service: newService };
  };

  const findServiceByCode = async (serviceIdOrCode) => {
    if (!serviceIdOrCode) return null;
    const idStr = String(serviceIdOrCode);
    const patients = await loadAllPatients();
    const currentUser = getCurrentUserSafe();
    const basePatients = currentUser?.tipo === 'dentista'
      ? patients.filter((p) => p.dentistaId === currentUser.id)
      : patients;
    for (const p of basePatients) {
      const list = p.servicos || [];
      const found = list.find((s) =>
        String(s.id || s.codigo || s.code || '') === idStr || String(s.codigo || '') === idStr
      );
      if (found) {
        return { ...found, prontuario: p.prontuario, paciente: p.fullName || p.nome };
      }
    }
    return null;
  };

  const listServicesSummary = async () => {
    const patients = await loadAllPatients();
    return patients.map((p) => ({
      nome: p.fullName || p.nome,
      cpf: p.cpf,
      prontuario: p.prontuario,
      quantidade: (p.servicos || []).length,
    }));
  };

  const addServiceToPatient = async ({ prontuario, service }) => {
    const { patient, filePath } = await ensurePatientForCurrentClinic(prontuario);
    const svc = { ...service };

    const assignedDentistaId = patient.dentistaId || '';
    const assignedDentistaNome = patient.dentistaNome || '';
    const currentUser = getCurrentUserSafe();

    if (!assignedDentistaId) {
      throw new Error('Paciente sem dentista atribuido. Defina um dentista principal antes de registrar servicos.');
    }

    if (currentUser?.tipo === 'dentista') {
      if (assignedDentistaId !== currentUser.id) {
        throw new Error('Paciente pertence a outro dentista. Solicite transferencia ao administrador.');
      }
      svc.dentistaId = assignedDentistaId;
      svc.dentistaNome = assignedDentistaNome || currentUser.nome;
    } else {
      if (svc.dentistaId && svc.dentistaId !== assignedDentistaId) {
        throw new Error('Dentista inconsistente para o paciente. Atualize a atribuicao primeiro.');
      }
      svc.dentistaId = assignedDentistaId;
      svc.dentistaNome = assignedDentistaNome || '';
    }

    return addServiceToPatientInternal(prontuario, svc, { patient, filePath });
  };

  const listAllServices = async () => {
    const patients = await loadAllPatients();
    const currentClinicId = getCurrentClinicId();
    const result = [];

    for (const p of patients) {
      const patientClinicId = String(p?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
      if (patientClinicId !== currentClinicId) continue;
      const servs = p.servicos || [];
      servs.forEach((s) => {
        result.push({
          ...s,
          paciente: p.fullName || p.nome,
          prontuario: p.prontuario,
        });
      });
    }
    return result;
  };

  const updateService = async ({ prontuario, service }) => {
    const { filePath, patient } = await ensurePatientForCurrentClinic(prontuario);
    if (!Array.isArray(patient.servicos)) patient.servicos = [];
    const currentUser = getCurrentUserSafe();

    if (currentUser?.tipo === 'dentista') {
      if (!patient.dentistaId || String(patient.dentistaId) !== String(currentUser.id || '')) {
        throw new Error('Paciente pertence a outro dentista. Atualizacao nao permitida.');
      }
    }

    const idx = patient.servicos.findIndex((s) => s.id === service.id);
    if (idx === -1) throw new Error('Servico nao encontrado.');

    const nowIso = new Date().toISOString();
    const previous = patient.servicos[idx] || {};
    const mergedRaw = {
      ...previous,
      ...service,
      id: previous.id,
      clinicId: previous.clinicId || getCurrentClinicId(),
      patientId: previous.patientId || patient.id || patient._id || patient.prontuario || prontuario,
      patientProntuario: previous.patientProntuario || patient.prontuario || prontuario,
      timer: normalizeTimer(service.timer, previous.timer || DEFAULT_TIMER),
      updatedAt: nowIso,
      updatedBy: currentUser?.id || service.updatedBy || previous.updatedBy || '',
    };
    const snapshot = computeFinancialSnapshot(mergedRaw);
    const merged = {
      ...mergedRaw,
      valorCobrado: snapshot.valorCobrado,
      tempoMinutos: snapshot.tempoMinutos,
      custos: snapshot.custos,
      custoTotal: snapshot.custoTotal,
      lucro: snapshot.lucro,
      lucroPorHora: snapshot.lucroPorHora,
      statusFinanceiroProcedimento: sanitizeText(mergedRaw.statusFinanceiroProcedimento || previous.statusFinanceiroProcedimento) || 'rascunho',
    };
    patient.servicos[idx] = merged;
    await writeJsonFile(filePath, patient);

    return { success: true, service: merged };
  };

  const deleteServiceRecord = async ({ prontuario, id }) => {
    const { filePath, patient } = await ensurePatientForCurrentClinic(prontuario);
    const services = Array.isArray(patient.servicos) ? patient.servicos : [];
    const targetId = String(id || '');
    const idx = services.findIndex((s) => String(s?.id || '') === targetId);
    if (idx === -1) throw new Error('Servico nao encontrado.');
    const removedService = services[idx];
    services.splice(idx, 1);
    patient.servicos = services;
    await writeJsonFile(filePath, patient);

    return { success: true, removedService };
  };

  const addServiceWithAppointment = async ({ prontuario, service }) => {
    const { patient, filePath } = await ensurePatientForCurrentClinic(prontuario);
    const result = await addServiceToPatientInternal(prontuario, service, { patient, filePath });

    const createdService = (patient.servicos || []).find((s) => s.id === result.service.id) || result.service;
    const appt = await createAgendaFromService(patient, createdService);

    return { success: true, service: createdService, appointment: appt };
  };

  const deleteService = async ({ prontuario, serviceId }) => {
    const { filePath, patient } = await ensurePatientForCurrentClinic(prontuario);
    const services = Array.isArray(patient.servicos) ? patient.servicos : [];
    const targetId = String(serviceId || '');
    const idx = services.findIndex((s) => String(s?.id || '') === targetId);
    if (idx === -1) throw new Error('Servico nao encontrado.');
    const removedService = services[idx];
    services.splice(idx, 1);
    patient.servicos = services;
    await writeJsonFile(filePath, patient);
    return { success: true, removedService };
  };

  const listServicesForPatient = async (prontuario) => {
    const { patient } = await ensurePatientForCurrentClinic(prontuario);

    const currentUser = getCurrentUserSafe();
    if (currentUser?.tipo === 'dentista') {
      if (!patient.dentistaId) {
        throw new Error('Paciente sem dentista atribuido. Solicite atribuicao ao administrador.');
      }
      if (patient.dentistaId !== currentUser.id) {
        throw new Error('Paciente pertence a outro dentista. Solicite transferencia.');
      }
    }
    return {
      nome: patient.fullName || patient.nome,
      cpf: patient.cpf,
      prontuario: patient.prontuario,
      servicos: patient.servicos || [],
    };
  };

  const loadProcedures = async () => {
    const filePath = path.join(__dirname, '..', 'Procedimentos.json');
    if (!(await pathExists(filePath))) throw new Error('Arquivo nao encontrado.');
    const data = await readJsonFile(filePath);
    const base = Array.isArray(data.servicos) ? data.servicos : [];
    const overridesPath = clinicPath ? path.join(clinicPath, 'procedimentos.json') : '';
    let overrides = [];
    if (overridesPath && (await pathExists(overridesPath))) {
      try {
        const raw = await readJsonFile(overridesPath);
        overrides = Array.isArray(raw?.procedimentos) ? raw.procedimentos : [];
      } catch (_) {
        overrides = [];
      }
    }

    const overrideMap = new Map();
    overrides.forEach((p) => {
      const codigo = String(p.codigo || p.id || '').trim();
      if (!codigo) return;
      overrideMap.set(codigo, p);
    });

    const merged = [];
    base.forEach((p) => {
      const codigo = String(p.codigo || p.id || '').trim();
      if (!codigo) return;
      const override = overrideMap.get(codigo);
      if (override && override.ativo === false) return;
      merged.push({
        ...p,
        codigo,
        nome: override?.nome || p.nome,
        preco: override?.preco ?? p.preco ?? 0,
      });
      overrideMap.delete(codigo);
    });

    overrideMap.forEach((p) => {
      if (p.ativo === false) return;
      const codigo = String(p.codigo || p.id || '').trim();
      if (!codigo) return;
      merged.push({
        codigo,
        nome: p.nome || 'Procedimento',
        preco: p.preco ?? 0,
      });
    });

    return merged;
  };

  return {
    addServiceRecord,
    findServiceByCode,
    listServicesSummary,
    addServiceToPatient,
    listAllServices,
    updateService,
    deleteServiceRecord,
    addServiceWithAppointment,
    deleteService,
    listServicesForPatient,
    loadProcedures,
  };
};

module.exports = { createServicesService };






