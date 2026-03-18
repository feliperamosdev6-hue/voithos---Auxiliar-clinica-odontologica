const registerCampanhasHandlers = ({
  ipcMain,
  requireRole,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listGlobalCampaigns,
  saveGlobalCampaigns,
  createCampaignSendBatch,
  recordCampaignDeliveryLog,
  getCampaignsDashboard,
  listCampaignTemplates,
  listCampaignLogs,
  resolveAudience,
  getCampaignResult,
}) => {
  ipcMain.handle('campanhas-list', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return listCampaigns();
  });

  ipcMain.handle('campanhas-create', async (_event, payload) => {
    requireRole(['admin', 'recepcionista']);
    return createCampaign(payload || {});
  });

  ipcMain.handle('campanhas-update', async (_event, payload) => {
    requireRole(['admin', 'recepcionista']);
    return updateCampaign(payload || {});
  });

  ipcMain.handle('campanhas-delete', async (_event, id) => {
    requireRole(['admin', 'recepcionista']);
    return deleteCampaign(id);
  });

  ipcMain.handle('campanhas-global-list', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return listGlobalCampaigns();
  });

  ipcMain.handle('campanhas-global-save', async (_event, payload) => {
    requireRole(['admin', 'recepcionista']);
    return saveGlobalCampaigns(payload || []);
  });

  ipcMain.handle('campanhas-dashboard', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return getCampaignsDashboard();
  });

  ipcMain.handle('campanhas-templates', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return listCampaignTemplates();
  });

  ipcMain.handle('campanhas-log-delivery', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista']);
    return recordCampaignDeliveryLog(payload || {});
  });

  ipcMain.handle('campanhas-send-batch-create', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista']);
    return createCampaignSendBatch(payload || {});
  });

  ipcMain.handle('campanhas-logs-list', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return listCampaignLogs(payload || {});
  });

  ipcMain.handle('campanhas-resolve-audience', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return resolveAudience(payload || {});
  });

  ipcMain.handle('campanhas-result', async (_event, payload = {}) => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    return getCampaignResult(payload || {});
  });
};

module.exports = { registerCampanhasHandlers };
