const fs = require('fs');
const path = require('path');

const DEFAULT_ENGINE_PORT = 8099;
const DEFAULT_ENGINE_BASE_URL = `http://127.0.0.1:${DEFAULT_ENGINE_PORT}`;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_STATUS_TIMEOUT_MS = 12000;
const DEFAULT_QR_TIMEOUT_MS = 45000;
const INSTANCE_CACHE_TTL_MS = 10000;

const parseEnvFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) return acc;
      const key = trimmed.slice(0, eqIndex).trim();
      const rawValue = trimmed.slice(eqIndex + 1).trim();
      const unquoted = rawValue.replace(/^['"]|['"]$/g, '');
      acc[key] = unquoted;
      return acc;
    }, {});
  } catch (_error) {
    return {};
  }
};

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const createTaggedError = (message, code, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
};

const classifyEngineMessage = (message, baseUrl) => {
  const text = String(message || '').trim();
  const normalized = text.toLowerCase();

  if (normalized.includes('invalid internal token')) {
    return createTaggedError('Token interno do WhatsApp Engine invalido. Verifique a configuracao do ambiente.', 'ENGINE_INVALID_TOKEN', { baseUrl });
  }

  if (normalized.includes('no whatsapp instance for this clinic')) {
    return createTaggedError('Esta clinica nao possui uma instancia WhatsApp conectada no engine. Abra "Minha clinica" e conecte o WhatsApp novamente.', 'ENGINE_INSTANCE_MISSING', { baseUrl });
  }

  if (normalized.includes("can't reach database server") || normalized.includes('prismaclientinitializationerror')) {
    return createTaggedError('WhatsApp Engine sem acesso ao banco de dados. Inicie o ambiente completo do engine antes de conectar a clinica.', 'ENGINE_DATABASE_UNAVAILABLE', { baseUrl });
  }

  if (normalized.includes('econnrefused') || normalized.includes('fetch failed') || normalized.includes('nao foi possivel conectar')) {
    return createTaggedError(`WhatsApp Engine indisponivel em ${baseUrl}. Inicie o engine antes de conectar a clinica.`, 'ENGINE_UNAVAILABLE', { baseUrl });
  }

  return null;
};

const resolveEngineConfig = () => {
  const rootEnvPath = path.join(__dirname, '..', '.env');
  const rootEnv = parseEnvFile(rootEnvPath);
  const engineEnvPath = path.join(__dirname, '..', 'whatsapp-engine', '.env');
  const engineEnv = parseEnvFile(engineEnvPath);
  const port = Number(
    process.env.WHATSAPP_ENGINE_PORT
      || process.env.PORT
      || rootEnv.WHATSAPP_ENGINE_PORT
      || engineEnv.PORT
      || DEFAULT_ENGINE_PORT,
  );
  const baseUrl = normalizeBaseUrl(
    process.env.WHATSAPP_ENGINE_BASE_URL
      || process.env.WHATSAPP_NG_BASE_URL
      || rootEnv.WHATSAPP_ENGINE_BASE_URL
      || rootEnv.WHATSAPP_NG_BASE_URL
      || engineEnv.WHATSAPP_ENGINE_BASE_URL
      || `http://127.0.0.1:${Number.isFinite(port) ? port : DEFAULT_ENGINE_PORT}`,
  ) || DEFAULT_ENGINE_BASE_URL;
  const serviceToken = String(
    process.env.WHATSAPP_NG_SERVICE_TOKEN
      || process.env.WHATSAPP_ENGINE_SERVICE_TOKEN
      || process.env.SERVICE_INTERNAL_API_TOKEN
      || process.env.WHATSAPP_ENGINE_INTERNAL_TOKEN
      || process.env.INTERNAL_API_TOKEN
      || rootEnv.WHATSAPP_NG_SERVICE_TOKEN
      || rootEnv.WHATSAPP_ENGINE_SERVICE_TOKEN
      || rootEnv.SERVICE_INTERNAL_API_TOKEN
      || engineEnv.SERVICE_INTERNAL_API_TOKEN
      || engineEnv.INTERNAL_API_TOKEN
      || '',
  ).trim();

  return { baseUrl, serviceToken };
};

const formatEngineError = (status, payload, baseUrl) => {
  const message = payload?.error?.message || payload?.message || `Erro ${status} ao comunicar com o WhatsApp Engine.`;
  return classifyEngineMessage(message, baseUrl) || createTaggedError(message, 'ENGINE_REQUEST_FAILED', { status, baseUrl });
};

const createWhatsAppEngineService = () => {
  const instanceCache = new Map();

  const cacheKey = (clinicId) => String(clinicId || '').trim().toLowerCase();
  const readCachedInstance = (clinicId) => {
    const key = cacheKey(clinicId);
    if (!key) return null;
    const cached = instanceCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      instanceCache.delete(key);
      return null;
    }
    return cached.instance || null;
  };
  const writeCachedInstance = (clinicId, instance) => {
    const key = cacheKey(clinicId);
    if (!key || !instance?.id) return;
    instanceCache.set(key, {
      instance,
      expiresAt: Date.now() + INSTANCE_CACHE_TTL_MS,
    });
  };
  const clearCachedInstance = (clinicId) => {
    const key = cacheKey(clinicId);
    if (!key) return;
    instanceCache.delete(key);
  };

  const request = async (pathname, options = {}) => {
    const { baseUrl, serviceToken } = resolveEngineConfig();
    const url = `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(serviceToken ? { 'x-service-token': serviceToken } : {}),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        signal: controller.signal,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const detail = error?.message || String(error);
      if (error?.name === 'AbortError' || /aborted/i.test(detail)) {
        throw createTaggedError(
          `WhatsApp Engine demorou demais para responder em ${baseUrl}. Tente novamente em alguns segundos para gerar o QR Code.`,
          'ENGINE_TIMEOUT',
          { baseUrl, timeoutMs, pathname },
        );
      }
      throw classifyEngineMessage(detail, baseUrl)
        || createTaggedError(`Nao foi possivel conectar ao WhatsApp Engine em ${baseUrl}. ${detail}`, 'ENGINE_UNAVAILABLE', { baseUrl });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw formatEngineError(response.status, payload, baseUrl);
    }

    return payload?.data ?? payload;
  };

  const findInstanceByClinicId = async (clinicId) => {
    const cached = readCachedInstance(clinicId);
    if (cached) return cached;
    const listing = await request('/instances', { timeoutMs: DEFAULT_STATUS_TIMEOUT_MS });
    const items = Array.isArray(listing?.items) ? listing.items : [];
    items.forEach((item) => {
      if (item?.clinicId && item?.id) writeCachedInstance(item.clinicId, item);
    });
    return items.find((item) => String(item?.clinicId || '').trim() === String(clinicId || '').trim()) || null;
  };

  const ensureInstance = async ({ clinicId, displayName }) => {
    const existing = await findInstanceByClinicId(clinicId);
    if (existing) return existing;

    const created = await request('/instances', {
      method: 'POST',
      body: {
        clinicId,
        displayName: String(displayName || '').trim() || undefined,
      },
    });

    const instance = {
      id: created?.id,
      clinicId: created?.clinicId || clinicId,
      status: created?.status || 'CREATED',
      createdAt: created?.createdAt || null,
      updatedAt: created?.updatedAt || null,
    };
    writeCachedInstance(clinicId, instance);
    return instance;
  };

  const readQrSnapshot = async (instanceId, fallback = {}) => {
    const qr = await request(`/instances/${encodeURIComponent(instanceId)}/qr`, { timeoutMs: DEFAULT_QR_TIMEOUT_MS });
    return {
      qr: qr?.qr || null,
      qrDataUrl: qr?.qrDataUrl || null,
      pairingCode: qr?.pairingCode || null,
      qrUpdatedAt: qr?.qrUpdatedAt || null,
      status: qr?.status || fallback.status || 'CONNECTING',
    };
  };

  const getClinicConnection = async ({ clinicId, displayName, createIfMissing = false, includeQr = false } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw new Error('clinicId obrigatorio para consultar o WhatsApp da clinica.');
    }

    const instance = createIfMissing
      ? await ensureInstance({ clinicId, displayName })
      : await findInstanceByClinicId(clinicId);

    if (!instance?.id) {
      clearCachedInstance(clinicId);
      return {
        available: true,
        exists: false,
        clinicId,
        status: 'NOT_CONFIGURED',
        connectedInRuntime: false,
      };
    }

    let status;
    try {
      status = await request(`/instances/${encodeURIComponent(instance.id)}/status`, { timeoutMs: DEFAULT_STATUS_TIMEOUT_MS });
    } catch (error) {
      const code = String(error?.code || '').trim().toUpperCase();
      const message = String(error?.message || '').trim().toLowerCase();
      const staleInstance = code === 'ENGINE_REQUEST_FAILED' && message.includes('instance not found');
      if (!staleInstance) throw error;

      clearCachedInstance(clinicId);
      return {
        available: true,
        exists: false,
        clinicId,
        status: 'NOT_CONFIGURED',
        connectedInRuntime: false,
      };
    }

    const connection = {
      available: true,
      exists: true,
      instanceId: status?.id || instance.id,
      clinicId: status?.clinicId || clinicId,
      status: status?.status || instance.status || 'CREATED',
      phoneNumber: status?.phoneNumber || '',
      displayName: status?.displayName || displayName || '',
      lastSeenAt: status?.lastSeenAt || null,
      connectedInRuntime: status?.connectedInRuntime === true,
      createdAt: instance?.createdAt || null,
      updatedAt: instance?.updatedAt || null,
    };
    writeCachedInstance(connection.clinicId, {
      ...instance,
      id: connection.instanceId,
      clinicId: connection.clinicId,
      status: connection.status,
      updatedAt: connection.updatedAt,
      createdAt: connection.createdAt,
    });

    const normalizedStatus = String(connection.status || '').trim().toUpperCase();
    if (!includeQr || normalizedStatus === 'CONNECTED') {
      return connection;
    }

    const qrSnapshot = await readQrSnapshot(connection.instanceId, connection).catch(() => null);
    if (!qrSnapshot) return connection;
    return {
      ...connection,
      ...qrSnapshot,
    };
  };

  const getClinicQr = async ({ clinicId, displayName } = {}) => {
    const connection = await getClinicConnection({ clinicId, displayName, createIfMissing: true, includeQr: false });
    if (!connection?.instanceId) {
      throw new Error('Nao foi possivel preparar a instancia da clinica.');
    }

    let qr = await readQrSnapshot(connection.instanceId, connection);
    if (!qr?.qrDataUrl && String(qr?.status || '').trim().toUpperCase() !== 'CONNECTED') {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      qr = await readQrSnapshot(connection.instanceId, connection).catch(() => qr);
    }
    return {
      ...connection,
      qr: qr?.qr || null,
      qrDataUrl: qr?.qrDataUrl || null,
      pairingCode: qr?.pairingCode || null,
      qrUpdatedAt: qr?.qrUpdatedAt || null,
      status: qr?.status || connection.status,
    };
  };

  const sendClinicText = async ({ clinicId, phone, message, appointmentId } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw createTaggedError('clinicId obrigatorio para enviar mensagem pelo WhatsApp Engine.', 'ENGINE_INVALID_CLINIC');
    }
    const toPhone = String(phone || '').trim();
    const body = String(message || '').trim();
    if (!toPhone) throw createTaggedError('Telefone invalido para envio.', 'ENGINE_INVALID_PHONE');
    if (!body) throw createTaggedError('Mensagem vazia.', 'ENGINE_INVALID_BODY');

    const connection = await getClinicConnection({ clinicId, createIfMissing: false });
    if (!connection?.exists) {
      throw createTaggedError('A clinica ainda nao conectou um WhatsApp no sistema.', 'ENGINE_INSTANCE_MISSING', { clinicId });
    }

    if (String(connection.status || '').trim().toUpperCase() !== 'CONNECTED') {
      throw createTaggedError('O WhatsApp da clinica ainda nao esta conectado. Gere e escaneie o QR Code antes de enviar mensagens.', 'ENGINE_INSTANCE_NOT_CONNECTED', {
        clinicId,
        instanceId: connection.instanceId,
        status: connection.status,
      });
    }

    return request('/messages/send', {
      method: 'POST',
      body: {
        clinicId,
        toPhone,
        body,
        appointmentId: String(appointmentId || '').trim() || undefined,
      },
    });
  };

  const disconnectClinicInstance = async ({ clinicId } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw createTaggedError('clinicId obrigatorio para desconectar o WhatsApp da clinica.', 'ENGINE_INVALID_CLINIC');
    }

    const instance = await findInstanceByClinicId(clinicId);
    if (!instance?.id) {
      clearCachedInstance(clinicId);
      return {
        clinicId,
        exists: false,
        disconnected: false,
      };
    }

    const result = await request(`/instances/${encodeURIComponent(instance.id)}/disconnect`, {
      method: 'POST',
      timeoutMs: DEFAULT_QR_TIMEOUT_MS,
    });
    clearCachedInstance(clinicId);
    return {
      clinicId,
      instanceId: instance.id,
      disconnected: true,
      ...result,
    };
  };

  const deleteClinicInstance = async ({ clinicId } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw createTaggedError('clinicId obrigatorio para excluir a instancia do WhatsApp da clinica.', 'ENGINE_INVALID_CLINIC');
    }

    const instance = await findInstanceByClinicId(clinicId);
    if (!instance?.id) {
      clearCachedInstance(clinicId);
      return {
        clinicId,
        exists: false,
        deleted: false,
      };
    }

    const result = await request(`/instances/${encodeURIComponent(instance.id)}`, {
      method: 'DELETE',
      timeoutMs: DEFAULT_QR_TIMEOUT_MS,
    });
    clearCachedInstance(clinicId);
    return {
      clinicId,
      instanceId: instance.id,
      deleted: true,
      ...result,
    };
  };

  return {
    getClinicConnection: (payload) => getClinicConnection({ ...payload, includeQr: true }),
    refreshClinicConnection: (payload) => getClinicConnection({ ...payload, includeQr: true }),
    getClinicQr,
    sendClinicText,
    disconnectClinicInstance,
    deleteClinicInstance,
  };
};

module.exports = { createWhatsAppEngineService };
