const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const getDefaultNotifications = () => ({
  channels: {
    email: true,
    whatsapp: false,
    sms: false,
    inapp: true,
  },
  reminderHours: 24,
  daySummary: false,
  summaryTime: '18:00',
  updatedAt: '',
});

const normalizeTime = (value, fallback) => {
  const raw = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
};

const registerNotificationsHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
  notificationsFile,
  currentUserRef,
}) => {
  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentClinicId = () => normalizeClinicId(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID);
  const scopedRoot = path.join(clinicPath, 'settings', 'notifications');
  const getScopedFile = (clinicId) => path.join(scopedRoot, `${normalizeClinicId(clinicId)}.json`);

  const ensureNotificationsFile = async (clinicId) => {
    await ensureDir(scopedRoot);
    const scopedFile = getScopedFile(clinicId);
    if (!(await pathExists(scopedFile))) {
      if (normalizeClinicId(clinicId) === DEFAULT_CLINIC_ID && (await pathExists(notificationsFile))) {
        const legacy = await readJsonFile(notificationsFile).catch(() => null);
        await writeJsonFile(scopedFile, { ...getDefaultNotifications(), ...(legacy || {}) });
      } else {
        await writeJsonFile(scopedFile, getDefaultNotifications());
      }
    }
    return scopedFile;
  };

  ipcMain.handle('notifications-get', async () => {
    requireAccess({ roles: ['admin'], perms: ['notifications.manage'] });
    const clinicId = getCurrentClinicId();
    const filePath = await ensureNotificationsFile(clinicId);
    try {
      const data = await readJsonFile(filePath);
      return { ...getDefaultNotifications(), ...(data || {}) };
    } catch (err) {
      console.warn('[NOTIFICATIONS] Falha ao ler configuracoes', err);
      return getDefaultNotifications();
    }
  });

  ipcMain.handle('notifications-save', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['notifications.manage'] });
    const clinicId = getCurrentClinicId();
    const filePath = await ensureNotificationsFile(clinicId);

    const channels = payload.channels || {};
    const record = {
      ...getDefaultNotifications(),
      channels: {
        email: !!channels.email,
        whatsapp: !!channels.whatsapp,
        sms: !!channels.sms,
        inapp: channels.inapp !== false,
      },
      reminderHours: Math.max(1, Number(payload.reminderHours) || 24),
      daySummary: !!payload.daySummary,
      summaryTime: normalizeTime(payload.summaryTime, '18:00'),
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFile(filePath, record);
    return record;
  });
};

module.exports = { registerNotificationsHandlers };
