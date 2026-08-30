import { useEffect, useMemo, useState } from 'react'
import type { GameLog } from '../types'
import { clearGames, deleteGame, listGames, saveGame, subscribeGames } from '../benchmarks/idb'
import { loadCorpus } from '../benchmarks/corpus'
import { aggregateLogs, formatAcplPair, formatNum, formatPct } from '../benchmarks/metrics'
import { exportAnnotatedLogs } from '../benchmarks/exportZip'
import { terminationLabel, winnerLabel } from '../harness/termination'

type Source = 'all' | 'local' | 'corpus'

export function BenchmarksPage() {
  const [local, setLocal] = useState<GameLog[]>([])
  const [corpus, setCorpus] = useState<GameLog[]>([])
  const [source, setSource] = useState<Source>('all')
  const [err, setErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function refresh() {
    try {
      const [idb, shipped] = await Promise.all([listGames(), loadCorpus()])
      setLocal(idb)
      setCorpus(shipped)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
    return subscribeGames(() => {
      void refresh()
    })
  }, [])

  const logs = useMemo(() => {
    if (source === 'local') return local
    if (source === 'corpus') return corpus
    return [...corpus, ...local]
  }, [source, local, corpus])

  const metrics = useMemo(() => aggregateLogs(logs), [logs])

  async function persistAnnotated(prepared: GameLog[]) {
    for (const log of prepared) {
      if (log.stockfish && local.some((g) => g.id === log.id)) {
        await saveGame(log)
      }
    }
  }

  async function exportAll() {
    if (logs.length === 0 || exporting) return
    setExporting(true)
    try {
      const prepared = await exportAnnotatedLogs(logs, {
        zipName: `benchmarks-${logs.length}g.zip`,
        forceZip: true,
      })
      await persistAnnotated(prepared)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  async function exportOne(log: GameLog) {
    if (exporting) return
    setExporting(true)
    try {
      const prepared = await exportAnnotatedLogs([log])
      await persistAnnotated(prepared)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Benchmarks</h2>
        <p className="muted">
          Local IndexedDB runs plus the committed corpus in <code>public/benchmarks</code>.
          Illegal-move forfeit rate is the primary harness KPI.
        </p>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <label className="field">
            Source
            <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
              <option value="all">Local + corpus</option>
              <option value="local">This browser</option>
              <option value="corpus">Committed corpus</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Refresh
          </button>
          <button
            type="button"
            className="btn"
            disabled={logs.length === 0 || exporting}
            onClick={() => void exportAll()}
          >
            {exporting ? 'Annotating…' : 'Export zip'}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (confirm('Clear all local games from this browser?')) {
                void clearGames().then(() => refresh())
              }
            }}
          >
            Clear local
          </button>
        </div>
        {err && <p className="muted">{err}</p>}
      </section>

      <section className="panel">
        <h3>KPIs</h3>
        <div className="metrics">
          <div className="metric kpi">
            <div className="kicker">Illegal-move forfeit rate</div>
            <div className="value">{formatPct(metrics.illegalForfeitRate)}</div>
          </div>
          <div className="metric">
            <div className="kicker">Games</div>
            <div className="value">{metrics.games}</div>
          </div>
          <div className="metric">
            <div className="kicker">W / D / L (White)</div>
            <div className="value">
              {metrics.whiteWins} / {metrics.draws} / {metrics.blackWins}
            </div>
          </div>
          <div className="metric">
            <div className="kicker">Parse success</div>
            <div className="value">{formatPct(metrics.parseSuccessRate)}</div>
          </div>
          <div className="metric">
            <div className="kicker">Mean ply</div>
            <div className="value">{formatNum(metrics.meanPly)}</div>
          </div>
          <div className="metric">
            <div className="kicker">Mean latency ms</div>
            <div className="value">{formatNum(metrics.meanLatencyMs, 0)}</div>
          </div>
          <div className="metric">
            <div className="kicker">Stockfish ACPL W / B</div>
            <div className="value">
              {formatAcplPair(metrics.acplWhite, metrics.acplBlack)}
            </div>
          </div>
          <div className="metric">
            <div className="kicker">Inacc / mistake / blunder</div>
            <div className="value">
              {metrics.inaccuracies} / {metrics.mistakes} / {metrics.blunders}
            </div>
          </div>
          <div className="metric">
            <div className="kicker">Stockfish annotated</div>
            <div className="value">
              {metrics.annotatedGames} / {metrics.games}
            </div>
          </div>
        </div>
        {Object.keys(metrics.termination).length > 0 && (
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Terminations:{' '}
            {Object.entries(metrics.termination)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · ')}
          </p>
        )}
      </section>

      <section className="panel">
        <h3>Games</h3>
        {logs.length === 0 ? (
          <p className="muted">No games yet. Play or run a batch, then export or commit JSON into public/benchmarks.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>White</th>
                <th>Black</th>
                <th>Result</th>
                <th>End</th>
                <th>Ply</th>
                <th>ACPL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.startedAt.slice(0, 19).replace('T', ' ')}</td>
                  <td>{log.white.modelConfig?.name ?? log.white.type}</td>
                  <td>{log.black.modelConfig?.name ?? log.black.type}</td>
                  <td>{winnerLabel(log.winner)}</td>
                  <td>{terminationLabel(log.termination)}</td>
                  <td>{log.plies.length}</td>
                  <td className="num">
                    {formatAcplPair(log.stockfish?.acplWhite, log.stockfish?.acplBlack)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      disabled={exporting}
                      onClick={() => void exportOne(log)}
                    >
                      JSON
                    </button>{' '}
                    {local.some((g) => g.id === log.id) && (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => void deleteGame(log.id).then(() => refresh())}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
