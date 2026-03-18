const registerFinanceHandlers = ({
  ipcMain,
  shell,
  requireRole,
  requireAccess,
  readFinance,
  writeFinance,
  readFinanceClosings,
  writeFinanceClosings,
  buildFinanceMonthlyReport,
  createOrUpdateProcedureRevenue,
  confirmPayment,
  listFinanceByPatient,
  generateFinanceId,
  parseDateOnly,
  isSameDay,
  isSameMonth,
  getWeekRange,
  generateFinanceReportPdf,
  currentUserRef,
  updateService,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const byClinic = (list = []) => list.filter((item) => String(item?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId());
  const normalizeFinanceStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'pago' || raw === 'paid') return 'pago';
    if (raw === 'pendente' || raw === 'pending') return 'pendente';
    if (raw === 'cancelado' || raw === 'cancelled') return 'cancelado';
    return raw;
  };
  const isPaid = (item) => normalizeFinanceStatus(item?.status || item?.paymentStatus) === 'pago';
  const isCancelled = (item) => normalizeFinanceStatus(item?.status || item?.paymentStatus) === 'cancelado';
  const isProcedureRevenueEntry = (item) => {
    if (!item) return false;
    const tipo = String(item?.tipo || '').toLowerCase();
    const categoria = String(item?.categoria || '').toLowerCase();
    const origem = String(item?.origem || '').toLowerCase();
    const procedureId = String(item?.procedureId || item?.servicoId || '').trim();
    return tipo === 'receita' && !!procedureId && (categoria === 'procedimentos' || origem === 'procedimento');
  };
  const getPaidDateOrEntryDate = (item) => {
    if (item?.paidAt) {
      const paidDate = new Date(item.paidAt);
      if (!Number.isNaN(paidDate.getTime())) return paidDate;
    }
    return parseDateOnly(item?.data);
  };

  ipcMain.handle('finance-list', async () => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const list = byClinic(await readFinance());
    return list.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  });

  ipcMain.handle('finance-add', async (_event, lanc) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const list = await readFinance();
    const now = new Date();
    const normalizeStatus = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'paid' || raw === 'pago') return 'pago';
      if (raw === 'pending' || raw === 'pendente') return 'pendente';
      if (raw === 'cancelled' || raw === 'cancelado') return 'cancelado';
      return raw || 'pago';
    };
    const status = normalizeStatus(lanc.status || lanc.paymentStatus);
    const paymentStatus = status === 'pago'
      ? 'PAID'
      : (status === 'pendente' ? 'PENDING' : 'CANCELLED');
    const dueDate = lanc.dueDate || lanc.vencimento || null;
    const paymentMethod = lanc.paymentMethod || '';
    const novo = {
      id: generateFinanceId(),
      clinicId: getCurrentClinicId(),
      tipo: lanc.tipo || 'despesa',
      categoria: lanc.categoria || 'outros',
      data: lanc.data || now.toISOString().split('T')[0],
      descricao: lanc.descricao || '',
      valor: Number(lanc.valor) || 0,
      funcionario: lanc.funcionario || '',
      origem: lanc.origem || null,
      status,
      paymentStatus,
      paciente: lanc.paciente || '',
      procedimento: lanc.procedimento || '',
      metodoPagamento: lanc.metodoPagamento || '',
      paymentMethod: paymentMethod || lanc.metodoPagamento || '',
      dueDate,
      vencimento: dueDate,
      paidAt: status === 'pago' ? (lanc.paidAt || now.toISOString()) : null,
      installments: lanc.installments ?? null,
      patientId: lanc.patientId || '',
      prontuario: lanc.prontuario || '',
      procedureId: lanc.procedureId || lanc.servicoId || '',
      servicoId: lanc.servicoId || lanc.procedureId || '',
      planoFinalizado: !!lanc.planoFinalizado,
      createdAt: now.toISOString(),
      createdBy: currentUserRef?.()?.id || '',
      updatedAt: now.toISOString(),
      updatedBy: currentUserRef?.()?.id || '',
    };
    list.push(novo);
    await writeFinance(list);
    return { success: true, lancamento: novo };
  });

  ipcMain.handle('finance-update', async (_event, lanc) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    if (!lanc?.id) throw new Error('ID do lancamento e obrigatorio.');
    const list = await readFinance();
    const idx = list.findIndex((l) => l.id === lanc.id);
    if (idx === -1) throw new Error('Lancamento nao encontrado.');
    if (String(list[idx]?.clinicId || DEFAULT_CLINIC_ID) !== getCurrentClinicId()) throw new Error('Acesso negado.');
    const current = list[idx] || {};
    const nextValor = lanc.valor !== undefined ? Number(lanc.valor) || 0 : Number(current.valor) || 0;
    list[idx] = {
      ...current,
      ...lanc,
      clinicId: current.clinicId || getCurrentClinicId(),
      valor: nextValor,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserRef?.()?.id || '',
    };
    await writeFinance(list);
    const lancamento = list[idx];

    if (isProcedureRevenueEntry(lancamento) && lancamento?.prontuario) {
      await updateService({
        prontuario: lancamento.prontuario,
        service: {
          id: lancamento.procedureId,
          financeiroId: lancamento.id,
          financeiro: {
            financeEntryId: lancamento.id,
            paymentStatus: lancamento.paymentStatus || '',
            paymentMethod: lancamento.paymentMethod || '',
            paidAt: lancamento.paidAt || null,
            dueDate: lancamento.dueDate || null,
            installments: lancamento.installments ?? null,
          },
        },
      });
    }

    return { success: true, lancamento };
  });

  ipcMain.handle('finance-procedure-revenue-upsert', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const lancamento = await createOrUpdateProcedureRevenue(payload);
    return { success: true, lancamento };
  });

  ipcMain.handle('finance-list-by-patient', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    return listFinanceByPatient(payload || {});
  });

  ipcMain.handle('finance-confirm-payment', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const lancamento = await confirmPayment(payload);

    if (isProcedureRevenueEntry(lancamento) && lancamento?.prontuario) {
      await updateService({
        prontuario: lancamento.prontuario,
        service: {
          id: lancamento.procedureId,
          financeiroId: lancamento.id,
          financeiro: {
            financeEntryId: lancamento.id,
            paymentStatus: 'PAID',
            paymentMethod: lancamento.paymentMethod || '',
            paidAt: lancamento.paidAt || new Date().toISOString(),
            dueDate: lancamento.dueDate || null,
            installments: lancamento.installments ?? null,
          },
        },
      });
    }
    return { success: true, lancamento };
  });

  ipcMain.handle('finance-delete', async (_event, id) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    if (!id) throw new Error('ID e obrigatorio.');
    const list = await readFinance();
    const filtered = list.filter((l) => {
      const sameClinic = String(l?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId();
      return !(sameClinic && l.id === id);
    });
    await writeFinance(filtered);
    return { success: true };
  });

  ipcMain.handle('finance-get-dashboard', async () => {
    requireAccess({ roles: ['admin', 'dentista'], perms: ['finance.view'] });
    const hoje = new Date();
    const { monday: semanaInicio, sunday: semanaFim } = getWeekRange(hoje);
    const list = byClinic(await readFinance());

    let diaReceitas = 0;
    let diaDespesas = 0;
    let semanaReceitas = 0;
    let semanaDespesas = 0;
    let mesReceitas = 0;
    let mesDespesas = 0;

    const categoriasMes = {
      laboratorio: 0,
      materiais: 0,
      funcionarios: 0,
      fixos: 0,
      outros: 0,
    };

    list.forEach((l) => {
      if (isCancelled(l)) return;
      const isReceita = l.tipo === 'receita';
      const d = isReceita ? getPaidDateOrEntryDate(l) : parseDateOnly(l.data);
      if (!d) return;
      const valor = Number(l.valor) || 0;
      if (isReceita && !isPaid(l)) return;

      if (isSameDay(d, hoje)) {
        if (isReceita) diaReceitas += valor;
        else diaDespesas += valor;
      }

      if (d >= semanaInicio && d <= semanaFim) {
        if (isReceita) semanaReceitas += valor;
        else semanaDespesas += valor;
      }

      if (isSameMonth(d, hoje)) {
        if (isReceita) mesReceitas += valor;
        else mesDespesas += valor;

        if (!isReceita) {
          const cat = (l.categoria || 'outros').toLowerCase();
          if (Object.prototype.hasOwnProperty.call(categoriasMes, cat)) {
            categoriasMes[cat] += valor;
          } else {
            categoriasMes.outros += valor;
          }
        }
      }
    });

    const saldoDia = diaReceitas - diaDespesas;
    const saldoSemana = semanaReceitas - semanaDespesas;
    const saldoMes = mesReceitas - mesDespesas;

    const despesasFuncionarios = list.filter(
      (l) =>
        !isCancelled(l) &&
        l.tipo === 'despesa' &&
        (l.categoria || '').toLowerCase() === 'funcionarios' &&
        isSameMonth(parseDateOnly(l.data), hoje)
    );

    return {
      hoje: {
        receitas: diaReceitas,
        despesas: diaDespesas,
        saldo: saldoDia,
      },
      semana: {
        receitas: semanaReceitas,
        despesas: semanaDespesas,
        saldo: saldoSemana,
      },
      mes: {
        receitas: mesReceitas,
        despesas: mesDespesas,
        saldo: saldoMes,
      },
      categoriasMes,
      despesasFuncionarios,
    };
  });

  ipcMain.handle('finance-generate-report-pdf', async (_event, payload) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    const mes = Number(payload?.mes);
    const ano = Number(payload?.ano);
    if (!mes || !ano) throw new Error('Mes e ano sao obrigatorios.');
    const { pdfPath } = await generateFinanceReportPdf(mes, ano, getCurrentClinicId());
    await shell.openPath(pdfPath);
    return { success: true, pdfPath };
  });

  ipcMain.handle('finance-close-month', async (_event, payload) => {
    requireAccess({ roles: ['admin'], perms: ['finance.edit'] });
    const mes = Number(payload?.mes);
    const ano = Number(payload?.ano);
    if (!mes || !ano) throw new Error('Mes e ano sao obrigatorios.');

    const list = byClinic(await readFinance());
    const report = buildFinanceMonthlyReport(list, mes, ano);

    const fechamentos = await readFinanceClosings();
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    const existente = fechamentos.find((f) => f.chave === chave && String(f?.clinicId || DEFAULT_CLINIC_ID) === getCurrentClinicId());
    if (existente) throw new Error('Fechamento do mes ja existe.');

    const registro = {
      id: generateFinanceId(),
      clinicId: getCurrentClinicId(),
      chave,
      mes,
      ano,
      totalEntradas: report.totalEntradas,
      totalSaidas: report.totalSaidas,
      saldo: report.saldo,
      entradas: report.entradas,
      saidas: report.saidas,
      createdAt: new Date().toISOString(),
    };

    fechamentos.push(registro);
    await writeFinanceClosings(fechamentos);
    return { success: true, fechamento: registro };
  });
};

module.exports = { registerFinanceHandlers };


