import { Router } from 'express';
import {
  getSecurityOverview,
  getWebhookOverview,
  listOperationalEvents,
  listRecentLogs,
} from '../controllers/supportController';

export const supportRoutes = Router();

supportRoutes.get('/logs/recent', listRecentLogs);
supportRoutes.get('/operational-events/recent', listOperationalEvents);
supportRoutes.get('/webhooks/overview', getWebhookOverview);
supportRoutes.get('/security/overview', getSecurityOverview);
