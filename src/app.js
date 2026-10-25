import React, { useRef, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { MonarcEngine } from "./engine.js";

const WAVEFORMS = ["sawtooth", "square", "triangle", "sine"];
const NAMES = { sawtooth: "saw", square: "sqr", triangle: "tri", sine: "sin" };

function Knob({ label, value, min, max, curve = 1, format, onChange }) {
  const startRef = useRef(null);
  const onPointerDown = (e) => {
    e.target.setPointerCapture?.(e.pointerId);
    startRef.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e) => {
    if (!startRef.current) return;
    const dy = startRef.current.y - e.clientY;
    const norm = Math.min(1, Math.max(0, Math.pow((value - min) / (max - min), 1 / curve) + dy / 200));
    onChange(min + Math.pow(norm, curve) * (max - min));
  };
  const onPointerUp = () => (startRef.current = null);
  const angle = -135 + 270 * Math.pow((value - min) / (max - min), 1 / curve);
  return (
    <div className="knob-wrap">
      <div
        role="slider" aria-label={label} tabIndex={0}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className="knob"
      >
        <div className="knob-inner" />
        <div className="knob-ptr" style={{ transform: `rotate(${angle}deg)` }}>
          <div />
        </div>
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">{format ? format(value) : String(value)}</div>
    </div>
  );
}

const KEY_ORDER = [
  { midi: 0, black: false }, { midi: 1, black: true }, { midi: 2, black: false },
  { midi: 3, black: true }, { midi: 4, black: false }, { midi: 5, black: false },
  { midi: 6, black: true }, { midi: 7, black: false }, { midi: 8, black: true },
  { midi: 9, black: false }, { midi: 10, black: true }, { midi: 11, black: false },
];
const KEYMAP = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
  q: 60, 2: 61, w: 62, 3: 63, e: 64, r: 65, 5: 66, t: 67, 6: 68, y: 69, 7: 70, u: 71,
};

function Keyboard({ activeNotes, onDown, onUp }) {
  return (
    <div className="kb">
      {[48, 60].map((base) => (
        <div className="kb-oct" key={base}>
          {KEY_ORDER.filter((k) => !k.black).map((k) => {
            const midi = base + k.midi;
            const left = KEY_ORDER.slice(0, k.midi).filter((x) => !x.black).length * 24;
            return (
              <div key={midi} className={`key-w${activeNotes.has(midi) ? " on" : ""}`}
                style={{ left }}
                onPointerDown={(e) => { e.preventDefault(); onDown(midi); }}
                onPointerUp={() => onUp(midi)}
                onPointerLeave={() => onUp(midi)} />
            );
          })}
          {KEY_ORDER.filter((k) => k.black).map((k) => {
            const midi = base + k.midi;
            const left = KEY_ORDER.slice(0, k.midi).filter((x) => !x.black).length * 24 - 7;
            return (
              <div key={midi} className={`key-b${activeNotes.has(midi) ? " on" : ""}`}
                style={{ left }}
                onPointerDown={(e) => { e.preventDefault(); onDown(midi); }}
                onPointerUp={() => onUp(midi)}
                onPointerLeave={() => onUp(midi)} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const fmtMs = (v) => `${(v * 1000) | 0}ms`;
const fmtPct = (v) => `${Math.round(v * 100)}%`;
const fmtHz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}Hz`);

function App() {
  const engineRef = useRef(null);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState({
    master: 0.8,
    cutoff: 500, resonance: 6, filterEnv: 2500,
    glide: 0.06,
    ampAttack: 0.005, ampDecay: 0.2, ampSustain: 0.7, ampRelease: 0.25,
    filterAttack: 0.002, filterDecay: 0.25, filterSustain: 0.2, filterRelease: 0.3,
    osc1Level: 1, osc2Level: 0, osc3Level: 0.4,
    osc1Wave: "sawtooth", osc2Wave: "sawtooth", osc3Wave: "square",
    osc2Detune: 0, osc2Ratio: 1, osc3Ratio: 0.5,
  });

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new MonarcEngine(); // standalone: own context -> speakers
    }
    engineRef.current.resume();
    setRunning(true);
    return engineRef.current;
  }, []);

  const setParam = useCallback((name, value) => {
    setParams((p) => ({ ...p, [name]: value }));
    engineRef.current?.setParam(name, value);
  }, []);

  const noteOn = useCallback((midi) => {
    const eng = ensureEngine();
    eng.input.noteOn(midi, 1);
    setActiveNotes((s) => new Set(s).add(midi));
  }, [ensureEngine]);

  const noteOff = useCallback((midi) => {
    engineRef.current?.input.noteOff(midi);
    setActiveNotes((s) => {
      const n = new Set(s);
      n.delete(midi);
      return n;
    });
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (e.repeat || e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
      const midi = KEYMAP[e.key.toLowerCase()];
      if (midi !== undefined) noteOn(midi);
    };
    const up = (e) => {
      const midi = KEYMAP[e.key.toLowerCase()];
      if (midi !== undefined) noteOff(midi);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [noteOn, noteOff]);

  return (
    <div className="app" onPointerDown={() => ensureEngine()}>
      <div className="head">
        <h1>WEBMONARC</h1>
        <span>{running ? "audio on" : "click to start audio"}</span>
      </div>

      <div className="panels">
        <div className="panel">
          <div className="panel-title">Oscillators</div>
          <div className="row">
            {[0, 1, 2].map((i) => (
              <div className="env-group" key={i}>
                <select value={params[`osc${i + 1}Wave`]} onChange={(e) => setParam(`osc${i + 1}Wave`, e.target.value)}>
                  {WAVEFORMS.map((w) => <option key={w} value={w}>{NAMES[w]}</option>)}
                </select>
                <Knob label={`osc${i + 1} lvl`} value={params[`osc${i + 1}Level`]}
                      min={0} max={1} onChange={(v) => setParam(`osc${i + 1}Level`, v)} format={fmtPct} />
                {i === 1 && (
                  <>
                    <Knob label="detune" value={params.osc2Detune} min={-50} max={50}
                          onChange={(v) => setParam("osc2Detune", v)}
                          format={(v) => `${Math.round(v)}c`} />
                    <Knob label="interval" value={params.osc2Ratio} min={0.25} max={4}
                          onChange={(v) => setParam("osc2Ratio", v)}
                          format={(v) => `${v.toFixed(2)}x`} />
                  </>
                )}
                {i === 2 && (
                  <Knob label="interval" value={params.osc3Ratio} min={0.25} max={4}
                        onChange={(v) => setParam("osc3Ratio", v)}
                        format={(v) => `${v.toFixed(2)}x`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Filter</div>
          <div className="row">
            <Knob label="cutoff" value={params.cutoff} min={40} max={12000} curve={2.5}
                  onChange={(v) => setParam("cutoff", v)} format={fmtHz} />
            <Knob label="reso" value={params.resonance} min={0.1} max={20} curve={2}
                  onChange={(v) => setParam("resonance", v)}
                  format={(v) => v.toFixed(1)} />
            <Knob label="env amt" value={params.filterEnv} min={0} max={8000} curve={2}
                  onChange={(v) => setParam("filterEnv", v)}
                  format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Envelopes</div>
          <div className="row">
            <div className="env-group">
              <div className="env-label">AMP</div>
              <div className="row" style={{ gap: 8 }}>
                <Knob label="A" value={params.ampAttack} min={0.001} max={1} curve={2.5} onChange={(v) => setParam("ampAttack", v)} format={fmtMs} />
                <Knob label="D" value={params.ampDecay} min={0.02} max={2} curve={2} onChange={(v) => setParam("ampDecay", v)} format={fmtMs} />
                <Knob label="S" value={params.ampSustain} min={0} max={1} onChange={(v) => setParam("ampSustain", v)} format={fmtPct} />
                <Knob label="R" value={params.ampRelease} min={0.02} max={3} curve={2} onChange={(v) => setParam("ampRelease", v)} format={fmtMs} />
              </div>
            </div>
            <div className="env-group">
              <div className="env-label">FILTER</div>
              <div className="row" style={{ gap: 8 }}>
                <Knob label="A" value={params.filterAttack} min={0.001} max={1} curve={2.5} onChange={(v) => setParam("filterAttack", v)} format={fmtMs} />
                <Knob label="D" value={params.filterDecay} min={0.02} max={2} curve={2} onChange={(v) => setParam("filterDecay", v)} format={fmtMs} />
                <Knob label="S" value={params.filterSustain} min={0} max={1} onChange={(v) => setParam("filterSustain", v)} format={fmtPct} />
                <Knob label="R" value={params.filterRelease} min={0.02} max={3} curve={2} onChange={(v) => setParam("filterRelease", v)} format={fmtMs} />
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Glide / Master</div>
          <div className="row">
            <Knob label="glide" value={params.glide} min={0} max={0.6} onChange={(v) => setParam("glide", v)} format={fmtMs} />
            <Knob label="volume" value={params.master} min={0} max={1} onChange={(v) => setParam("master", v)} format={fmtPct} />
          </div>
        </div>
      </div>

      <div className="kb-wrap">
        <Keyboard activeNotes={activeNotes} onDown={noteOn} onUp={noteOff} />
        <div className="hint">play with mouse/touch, or keys: z–m lower octave, q–u upper octave</div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
