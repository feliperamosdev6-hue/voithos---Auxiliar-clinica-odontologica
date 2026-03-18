# GitHub Publish Guide

## Nome recomendado do repositorio
- `voithos-portfolio`

Alternativas:
- `voithos-clinic-platform`
- `voithos-desktop-healthcare`

## Descricao curta para o GitHub
Plataforma desktop para gestao de clinica odontologica com Electron, backend modular, autenticacao, agenda operacional e engine dedicado de WhatsApp.

## Topicos recomendados
- electron
- nodejs
- javascript
- typescript
- express
- prisma
- desktop-app
- healthcare
- clinic-management
- whatsapp
- bullmq
- portfolio

## Telas recomendadas para screenshots
Escolha de 4 a 6 telas fortes:
- `index.html`
- `agenda-dia.html`
- `agendamentos.html`
- `prontuario.html`
- `gestao.html`
- `comunicacao.html`
- opcional: `login.html`

## Ordem ideal para apresentacao
1. login
2. dashboard inicial
3. agenda diaria
4. agendamentos
5. prontuario
6. gestao
7. comunicacao
8. arquitetura do projeto no README

## Checklist antes do push
- confirmar que a pasta usada e `Voithos-Portfolio`
- revisar screenshots para garantir ausencia de dados reais
- conferir `.env.example` e `.gitignore`
- validar se nao existem logs ou arquivos operacionais novos
- publicar em repositorio separado do sistema original

## Comandos de Git
Execute dentro de `C:\Users\niste\OneDrive\Desktop\Voithos-Portfolio`:

```powershell
git init
git add .
git commit -m "Initial public portfolio release"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/voithos-portfolio.git
git push -u origin main
```

## Observacao importante
Nunca rode esses comandos dentro da pasta do sistema operacional original.
Sempre publique apenas a copia separada de portfolio.
