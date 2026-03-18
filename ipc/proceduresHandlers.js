const path = require('path');

const readOverrides = async ({ clinicPath, pathExists, readJsonFile }) => {
  if (!clinicPath) return [];
  const filePath = path.join(clinicPath, 'procedimentos.json');
  if (!(await pathExists(filePath))) return [];
  try {
    const data = await readJsonFile(filePath);
    return Array.isArray(data?.procedimentos) ? data.procedimentos : [];
  } catch (_) {
    return [];
  }
};

const writeOverrides = async ({ clinicPath, ensureDir, writeJsonFile }, list) => {
  if (!clinicPath) return;
  await ensureDir(clinicPath);
  const filePath = path.join(clinicPath, 'procedimentos.json');
  await writeJsonFile(filePath, { procedimentos: list });
};

const loadBaseProcedures = async ({ pathExists, readJsonFile }) => {
  const filePath = path.join(__dirname, '..', 'Procedimentos.json');
  if (!(await pathExists(filePath))) return [];
  const data = await readJsonFile(filePath);
  return Array.isArray(data?.servicos) ? data.servicos : [];
};

const registerProceduresHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
}) => {
  ipcMain.handle('procedures-list', async () => {
    requireAccess({ roles: ['admin'], perms: ['procedures.manage'] });
    const [base, overrides] = await Promise.all([
      loadBaseProcedures({ pathExists, readJsonFile }),
      readOverrides({ clinicPath, pathExists, readJsonFile }),
    ]);

    const overrideMap = new Map();
    overrides.forEach((p) => {
      const codigo = String(p.codigo || p.id || '').trim();
      if (!codigo) return;
      overrideMap.set(codigo, p);
    });

    const merged = [];
    base.forEach((p) => {
      const codigo = String(p.codigo || p.id || '').trim();
      if (!codigo) return;
      const override = overrideMap.get(codigo);
      if (override && override.ativo === false) return;
      merged.push({
        codigo,
        nome: override?.nome || p.nome,
        preco: Number(override?.preco ?? p.preco ?? 0),
        origem: 'base',
      });
      overrideMap.delete(codigo);
    });

    overrideMap.forEach((p) => {
      if (p.ativo === false) return;
      const codigo = String(p.codigo || p.id || '').trim();
      if (!codigo) return;
      merged.push({
        codigo,
        nome: p.nome || 'Procedimento',
        preco: Number(p.preco ?? 0),
        origem: 'custom',
      });
    });

    return merged.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
  });

  ipcMain.handle('procedures-upsert', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['procedures.manage'] });
    const codigo = String(payload.codigo || '').trim();
    const nome = String(payload.nome || '').trim();
    if (!codigo || !nome) throw new Error('Codigo e nome sao obrigatorios.');
    const preco = Number(payload.preco ?? 0);

    const overrides = await readOverrides({ clinicPath, pathExists, readJsonFile });
    const idx = overrides.findIndex((p) => String(p.codigo || '') === codigo);
    const record = {
      codigo,
      nome,
      preco: Number.isFinite(preco) ? preco : 0,
      ativo: payload.ativo !== false,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) overrides[idx] = { ...overrides[idx], ...record };
    else overrides.push(record);
    await writeOverrides({ clinicPath, ensureDir, writeJsonFile }, overrides);
    return record;
  });

  ipcMain.handle('procedures-delete', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['procedures.manage'] });
    const codigo = String(payload.codigo || '').trim();
    if (!codigo) throw new Error('Codigo obrigatorio.');
    const [overrides, base] = await Promise.all([
      readOverrides({ clinicPath, pathExists, readJsonFile }),
      loadBaseProcedures({ pathExists, readJsonFile }),
    ]);
    const existsInBase = base.some((p) => String(p.codigo || p.id || '').trim() === codigo);
    const idx = overrides.findIndex((p) => String(p.codigo || '') === codigo);
    if (idx >= 0 && !existsInBase) {
      overrides.splice(idx, 1);
    } else if (idx >= 0) {
      overrides[idx] = { ...overrides[idx], ativo: false, updatedAt: new Date().toISOString() };
    } else {
      overrides.push({ codigo, nome: '', preco: 0, ativo: false, updatedAt: new Date().toISOString() });
    }
    await writeOverrides({ clinicPath, ensureDir, writeJsonFile }, overrides);
    return { success: true };
  });
};

module.exports = { registerProceduresHandlers };
