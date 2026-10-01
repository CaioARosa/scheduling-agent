import { Router } from 'express';
import { webhookController } from '../controllers/WebhookController.js';

const router = Router();

// Rota exclusiva para receber webhooks da Evolution API
router.post('/whatsapp', (req, res) => {
  webhookController.handleIncomingMessage(req, res);
});

export default router;
