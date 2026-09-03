import { describe, expect, it } from 'vitest'
import { buildPublicRoute, parsePathRoute } from './routing'

describe('player comparison routes', () => {
  it('builds a shareable player profile and head-to-head URL', () => {
    expect(
      buildPublicRoute('players', {
        playerId: 'player-one',
        comparePlayerAId: 'player-one',
        comparePlayerBId: 'player-two',
      }),
    ).toBe('/players?player=player-one&playerA=player-one&playerB=player-two')
  })

  it('parses player profile and comparison state from the query string', () => {
    expect(
      parsePathRoute(
        '/players/',
        '?player=player-one&playerA=player-one&playerB=player-two',
      ),
    ).toEqual({
      page: 'public',
      tab: 'players',
      playerId: 'player-one',
      comparePlayerAId: 'player-one',
      comparePlayerBId: 'player-two',
    })
  })

  it('preserves comparison state on legacy player path routes', () => {
    expect(
      parsePathRoute(
        '/players/player%20one',
        '?playerA=player-one&playerB=player-two',
      ),
    ).toEqual({
      page: 'public',
      tab: 'players',
      playerId: 'player one',
      comparePlayerAId: 'player-one',
      comparePlayerBId: 'player-two',
    })
  })

  it('does not crash on a malformed encoded player path', () => {
    expect(parsePathRoute('/players/%E0%A4%A')).toEqual({
      page: 'public',
      tab: 'players',
      playerId: '%E0%A4%A',
      comparePlayerAId: undefined,
      comparePlayerBId: undefined,
    })
  })
})
