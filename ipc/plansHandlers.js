const registerPlansHandlers = ({
  ipcMain,
  requireRole,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanById,
  getPlansDashboard,
}) => {
  ipcMain.handle('plans-list', async (_event, payload) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return listPlans({ filters: payload || {} });
  });

  ipcMain.handle('plans-create', async (_event, payload) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return createPlan({ payload: payload || {} });
  });

  ipcMain.handle('plans-update', async (_event, payload) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const planId = payload?.planId;
    const patch = payload?.patch || payload || {};
    return updatePlan({ planId, patch });
  });

  ipcMain.handle('plans-delete', async (_event, payload) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const planId = typeof payload === 'string' ? payload : payload?.planId;
    return deletePlan({ planId });
  });

  ipcMain.handle('plans-get-by-id', async (_event, payload) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const planId = typeof payload === 'string' ? payload : payload?.planId;
    return getPlanById({ planId });
  });

  ipcMain.handle('plans-dashboard', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return getPlansDashboard({});
  });
};

module.exports = { registerPlansHandlers };
