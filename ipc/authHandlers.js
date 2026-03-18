const registerAuthHandlers = ({
  ipcMain,
  requireAccess,
  loginUser,
  sanitizeUser,
  changePassword,
  listUsersPublic,
  resetPassword,
  listUsers,
  createUser,
  deleteUser,
  updateUser,
  listClinics,
  superAdminImpersonateClinic,
  createClinicWithAdmin,
  buildAccessContext,
  createSession,
  clearSession,
  restoreSession,
  currentUserRef,
  setCurrentUser,
  generateFinanceId,
}) => {
  const getCurrentClinicContext = () => {
    const user = currentUserRef?.() || null;
    const context = typeof buildAccessContext === 'function' ? buildAccessContext(user) : null;
    if (!context || context.tenantScope !== 'clinic') return {};
    return { clinicId: context.clinicId || 'defaultClinic' };
  };

  const requireSuperAdmin = () => {
    const user = currentUserRef?.() || null;
    if (!user || user.tipo !== 'super_admin') {
      throw new Error('Acesso restrito ao Super Admin Voithos.');
    }
  };

  ipcMain.handle('auth-login', async (_event, payload = {}) => {
    const user = await loginUser({ email: payload.email, login: payload.login, senha: payload.senha });
    setCurrentUser(user);
    await createSession(user, undefined, { isImpersonatedSession: false });
    return { success: true, user: sanitizeUser(currentUserRef()) };
  });

  ipcMain.handle('auth-logout', async () => {
    setCurrentUser(null);
    await clearSession();
    return { success: true };
  });

  ipcMain.handle('auth-current-user', async () => {
    let user = currentUserRef?.() || null;
    if (!user) {
      user = await restoreSession();
      if (user) setCurrentUser(user);
    }
    return sanitizeUser(user);
  });

  ipcMain.handle('auth-current-context', async () => {
    let user = currentUserRef?.() || null;
    if (!user) {
      user = await restoreSession();
      if (user) setCurrentUser(user);
    }

    const context = typeof buildAccessContext === 'function' ? buildAccessContext(user) : {
      accessProfile: user?.tipo === 'super_admin' ? 'SUPERADMIN' : 'ANONYMOUS',
      tenantScope: user?.tipo === 'super_admin' ? 'global' : 'clinic',
      clinicId: user?.clinicId || '',
    };

    return {
      ...context,
      user: sanitizeUser(user),
    };
  });

  ipcMain.handle('auth-change-password', async (_event, { senhaAtual, novaSenha }) => {
    const updated = await changePassword({ currentUser: currentUserRef(), senhaAtual, novaSenha });
    setCurrentUser(updated);
    await createSession(updated, undefined, { isImpersonatedSession: false });
    return { success: true };
  });

  ipcMain.handle('auth-list-users-public', async () => {
    return listUsersPublic(getCurrentClinicContext());
  });

  ipcMain.handle('users-reset-password', async (_event, { id, novaSenha }) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    return resetPassword({ id, novaSenha, ...getCurrentClinicContext() });
  });

  ipcMain.handle('users-list', async () => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    return listUsers(getCurrentClinicContext());
  });

  ipcMain.handle('users-create', async (_event, userData) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    return createUser(userData, generateFinanceId, getCurrentClinicContext());
  });

  ipcMain.handle('users-delete', async (_event, id) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    return deleteUser(id, getCurrentClinicContext());
  });

  ipcMain.handle('users-update', async (_event, payload) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    return updateUser(payload || {}, getCurrentClinicContext());
  });

  ipcMain.handle('super-admin-clinics-list', async () => {
    requireSuperAdmin();
    return listClinics();
  });

  ipcMain.handle('super-admin-clinics-create', async (_event, payload) => {
    requireSuperAdmin();
    return createClinicWithAdmin(payload || {}, generateFinanceId);
  });

  ipcMain.handle('super-admin-impersonate-clinic', async (_event, clinicId) => {
    requireSuperAdmin();
    const admin = await superAdminImpersonateClinic(clinicId);
    setCurrentUser(admin);
    await createSession(admin, undefined, { isImpersonatedSession: true });
    return { success: true, user: sanitizeUser(admin) };
  });
};

module.exports = { registerAuthHandlers };
