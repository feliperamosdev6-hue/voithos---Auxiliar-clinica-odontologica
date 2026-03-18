const registerBirthdaysHandlers = ({
  ipcMain,
  requireAccess,
  listTodayBirthdays,
  sendBirthdayMessage,
  runBirthdaysDailyJob,
}) => {
  ipcMain.handle('birthdays-list-today', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    return listTodayBirthdays(payload || {});
  });

  ipcMain.handle('birthdays-send-message', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.edit'] });
    return sendBirthdayMessage(payload || {});
  });

  ipcMain.handle('birthdays-run-daily-job', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.settings'] });
    return runBirthdaysDailyJob(payload || {});
  });
};

module.exports = { registerBirthdaysHandlers };

