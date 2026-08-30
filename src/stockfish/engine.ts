import { LIVE_EVAL_DEPTH } from './thresholds'

export interface EngineScore {
  cp: number
  mate?: number
}

export interface EngineEval {
  score: EngineScore
  bestUci: string
  depth: number
}

type Pending = {
  resolve: (value: EngineEval) => void
  reject: (err: Error) => void
  depth: number
  last?: EngineEval
}

/**
 * Stockfish UCI wrapper. Loads public/stockfish/stockfish.js as a worker.
 * If the WASM build is missing, `available` stays false and callers skip evals.
 */
export class StockfishEngine {
  private worker: Worker | null = null
  private ready = false
  private available = false
  private queue: Array<() => void> = []
  private busy = false
  private pending: Pending | null = null
  private initPromise: Promise<boolean> | null = null

  isAvailable(): boolean {
    return this.available
  }

  init(): Promise<boolean> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.boot()
    return this.initPromise
  }

  async evaluate(fen: string, depth = LIVE_EVAL_DEPTH): Promise<EngineEval | null> {
    const ok = await this.init()
    if (!ok || !this.worker) return null
    return this.enqueue(fen, depth)
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.ready = false
    this.available = false
    this.initPromise = null
    this.pending?.reject(new Error('Engine disposed'))
    this.pending = null
  }

  private boot(): Promise<boolean> {
    const url = `${import.meta.env.BASE_URL}stockfish/stockfish.js`
    return new Promise((resolve) => {
      try {
        const worker = new Worker(url)
        this.worker = worker
        worker.onmessage = (ev: MessageEvent<string>) => this.onMessage(String(ev.data))
        worker.onerror = () => {
          this.available = false
          resolve(false)
        }
        const timeout = setTimeout(() => {
          if (!this.ready) {
            worker.terminate()
            this.worker = null
            this.available = false
            resolve(false)
          }
        }, 12_000)
        this.whenReady = () => {
          clearTimeout(timeout)
          this.available = true
          resolve(true)
        }
        worker.postMessage('uci')
      } catch {
        this.available = false
        resolve(false)
      }
    })
  }

  private whenReady: (() => void) | null = null

  private onMessage(line: string): void {
    const trimmed = line.trim()
    if (trimmed === 'uciok') {
      this.worker?.postMessage('isready')
      return
    }
    if (trimmed === 'readyok') {
      this.ready = true
      this.whenReady?.()
      this.whenReady = null
      this.kick()
      return
    }
    if (!this.pending) return
    if (trimmed.startsWith('info ') && trimmed.includes(' score ')) {
      const parsed = parseInfo(trimmed, this.pending.depth)
      if (parsed) this.pending.last = parsed
    }
    if (trimmed.startsWith('bestmove ')) {
      const bestUci = trimmed.split(/\s+/)[1] ?? ''
      const last = this.pending.last
      const pending = this.pending
      this.pending = null
      this.busy = false
      if (last) pending.resolve({ ...last, bestUci })
      else pending.resolve({ score: { cp: 0 }, bestUci, depth: pending.depth })
      this.kick()
    }
  }

  private enqueue(fen: string, depth: number): Promise<EngineEval> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        this.busy = true
        this.pending = { resolve, reject, depth }
        this.worker?.postMessage('ucinewgame')
        this.worker?.postMessage(`position fen ${fen}`)
        this.worker?.postMessage(`go depth ${depth}`)
      })
      this.kick()
    })
  }

  private kick(): void {
    if (this.busy || !this.ready || this.queue.length === 0) return
    const next = this.queue.shift()
    next?.()
  }
}

function parseInfo(line: string, fallbackDepth: number): EngineEval | null {
  const depthMatch = / depth (\d+)/.exec(line)
  const mateMatch = / score mate (-?\d+)/.exec(line)
  const cpMatch = / score cp (-?\d+)/.exec(line)
  const pvMatch = / pv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line)
  const depth = depthMatch ? Number(depthMatch[1]) : fallbackDepth
  const bestUci = pvMatch?.[1] ?? ''
  if (mateMatch) {
    const mate = Number(mateMatch[1])
    return { score: { cp: 0, mate }, bestUci, depth }
  }
  if (cpMatch) {
    return { score: { cp: Number(cpMatch[1]) }, bestUci, depth }
  }
  return null
}

let singleton: StockfishEngine | null = null

export function getStockfish(): StockfishEngine {
  if (!singleton) singleton = new StockfishEngine()
  return singleton
}
