import type { Chess } from 'chess.js'
import type { ChatMessage, GameSnapshot } from '../types'
import { classifyTacticalOffersAsync } from './lookAhead'
import { buildChatMessages } from './prompt'
import { classifyRepetition } from './repetition'
import { classifyImmediateDraws } from './termination'
import { tacticsBriefingTextAsync } from './tactics'

export async function buildTurnMessages(
  chess: Chess,
  snapshot: GameSnapshot,
  extraSystemPrompt?: string,
): Promise<{ messages: ChatMessage[]; offeredSans: string[] }> {
  const classified = classifyRepetition(chess, snapshot.legalSans)
  const draws = classifyImmediateDraws(chess, classified.offeredSans)
  const tactical = await classifyTacticalOffersAsync(snapshot.fen, draws.offeredSans)
  const offeredSans = tactical.offeredSans
  const tacticsBriefing = await tacticsBriefingTextAsync(snapshot.fen, snapshot.turn, offeredSans)
  return {
    offeredSans,
    messages: buildChatMessages({
      color: snapshot.turn,
      fen: snapshot.fen,
      pgn: snapshot.pgn,
      legalSans: offeredSans,
      lastSan: snapshot.lastMove?.san,
      extraSystemPrompt,
      positionOccurrences: classified.positionOccurrences,
      filteredRepetition: classified.offeredSans.length < snapshot.legalSans.length,
      filteredImmediateDraw: draws.offeredSans.length < classified.offeredSans.length,
      forcedMate: tactical.forcedMate,
      filteredDanger: tactical.filteredDanger,
      filteredEndgameShortlist: tactical.filteredEndgameShortlist,
      rankedEndgame: tactical.rankedEndgame,
      tacticsBriefing,
    }),
  }
}
