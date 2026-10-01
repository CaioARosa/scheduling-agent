import { PrismaClient, Patient } from '@prisma/client';

const prisma = new PrismaClient();

export class PatientRepository {
  async findByPhone(phone: string): Promise<Patient | null> {
    return prisma.patient.findUnique({
      where: { phone },
    });
  }

  async create(data: { name: string; phone: string; email: string; observations?: string; preferences?: string }): Promise<Patient> {
    return prisma.patient.create({
      data,
    });
  }

  async updateObservations(id: string, observations: string): Promise<Patient> {
    return prisma.patient.update({
      where: { id },
      data: { observations },
    });
  }

  async updatePreferences(id: string, preferences: string): Promise<Patient> {
    return prisma.patient.update({
      where: { id },
      data: { preferences },
    });
  }
}
