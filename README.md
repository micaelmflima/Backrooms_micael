# BACKROOMS — ECHO

Horror 3D em primeira pessoa, solo ou cooperativo para **dois jogadores**. Evolução do jogo existente em Three.js, Node.js, Socket.IO e Electron. O original Python está preservado em `original/backrooms_3d/`.

**Versão 1.1.1 — update incremental da versão 1.1.0.** O mapa clássico, arma, áudio, controles, multiplayer, reconexão, suprimentos e reanimação foram preservados. Veja `docs/ATUALIZACAO-1.1.md` para alterações e desempenho.

O pacote contém o projeto modular completo e **`Backrooms-ECHO-Completo.cjs`**, um arquivo único com todo o código embutido. Com Node instalado, `node Backrooms-ECHO-Completo.cjs` extrai sua própria cópia do projeto, instala as dependências do navegador se necessário e abre o jogo. O portátil Windows continua sendo a opção sem Node/terminal.

## Jogar no Windows

Se você baixou o pacote com executável, extraia **todo o ZIP** e abra:

`executavel/Backrooms-ECHO-1.1.1-Windows-Portatil.exe`

Aguarde a extração inicial. O portátil inclui o servidor Node e as dependências: não precisa instalar Python, Node ou abrir terminal. Escolha **Criar sala**, digite seu nome e clique em **Iniciar exploração**. A sala já funciona sozinho; seu amigo pode entrar depois. O botão **Sala** copia o convite; **Esc** abre o menu.

O aplicativo inicia um processo de servidor automaticamente. A simulação começa quando a sala é criada. Fechar o aplicativo do host encerra a partida.

## Alternativa no navegador

Instale [Node.js LTS](https://nodejs.org/) **22 ou superior** e extraia o projeto para uma pasta comum, por exemplo `C:\Jogos\backrooms-echo`.

No Windows, abra **`iniciar.bat`**. Ele instala as dependências do navegador na primeira execução, inicia o servidor e abre a página. Mantenha o terminal aberto. No Linux/macOS: `sh iniciar.sh`.

Ou abra um terminal na pasta do `package.json`:

```bash
npm install
npm start
```

O endereço é `http://localhost:3000`. Não abra `client/index.html` diretamente, pois módulos e sockets precisam do servidor HTTP. Para instalar somente o modo navegador, sem Electron e ferramentas de desenvolvimento:

```bash
npm install --omit=dev
npm start
```

A primeira instalação precisa de internet. Após instalar, os recursos do jogo são locais e funcionam offline no modo solo ou na rede local.

### Olhar pelo celular

Com o servidor aberto no PC e ambos na mesma rede Wi-Fi, tente abrir `http://IP_DO_PC:3000` no navegador do telefone. Use o IPv4 do computador, não `localhost`, e prefira a qualidade Leve. Isso permite olhar o lobby/cenário em aparelhos compatíveis; **o jogo ainda não tem controles por toque**. O `.exe` é para Windows e não abre no celular. Não há um site público hospedado incluído na entrega.

## Multiplayer

O computador do **host** controla a simulação. O amigo usa **Entrar** e informa o IP/URL do host. O código seleciona uma sala nesse servidor; **não existe descoberta global por código**. Se houver apenas uma sala, o campo de código pode ficar vazio. Se você já abriu a página no servidor correto, basta o código.

### Mesma rede

1. O host cria a sala e consulta seu IPv4 com `ipconfig`, ou usa o endereço mostrado em Esc.
2. No aplicativo do cliente, selecione Entrar e informe, por exemplo, `http://192.168.1.10:3000`.
3. Digite o código ou deixe vazio se só existir uma sala.
4. Como alternativa, o cliente pode abrir diretamente `http://192.168.1.10:3000` no navegador. Assim só o host precisa instalar o projeto.

`localhost` é sempre o computador da própria pessoa. O amigo precisa do IP do host. Se o menu mostrar uma placa de rede virtual incorreta, escolha o IPv4 da rede compartilhada. Redes Wi-Fi de visitantes podem impedir a conexão entre aparelhos.

### Internet com Radmin VPN

Os dois instalam [Radmin VPN](https://www.radmin-vpn.com/). O host cria uma rede com nome e senha, e o amigo entra nessa rede. Use no jogo o IP do host exibido pelo Radmin seguido de `:3000`. Informe o código da sala se necessário. Autorize o jogo/Node.js no firewall para a rede da VPN.

Não é necessário instalar o produto de controle remoto Radmin Server: usamos somente a rede virtual.

### Internet com ngrok

Instale [ngrok](https://ngrok.com/download), configure sua conta/token pelas instruções oficiais e, com o host aberto, execute em outro terminal:

```bash
ngrok http 3000
```

Envie a URL **HTTPS** exibida pelo ngrok e o código. O amigo pode abrir essa URL no navegador, clicar em Entrar e manter o endereço já preenchido. Se houver uma página intermediária do ngrok, abra a URL e aceite-a antes de conectar. Mantenha ngrok e o host abertos.

HTTP e WebSockets usam a mesma porta. URLs e limites do túnel dependem da conta. Uma página HTTPS deve se conectar a um host HTTPS, porque o navegador bloqueia HTTP inseguro nesse contexto.

### Encaminhamento de porta

No roteador do host, encaminhe **TCP 3000** para o IPv4 local do host. No firewall, permita entrada nessa porta para o jogo. O cliente usa `http://IP_PUBLICO:3000`. Com CGNAT do provedor, encaminhamento pode não funcionar; use VPN ou ngrok. O projeto foi pensado para partidas privadas entre amigos, sem autenticação de contas ou infraestrutura de serviço público.

### Reconexão

Socket.IO reconecta automaticamente. A vaga, identidade, posição, vida e munição ficam reservadas por **45 segundos**. F5 na mesma aba também retoma a sessão; o token fica no `sessionStorage` dessa aba.

O cliente desconectado fica invisível e não sofre ataques. Se o host perder a conexão com seu servidor, a simulação pausa até ele voltar; após 45 segundos a sala é encerrada. Fechar o aplicativo/servidor do host elimina a sessão. Não há migração de host nem salvamento entre execuções.

## Objetivo e controles

A campanha tem quatro níveis. Em cada mapa, use **E** nos três objetivos e volte ao ponto de partida para usar a saída. O HUD mostra progresso, direção e distância. Apenas o host clica em **Continuar ao próximo nível**; os dois jogadores passam juntos. Essa tela pausa a IA e permanece até o host continuar.

| Nível | Ambiente | Objetivo | Saída |
|---|---|---|---|
| 0 | Papel amarelo, carpete e fluorescentes | Encontrar três chaves | Porta |
| 1 | Depósito de concreto, vigas e luz fria | Ligar três geradores | Elevador |
| 2 | Túneis com canos e ferrugem | Recuperar três fusíveis | Escotilha |
| 3 | Salas de azulejos, piscinas rasas e luz azul | Coletar três selos e sobreviver 60 segundos desde a entrada | Última porta |

As criaturas mantêm visão, audição, patrulha e ataques anteriores. A velocidade, o limite de entidades e a frequência de aparecimento aumentam em cada nível. Vida e munição são mantidas na passagem; cada jogador recebe 24 tiros na reserva (até 120) e volta com pelo menos 55 de vida. Reiniciar volta ao Level 0 com o equipamento inicial.

| Controle | Ação |
|---|---|
| W / A / S / D | Andar |
| Mouse | Olhar |
| Shift | Correr, consumindo stamina |
| Espaço | Pular |
| Clique esquerdo | Atirar, um tiro por clique |
| R | Recarregar |
| E | Interagir com objetivo, pegar suprimento, usar saída ou reanimar aliado |
| F | Ligar/desligar lanterna |
| Esc | Soltar o mouse e abrir menu |
| V | Alternar primeira/terceira pessoa |

A pistola tem 12 tiros e começa com 60 na reserva. Caixas de munição dão 36; kits médicos recuperam até 45 de vida. Suprimentos são compartilhados e usados uma vez por expedição. Não há fogo amigo. A parte superior do volume dos monstros recebe dano maior.

Um jogador abatido pode ser reanimado pelo outro e volta com 55 de vida. Apenas o host pode reiniciar para os dois. **O menu não pausa o mundo.** Monstros escutam tiros e corrida, patrulham, perseguem e atacam.

## Recursos implementados

- Three.js/WebGL 3D real, Pointer Lock, física compartilhada, colisões, pulo, corrida e stamina.
- Mundo procedural por setores, seed compartilhada, passagem garantida entre vizinhos e culling de setores distantes.
- Três paletas de papel de parede, carpete e teto; rodapés, umidade, luminárias emissivas que falham, neblina, bloom, sombra suave da lanterna e granulado/VHS discreto.
- Pistola 3D com mãos/mangas, recuo, ferrolho, recarga, carregador, clarão, tracer, marcas de impacto e raycast autoritativo.
- Explorador em cápsula com visor, mochila, pernas curtas e cor selecionável no lobby; a constante `DEFAULT_PLAYER_COLOR` está no topo de `shared/config.js`. V mostra seu personagem.
- Contador de FPS, chunks reutilizados, culling e pools de entidades/projéteis.
- Quatro níveis com objetivos e transições compartilhadas.
- Três rigs: **O Alongado**, **Rastejante** e **Sem Rosto**, com repouso, caminhada, corrida, ataque, dano e morte.
- Web Audio procedural: zumbido, drone, ruídos distantes, passos, rosnados, tiros, recarga, impactos e camada musical de perseguição. Sons remotos posicionais com HRTF.
- Dois jogadores visíveis com nomes e animações; vida, munição, monstros e objetivos sincronizados; ping e reconexão.
- Qualidade Alta/Leve, volume, sensibilidade e redução de flashes/granulado. Qualidade lembrada pelo navegador.
- Electron isolado, com servidor Node em outro processo. Original Python preservado.

## Gerar o instalador e o portátil no seu Windows

Com Node.js LTS 22+ instalado, abra o terminal na pasta do projeto:

```bash
npm install --include=dev
npm run build
```

Ou abra **`gerar-exe.bat`**. Os downloads iniciais podem demorar. Os arquivos ficam em `dist/`:

- `Backrooms-ECHO-1.1.1-Windows-Setup.exe`: instalador com pasta e atalho.
- `Backrooms-ECHO-1.1.1-Windows-Portatil.exe`: executável portátil com tudo embutido.

Só o portátil: `npm run build:portable`. Testar o desktop antes de compilar: `npm run desktop`. As dependências usadas não exigem Visual Studio para esse build.

Os binários não têm certificado comercial de assinatura. O Windows pode avisar sobre editor desconhecido; verifique a origem e, se preferir, compile localmente. Não é preciso desativar o antivírus.

No Linux: `npm run build:linux`. No macOS: `npm run build:mac`, executado em um Mac. Assinatura/notarização pública exige credenciais próprias. Consulte `docs/TESTES.md` para as plataformas realmente verificadas.

## Desenvolvimento

```bash
npm run dev
npm test
npx playwright install chromium
npm run test:browser
npm run test:combat
npm run test:campaign
npm run test:performance
```

`dev` reinicia o servidor quando os arquivos mudam. Recarregue a página para alterações no cliente. `npm run test:campaign` valida os quatro níveis com dois clientes; `npm run test:performance` mede travessia de setores. Os testes de navegador abrem dois clientes reais e geram capturas em `test-results/`. Use `npm ci` para reconstruir exatamente o lockfile. Depois de editar as fontes, `npm run bundle` regenera o arquivo único. `node_modules` não faz parte do código-fonte entregue, mas as dependências de execução estão embutidas no portátil.

| Pasta | Responsabilidade |
|---|---|
| `client/` | Interface, câmera, cenário, modelos, efeitos e áudio |
| `server/` | HTTP, salas, sockets, física e IA autoritativas |
| `shared/` | Mapa, colisões, física e raycast usados nos dois lados |
| `electron/` | Janela desktop e ciclo de vida do processo servidor |
| `assets/` | Ícone e documentação dos recursos procedurais |
| `tests/` | Testes de lógica, rede e navegador |
| `scripts/` | Verificação do Node e geração do arquivo único |
| `docs/` | Arquitetura e validação |
| `original/` | Protótipo recebido, preservado |

## Solução de problemas

| Problema | Solução |
|---|---|
| Node/npm não reconhecido | Instale Node.js LTS e reabra o terminal. |
| Tela preta / WebGL | Ative aceleração gráfica, atualize o driver e use navegador atual. |
| Jogo pesado | Escolha Leve no lobby, reduza a janela e feche outros aplicativos 3D. |
| Sem som | Clique em Iniciar/Continuar e confira volume da aba, sistema e jogo. |
| Mouse não capturado | Esc e clique manualmente em Continuar. |
| Porta ocupada | Feche outra instância. No CMD: `set PORT=3001`, depois `npm start`. Electron tenta 3001 se 3000 estiver ocupada. Informe a porta certa ao amigo. |
| Amigo não conecta | Confira IP e porta. Teste `http://IP:3000/health`. Verifique isolamento Wi-Fi. |
| Firewall | Permita Node.js ou Backrooms ECHO e entrada TCP 3000 na rede utilizada. Não desative todo o firewall. |
| Código não encontrado | Use o endereço do host correto. Não há descoberta global por código. |
| Sala cheia após fechar aba | Volte pela mesma aba, aguarde 45 s ou crie outra sala. |
| IP público bloqueado | Verifique CGNAT/roteador ou use Radmin VPN/ngrok. |
| Download do Electron falha | Verifique conexão/proxy, rode `npm install --include=dev` e tente novamente. |
| Wine ausente no Linux | Compile o instalador no Windows ou gere só o portátil com `npm run build:portable`. |

Referências: [Three.js](https://threejs.org/docs/), [Socket.IO](https://socket.io/docs/v4/), [Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [electron-builder](https://www.electron.build/), [ngrok/WebSockets](https://ngrok.com/docs/using-ngrok-with/websockets), [Radmin VPN](https://www.radmin-vpn.com/help/).

O código novo usa licença MIT. Dependências mantêm suas licenças. Nenhuma licença nova é imposta ao protótipo original recebido.

## Update 1.1.1 — movimento, personagens e med kits

Atualização sobre a versão anterior, com backup completo em `backups/Backrooms-ECHO-1.1.0-Codigo-fonte.zip`. No lobby, **PERSONAGEM** escolhe o explorador original ou um dos quatro FBX enviados. **V** permite vê-los em terceira pessoa. A escolha é salva e sincronizada no multiplayer. Med kits usam o último modelo enviado (GLB com texturas embutidas), conservando as regras de cura e coleta.

Aplicação do patch, causa dos saltos, lista dos arquivos e roteiro de testes: [docs/UPDATE-1.1.1.md](docs/UPDATE-1.1.1.md). Os arquivos e texturas recebidos foram preservados; os FBX não incluem clips, então as animações são geradas sobre seus rigs originais.
