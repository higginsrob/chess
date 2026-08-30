Stockfish worker
================

Place a UCI Stockfish worker at this path:

  public/stockfish/stockfish.js

The app loads `{base}/stockfish/stockfish.js` as a Web Worker and speaks UCI
(`uci`, `isready`, `position fen …`, `go depth N`). If the file is missing,
games still run; post-game ACPL is skipped.

A classic all-in-one worker (no separate .wasm) that works here:

  https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js

License
-------

`stockfish.js` is Stockfish compiled to JavaScript/WebAssembly (GPL-3.0).

- Engine: T. Romstad, M. Costalba, J. Kiiski, G. Linscott, and contributors
  https://github.com/official-stockfish/Stockfish
- JS/WASM build: Niklas Fiekas (stockfish.js), GPL-3.0
  https://github.com/niklasf/stockfish.js

The rest of Chess lab (outside this directory) is MIT-licensed. This worker is
a separate program, loaded in its own worker thread and spoken to over UCI.
