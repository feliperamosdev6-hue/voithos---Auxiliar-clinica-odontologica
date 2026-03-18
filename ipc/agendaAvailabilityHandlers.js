const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const getDefaultAvailability = () => ({
  workDays: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '18:00',
  slotMinutes: 30,
  breakStart: '12:00',
  breakEnd: '13:00',
  allowOverbooking: false,
  updatedAt: '',
});

const normalizeTime = (value, fallback) => {
  const raw = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
};

const normalizeWorkDays = (days) => {
  const list = Array.isArray(days) ? days : [];
  return list
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
};

const registerAgendaAvailabilityHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
  availabilityFile,
  currentUserRef,
}) => {
  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentClinicId = () => normalizeClinicId(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID);
  const scopedRoot = path.join(clinicPath, 'settings', 'availability');
  const getScopedFile = (clinicId) => path.join(scopedRoot, `${normalizeClinicId(clinicId)}.json`);

  const ensureAvailabilityFile = async (clinicId) => {
    await ensureDir(scopedRoot);
    const scopedFile = getScopedFile(clinicId);
    if (!(await pathExists(scopedFile))) {
      if (normalizeClinicId(clinicId) === DEFAULT_CLINIC_ID && (await pathExists(availabilityFile))) {
        const legacy = await readJsonFile(availabilityFile).catch(() => null);
        await writeJsonFile(scopedFile, { ...getDefaultAvailability(), ...(legacy || {}) });
      } else {
        await writeJsonFile(scopedFile, getDefaultAvailability());
      }
    }
    return scopedFile;
  };

  ipcMain.handle('agenda-availability-get', async () => {
    requireAccess({ roles: ['admin'], perms: ['agenda.availability'] });
    const clinicId = getCurrentClinicId();
    const filePath = await ensureAvailabilityFile(clinicId);
    try {
      const data = await readJsonFile(filePath);
      return { ...getDefaultAvailability(), ...(data || {}) };
    } catch (err) {
      console.warn('[AGENDA] Falha ao ler disponibilidade', err);
      return getDefaultAvailability();
    }
  });

  ipcMain.handle('agenda-availability-save', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['agenda.availability'] });
    const clinicId = getCurrentClinicId();
    const filePath = await ensureAvailabilityFile(clinicId);

    const record = {
      ...getDefaultAvailability(),
      workDays: normalizeWorkDays(payload.workDays),
      startTime: normalizeTime(payload.startTime, '08:00'),
      endTime: normalizeTime(payload.endTime, '18:00'),
      slotMinutes: Math.max(5, Number(payload.slotMinutes) || 30),
      breakStart: normalizeTime(payload.breakStart, '12:00'),
      breakEnd: normalizeTime(payload.breakEnd, '13:00'),
      allowOverbooking: !!payload.allowOverbooking,
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFile(filePath, record);
    return record;
  });
};

module.exports = { registerAgendaAvailabilityHandlers };
