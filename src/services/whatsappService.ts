import axios from 'axios';
import { config } from '../config/unifiedConfig.js';

export class WhatsappService {
  /**
   * Envia uma mensagem de texto simples via Evolution API.
   */
  async sendMessage(to: string, text: string): Promise<boolean> {
    if (!config.whatsapp.apiUrl || !config.whatsapp.apiKey) {
      console.warn('[WhatsappService]: API não configurada. Mensagem simulada no console:');
      console.log(`Para: ${to} -> Conteúdo: ${text}`);
      return true;
    }

    try {
      const response = await axios.post(
        `${config.whatsapp.apiUrl}/message/sendText/${config.whatsapp.instanceName}`,
        {
          number: to,
          options: {
            delay: 1200,
            presence: 'composing',
          },
          textMessage: {
            text,
          },
        },
        {
          headers: {
            apikey: config.whatsapp.apiKey,
          },
        }
      );
      return response.status === 201 || response.status === 200;
    } catch (e) {
      console.error('Falha ao enviar mensagem via Evolution API:', e);
      return false;
    }
  }
}

export const whatsappService = new WhatsappService();
