import { google } from 'googleapis';
import { config } from '../config/unifiedConfig.js';

export interface BusinessHoursConfig {
  startHour: number;
  endHour: number;
  slotDurationMinutes: number;
  workingDays: number[]; // 0 = Dom, 1 = Seg, ..., 6 = Sab
  lunchBreak?: { startHour: number; endHour: number };
  timeZone: string;
  minNoticeMinutes: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  startHour: 8,
  endHour: 18,
  slotDurationMinutes: 60,
  workingDays: [1, 2, 3, 4, 5],
  lunchBreak: { startHour: 12, endHour: 13 },
  timeZone: 'America/Sao_Paulo',
  minNoticeMinutes: 60,
};

export class CalendarService {
  private calendar;

  constructor() {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: config.google.refreshToken,
    });

    this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Consulta os blocos de horário ocupados via freebusy ou events.list no Google Calendar.
   */
  async getBusySlots(timeMin: string, timeMax: string): Promise<{ start: string; end: string }[]> {
    try {
      const response = await this.calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone: DEFAULT_BUSINESS_HOURS.timeZone,
          items: [{ id: config.google.calendarId }],
        },
      });

      const busyItems = response.data.calendars?.[config.google.calendarId]?.busy || [];
      return busyItems
        .map(b => ({
          start: b.start || '',
          end: b.end || '',
        }))
        .filter(b => b.start && b.end);
    } catch (error) {
      console.warn('Falha na consulta freebusy.query, utilizando fallback events.list:', error);
      try {
        const response = await this.calendar.events.list({
          calendarId: config.google.calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
        });

        const items = response.data.items || [];
        return items
          .filter(e => e.status !== 'cancelled' && e.transparency !== 'transparent')
          .map(e => ({
            start: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00-03:00` : ''),
            end: e.end?.dateTime || (e.end?.date ? `${e.end.date}T23:59:59-03:00` : ''),
          }))
          .filter(slot => slot.start && slot.end);
      } catch (listError) {
        console.error('Falha ao listar eventos ocupados do Google Calendar:', listError);
        return [];
      }
    }
  }

  /**
   * Cruza o intervalo solicitado com o horário de atendimento e os blocos ocupados,
   * deduzindo e retornando as lacunas disponíveis no formato ISO 8601.
   */
  calculateFreeSlots(
    timeMin: string,
    timeMax: string,
    busySlots: { start: string; end: string }[],
    businessConfig: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS
  ): string[] {
    const minDate = new Date(timeMin);
    const maxDate = new Date(timeMax);
    const minAllowedTime = Date.now() + businessConfig.minNoticeMinutes * 60 * 1000;

    const busyIntervals = busySlots.map(b => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));

    const availableSlots: string[] = [];
    const current = new Date(minDate);
    current.setHours(0, 0, 0, 0);

    while (current <= maxDate) {
      const dateStr = current.toLocaleDateString('en-CA', { timeZone: businessConfig.timeZone });
      const dayOfWeek = new Date(`${dateStr}T12:00:00-03:00`).getDay();

      if (businessConfig.workingDays.includes(dayOfWeek)) {
        for (let hour = businessConfig.startHour; hour < businessConfig.endHour; hour++) {
          if (
            businessConfig.lunchBreak &&
            hour >= businessConfig.lunchBreak.startHour &&
            hour < businessConfig.lunchBreak.endHour
          ) {
            continue;
          }

          const padHour = String(hour).padStart(2, '0');
          const slotStart = new Date(`${dateStr}T${padHour}:00:00-03:00`);
          const slotEnd = new Date(slotStart.getTime() + businessConfig.slotDurationMinutes * 60 * 1000);

          const slotStartMs = slotStart.getTime();
          const slotEndMs = slotEnd.getTime();

          if (slotStartMs < minDate.getTime() || slotEndMs > maxDate.getTime()) {
            continue;
          }

          if (slotStartMs < minAllowedTime) {
            continue;
          }

          const hasConflict = busyIntervals.some(busy => slotStartMs < busy.end && slotEndMs > busy.start);

          if (!hasConflict) {
            availableSlots.push(`${dateStr}T${padHour}:00:00-03:00`);
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return availableSlots;
  }

  /**
   * Lista horários livres buscando conflitos no calendário principal.
   */
  async listFreeSlots(timeMin: string, timeMax: string): Promise<string[]> {
    const busySlots = await this.getBusySlots(timeMin, timeMax);
    return this.calculateFreeSlots(timeMin, timeMax, busySlots);
  }

  /**
   * Cria um agendamento no Google Calendar.
   */
  async bookAppointment(summary: string, description: string, startDateTime: string): Promise<string | null> {
    try {
      const cleanDateTime = startDateTime.trim().split(' ')[0];
      const start = new Date(cleanDateTime);
      const end = new Date(start.getTime() + DEFAULT_BUSINESS_HOURS.slotDurationMinutes * 60 * 1000);

      const event = await this.calendar.events.insert({
        calendarId: config.google.calendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: start.toISOString(), timeZone: DEFAULT_BUSINESS_HOURS.timeZone },
          end: { dateTime: end.toISOString(), timeZone: DEFAULT_BUSINESS_HOURS.timeZone },
        },
      });

      return event.data.id || null;
    } catch (e) {
      console.error('Falha ao criar evento no Google Calendar:', e);
      return null;
    }
  }

  /**
   * Remove um agendamento do Google Calendar.
   */
  async deleteAppointment(eventId: string): Promise<boolean> {
    try {
      await this.calendar.events.delete({
        calendarId: config.google.calendarId,
        eventId,
      });
      return true;
    } catch (e) {
      console.error('Falha ao deletar evento no Google Calendar:', e);
      return false;
    }
  }
}

export const calendarService = new CalendarService();
