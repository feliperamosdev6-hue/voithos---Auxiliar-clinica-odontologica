(function () {
  const DEFAULT_BASE = localStorage.getItem('apiBase') || '';

  const getBaseUrl = () => String(window.__APP_API_BASE__ || DEFAULT_BASE || '').replace(/\/+$/, '');

  const request = async (method, path, body) => {
    const base = getBaseUrl();
    if (!base) {
      throw new Error('Base da API nao configurada. Defina localStorage.apiBase ou window.__APP_API_BASE__.');
    }

    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_e) {
      payload = text || null;
    }

    if (!response.ok) {
      const message = (payload && payload.error) || ('HTTP ' + response.status);
      throw new Error(message);
    }

    return payload;
  };

  const auth = {
    login: async ({ email, login, senha }) => {
      const userLogin = String(login || email || '').trim();
      return request('POST', '/api/auth/login', { login: userLogin, senha });
    },
    logout: async () => ({ success: true }),
    currentUser: async () => null,
    currentContext: async () => null,
    listUsers: async () => request('GET', '/api/auth/users'),
    changePassword: async () => {
      throw new Error('changePassword ainda nao implementado no backend web.');
    },
    impersonateClinic: async () => notImplemented('auth.impersonateClinic'),
    listClinics: async () => notImplemented('auth.listClinics'),
    createClinic: async () => notImplemented('auth.createClinic'),
  };

  const patients = {
    list: async () => request('GET', '/api/patients'),
    read: async (id) => request('GET', '/api/patients/' + encodeURIComponent(id)),
    search: async () => {
      throw new Error('search patients ainda nao implementado no backend web.');
    },
    find: async () => {
      throw new Error('patients.find ainda nao implementado no backend web.');
    },
    save: async (payload) => request('POST', '/api/patients', payload),
    remove: async (id) => request('DELETE', '/api/patients/' + encodeURIComponent(id)),
    uploadSelfie: async () => {
      throw new Error('uploadSelfie ainda nao implementado no backend web.');
    },
    updateDentist: async () => notImplemented('patients.updateDentist'),
  };

  const users = {
    list: async () => notImplemented('users.list'),
    create: async () => notImplemented('users.create'),
    update: async () => notImplemented('users.update'),
    delete: async () => notImplemented('users.delete'),
    resetPassword: async () => notImplemented('users.resetPassword'),
  };

  const notImplemented = async (name) => {
    throw new Error(name + ' ainda nao implementado no backend web.');
  };

  const services = {
    addToPatient: async () => notImplemented('services.addToPatient'),
    listForPatient: async () => notImplemented('services.listForPatient'),
    update: async () => notImplemented('services.update'),
    delete: async () => notImplemented('services.delete'),
    markDone: async () => notImplemented('services.markDone'),
    listAll: async () => notImplemented('services.listAll'),
  };

  const documents = {
    list: async () => notImplemented('documents.list'),
    upload: async () => notImplemented('documents.upload'),
    open: async () => notImplemented('documents.open'),
    archive: async () => notImplemented('documents.archive'),
    saveCustom: async () => notImplemented('documents.saveCustom'),
    saveEvolucao: async () => notImplemented('documents.saveEvolucao'),
    updateEvolucao: async () => notImplemented('documents.updateEvolucao'),
    generateDossie: async () => notImplemented('documents.generateDossie'),
    saveAnamnese: async () => notImplemented('documents.saveAnamnese'),
    saveReceita: async () => notImplemented('documents.saveReceita'),
    openLatestAnamnese: async () => notImplemented('documents.openLatestAnamnese'),
    openLatestReceita: async () => notImplemented('documents.openLatestReceita'),
    saveAtestado: async () => notImplemented('documents.saveAtestado'),
    saveContrato: async () => notImplemented('documents.saveContrato'),
  };

  const finance = {
    getDashboard: async () => notImplemented('finance.getDashboard'),
    list: async () => notImplemented('finance.list'),
    listByPatient: async () => notImplemented('finance.listByPatient'),
    add: async () => notImplemented('finance.add'),
    update: async () => notImplemented('finance.update'),
    confirmPayment: async () => notImplemented('finance.confirmPayment'),
    createOrUpdateProcedureRevenue: async () => notImplemented('finance.createOrUpdateProcedureRevenue'),
    remove: async () => notImplemented('finance.remove'),
  };

  const laboratorio = {
    getDashboard: async () => notImplemented('laboratorio.getDashboard'),
    list: async () => notImplemented('laboratorio.list'),
    add: async () => notImplemented('laboratorio.add'),
    update: async () => notImplemented('laboratorio.update'),
    remove: async () => notImplemented('laboratorio.remove'),
  };

  const plans = {
    list: async () => notImplemented('plans.list'),
    getById: async () => notImplemented('plans.getById'),
    create: async () => notImplemented('plans.create'),
    update: async () => notImplemented('plans.update'),
    remove: async () => notImplemented('plans.remove'),
    dashboard: async () => notImplemented('plans.dashboard'),
  };

  const campanhas = {
    list: async () => notImplemented('campanhas.list'),
    create: async () => notImplemented('campanhas.create'),
    update: async () => notImplemented('campanhas.update'),
    remove: async () => notImplemented('campanhas.remove'),
    dashboard: async () => notImplemented('campanhas.dashboard'),
    templates: async () => notImplemented('campanhas.templates'),
    createSendBatch: async () => notImplemented('campanhas.createSendBatch'),
    logDelivery: async () => notImplemented('campanhas.logDelivery'),
    logsList: async () => notImplemented('campanhas.logsList'),
    resolveAudience: async () => notImplemented('campanhas.resolveAudience'),
    result: async () => notImplemented('campanhas.result'),
  };

  const campanhasGlobal = {
    list: async () => notImplemented('campanhasGlobal.list'),
    save: async () => notImplemented('campanhasGlobal.save'),
  };

  const clinic = {
    get: async () => notImplemented('clinic.get'),
    save: async () => notImplemented('clinic.save'),
    testWhatsApp: async () => notImplemented('clinic.testWhatsApp'),
    listMessagingLogs: async () => notImplemented('clinic.listMessagingLogs'),
    queueWhatsApp: async () => notImplemented('clinic.queueWhatsApp'),
    getWhatsAppConnection: async () => notImplemented('clinic.getWhatsAppConnection'),
    refreshWhatsAppConnection: async () => notImplemented('clinic.refreshWhatsAppConnection'),
    connectWhatsApp: async () => notImplemented('clinic.connectWhatsApp'),
  };

  const whatsapp = {
    sendText: async () => notImplemented('whatsapp.sendText'),
    sendAppointmentConfirmation: async () => notImplemented('whatsapp.sendAppointmentConfirmation'),
    sendAppointmentReminder: async () => notImplemented('whatsapp.sendAppointmentReminder'),
    sendCampaign: async () => notImplemented('whatsapp.sendCampaign'),
    logsList: async () => notImplemented('whatsapp.logsList'),
  };

  const anamneseModels = {
    getActive: async () => notImplemented('anamneseModels.getActive'),
    list: async () => notImplemented('anamneseModels.list'),
    create: async () => notImplemented('anamneseModels.create'),
    update: async () => notImplemented('anamneseModels.update'),
    remove: async () => notImplemented('anamneseModels.remove'),
    setActive: async () => notImplemented('anamneseModels.setActive'),
  };

  const files = {
    readPatients: async () => notImplemented('files.readPatients'),
    readReceipts: async () => notImplemented('files.readReceipts'),
  };

  const agenda = {
    getDay: async () => notImplemented('agenda.getDay'),
    getRange: async () => notImplemented('agenda.getRange'),
    add: async () => notImplemented('agenda.add'),
    update: async () => notImplemented('agenda.update'),
    remove: async () => notImplemented('agenda.remove'),
    syncConsultas: async () => notImplemented('agenda.syncConsultas'),
  };

  const birthdays = {
    listToday: async () => notImplemented('birthdays.listToday'),
    sendBirthdayMessage: async () => notImplemented('birthdays.sendBirthdayMessage'),
  };

  const agendaSettings = {
    get: async () => notImplemented('agendaSettings.get'),
    save: async () => notImplemented('agendaSettings.save'),
  };

  const agendaAvailability = {
    get: async () => notImplemented('agendaAvailability.get'),
    save: async () => notImplemented('agendaAvailability.save'),
  };

  const notifications = {
    get: async () => notImplemented('notifications.get'),
    save: async () => notImplemented('notifications.save'),
  };

  const procedures = {
    list: async () => notImplemented('procedures.list'),
    upsert: async () => notImplemented('procedures.upsert'),
    remove: async () => notImplemented('procedures.remove'),
  };

  const documentModels = {
    list: async () => notImplemented('documentModels.list'),
    renderPreview: async () => notImplemented('documentModels.renderPreview'),
    create: async () => notImplemented('documentModels.create'),
    update: async () => notImplemented('documentModels.update'),
    remove: async () => notImplemented('documentModels.remove'),
    setActive: async () => notImplemented('documentModels.setActive'),
  };

  const loadProcedures = async () => notImplemented('loadProcedures');

  const openExternalUrl = async (url) => {
    const target = String(url || '').trim();
    if (!target) throw new Error('URL invalida.');
    window.open(target, '_blank', 'noopener,noreferrer');
    return { success: true };
  };

  const events = {
    receive: () => {
      // No IPC bridge on web mode.
      return null;
    },
  };

  window.__webAdapter = {
    mode: 'web',
    auth,
    users,
    patients,
    services,
    documents,
    finance,
    laboratorio,
    plans,
    campanhas,
    campanhasGlobal,
    clinic,
    whatsapp,
    anamneseModels,
    files,
    agenda,
    birthdays,
    agendaSettings,
    agendaAvailability,
    notifications,
    procedures,
    documentModels,
    loadProcedures,
    openExternalUrl,
    events,
  };
})();
