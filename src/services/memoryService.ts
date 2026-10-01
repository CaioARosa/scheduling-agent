import { ChatSessionRepository } from '../repositories/ChatSessionRepository.js';
import { patientService } from './patientService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/unifiedConfig.js';
import { ChatSession } from '@prisma/client';

export class MemoryService {
  private readonly ai: GoogleGenerativeAI | null = null;

  constructor(private readonly chatSessionRepository: ChatSessionRepository) {
    if (config.gemini.apiKey) {
      this.ai = new GoogleGenerativeAI(config.gemini.apiKey);
    }
  }

  async getSession(patientId: string): Promise<ChatSession | null> {
    return this.chatSessionRepository.findByPatientId(patientId);
  }

  async updateState(patientId: string, state: string): Promise<ChatSession> {
    return this.chatSessionRepository.upsert(patientId, { currentState: state });
  }

  /**
   * Job simulado que consolida o histórico de conversa em segundo plano.
   * Extrai novas preferências (Semântica) e atualiza o resumo da conversa (Episódica).
   */
  async consolidateSessionMemory(patientId: string, conversationTurns: Array<{ sender: string; text: string }>): Promise<void> {
    if (!this.ai) {
      console.warn('Gemini API Key não configurada. Consolidação de memória ignorada.');
      return;
    }

    const patient = await patientService.getPatientByPhone(patientId);
    if (!patient) return;

    const chatText = conversationTurns.map(t => `${t.sender}: ${t.text}`).join('\n');

    try {
      const model = this.ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
        Analise o histórico de conversa de WhatsApp abaixo entre a Assistente da Clínica e o Paciente (${patient.name}).
        Sua tarefa é extrair e atualizar:
        1. Preferências permanentes do paciente (ex: melhores horários, dias preferidos, modalidade online/presencial).
        2. Um resumo consolidado e conciso da conversa atual (episódica) para guiar o próximo contato.

        Preferências atuais conhecidas: ${patient.preferences || 'Nenhuma'}

        Histórico recente da conversa:
        ${chatText}

        Responda estritamente em formato JSON estruturado com os campos:
        {
          "newPreferences": { ... },
          "contextSummary": "resumo conciso aqui"
        }
      `;

      const response = await model.generateContent(prompt);
      const jsonResponseText = response.response.text();
      
      // Sanitização básica do JSON retornado pelo modelo
      const cleanJson = jsonResponseText.substring(
        jsonResponseText.indexOf('{'),
        jsonResponseText.lastIndexOf('}') + 1
      );
      
      const result = JSON.parse(cleanJson);

      // 1. Atualizar Memória Semântica (Preferências)
      if (result.newPreferences) {
        const mergedPreferences = {
          ...(patient.preferences ? JSON.parse(patient.preferences) : {}),
          ...result.newPreferences
        };
        await patientService.updatePatientPreferences(patient.id, JSON.stringify(mergedPreferences));
      }

      // 2. Atualizar Memória Episódica (Resumo da Sessão)
      await this.chatSessionRepository.upsert(patient.id, {
        contextSummary: result.contextSummary,
        currentState: 'IDLE' // Retorna ao estado ocioso
      });

      console.log(`[MemoryService]: Memória do paciente ${patient.name} consolidada com sucesso.`);
    } catch (e) {
      console.error('Falha na consolidação de memória em background:', e);
    }
  }
}

export const memoryService = new MemoryService(new ChatSessionRepository());
