# Protótipo v0.1 — estado e próximos passos

## Implementado no repositório

- [x] Alvo Android 64-bit, Geode 5.11.2 e Geometry Dash 2.2081.
- [x] Dependência Argon 1.5.1 e wrapper C++ de autenticação assíncrona.
- [x] Botão de entrada no hub pela tela principal do Geometry Dash.
- [x] Interface inicial com login GD, criar/entrar em sala, chat, ação colaborativa, Gemini e nuvem.
- [x] Cliente C++ assíncrono para as rotas HTTP do Worker.
- [x] Worker com validação Argon e sessão própria.
- [x] D1 para jogadores, sessões, conversas, mensagens e metadados de arquivos.
- [x] Gemini 3.8 Flash no servidor, usando GEMINI_API_KEY como secret.
- [x] Durable Object RPC por sala, com presença, revisões, eventos de chat e objetos JSON compartilhados.
- [x] R2 para arquivos privados por jogador e limite de aplicação de 100 MB.
- [x] Upload de uma nota de texto como primeiro teste da nuvem.
- [x] Logs e traces configurados no Worker.

## Ainda não implementado

- [ ] Provisionar D1, R2 e Worker na conta Cloudflare e preencher o database_id.
- [ ] Configurar GEMINI_API_KEY como secret no Cloudflare.
- [ ] Trocar API_BASE pelo domínio workers.dev real.
- [ ] Compilar o mod para Android e corrigir os erros encontrados.
- [ ] Testar login real com Argon e autenticação do Worker.
- [ ] Testar salas com duas contas/dispositivos diferentes.
- [ ] Substituir o marcador genérico por operações reais do editor nativo do Geometry Dash.
- [ ] Importar/exportar níveis GMD/GD e sincronizar objetos reais.
- [ ] Sincronizar gameplay/movimento de jogadores; o protótipo atual não é ainda um modo de jogo multiplayer.
- [ ] Criar WebSocket nativo persistente; o protótipo atual consulta o servidor a cada dois segundos.
- [ ] Criar navegador de arquivos completo com download e exclusão.
- [ ] Criar histórico visual da Gemini e controles para apagar conversas.
- [ ] Criar sistema de convite, dono de sala, permissões, moderação e limites anti-abuso.
- [ ] Criar painel administrativo protegido e página pública de downloads.
- [ ] Criar/Adicionar o ícone final do mod.
- [ ] Criar testes automatizados para Worker e Durable Object.

## Limites desta versão

Este é um protótipo de integração e interface. A sala online, chat e transporte de operações JSON estão codificados, mas ainda dependem do Worker publicado. O editor colaborativo ainda não edita objetos reais do Geometry Dash. Nenhuma compilação, publicação ou teste de servidor real foi executado.
