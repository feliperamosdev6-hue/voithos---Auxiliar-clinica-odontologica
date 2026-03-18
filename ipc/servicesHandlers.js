const { SOURCE, withSource } = require('../shared/utils/hybrid-source-utils');

const registerServicesHandlers = ({
  ipcMain,
  requireRole,
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
  createOrUpdateProcedureRevenue,
  generateFinanceId,
  readFinance,
  writeFinance,
  readLaboratorio,
  writeLaboratorio,
  generateLaboratorioId,
  readPatient,
  currentUserRef,
  centralBackendAdapter,
}) => {
  const normalizePaymentMethod = (value) => {
    const raw = String(value || '').toUpperCase().trim();
    const allowed = new Set(['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER']);
    if (allowed.has(raw)) return raw;
    if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO') return 'CREDIT';
    if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO') return 'DEBIT';
    if (raw === 'DINHEIRO') return 'CASH';
    if (raw === 'TRANSFERENCIA') return 'TRANSFER';
    if (raw === 'OUTRO') return 'OTHER';
    return 'PIX';
  };
  const normalizePaymentStatus = (value) => {
    const raw = String(value || '').toUpperCase().trim();
    if (raw === 'PENDING' || raw === 'PENDENTE') return 'PENDING';
    if (raw === 'CANCELLED' || raw === 'CANCELADO') return 'CANCELLED';
    return 'PAID';
  };
  const toDateOnly = (value) => {
    if (!value) return new Date().toISOString().split('T')[0];
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return new Date().toISOString().split('T')[0];
    return dt.toISOString().split('T')[0];
  };
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const generateClinicalExternalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let centralLogged = false;
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const cleanText = (value) => String(value || '').trim();
  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[PRONTUARIO] procedures central backend active');
  };
  const logClinicalFallback = (action, error) => {
    console.warn('[PRONTUARIO] procedures fallback to local', JSON.stringify({
      action,
      clinicId: getCurrentClinicId(),
      reason: error?.message || String(error || ''),
    }));
  };
  const mergeHybridProcedures = ({ central = [], legacy = [] }) => {
    const map = new Map();
    (legacy || []).forEach((item) => {
      const key = String(item?.id || '').trim();
      if (!key) return;
      map.set(key, withSource(item, SOURCE.LEGACY));
    });
    (central || []).forEach((item) => {
      const key = String(item?.id || item?.externalId || '').trim();
      if (!key) return;
      map.set(key, withSource({
        ...(map.get(key) || {}),
        ...item,
      }, SOURCE.CENTRAL));
    });
    return Array.from(map.values());
  };
  const syncProcedureToCentral = async ({ prontuario, patient, service, stage }) => {
    if (!isCentralEnabled()) return null;
    const localPatient = patient || await readPatient(prontuario);
    const clinicId = getCurrentClinicId();
    logCentralActive();
    const procedurePayload = {
      ...(service || {}),
      id: cleanText(service?.id) || generateClinicalExternalId(),
      patientProntuario: localPatient?.prontuario || prontuario,
    };
    const result = await centralBackendAdapter.upsertPatientProcedure({
      clinicId,
      patient: {
        ...localPatient,
        clinicId,
      },
      procedure: procedurePayload,
    });
    console.info('[PRONTUARIO] procedure write central', JSON.stringify({
      stage,
      clinicId,
      patientId: localPatient?.id || localPatient?.prontuario || '',
      procedureId: procedurePayload.id,
    }));
    return result;
  };
  const normalizeProcedureState = (value) => {
    const raw = cleanText(value).toLowerCase();
    if (raw === 'realizado') return 'realizado';
    if (raw === 'a-realizar' || raw === 'a realizar') return 'a-realizar';
    if (raw === 'pre-existente' || raw === 'pre existente') return 'pre-existente';
    return raw;
  };
  const paymentMethodToFinance = (value) => {
    const upper = normalizePaymentMethod(value);
    const map = {
      PIX: 'pix',
      CREDIT: 'cartao_credito',
      DEBIT: 'cartao_debito',
      CASH: 'dinheiro',
      BOLETO: 'boleto',
      TRANSFER: 'transferencia',
      OTHER: 'outro',
    };
    return map[upper] || '';
  };
  const paymentStatusToFinance = (value) => {
    const upper = normalizePaymentStatus(value);
    if (upper === 'PENDING') return 'pendente';
    if (upper === 'CANCELLED') return 'cancelado';
    return 'pago';
  };
  const getProcedureIntegrationIds = (service = {}) => ({
    labExpenseId: cleanText(service?.integracoes?.financeiro?.despesaLaboratorioId),
    labRegistroId: cleanText(service?.integracoes?.laboratorio?.registroId),
  });
  const isProcedureReadyForCostSync = (service = {}) => {
    const status = normalizeProcedureState(service.status || service.estado || service.situacao);
    const procFinanceStatus = cleanText(service.statusFinanceiroProcedimento).toLowerCase();
    return status === 'realizado' || procFinanceStatus === 'finalizado' || !!service.dataRealizacao;
  };

  const removeProcedureLaboratorioRecords = async ({ registroId, serviceId, prontuario }) => {
    if (!readLaboratorio || !writeLaboratorio) return;
    const clinicId = getCurrentClinicId();
    const targetRegistroId = cleanText(registroId);
    const targetServiceId = cleanText(serviceId);
    const targetProntuario = cleanText(prontuario);
    if (!targetRegistroId && !targetServiceId) return;

    const list = await readLaboratorio();
    if (!Array.isArray(list) || !list.length) return;
    const filtered = list.filter((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return true;
      if (targetRegistroId && String(item?.id || '') === targetRegistroId) return false;
      if (!targetServiceId) return true;
      const itemProcedureId = cleanText(item?.procedureId || item?.servicoId);
      if (itemProcedureId !== targetServiceId) return true;
      const entryProntuario = cleanText(item?.prontuario);
      if (!targetProntuario || !entryProntuario) return false;
      return entryProntuario !== targetProntuario;
    });
    if (filtered.length !== list.length) {
      await writeLaboratorio(filtered);
    }
  };

  const upsertProcedureLaboratorioExpense = async ({ patient, service }) => {
    if (!readFinance || !writeFinance || !generateFinanceId) return '';
    const clinicId = getCurrentClinicId();
    const nowIso = new Date().toISOString();
    const userId = currentUserRef?.()?.id || '';
    const procedureId = cleanText(service?.id);
    if (!procedureId) return '';
    const { labExpenseId } = getProcedureIntegrationIds(service);
    const valor = toNumber(service?.custos?.laboratorio?.valor);
    const list = await readFinance();
    const idx = list.findIndex((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return false;
      if (labExpenseId && String(item?.id || '') === labExpenseId) return true;
      if (String(item?.tipo || '') !== 'despesa') return false;
      if (cleanText(item?.procedureId || item?.servicoId) !== procedureId) return false;
      const kind = cleanText(item?.procedureExpenseKind).toLowerCase();
      if (kind) return kind === 'laboratorio';
      return cleanText(item?.origem).toLowerCase() === 'procedimento'
        && cleanText(item?.categoria).toLowerCase() === 'laboratorio';
    });

    if (valor <= 0) {
      if (idx >= 0) {
        list.splice(idx, 1);
        await writeFinance(list);
      }
      return '';
    }

    const base = idx >= 0 ? (list[idx] || {}) : {};
    const id = cleanText(base.id) || generateFinanceId();
    const procedureName = cleanText(service?.tipo || service?.nome || service?.procedimento || 'Procedimento');
    const pacienteNome = cleanText(patient?.fullName || patient?.nome || service?.paciente || '');
    const labDescricao = cleanText(service?.custos?.laboratorio?.descricao);
    const paymentStatus = normalizePaymentStatus(base.paymentStatus || base.status || 'PENDING');
    const paymentMethod = normalizePaymentMethod(base.paymentMethod || base.metodoPagamento || '');
    const dueDate = base.dueDate || base.vencimento || null;
    const dataRef = toDateOnly(service?.dataRealizacao || service?.finishedAt || service?.updatedAt || nowIso);
    const descricao = labDescricao
      ? `[Lab] ${procedureName} - ${labDescricao}${pacienteNome ? ` - ${pacienteNome}` : ''}`
      : `[Lab] ${procedureName}${pacienteNome ? ` - ${pacienteNome}` : ''}`;

    const entry = {
      ...base,
      id,
      clinicId,
      tipo: 'despesa',
      categoria: 'laboratorio',
      origem: 'procedimento',
      procedureExpenseKind: 'laboratorio',
      descricao,
      valor,
      status: paymentStatusToFinance(paymentStatus),
      paymentStatus,
      metodoPagamento: paymentMethodToFinance(paymentMethod),
      paymentMethod: paymentMethod || '',
      dueDate,
      vencimento: dueDate,
      paidAt: paymentStatus === 'PAID' ? (base.paidAt || nowIso) : null,
      installments: base.installments ?? null,
      patientId: patient?.id || patient?._id || service?.patientId || '',
      prontuario: patient?.prontuario || service?.patientProntuario || '',
      paciente: pacienteNome,
      procedureId,
      servicoId: procedureId,
      procedimento: procedureName,
      funcionario: base.funcionario || '',
      planoFinalizado: !!base.planoFinalizado,
      data: dataRef,
      createdAt: base.createdAt || nowIso,
      createdBy: base.createdBy || userId,
      updatedAt: nowIso,
      updatedBy: userId,
    };

    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    await writeFinance(list);
    return id;
  };

  const upsertProcedureLaboratorioRecord = async ({ patient, service, financeExpenseId }) => {
    if (!readLaboratorio || !writeLaboratorio || !generateLaboratorioId) return '';
    const clinicId = getCurrentClinicId();
    const nowIso = new Date().toISOString();
    const procedureId = cleanText(service?.id);
    if (!procedureId) return '';
    const { labRegistroId } = getProcedureIntegrationIds(service);
    const valor = toNumber(service?.custos?.laboratorio?.valor);
    const list = await readLaboratorio();
    const idx = list.findIndex((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return false;
      if (labRegistroId && String(item?.id || '') === labRegistroId) return true;
      return cleanText(item?.procedureId || item?.servicoId) === procedureId;
    });

    if (valor <= 0) {
      if (idx >= 0) {
        list.splice(idx, 1);
        await writeLaboratorio(list);
      }
      return '';
    }

    const base = idx >= 0 ? (list[idx] || {}) : {};
    const descricaoLab = cleanText(service?.custos?.laboratorio?.descricao);
    const procedureName = cleanText(service?.tipo || service?.nome || service?.procedimento || 'Procedimento');
    const patientName = cleanText(patient?.fullName || patient?.nome || service?.paciente || '');
    const entrada = toDateOnly(service?.dataRealizacao || service?.finishedAt || service?.updatedAt || nowIso);
    const registro = {
      ...base,
      id: cleanText(base.id) || generateLaboratorioId(),
      clinicId,
      laboratorio: descricaoLab || base.laboratorio || 'Procedimento vinculado',
      paciente: patientName || base.paciente || '',
      peca: procedureName || base.peca || '',
      entrada,
      saida: base.saida || '',
      valor,
      status: base.status || 'pendente',
      origem: 'procedimento',
      procedureId,
      servicoId: procedureId,
      patientId: patient?.id || patient?._id || service?.patientId || '',
      prontuario: patient?.prontuario || service?.patientProntuario || '',
      financeExpenseId: cleanText(financeExpenseId) || cleanText(base.financeExpenseId),
      createdAt: base.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (idx >= 0) list[idx] = registro;
    else list.push(registro);
    await writeLaboratorio(list);
    return registro.id;
  };

  const syncProcedureLabCostIntegrations = async ({ patient, service }) => {
    const procedureId = cleanText(service?.id);
    if (!procedureId) return { labExpenseId: '', labRegistroId: '' };
    const shouldSync = isProcedureReadyForCostSync(service);
    const valor = toNumber(service?.custos?.laboratorio?.valor);
    const existing = getProcedureIntegrationIds(service);

    if (!shouldSync || valor <= 0) {
      await upsertProcedureLaboratorioExpense({ patient, service: { ...service, custos: { ...(service.custos || {}), laboratorio: { ...(service?.custos?.laboratorio || {}), valor: 0 } } } });
      await upsertProcedureLaboratorioRecord({ patient, service: { ...service, custos: { ...(service.custos || {}), laboratorio: { ...(service?.custos?.laboratorio || {}), valor: 0 } } } });
      return { labExpenseId: '', labRegistroId: '', removed: Boolean(existing.labExpenseId || existing.labRegistroId) };
    }

    const labExpenseId = await upsertProcedureLaboratorioExpense({ patient, service });
    const labRegistroId = await upsertProcedureLaboratorioRecord({ patient, service, financeExpenseId: labExpenseId });
    return { labExpenseId, labRegistroId, removed: false };
  };

  const removeProcedureFinanceEntries = async ({ financeId, serviceId, prontuario }) => {
    if (!readFinance || !writeFinance) return;
    const clinicId = getCurrentClinicId();
    const targetFinanceId = String(financeId || '').trim();
    const targetServiceId = String(serviceId || '').trim();
    const targetProntuario = String(prontuario || '').trim();
    if (!targetFinanceId && !targetServiceId) return;

    const list = await readFinance();
    if (!Array.isArray(list) || !list.length) return;
    const filtered = (Array.isArray(list) ? list : []).filter((item) => {
      const sameClinic = String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId;
      if (!sameClinic) return true;

      const sameId = targetFinanceId && String(item?.id || '') === targetFinanceId;
      if (sameId) return false;

      if (!targetServiceId) return true;
      const sameProcedure = String(item?.procedureId || item?.servicoId || '') === targetServiceId;
      if (!sameProcedure) return true;
      const isProcedureEntry = String(item?.origem || '').toLowerCase() === 'procedimento'
        || String(item?.categoria || '').toLowerCase() === 'procedimentos';
      if (!isProcedureEntry) return true;

      const entryProntuario = String(item?.prontuario || '').trim();
      if (!targetProntuario || !entryProntuario) return false;
      return entryProntuario !== targetProntuario;
    });

    if (filtered.length !== list.length) {
      await writeFinance(filtered);
    }
  };

  ipcMain.handle('save-service-record', async (_event, { prontuario, record }) => {
    requireRole(['admin']);
    return addServiceRecord({ prontuario, record });
  });

  ipcMain.handle('find-service-by-code', async (_event, serviceIdOrCode) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return findServiceByCode(serviceIdOrCode);
  });

  ipcMain.handle('list-services', async () => {
    requireRole(['admin', 'recepcionista']);
    return listServicesSummary();
  });

  ipcMain.handle('add-service-to-patient', async (_event, { prontuario, service }) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const normalizedService = {
      ...(service || {}),
      id: cleanText(service?.id) || generateClinicalExternalId(),
    };
    let patient = null;

    try {
      patient = await readPatient(prontuario);
      if (isCentralEnabled()) {
        await syncProcedureToCentral({
          prontuario,
          patient,
          service: normalizedService,
          stage: 'create-pre-shadow',
        });
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('add-service-to-patient:pre', error);
    }

    const result = await addServiceToPatient({ prontuario, service: normalizedService });
    const createdService = result?.service || {};
    let financeId = createdService.financeiroId || createdService?.financeiro?.financeEntryId || '';
    let financeCreated = false;

    try {
      const valor = Number(
        createdService.valorCobrado !== undefined
          ? createdService.valorCobrado
          : (createdService.valor || createdService.value || 0)
      );
      if (valor > 0) {
        patient = patient || await readPatient(prontuario);
        const prevId = financeId || '';
        const lancamento = await createOrUpdateProcedureRevenue({
          financeEntryId: prevId,
          procedureId: createdService.id || '',
          patientId: patient.id || patient._id || '',
          prontuario: patient.prontuario || prontuario,
          patientName: patient.fullName || patient.nome || '',
          procedureName: createdService.tipo || createdService.nome || createdService.procedimento || 'Procedimento',
          descricao: `Procedimento: ${createdService.tipo || createdService.nome || createdService.procedimento || 'Procedimento'}`,
          valor,
          status: 'PENDING',
          paymentMethod: 'PIX',
          dueDate: null,
          installments: null,
          data: toDateOnly(new Date().toISOString()),
        });
        financeId = lancamento.id;
        financeCreated = !prevId;

        await updateService({
          prontuario,
          service: {
            id: createdService.id,
            financeiroId: financeId,
            financeiro: {
              ...(createdService.financeiro || {}),
              financeEntryId: financeId,
              paymentStatus: 'PENDING',
              paymentMethod: 'PIX',
              paidAt: null,
              dueDate: null,
              installments: null,
            },
          },
        });
      }
    } catch (err) {
      return { ...result, financeId, financeCreated, financeWarning: err?.message || 'Falha ao sincronizar financeiro.' };
    }

    try {
      if (isCentralEnabled()) {
        patient = patient || await readPatient(prontuario);
        await syncProcedureToCentral({
          prontuario,
          patient,
          service: {
            ...createdService,
            financeiroId: financeId || createdService.financeiroId || '',
          },
          stage: 'create-post-shadow',
        });
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('add-service-to-patient:post', error);
    }

    return { ...result, financeId, financeCreated };
  });

  ipcMain.handle('list-all-services', async () => {
    requireRole(['admin']);
    return listAllServices();
  });

  ipcMain.handle('update-service', async (_event, { prontuario, service }) => {
    requireRole(['admin', 'dentista', 'recepcionista']);
    if (!prontuario || !service?.id) {
      return updateService({ prontuario, service });
    }

    let financeId = service.financeiroId || service.financeiroLancamentoId || service?.financeiro?.financeEntryId || '';
    let financeCreated = false;
    let patient = null;

    if (service.status === 'realizado' && service.dataRealizacao) {
      patient = await readPatient(prontuario);
      const servicos = Array.isArray(patient.servicos) ? patient.servicos : [];
      const base = servicos.find((s) => String(s.id || '') === String(service.id));
      const merged = { ...(base || {}), ...(service || {}) };
      const allowFinance = merged.gerarFinanceiro !== false;
      const baseFinanceId = base?.financeiro?.financeEntryId || base?.financeiroId || base?.financeiroLancamentoId || '';
      const valor = Number(merged.valorCobrado !== undefined ? merged.valorCobrado : (merged.valor || merged.value || 0));
      if (allowFinance && valor > 0) {
        const previousId = financeId || baseFinanceId;
        const wasCreated = !previousId;
        const financeiro = merged.financeiro || {};
        const paymentStatus = normalizePaymentStatus(financeiro.paymentStatus || merged.paymentStatus || (previousId ? 'PAID' : 'PAID'));
        const paymentMethod = normalizePaymentMethod(financeiro.paymentMethod || merged.paymentMethod || merged.metodoPagamento || 'PIX');
        const dueDate = financeiro.dueDate || merged.vencimento || '';
        const paidAt = financeiro.paidAt || merged.paidAt || null;
        const lancamento = await createOrUpdateProcedureRevenue({
          financeEntryId: previousId,
          procedureId: merged.id || service.id || '',
          patientId: patient.id || patient._id || '',
          prontuario: patient.prontuario || prontuario,
          patientName: patient.fullName || patient.nome || '',
          procedureName: merged.tipo || merged.nome || merged.procedimento || 'Procedimento',
          descricao: `Procedimento: ${merged.tipo || merged.nome || merged.procedimento || 'Procedimento'}`,
          valor,
          status: paymentStatus,
          paymentMethod,
          dueDate,
          paidAt,
          installments: financeiro.installments ?? null,
          data: toDateOnly(merged.dataRealizacao || new Date().toISOString()),
        });
        financeId = lancamento.id;
        financeCreated = wasCreated;
      }
    }

    const payload = financeId
      ? {
          ...service,
          financeiroId: financeId,
          financeiro: {
            ...(service.financeiro || {}),
            financeEntryId: financeId,
            paymentStatus: normalizePaymentStatus(service?.financeiro?.paymentStatus || service.paymentStatus || 'PAID'),
            paymentMethod: normalizePaymentMethod(service?.financeiro?.paymentMethod || service.paymentMethod || service.metodoPagamento || 'PIX'),
            paidAt: normalizePaymentStatus(service?.financeiro?.paymentStatus || service.paymentStatus || 'PAID') === 'PAID'
              ? (service?.financeiro?.paidAt || new Date().toISOString())
              : null,
            dueDate: service?.financeiro?.dueDate || service.vencimento || null,
            installments: service?.financeiro?.installments ?? null,
          },
        }
      : service;
    let result = await updateService({ prontuario, service: payload });

    try {
      const savedService = result?.service || {};
      patient = patient || await readPatient(prontuario);
      const syncIds = await syncProcedureLabCostIntegrations({ patient, service: savedService });
      const currentLabExpenseId = cleanText(savedService?.integracoes?.financeiro?.despesaLaboratorioId);
      const currentLabRegistroId = cleanText(savedService?.integracoes?.laboratorio?.registroId);
      if (syncIds.labExpenseId !== currentLabExpenseId || syncIds.labRegistroId !== currentLabRegistroId) {
        const patchIntegracoes = {
          ...(savedService.integracoes || {}),
          financeiro: {
            ...(savedService?.integracoes?.financeiro || {}),
            despesaLaboratorioId: syncIds.labExpenseId || '',
          },
          laboratorio: {
            ...(savedService?.integracoes?.laboratorio || {}),
            registroId: syncIds.labRegistroId || '',
          },
        };
        result = await updateService({
          prontuario,
          service: {
            id: savedService.id,
            integracoes: patchIntegracoes,
          },
        });
      }
    } catch (err) {
      console.warn('[SERVICOS] falha ao sincronizar custo de laboratorio com financeiro/laboratorio', err);
    }

    try {
      if (isCentralEnabled()) {
        patient = patient || await readPatient(prontuario);
        await syncProcedureToCentral({
          prontuario,
          patient,
          service: result?.service || payload,
          stage: 'update-post-shadow',
        });
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('update-service', error);
    }

    return { ...result, financeCreated, financeId };
  });

  ipcMain.handle('service-mark-done', async (_event, payload) => {
    requireRole(['admin', 'dentista']);
    const prontuario = payload?.prontuario || '';
    const serviceId = payload?.serviceId || '';
    if (!prontuario || !serviceId) throw new Error('Prontuario e servico sao obrigatorios.');

    const patient = await readPatient(prontuario);
    const servicos = Array.isArray(patient.servicos) ? patient.servicos : [];
    const service = servicos.find((s) => String(s.id || '') === String(serviceId));
    if (!service) throw new Error('Servico nao encontrado.');

    const dateISO = payload?.dateISO || new Date().toISOString();
    const doneDate = new Date(dateISO);
    if (Number.isNaN(doneDate.getTime())) throw new Error('Data invalida.');

    let financeId = service.financeiroId || service.financeiroLancamentoId || service?.financeiro?.financeEntryId || '';
    let financeCreated = false;

    const allowFinance = service.gerarFinanceiro !== false;
    const valor = Number(service.valorCobrado !== undefined ? service.valorCobrado : (service.valor || service.value || 0));
    if (allowFinance && valor > 0) {
      const prevId = financeId;
      const lancamento = await createOrUpdateProcedureRevenue({
        financeEntryId: prevId,
        procedureId: service.id || '',
        patientId: patient.id || patient._id || '',
        prontuario: patient.prontuario || prontuario,
        patientName: patient.fullName || patient.nome || '',
        procedureName: service.tipo || service.nome || service.procedimento || 'Procedimento',
        descricao: `Procedimento: ${service.tipo || service.nome || service.procedimento || 'Procedimento'}`,
        valor,
        status: 'PAID',
        paymentMethod: 'PIX',
        data: toDateOnly(doneDate.toISOString()),
      });
      financeId = lancamento.id;
      financeCreated = !prevId;
    }

    const updatePayload = {
      id: serviceId,
      status: 'realizado',
      dataRealizacao: doneDate.toISOString(),
    };
    if (financeId) {
      updatePayload.financeiroId = financeId;
      updatePayload.financeiro = {
        financeEntryId: financeId,
        paymentStatus: 'PAID',
        paymentMethod: 'PIX',
        paidAt: new Date().toISOString(),
        dueDate: null,
        installments: null,
      };
    }

    let doneResult = await updateService({ prontuario, service: updatePayload });
    try {
      const savedService = doneResult?.service || {};
      const syncIds = await syncProcedureLabCostIntegrations({ patient, service: savedService });
      const currentLabExpenseId = cleanText(savedService?.integracoes?.financeiro?.despesaLaboratorioId);
      const currentLabRegistroId = cleanText(savedService?.integracoes?.laboratorio?.registroId);
      if (syncIds.labExpenseId !== currentLabExpenseId || syncIds.labRegistroId !== currentLabRegistroId) {
        doneResult = await updateService({
          prontuario,
          service: {
            id: serviceId,
            integracoes: {
              ...(savedService.integracoes || {}),
              financeiro: {
                ...(savedService?.integracoes?.financeiro || {}),
                despesaLaboratorioId: syncIds.labExpenseId || '',
              },
              laboratorio: {
                ...(savedService?.integracoes?.laboratorio || {}),
                registroId: syncIds.labRegistroId || '',
              },
            },
          },
        });
      }
    } catch (err) {
      console.warn('[SERVICOS] falha ao sincronizar laboratorio apos service-mark-done', err);
    }
    return { success: true, financeCreated, financeId, service: doneResult?.service };
  });

  ipcMain.handle('delete-service-record', async (_event, { prontuario, id }) => {
    requireRole(['admin']);
    try {
      if (isCentralEnabled()) {
        const patient = await readPatient(prontuario);
        logCentralActive();
        await centralBackendAdapter.deletePatientProcedure({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          externalId: id,
        });
        console.info('[PRONTUARIO] procedure delete central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          procedureId: id,
        }));
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('delete-service-record:central', error);
    }
    const result = await deleteServiceRecord({ prontuario, id });
    const removed = result?.removedService || {};
    await removeProcedureFinanceEntries({
      financeId: removed?.financeiroId || removed?.financeiroLancamentoId || removed?.financeiro?.financeEntryId || '',
      serviceId: removed?.id || id,
      prontuario,
    });
    await removeProcedureLaboratorioRecords({
      registroId: removed?.integracoes?.laboratorio?.registroId || '',
      serviceId: removed?.id || id,
      prontuario,
    });
    return result;
  });

  ipcMain.handle('service-add-with-appointment', async (_event, { prontuario, service }) => {
    requireRole(['admin', 'recepcionista']);
    return addServiceWithAppointment({ prontuario, service });
  });

  ipcMain.handle('delete-service', async (_event, { prontuario, serviceId }) => {
    requireRole(['admin']);
    try {
      if (isCentralEnabled()) {
        const patient = await readPatient(prontuario);
        logCentralActive();
        await centralBackendAdapter.deletePatientProcedure({
          clinicId: getCurrentClinicId(),
          patient: { ...patient, clinicId: getCurrentClinicId() },
          externalId: serviceId,
        });
        console.info('[PRONTUARIO] procedure delete central', JSON.stringify({
          clinicId: getCurrentClinicId(),
          patientId: patient?.id || patient?.prontuario || '',
          procedureId: serviceId,
        }));
      }
    } catch (error) {
      if (isCentralEnabled()) logClinicalFallback('delete-service:central', error);
    }
    const result = await deleteService({ prontuario, serviceId });
    const removed = result?.removedService || {};
    await removeProcedureFinanceEntries({
      financeId: removed?.financeiroId || removed?.financeiroLancamentoId || removed?.financeiro?.financeEntryId || '',
      serviceId: removed?.id || serviceId,
      prontuario,
    });
    await removeProcedureLaboratorioRecords({
      registroId: removed?.integracoes?.laboratorio?.registroId || '',
      serviceId: removed?.id || serviceId,
      prontuario,
    });
    return result;
  });

  ipcMain.handle('list-services-for-patient', async (_event, prontuario) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const legacy = await listServicesForPatient(prontuario);
    if (!isCentralEnabled()) return legacy;

    try {
      const patient = await readPatient(prontuario);
      logCentralActive();
      const central = await centralBackendAdapter.listPatientProcedures({
        clinicId: getCurrentClinicId(),
        patient: { ...patient, clinicId: getCurrentClinicId() },
      });
      console.info('[PRONTUARIO] procedures loaded from central', JSON.stringify({
        clinicId: getCurrentClinicId(),
        patientId: patient?.id || patient?.prontuario || '',
        centralCount: central.length,
        legacyCount: legacy.length,
      }));
      return mergeHybridProcedures({ central, legacy });
    } catch (error) {
      logClinicalFallback('list-services-for-patient', error);
      return legacy;
    }
  });

  ipcMain.handle('load-procedures', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return loadProcedures();
  });
};

module.exports = { registerServicesHandlers };
