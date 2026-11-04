// Calendrier des primes, mêmes règles que sur le site (index.html) :
// le samedi par défaut, déplacé quand un résumé de recaps.json porte "primeDate"
// (date du prochain prime, celui qui clôt la semaine de ce résumé).
import { readFileSync } from 'node:fs';

export const LAUNCH = [2026, 9, 10];
export const parisOffset = (y, m, d) => { const t = Date.UTC(y, m, d); return (t >= Date.UTC(2026, 9, 25) && t < Date.UTC(2027, 2, 28)) ? 1 : 2; };
const dayNum = (y, m, d) => Math.round(Date.UTC(y, m, d) / 864e5);
const idDayNum = id => { const [y, m, d] = id.split('-').map(Number); return dayNum(y, m - 1, d); };
const RE = /^\d{4}-\d{2}-\d{2}$/;

export function loadRecaps() { try { return JSON.parse(readFileSync('recaps.json', 'utf8')); } catch (e) { console.log('recaps.json illisible', e.message); return { items: [] }; } }

let MOVES = {};
export const primeDay = n => { if (MOVES[n]) return MOVES[n]; const d = new Date(Date.UTC(LAUNCH[0], LAUNCH[1], LAUNCH[2] + 7 * n)); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
const primeDayNum = n => { const [y, m, d] = primeDay(n); return dayNum(y, m, d); };
export function setPrimeMoves(items) {
  MOVES = {};
  (Array.isArray(items) ? items : []).filter(x => x && typeof x.id === 'string' && RE.test(x.id) && typeof x.primeDate === 'string' && RE.test(x.primeDate))
    .sort((a, b) => a.id.localeCompare(b.id)).forEach(x => {
      const day = idDayNum(x.id), pd = idDayNum(x.primeDate); if (pd < day || pd > day + 13) return;
      let n = 1; while (n < 60 && primeDayNum(n) < day) n++; if (n >= 60) return;
      if (pd <= primeDayNum(n - 1) || pd >= primeDayNum(n + 1)) return;
      const [y, m, d] = x.primeDate.split('-').map(Number); MOVES[n] = [y, m - 1, d];
    });
}
export const primeStart = n => { const [y, m, d] = primeDay(n); return Date.UTC(y, m, d, 21 - parisOffset(y, m, d), 10); };
// dimanche minuit (lundi 0h, heure de Paris) qui suit le prime
export const defaultLock = n => { const [py, pm, pd] = primeDay(n), dow = new Date(Date.UTC(py, pm, pd)).getUTCDay();
  const d = new Date(Date.UTC(py, pm, pd + ((8 - dow) % 7 || 7))); const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  return Date.UTC(y, m, day, 0 - parisOffset(y, m, day), 0); };
export const recapWeek = id => { const day = idDayNum(id); if (day <= primeDayNum(0)) return 0; let n = 1; while (n < 60 && primeDayNum(n) < day) n++; return n; };
// le jour donné (AAAA-MM-JJ, heure de Paris) est-il un jour de prime ?
export const isPrimeDay = ymd => { const day = idDayNum(ymd); for (let n = 1; n < 60; n++) { const p = primeDayNum(n); if (p === day) return n; if (p > day) break; } return 0; };
