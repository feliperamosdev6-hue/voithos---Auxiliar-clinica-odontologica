# Voithos

Voithos e uma plataforma desktop para operacao de clinicas odontologicas, desenhada para centralizar agenda, atendimento, prontuario, comunicacao e rotinas administrativas em uma unica experiencia.

Esta versao foi preparada como portfolio tecnico. O objetivo e demonstrar arquitetura, organizacao de codigo, preocupacao com seguranca e capacidade de entrega em um produto com escopo real.

## Resumo Executivo
- Aplicacao desktop com Electron para operacao diaria
- Backend dedicado para autenticacao, pacientes, agenda e automacoes
- Motor isolado de WhatsApp para mensageria e integracoes
- Organizacao modular com IPC, servicos compartilhados e camadas separadas
- Estrutura voltada a crescimento de produto, multi-modulo e evolucao operacional

## O Que Este Projeto Demonstra
- modelagem de um produto real para contexto de saude
- separacao entre shell desktop, interface, backend e integracoes
- preocupacao com autenticacao, segredos e ambientes
- organizacao por dominio em vez de codigo acoplado a tela
- integracao com servicos externos sem misturar tudo na interface

## Arquitetura
### Desktop
- `main.js`: orquestra a aplicacao Electron
- `preload.js`: expoe uma ponte controlada entre renderer e backend local
- `ipc/`: handlers por dominio para a aplicacao desktop

### Backend principal
- `backend/src/`: API, controladores, middlewares, repositorios e servicos
- `prisma/`: modelo relacional usado pelo backend principal
- `services/` e `shared/`: regras de negocio e configuracoes reutilizaveis

### Motor de mensageria
- `whatsapp-engine/`: servico separado para envio, filas, autenticacao e integracao com WhatsApp
- stack complementar com TypeScript, BullMQ, Redis, Prisma, Pino e Baileys

## Modulos de Maior Valor no Portfolio
### 1. Agenda e operacao diaria
Fluxos de agenda diaria, agenda mensal e gerenciamento de agendamentos com foco em uso operacional real.

### 2. Pacientes e prontuario
Cadastro, historico, documentos e dados clinicos organizados em torno da jornada do paciente.

### 3. Autenticacao e perfis
Controle de acesso, perfis de usuario e isolamento de responsabilidades administrativas e clinicas.

### 4. Comunicacao e automacao
Camada de comunicacao voltada a confirmacoes, mensagens e integracoes operacionais.

### 5. Financeiro e gestao
Modulos para acompanhamento de rotinas administrativas e indicadores operacionais.

## Stack Tecnica
- Electron
- Node.js
- JavaScript e TypeScript
- Express
- Prisma
- SQLite e Postgres em contextos diferentes do projeto
- BullMQ
- Redis
- Pino
- Baileys

## Estrutura do Repositorio
- `ipc/`: integracao desktop por dominio
- `backend/`: backend principal da aplicacao
- `services/`: servicos locais e regras de negocio
- `shared/`: configuracoes e adaptadores compartilhados
- `whatsapp-engine/`: servico isolado de mensageria
- `assets/`: recursos visuais da aplicacao

## Seguranca e Publicacao
Esta copia foi separada do sistema operacional original para evitar impacto no ambiente ativo.

Nesta versao publica:
- arquivos sensiveis e operacionais foram excluidos
- variaveis de ambiente foram convertidas para placeholders
- logs, sessoes, bancos locais e dados operacionais nao entram no repositorio
- o foco esta na arquitetura e na qualidade tecnica, nao na exposicao do ambiente real

Arquivos de referencia:
- `.env.example`
- `.gitignore`
- `PORTFOLIO_SCOPE.md`
- `docs/DEMO-GUIDE.md`

## Como Ler Este Projeto como Recrutador
Se voce estiver avaliando esta base como portfolio, os pontos mais relevantes sao:
- capacidade de estruturar um produto com varias camadas
- coerencia entre interface, backend e integracoes
- preocupacao pratica com seguranca e publicacao
- organizacao progressiva para evolucao futura do sistema

## Execucao
Esta copia publica foi preparada com foco em avaliacao tecnica. O setup completo depende de variaveis de ambiente e servicos auxiliares definidos em `.env.example`.

Comandos principais presentes no projeto:
- app desktop: `npm start`
- backend principal: `npm run backend:start`
- engine de mensageria: ver scripts em `whatsapp-engine/package.json`

## Screenshots
### Login
![Login](docs/screenshots/01-login.png)

### Dashboard
![Dashboard](docs/screenshots/02-dashboard.png)

### Agenda diaria
![Agenda diaria](docs/screenshots/03-agenda-dia.png)

### Agendamentos
![Agendamentos](docs/screenshots/04-agendamentos.png)

### Prontuario
![Prontuario](docs/screenshots/05-prontuario.png)

### Gestao
![Gestao](docs/screenshots/06-gestao.png)

### Configuracoes
![Configuracoes](docs/screenshots/07-configuracoes.png)

### Cadastro de novo paciente
![Cadastro de novo paciente](docs/screenshots/08-cadastro-novo-paciente.png)

## Observacao
Este repositorio representa uma versao de portfolio de um sistema em evolucao. Ele foi curado para demonstrar decisao tecnica, estrutura de produto e maturidade de implementacao sem comprometer seguranca operacional.
