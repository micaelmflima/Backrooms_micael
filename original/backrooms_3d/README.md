
# BACKROOMS 3D — IPC Edition

Protótipo 3D jogável em Python usando **Pygame + OpenGL**.

## Recursos

- Mundo 3D em primeira pessoa
- Mapa procedural fixo com salas/corredores
- Colisão
- Mouse para olhar
- WASD para andar
- Shift para correr
- Barra de stamina
- Iluminação fluorescente simples
- HUD atmosférico
- Entidade que persegue o jogador
- **Entidade executada em processo separado**
- Comunicação entre processos via `multiprocessing.Queue`

## Instalação

Python 3.10+ recomendado.

```bash
python -m pip install -r requirements.txt
python main.py
```

## Controles

W/A/S/D — movimento
SHIFT — correr
ESC — sair

## Executável

Para gerar um `.exe` no Windows:

```bash
python -m pip install pyinstaller
pyinstaller --onefile --windowed main.py
```

O executável aparecerá na pasta `dist/`.

## Arquitetura IPC

Processo principal:
- renderiza o mundo
- lê teclado/mouse
- movimenta jogador
- envia posição

Processo da entidade:
- recebe posição
- calcula perseguição/vagueio
- envia posição da entidade

Para um jogo multiplayer real, o próximo passo seria substituir a Queue por sockets e criar um servidor autoritativo.
