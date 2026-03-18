const { getCentralBackendConfig } = require('../config/central-backend-config');
const { SOURCE, withSource } = require('../utils/hybrid-source-utils');

const LEGACY_TO_CENTRAL_STATUS = {
  em_aberto: 'AGENDADO',
  confirmado: 'CONFIRMADO',
  cancelado: 'CANCELADO',
  remarcar: 'REMARCAR',
};

const CENTRAL_TO_LEGACY_STATUS = {
  AGENDADO: 'em_aberto',
  CONFIRMADO: 'confirmado',
  CANCELADO: 'cancelado',
  REMARCAR: 'remarcar',
};

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const normalizeDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const normalizeTimeOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
};

const normalizeRangeBoundary = (value, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
  }
  return raw;
};

const combineDateTime = (dateValue, timeValue) => {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!date || !time) return null;
  const iso = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(iso.getTime())) return null;
  return iso.toISOString();
};

const ensureOk = async (response) => {
  if (response.ok) return response;

  let details = null;
  try {
    details = await response.json();
  } catch (_) {
    details = null;
  }

  const message = details?.error?.message || `Central backend request failed with status ${response.status}.`;
  const error = new Error(message);
  error.status = response.status;
  error.code = details?.error?.code || 'CENTRAL_BACKEND_ERROR';
  throw error;
};

const createCentralBackendAdapter = (options = {}) => {
  const config = {
    ...getCentralBackendConfig(),
    ...(options.config || {}),
  };

  let sessionToken = '';
  let tokenExpiresAt = 0;

  const isEnabled = () => config.enabled === true;

  const withTimeout = async (url, requestOptions = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      return await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const login = async () => {
    const response = await withTimeout(`${config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.technicalEmail,
        password: config.technicalPassword,
      }),
    });

    await ensureOk(response);
    const payload = await response.json();
    const token = String(payload?.data?.token || '').trim();

    if (!token) {
      throw new Error('Central backend did not return an auth token.');
    }

    sessionToken = token;
    tokenExpiresAt = Date.now() + (6 * 24 * 60 * 60 * 1000);
    return token;
  };

  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && sessionToken && tokenExpiresAt > Date.now()) return sessionToken;
    return login();
  };

  const requestJson = async (pathname, requestOptions = {}, retry = true) => {
    const token = await getToken();
    const headers = {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOptions.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    try {
      const response = await withTimeout(`${config.baseUrl}${pathname}`, {
        ...requestOptions,
        headers,
      });

      if (response.status === 401 && retry) {
        await getToken(true);
        return requestJson(pathname, requestOptions, false);
      }

      await ensureOk(response);
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Central backend request timed out.');
        timeoutError.code = 'CENTRAL_BACKEND_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  };

  const requestInternalJson = async (pathname, requestOptions = {}) => {
    const headers = {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(config.internalServiceToken ? { 'x-service-token': config.internalServiceToken } : {}),
      ...(requestOptions.headers || {}),
    };

    try {
      const response = await withTimeout(`${config.baseUrl}${pathname}`, {
        ...requestOptions,
        headers,
      });

      await ensureOk(response);
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Central backend internal request timed out.');
        timeoutError.code = 'CENTRAL_BACKEND_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  };

  const mapCentralPatientToLegacy = (patient = {}) => ({
    ...withSource({}, SOURCE.CENTRAL),
    ...patient,
    id: patient.id,
    prontuario: patient.id,
    nome: patient.nome || '',
    fullName: patient.nome || '',
    birthDate: patient.dataNascimento ? normalizeDateOnly(patient.dataNascimento) : '',
    dataNascimento: patient.dataNascimento ? normalizeDateOnly(patient.dataNascimento) : '',
    allowsMessages: true,
  });

  const normalizeLegacyPatientPayload = (payload = {}) => ({
    nome: payload.nome || payload.fullName || '',
    cpf: payload.cpf || '',
    rg: payload.rg || '',
    dataNascimento: payload.dataNascimento || payload.birthDate || null,
    telefone: payload.telefone || payload.phone || payload.celular || payload.whatsapp || '',
    email: payload.email || '',
    endereco: payload.endereco || payload.address || '',
  });

  const buildPatientMap = (patients = []) => {
    const map = new Map();
    (patients || []).forEach((patient) => {
      [
        patient?.id,
        patient?.prontuario,
        patient?.cpf,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((key) => map.set(key, patient));
    });
    return map;
  };

  const hasPatientContactDiff = (centralPatient = {}, localPatient = {}) => {
    const centralPhone = normalizeDigits(
      centralPatient?.telefone || centralPatient?.phone || centralPatient?.celular || centralPatient?.whatsapp || ''
    );
    const localPhone = normalizeDigits(
      localPatient?.telefone || localPatient?.phone || localPatient?.celular || localPatient?.whatsapp || ''
    );
    const centralEmail = String(centralPatient?.email || '').trim().toLowerCase();
    const localEmail = String(localPatient?.email || '').trim().toLowerCase();
    const centralAddress = String(centralPatient?.endereco || centralPatient?.address || '').trim().toLowerCase();
    const localAddress = String(localPatient?.endereco || localPatient?.address || '').trim().toLowerCase();

    return (!!localPhone && centralPhone !== localPhone)
      || (!!localEmail && centralEmail !== localEmail)
      || (!!localAddress && centralAddress !== localAddress);
  };

  const mapCentralAppointmentToLegacy = (appointment = {}, patientMap = new Map()) => {
    const patient = patientMap.get(String(appointment.patientId || '').trim()) || appointment.patient || {};

    return {
      ...withSource({}, SOURCE.CENTRAL),
      id: appointment.id,
      clinicId: appointment.clinicId,
      pacienteId: appointment.patientId,
      patientId: appointment.patientId,
      prontuario: appointment.patientId,
      pacienteNome: patient?.nome || '',
      paciente: patient?.nome || '',
      telefone: patient?.telefone || '',
      dentistaId: appointment.profissionalId || '',
      dentistaNome: appointment.profissionalNome || '',
      data: normalizeDateOnly(appointment.dataHora),
      horaInicio: normalizeTimeOnly(appointment.dataHora),
      horaFim: appointment.horaFim ? normalizeTimeOnly(appointment.horaFim) : normalizeTimeOnly(appointment.dataHora),
      tipo: appointment.tipo || 'procedimento',
      status: CENTRAL_TO_LEGACY_STATUS[String(appointment.status || '').toUpperCase()] || 'em_aberto',
      observacoes: appointment.observacoes || '',
      confirmado: appointment.confirmado === true,
    };
  };

  const getScopedClinicId = (input = {}) => String(
    input?.clinicId
    || input?.appointment?.clinicId
    || input?.patient?.clinicId
    || ''
  ).trim();

  const resolveExistingCentralPatient = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const scopedClinicId = String(clinicId || appointment?.clinicId || patient?.clinicId || '').trim();
    const candidateIds = [
      patient?.id,
      patient?.prontuario,
      patient?._id,
      appointment?.patientId,
      appointment?.pacienteId,
      appointment?.prontuario,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidateId of candidateIds) {
      try {
        const found = await getPatientById(candidateId, { clinicId: scopedClinicId });
        if (found) return found;
      } catch (_) {
        // Ignore lookup miss and continue.
      }
    }

    return null;
  };

  const getPatients = async (input = {}) => {
    const clinicId = getScopedClinicId(input);
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients?clinicId=${encodeURIComponent(clinicId)}`)
      : await requestJson('/patients');
    return (payload?.data || []).map(mapCentralPatientToLegacy);
  };

  const getPatientById = async (id, clinicInput = {}) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;

    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients/${encodeURIComponent(normalizedId)}?clinicId=${encodeURIComponent(clinicId)}`)
      : await requestJson(`/patients/${encodeURIComponent(normalizedId)}`);
    return mapCentralPatientToLegacy(payload?.data || {});
  };

  const searchPatients = async (query, clinicInput = {}) => {
    const patients = await getPatients(clinicInput);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    return patients.filter((patient) => {
      const haystack = [
        patient?.nome,
        patient?.fullName,
        patient?.cpf,
        patient?.telefone,
        patient?.email,
        patient?.prontuario,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  };

  const createPatient = async (patientData = {}, clinicInput = {}) => {
    const clinicId = getScopedClinicId({ ...clinicInput, ...patientData });
    const payload = clinicId
      ? await requestInternalJson('/internal/patients', {
        method: 'POST',
        body: JSON.stringify({
          clinicId,
          ...normalizeLegacyPatientPayload(patientData),
        }),
      })
      : await requestJson('/patients', {
        method: 'POST',
        body: JSON.stringify(normalizeLegacyPatientPayload(patientData)),
      });

    return mapCentralPatientToLegacy(payload?.data || {});
  };

  const updatePatient = async (id, patientData = {}, clinicInput = {}) => {
    const normalizedId = String(id || patientData?.id || patientData?.prontuario || '').trim();
    const clinicId = getScopedClinicId({ ...clinicInput, ...patientData });
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clinicId,
          ...normalizeLegacyPatientPayload(patientData),
        }),
      })
      : await requestJson(`/patients/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify(normalizeLegacyPatientPayload(patientData)),
      });

    return mapCentralPatientToLegacy(payload?.data || {});
  };

  const deletePatient = async (id, clinicInput = {}) => {
    const normalizedId = String(id || '').trim();
    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients/${encodeURIComponent(normalizedId)}?clinicId=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
      })
      : await requestJson(`/patients/${encodeURIComponent(normalizedId)}`, {
        method: 'DELETE',
      });
    return payload?.data || { success: true };
  };

  const getAppointments = async ({ clinicId, start, end, date } = {}) => {
    let from = normalizeRangeBoundary(start, false);
    let to = normalizeRangeBoundary(end, true);

    if (date && !from && !to) {
      from = combineDateTime(date, '00:00');
      to = combineDateTime(date, '23:59');
    }

    const params = new URLSearchParams();
    if (clinicId) params.set('clinicId', String(clinicId).trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    const [appointmentsPayload, patients] = await Promise.all([
      clinicId ? requestInternalJson(`/internal/appointments${suffix}`) : requestJson(`/appointments${suffix}`),
      getPatients({ clinicId }),
    ]);

    const patientMap = buildPatientMap(patients);
    return (appointmentsPayload?.data || []).map((appointment) => mapCentralAppointmentToLegacy(appointment, patientMap));
  };

  const createAppointment = async (appointmentData = {}) => {
    const patientId = String(
      appointmentData.patientId || appointmentData.pacienteId || appointmentData.prontuario || ''
    ).trim();
    const clinicId = getScopedClinicId(appointmentData);
    const requestBody = {
      patientId,
      profissionalId: appointmentData.dentistaId || '',
      profissionalNome: appointmentData.dentistaNome || '',
      dataHora: combineDateTime(appointmentData.data, appointmentData.horaInicio),
      horaFim: combineDateTime(appointmentData.data, appointmentData.horaFim),
      tipo: appointmentData.tipo || '',
      observacoes: appointmentData.observacoes || '',
    };

    const payload = clinicId
      ? await requestInternalJson('/internal/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clinicId,
          ...requestBody,
        }),
      })
      : await requestJson('/appointments', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

    const patient = await getPatientById(patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const getAppointmentById = async (id, clinicInput = {}) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;
    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(normalizedId)}?clinicId=${encodeURIComponent(clinicId)}`)
      : await requestJson(`/appointments/${encodeURIComponent(normalizedId)}`);
    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const ensureCentralPatient = async ({ patient = {}, appointment = {} } = {}) => {
    const found = await resolveExistingCentralPatient({
      clinicId: appointment?.clinicId || patient?.clinicId || '',
      patient,
      appointment,
    });

    if (found) {
      if (hasPatientContactDiff(found, patient)) {
        return updatePatient(found.id, {
          ...patient,
          id: found.id,
        }, { clinicId: appointment?.clinicId || patient?.clinicId || '' });
      }
      return found;
    }

    if (!patient || typeof patient !== 'object') {
      const error = new Error('Patient is required to sync appointment to central backend.');
      error.code = 'PATIENT_SYNC_REQUIRED';
      throw error;
    }

    return createPatient(patient, { clinicId: appointment?.clinicId || patient?.clinicId || '' });
  };

  const resolveClinicalPatientContext = async ({ clinicId, patient = {}, appointment = {}, allowCreate = false } = {}) => {
    const scopedClinicId = String(clinicId || appointment?.clinicId || patient?.clinicId || '').trim();
    if (!scopedClinicId) {
      const error = new Error('clinicId obrigatorio para prontuario no backend central.');
      error.code = 'CLINICAL_CLINIC_REQUIRED';
      throw error;
    }

    const existing = await resolveExistingCentralPatient({
      clinicId: scopedClinicId,
      patient,
      appointment,
    });

    if (existing) {
      return { clinicId: scopedClinicId, patient: existing };
    }

    if (!allowCreate) {
      const error = new Error('Patient not found for this clinic.');
      error.code = 'PATIENT_NOT_FOUND';
      throw error;
    }

    const created = await ensureCentralPatient({
      patient: { ...patient, clinicId: scopedClinicId },
      appointment: { ...appointment, clinicId: scopedClinicId },
    });
    return { clinicId: scopedClinicId, patient: created };
  };

  const ensureAppointmentTransportId = async ({ clinicId, appointment = {}, patient = {} } = {}) => {
    try {
      return await resolveAppointmentTransportId({ clinicId, appointment, patient });
    } catch (error) {
      if (error?.code !== 'APPOINTMENT_NOT_FOUND') throw error;
    }

    const centralPatient = await ensureCentralPatient({ patient, appointment });
    const syncedAppointment = {
      ...appointment,
      patientId: centralPatient.id,
    };

    try {
      return await resolveAppointmentTransportId({
        clinicId,
        appointment: syncedAppointment,
        patient: {
          ...patient,
          id: centralPatient.id,
          prontuario: centralPatient.id,
        },
      });
    } catch (error) {
      if (error?.code !== 'APPOINTMENT_NOT_FOUND') throw error;
    }

    const created = await createAppointment({
      ...syncedAppointment,
      patientId: centralPatient.id,
      pacienteId: centralPatient.id,
    });
    return String(created?.id || '').trim();
  };

  const sendAppointmentReminder = async (input) => {
    const normalizedId = String(typeof input === 'object' ? input?.id : input || '').trim();
    const clinicId = String(typeof input === 'object' ? input?.clinicId : '').trim();
    let resolvedId = normalizedId;
    if (clinicId && typeof input === 'object') {
      resolvedId = await ensureAppointmentTransportId({
        clinicId,
        appointment: input?.appointment || input,
        patient: input?.patient || {},
      });
    }
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(resolvedId)}/send-reminder`, {
        method: 'POST',
        body: JSON.stringify({ clinicId }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(resolvedId)}/send-reminder`, {
        method: 'POST',
      });
    return payload?.data || null;
  };

  const sendAppointmentConfirmation = async (input) => {
    const normalizedId = String(typeof input === 'object' ? input?.id : input || '').trim();
    const clinicId = String(typeof input === 'object' ? input?.clinicId : '').trim();
    let resolvedId = normalizedId;
    if (clinicId && typeof input === 'object') {
      resolvedId = await ensureAppointmentTransportId({
        clinicId,
        appointment: input?.appointment || input,
        patient: input?.patient || {},
      });
    }
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(resolvedId)}/send-confirmation`, {
        method: 'POST',
        body: JSON.stringify({ clinicId }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(resolvedId)}/send-confirmation`, {
        method: 'POST',
      });
    return payload?.data || null;
  };

  const resolveAppointmentTransportId = async ({ clinicId, appointment = {}, patient = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new Error('clinicId obrigatorio para resolver appointment no backend central.');
    }

    const payload = await requestInternalJson('/internal/appointments/resolve', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        appointment,
        patient,
      }),
    });

    const resolvedId = String(payload?.data?.id || '').trim();
    if (!resolvedId) {
      const error = new Error('Appointment not found for this clinic.');
      error.code = 'APPOINTMENT_NOT_FOUND';
      throw error;
    }

    return resolvedId;
  };

  const supportsAppointmentStatus = (legacyStatus) =>
    Object.prototype.hasOwnProperty.call(
      LEGACY_TO_CENTRAL_STATUS,
      String(legacyStatus || '').trim().toLowerCase()
    );

  const updateAppointmentStatus = async (id, legacyStatus, clinicInput = {}) => {
    const statusKey = String(legacyStatus || '').trim().toLowerCase();
    const centralStatus = LEGACY_TO_CENTRAL_STATUS[statusKey];

    if (!centralStatus) {
      const error = new Error('Appointment status is not supported by central backend.');
      error.code = 'CENTRAL_STATUS_UNSUPPORTED';
      throw error;
    }

    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ clinicId, status: centralStatus }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: centralStatus }),
      });

    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const updateAppointment = async (id, appointmentData = {}) => {
    const normalizedId = String(id || appointmentData?.id || '').trim();
    const patientId = String(
      appointmentData.patientId || appointmentData.pacienteId || appointmentData.prontuario || ''
    ).trim();
    const legacyStatus = String(appointmentData.status || 'em_aberto').trim().toLowerCase();
    const clinicId = getScopedClinicId(appointmentData);
    const requestBody = {
      patientId,
      profissionalId: appointmentData.dentistaId || '',
      profissionalNome: appointmentData.dentistaNome || '',
      dataHora: combineDateTime(appointmentData.data, appointmentData.horaInicio),
      horaFim: combineDateTime(appointmentData.data, appointmentData.horaFim),
      tipo: appointmentData.tipo || '',
      observacoes: appointmentData.observacoes || '',
      status: LEGACY_TO_CENTRAL_STATUS[legacyStatus] || 'AGENDADO',
    };
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ clinicId, ...requestBody }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const deleteAppointment = async (input) => {
    const normalizedId = String(typeof input === 'object' ? input?.id : input || '').trim();
    const clinicId = getScopedClinicId(typeof input === 'object' ? input : {});
    let resolvedId = normalizedId;
    if (clinicId && typeof input === 'object' && input?.appointment) {
      try {
        resolvedId = await resolveAppointmentTransportId({
          clinicId,
          appointment: input.appointment,
          patient: input.patient || {},
        });
      } catch (error) {
        if (error?.code !== 'APPOINTMENT_NOT_FOUND') throw error;
      }
    }
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(resolvedId)}?clinicId=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
      })
      : await requestJson(`/appointments/${encodeURIComponent(resolvedId)}`, {
        method: 'DELETE',
      });
    return payload?.data || { success: true };
  };

  const getPatientClinicalRecord = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/clinical-record?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || null;
  };

  const listPatientProcedures = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/procedures?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || [];
  };

  const upsertPatientProcedure = async ({ clinicId, patient = {}, appointment = {}, procedure = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/procedures`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          procedure,
        }),
      }
    );
    return payload?.data || null;
  };

  const deletePatientProcedure = async ({ clinicId, patient = {}, appointment = {}, externalId } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const normalizedExternalId = String(externalId || '').trim();
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/procedures/${encodeURIComponent(normalizedExternalId)}?clinicId=${encodeURIComponent(context.clinicId)}`,
      { method: 'DELETE' }
    );
    return payload?.data || { success: true };
  };

  const listPatientDocuments = async ({ clinicId, patient = {}, appointment = {}, includeArchived = false } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/documents?clinicId=${encodeURIComponent(context.clinicId)}&includeArchived=${includeArchived ? 'true' : 'false'}`
    );
    return payload?.data || [];
  };

  const upsertPatientDocumentMetadata = async ({ clinicId, patient = {}, appointment = {}, document = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/documents`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const listPatientAnamneses = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/anamneses?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || [];
  };

  const createPatientAnamnesis = async ({ clinicId, patient = {}, appointment = {}, data = {}, document = null } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/anamneses`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          data,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const createPatientClinicalNote = async ({ clinicId, patient = {}, appointment = {}, noteType = 'EVOLUCAO', content = {}, document = null } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/clinical-notes`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          noteType,
          content,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const updatePatientClinicalNote = async ({ clinicId, patient = {}, appointment = {}, sourceDocumentId, content = {}, document = null } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const normalizedSourceDocumentId = String(sourceDocumentId || '').trim();
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/clinical-notes/${encodeURIComponent(normalizedSourceDocumentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          clinicId: context.clinicId,
          content,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  return {
    config,
    isEnabled,
    login,
    getPatients,
    getPatientById,
    searchPatients,
    createPatient,
    updatePatient,
    deletePatient,
    getAppointments,
    createAppointment,
    getAppointmentById,
    ensureCentralPatient,
    ensureAppointmentTransportId,
    resolveAppointmentTransportId,
    sendAppointmentConfirmation,
    sendAppointmentReminder,
    updateAppointmentStatus,
    updateAppointment,
    deleteAppointment,
    getPatientClinicalRecord,
    listPatientProcedures,
    upsertPatientProcedure,
    deletePatientProcedure,
    listPatientDocuments,
    upsertPatientDocumentMetadata,
    listPatientAnamneses,
    createPatientAnamnesis,
    createPatientClinicalNote,
    updatePatientClinicalNote,
    supportsAppointmentStatus,
  };
};

module.exports = { createCentralBackendAdapter };
