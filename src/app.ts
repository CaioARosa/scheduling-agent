import express from 'express';
import webhookRoutes from './routes/webhookRoutes.js';

const app = express();

app.use(express.json());

// Registro de rotas
app.use('/webhook', webhookRoutes);

// Rota de status simples
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

export default app;
