// As of 2026-08-06, config.py's WATCHLIST sector values already ARE a clean,
// human-readable 15-label display taxonomy (Nifty 50, Bank, Fin Service,
// Energy, ...), matching a friend's separately-built tool — so no further
// clustering is needed for the Heatmap. (Previously this remapped ~20
// fine-grained sectors into synthetic "NIFTY XXX" groups; that mapping now
// lives in momentumScore.js/momentum_score.py, scoped to scoring only, since
// applying it here would wrongly collide old fine-sector names like "Energy"
// or "Pharma" with the new, differently-populated display sectors of the
// same name.)
export function niftyGroup(sector) {
  return sector || "";
}
