// Notification « le prime commence » via Firebase Cloud Messaging.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { loadRecaps, setPrimeMoves, isPrimeDay } from './calendrier.mjs';

const SITE = 'https://pronos-starac.github.io/Star-Academy/';
const test = process.env.TEST_SEND === 'true';
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error('Secret FIREBASE_SERVICE_ACCOUNT manquant.'); process.exit(1); }

// Heure de Paris
const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
}).formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const minutes = (+parts.hour) * 60 + (+parts.minute);
console.log(`Paris : ${parts.weekday} ${today} ${parts.hour}:${parts.minute} · test=${test}`);

if (!test) {
  setPrimeMoves(loadRecaps().items);
  if (!isPrimeDay(today)) { console.log('Pas de prime aujourd’hui : rien à envoyer.'); process.exit(0); }
  if (minutes < 20 * 60 + 40 || minutes > 21 * 60 + 40) { console.log('Hors du créneau 20h40-21h40 : rien à envoyer.'); process.exit(0); }
}

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const statusRef = db.doc('season/notifs');

if (!test) {
  const season = await db.doc('season/main').get();
  if (!season.exists) { console.log('Saison pas ouverte.'); process.exit(0); }
  const st = await statusRef.get();
  if (st.exists && st.data().lastPrime === today) { console.log('Déjà envoyé aujourd’hui.'); process.exit(0); }
}

const [snap, prefSnap] = await Promise.all([db.collection('pushTokens').get(), db.collection('notifprefs').get()]);
const noPrime = new Set(prefSnap.docs.filter(d => d.data().prime === false).map(d => d.id));
const tokens = snap.docs.filter(d => test || !noPrime.has(d.data().uid)).map(d => d.id);
console.log(`${tokens.length} appareil(s) inscrit(s).`);

const title = test ? 'Test des notifications ✅' : "C'est l'heure du prime ! ⭐";
const body = test ? 'Si tu lis ça, les notifications marchent.' : 'Le prime de la Star Academy commence à 21h10 sur TF1. Rendez-vous dans l’appli !';
let ok = 0, ko = 0; const dead = [];
for (let i = 0; i < tokens.length; i += 500) {
  const batch = tokens.slice(i, i + 500);
  const res = await getMessaging().sendEachForMulticast({
    tokens: batch,
    notification: { title, body },
    data: { title, body, link: SITE, tag: test ? 'test' : 'prime' },
    webpush: { fcmOptions: { link: SITE }, notification: { icon: SITE + 'icons/icon-192.png' } }
  });
  res.responses.forEach((r, j) => {
    if (r.success) ok++;
    else { ko++; const c = r.error && r.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token' || c === 'messaging/invalid-argument') dead.push(batch[j]); }
  });
}
for (const t of dead) await db.collection('pushTokens').doc(t).delete();
console.log(`Envoyées : ${ok} · échecs : ${ko} · jetons périmés supprimés : ${dead.length}`);
if (!test) await statusRef.set({ lastPrime: today, sentAt: FieldValue.serverTimestamp(), ok, ko }, { merge: true });
