import { Router } from 'express';
import {
  createInstance,
  deleteInstance,
  disconnectInstance,
  dispatchInstanceMessage,
  getInstanceDetails,
  getInstanceLogs,
  getInstanceQr,
  getInstanceStatus,
  listInstances,
} from '../controllers/instanceController';

export const instanceRoutes = Router();

instanceRoutes.get('/', listInstances);
instanceRoutes.post('/', createInstance);
instanceRoutes.get('/:id', getInstanceDetails);
instanceRoutes.get('/:id/status', getInstanceStatus);
instanceRoutes.get('/:id/qr', getInstanceQr);
instanceRoutes.post('/:id/disconnect', disconnectInstance);
instanceRoutes.delete('/:id', deleteInstance);
instanceRoutes.get('/:id/logs', getInstanceLogs);
instanceRoutes.post('/:id/messages/send-internal', dispatchInstanceMessage);
