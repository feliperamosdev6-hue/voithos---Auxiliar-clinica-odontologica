const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors/AppError');
const { sessionRepository } = require('../repositories/sessionRepository');
const { userRepository } = require('../repositories/userRepository');

const SESSION_TTL_DAYS = 7;

const isMissingTableError = (error) => error && error.code === 'P2021';

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    clinicId: user.clinicId,
  };
};

const hashPassword = async (password) => {
  const raw = String(password || '');
  if (!raw.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password is required.');
  }
  return bcrypt.hash(raw, 10);
};

const verifyPassword = async (password, hash) => {
  const rawPassword = String(password || '');
  const rawHash = String(hash || '');
  if (!rawPassword || !rawHash) return false;
  return bcrypt.compare(rawPassword, rawHash);
};

const createSession = async (userId) => {
  const token = crypto.randomUUID();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);

  try {
    const session = await sessionRepository.create({
      userId,
      token,
      expiresAt,
    });
    return session;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const getSessionByToken = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  try {
    await sessionRepository.deleteExpired(new Date());
    const session = await sessionRepository.findByToken(normalizedToken);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await sessionRepository.deleteByToken(normalizedToken);
      return null;
    }
    return session;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const getCurrentUser = async (token) => {
  const session = await getSessionByToken(token);
  if (!session) return null;

  try {
    const user = await userRepository.findById(session.userId);
    if (!user || user.ativo === false) return null;
    return sanitizeUser(user);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const login = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!rawPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password is required.');
  }

  let user;
  try {
    user = await userRepository.findByEmail(normalizedEmail);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  if (user.ativo === false) {
    throw new AppError(403, 'USER_INACTIVE', 'User is inactive.');
  }

  const passwordOk = await verifyPassword(rawPassword, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  const session = await createSession(user.id);
  return {
    token: session.token,
    user: sanitizeUser(user),
  };
};

const logout = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.');
  }

  try {
    await sessionRepository.deleteByToken(normalizedToken);
    return { loggedOut: true };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

module.exports = {
  SESSION_TTL_DAYS,
  authService: {
    hashPassword,
    verifyPassword,
    login,
    createSession,
    getSessionByToken,
    getCurrentUser,
    logout,
  },
};
