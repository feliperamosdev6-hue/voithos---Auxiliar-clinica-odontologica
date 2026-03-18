const registerFaturamentoHandlers = ({
  ipcMain,
  requireRole,
  requireAccess,
  readFaturamento,
  writeFaturamento,
  buildFaturamentoRecord,
  filterFaturamentoByPeriod,
  computeFaturamentoDashboard,
  currentUserRef,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const byClinic = (list = []) => list.filter((item) => String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId());

  ipcMain.handle('faturamento-list-dia', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    const list = byClinic(await readFaturamento());
    return filterFaturamentoByPeriod(list, 'dia');
  });

  ipcMain.handle('faturamento-list-semana', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    const list = byClinic(await readFaturamento());
    return filterFaturamentoByPeriod(list, 'semana');
  });

  ipcMain.handle('faturamento-list-mes', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    const list = byClinic(await readFaturamento());
    return filterFaturamentoByPeriod(list, 'mes');
  });

  ipcMain.handle('faturamento-add', async (_event, lanc) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    const list = await readFaturamento();
    const novo = {
      ...buildFaturamentoRecord(lanc || {}),
      clinicId: getCurrentClinicId(),
    };
    list.push(novo);
    await writeFaturamento(list);
    return novo;
  });

  ipcMain.handle('faturamento-update', async (_event, lanc) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!lanc?.id) throw new Error('ID do faturamento e obrigatorio.');
    const list = await readFaturamento();
    const idx = list.findIndex((l) => l.id === lanc.id);
    if (idx == -1) throw new Error('Faturamento nao encontrado.');
    if (String(list[idx]?.clinicId || DEFAULT_CLINIC_ID) !== getCurrentClinicId()) throw new Error('Acesso negado.');
    const atualizado = {
      ...buildFaturamentoRecord(lanc, list[idx]),
      clinicId: list[idx].clinicId || getCurrentClinicId(),
    };
    list[idx] = atualizado;
    await writeFaturamento(list);
    return atualizado;
  });

  ipcMain.handle('faturamento-delete', async (_event, id) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!id) throw new Error('ID e obrigatorio.');
    const list = await readFaturamento();
    const filtered = list.filter((l) => {
      const sameClinic = String(l?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId();
      return !(sameClinic && l.id === id);
    });
    await writeFaturamento(filtered);
    return { success: true };
  });

  ipcMain.handle('faturamento-get-dashboard', async () => {
    requireAccess({ roles: ['admin'], perms: ['finance.view'] });
    const list = byClinic(await readFaturamento());
    return computeFaturamentoDashboard(list);
  });
};

module.exports = { registerFaturamentoHandlers };
