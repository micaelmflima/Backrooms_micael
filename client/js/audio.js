// Áudio procedural. PannerNode/HRTF posiciona sons de monstros e do parceiro em 3D.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.65;
    this.nextCreak = 0;
    this.level = 0;
  }
  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const c = (this.ctx = new AudioContext());
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(c.destination);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.hum = c.createGain();
    this.hum.gain.value = 0.027;
    this.hum.connect(this.master);
    for (const hz of [59.9, 120.1, 179.8]) {
      const o = c.createOscillator(),
        g = c.createGain();
      o.frequency.value = hz;
      g.gain.value = hz > 100 ? 0.18 : 0.6;
      o.connect(g);
      g.connect(this.hum);
      o.start();
    }
    const drone = this.drone = c.createOscillator(),
      dg = c.createGain();
    drone.frequency.value = [37, 31, 44, 52][this.level];
    dg.gain.value = 0.027;
    drone.connect(dg);
    dg.connect(this.master);
    drone.start();
    this.tension = c.createGain();
    this.tension.gain.value = 0;
    this.tension.connect(this.master);
    for (const hz of [73.4, 77.78, 110]) {
      const o = c.createOscillator(),
        f = c.createBiquadFilter();
      o.frequency.value = hz;
      o.type = "triangle";
      f.type = "lowpass";
      f.frequency.value = 180;
      o.connect(f);
      f.connect(this.tension);
      o.start();
    }
    await c.resume();
  }
  // NOVO: o drone distingue os ambientes, preservando passos e sons posicionais.
  setLevel(level) {
    this.level = level;
    if (this.drone) this.drone.frequency.setTargetAtTime([37, 31, 44, 52][level], this.ctx.currentTime, 1.2);
  }
  setVolume(v) {
    this.volume = v;
    if (this.master)
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  route(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 2;
    p.maxDistance = 55;
    p.rolloffFactor = 1.3;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y ?? 1;
    p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }
  burst({
    pos,
    duration = 0.1,
    volume = 0.1,
    frequency = 1000,
    type = "noise",
    end = frequency,
    delay = 0,
  }) {
    if (!this.ctx) return;
    const c = this.ctx,
      t = c.currentTime + delay,
      out = this.route(pos),
      g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(out);
    let source, filter;
    if (type === "noise") {
      source = c.createBufferSource();
      source.buffer = this.noise;
      filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(frequency, t);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, end),
        t + duration,
      );
      source.connect(filter);
      filter.connect(g);
    } else {
      source = c.createOscillator();
      source.type = type;
      source.frequency.setValueAtTime(frequency, t);
      source.frequency.exponentialRampToValueAtTime(
        Math.max(20, end),
        t + duration,
      );
      source.connect(g);
    }
    source.start(t);
    source.stop(t + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter?.disconnect();
      g.disconnect();
      if (out !== this.master) out.disconnect();
    };
  }
  shot(pos) {
    this.burst({ pos, duration: 0.2, volume: 0.4, frequency: 6500, end: 180 });
    this.burst({
      pos,
      duration: 0.17,
      volume: 0.26,
      frequency: 145,
      end: 40,
      type: "triangle",
    });
    this.burst({
      pos,
      duration: 0.27,
      volume: 0.07,
      frequency: 1600,
      end: 180,
      delay: 0.09,
    });
  }
  reload(pos) {
    for (const [delay, f] of [
      [0, 2400],
      [0.45, 1600],
      [1.28, 3500],
    ])
      this.burst({ pos, duration: 0.12, volume: 0.09, frequency: f, delay });
  }
  step(pos, monster = false) {
    this.burst({
      pos,
      duration: monster ? 0.17 : 0.11,
      volume: monster ? 0.13 : 0.07,
      frequency: monster ? 430 : 650,
      end: 80,
    });
    this.burst({
      pos,
      duration: 0.07,
      volume: 0.05,
      frequency: monster ? 68 : 92,
      end: 40,
      type: "sine",
    });
  }
  growl(pos, type = 0) {
    this.burst({
      pos,
      duration: 1,
      volume: 0.11,
      frequency: type === 1 ? 135 : 65,
      end: 32,
      type: "sawtooth",
    });
    this.burst({ pos, duration: 0.8, volume: 0.14, frequency: 350, end: 80 });
  }
  impact(pos) {
    this.burst({ pos, duration: 0.07, volume: 0.1, frequency: 2500, end: 260 });
  }
  hurt() {
    this.burst({
      duration: 0.25,
      volume: 0.18,
      frequency: 120,
      end: 32,
      type: "triangle",
    });
  }
  pickup() {
    this.burst({
      duration: 0.18,
      volume: 0.06,
      frequency: 620,
      end: 900,
      type: "sine",
    });
  }
  update(camera, threat, t, active = true) {
    if (!this.ctx) return;
    const c = this.ctx,
      l = c.listener,
      p = camera.position,
      d = camera.getWorldDirection(
        this.direction || (this.direction = p.clone()),
      );
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = d.x;
      l.forwardY.value = d.y;
      l.forwardZ.value = d.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(d.x, d.y, d.z, 0, 1, 0);
    }
    this.tension.gain.setTargetAtTime(
      active && threat ? 0.018 * (0.7 + 0.3 * Math.sin(t * 8)) : 0,
      c.currentTime,
      0.4,
    );
    this.hum.gain.setTargetAtTime(active ? 0.027 : 0.009, c.currentTime, 0.5);
    if (active && t > this.nextCreak) {
      this.nextCreak = t + 14 + Math.random() * 15;
      this.burst({
        pos: { x: p.x + Math.cos(t) * 18, y: 2, z: p.z + Math.sin(t) * 18 },
        duration: 1.6,
        volume: 0.12,
        frequency: 190,
        end: 58,
        type: "triangle",
      });
    }
  }
}
