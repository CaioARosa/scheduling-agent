import { PatientRepository } from '../repositories/PatientRepository.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { Patient } from '@prisma/client';

export class PatientService {
  constructor(private readonly patientRepository: PatientRepository) {}

  async getPatientByPhone(phone: string): Promise<Patient | null> {
    const patient = await this.patientRepository.findByPhone(phone);
    if (patient) {
      if (patient.observations) {
        try {
          patient.observations = decrypt(patient.observations);
        } catch (e) {
          console.error('Falha ao descriptografar observações do paciente:', e);
        }
      }
      if (patient.preferences) {
        try {
          patient.preferences = decrypt(patient.preferences);
        } catch (e) {
          console.error('Falha ao descriptografar preferências do paciente:', e);
        }
      }
    }
    return patient;
  }

  async registerPatient(
    name: string,
    phone: string,
    email: string,
    rawObservations?: string,
    rawPreferences?: string
  ): Promise<Patient> {
    const encryptedObservations = rawObservations ? encrypt(rawObservations) : undefined;
    const encryptedPreferences = rawPreferences ? encrypt(rawPreferences) : undefined;
    return this.patientRepository.create({
      name,
      phone,
      email,
      observations: encryptedObservations,
      preferences: encryptedPreferences,
    });
  }

  async updatePatientPreferences(id: string, rawPreferences: string): Promise<Patient> {
    const encryptedPreferences = encrypt(rawPreferences);
    return this.patientRepository.updatePreferences(id, encryptedPreferences);
  }
}
export const patientService = new PatientService(new PatientRepository());
