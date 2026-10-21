# Scheduling Agent · Assistente Virtual de Agendamento (`scheduling-agent`)

Microsserviço backend de agendamento inteligente movido a IA Generativa (Google Gemini), integrado ao **WhatsApp (Evolution API)** e ao **Google Calendar**. Este projeto atua como o **agente agendador conversacional** dentro do ecossistema do [**`psico-hub-web`**](https://github.com/CaioARosa/psico-hub-web), automatizando o atendimento de pacientes via WhatsApp com verificação de agenda em tempo real, memória contínua de longo prazo e criptografia de ponta a ponta em repouso (`AES-256-GCM`) para proteção de dados sensíveis (LGPD).

---

## Sumário

- [Visão Geral e Funcionalidades](#visão-geral-e-funcionalidades)
- [Papel no Ecossistema `psico-hub-web`](#papel-no-ecossistema-psico-hub-web)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos](#pré-requisitos)
- [Começando (Desenvolvimento Local)](#começando-desenvolvimento-local)
  - [1. Clonar o Repositório](#1-clonar-o-repositório)
  - [2. Instalar Dependências](#2-instalar-dependências)
  - [3. Configurar Variáveis de Ambiente](#3-configurar-variáveis-de-ambiente)
  - [4. Iniciar Banco de Dados e Evolution API (Docker)](#4-iniciar-banco-de-dados-e-evolution-api-docker)
  - [5. Executar Migrações do Prisma](#5-executar-migrações-do-prisma)
  - [6. Iniciar o Servidor de Desenvolvimento](#6-iniciar-o-servidor-de-desenvolvimento)
  - [7. Configurar o Webhook na Evolution API](#7-configurar-o-webhook-na-evolution-api)
- [Arquitetura do Sistema](#arquitetura-do-sistema)
  - [Estrutura de Diretórios](#estrutura-de-diretórios)
  - [Ciclo de Vida da Requisição](#ciclo-de-vida-da-requisição)
  - [Fluxo de Dados e Orquestração](#fluxo-de-dados-e-orquestração)
  - [Componentes Principais](#componentes-principais)
  - [Modelagem do Banco de Dados (Database Schema)](#modelagem-do-banco-de-dados-database-schema)
  - [Endpoints da API](#endpoints-da-api)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
  - [Obrigatórias e Opcionais](#obrigatórias-e-opcionais)
  - [Como Gerar a Chave de Criptografia (`ENCRYPTION_KEY`)](#como-gerar-a-chave-de-criptografia-encryption_key)
  - [Configuração das Credenciais OAuth2 do Google Calendar](#configuração-das-credenciais-oauth2-do-google-calendar)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Testando Localmente (Simulação de Webhook)](#testando-localmente-simulação-de-webhook)
- [Deploy em Produção](#deploy-em-produção)
  - [Build e Execução Nativa (Node.js / Render / Railway)](#build-e-execução-nativa-nodejs--render--railway)
  - [Deploy com Docker e VPS](#deploy-com-docker-e-vps)
  - [Checklist de Produção e Segurança (LGPD)](#checklist-de-produção-e-segurança-lgpd)
- [Solução de Problemas (Troubleshooting)](#solução-de-problemas-troubleshooting)

---

## Visão Geral e Funcionalidades

- **Atendimento Conversacional com Function Calling**: Utiliza o modelo `gemini-1.5-flash` com declaração nativa de ferramentas (`listFreeSlots` e `bookAppointment`) para consultar a agenda real e confirmar reservas sem alucinar horários.
- **Motor Inteligente de Disponibilidade**: Cruza blocos ocupados do Google Calendar (`freebusy.query` com fallback automático para `events.list`) contra regras de expediente configuráveis (dias úteis, horário comercial, intervalo de almoço, duração da sessão e antecedência mínima).
- **Memória Híbrida Assíncrona (Semântica + Episódica)**: Após cada interação, consolida em segundo plano o resumo da conversa (`contextSummary`) e extrai preferências permanentes do paciente (`preferences`, como dias, turnos ou modalidade preferida) para personalizar atendimentos futuros.
- **Proteção de Dados Sensíveis (LGPD)**: Anotações clínicas (`observations`) e preferências do paciente (`preferences`) são criptografadas na camada de aplicação com **AES-256-GCM** antes de serem persistidas no PostgreSQL.
- **Política de Cancelamento e Reagendamento**: Validação determinística de janela mínima de **24 horas** (`PolicyService`) para modificações de consultas.
- **Modo Simulação de WhatsApp**: Caso a Evolution API não esteja configurada no ambiente de desenvolvimento, o `WhatsappService` opera em modo seguro registrando as mensagens enviadas diretamente no console.

---

## Papel no Ecossistema `psico-hub-web`

Dentro da plataforma **Psico Hub Web**, o paciente conta com duas frentes integradas ao mesmo Google Calendar da profissional:

```
                   ┌──────────────────────────────────────┐
                   │        Google Calendar API v3        │
                   │     (Agenda Única da Psicóloga)      │
                   └──────────────────┬───────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          psico-hub-web          │       │        scheduling-agent         │
│   (Landing Page & Widget Web)   │       │  (Agente IA via WhatsApp Bot)   │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ • Escolha visual de data/hora   │       │ • Atendimento em linguagem      │
│ • Redireciona ao WhatsApp com   │──────▶│   natural 24/7 no WhatsApp      │
│   mensagem pré-formatada        │       │ • Memória episódica e semântica │
│ • Bio Links & Gerador de Story  │       │ • PostgreSQL + Prisma + AES-256 │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

Quando o paciente inicia o contato pelo WhatsApp (diretamente ou vindo do botão de agendamento do `psico-hub-web`), o `scheduling-agent` recebe o webhook da Evolution API, identifica o histórico do paciente, verifica os horários livres reais no Google Calendar e conduz o agendamento até a confirmação.

---

## Tecnologias Utilizadas

- **Linguagem**: [TypeScript 5.4+](https://www.typescriptlang.org/) (`ES2022`, `NodeNext`)
- **Runtime**: [Node.js 20+](https://nodejs.org/) (com `tsx` para *hot-reload* em desenvolvimento)
- **Framework HTTP**: [Express 4.19+](https://expressjs.com/)
- **Inteligência Artificial**: [Google Generative AI SDK](https://ai.google.dev/) (`@google/generative-ai` — modelo `gemini-1.5-flash`)
- **Banco de Dados**: [PostgreSQL 15](https://www.postgresql.org/)
- **ORM**: [Prisma 5.12+](https://www.prisma.io/) (`@prisma/client`)
- **Integração WhatsApp**: [Evolution API](https://doc.evolution-api.com/) + [Axios](https://axios-http.com/)
- **Integração de Agenda**: [Google APIs Client Library](https://github.com/googleapis/google-api-nodejs-client) (`googleapis` v134+ via OAuth2)
- **Validação de Dados**: [Zod 3.22+](https://zod.dev/)
- **Segurança & Criptografia**: Módulo nativo `crypto` do Node.js (`aes-256-gcm` + `scryptSync`)
- **Containerização**: Docker & Docker Compose (`postgres:15-alpine` + `evoapicloud/evolution-api:latest`)

---

## Pré-requisitos

Certifique-se de ter instalado em sua máquina antes de começar:

- **Node.js**: `v20.x` ou superior
- **npm**: `v10.x` ou superior
- **Docker** e **Docker Compose**: para executar o PostgreSQL e a Evolution API localmente (opcional caso já possua ambos rodando externamente)
- **Chave de API do Google Gemini**: obtida no [Google AI Studio](https://aistudio.google.com/)
- **Credenciais OAuth2 do Google Cloud**: projeto com a *Google Calendar API* ativada

---

## Começando (Desenvolvimento Local)

### 1. Clonar o Repositório

```bash
git clone https://github.com/CaioARosa/scheduling-agent.git
cd scheduling-agent
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo `.env.example` para `.env`:

```bash
cp .env.example .env
```

> **Atenção às credenciais do Docker Compose**: O arquivo `docker-compose.yml` cria o banco PostgreSQL com usuário `admin` e senha `supersecretpassword`, e a Evolution API com a chave `myevolutionapikey123`. Ajuste seu `.env` para refletir esses valores caso utilize os containers locais:

```dotenv
PORT=3000
NODE_ENV=development

# Credenciais correspondentes ao docker-compose.yml
DATABASE_URL="postgresql://admin:supersecretpassword@localhost:5432/scheduling_db?schema=public"

# Google Gemini API
GEMINI_API_KEY="sua_chave_gemini_aqui"

# Chave de Criptografia Simétrica (AES-256-GCM)
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Integração Evolution API (WhatsApp)
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_KEY="myevolutionapikey123"
EVOLUTION_INSTANCE_NAME="psicologa"

# Google Calendar (OAuth2)
GOOGLE_CLIENT_ID="seu_client_id_google_aqui"
GOOGLE_CLIENT_SECRET="seu_client_secret_google_aqui"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth2callback"
GOOGLE_REFRESH_TOKEN="seu_refresh_token_google_aqui"
GOOGLE_CALENDAR_ID="primary"
```

### 4. Iniciar Banco de Dados e Evolution API (Docker)

Suba os containers do PostgreSQL (porta `5432`) e da Evolution API (porta `8080`) em background:

```bash
docker compose up -d
```

Verifique se os containers estão saudáveis:

```bash
docker compose ps
```

Saída esperada:
```text
NAME                       IMAGE                             STATUS          PORTS
scheduling_evolution_api   evoapicloud/evolution-api:latest  Up              0.0.0.0:8080->8080/tcp
scheduling_postgres        postgres:15-alpine                Up              0.0.0.0:5432->5432/tcp
```

### 5. Executar Migrações do Prisma

Gere o Prisma Client tipado e aplique o schema no banco de dados PostgreSQL:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Quando solicitado pelo Prisma um nome para a migração inicial (caso a pasta `prisma/migrations` ainda não exista), informe `init`.

### 6. Iniciar o Servidor de Desenvolvimento

```bash
npm run dev
```

Saída esperada no terminal:
```text
[Server]: Executando em modo development na porta 3000
```

Valide se o servidor está respondendo consultando a rota de *health check*:

```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{"status":"ok","timestamp":"2026-10-21T12:00:00.000Z"}
```

### 7. Configurar o Webhook na Evolution API

Com a Evolution API rodando em `http://localhost:8080`:

1. Crie uma instância com o nome configurado em `EVOLUTION_INSTANCE_NAME` (padrão: `psicologa`) e conecte o WhatsApp via QR Code.
2. Configure o Webhook da instância para enviar eventos `MESSAGES_UPSERT` para:
   - **Se a Evolution API estiver no Docker e o agente no host**: `http://host.docker.internal:3000/webhook/whatsapp`
   - **Se ambos estiverem na mesma máquina física**: `http://localhost:3000/webhook/whatsapp`

---

## Arquitetura do Sistema

### Estrutura de Diretórios

```text
scheduling-agent/
├── prisma/
│   └── schema.prisma                  # Modelos de dados (Patient, Appointment, ChatSession)
├── src/
│   ├── config/
│   │   └── unifiedConfig.ts           # Centralizador tipado de variáveis de ambiente
│   ├── controllers/
│   │   ├── BaseController.ts          # Classe base com padronização de respostas HTTP e erros
│   │   └── WebhookController.ts       # Recepção de webhooks da Evolution API e orquestração
│   ├── repositories/
│   │   ├── ChatSessionRepository.ts   # Persistência e upsert de sessões de conversa
│   │   └── PatientRepository.ts       # CRUD de pacientes no PostgreSQL via Prisma
│   ├── routes/
│   │   └── webhookRoutes.ts           # Definição da rota POST /webhook/whatsapp
│   ├── services/
│   │   ├── agentService.ts            # Integração Gemini 1.5 Flash + Function Calling
│   │   ├── calendarService.ts         # Cálculo de horários livres e CRUD no Google Calendar
│   │   ├── memoryService.ts           # Consolidação assíncrona de memória semântica e episódica
│   │   ├── patientService.ts          # Regras de paciente com criptografia/descriptografia transparente
│   │   ├── policyService.ts           # Validação da janela de 24h para cancelamento/reagendamento
│   │   └── whatsappService.ts         # Disparo de mensagens via Evolution API (com fallback em console)
│   ├── utils/
│   │   └── crypto.ts                  # Funções encrypt/decrypt com AES-256-GCM e scryptSync
│   ├── validators/
│   │   └── webhook.schema.ts          # Schema Zod para validação do payload da Evolution API
│   ├── app.ts                         # Configuração do Express, middlewares e rotas (/webhook, /health)
│   └── server.ts                      # Entrypoint HTTP da aplicação
├── .env.example                       # Modelo de variáveis de ambiente
├── docker-compose.yml                 # Orquestração local do PostgreSQL 15 e Evolution API
├── package.json                       # Dependências e scripts npm
└── tsconfig.json                      # Configuração do compilador TypeScript (ES2022 / NodeNext)
```

### Ciclo de Vida da Requisição

1. **Recebimento do Evento**: O paciente envia uma mensagem pelo WhatsApp. A Evolution API dispara um `POST /webhook/whatsapp` contendo o payload do evento.
2. **Extração e Sanitização**: O `WebhookController` extrai o telefone do remetente (`remoteJid` sem `@s.whatsapp.net`) e o conteúdo textual (`conversation` ou `extendedTextMessage.text`). Mensagens sem texto são ignoradas com HTTP `200`.
3. **Recuperação de Contexto**: O `AgentService` consulta o `PatientService` (descriptografando automaticamente `observations` e `preferences` via AES-256-GCM) e o `MemoryService` (recuperando o `contextSummary` da última `ChatSession`).
4. **Inferência e Function Calling**: O prompt de sistema com o contexto do paciente é enviado ao `gemini-1.5-flash`:
   - Se o paciente pergunta sobre horários disponíveis, o Gemini invoca a tool `listFreeSlots(timeMin, timeMax)`, que aciona o `CalendarService` no Google Calendar e retorna apenas os horários livres dentro do expediente.
   - Se o paciente solicita a confirmação de um horário, o Gemini invoca a tool `bookAppointment(patientPhone, startDateTime)`, que cria o evento no Google Calendar caso o paciente já possua cadastro.
5. **Envio de Resposta**: O texto final gerado pelo Gemini é enviado ao paciente no WhatsApp através do `WhatsappService` (com presença `composing` e delay humanizado de `1200ms`).
6. **Consolidação de Memória em Background**: De forma assíncrona (sem bloquear a resposta HTTP do webhook), o `MemoryService.consolidateSessionMemory` analisa os turnos da conversa com o Gemini, mescla novas preferências permanentes do paciente (criptografando-as no banco) e atualiza o resumo episódico da sessão (`currentState = 'IDLE'`).

### Fluxo de Dados e Orquestração

```text
[Paciente no WhatsApp]
          │
          ▼ (Mensagem recebida)
[Evolution API] ── POST /webhook/whatsapp ──▶ [WebhookController]
                                                      │
         ┌────────────────────────────────────────────┼───────────────────────────────────────────┐
         ▼ (1. Processamento Síncrono)                ▼ (2. Resposta)                             ▼ (3. Background Assíncrono)
  [AgentService]                              [WhatsappService]                            [MemoryService]
         │                                            │                                           │
         ├──▶ [PatientService] (Decrypt AES-256)      └──▶ POST /message/sendText/{instance}      ├──▶ Gemini 1.5 Flash (Extrai JSON)
         ├──▶ [MemoryService]  (Contexto Episódico)                                               ├──▶ Atualiza Preferências (Encrypt)
         └──▶ [Gemini 1.5 Flash + Tools]                                                          └──▶ Atualiza Resumo na ChatSession
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
  listFreeSlots()       bookAppointment()
         │                     │
         └──────────┬──────────┘
                    ▼
           [CalendarService]
                    │
                    ▼
         [Google Calendar API]
```

### Componentes Principais

#### 1. Motor de Agenda e Cálculo de Slots (`src/services/calendarService.ts`)
- **Consulta de Conflitos (`getBusySlots`)**: Consulta primariamente a API `calendar.freebusy.query`. Caso ocorra qualquer falha de permissão ou indisponibilidade, executa fallback automático para `calendar.events.list` (filtrando eventos cancelados ou transparentes).
- **Regras de Expediente Padrão (`DEFAULT_BUSINESS_HOURS`)**:
  - **Horário de funcionamento**: `08:00` às `18:00`
  - **Pausa para almoço**: `12:00` às `13:00`
  - **Dias úteis**: Segunda a Sexta-feira (`[1, 2, 3, 4, 5]`)
  - **Duração de cada sessão**: `60 minutos`
  - **Antecedência mínima (`minNoticeMinutes`)**: `60 minutos` a partir do horário atual
  - **Fuso horário**: `America/Sao_Paulo` (`-03:00`)

#### 2. Criptografia em Repouso (`src/utils/crypto.ts` & `src/services/patientService.ts`)
- Utiliza o algoritmo autenticado **`aes-256-gcm`**.
- Deriva uma chave de 32 bytes a partir de `ENCRYPTION_KEY` usando `crypto.scryptSync(rawKey, 'salt', 32)`.
- Gera um vetor de inicialização (`IV`) aleatório de 12 bytes a cada gravação.
- Armazena o valor no formato `ivHex:authTagHex:encryptedHex`, garantindo confidencialidade e integridade contra adulteração.

#### 3. Políticas de Modificação (`src/services/policyService.ts`)
- Aplica a regra de negócio da clínica através de `canModifyAppointment(appointment)`:
  - Bloqueia alterações em agendamentos no passado (`APPOINTMENT_IN_PAST`).
  - Bloqueia cancelamentos ou reagendamentos com menos de **24 horas** de antecedência (`LESS_THAN_24H_WINDOW`).

### Modelagem do Banco de Dados (Database Schema)

Definido em `prisma/schema.prisma`:

```text
Patient
├── id             (String, PK, UUID)
├── phone          (String, Unique)          # Número do WhatsApp (ex: 5511999999999)
├── name           (String)                  # Nome completo do paciente
├── email          (String)                  # E-mail do paciente
├── observations   (String?, Nullable)       # Anotações clínicas sensíveis (Criptografado AES-256-GCM)
├── preferences    (String?, Nullable)       # JSON de preferências (Criptografado AES-256-GCM)
└── createdAt      (DateTime, default: now)

Appointment
├── id             (String, PK, UUID)
├── patientId      (String, FK -> Patient.id)
├── googleEventId  (String, Unique)          # ID do evento gerado no Google Calendar
├── dateTime       (DateTime)                # Data e hora do agendamento
├── status         (String)                  # PENDING | CONFIRMED | CANCELLED
└── reminderSentAt (DateTime?, Nullable)     # Data/hora de envio do lembrete

ChatSession
├── id             (String, PK, UUID)
├── patientId      (String, FK -> Patient.id)
├── contextSummary (String?, Nullable)       # Resumo episódico consolidado pelo Gemini
├── currentState   (String)                  # Estado do fluxo (ex: IDLE, SELECTING_TIME, CRISIS)
└── updatedAt      (DateTime, @updatedAt)
```

### Endpoints da API

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/health` | Verifica a disponibilidade do serviço e retorna o timestamp atual |
| `POST` | `/webhook/whatsapp` | Recebe os eventos de mensagens enviadas pela Evolution API |

#### Exemplo de Payload (`POST /webhook/whatsapp`)

```json
{
  "event": "messages.upsert",
  "instance": "psicologa",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "BAE5F8D9E1A2B3C4"
    },
    "message": {
      "conversation": "Olá! Quais horários estão disponíveis para amanhã à tarde?"
    }
  }
}
```

#### Exemplo de Resposta (`200 OK`)

```json
{
  "success": true,
  "data": {
    "status": "processed",
    "sender": "5511999999999",
    "textReceived": "Olá! Quais horários estão disponíveis para amanhã à tarde?",
    "replySent": "Olá! Para amanhã à tarde temos os seguintes horários disponíveis com a Dra. Cláudia: 14:00, 15:00 e 16:00. Algum desses fica bom para você?"
  }
}
```

---

## Variáveis de Ambiente

### Obrigatórias e Opcionais

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :---: | :--- | :--- |
| `PORT` | Não | `3000` | Porta HTTP onde o servidor Express será executado |
| `NODE_ENV` | Não | `development` | Ambiente de execução (`development`, `production`, `test`) |
| `DATABASE_URL` | **Sim** | - | String de conexão com o banco PostgreSQL |
| `GEMINI_API_KEY` | **Sim** | - | Chave de API do Google Gemini (Google AI Studio) |
| `ENCRYPTION_KEY` | **Sim** | - | Chave secreta usada pelo AES-256-GCM para criptografar dados sensíveis |
| `EVOLUTION_API_URL` | Não* | `""` | URL base da Evolution API (ex: `http://localhost:8080`). *Se vazio, simula no console* |
| `EVOLUTION_API_KEY` | Não* | `""` | Chave global ou da instância da Evolution API |
| `EVOLUTION_INSTANCE_NAME` | Não | `psicologa` | Nome da instância criada na Evolution API |
| `GOOGLE_CLIENT_ID` | **Sim** | - | Client ID OAuth 2.0 gerado no Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | **Sim** | - | Client Secret OAuth 2.0 gerado no Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | **Sim** | - | URI de redirecionamento autorizada (ex: `http://localhost:3000/oauth2callback` ou Playground) |
| `GOOGLE_REFRESH_TOKEN` | **Sim** | - | Refresh Token OAuth 2.0 com escopo do Google Calendar |
| `GOOGLE_CALENDAR_ID` | Não | `primary` | ID da agenda no Google Calendar (`primary` ou `xxxx@group.calendar.google.com`) |

### Como Gerar a Chave de Criptografia (`ENCRYPTION_KEY`)

Execute o comando abaixo no terminal para gerar uma chave hexadecimal criptograficamente segura de 32 bytes (64 caracteres):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie a string gerada e defina em `ENCRYPTION_KEY` no seu arquivo `.env`.

### Configuração das Credenciais OAuth2 do Google Calendar

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e selecione ou crie um projeto.
2. Em **APIs & Services > Library**, busque por **Google Calendar API** e clique em **Enable**.
3. Em **APIs & Services > Credentials**, clique em **Create Credentials > OAuth client ID** (tipo *Web application*).
4. Adicione `https://developers.google.com/oauthplayground` em **Authorized redirect URIs**.
5. Copie o **Client ID** (`GOOGLE_CLIENT_ID`) e o **Client Secret** (`GOOGLE_CLIENT_SECRET`).
6. Acesse o [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
   - Clique no ícone de engrenagem (canto superior direito), marque **Use your own OAuth credentials** e insira seu Client ID e Client Secret.
   - Na lista de escopos à esquerda, selecione `https://www.googleapis.com/auth/calendar`.
   - Clique em **Authorize APIs**, faça login com a conta Google proprietária da agenda e clique em **Exchange authorization code for tokens**.
7. Copie o valor de **`refresh_token`** retornado e cole na variável `GOOGLE_REFRESH_TOKEN` do seu `.env`.

---

## Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor em modo de desenvolvimento com *watch mode* via `tsx` |
| `npm run build` | Compila o código TypeScript (`src/`) para JavaScript na pasta `dist/` |
| `npm start` | Executa a versão compilada de produção (`node dist/server.js`) |
| `npm run prisma:generate` | Gera os artefatos de tipagem do `@prisma/client` a partir do `schema.prisma` |
| `npm run prisma:migrate` | Cria e aplica migrações do banco de dados em ambiente de desenvolvimento |
| `npx prisma studio` | Abre a interface visual do Prisma Studio em `http://localhost:5555` para inspecionar tabelas |

---

## Testando Localmente (Simulação de Webhook)

Você pode testar todo o fluxo do agente (IA + Google Calendar + Memória no PostgreSQL) sem precisar conectar um aparelho ao WhatsApp. Basta simular uma chamada da Evolution API via `curl`:

```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "psicologa",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "TEST_MSG_001"
      },
      "message": {
        "conversation": "Olá! Quais horários livres você tem para a próxima segunda-feira?"
      }
    }
  }'
```

### Cadastrando um Paciente de Teste para Agendamento Completo

Como a ferramenta `bookAppointment` exige que o paciente já esteja cadastrado no banco de dados (para vincular o nome à consulta no Google Calendar e consolidar a memória), você pode inserir um paciente inicial pelo **Prisma Studio**:

```bash
npx prisma studio
```

Acesse `http://localhost:5555`, abra o modelo **`Patient`** e adicione um registro com:
- `phone`: `5511999999999`
- `name`: `Paciente Teste`
- `email`: `paciente@exemplo.com`

---

## Deploy em Produção

### Build e Execução Nativa (Node.js / Render / Railway)

Para hospedar o `scheduling-agent` em plataformas PaaS como **Render** ou **Railway** (ao lado do backend do `psico-hub-web`):

1. Crie um banco **PostgreSQL** gerenciado na plataforma e copie a `DATABASE_URL` interna/externa.
2. Crie um novo **Web Service** conectado a este repositório GitHub.
3. Configure os comandos do serviço:
   - **Build Command**:
     ```bash
     npm install && npx prisma generate && npx prisma migrate deploy && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
4. Cadastre todas as variáveis de ambiente listadas na seção [Variáveis de Ambiente](#variáveis-de-ambiente) com `NODE_ENV=production`.
5. Configure o endpoint público gerado (ex: `https://scheduling-agent.onrender.com/webhook/whatsapp`) no painel da sua instância da Evolution API.

### Deploy com Docker e VPS

Em um servidor Linux (VPS Ubuntu/Debian) com Docker instalado:

```bash
# 1. Clonar o repositório no servidor
git clone https://github.com/CaioARosa/scheduling-agent.git
cd scheduling-agent

# 2. Configurar variáveis de produção
cp .env.example .env
nano .env

# 3. Subir PostgreSQL e Evolution API
docker compose up -d

# 4. Instalar dependências, migrar banco e compilar
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

# 5. Iniciar a aplicação (ex: via PM2)
npx pm2 start dist/server.js --name scheduling-agent
```

### Checklist de Produção e Segurança (LGPD)

- **Backup da `ENCRYPTION_KEY`**: Guarde a chave de criptografia em um cofre de segredos seguro. Caso a `ENCRYPTION_KEY` seja perdida ou alterada sem migração prévia, os campos `observations` e `preferences` já gravados no banco não poderão ser descriptografados.
- **HTTPS Obrigatório**: Exponha o endpoint `/webhook/whatsapp` exclusivamente sob TLS/HTTPS (via Nginx/Traefik, Cloudflare ou PaaS).
- **Credenciais do Docker**: Em produção, altere as senhas padrão `supersecretpassword` e `myevolutionapikey123` do arquivo `docker-compose.yml`.

---

## Solução de Problemas (Troubleshooting)

### 1. Erro de Autenticação no PostgreSQL (`Authentication failed against database server`)
- **Causa**: Divergência entre o usuário/senha padrão do `.env.example` (`postgres:postgres`) e o configurado no `docker-compose.yml` (`admin:supersecretpassword`).
- **Solução**: Atualize a variável `DATABASE_URL` no arquivo `.env` para:
  ```dotenv
  DATABASE_URL="postgresql://admin:supersecretpassword@localhost:5432/scheduling_db?schema=public"
  ```

### 2. Agente Responde que o Sistema de IA Está Inativo
- **Sintoma**: O bot responde `"Desculpe, o sistema de agendamento por IA está inativo no momento (apiKey faltando)."`
- **Causa**: A variável `GEMINI_API_KEY` está vazia ou não foi carregada no `.env`.
- **Solução**: Insira uma chave válida do Google AI Studio em `GEMINI_API_KEY` e reinicie o processo Node.js.

### 3. Erro de Descriptografia (`Formato de texto criptografado inválido` ou `Unsupported state or unable to authenticate data`)
- **Causa**: O campo `observations` ou `preferences` foi salvo no banco manualmente em texto puro (sem passar pelo `PatientService`) ou a `ENCRYPTION_KEY` atual é diferente da chave usada quando o registro foi gravado.
- **Solução**: Restaure a `ENCRYPTION_KEY` original ou limpe/regrave o campo através do método `patientService.registerPatient` / `patientService.updatePatientPreferences`.

### 4. Falha ao Consultar ou Criar Eventos no Google Calendar (`invalid_grant`)
- **Causa**: O `GOOGLE_REFRESH_TOKEN` expirou (comum quando o aplicativo OAuth no Google Cloud está em status *Testing*, onde tokens expiram em 7 dias) ou foi revogado.
- **Solução**: Mude o status da tela de consentimento OAuth no Google Cloud Console para **In production** e gere um novo `GOOGLE_REFRESH_TOKEN` com o mesmo `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

### 5. Evolution API no Docker Não Alcança o Webhook Local (`ECONNREFUSED 127.0.0.1:3000`)
- **Causa**: Dentro do container `scheduling_evolution_api`, `localhost` refere-se ao próprio container da Evolution API, e não à máquina hospedeira onde o `npm run dev` está rodando.
- **Solução**: Na configuração de webhook da Evolution API, substitua `localhost` por `host.docker.internal`:
  ```text
  http://host.docker.internal:3000/webhook/whatsapp
  ```
