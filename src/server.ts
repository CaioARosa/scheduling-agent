import app from './app.js';
import { config } from './config/unifiedConfig.js';

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`[Server]: Executando em modo ${config.server.env} na porta ${PORT}`);
});
