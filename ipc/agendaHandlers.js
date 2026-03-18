const path = require('path');
const {
  CENTRAL_SOURCE_POLICY,
  SOURCE,
  mergeAppointments,
  withSource,
} = require('../shared/utils/hybrid-source-utils');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const registerAgendaHandlers = ({
  ipcMain,
  BrowserWindow,
  requireRole,
  requireAccess,
  agendaGetRange,
  agendaGetDay,
  agendaAdd,
  agendaUpdate,
  agendaDelete,
  agendaSyncConsultas,
  sendAppointmentConfirmation,
  centralBackendAdapter,
  readPatient,
  savePatient,
  currentUserRef,
}) => {
  let centralLogged = false;
  const getCurrentClinicId = () => String(
    (typeof currentUserRef === 'function' ? currentUserRef()?.clinicId : '')
    || DEFAULT_CLINIC_ID
  ).trim() || DEFAULT_CLINIC_ID;

  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;

  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[AGENDA] central backend active');
  };

  const logFallback = (reason) => {
    console.warn('[AGENDA] fallback to legacy', reason ? `(${reason})` : '');
  };

  const logCentralUnavailable = (error) => {
    console.warn('[AGENDA] central backend unavailable', error?.message || error);
  };

  const sortAppointments = (items = []) => [...(items || [])].sort((left, right) => {
    const leftKey = `${String(left?.data || '')} ${String(left?.horaInicio || '')}`;
    const rightKey = `${String(right?.data || '')} ${String(right?.horaInicio || '')}`;
    return leftKey.localeCompare(rightKey);
  });

  const markLegacyAppointments = (items = []) => items.map((appointment) => withSource(appointment, SOURCE.LEGACY));

  const mergeHybridAppointments = ({ central = [], legacy = [] }) => {
    const merged = sortAppointments(mergeAppointments({
      central,
      legacy: markLegacyAppointments(legacy),
    }));
    console.info('[AGENDA] merge with deduplication', JSON.stringify({
      strategy: 'central-first:id>patient+date+time+professional',
      centralCount: central.length,
      legacyCount: legacy.length,
      mergedCount: merged.length,
    }));
    return merged;
  };

  const hasPatientContactDiff = (centralPatient = {}, localPatient = {}) => {
    const centralPhone = String(
      centralPatient?.telefone || centralPatient?.phone || centralPatient?.celular || ''
    ).replace(/\D/g, '');
    const localPhone = String(
      localPatient?.telefone || localPatient?.phone || localPatient?.celular || localPatient?.whatsapp || ''
    ).replace(/\D/g, '');
    const centralEmail = String(centralPatient?.email || '').trim().toLowerCase();
    const localEmail = String(localPatient?.email || '').trim().toLowerCase();
    const centralAddress = String(centralPatient?.endereco || centralPatient?.address || '').trim().toLowerCase();
    const localAddress = String(localPatient?.endereco || localPatient?.address || '').trim().toLowerCase();

    return (!!localPhone && centralPhone !== localPhone)
      || (!!localEmail && centralEmail !== localEmail)
      || (!!localAddress && centralAddress !== localAddress);
  };

  const ensureCentralPatientForAppointment = async (appointment = {}) => {
    const localPatientKey = String(
      appointment?.prontuario || appointment?.pacienteId || appointment?.patientId || ''
    ).trim();
    let localPatient = null;

    if (!localPatientKey || !isCentralEnabled()) {
      return {
        centralPatientId: String(appointment?.patientId || '').trim(),
        appointmentPayload: { ...appointment },
      };
    }

    if (typeof readPatient === 'function') {
      try {
        localPatient = await readPatient(localPatientKey);
      } catch (_) {
        localPatient = null;
      }
    }

    console.info('[AGENDA] local patient resolved', JSON.stringify({
      localPatientKey,
      clinicId: appointment?.clinicId || '',
      localPatientId: localPatient?.id || '',
      localPatientProntuario: localPatient?.prontuario || '',
      localPatientName: localPatient?.nome || localPatient?.fullName || '',
    }));

    let centralPatient = null;
    const centralCandidateIds = [
      localPatient?.id,
      localPatientKey,
      appointment?.patientId,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidateId of centralCandidateIds) {
      try {
        centralPatient = await centralBackendAdapter.getPatientById(candidateId, {
          clinicId: appointment?.clinicId || getCurrentClinicId(),
        });
      } catch (_) {
        centralPatient = null;
      }
      if (centralPatient) break;
    }

    console.info('[AGENDA] central patient lookup result', JSON.stringify({
      localPatientKey,
      candidateIds: centralCandidateIds,
      found: !!centralPatient,
      centralPatientId: centralPatient?.id || '',
    }));

    if (centralPatient && localPatient && hasPatientContactDiff(centralPatient, localPatient)) {
      centralPatient = await centralBackendAdapter.updatePatient(centralPatient.id, {
        ...localPatient,
        id: centralPatient.id,
      }, {
        clinicId: appointment?.clinicId || getCurrentClinicId(),
      });
      console.info('[AGENDA] central patient updated from local', JSON.stringify({
        localPatientKey,
        centralPatientId: centralPatient?.id || '',
      }));
    }

    if (!centralPatient) {
      if (!localPatient) {
        throw new Error('Paciente local sem vinculo central e leitura local indisponivel.');
      }

      console.info('[AGENDA] central patient sync required', JSON.stringify({
        localPatientKey,
        clinicId: appointment?.clinicId || '',
        patientName: localPatient?.nome || localPatient?.fullName || '',
      }));

      centralPatient = await centralBackendAdapter.createPatient(localPatient, {
        clinicId: appointment?.clinicId || getCurrentClinicId(),
      });
      console.info('[AGENDA] central patient created result', JSON.stringify({
        localPatientKey,
        centralPatientId: centralPatient?.id || '',
        clinicId: centralPatient?.clinicId || '',
      }));

      if (typeof savePatient === 'function') {
        try {
          await savePatient({
            ...localPatient,
            id: centralPatient.id,
            prontuario: localPatient.prontuario || localPatientKey,
          });
        } catch (shadowError) {
          console.warn('[AGENDA] shadow write local patient id failed', shadowError?.message || shadowError);
        }
      }
    }

    const centralPatientId = String(centralPatient?.id || '').trim();
    console.info('[AGENDA] central patient chosen', JSON.stringify({
      localPatientKey,
      centralPatientId,
      clinicId: appointment?.clinicId || '',
    }));
    return {
      centralPatientId,
      appointmentPayload: {
        ...appointment,
        patientId: centralPatientId || String(appointment?.patientId || '').trim(),
      },
    };
  };

  const sendWhatsappResult = async (created) => {
    let whatsapp = { attempted: false, success: false };
    if (created && typeof sendAppointmentConfirmation === 'function') {
      try {
        const patient = {
          prontuario: created?.prontuario || created?.pacienteId || created?.patientId || '',
          nome: created?.pacienteNome || created?.paciente || '',
          telefone: created?.telefone || '',
        };
        const result = await sendAppointmentConfirmation({
          appointment: created,
          patient,
        });
        whatsapp = {
          attempted: true,
          success: result?.success === true,
          error: result?.error || '',
        };
      } catch (err) {
        console.warn('[AGENDA] falha ao enviar confirmacao automatica:', err?.message || err);
        whatsapp = {
          attempted: true,
          success: false,
          error: err?.message || String(err),
        };
      }
    }

    return {
      ...created,
      __whatsapp: whatsapp,
    };
  };

  ipcMain.handle('agenda-get-range', async (_event, { start, end }) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    const legacyAppointments = await agendaGetRange({ start, end });
    if (!isCentralEnabled()) return legacyAppointments;

    try {
      logCentralActive();
      const currentClinicId = getCurrentClinicId();
      const centralAppointments = await centralBackendAdapter.getAppointments({
        clinicId: currentClinicId,
        start,
        end,
      });
      console.info('[AGENDA] read from central', JSON.stringify({
        count: centralAppointments.length,
        clinicId: currentClinicId,
        preferred: CENTRAL_SOURCE_POLICY.preferredWhenAvailable,
        mode: 'range',
      }));
      return mergeHybridAppointments({ central: centralAppointments, legacy: legacyAppointments });
    } catch (error) {
      logCentralUnavailable(error);
      logFallback('agenda-get-range');
      return markLegacyAppointments(legacyAppointments);
    }
  });

  ipcMain.handle('agenda-get-day', async (_event, payload) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    const legacyAppointments = await agendaGetDay(payload);
    if (!isCentralEnabled()) return legacyAppointments;

    try {
      logCentralActive();
      const currentClinicId = getCurrentClinicId();
      const centralAppointments = await centralBackendAdapter.getAppointments({
        clinicId: currentClinicId,
        date: payload?.date || payload,
      });
      console.info('[AGENDA] read from central', JSON.stringify({
        count: centralAppointments.length,
        clinicId: currentClinicId,
        preferred: CENTRAL_SOURCE_POLICY.preferredWhenAvailable,
        mode: 'day',
      }));
      return mergeHybridAppointments({ central: centralAppointments, legacy: legacyAppointments });
    } catch (error) {
      logCentralUnavailable(error);
      logFallback('agenda-get-day');
      return markLegacyAppointments(legacyAppointments);
    }
  });

  ipcMain.handle('agenda-add', async (_event, appt) => {
    console.info('[AGENDA] agenda-add started', JSON.stringify({
      id: appt?.id || '',
      clinicId: appt?.clinicId || '',
      prontuario: appt?.prontuario || '',
      pacienteId: appt?.pacienteId || '',
      patientId: appt?.patientId || '',
      data: appt?.data || '',
      horaInicio: appt?.horaInicio || '',
      dentistaId: appt?.dentistaId || '',
    }));
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    if (!isCentralEnabled()) {
      const created = await agendaAdd(appt);
      return sendWhatsappResult(created);
    }

    try {
      logCentralActive();
      const { appointmentPayload, centralPatientId } = await ensureCentralPatientForAppointment(appt);
      console.info('[AGENDA] central create payload resolved', JSON.stringify({
        clinicId: appointmentPayload?.clinicId || '',
        localAppointmentId: appt?.id || '',
        localPatientKey: appt?.prontuario || appt?.pacienteId || appt?.patientId || '',
        centralPatientId,
        data: appointmentPayload?.data || '',
        horaInicio: appointmentPayload?.horaInicio || '',
        dentistaId: appointmentPayload?.dentistaId || '',
      }));

      console.info('[AGENDA] central appointment create started', JSON.stringify({
        clinicId: appointmentPayload?.clinicId || '',
        patientId: appointmentPayload?.patientId || '',
        data: appointmentPayload?.data || '',
        horaInicio: appointmentPayload?.horaInicio || '',
      }));
      const created = await centralBackendAdapter.createAppointment({
        ...appointmentPayload,
        clinicId: appointmentPayload?.clinicId || getCurrentClinicId(),
      });
      console.info('[AGENDA] central appointment create result', JSON.stringify({
        source: created?.source || created?.__source || '',
        id: created?.id || '',
        clinicId: created?.clinicId || '',
        patientId: created?.patientId || created?.pacienteId || '',
        data: created?.data || '',
        horaInicio: created?.horaInicio || '',
      }));

      try {
        await agendaAdd({
          ...appointmentPayload,
          id: created?.id || appt?.id,
        });
      } catch (shadowError) {
        console.warn('[AGENDA] shadow write local failed', shadowError?.message || shadowError);
      }

      console.info('[AGENDA] final appointment source', JSON.stringify({
        source: SOURCE.CENTRAL,
        id: created?.id || '',
      }));
      return sendWhatsappResult(withSource(created, SOURCE.CENTRAL));
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[AGENDA] central create failed and fell back to legacy', JSON.stringify({
        message: error?.message || String(error),
        code: error?.code || '',
        status: error?.status || '',
        clinicId: appt?.clinicId || '',
        patientKey: appt?.prontuario || appt?.pacienteId || appt?.patientId || '',
        data: appt?.data || '',
        horaInicio: appt?.horaInicio || '',
      }));
      logFallback('agenda-add');
      const created = await agendaAdd(appt);
      console.info('[AGENDA] final appointment source', JSON.stringify({
        source: SOURCE.LEGACY,
        id: created?.id || '',
      }));
      return sendWhatsappResult(created);
    }
  });

  ipcMain.handle('agenda-update', async (_event, { id, appt }) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    const statusOnlyUpdate = appt && Object.keys(appt).length === 1 && Object.prototype.hasOwnProperty.call(appt, 'status');
    if (!isCentralEnabled()) {
      return agendaUpdate({ id, appt });
    }

    try {
      logCentralActive();
      const currentClinicId = String(appt?.clinicId || getCurrentClinicId()).trim() || getCurrentClinicId();
      const updated = statusOnlyUpdate
        ? await centralBackendAdapter.updateAppointmentStatus(id, appt?.status, { clinicId: currentClinicId })
        : await centralBackendAdapter.updateAppointment(id, {
            ...appt,
            id,
            clinicId: currentClinicId,
          });

      try {
        await agendaUpdate({ id, appt });
      } catch (shadowError) {
        console.warn('[AGENDA] shadow write local failed', shadowError?.message || shadowError);
      }
      return withSource(updated, SOURCE.CENTRAL);
    } catch (error) {
      logCentralUnavailable(error);
      logFallback('agenda-update');
      return agendaUpdate({ id, appt });
    }
  });

  ipcMain.handle('agenda-delete', async (_event, payload) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'recepcao'], perms: ['agenda.edit'] });
    const appointment = typeof payload === 'object' ? (payload?.appointment || payload) : { id: payload };
    const id = String(appointment?.id || '').trim();
    const clinicId = String(appointment?.clinicId || getCurrentClinicId()).trim() || getCurrentClinicId();
    if (!isCentralEnabled()) return agendaDelete({ id });

    try {
      logCentralActive();
      console.info('[AGENDA] delete requested', JSON.stringify({
        id,
        clinicId,
        source: appointment?.__source || appointment?.source || '',
      }));
      const result = await centralBackendAdapter.deleteAppointment({
        id,
        clinicId,
        appointment,
      });
      try {
        await agendaDelete({ id });
      } catch (shadowError) {
        console.warn('[AGENDA] shadow delete local failed', shadowError?.message || shadowError);
      }
      return result;
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[AGENDA] fallback to legacy delete', JSON.stringify({
        id,
        clinicId,
        source: appointment?.__source || appointment?.source || '',
        error: error?.message || String(error),
        code: error?.code || '',
      }));
      try {
        return await agendaDelete({ id });
      } catch (legacyError) {
        console.warn('[AGENDA] legacy delete failed', JSON.stringify({
          id,
          clinicId,
          source: appointment?.__source || appointment?.source || '',
          error: legacyError?.message || String(legacyError),
        }));
        throw legacyError;
      }
    }
  });

  ipcMain.handle('agenda-sync-consultas', async (_event, patientKey) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    return agendaSyncConsultas(patientKey);
  });

  ipcMain.handle('agenda-open-day-view', async (_event, date) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
    });

    await win.loadFile('agenda-dia.html');

    win.webContents.on('did-finish-load', () => {
      win.webContents.send('agenda-day-data', date);
    });
  });
};

module.exports = { registerAgendaHandlers };
