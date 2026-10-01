import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { config } from '../config/unifiedConfig.js';
import { calendarService } from './calendarService.js';
import { patientService } from './patientService.js';
import { policyService } from './policyService.js';
import { memoryService } from './memoryService.js';

export class AgentService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.gemini.apiKey) {
      this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }
  }

  /**
   * Declaração de ferramentas para Function Calling do Gemini.
   */
  private getTools(): FunctionDeclaration[] {
    return [
      {
        name: 'listFreeSlots',
        description: 'Lista horários disponíveis para consulta em um intervalo de datas.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            timeMin: { type: SchemaType.STRING, description: 'ISO 8601 início (ex: 2026-08-05T00:00:00Z)' },
            timeMax: { type: SchemaType.STRING, description: 'ISO 8601 fim (ex: 2026-08-06T23:59:59Z)' },
          },
          required: ['timeMin', 'timeMax'],
        },
      },
      {
        name: 'bookAppointment',
        description: 'Confirma um agendamento no horário solicitado pelo paciente.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            patientPhone: { type: SchemaType.STRING, description: 'Número do paciente (ex: 5511999999999)' },
            startDateTime: { type: SchemaType.STRING, description: 'ISO 8601 data/hora de agendamento' },
          },
          required: ['patientPhone', 'startDateTime'],
        },
      },
    ];
  }

  /**
   * Processa a mensagem do paciente usando o Gemini e suas ferramentas.
   */
  async processMessage(phone: string, textMessage: string): Promise<string> {
    if (!this.genAI) {
      return 'Desculpe, o sistema de agendamento por IA está inativo no momento (apiKey faltando).';
    }

    // 1. Busca paciente e contexto de chat
    let patient = await patientService.getPatientByPhone(phone);
    let session = patient ? await memoryService.getSession(patient.id) : null;

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      tools: [{ functionDeclarations: this.getTools() }],
    });

    const systemInstruction = `
      Você é a assistente virtual inteligente da Dra. Cláudia, psicóloga clínica.
      Seu objetivo é ajudar pacientes a agendarem, reagendarem ou cancelarem consultas.
      Aja de forma empática, profissional e clara.

      Informações do paciente atual:
      - Nome: ${patient?.name || 'Desconhecido'}
      - Preferências conhecidas: ${patient?.preferences || 'Nenhuma'}
      - Resumo de conversas anteriores: ${session?.contextSummary || 'Nenhum histórico recente'}

      Diretrizes:
      - Nunca invente horários livres. Sempre use a ferramenta 'listFreeSlots' para buscar a agenda real.
      - Quando encontrar horários, sugira opções de forma clara.
    `;

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: 'Entendido. Estou pronta para gerenciar os agendamentos da Dra. Cláudia.' }] },
      ],
    });

    const result = await chat.sendMessage(textMessage);
    const functionCalls = result.response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      
      if (call.name === 'listFreeSlots') {
        const { timeMin, timeMax } = call.args as { timeMin: string; timeMax: string };
        const slots = await calendarService.listFreeSlots(timeMin, timeMax);
        
        // Envia o resultado da função de volta para o modelo gerar a resposta final
        const followUp = await chat.sendMessage([
          {
            functionResponse: {
              name: 'listFreeSlots',
              response: { slots },
            },
          },
        ]);
        return followUp.response.text();
      }

      if (call.name === 'bookAppointment') {
        const { patientPhone, startDateTime } = call.args as { patientPhone: string; startDateTime: string };
        
        if (!patient) {
          return 'Vi que você ainda não está cadastrado. Por favor, envie seu nome e e-mail para que possamos agendar.';
        }

        const eventId = await calendarService.bookAppointment(
          `Consulta - ${patient.name}`,
          `Agendamento automático via WhatsApp. Contato: ${patientPhone}`,
          startDateTime
        );

        const success = eventId !== null;

        const followUp = await chat.sendMessage([
          {
            functionResponse: {
              name: 'bookAppointment',
              response: { success, eventId },
            },
          },
        ]);
        return followUp.response.text();
      }
    }

    return result.response.text();
  }
}

export const agentService = new AgentService();
