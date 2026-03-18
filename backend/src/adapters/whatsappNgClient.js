const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');

const REQUEST_TIMEOUT_MS = 12000;

const ensureOk = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new AppError(
      response.status || 502,
      payload?.error?.code || 'WHATSAPP_NG_REQUEST_FAILED',
      payload?.error?.message || 'WhatsApp NG request failed.',
    );
  }
  return payload?.data || payload;
};

const request = async (pathname, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(appEnv.whatsappNgServiceToken ? { 'x-service-token': appEnv.whatsappNgServiceToken } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${appEnv.whatsappNgBaseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    console.info('[WHATSAPP_NG_CLIENT] response received', JSON.stringify({
      pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }));
    return ensureOk(response);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError(504, 'WHATSAPP_NG_TIMEOUT', 'WhatsApp NG request timed out.');
    }
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'WHATSAPP_NG_UNAVAILABLE', error?.message || 'WhatsApp NG is unavailable.');
  } finally {
    clearTimeout(timeout);
  }
};

const whatsappNgClient = {
  sendAppointmentConfirmation: async ({ clinicId, phone, body, auditBody, appointmentId }) => request('/messages/send', {
    method: 'POST',
    body: {
      clinicId,
      toPhone: phone,
      body,
      auditBody: auditBody || body,
      appointmentId,
    },
  }),
};

module.exports = { whatsappNgClient };
