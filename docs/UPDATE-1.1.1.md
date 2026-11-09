# Update incremental 1.1.1

Este update foi aplicado sobre o Backrooms ECHO 1.1.0 existente. O projeto anterior está preservado, sem alterações, em `backups/Backrooms-ECHO-1.1.0-Codigo-fonte.zip`.

## O que mudou

- Movimento: previsão local e autoridade usam passos de 30 Hz e comandos numerados. Snapshots confirmam comandos; a previsão reaplica somente os ainda não confirmados. A câmera interpola poses e suaviza correções com colisão contínua. Não existe snapping do jogador para células.
- O relógio monotônico impede que um timestamp antigo de `requestAnimationFrame` conte novamente tempo que o timer/socket já processou. A física não é contada de novo enquanto um lote está em trânsito. O servidor recupera ticks atrasados e usa crédito de tempo limitado para consumir comandos acumulados, sem permitir velocidade extra. Tiros, recargas e interações aguardam a confirmação da posição correspondente: o disparo continua saindo do cano visível e mantém a validação de alcance. A munição prevista não é reposta por um snapshot anterior ao disparo.
- A grade dos chunks é antecipada num Web Worker, com cache; a montagem visual conserva o pool de 16 chunks e monta no máximo um por quadro. Sem suporte a Worker, mantém a montagem gradual existente. As colisões continuam usando coordenadas globais e a mesma função compartilhada; não há colliders novos por chunk nem recentralização do mundo.
- Seleção de personagem no lobby: explorador original, Vergil, Metal Sonic, Fenomeno e Agnes Tachyon. Prévia 3D, miniaturas, escolha em `localStorage` e identidade sincronizada nos dois jogadores, reconexão, reinício e quatro níveis.
- Os quatro FBX originais e suas texturas estão em `assets/models/`. Os arquivos copiados conservam os SHA-256 registrados em `assets/models/manifest.json`. Escala/pivô são ajustados em grupos externos, sem remodelar a geometria. A altura visual é 1,60 m, alinhada ao explorador atual; câmera, velocidades e collider continuam compartilhados.
- Os FBX recebidos têm esqueletos, mas nenhum clip de animação. Idle, andar, correr e pular são movimentos procedurais sobre os ossos originais. Não são animações capturadas/prontas do arquivo. O sistema também reconhece clips idle/walk/run/jump em futuros modelos.
- Ossos duplicados na mesma bind pose são consolidados, com teste de poses/vértices antes e depois: Vergil elimina 194 duplicados e Agnes 2.933. Skeletons idênticos compartilham buffers. Nenhuma malha ou material é removido.
- O último ZIP contém `Med-kit .glb`, não FBX. Ele é usado diretamente com as texturas embutidas. O med kit fica apoiado no chão (folga de 4 mm), dimensão maior de 68 cm. Caixas de munição continuam como antes.

## O que permaneceu intacto

`client/js/actors.js` (explorador original, monstros e arma), `shared/world.js` (mapas, colisões e velocidades), `shared/levels.js`, `shared/weapon.js`, áudio, efeitos, texturas procedurais e Electron não foram reescritos. Permanecem os quatro níveis, dificuldade, objetivos, vida, stamina, tiros, recarga, lanterna, multiplayer, reanimação e controles existentes.

Med kits: cura de 45 HP, limite de 100, spawns determinísticos, distância de coleta de 2,8 m, tecla E, som e uso único permanecem iguais. O collider visual não impõe colisão sólida nova: a coleta usa a mesma área anterior.

## Aplicar sobre seu jogo

1. Feche o servidor/jogo. Preserve uma cópia da sua pasta atual.
2. Extraia `Backrooms-ECHO-Update-1.1.1.zip` NA pasta que contém seu `package.json`. Ele contém apenas arquivos novos/alterados e seus diretórios relativos. Autorize substituir esses arquivos.
3. Rode `npm install` e `npm start`, ou use `iniciar.bat`.
4. Atualize os dois jogadores juntos. Clientes e servidor 1.1.1 compartilham o novo protocolo de previsão. O servidor ainda aceita entradas antigas, mas a correção de movimento exige o cliente atualizado.
5. Para atualizar o aplicativo desktop, use o novo portátil incluído no pacote completo ou execute `npm run build`. O executável antigo não lê automaticamente o código novo extraído em outra pasta.

`Backrooms-ECHO-Codigo-fonte.zip` contém o projeto atualizado completo. `Backrooms-ECHO-Completo-Windows.zip` inclui também o portátil, já com servidor e modelos embutidos.

## Teste manual

1. No lobby, abra **PERSONAGEM**. Veja todos os cinco modelos, selecione um e confirme **USAR PERSONAGEM**. Recarregue a página: a escolha deve permanecer.
2. Crie uma sala. Pressione **V** para enxergar o personagem. Teste WASD, Shift e Espaço. A primeira pessoa e suas mãos/arma originais continuam disponíveis; V mostra o FBX completo.
3. Para testar uma fronteira facilmente, caminhe pelo corredor central: alinhe-se à coluna ou linha central do setor, indicada no HUD, e siga até o indicador SETOR mudar. As fronteiras ficam a cada 38,4 m. A mudança de setor não deve alterar a velocidade nem causar correção brusca da câmera. O FPS já aparece no HUD.
4. Ande, corra, pule e solte as teclas perto de paredes e fronteiras; confira colisão e parada contínuas. Troque a qualidade Alta/Leve para separar limite da GPU de correção de posição.
5. Em outro navegador/PC, entre com outro personagem. Confira os dois modelos, movimento, sons, tiros e recarga. Recarregue o cliente para testar reconexão; complete um nível e confira a escolha preservada.
6. Procure um kit médico, perca vida e aperte E perto dele. Deve aparecer o modelo enviado apoiado no chão, curar 45 HP (máximo 100), tocar o mesmo som e desaparecer para ambos. Com vida cheia ele continua sem ser consumido. Caixas de munição não mudaram.

## Arquivos para adicionar personagens depois

Adicione uma entrada em `shared/characters.js`: `id`, `name`, `model`, `thumbnail`, `height` e `rotationY`. Copie FBX/texturas para `assets/models/<id>/`. `aliases` resolve referências de textura com nomes diferentes; `materials` liga texturas a materiais que vieram sem mapas. A escolha é validada no servidor pela mesma lista. Para um rig com nomes diferentes, ajuste `roles` em `client/js/rig-animation.js`. Quando não houver rig nem clips, são necessárias animações/modelagem adicionais; não se inventa um esqueleto incompatível.

## Problemas corrigidos na importação

Vergil referenciava um PNG inexistente, vinha com opacidade zero e usava o albedo como máscara de transparência; o importador usa o PNG fornecido, torna o material visível e mantém o recorte pelo alfa correto. Metal Sonic referenciava `_abd` quando o arquivo é `_alb`. Agnes referenciava uma pasta `Texture2D` inexistente. Fenomeno não ligava texturas aos materiais: o importador liga os PNG fornecidos; o cabelo usa a textura `hair_shad_c` recebida, pois o ZIP não inclui `hair_diff`.

Three.js/FBXLoader usa até quatro influências de ossos por vértice. Nos FBX com mais influências, o loader mantém as quatro maiores e normaliza os pesos; os arquivos originais continuam intactos. Animações procedurais podem diferir de animações oficiais do personagem.

## Comandos

```bash
npm install
npm start
npm test
npx playwright install chromium
npm run test:browser
npm run test:combat
npm run test:campaign
npm run test:models
npm run test:performance
npm run build
```

Nenhum novo controle de teclado foi adicionado. A seleção acontece no lobby; **V** já era o controle para alternar câmera.
