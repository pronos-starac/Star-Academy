// Envoie une notification pour chaque nouveau commentaire sur une quotidienne :
// - aux joueurs qui ont déjà commenté cette quotidienne (option « thread », activée par défaut) ;
// - aux joueurs qui veulent tous les commentaires (option « all »).
// Une réponse à un commentaire arrive à son auteur avec le titre « X t’a répondu ».
// Une réponse à un avis de chanson (onglet Prime) arrive à l'auteur de l'avis et aux joueurs déjà dans ce fil.
// Jamais à l'auteur. Plusieurs commentaires sont regroupés en une seule notification par joueur.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const SITE = 'https://pronos-starac.github.io/Star-Academy/';
import { readFileSync } from 'node:fs';
const DEF = { prime: true, thread: true, all: false, noNom: false, noSun: false };
// --- anti-spoiler : mêmes règles que sur le site ---
const LAUNCH = [2026, 9, 10];
const parisOffset = (y, m, d) => { const t = Date.UTC(y, m, d); return (t >= Date.UTC(2026, 9, 25) && t < Date.UTC(2027, 2, 28)) ? 1 : 2; };
const primeStart = n => { const y = LAUNCH[0], m = LAUNCH[1], d = LAUNCH[2] + 7 * n; return Date.UTC(y, m, d, 21 - parisOffset(y, m, d), 10); };
const fold = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SPOIL_RE = /\b(nomin\w*|nomme\w*|depart\w*|quitt\w*|abandon\w*|immuni\w*|elimin\w*|parti|partie de l.aventure|s.en va|annul\w*)\b/;
const NAMES = { amel:'Amel', antoine:'Antoine', brieuc:'Brieuc', cameron:'Cameron', elija:'Elija', felix:'Félix', isabella:'Isabella', khalil:'Khalil', kylian:'Kylian', leeloo:'Leeloo', maud:'Maud', melina:'Mélina', morgan:'Morgan', noemie:'Noémie', tracy:'Tracy', ydriss:'Ydriss', zoe:'Zoé' };
// anti-spoiler du dimanche : du début du prime à dimanche minuit (lundi 0h, heure de Paris)
const defaultLock = n => { const d = new Date(Date.UTC(LAUNCH[0], LAUNCH[1], LAUNCH[2] + 7 * n + 2)); const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  return Date.UTC(y, m, day, 0 - parisOffset(y, m, day), 0); };
const RESULT_RE = /\b(immuni\w*|elimin\w*|sauve\w*|gagn\w*|perd\w*|sort\w*|quitt\w*|depart\w*|parti|partie|ko|adieu|bye|vainqu\w*|bravo)\b/;
const sunWeek = now => { let n = 0; while (primeStart(n + 1) <= now) n++; return now >= primeStart(n) && now < defaultLock(n) ? n : -1; };
const SUN = sunWeek(Date.now());
const isSunSpoil = (text, at) => { if (SUN < 0 || at < primeStart(SUN)) return false; const t = fold(text);
  return RESULT_RE.test(t) || Object.values(NAMES).some(n => new RegExp('\\b' + fold(n) + '\\b').test(t)); };
const recapWeek = id => { const [y, m, d] = id.split('-').map(Number); return Math.max(0, Math.ceil((Date.UTC(y, m - 1, d) - Date.UTC(LAUNCH[0], LAUNCH[1], LAUNCH[2])) / 864e5 / 7)); };
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Secret FIREBASE_SERVICE_ACCOUNT manquant.'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const stRef = db.doc('season/notifs');

const st = await stRef.get();
// Première fois : on ne rattrape que la dernière heure (pas tout l'historique).
const hourAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
const last = (st.exists && st.data().lastCommentAt) || hourAgo;
const lastSr = (st.exists && st.data().lastSongReplyAt) || hourAgo;
const [fresh, freshSr] = await Promise.all([
  db.collection('comments').where('at', '>', last).orderBy('at').get(),
  db.collection('songreplies').where('at', '>', lastSr).orderBy('at').get()]);
if (fresh.empty && freshSr.empty) { console.log('Aucun nouveau commentaire.');
  const init = {}; if (!st.exists || !st.data().lastCommentAt) init.lastCommentAt = Timestamp.now(); if (!st.exists || !st.data().lastSongReplyAt) init.lastSongReplyAt = Timestamp.now();
  if (Object.keys(init).length) await stRef.set(init, { merge: true }); process.exit(0); }
console.log(`${fresh.size} nouveau(x) commentaire(s), ${freshSr.size} réponse(s) sur les chansons.`);

const [allComments, prefsSnap, tokSnap, players] = await Promise.all([
  db.collection('comments').get(), db.collection('notifprefs').get(), db.collection('pushTokens').get(), db.collection('players').get()]);
const prefs = {}; prefsSnap.forEach(d => prefs[d.id] = { ...DEF, ...d.data() });
// élèves dont l'actualité est encore cachée (semaines dont le prime n'a pas commencé)
const spoilNames = new Set();
try {
  const season = (await db.doc('season/main').get()).data() || {};
  const weeks = season.weeks || {};
  const add = (k, arr) => { if (Date.now() < primeStart(+k)) (arr || []).forEach(id => NAMES[id] && spoilNames.add(fold(NAMES[id]))); };
  Object.entries(weeks).forEach(([k, w]) => { add(k, w.nominees); add(k, w.quit); add(k, w.immCands); });
  const rec = JSON.parse(readFileSync('recaps.json', 'utf8'));
  (rec.items || []).forEach(it => { const k = recapWeek(it.id); add(k, it.nominees); add(k, it.quit); add(k, it.immCands); });
} catch (e) { console.log('Anti-spoiler : données indisponibles', e.message); }
const isSpoil = text => { const t = fold(text); if (SPOIL_RE.test(t)) return true; for (const n of spoilNames) if (new RegExp('\\b' + n + '\\b').test(t)) return true; return false; };
const pref = uid => prefs[uid] || DEF;
const names = {}; players.forEach(d => names[d.id] = (d.data().name || 'Quelqu’un'));
const tokens = {}; tokSnap.forEach(d => { const u = d.data().uid; (tokens[u] = tokens[u] || []).push(d.id); });
const authorOf = {};                // auteur de chaque commentaire (pour les réponses)
allComments.forEach(d => authorOf[d.id] = d.data().uid);
const lastAtOf = {};                // premier commentaire de chaque joueur par quotidienne
allComments.forEach(d => { const c = d.data(); const k = c.recap + '|' + c.uid, t = c.at ? c.at.toMillis() : 0;
  if (!(k in lastAtOf) || t < lastAtOf[k]) lastAtOf[k] = t; });

// À qui envoyer quoi : { uid: [{recap, author, text}] }
const out = {};
let maxAt = last;
fresh.forEach(d => {
  const c = d.data(); if (!c.at) return;
  if (c.at.toMillis() > maxAt.toMillis()) maxAt = c.at;
  for (const uid of Object.keys(tokens)) {
    if (uid === c.uid) continue;
    const p = pref(uid);
    const inThread = (c.recap + '|' + uid) in lastAtOf && lastAtOf[c.recap + '|' + uid] < c.at.toMillis();
    const toMe = typeof c.parent === 'string' && authorOf[c.parent] === uid;
    if (p.all || (p.thread && (inThread || toMe))) (out[uid] = out[uid] || []).push({ recap: c.recap, author: names[c.uid] || 'Quelqu’un', text: c.text, at: c.at.toMillis(), toMe });
  }
});

// Réponses aux avis des chansons : à l'auteur de l'avis et à ceux qui ont déjà répondu dans le fil.
let maxSr = lastSr;
if (!freshSr.empty) {
  const songIds = [...new Set(freshSr.docs.map(d => d.data().song))];
  const [songDocs, threadSnap] = await Promise.all([
    Promise.all(songIds.map(id => db.collection('songs').doc(id).get())),
    db.collection('songreplies').where('song', 'in', songIds.slice(0, 30)).get()]);
  const titles = {}; songDocs.forEach(d => titles[d.id] = d.exists ? (d.data().title || 'une chanson') : 'une chanson');
  const thread = {}; threadSnap.forEach(d => { const r = d.data(); (thread[r.parent] = thread[r.parent] || []).push({ uid: r.uid, at: r.at ? r.at.toMillis() : 0 }); });
  freshSr.forEach(d => {
    const r = d.data(); if (!r.at) return;
    if (r.at.toMillis() > maxSr.toMillis()) maxSr = r.at;
    const owner = r.parent.slice(r.song.length + 1), at = r.at.toMillis();
    const to = new Set([owner]); (thread[r.parent] || []).forEach(x => { if (x.at < at) to.add(x.uid); });
    for (const uid of to) {
      if (uid === r.uid || !tokens[uid] || !pref(uid).thread) continue;
      (out[uid] = out[uid] || []).push({ prime: r.prime, title: titles[r.song] || 'une chanson', author: names[r.uid] || 'Quelqu’un', text: r.text, at, toMe: uid === owner });
    }
  });
}

const day = id => { const [y, m, d] = id.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
console.log(`${Object.keys(tokens).length} joueur(s) avec notifications activées.`);
let ok = 0, ko = 0; const dead = [];
for (const [uid, list] of Object.entries(out)) {
  const recaps = [...new Set(list.filter(x => x.recap).map(x => x.recap))];
  const one = list.length === 1 ? list[0] : null, lastOne = list[list.length - 1];
  const title = one && one.prime != null ? (one.toMe ? `↩️ ${one.author} t’a répondu (« ${one.title} »)` : `💬 ${one.author} dans le fil de « ${one.title} »`)
    : one ? (one.toMe ? `↩️ ${one.author} t’a répondu (quotidienne du ${day(one.recap)})` : `💬 ${one.author} sur la quotidienne du ${day(one.recap)}`) : `💬 ${list.length} nouveaux commentaires`;
  const hide = pref(uid).noNom && list.some(x => isSpoil(x.text));
  const hideSun = !hide && pref(uid).noSun && list.some(x => isSunSpoil(x.text, x.at));
  const body = hide ? '🙈 Message masqué (spoiler possible avant le prime)' : hideSun ? '🙈 Message masqué (spoiler possible du prime)' : one ? one.text.slice(0, 140) : !recaps.length ? 'Sur les chansons du prime' : (recaps.length === 1 ? `Sur la quotidienne du ${day(recaps[0])}` : `Sur ${recaps.length} quotidiennes`);
  const isSong = lastOne.prime != null;
  const link = SITE + (isSong ? '?pr=' + lastOne.prime : '?rc=' + lastOne.recap);
  const res = await getMessaging().sendEachForMulticast({
    tokens: tokens[uid], notification: { title, body },
    data: { title, body, link, tag: isSong ? 'sr-' + lastOne.prime : 'cm-' + lastOne.recap },
    webpush: { fcmOptions: { link }, notification: { icon: SITE + 'icons/icon-192.png' } }
  });
  res.responses.forEach((r, j) => { if (r.success) ok++; else { ko++; const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') dead.push(tokens[uid][j]); } });
}
for (const t of dead) await db.collection('pushTokens').doc(t).delete();
await stRef.set({ lastCommentAt: maxAt, lastSongReplyAt: maxSr }, { merge: true });
console.log(`Destinataires : ${Object.keys(out).length} · envoyées : ${ok} · échecs : ${ko} · jetons périmés : ${dead.length}`);
