# Validação — ECHO 1.1.1

## Executado

- `npm test`: 28 testes aprovados. Incluem os 19 testes anteriores, previsão com latência/jitter, fronteiras de chunks positivos/negativos, câmera sem salto na recepção de snapshots, velocidade em 15/60/144 FPS, recuperação de frame de 400 ms, timestamp de rAF anterior ao timer, orçamento de física autoritativo, revisão do nível, identidade de personagens e tiro/recarga vinculados ao comando confirmado e ausência de contagem dupla de gravidade/stamina em lotes atrasados e coleta confirmada mantendo 45 HP/uso único.
- FBX: comparação da bind pose e de vértices amostrados antes/depois da consolidação de ossos; nenhum deslocamento acima da tolerância de 0,0001 unidades. Hashes dos FBX, GLB e texturas copiados comparados ao manifesto dos arquivos enviados.
- `npm run test:browser`: Chromium/WebGL real com dois clientes, Pointer Lock, movimento, tiro, recarga, pulo, reconexão, F5, reinício enquanto uma tecla está pressionada, morte e reinício. Sem erros de página/recursos.
- `npm run test:combat`: qualidade Alta/bloom/sombras; três tipos de criatura, mira por eventos de mouse, dano/morte, ataque no HUD, origem visual do tracer idêntica ao cano, objetivos finais e vitória. A fixture congela somente `updateMonsters`; mantém os colliders durante os tiros confirmados, sem modificar a IA entregue.
- `npm run test:campaign`: quatro níveis completos e sincronizados em dois navegadores; objetivos/portas, transições, condição de sobrevivência, vitória e reinício; explorador original/cor/câmera preservados.
- `npm run test:models`: cinco prévias 3D inspecionadas; quatro FBX em escala de 1,60 m, materiais/texturas, rigs e animações verificadas. Escolha salva após F5; Agnes e Metal Sonic usados por dois jogadores e vistos pelo outro cliente; tiro do novo personagem em terceira pessoa aceito pelo servidor. Novo med kit GLB com albedo/normal embutidos, dimensão maior de 0,68 m, base a 0,004 m do chão, persistência do cache após troca de mapa, coleta e cura de 45 HP.
- O executável portátil Windows x64 foi compilado com electron-builder. Cliente/servidor/shared/Electron/assets no `app.asar` são comparados byte a byte às fontes finais; dependências locais express/socket.io/three são incluídas. O extrator CJS completo é verificado contra seus arquivos originais após extração.

O teste de caminhada e os dados da câmera estão em `docs/PERFORMANCE-1.1.1.json`. Ele cruza uma fronteira de setor, verifica cache/Worker, no máximo uma montagem por quadro, capacidade de 16 chunks, orçamento de luzes, previsão sem divergência e deslocamento da câmera compatível com velocidade/tempo. Não é um benchmark de GPU de consumidor.

## Limites

O ambiente é Linux, com WebGL renderizado por software. As taxas de FPS observadas aqui não representam uma GPU real e não garantem 60 FPS no seu computador. Os testes verificam continuidade de posição e eliminação de correções bruscas; nenhum software transforma um dispositivo sem capacidade gráfica em um renderizador de alta taxa de quadros.

O portátil `.exe` foi compilado e seu conteúdo foi validado, mas não foi aberto em uma sessão Windows. Abra-o no seu PC para conferir GPU, áudio e firewall. Linux/macOS têm os scripts originais de build, mas não foram compilados neste update. Porta de roteador, VPN, ngrok e áudio em fones dependem da configuração física do usuário.

Os FBX recebidos não têm clips; suas animações são procedurais nos rigs originais. Fenomeno não inclui a textura difusa de cabelo, então usa a textura de cabelo fornecida. Os quatro maiores pesos por vértice são usados pelo FBXLoader quando há mais influências. Nenhum FBX/GLB/PNG/JPEG original foi modificado.

Os testes usam fixtures locais para posicionar jogadores/monstros e completar objetivos; não existe API de teleporte/vida arbitrária no servidor entregue. Diagnósticos do cliente são somente leitura.

## Repetir

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:combat
npm run test:campaign
npm run test:models
npm run test:performance
npm run bundle
node Backrooms-ECHO-Completo.cjs --extract-only
npm run build:portable
```

O relatório da versão anterior foi conservado em `docs/TESTES-1.1.0.md`. Instruções de aplicação/teste manual: `docs/UPDATE-1.1.1.md`.
