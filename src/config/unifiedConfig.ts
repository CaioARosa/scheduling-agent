import dotenv from 'dotenv';
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || '',
  },
  whatsapp: {
    apiUrl: process.env.EVOLUTION_API_URL || '',
    apiKey: process.env.EVOLUTION_API_KEY || '',
    instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'psicologa',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },
};
