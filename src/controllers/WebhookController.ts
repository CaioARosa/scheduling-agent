import { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { patientService } from '../services/patientService.js';
import { agentService } from '../services/agentService.js';
import { whatsappService } from '../services/whatsappService.js';
import { memoryService } from '../services/memoryService.js';

export class WebhookController extends BaseController {
  async handleIncomingMessage(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      
      const messageData = payload.data;
      if (!messageData || !messageData.key) {
        this.handleSuccess(res, { status: 'ignored', message: 'Payload inválido ou sem dados de mensagem.' });
        return;
      }

      const fromPhone = messageData.key.remoteJid.split('@')[0]; // Ex: 5511999999999
      const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';

      if (!textMessage) {
        this.handleSuccess(res, { status: 'ignored', message: 'Mensagem sem conteúdo textual.' });
        return;
      }

      // 1. Processa a resposta utilizando a IA + Function Calling
      const replyText = await agentService.processMessage(fromPhone, textMessage);

      // 2. Envia a resposta de volta ao paciente pelo WhatsApp
      await whatsappService.sendMessage(fromPhone, replyText);

      // 3. Dispara a consolidação de memória em background de forma assíncrona
      // Em produção, isso seria agendado para rodar após uma janela de inatividade.
      // Aqui rodamos em background imediatamente para fins de demonstração.
      const patient = await patientService.getPatientByPhone(fromPhone);
      if (patient) {
        memoryService.consolidateSessionMemory(fromPhone, [
          { sender: 'patient', text: textMessage },
          { sender: 'agent', text: replyText }
        ]).catch(err => console.error('Erro na consolidação de memória assíncrona:', err));
      }

      this.handleSuccess(res, {
        status: 'processed',
        sender: fromPhone,
        textReceived: textMessage,
        replySent: replyText
      });
    } catch (error) {
      this.handleError(error, res, 'handleIncomingMessage');
    }
  }
}
export const webhookController = new WebhookController();
