# Revisão técnica — ECHO 1.0.1

Documento histórico da revisão anterior. A evolução atual está em `ATUALIZACAO-1.1.md`; a validação atual está em `TESTES.md`.

## Avaliação

O projeto é uma base jogável de horror cooperativo. A estrutura modular, o mapa
compartilhado, a autoridade do servidor e o ciclo de combate/extração estão
implementados. Ainda é um protótipo: os modelos têm formas bastante simples,
as animações são mecânicas e os corredores repetem padrões facilmente
reconhecíveis. Não classificaria esta entrega como um jogo comercial acabado.

A paleta amarelada, as placas do teto, o carpete, a névoa e as luzes estabelecem
a identidade das Backrooms. A qualidade Alta acrescenta bloom e sombras, mas
não transforma a iluminação aproximada em iluminação global realista.
Os três monstros são distinguíveis; especialmente o Sem Rosto precisa de uma
silhueta e de movimentos mais ameaçadores. A pistola também precisa de mais
trabalho artístico. Os sons são sintetizados; a revisão de código e execução
não substitui uma avaliação auditiva em fones e alto-falantes reais.

## Falhas reproduzidas e corrigidas

| Prioridade | Falha na 1.0.0 | Correção na 1.0.1 |
|---|---|---|
| Média | Reiniciar enquanto o cliente tinha Pointer Lock abria o menu sem liberar o cursor e podia manter movimento pressionado. | O menu libera o mouse, limpa teclas e envia uma entrada parada. Reinício e reconexão restauram a orientação recebida. |
| Média | Na seed 15, uma entidade em patrulha fez 300 buscas em dez segundos e permaneceu no lugar. | Destinos precisam estar livres; tentativas e frequência de busca são limitadas. |
| Média | A simulação pausava sem o host, mas tiros, recarga e interações ainda eram aceitos. | Essas ações também exigem que o host esteja conectado. |
| Média | `http://example.test:80` era convertido para porta 3000. | URLs completas preservam a porta. IP/hostname sem protocolo usa a porta 3000. |
| Média | Em renderização lenta, cliques separados por 650 ms podiam ser recusados pela cadência do cliente. | A cadência usa o relógio real, separado do tempo limitado da animação. |

Também foram ajustados o convite em páginas acessadas por URL pública, a
tentativa de conexão por HTTP polling quando WebSocket falha e a redução do
clarão de disparos remotos. São ajustes de código; túnel ngrok e proxies reais
não foram exercitados neste ambiente.

Os testes de regressão das quatro primeiras falhas mostraram o comportamento
incorreto antes das correções. O teste de combate em qualidade Alta reproduziu
a quinta falha. Consulte `TESTES.md` para a validação final e seus limites.

## O que falta para maior acabamento

1. Melhorar silhuetas, materiais e animações dos monstros e da arma.
2. Criar mais tipos de salas e encontros, com progressão de tensão e dificuldade.
3. Avaliar desempenho em GPUs reais e multiplayer com latência, perda de pacotes
   e duas máquinas físicas. O teste local não comprova comportamento em toda rede.
4. Testar o executável diretamente em Windows; foi gerado a partir de Linux.
5. Se celular for um objetivo, implementar controles por toque, interface
   adaptada e orçamento gráfico menor. Esta versão ainda requer teclado e mouse.

## Celular e acesso

Um celular pode tentar carregar a página servida por um PC na mesma rede,
usando `http://IP_DO_PC:3000`. Isso permite inspecionar o lobby e o cenário se
o navegador e a GPU suportarem o conteúdo. Não existe modo de jogo touch,
link público hospedado nem execução do `.exe` no telefone. O projeto não deve
ser anunciado como compatível com celular nesta versão.

## Escopo da revisão

As correções preservam mapa, regras, recursos e arquivos do protótipo original.
Não houve substituição artística dos modelos nem inclusão de infraestrutura
online. Testes de navegador usam fixtures somente no processo de teste para
posicionar entidades, provocar morte/reinício e alcançar os relés. A cena de
inspeção dos três rigs congela a IA para tornar a comparação reproduzível;
o ataque ao jogador é testado novamente com a IA real habilitada.
