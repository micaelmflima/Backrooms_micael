
import math
import multiprocessing as mp
import random
import sys
import time
from queue import Empty

try:
    import pygame
    from pygame.locals import *
    from OpenGL.GL import *
    from OpenGL.GLU import *
except ImportError:
    print("Dependências ausentes. Execute: pip install -r requirements.txt")
    raise

WIDTH, HEIGHT = 1100, 650
PLAYER_SPEED = 3.8
RUN_SPEED = 6.2
MOUSE_SENS = 0.10

# Procedural maze-like Backrooms layout.
GRID_W, GRID_H = 25, 25
CELL = 2.8
WALL_H = 2.8

def make_map():
    random.seed(17)
    grid = [["#" for _ in range(GRID_W)] for _ in range(GRID_H)]

    # Open a connected-ish network of corridors and rooms.
    for y in range(1, GRID_H-1):
        for x in range(1, GRID_W-1):
            if x % 2 == 1 or y % 2 == 1:
                grid[y][x] = "."

    for _ in range(85):
        x = random.randrange(2, GRID_W-2)
        y = random.randrange(2, GRID_H-2)
        if random.random() < 0.65:
            for yy in range(max(1,y-1), min(GRID_H-1,y+2)):
                for xx in range(max(1,x-1), min(GRID_W-1,x+2)):
                    if random.random() < .72:
                        grid[yy][xx] = "."
    # Add larger rooms
    for _ in range(9):
        x = random.randrange(2, GRID_W-5)
        y = random.randrange(2, GRID_H-5)
        for yy in range(y, y+random.randrange(3,6)):
            for xx in range(x, x+random.randrange(3,6)):
                if 0 < yy < GRID_H-1 and 0 < xx < GRID_W-1:
                    grid[yy][xx] = "."

    grid[1][1] = "."
    grid[GRID_H-2][GRID_W-2] = "."
    return grid

GRID = make_map()

def wall_at(x, z):
    gx = int(math.floor(x / CELL))
    gz = int(math.floor(z / CELL))
    if gx < 0 or gz < 0 or gx >= GRID_W or gz >= GRID_H:
        return True
    return GRID[gz][gx] == "#"

def collides(x, z, radius=.28):
    for dx, dz in ((-radius,-radius),(radius,-radius),(-radius,radius),(radius,radius)):
        if wall_at(x+dx, z+dz):
            return True
    return False

def entity_worker(in_q, out_q):
    """Separate process: receives player state and computes entity navigation."""
    random.seed()
    ex, ez = (GRID_W-2)*CELL + CELL/2, (GRID_H-2)*CELL + CELL/2
    vx = vz = 0.0
    last = time.time()
    wandering = 0.0

    while True:
        try:
            msg = in_q.get(timeout=.04)
        except Empty:
            continue

        if msg["type"] == "quit":
            return

        px, pz = msg["player"]
        now = time.time()
        dt = min(.1, now-last)
        last = now

        dx, dz = px-ex, pz-ez
        dist = math.hypot(dx,dz)

        if dist < 18 and dist > .01:
            # Chase player.
            vx, vz = dx/dist, dz/dist
        else:
            wandering -= dt
            if wandering <= 0:
                a = random.random()*math.tau
                vx, vz = math.cos(a), math.sin(a)
                wandering = random.uniform(1.2,3.0)

        out_q.put({"type":"state", "x":ex, "z":ez, "dist":dist})

        speed = 1.55 if dist > 4 else 2.15
        nx, nz = ex + vx*speed*dt, ez + vz*speed*dt
        if not collides(nx,nz,.30):
            ex, ez = nx,nz
        else:
            a = random.random()*math.tau
            vx,vz = math.cos(a),math.sin(a)

def cube(x,y,z,sx,sy,sz, color):
    glColor3f(*color)
    x0,x1=x-sx/2,x+sx/2
    y0,y1=y-sy/2,y+sy/2
    z0,z1=z-sz/2,z+sz/2
    glBegin(GL_QUADS)
    for a,b,c,d in [
        ((x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)),
        ((x1,y0,z1),(x0,y0,z1),(x0,y1,z1),(x1,y1,z1)),
        ((x0,y0,z1),(x1,y0,z1),(x1,y0,z0),(x0,y0,z0)),
        ((x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)),
        ((x0,y0,z0),(x0,y1,z0),(x0,y1,z1),(x0,y0,z1)),
        ((x1,y0,z1),(x1,y1,z1),(x1,y1,z0),(x1,y0,z0)),
    ]:
        for p in (a,b,c,d): glVertex3f(*p)
    glEnd()

def setup_3d():
    pygame.display.set_mode((WIDTH,HEIGHT), DOUBLEBUF|OPENGL)
    pygame.mouse.set_visible(False)
    pygame.event.set_grab(True)
    glEnable(GL_DEPTH_TEST)
    glEnable(GL_CULL_FACE)
    glCullFace(GL_BACK)
    glClearColor(.035,.032,.018,1)
    glMatrixMode(GL_PROJECTION)
    glLoadIdentity()
    gluPerspective(72, WIDTH/HEIGHT, .05, 1000)
    glMatrixMode(GL_MODELVIEW)

def draw_world(px,pz,yaw,entity):
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)
    glLoadIdentity()

    # Camera: eye at 1.65m.
    glRotatef(-yaw,0,1,0)
    glTranslatef(-px,-1.65,-pz)

    # Floor
    cube(GRID_W*CELL/2, -0.08, GRID_H*CELL/2, GRID_W*CELL, .16, GRID_H*CELL, (.48,.44,.19))

    # Ceiling
    cube(GRID_W*CELL/2, WALL_H+.1, GRID_H*CELL/2, GRID_W*CELL, .18, GRID_H*CELL, (.12,.115,.075))

    # Walls + fluorescent lights
    for gy,row in enumerate(GRID):
        for gx,c in enumerate(row):
            if c == "#":
                cube(gx*CELL+CELL/2, WALL_H/2, gy*CELL+CELL/2,
                     CELL, WALL_H, CELL, (.56,.51,.22))

    # Ceiling lights at corridor cells
    for gy,row in enumerate(GRID):
        for gx,c in enumerate(row):
            if c == "." and (gx+gy)%4 == 0:
                cube(gx*CELL+CELL/2, WALL_H-.07, gy*CELL+CELL/2,
                     .95,.05,.28,(.82,.80,.57))

    # Entity as a dark humanoid-ish silhouette.
    ex,ez = entity
    cube(ex, 1.0, ez, .55, 1.9, .38, (.035,.008,.008))
    cube(ex, 2.05, ez, .48, .48, .42, (.015,.005,.005))

def draw_hud(font, small, stamina, distance, msg):
    # Switch to 2D
    glMatrixMode(GL_PROJECTION); glPushMatrix(); glLoadIdentity()
    glOrtho(0,WIDTH,HEIGHT,0,-1,1)
    glMatrixMode(GL_MODELVIEW); glPushMatrix(); glLoadIdentity()
    glDisable(GL_DEPTH_TEST)

    surf = pygame.Surface((WIDTH,HEIGHT),pygame.SRCALPHA)
    pygame.draw.rect(surf,(0,0,0,90),(16,16,430,90),border_radius=8)
    pygame.draw.rect(surf,(10,10,10,150),(16,76,240,12),border_radius=6)
    pygame.draw.rect(surf,(220,205,80,220),(18,78,max(0,int(236*stamina)),8),border_radius=5)

    t=font.render("BACKROOMS // LEVEL 0",True,(235,228,180))
    surf.blit(t,(28,25))
    t=small.render("WASD  mover   SHIFT  correr   ESC  sair",True,(220,215,185))
    surf.blit(t,(28,53))
    t=small.render(f"Entidade: {distance:4.1f} m",True,(220,215,185))
    surf.blit(t,(270,76))

    if msg:
        m=font.render(msg,True,(255,245,200))
        surf.blit(m,(WIDTH//2-m.get_width()//2,HEIGHT-70))

    # Flashlight cone-ish vignette
    vign=pygame.Surface((WIDTH,HEIGHT),pygame.SRCALPHA)
    vign.fill((0,0,0,80))
    pygame.draw.circle(vign,(0,0,0,0),(WIDTH//2,HEIGHT//2),230)
    surf.blit(vign,(0,0))

    texture=pygame.image.tostring(surf,"RGBA",True)
    glRasterPos2f(0,0)
    glDrawPixels(WIDTH,HEIGHT,GL_RGBA,GL_UNSIGNED_BYTE,texture)

    glEnable(GL_DEPTH_TEST)
    glMatrixMode(GL_MODELVIEW); glPopMatrix()
    glMatrixMode(GL_PROJECTION); glPopMatrix()
    glMatrixMode(GL_MODELVIEW)

def main():
    mp.freeze_support()
    pygame.init()
    setup_3d()
    font=pygame.font.SysFont("consolas",22,bold=True)
    small=pygame.font.SysFont("consolas",15)

    in_q=mp.Queue()
    out_q=mp.Queue()
    proc=mp.Process(target=entity_worker,args=(in_q,out_q),daemon=True)
    proc.start()

    px,pz=1.5*CELL,1.5*CELL
    yaw=0.0
    stamina=1.0
    entity=[(GRID_W-2)*CELL+CELL/2,(GRID_H-2)*CELL+CELL/2]
    distance=999.0
    message="Não olhe para trás."
    last_send=0
    running=True
    clock=pygame.time.Clock()

    try:
        while running:
            dt=clock.tick(75)/1000
            for e in pygame.event.get():
                if e.type==QUIT: running=False
                if e.type==KEYDOWN and e.key==K_ESCAPE: running=False

            mx,_=pygame.mouse.get_rel()
            yaw += mx*MOUSE_SENS

            keys=pygame.key.get_pressed()
            dx=float(keys[K_d])-float(keys[K_a])
            dz=float(keys[K_s])-float(keys[K_w])
            ln=math.hypot(dx,dz)
            if ln: dx/=ln; dz/=ln

            running_fast=keys[K_LSHIFT] or keys[K_RSHIFT]
            if running_fast and stamina>0 and ln:
                speed=RUN_SPEED
                stamina=max(0,stamina-dt*.27)
            else:
                speed=PLAYER_SPEED
                stamina=min(1,stamina+dt*.13)

            a=math.radians(yaw)
            wx=dx*math.cos(a)+dz*math.sin(a)
            wz=-dx*math.sin(a)+dz*math.cos(a)

            nx,nz=px+wx*speed*dt,pz+wz*speed*dt
            if not collides(nx,pz,.27): px=nx
            if not collides(px,nz,.27): pz=nz

            now=time.time()
            if now-last_send>.05:
                in_q.put({"type":"state","player":(px,pz)})
                last_send=now

            try:
                while True:
                    s=out_q.get_nowait()
                    entity[0],entity[1]=s["x"],s["z"]
            except Empty: pass

            distance=math.hypot(px-entity[0],pz-entity[1])
            if distance<2.3:
                message="VOCÊ FOI ENCONTRADO."
            elif distance<7:
                message="CORRA."
            elif distance<13:
                message="Você ouviu alguma coisa..."
            else:
                message="Não olhe para trás."

            draw_world(px,pz,yaw,entity)
            draw_hud(font,small,stamina,distance,message)
            pygame.display.flip()
    finally:
        try: in_q.put({"type":"quit"})
        except: pass
        proc.join(1)
        if proc.is_alive(): proc.terminate()
        pygame.quit()

if __name__=="__main__":
    main()
