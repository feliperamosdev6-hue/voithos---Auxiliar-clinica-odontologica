import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../utils/http';
import {
  clearAdminSessionCookie,
  hasValidAdminSession,
  isValidAdminPanelToken,
  setAdminSessionCookie,
} from '../services/auth/authorizationService';

const resolveAdminPublicDir = (): string => {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'admin'),
    path.resolve(process.cwd(), 'whatsapp-engine', 'public', 'admin'),
    path.resolve(__dirname, '..', '..', 'public', 'admin'),
    path.resolve(__dirname, '..', '..', '..', 'public', 'admin'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

const adminPublicDir = resolveAdminPublicDir();

const loginSchema = z.object({
  token: z.string().optional(),
});

const sendAdminFile = (res: Response, filename: string): void => {
  res.sendFile(path.join(adminPublicDir, filename));
};

export const getAdminLoginPage = (_req: Request, res: Response): void => {
  sendAdminFile(res, 'login.html');
};

export const getAdminAppPage = (_req: Request, res: Response): void => {
  sendAdminFile(res, 'index.html');
};

export const createAdminSession = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const token = String(parsed.data.token || '').trim();
  if (!isValidAdminPanelToken(token)) {
    throw new HttpError(401, 'Invalid admin panel token.');
  }

  setAdminSessionCookie(res);
  res.json({
    success: true,
    data: {
      authenticated: true,
    },
  });
});

export const getAdminSession = (req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      authenticated: hasValidAdminSession(req),
    },
  });
};

export const deleteAdminSession = (_req: Request, res: Response): void => {
  clearAdminSessionCookie(res);
  res.json({
    success: true,
    data: {
      authenticated: false,
    },
  });
};
