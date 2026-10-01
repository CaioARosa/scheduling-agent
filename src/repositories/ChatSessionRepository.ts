import { PrismaClient, ChatSession } from '@prisma/client';

const prisma = new PrismaClient();

export class ChatSessionRepository {
  async findByPatientId(patientId: string): Promise<ChatSession | null> {
    return prisma.chatSession.findFirst({
      where: { patientId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsert(patientId: string, data: { contextSummary?: string; currentState: string }): Promise<ChatSession> {
    const existing = await this.findByPatientId(patientId);
    if (existing) {
      return prisma.chatSession.update({
        where: { id: existing.id },
        data,
      });
    }
    return prisma.chatSession.create({
      data: {
        patientId,
        contextSummary: data.contextSummary,
        currentState: data.currentState,
      },
    });
  }
}
