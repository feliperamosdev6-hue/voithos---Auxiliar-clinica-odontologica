const registerLaboratorioHandlers = ({
  ipcMain,
  requireRole,
  readLaboratorio,
  writeLaboratorio,
  generateLaboratorioId,
  parseDateOnly,
  isSameMonth,
  currentUserRef,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const byClinic = (list = []) => list.filter((item) => String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId());

  ipcMain.handle('laboratorio-list', async () => {
    requireRole(['admin', 'recepcionista']);
    const list = byClinic(await readLaboratorio());
    return list.sort((a, b) => (b.entrada || '').localeCompare(a.entrada || ''));
  });

  ipcMain.handle('laboratorio-add', async (_event, item) => {
    requireRole(['admin', 'recepcionista']);
    const list = await readLaboratorio();
    const now = new Date();
    const novo = {
      id: generateLaboratorioId(),
      clinicId: getCurrentClinicId(),
      laboratorio: item?.laboratorio || '',
      paciente: item?.paciente || '',
      peca: item?.peca || '',
      entrada: item?.entrada || now.toISOString().split('T')[0],
      saida: item?.saida || '',
      valor: Number(item?.valor) || 0,
      status: item?.status || 'pendente',
      createdAt: now.toISOString(),
    };
    list.push(novo);
    await writeLaboratorio(list);
    return { success: true, registro: novo };
  });

  ipcMain.handle('laboratorio-update', async (_event, item) => {
    requireRole(['admin', 'recepcionista']);
    if (!item?.id) throw new Error('ID e obrigatorio.');
    const list = await readLaboratorio();
    const idx = list.findIndex((r) => r.id === item.id);
    if (idx === -1) throw new Error('Registro nao encontrado.');
    if (String(list[idx]?.clinicId || DEFAULT_CLINIC_ID) !== getCurrentClinicId()) throw new Error('Acesso negado.');
    list[idx] = { ...list[idx], ...item, clinicId: list[idx].clinicId || getCurrentClinicId(), valor: Number(item.valor) || 0 };
    await writeLaboratorio(list);
    return { success: true, registro: list[idx] };
  });

  ipcMain.handle('laboratorio-delete', async (_event, id) => {
    requireRole(['admin', 'recepcionista']);
    if (!id) throw new Error('ID e obrigatorio.');
    const list = await readLaboratorio();
    const filtered = list.filter((r) => {
      const sameClinic = String(r?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId();
      return !(sameClinic && r.id === id);
    });
    await writeLaboratorio(filtered);
    return { success: true };
  });

  ipcMain.handle('laboratorio-get-dashboard', async () => {
    requireRole(['admin', 'recepcionista']);
    const list = byClinic(await readLaboratorio());
    const hoje = new Date();
    let totalMes = 0;
    let pendentes = 0;

    list.forEach((r) => {
      const d = parseDateOnly(r.entrada);
      const valor = Number(r.valor) || 0;
      if (d && isSameMonth(d, hoje)) {
        totalMes += valor;
      }
      if ((r.status || 'pendente') !== 'entregue') pendentes += 1;
    });

    const entregues = list.filter((r) => r.status === 'entregue').length;

    return { totalMes, pendentes, entregues };
  });
};

module.exports = { registerLaboratorioHandlers };
