// src/utils/arrivalEstimator.js

export function haversineDistance (lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

export function analyserParcours (points) {
    let d = 0; let dp = 0; const p = []; let cumulTroncon = 0; let
        cumulEle = 0;
    let prev = points[0];

    for (let i = 1; i < points.length; i++) {
        const cur = points[i];
        const dist = haversineDistance(prev.lat, prev.lon, cur.lat, cur.lon);
        d += dist;

        const deltaEle = cur.e - prev.e;
        if (deltaEle > 0) { dp += deltaEle; }

        cumulTroncon += dist;
        cumulEle += deltaEle;

        if (cumulTroncon >= 1) {
            p.push({ distance: d, pente: (cumulEle / (cumulTroncon * 1000)) * 100 });
            cumulTroncon = 0;
            cumulEle = 0;
        }

        prev = cur;
    }

    return {
        profil: p,
        distanceTotale: Math.round(d * 10) / 10,
        deniveleTotal: Math.round(dp)
    };
}

export function facteurVitesse (pente) {
    if (pente > 12) { return 0.25; }
    if (pente > 11) { return 0.3; }
    if (pente > 10) { return 0.35; }
    if (pente > 9) { return 0.4; }
    if (pente > 8) { return 0.45; }
    if (pente > 7) { return 0.5; }
    if (pente > 6) { return 0.55; }
    if (pente > 5) { return 0.6; }
    if (pente > 4) { return 0.65; }
    if (pente > 3) { return 0.7; }
    if (pente > 2) { return 0.75; }
    if (pente > 1) { return 0.8; }
    if (pente < -7) { return 1.4; }
    if (pente < -5) { return 1.3; }
    if (pente < -3) { return 1.2; }
    if (pente < -1) { return 1.1; }
    return 1;
}

export function vitessePrevue (dist, dplus) {
    const pct = dplus / (dist * 10);
    if (pct < 0.5) { return 46; }
    if (pct < 0.75) { return 45; }
    if (pct < 1) { return 44; }
    if (pct < 1.25) { return 43; }
    if (pct < 1.5) { return 42; }
    if (pct < 1.75) { return 41; }
    if (pct < 2) { return 40; }
    if (pct < 2.25) { return 39; }
    if (pct < 2.5) { return 38; }
    if (pct < 2.75) { return 37; }
    if (pct < 3) { return 36; }
    if (pct < 3.25) { return 35; }
    if (pct < 3.5) { return 34; }
    return 33;
}

export function estimerTempsRestant (dep, distanceRestante, vBase, profil) {
    let t = 0;
    let prec = dep;
    for (let i = 0; i < profil.length; i++) {
        const p = profil[i];
        if (p.distance <= dep) { continue; }
        if (p.distance > dep + distanceRestante) { break; }
        const segment = p.distance - prec;
        t += segment / (vBase * facteurVitesse(p.pente));
        prec = p.distance;
    }
    return t;
}

export function heureArrivee (base, heures) {
    return new Date(base.getTime() + heures * 3600000);
}
