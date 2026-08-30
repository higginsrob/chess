import { describe, expect, it } from 'vitest'
import { speakSan } from './speakSan'

describe('speakSan', () => {
  it('names a piece move with spaced destination', () => {
    expect(speakSan('Nf3')).toBe('Knight to f 3')
  })

  it('speaks captures and check', () => {
    expect(speakSan('Nxf3+')).toBe('Knight takes f 3 check')
  })

  it('speaks checkmate', () => {
    expect(speakSan('Qh4#')).toBe('Queen to h 4 checkmate')
  })

  it('speaks pawn moves and captures', () => {
    expect(speakSan('e4')).toBe('pawn to e 4')
    expect(speakSan('dxe5')).toBe('pawn takes e 5')
  })

  it('speaks castling', () => {
    expect(speakSan('O-O')).toBe('castles kingside')
    expect(speakSan('O-O-O')).toBe('castles queenside')
  })

  it('speaks promotion', () => {
    expect(speakSan('e8=Q')).toBe('pawn to e 8 promotes to queen')
    expect(speakSan('exd8=Q#')).toBe('pawn takes d 8 promotes to queen checkmate')
  })

  it('includes disambiguation', () => {
    expect(speakSan('Nbd2')).toBe('Knight b to d 2')
    expect(speakSan('R1a3')).toBe('Rook 1 to a 3')
  })

  it('strips annotations', () => {
    expect(speakSan('Nf3!')).toBe('Knight to f 3')
  })
})
