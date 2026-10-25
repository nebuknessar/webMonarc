// ============================================================
// MonarcEngine — audio engine, decoupled from UI.
//
// Integration contract (for WebDaw channel wiring):
//   const engine = new MonarcEngine({ context: channel.context, destination: channel.input });
//   engine.input.noteOn(midi, velocity) / engine.input.noteOff(midi)
// Omit context/destination to run standalone (own AudioContext -> speakers).
// ============================================================
export class MonarcEngine {
  constructor({ context, destination } = {}) {
    this.context = context || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this.context;

    // fixed chain: [osc1..3] -> mixBus -> filter -> vca -> master -> out
    this.mixBus = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;

    this.mixBus.connect(this.filter);
    this.filter.connect(this.vca);
    this.vca.connect(this.master);
    this.master.connect(destination || ctx.destination);

    this.oscs = [0, 1, 2].map((i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = i === 0 ? 1 : 0;
      osc.type = "sawtooth";
      osc.frequency.value = 110;
      osc.connect(gain);
      gain.connect(this.mixBus);
      osc.start();
      return { osc, gain };
    });

    this.held = []; // midi note stack (mono, last-note priority)
    this.currentNote = null;
    this.glideTime = 0.05;
    this.filterBase = 500;
    this.filterEnvAmount = 2000;
    this.ampEnv = { attack: 0.005, decay: 0.15, sustain: 0.7, release: 0.2 };
    this.filterEnv = { attack: 0.002, decay: 0.25, sustain: 0.2, release: 0.3 };
    this.velocity = 1;

    // public note input — what a WebDaw channel / MIDI source will call
    this.input = {
      noteOn: (midi, velocity = 1) => this.noteOn(midi, velocity),
      noteOff: (midi) => this.noteOff(midi),
      allNotesOff: () => this.allNotesOff(),
    };
  }

  resume() {
    if (this.context.state === "suspended") this.context.resume();
  }

  setFreq(midi, glideTime) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const t = this.context.currentTime;
    const parts = [
      [this.oscs[0].osc, 1],
      [this.oscs[1].osc, this.osc2Ratio || 1],
      [this.oscs[2].osc, this.osc3Ratio || 0.5],
    ];
    parts.forEach(([osc, ratio]) => {
      const target = f * ratio;
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.setValueAtTime(osc.frequency.value, t);
      if (glideTime > 0.005) {
        osc.frequency.linearRampToValueAtTime(target, t + glideTime);
      } else {
        osc.frequency.setValueAtTime(target, t);
      }
    });
  }

  applyFilterEnv(gateOn, velocity) {
    const t = this.context.currentTime;
    const g = this.filter.frequency;
    const base = this.filterBase;
    const peak = Math.min(18000, base + this.filterEnvAmount * velocity);
    const sus = base + (peak - base) * this.filterEnv.sustain;
    g.cancelScheduledValues(t);
    if (gateOn) {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(peak, t + this.filterEnv.attack);
      g.setTargetAtTime(sus, t + this.filterEnv.attack, Math.max(0.01, this.filterEnv.decay / 3));
    } else {
      g.setTargetAtTime(base, t, Math.max(0.01, this.filterEnv.release / 3));
    }
  }

  applyAmpEnv(gateOn) {
    const t = this.context.currentTime;
    const g = this.vca.gain;
    const e = this.ampEnv;
    g.cancelScheduledValues(t);
    if (gateOn) {
      g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.linearRampToValueAtTime(this.velocity, t + e.attack);
      g.setTargetAtTime(this.velocity * e.sustain, t + e.attack, Math.max(0.01, e.decay / 3));
    } else {
      g.setTargetAtTime(0.0001, t, Math.max(0.01, e.release / 3));
    }
  }

  noteOn(midi, velocity = 1) {
    this.resume();
    const wasIdle = this.held.length === 0;
    this.held = this.held.filter((n) => n !== midi);
    this.held.push(midi);
    this.velocity = velocity;
    if (wasIdle || this.currentNote === null) {
      this.applyAmpEnv(true);
    }
    this.currentNote = midi;
    this.setFreq(midi, wasIdle ? 0 : this.glideTime);
    this.applyFilterEnv(true, velocity);
  }

  noteOff(midi) {
    this.held = this.held.filter((n) => n !== midi);
    if (this.held.length === 0) {
      this.applyAmpEnv(false);
      this.applyFilterEnv(false, 0);
      this.currentNote = null;
    } else {
      const backTo = this.held[this.held.length - 1];
      this.currentNote = backTo;
      this.setFreq(backTo, this.glideTime);
    }
  }

  allNotesOff() {
    this.held = [];
    this.applyAmpEnv(false);
    this.applyFilterEnv(false, 0);
    this.currentNote = null;
  }

  setParam(name, value) {
    const t = this.context.currentTime;
    switch (name) {
      case "master": this.master.gain.setTargetAtTime(value, t, 0.01); break;
      case "cutoff": this.filterBase = value; this.filter.frequency.setTargetAtTime(value, t, 0.01); break;
      case "resonance": this.filter.Q.setTargetAtTime(value, t, 0.01); break;
      case "filterEnv": this.filterEnvAmount = value; break;
      case "glide": this.glideTime = value; break;
      case "ampAttack": this.ampEnv.attack = value; break;
      case "ampDecay": this.ampEnv.decay = value; break;
      case "ampSustain": this.ampEnv.sustain = value; break;
      case "ampRelease": this.ampEnv.release = value; break;
      case "filterAttack": this.filterEnv.attack = value; break;
      case "filterDecay": this.filterEnv.decay = value; break;
      case "filterSustain": this.filterEnv.sustain = value; break;
      case "filterRelease": this.filterEnv.release = value; break;
      case "osc1Level": this.oscs[0].gain.gain.setTargetAtTime(value, t, 0.01); break;
      case "osc2Level": this.oscs[1].gain.gain.setTargetAtTime(value, t, 0.01); break;
      case "osc3Level": this.oscs[2].gain.gain.setTargetAtTime(value, t, 0.01); break;
      case "osc2Detune": this.oscs[1].osc.detune.setTargetAtTime(value, t, 0.01); break;
      case "osc2Ratio":
        this.osc2Ratio = value;
        if (this.currentNote !== null) this.setFreq(this.currentNote, 0);
        break;
      case "osc3Ratio":
        this.osc3Ratio = value;
        if (this.currentNote !== null) this.setFreq(this.currentNote, 0);
        break;
      case "osc1Wave": this.oscs[0].osc.type = value; break;
      case "osc2Wave": this.oscs[1].osc.type = value; break;
      case "osc3Wave": this.oscs[2].osc.type = value; break;
    }
  }
}
