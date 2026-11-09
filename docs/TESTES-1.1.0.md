# Validação da entrega — ECHO 1.1.0

## Executado neste ambiente

- `npm test`: **19 testes aprovados**. Cobrem conectividade de mapas com quatro seeds e setores positivos/negativos, portais compatíveis, limite da cache, colisões, pulo, raycast, munição, cadência, recarga, dano, morte, reanimação, suprimentos, relés, extração, IA e seus três tipos. Preserva regressões de endereços HTTP/HTTPS, patrulha e ações durante desconexão do host. A atualização valida conectividade dos quatro níveis, dificuldade, objetivos/tempo, transição/inventário, cor, origem do disparo/câmera e autoridade do avanço de nível.
- Integração Socket.IO: criação, entrada de dois jogadores, recusa de terceiro, seed igual, ausência de tokens nos snapshots, movimento, tiro, autorização de reinício e retomada pelo token.
- `npm run test:browser`: navegador Chromium real em WebGL por software, com dois clientes. Verificados lobby, jogador remoto, Pointer Lock, movimento, disparo, recarga, salto, queda/reconexão do socket, F5, morte e reinício. Inclui reinício pelo host enquanto o cliente mantém o mouse capturado e uma tecla de movimento pressionada.
- `npm run test:combat`: qualidade Alta com bloom/sombras, renderização dos três rigs, mira por mouse, tiros passando pelo socket/raycast até matar os três tipos, ataque chegando ao HUD, origem dos rastros coincidindo com a ponta física do cano, ativação dos objetivos finais e tela de vitória. Preserva a regressão da cadência dependente de FPS.
- `npm run test:campaign`: dois navegadores reais; cápsula/cor personalizada, câmera V, modelos, os quatro mapas, progresso compartilhado, saídas bloqueadas, transição vista pelos dois, passagem do host, condição de 60 segundos, vitória e reinício.
- `npm run test:performance`: caminhada real cruzando setores com mesma seed. Comparação sequencial 1.0.1/1.1.0: chamadas de desenho medianas 130 → 64, montagens por quadro 3 → 1. Dados completos e limites em `ATUALIZACAO-1.1.md`; não é um benchmark de GPU física.
- Interface, cenário e monstros inspecionados por capturas de tela. O teste de dois jogadores usa qualidade Leve; o de combate usa Alta. Ambos usam WebGL por software, sem representar o desempenho de uma GPU de consumidor.
- Arquivo único: extração de 59 arquivos comparada byte a byte com as fontes, instalação automática de 90 pacotes de produção, inicialização do servidor 1.1.0 e resposta dos recursos do navegador/Three.js/Socket.IO.
- `npm run build:portable`: pacote Windows x64 gerado com electron-builder; Electron e dependências de execução incluídos. Os 18 arquivos de execução em client/server/shared/electron/assets foram comparados byte a byte dentro de app.asar; a versão e express/socket.io/three também foram conferidos.

## Limites da verificação

Este ambiente é Linux e não oferece uma sessão Windows. O `.exe` foi **compilado**, mas não foi aberto em Windows aqui. O jogo foi executado e testado no navegador com o mesmo código de cliente/servidor.

O instalador NSIS completo exigiu Wine na tentativa anterior de compilação cruzada (1.0.1). Na 1.1.0 foi compilado somente o portátil Windows. Por isso a entrega inclui o portátil e os scripts para gerar instalador e portátil diretamente no Windows. Nenhum instalador parcial deve ser utilizado.

Linux AppImage e macOS DMG possuem scripts de build, mas não foram compilados ou executados nesta entrega. Rede local e Socket.IO foram verificados no ambiente de teste; roteador, firewall, VPN, ngrok e duas máquinas físicas dependem da configuração do usuário e não foram testados remotamente.

A comparação de desempenho usa o código 1.0.1 extraído da entrega anterior. Para repetir contra uma cópia local dessa versão, defina `ECHO_BASELINE` apontando para sua pasta e execute `npm run test:performance`; depois execute novamente sem essa variável.

Os testes usam fixtures de estado exclusivamente dentro do processo de teste para posicionar monstros, verificar morte/reinício e alcançar os relés. A cena de inspeção dos rigs mantém a IA congelada; o teste de ataque usa a simulação real novamente. O servidor entregue não expõe uma API de teleporte, vida arbitrária ou comandos de desenvolvimento. Os testes não avaliam subjetivamente o som em fones ou caixas reais.

## Reproduzir

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:combat
npm run test:campaign
npm run test:performance
npm run bundle
node Backrooms-ECHO-Completo.cjs --extract-only
npm run build:portable
```

Capturas são gravadas em `test-results/`. O código dos testes está incluído para revisão e repetição.
