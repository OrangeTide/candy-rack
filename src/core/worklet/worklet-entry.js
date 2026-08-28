// SPDX-License-Identifier: 0BSD

// Bundle entry for the AudioWorklet global scope. Importing each runtime runs
// its registerProcessor call. Add future processors here as the roster grows.
import './runtime.js';    // voice-processor (one per track)
import './fx-runtime.js'; // fx-processor (one per effects pedal)
