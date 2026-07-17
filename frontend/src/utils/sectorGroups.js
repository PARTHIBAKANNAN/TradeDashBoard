// Maps our internal watchlist sectors (config.py WATCHLIST values) to
// NIFTY-style sectoral index display names, used only by the Heatmap screen.
// The Ranking page's Sector filter is untouched and keeps the raw sector value.
const SECTOR_TO_NIFTY_GROUP = {
  Energy: "NIFTY ENERGY",
  Power: "NIFTY ENERGY",
  "Capital Goods": "NIFTY CAPITAL GOODS",
  "Consumer Durables": "NIFTY CONSR DURABLE",
  Infra: "NIFTY INFRA",
  Auto: "NIFTY AUTO",
  "Pvt Banks": "NIFTY BANK",
  "PSU Banks": "NIFTY PSU BANK",
  NBFC: "NIFTY FINSERV",
  Insurance: "NIFTY FINSERV",
  "Capital Markets": "NIFTY FINSERV",
  Healthcare: "NIFTY HEALTHCARE",
  Realty: "NIFTY REALTY",
  IT: "NIFTY IT",
  Pharma: "NIFTY PHARMA",
  Chemicals: "NIFTY CHEMICALS",
  Consumer: "NIFTY CONSUMPTION",
  FMCG: "NIFTY FMCG",
  Cement: "NIFTY CEMENT",
  Metals: "NIFTY METAL",
};

export function niftyGroup(sector) {
  return SECTOR_TO_NIFTY_GROUP[sector] || sector;
}
