import fs from 'fs/promises';
import path from 'path';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { InstanceStatus, WhatsAppInstance } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { messageLogRepository } from '../../repositories/messageLogRepository';
import { HttpError } from '../../utils/http';
import { normalizeBrPhone } from '../../utils/phone';
import { instanceRepository } from '../../repositories/instanceRepository';
import { createBodySummary, operationalEventRepository } from '../../repositories/operationalEventRepository';
import { restoreSessionDirFromBlob, serializeSessionDir } from '../../lib/baileys/authBlobStore';
import { centralBackendService } from '../integration/centralBackendService';

type RuntimeSocket = {
  socket: WASocket;
  qr?: string;
  qrUpdatedAt?: Date;
  pairingCode?: string;
};

const runtimeSockets = new Map<string, RuntimeSocket>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const intentionalShutdowns = new Set<string>();
const sessionsRoot = path.resolve(process.cwd(), env.sessionsDir);
const BAILEYS_VERSION_TIMEOUT_MS = 8000;
const QR_RUNTIME_TIMEOUT_MS = 30000;

const getSessionDir = (instanceId: string): string => path.join(sessionsRoot, instanceId);

const resolveBaileysVersion = async (): Promise<{ version?: [number, number, number] } | null> => {
  try {
    const versionInfo = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), BAILEYS_VERSION_TIMEOUT_MS);
      }),
    ]);

    if (versionInfo?.version?.length === 3) {
      return { version: versionInfo.version as [number, number, number] };
    }

    logger.warn({
      timeoutMs: BAILEYS_VERSION_TIMEOUT_MS,
    }, 'baileys version lookup timed out; using bundled default version');
    return null;
  } catch (error) {
    logger.warn({
      error,
      timeoutMs: BAILEYS_VERSION_TIMEOUT_MS,
    }, 'failed fetching latest Baileys version; using bundled default version');
    return null;
  }
};

const parsePhoneFromJid = (jid: string | undefined): string => {
  const raw = String(jid || '').trim();
  if (!raw) return '';
  const at = raw.indexOf(':');
  const base = (at > 0 ? raw.slice(0, at) : raw).split('@')[0];
  return normalizeBrPhone(base);
};

const resolveIncomingPhone = (entry: any): string => {
  const candidates = [
    entry?.key?.senderPn,
    entry?.key?.participantPn,
    entry?.participantPn,
    entry?.key?.participant,
    entry?.participant,
    entry?.key?.remoteJid,
  ];

  for (const candidate of candidates) {
    const normalized = parsePhoneFromJid(candidate);
    if (normalized) return normalized;
  }

  return '';
};

const extractIncomingText = (message: any): string => {
  const content = message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.videoMessage?.caption
    || message?.buttonsResponseMessage?.selectedDisplayText
    || message?.buttonsResponseMessage?.selectedButtonId
    || message?.listResponseMessage?.title
    || message?.listResponseMessage?.singleSelectReply?.selectedRowId
    || '';
  return String(content || '').trim();
};

const ensureSessionMaterialized = async (instance: WhatsAppInstance): Promise<void> => {
  const sessionDir = getSessionDir(instance.id);
  await fs.mkdir(sessionDir, { recursive: true });
  const files = await fs.readdir(sessionDir).catch(() => []);
  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    sessionDir,
    fileCount: files.length,
    hasAuthBlob: Boolean(instance.authBlobEncrypted),
  }, 'instance session materialization check');
  if (files.length > 0) return;
  if (!instance.authBlobEncrypted) return;

  try {
    await restoreSessionDirFromBlob(sessionDir, instance.authBlobEncrypted);
    const restoredFiles = await fs.readdir(sessionDir).catch(() => []);
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
      restoredFileCount: restoredFiles.length,
    }, 'instance session restored from auth blob');
  } catch (error) {
    logger.error({
      error,
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
    }, 'failed to restore session from auth blob');
    throw error;
  }
};

const persistAuthBlob = async (instance: WhatsAppInstance): Promise<void> => {
  const sessionDir = getSessionDir(instance.id);
  try {
    const encrypted = await serializeSessionDir(sessionDir);
    await instanceRepository.updateAuthBlob(instance.id, encrypted);
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
      authBlobLength: encrypted.length,
    }, 'instance auth blob persisted');
  } catch (error) {
    logger.error({
      error,
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
    }, 'failed to persist auth blob');
    throw error;
  }
};

const clearReconnectTimer = (instanceId: string): void => {
  const reconnectTimer = reconnectTimers.get(instanceId);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimers.delete(instanceId);
  }
};

const removeSessionDir = async (instanceId: string): Promise<void> => {
  const sessionDir = getSessionDir(instanceId);
  await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
};

const closeRuntimeSocket = async (instance: WhatsAppInstance, reason: string): Promise<void> => {
  const runtime = runtimeSockets.get(instance.id);
  if (!runtime) return;

  intentionalShutdowns.add(instance.id);
  clearReconnectTimer(instance.id);
  runtimeSockets.delete(instance.id);

  try {
    if (runtime.socket.user) {
      await runtime.socket.logout().catch(() => null);
    }
  } catch (_error) {
    logger.warn({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      reason,
    }, 'instance logout failed during runtime shutdown');
  }

  try {
    const ws = (runtime.socket as any)?.ws;
    if (ws?.readyState === 0 || ws?.readyState === 1) {
      ws.close();
    }
  } catch (_error) {
    logger.warn({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      reason,
    }, 'instance websocket close failed during runtime shutdown');
  }

  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    reason,
  }, 'instance runtime socket closed intentionally');
};

const scheduleReconnect = (instance: WhatsAppInstance, delayMs = 5000): void => {
  if (reconnectTimers.has(instance.id)) return;

  const timer = setTimeout(() => {
    reconnectTimers.delete(instance.id);
    void instanceService.connect(instance.id).catch((error) => {
      logger.error({ error, instanceId: instance.id, clinicId: instance.clinicId }, 'reconnect failed');
    });
  }, delayMs);

  reconnectTimers.set(instance.id, timer);
  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    delayMs,
  }, 'instance reconnect scheduled');
};

const waitForConnectedRuntime = async (instanceId: string, timeoutMs = 15000): Promise<RuntimeSocket | null> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const runtime = runtimeSockets.get(instanceId);
    const instance = await instanceRepository.findById(instanceId);
    if (runtime && instance?.status === InstanceStatus.CONNECTED) {
      return runtime;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }

  return null;
};

const getRuntimeSocketState = (runtime: RuntimeSocket | null | undefined): 'OPEN' | 'CONNECTING' | 'CLOSING' | 'CLOSED' | 'MISSING' => {
  if (!runtime?.socket?.ws) return 'MISSING';
  if (runtime.socket.ws.isOpen) return 'OPEN';
  if (runtime.socket.ws.isConnecting) return 'CONNECTING';
  if (runtime.socket.ws.isClosing) return 'CLOSING';
  if (runtime.socket.ws.isClosed) return 'CLOSED';
  return 'MISSING';
};

const isRuntimeReadyForSend = (runtime: RuntimeSocket | null | undefined): boolean => {
  if (!runtime?.socket?.user) return false;
  return getRuntimeSocketState(runtime) === 'OPEN';
};

const toOperationalStatus = (
  persistedStatus: InstanceStatus,
  runtime: RuntimeSocket | null | undefined,
): InstanceStatus => {
  const runtimeState = getRuntimeSocketState(runtime);
  if (runtimeState === 'OPEN') {
    return isRuntimeReadyForSend(runtime) ? InstanceStatus.CONNECTED : InstanceStatus.CONNECTING;
  }
  if (runtimeState === 'CONNECTING') return InstanceStatus.CONNECTING;
  if (runtimeState === 'CLOSING' || runtimeState === 'CLOSED') return InstanceStatus.DISCONNECTED;
  return persistedStatus === InstanceStatus.CONNECTED ? InstanceStatus.DISCONNECTED : persistedStatus;
};

const markRuntimeUnavailable = async (
  instance: WhatsAppInstance,
  runtime: RuntimeSocket | null | undefined,
  reason: string,
): Promise<void> => {
  const runtimeState = getRuntimeSocketState(runtime);
  runtimeSockets.delete(instance.id);
  clearReconnectTimer(instance.id);

  if (instance.status !== InstanceStatus.ERROR) {
    await instanceRepository.updateStatus(instance.id, InstanceStatus.DISCONNECTED).catch(() => null);
  }

  logger.warn({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    persistedStatus: instance.status,
    runtimeState,
    reason,
  }, 'instance runtime marked unavailable');

  scheduleReconnect(instance, 1500);
};

const waitForQrRuntime = async (instanceId: string, timeoutMs = 10000): Promise<RuntimeSocket | null> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const runtime = runtimeSockets.get(instanceId);
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) return null;

    if (runtime?.qr || runtime?.pairingCode) {
      return runtime;
    }

    if (instance.status === InstanceStatus.CONNECTED) {
      return runtime || null;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  return runtimeSockets.get(instanceId) || null;
};

const startSocket = async (instance: WhatsAppInstance, pairingPhone?: string): Promise<void> => {
  await fs.mkdir(sessionsRoot, { recursive: true });
  await ensureSessionMaterialized(instance);
  const sessionDir = getSessionDir(instance.id);
  const auth = await useMultiFileAuthState(sessionDir);
  const versionInfo = await resolveBaileysVersion();
  let currentStatus = instance.status;

  await instanceRepository.updateStatus(instance.id, InstanceStatus.CONNECTING);
  currentStatus = InstanceStatus.CONNECTING;
  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    previousStatus: instance.status,
    nextStatus: InstanceStatus.CONNECTING,
    sessionDir,
    registered: auth.state.creds.registered,
    hasPairingPhone: Boolean(pairingPhone),
    baileysVersion: versionInfo?.version?.join('.') || 'bundled-default',
  }, 'starting whatsapp socket');

  const socket = makeWASocket({
    auth: auth.state,
    ...(versionInfo?.version?.length ? { version: versionInfo.version } : {}),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  const runtime: RuntimeSocket = { socket };
  runtimeSockets.set(instance.id, runtime);
  clearReconnectTimer(instance.id);

  socket.ev.on('creds.update', async () => {
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      registered: auth.state.creds.registered,
    }, 'instance creds.update received');
    try {
      await auth.saveCreds();
      logger.info({
        instanceId: instance.id,
        clinicId: instance.clinicId,
        sessionDir,
      }, 'instance auth credentials saved to session dir');
      await persistAuthBlob(instance);
    } catch (error) {
      logger.error({
        error,
        instanceId: instance.id,
        clinicId: instance.clinicId,
        sessionDir,
      }, 'failed during creds.update persistence');
    }
  });

  socket.ev.on('connection.update', async (update) => {
    const reasonCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      previousStatus: currentStatus,
      connection: update.connection,
      hasQr: Boolean(update.qr),
      isNewLogin: update.isNewLogin,
      receivedPendingNotifications: update.receivedPendingNotifications,
      reasonCode,
    }, 'instance connection.update received');

    try {
      if (update.qr) {
        const previousStatus = currentStatus;
        runtime.qr = update.qr;
        runtime.qrUpdatedAt = new Date();
        await instanceRepository.updateStatus(instance.id, InstanceStatus.CONNECTING);
        await operationalEventRepository.append({
          eventType: 'QR_READY',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          status: InstanceStatus.CONNECTING,
          summary: 'qr code ready for pairing',
          payload: {
            qrUpdatedAt: runtime.qrUpdatedAt?.toISOString() || null,
          },
        });
        currentStatus = InstanceStatus.CONNECTING;
        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          previousStatus,
          nextStatus: InstanceStatus.CONNECTING,
          qrUpdatedAt: runtime.qrUpdatedAt,
        }, 'instance qr updated');
      }

      if (update.connection === 'open') {
        const phone = parsePhoneFromJid(socket.user?.id);
        const authenticated = Boolean(phone) && Boolean(socket.user?.id);
        const nextStatus = authenticated ? InstanceStatus.CONNECTED : InstanceStatus.CONNECTING;
        await instanceRepository.updateConnectionMeta(instance.id, {
          status: nextStatus,
          phoneNumber: phone,
          displayName: socket.user?.name || instance.displayName || undefined,
        });
        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          previousStatus: currentStatus,
          nextStatus,
          authenticated,
          phoneNumber: phone,
          displayName: socket.user?.name || instance.displayName || null,
        }, 'instance connection opened');
        currentStatus = nextStatus;
        if (authenticated) {
          await operationalEventRepository.append({
            eventType: 'INSTANCE_CONNECTED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone,
            status: nextStatus,
            summary: 'instance authenticated and ready',
          });
        }
        if (authenticated) {
          runtime.qr = undefined;
          runtime.pairingCode = undefined;
        }
      }

      if (update.connection === 'close') {
        const loggedOut = reasonCode === DisconnectReason.loggedOut;
        const restartRequired = reasonCode === DisconnectReason.restartRequired;
        const intentionalShutdown = intentionalShutdowns.has(instance.id);
        const nextStatus = intentionalShutdown
          ? InstanceStatus.CREATED
          : loggedOut
            ? InstanceStatus.ERROR
            : InstanceStatus.DISCONNECTED;

        await instanceRepository.updateStatus(instance.id, nextStatus);
        logger.warn({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          previousStatus: currentStatus,
          nextStatus,
          reasonCode,
          loggedOut,
          restartRequired,
          intentionalShutdown,
        }, 'instance connection closed');
        currentStatus = nextStatus;
        await operationalEventRepository.append({
          eventType: 'INSTANCE_DISCONNECTED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          status: nextStatus,
          summary: intentionalShutdown ? 'instance disconnected intentionally' : 'instance connection closed',
          payload: {
            reasonCode,
            loggedOut,
            restartRequired,
            intentionalShutdown,
          },
        });
        runtimeSockets.delete(instance.id);
        if (intentionalShutdown) {
          intentionalShutdowns.delete(instance.id);
        } else if (!loggedOut) {
          scheduleReconnect(instance, restartRequired ? 750 : 5000);
        }
      }
    } catch (error) {
      logger.error({
        error,
        instanceId: instance.id,
        clinicId: instance.clinicId,
        connection: update.connection,
        reasonCode,
      }, 'failed handling connection.update');
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!['notify', 'append'].includes(String(type || '').trim()) || !Array.isArray(messages) || !messages.length) return;

    for (const entry of messages) {
      try {
        if (!entry?.message) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: 'message without payload ignored',
          });
          continue;
        }
        if (entry?.key?.fromMe === true) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: 'fromMe message ignored',
          });
          continue;
        }

        const remoteJid = String(entry?.key?.remoteJid || '').trim();
        if (!remoteJid || remoteJid.endsWith('@broadcast') || remoteJid === 'status@broadcast') {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: 'broadcast or empty jid ignored',
          });
          continue;
        }

        const fromPhone = resolveIncomingPhone(entry);
        const body = extractIncomingText(entry.message);
        if (!fromPhone || !body) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone: fromPhone || null,
            summary: 'empty inbound body ignored',
          });
          continue;
        }

        const instancePhone = normalizeBrPhone(String(instance.phoneNumber || '').trim());
        if (instancePhone && fromPhone === instancePhone) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone: fromPhone,
            summary: 'self echo message ignored',
          });
          continue;
        }

        const bodySummary = createBodySummary(body);
        await operationalEventRepository.append({
          eventType: 'INBOUND_MESSAGE_CAPTURED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          phone: fromPhone,
          status: 'RECEIVED',
          summary: bodySummary.preview,
          payload: {
            providerMessageId: entry?.key?.id || null,
            containsLinks: bodySummary.containsLinks,
          },
        });

        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          providerMessageId: entry?.key?.id || null,
          fromPhone,
        }, 'inbound whatsapp message received');

        await operationalEventRepository.append({
          eventType: 'INBOUND_FORWARDED_TO_CENTRAL',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          phone: fromPhone,
          summary: bodySummary.preview,
          payload: {
            providerMessageId: entry?.key?.id || null,
          },
        });
        const inboundResult = await centralBackendService.postInboundWhatsapp({
          clinicId: instance.clinicId,
          fromPhone,
          body,
          providerMessageId: String(entry?.key?.id || '').trim() || null,
          rawPayload: entry,
        });
        await operationalEventRepository.append({
          eventType: 'INBOUND_CENTRAL_ACCEPTED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          phone: fromPhone,
          summary: bodySummary.preview,
          payload: {
            providerMessageId: entry?.key?.id || null,
          },
        });

        const replyText = String((inboundResult as { replyText?: string } | null)?.replyText || '').trim();
        if (replyText) {
          await runtime.socket.sendMessage(remoteJid, { text: replyText });
          await operationalEventRepository.append({
            eventType: 'INBOUND_AUTO_REPLY_SENT',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone: fromPhone,
            status: 'SENT',
            summary: createBodySummary(replyText).preview,
          });
        }
      } catch (error) {
        if (error instanceof Error && String(error.message || '').trim()) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_AUTO_REPLY_FAILED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: error.message,
          }).catch(() => null);
        }
        await operationalEventRepository.append({
          eventType: 'INBOUND_CENTRAL_FAILED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          summary: error instanceof Error ? error.message : 'failed processing inbound',
        });
        logger.error({
          error,
          instanceId: instance.id,
          clinicId: instance.clinicId,
        }, 'failed processing inbound whatsapp message');
      }
    }
  });

  if (pairingPhone && !auth.state.creds.registered) {
    try {
      const code = await socket.requestPairingCode(normalizeBrPhone(pairingPhone));
      runtime.pairingCode = code;
      logger.info({
        instanceId: instance.id,
        clinicId: instance.clinicId,
        pairingPhone: normalizeBrPhone(pairingPhone),
      }, 'pairing code requested');
    } catch (error) {
      logger.warn({
        error,
        instanceId: instance.id,
        clinicId: instance.clinicId,
        pairingPhone: normalizeBrPhone(pairingPhone),
      }, 'pairing code request failed; waiting for QR fallback');
    }
  }
};

export const instanceService = {
  create: async (payload: { clinicId: string; displayName?: string; pairingPhone?: string }) => {
    const clinicId = String(payload.clinicId || '').trim();
    if (!clinicId) throw new HttpError(400, 'clinicId is required.');
    const instance = await instanceRepository.createOrGetByClinic({
      clinicId,
      displayName: payload.displayName,
    });
    intentionalShutdowns.delete(instance.id);
    if (!runtimeSockets.has(instance.id)) {
      await startSocket(instance, payload.pairingPhone);
    }
    return instance;
  },

  connect: async (instanceId: string, pairingPhone?: string): Promise<WhatsAppInstance> => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');
    intentionalShutdowns.delete(instance.id);
    if (!runtimeSockets.has(instance.id)) {
      await startSocket(instance, pairingPhone);
    }
    return instance;
  },

  disconnect: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    await closeRuntimeSocket(instance, 'manual disconnect');
    await removeSessionDir(instance.id);
    const reset = await instanceRepository.resetSessionState(instance.id);

    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
    }, 'instance disconnected and reset');

    return {
      id: reset.id,
      clinicId: reset.clinicId,
      status: reset.status,
      deleted: false,
    };
  },

  remove: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    await closeRuntimeSocket(instance, 'manual delete');
    await removeSessionDir(instance.id);
    const deleted = await instanceRepository.deleteById(instance.id);
    intentionalShutdowns.delete(instance.id);

    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      deletedJobs: deleted.deletedJobs,
    }, 'instance deleted permanently');

    return {
      id: instance.id,
      clinicId: instance.clinicId,
      deleted: true,
      deletedJobs: deleted.deletedJobs,
    };
  },

  getStatus: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');
    const runtime = runtimeSockets.get(instance.id) || null;
    const runtimeSocketState = getRuntimeSocketState(runtime);
    const runtimeReady = isRuntimeReadyForSend(runtime);
    const operationalStatus = toOperationalStatus(instance.status, runtime);
    return {
      id: instance.id,
      clinicId: instance.clinicId,
      status: operationalStatus,
      persistedStatus: instance.status,
      phoneNumber: instance.phoneNumber,
      displayName: instance.displayName,
      lastSeenAt: instance.lastSeenAt,
      connectedInRuntime: runtimeReady,
      runtimeSocketState,
      runtimeReady,
    };
  },

  listInstances: async () => {
    const instances = await instanceRepository.listAll();
    const items = instances.map((instance) => {
      const runtime = runtimeSockets.get(instance.id) || null;
      return {
      id: instance.id,
      clinicId: instance.clinicId,
      status: toOperationalStatus(instance.status, runtime),
      persistedStatus: instance.status,
      phoneNumber: instance.phoneNumber,
      displayName: instance.displayName,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      lastSeenAt: instance.lastSeenAt,
      connectedInRuntime: isRuntimeReadyForSend(runtime),
      runtimeSocketState: getRuntimeSocketState(runtime),
      };
    });

    const summary = items.reduce<Record<string, number>>((acc, instance) => {
      acc.total += 1;
      acc[instance.status] = (acc[instance.status] || 0) + 1;
      return acc;
    }, {
      total: 0,
      CREATED: 0,
      CONNECTING: 0,
      CONNECTED: 0,
      DISCONNECTED: 0,
      ERROR: 0,
    });

    return { items, summary };
  },

  getInstanceDetails: async (instanceId: string) => {
    return instanceService.getStatus(instanceId);
  },

  getQrPayload: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    if (!runtimeSockets.has(instance.id)) {
      await startSocket(instance);
    }

    const runtime = await waitForQrRuntime(instance.id, QR_RUNTIME_TIMEOUT_MS);
    const latest = await instanceRepository.findById(instance.id);
    const qr = runtime?.qr || '';
    const pairingCode = runtime?.pairingCode || '';
    const qrDataUrl = qr ? await QRCode.toDataURL(qr) : '';

    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      hasRuntime: Boolean(runtime),
      hasQr: Boolean(qr),
      hasPairingCode: Boolean(pairingCode),
      status: latest?.status || instance.status,
    }, 'instance qr payload requested');

    return {
      instanceId: instance.id,
      status: latest?.status || instance.status,
      qr: qr || null,
      qrDataUrl: qrDataUrl || null,
      pairingCode: pairingCode || null,
      qrUpdatedAt: runtime?.qrUpdatedAt || null,
    };
  },

  getRecentLogs: async (instanceId: string, limit = 20) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    return messageLogRepository.findRecentByInstanceId(instanceId, limit);
  },

  sendText: async (instanceId: string, toPhone: string, body: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    let runtime: RuntimeSocket | null = runtimeSockets.get(instanceId) || null;
    if (!runtime) {
      logger.warn({
        instanceId,
        clinicId: instance.clinicId,
      }, 'sendText requested without runtime socket; attempting runtime recovery');
      await instanceService.connect(instanceId);
      runtime = await waitForConnectedRuntime(instanceId);
    }
    if (!runtime) {
      logger.error({
        instanceId,
        clinicId: instance.clinicId,
      }, 'runtime recovery did not reach connected state before send');
      throw new HttpError(409, 'WhatsApp instance runtime is unavailable. Reconnect is in progress.');
    }

    if (instance.status !== InstanceStatus.CONNECTED) {
      logger.warn({
        instanceId,
        clinicId: instance.clinicId,
        status: instance.status,
        runtimeState: getRuntimeSocketState(runtime),
      }, 'sendText blocked because instance is not connected after runtime recovery');
      throw new HttpError(409, 'WhatsApp instance is not connected.');
    }

    if (!isRuntimeReadyForSend(runtime)) {
      await markRuntimeUnavailable(instance, runtime, 'runtime socket is not open for send');
      throw new HttpError(409, 'WhatsApp instance runtime socket is closed. Reconnect started.');
    }

    const normalizedTo = normalizeBrPhone(toPhone);
    if (!normalizedTo) throw new HttpError(400, 'Invalid recipient phone.');

    const jid = `${normalizedTo}@s.whatsapp.net`;
    try {
      const response = await runtime.socket.sendMessage(jid, { text: body });
      return {
        providerMessageId: response?.key?.id || null,
        remoteJid: response?.key?.remoteJid || jid,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send error';
      const looksLikeClosedConnection = /connection closed|socket closed|not connected|stream errored/i.test(message);
      logger.error({
        error,
        instanceId,
        clinicId: instance.clinicId,
        runtimeState: getRuntimeSocketState(runtime),
      }, 'sendText failed');
      if (looksLikeClosedConnection) {
        await markRuntimeUnavailable(instance, runtime, message);
        throw new HttpError(409, 'WhatsApp connection closed during send. Reconnect started.');
      }
      throw error;
    }
  },

  recoverRuntimeSessions: async (): Promise<void> => {
    const instances = await instanceRepository.listForBootRecovery();
    for (const instance of instances) {
      try {
        if (!runtimeSockets.has(instance.id)) {
          await startSocket(instance);
        }
      } catch (error) {
        logger.error({ error, instanceId: instance.id }, 'failed to recover instance on boot');
      }
    }
  },
};
