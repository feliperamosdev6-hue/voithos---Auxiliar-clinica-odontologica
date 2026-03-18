const path = require('path');
const {
  CENTRAL_SOURCE_POLICY,
  SOURCE,
  mergePatients,
  withSource,
} = require('../shared/utils/hybrid-source-utils');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const registerPatientsHandlers = ({
  ipcMain,
  BrowserWindow,
  requireRole,
  listPatients,
  searchPatients,
  deletePatient,
  savePatient,
  updateDentist,
  readPatient,
  findPatient,
  centralBackendAdapter,
  patientsPath,
  pathExists,
  ensureDir,
  fsPromises,
  readJsonFile,
  currentUserRef,
}) => {
  const allowedSelfieExt = new Set(['.png', '.jpg', '.jpeg', '.svg', '.pdf']);
  let centralLogged = false;
  const getCurrentClinicId = () => String(
    (typeof currentUserRef === 'function' ? currentUserRef()?.clinicId : '')
    || DEFAULT_CLINIC_ID
  ).trim() || DEFAULT_CLINIC_ID;

  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;

  const logCentralActive = () => {
    if (centralLogged) return;
    centralLogged = true;
    console.info('[PATIENTS] central backend active');
  };

  const logFallback = (reason) => {
    console.warn('[PATIENTS] fallback to legacy', reason ? `(${reason})` : '');
  };

  const logCentralUnavailable = (error) => {
    console.warn('[PATIENTS] central backend unavailable', error?.message || error);
  };

  const markLegacyPatients = (items = []) => items.map((patient) => withSource(patient, SOURCE.LEGACY));

  const mergeHybridPatients = ({ central = [], legacy = [] }) => {
    const merged = mergePatients({
      central,
      legacy: markLegacyPatients(legacy),
    });
    console.info('[PATIENTS] merge with deduplication', JSON.stringify({
      strategy: 'central-first:id>cpf>name+phone',
      centralCount: central.length,
      legacyCount: legacy.length,
      mergedCount: merged.length,
    }));
    return merged;
  };

  const resolveSelfieExt = (fileName = '', mimeType = '') => {
    const fromName = path.extname(String(fileName || '')).toLowerCase();
    if (allowedSelfieExt.has(fromName)) return fromName;

    const mime = String(mimeType || '').toLowerCase().trim();
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
    if (mime === 'image/svg+xml') return '.svg';
    if (mime === 'application/pdf') return '.pdf';
    return '';
  };

  ipcMain.handle('list-patients', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const legacyPatients = await listPatients();
    if (!isCentralEnabled()) return legacyPatients;

    try {
      logCentralActive();
      const currentClinicId = getCurrentClinicId();
      const centralPatients = await centralBackendAdapter.getPatients({ clinicId: currentClinicId });
      console.info('[PATIENTS] read from central', JSON.stringify({
        count: centralPatients.length,
        clinicId: currentClinicId,
        preferred: CENTRAL_SOURCE_POLICY.preferredWhenAvailable,
      }));
      return mergeHybridPatients({ central: centralPatients, legacy: legacyPatients });
    } catch (error) {
      logCentralUnavailable(error);
      logFallback('list-patients');
      return markLegacyPatients(legacyPatients);
    }
  });

  ipcMain.handle('search-patients', async (_event, query) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const legacyResults = await searchPatients(query);
    if (!isCentralEnabled()) return legacyResults;

    try {
      logCentralActive();
      const centralResults = await centralBackendAdapter.searchPatients(query, { clinicId: getCurrentClinicId() });
      console.info('[PATIENTS] read from central', JSON.stringify({
        count: centralResults.length,
        preferred: CENTRAL_SOURCE_POLICY.preferredWhenAvailable,
        mode: 'search',
      }));
      return mergeHybridPatients({ central: centralResults, legacy: legacyResults });
    } catch (error) {
      logCentralUnavailable(error);
      logFallback('search-patients');
      return markLegacyPatients(legacyResults);
    }
  });

  ipcMain.handle('delete-patient', async (_event, prontuario) => {
    requireRole(['admin']);
    if (!isCentralEnabled()) return deletePatient(prontuario);

    try {
      logCentralActive();
      const result = await centralBackendAdapter.deletePatient(prontuario, { clinicId: getCurrentClinicId() });
      try {
        await deletePatient(prontuario);
      } catch (shadowError) {
        console.warn('[PATIENTS] shadow delete local failed', shadowError?.message || shadowError);
      }
      return result;
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[PATIENTS] fallback to legacy delete', error?.message || error);
      return deletePatient(prontuario);
    }
  });

  ipcMain.handle('open-patient-file-window', async (_event, prontuario) => {
    requireRole(['admin', 'recepcionista']);
    if (!prontuario) throw new Error('Prontuario e obrigatorio.');
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(filePath))) throw new Error('Paciente nao encontrado.');
    const patient = await readJsonFile(filePath);

    const win = new BrowserWindow({
      width: 1000,
      height: 800,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
    });

    await win.loadFile('prontuario.html');
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('load-patient-data', patient);
    });
  });

  ipcMain.handle('save-patient', async (_event, patientData) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const patientId = String(patientData?.prontuario || patientData?.id || '').trim();
    const isUpdate = patientId !== '';

    if (!isCentralEnabled()) {
      return savePatient(patientData);
    }

    try {
      logCentralActive();
      const centralPatient = isUpdate
        ? await centralBackendAdapter.updatePatient(patientId, patientData, { clinicId: getCurrentClinicId() })
        : await centralBackendAdapter.createPatient(patientData, { clinicId: getCurrentClinicId() });

      try {
        await savePatient({
          ...patientData,
          id: centralPatient.id,
          prontuario: centralPatient.prontuario || centralPatient.id,
          nome: centralPatient.nome || patientData?.nome || patientData?.fullName || '',
          fullName: centralPatient.fullName || centralPatient.nome || patientData?.fullName || patientData?.nome || '',
          clinicId: getCurrentClinicId(),
        });
      } catch (shadowError) {
        console.warn('[PATIENTS] shadow write local failed', shadowError?.message || shadowError);
      }

      return {
        success: true,
        patient: withSource(centralPatient, SOURCE.CENTRAL),
      };
    } catch (error) {
      logCentralUnavailable(error);
      console.warn('[PATIENTS] central write failed and fell back to legacy', error?.message || error);
      logFallback('save-patient');
      return savePatient(patientData);
    }
  });

  ipcMain.handle('patient-update-dentist', async (_event, { prontuario, novoDentistaId }) => {
    requireRole(['admin', 'recepcionista']);
    return updateDentist({ prontuario, novoDentistaId });
  });

  ipcMain.handle('read-patient', async (_event, prontuario) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    if (isCentralEnabled()) {
      try {
        logCentralActive();
        const patient = await centralBackendAdapter.getPatientById(prontuario, { clinicId: getCurrentClinicId() });
        if (patient) return patient;
      } catch (error) {
        logCentralUnavailable(error);
        logFallback('read-patient');
      }
    }

    try {
      return await readPatient(prontuario);
    } catch (legacyError) {
      throw legacyError;
    }
  });

  ipcMain.handle('find-patient', async (_event, query) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    try {
      return await findPatient(query);
    } catch (legacyError) {
      if (!isCentralEnabled()) throw legacyError;

      try {
        logCentralActive();
        const searchBase = typeof query === 'string'
          ? query
          : query?.prontuario || query?.fullName || query?.nome || '';
        const results = await centralBackendAdapter.searchPatients(searchBase, { clinicId: getCurrentClinicId() });
        return results[0] || null;
      } catch (error) {
        logCentralUnavailable(error);
      }

      throw legacyError;
    }
  });

  ipcMain.handle('patient-upload-selfie', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);

    const prontuario = String(payload.prontuario || '').trim();
    const filePath = String(payload.filePath || '').trim();
    const fileName = String(payload.fileName || '').trim();
    const mimeType = String(payload.mimeType || '').trim();

    if (!prontuario) throw new Error('Prontuario obrigatorio para selfie.');
    if (!filePath) throw new Error('Arquivo da selfie obrigatorio.');
    if (!(await pathExists(filePath))) throw new Error('Arquivo de selfie nao encontrado.');

    await readPatient(prontuario);

    const ext = resolveSelfieExt(fileName, mimeType);
    if (!ext) {
      throw new Error('Formato de selfie nao suportado. Use PNG, JPG, JPEG, SVG ou PDF.');
    }

    const patientDir = path.join(patientsPath, prontuario);
    await ensureDir(patientDir);

    const targetName = `selfie${ext}`;
    const targetPath = path.join(patientDir, targetName);
    await fsPromises.copyFile(filePath, targetPath);
    const stat = await fsPromises.stat(targetPath);

    const patientFile = path.join(patientsPath, `${prontuario}.json`);
    if (!(await pathExists(patientFile))) throw new Error('Paciente nao encontrado.');
    const patient = await readJsonFile(patientFile);

    const selfieRelativePath = path.join(prontuario, targetName);
    const updated = {
      ...patient,
      selfiePath: selfieRelativePath,
      selfieFileName: fileName || targetName,
      selfieMime: mimeType || '',
      selfieUpdatedAt: new Date().toISOString(),
      selfieSize: stat.size || 0,
    };

    await savePatient(updated);

    return {
      success: true,
      selfiePath: selfieRelativePath,
      selfieUrl: `file://${targetPath.replace(/\\/g, '/')}`,
      selfieMime: updated.selfieMime,
      selfieUpdatedAt: updated.selfieUpdatedAt,
      selfieSize: updated.selfieSize,
    };
  });
};

module.exports = { registerPatientsHandlers };
