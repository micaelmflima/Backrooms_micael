# Arquitetura

O processo Node no computador do host é a autoridade. Electron inicia esse processo com `fork`, recebe `ready` por IPC e abre a página local. O renderer é isolado: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`. A janela e o amigo remoto conversam com o servidor por Socket.IO.

A simulação roda a 30 Hz e envia snapshots a 15 Hz. Clientes enviam intenções a 20 Hz, preveem movimento local e interpolam modelos remotos. Vida, munição, dano, objetivos e monstros nunca são aceitos como declarações do cliente. Tokens de retomada são excluídos dos snapshots. Mensagens têm limite de tamanho e frequência.

| Evento | Função |
|---|---|
| `enter` | Criar, entrar ou recuperar sessão; retorna seed e estado |
| `input` | Movimento, orientação, corrida, pulo e sequência |
| `shoot`, `reload`, `interact` | Solicitar ações validadas no servidor |
| `snapshot` | Estado autoritativo do mundo e jogadores |
| `effect`, `notice` | Efeitos confirmados e avisos |
| `restart`, `reset` | Reinício coordenado autorizado ao host |
| `stage-complete`, `next-level`, `stage-start` | Conclusão confiável para ambos; avanço autorizado ao host |
| `echo` | Medida de latência |
| `leave`, `closed` | Saída e encerramento |

Cada setor tem 12×12 células de 3,2 m. Busca em profundidade abre um labirinto; salas ampliam trechos e corredores centrais criam portais compatíveis. Nove setores próximos são candidatos à renderização, com culling pela câmera. Um pool de 16 setores conserva matrizes e buffers; apenas um setor é montado por quadro, com antecipação na fronteira e substituição do setor distante menos recente. Luminárias, manchas, canos, vigas e paredes usam InstancedMesh. Texturas são geradas uma vez por tema/variante e reutilizadas. A cache da grade tem 256 setores e pode ser regenerada pela seed, inclusive em coordenadas negativas.

Movimentos são subdivididos para impedir atravessamento de parede, diagonais normalizadas e pulo limitado abaixo do teto. Tiros usam DDA 3D para paredes/piso/teto e AABB para monstros; o primeiro obstáculo limita o alcance. A região superior causa dano adicional. A mira determina o alvo a partir da câmera, inclusive em terceira pessoa, e o raio parte da posição mundial do cano até esse alvo. O servidor valida distância/valores da origem e testa a obstrução entre olho e cano. O dano continua hitscan; projéteis/rastros/clarões e marcas são visuais em pools de 24 e 60 objetos.

A IA combina campo de visão, linha de visão, som e memória breve de perseguição; usa busca em largura na grade, com caminho direto quando há visão. Entidades surgem fora da visão e longe do jogador. Até sete a dez entidades vivas são mantidas próximas, conforme o nível; corpos mortos e entidades muito distantes são removidos. Rigs procedurais articulados animam membros por estado, sem recursos externos. Entidades removidas retornam ao pool. O explorador usa formas de cápsula, visor, mochila e cor validada; a câmera opcional em terceira pessoa recua respeitando o primeiro obstáculo.

A campanha mantém a seed base da sala e deriva uma seed por nível. Objetivos usam o estado compartilhado anterior de três relés, agora apresentados como chaves, geradores, fusíveis e selos. Somente o servidor libera a saída. A conclusão pausa IA/física; somente o host confirma a passagem. Identidade, cor e inventário permanecem. O último nível exige 60 segundos desde sua entrada, além dos três selos.

O modo Leve reduz resolução interna, quantidade de luzes, sombras e pós-processamento. A qualidade Alta preserva bloom/VHS e uma única lanterna com sombras suaves, atualizadas a 20 Hz; as quatro luzes do ambiente não projetam sombra. Leve usa três luzes de ambiente e nenhum mapa de sombra. Pixel ratio é no máximo 1,5. Entradas são enviadas a 20 Hz por timer, sem depender do FPS; física local usa passos fixos de 1/60 s e o estado autoritativo corrige divergências. As regras continuam iguais. A iluminação é aproximada em tempo real, sem path tracing ou iluminação global física. Não há matchmaking global, contas, voz, migração de host, salvamento persistente, controles touch ou gamepad. Reiniciar conserva a seed; outra seed exige nova sala.


`Backrooms-ECHO-Completo.cjs` é gerado por `npm run bundle`. Embute as fontes, recursos e documentação, verifica seu hash e extrai uma pasta exclusiva desta versão. A primeira execução instala apenas dependências de produção e inicia o mesmo servidor HTTP. O arquivo modular original não é substituído.
