import { Appointment } from '@prisma/client';

export class PolicyService {
  private readonly CANCELLATION_WINDOW_HOURS = 24;

  /**
   * Valida se uma consulta pode ser reagendada ou cancelada de acordo com as regras de prazo da clínica.
   * Retorna true se estiver em conformidade com as regras, ou false caso viole.
   */
  canModifyAppointment(appointment: Appointment): { allowed: boolean; reason?: string } {
    const now = new Date();
    const appointmentTime = new Date(appointment.dateTime);
    
    const diffInMilliseconds = appointmentTime.getTime() - now.getTime();
    const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

    if (diffInHours < 0) {
      return { allowed: false, reason: 'APPOINTMENT_IN_PAST' };
    }

    if (diffInHours < this.CANCELLATION_WINDOW_HOURS) {
      return { allowed: false, reason: 'LESS_THAN_24H_WINDOW' };
    }

    return { allowed: true };
  }
}

export const policyService = new PolicyService();
