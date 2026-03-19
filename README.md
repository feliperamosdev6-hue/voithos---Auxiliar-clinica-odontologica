# Voithós

Plataforma desktop em desenvolvimento para gestão de clínicas odontológicas, com foco em agenda operacional, prontuário, atendimento, autenticação e integração dedicada com WhatsApp.

## Resumo rápido
A Voithós foi estruturada para centralizar os principais fluxos operacionais de uma clínica em uma única experiência: agenda, pacientes, prontuário, configurações, gestão e comunicação. Esta versão pública foi preparada como portfolio técnico, preservando a arquitetura e a profundidade funcional sem expor dados ou ambiente operacional real.

## Por que este projeto se destaca
- produto com escopo real e orientado à operação, não apenas uma interface isolada
- arquitetura separada entre desktop, IPC, backend principal e engine de mensageria
- organização por domínio, reduzindo acoplamento entre interface e regra de negócio
- preocupação prática com publicação segura, segredos e sanitização de ambiente
- demonstração visual com fluxos reais da aplicação e do WhatsApp NG

## Problema
A rotina de uma clínica odontológica costuma ficar fragmentada entre agenda, comunicação, cadastro de pacientes, prontuário e gestão administrativa. A proposta da Voithós é centralizar esses fluxos em uma única plataforma operacional, reduzindo fricção no atendimento, melhorando a organização da recepção e aumentando visibilidade sobre a rotina da clínica.

## Demo visual
### Login e controle de acesso
Tela inicial com autenticação voltada ao uso interno da clínica e entrada controlada no fluxo operacional.
![Login](docs/screenshots/01-login.png)

### Dashboard operacional da clínica
Visão inicial consolidada para orientar a operação diária e destacar informações de contexto rápido.
![Dashboard](docs/screenshots/02-dashboard.gif)

### Agenda diária com foco em operação
Interface pensada para a rotina de recepção e acompanhamento dos compromissos do dia.
![Agenda diária](docs/screenshots/03-agenda-dia.gif)

### Gestão de agendamentos
Fluxo dedicado para organizar marcações, atualizações e acompanhamento da agenda da clínica.
![Agendamentos](docs/screenshots/04-agendamentos.png)

### Prontuário e histórico do paciente
Área voltada a concentrar dados clínicos, histórico e contexto de atendimento do paciente.
![Prontuário](docs/screenshots/06-prontuario.gif)

### Painel de gestão
Tela administrativa com foco em acompanhamento operacional e visibilidade gerencial.
![Gestão](docs/screenshots/09-gestao.gif)

### Configurações do sistema
Área de parametrização para ajustar regras, dados e configurações do ambiente da clínica.
![Configurações](docs/screenshots/07-configuracoes.gif)

### Cadastro de novo paciente
Fluxo de entrada de novos pacientes com foco em organização cadastral e continuidade do atendimento.
![Cadastro de novo paciente](docs/screenshots/08-cadastro-paciente.gif)

### WhatsApp NG e login operacional
Entrada dedicada para o painel do engine de mensageria, reforçando a separação entre a plataforma principal e a camada operacional de comunicação.
![WhatsApp NG login](docs/screenshots/10-whatsapp-ng-login.jpeg)

### WhatsApp NG e dashboard de mensageria
Visão do painel do engine responsável por conexão, monitoramento e operação da camada de WhatsApp, um dos diferenciais técnicos da arquitetura.
![WhatsApp NG dashboard](docs/screenshots/11-whatsapp-ng-dashboard.gif)

## O que este projeto demonstra
- modelagem de um produto real para contexto de saúde
- organização de código por responsabilidade e por domínio
- separação entre shell desktop, interface, backend e integrações
- preocupação prática com autenticação, segredos e publicação segura
- estrutura preparada para evolução de produto e modularização progressiva

## Arquitetura
### Visão resumida
```text
Electron UI
  -> preload bridge
    -> IPC handlers
      -> services/shared
        -> backend principal
        -> whatsapp-engine
```

### Estrutura principal
- `main.js`: orquestração da aplicação Electron
- `preload.js`: ponte controlada entre renderer e backend local
- `ipc/`: handlers por domínio usados na aplicação desktop
- `backend/src/`: API, controladores, middlewares, repositórios e serviços
- `services/` e `shared/`: regras de negócio e adaptadores reutilizáveis
- `whatsapp-engine/`: serviço isolado de mensageria e integração
- `prisma/`: modelo de dados do backend principal

## Decisões técnicas que fortalecem a base
### Electron como shell da aplicação
A escolha por Electron atende ao objetivo de entregar uma experiência desktop única para operação interna, com distribuição simplificada e acesso controlado aos recursos locais da aplicação.

### Separação entre UI, IPC e backend
A base evita concentrar toda a regra de negócio na interface. A camada de IPC faz a ponte entre a UI e os serviços, enquanto backend e módulos compartilhados concentram responsabilidades de domínio.

### Motor de mensageria isolado
A integração de WhatsApp foi separada em um serviço próprio para reduzir acoplamento, facilitar evolução técnica e manter preocupações operacionais fora do fluxo principal da interface.

### Sanitização para portfolio público
A versão publicada foi separada do sistema operacional original. Segredos, logs, sessões, bancos locais e dados operacionais foram removidos ou substituídos por placeholders para evitar exposição indevida.

## Módulos de maior valor no portfolio
### Agenda e operação diária
Fluxos de agenda diária, agenda mensal e gerenciamento de agendamentos com foco em uso operacional real.

### Pacientes e prontuário
Cadastro, histórico, documentos e dados clínicos organizados em torno da jornada do paciente.

### Autenticação e perfis
Controle de acesso, perfis de usuário e isolamento de responsabilidades administrativas e clínicas.

### Comunicação e automação
Camada de comunicação voltada a confirmações, mensagens e integrações operacionais.

### Financeiro e gestão
Módulos para acompanhamento de rotinas administrativas e indicadores operacionais.

## Stack técnica
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

<<<<<<< HEAD
## Execucao
Esta copia publica foi preparada com foco em avaliacao tecnica. O setup completo depende de variaveis de ambiente e servicos auxiliares definidos em `.env.example`.
=======
## Como eu leria este projeto em uma avaliação técnica
- há preocupação real com produto, não apenas com interface
- a arquitetura comunica critério de separação de responsabilidades
- o projeto demonstra amplitude funcional e profundidade suficiente para discussão técnica séria
- o cuidado com sanitização pública indica maturidade profissional

## Modo de demonstração
Esta cópia inclui uma entrada ilustrativa em `demo.html`, com perfis simulados e sessão em `localStorage`, para apresentar o produto sem depender de login real nem de ambiente operacional completo.

Perfis disponíveis:
- admin
- recepção
- dentista

## Execução
Esta cópia pública foi preparada com foco em avaliação técnica. O setup completo depende de variáveis de ambiente e serviços auxiliares definidos em `.env.example`.
>>>>>>> 3d3f380 (Polish README Portuguese and recruiter-facing copy)

Comandos principais presentes no projeto:
- app desktop: `npm start`
- backend principal: `npm run backend:start`
- engine de mensageria: ver scripts em `whatsapp-engine/package.json`

## Transparência sobre uso de IA
Este projeto foi desenvolvido com apoio de ferramentas de IA para acelerar partes do processo, especialmente revisão textual, estruturação de documentação, refinamento de apresentação e apoio pontual na iteração técnica. A concepção do produto, as decisões de arquitetura, a condução da implementação e a curadoria final do repositório permaneceram sob direção autoral humana.

## Observação
Este repositório representa uma versão de portfolio de um sistema em evolução. Ele foi curado para demonstrar estrutura de produto, decisão técnica e maturidade de implementação sem comprometer segurança operacional.

