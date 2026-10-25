# webMonarc

A monophonic, MONARK-style bass synthesizer for the browser. Built as a
standalone prototype, but designed from day one to plug into a **WebDaw**
channel later.

## Architecture

- `src/engine.js` — `MonarcEngine`, the whole audio engine. No UI, no DOM
  assumptions. Fixed chain: `[osc1..3] -> mixBus -> filter -> vca -> master`.
- `src/app.js` — React UI (knobs, envelopes, local keyboard). Just one
  possible input source.
- `index.html` — host page, importmap for React, styles. No build tooling;
  open it (or serve it) and play.

## WebDaw integration contract

The engine is constructed around an injectable audio context and destination:

```js
// Standalone (own context -> speakers)
const engine = new MonarcEngine();

// Inside a WebDaw channel (later)
const engine = new MonarcEngine({
  context: channel.context,     // shared AudioContext
  destination: channel.input,    // channel input node
});
```

Note input is abstracted behind:

```js
engine.input.noteOn(midi, velocity);
engine.input.noteOff(midi);
engine.input.allNotesOff();
```

The engine is monophonic with a held-note stack (last-note priority, legato
retriggering) and portamento/glide. A WebDaw channel or MIDI source just calls
the note API above; nothing else in the engine assumes where notes come from.

## Controls

- 3 oscillators: waveform, level; osc2 detune + interval, osc3 interval.
- Resonant lowpass filter: cutoff, resonance, envelope amount, own ADSR.
- Amp ADSR, glide, master volume.
- Input: on-screen keyboard (pointer/touch) and computer keys
  (z–m lower octave, q–u upper octave).
