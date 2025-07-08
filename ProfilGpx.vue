<template>
    <div class="ProfilGpx"
         :class="{
             'ProfilGpx--empty': trackpoints.length === 0
         }">
        <line-chart-component v-if="readyToRender && trackpoints.length > 0"
                              :chart-data="chartData"
                              :options="chartOptions"
                              :waypoints="waypoints"
                              :trackpoints="trackpoints"
                              :profil-info="profilInfo"
                              :web-info="infosData"
                              :current-km="parseFloat(infos?.specifics?.distance_en_cours?.toFixed(1) || 0)"
                              :key="key" />
    </div>
</template>

<script>
    import { mapGetters } from 'vuex';

    const DOMParser = process.client ? window.DOMParser : require('@xmldom/xmldom').DOMParser;

    export default {
        name: 'ProfilGpx',
        data () {
            return {
                key: 0,

                chartData: {
                    datasets: []
                },
                chartOptions: {
                    responsive: true,

                    maintainAspectRatio: true,
                    legend: {
                        display: false
                    },
                    animation: { duration: 0 },
                    tooltips: { enabled: false }
                },
                waypoints: [],
                trackpoints: [],
                profilInfo: {},
                infosData: {},
                readyToRender: false
            };
        },
        async fetch () {
            this.infosData = JSON.parse(JSON.stringify(this.infos));
            await this.init();
        },
        props: {
            infos: {
                type: Object,
                default: () => ({})
            }
        },
        components: {
            LineChartComponent: () => import('@/components/live/profil-gpx/LineChart.vue')
        },
        computed: {
            ...mapGetters({
                colorScheme: 'colorScheme'
            })
        },
        watch: {
            'infos.specifics.distance_en_cours': {
                handler (newValue, oldValue) {
                    if (newValue === oldValue) {
                        return;
                    }
                    this.estimateWaypointsTime(
                        this.profilInfo.distance,
                        this.profilInfo.denivele,
                        this.trackpoints
                    );
                },
                deep: true
            }
        },
        mounted () {
            window.addEventListener('resize', this.handleResize);
        },
        beforeDestroy () {
            window.removeEventListener('resize', this.handleResize);
        },
        methods: {
            handleResize () {
                this.key++;
            },
            async init () {
                this.readyToRender = false;
                const {
                    waypoints = [],
                    trackpoints = [],
                    totalDistance = 0,
                    totalDenivele = 0
                } = await this.loadGPX() || {};

                const maxElevation = Math.max(...trackpoints.map(p => p.e));
                const maxDistance = trackpoints[trackpoints.length - 1]?.k;

                this.profilInfo = {
                    distance: totalDistance,
                    denivele: totalDenivele,
                    maxElevation,
                    minElevation: Math.min(...trackpoints.map(p => p.e)),
                    waypointsCount: waypoints.length
                };

                const yMax = Math.max(maxElevation + 350, Math.min(3000, 300 + 600 * Math.log10(1 + maxElevation)));

                // ✅ Define scales once, with dynamic y-axis range
                this.chartOptions.scales = {
                    xAxes: [
                        {
                            type: 'linear',
                            position: 'bottom',
                            ticks: {
                                display: false,
                                autoSkip: false,
                                min: trackpoints[0]?.k,
                                max: maxDistance
                            },
                            gridLines: {
                                drawTicks: false,
                                display: false
                            }
                        }
                    ],
                    yAxes: [
                        {
                            ticks: {
                                display: false,
                                min: maxElevation <= 1000 ? -900 : -500,
                                max: yMax
                            },
                            gridLines: {
                                drawTicks: false,
                                display: false
                            }
                        }
                    ]
                };

                // ✅ Chart data
                this.chartData = {
                    datasets: [
                        {
                            data: trackpoints.map(p => ({ x: p.k, y: p.e })),
                            borderColor: this.colorScheme.value === 'light' ? '#DDDDDD' : '#575756',
                            tension: 0.1,
                            fill: true,
                            borderWidth: 4
                        }
                    ]
                };

                this.waypoints = waypoints;
                this.trackpoints = trackpoints;

                this.estimateWaypointsTime(totalDistance, totalDenivele, trackpoints);

                this.$nextTick(() => {
                    this.readyToRender = true;
                });
            },
            async loadGPX () {
                if (!this.infos?.gpxUrl) {
                    console.error('ProfilGpx: No GPX data provided'); // eslint-disable-line no-console
                    return;
                }

                const res = await this.$axios.getHtml(this.infos.gpxUrl);

                if (res.statusCode === 404) {
                    console.error('❌ GPX file not found'); // eslint-disable-line no-console
                    return;
                }

                const parser = new DOMParser();
                const xml = parser.parseFromString(res, 'application/xml');

                const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
                if (trkpts.length < 2) {
                    console.error('❌ Not enough trackpoints'); // eslint-disable-line no-console
                    return;
                }

                let totalDistance = 0;
                let totalDenivele = 0;

                const tempPoints = [];

                let prev = {};
                let cumulEle = 0;
                let cumulTroncon = 0;
                let d = 0;
                let dp = 0;

                trkpts.forEach((pt, i) => {
                    const lat = parseFloat(pt.getAttribute('lat'));
                    const lon = parseFloat(pt.getAttribute('lon'));
                    const ele =
                        parseFloat(pt.getElementsByTagName('ele')[0]?.textContent) || 0;

                    const segment = this.haversine(
                        prev.lat || lat,
                        prev.lon || lon,
                        lat,
                        lon
                    );
                    d += segment;

                    const deltaEle = ele - (prev.e || ele);
                    if (deltaEle > 0) { dp += deltaEle; }

                    cumulTroncon += segment;
                    cumulEle += deltaEle;

                    const cur = {
                        lat,
                        lon,
                        e: ele,
                        k: parseFloat((d).toFixed(1)),
                        p: 0 // Placeholder for percentage
                    };

                    if (cumulTroncon >= 1) {
                        cur.pente = ((cumulEle / (cumulTroncon * 1000)) * 100) || 0;
                        cumulTroncon = 0;
                        cumulEle = 0;
                    }
                    tempPoints.push(cur);

                    prev = cur;
                });
                totalDistance = Math.round(d * 10) / 10;
                totalDenivele = Math.round(dp);

                // Reduce points to every 10th point for performance
                const NB_POINTS = 624;
                const trackpoints = tempPoints
                    .filter((_, index) => {
                        return index % Math.ceil(tempPoints.length / NB_POINTS) === 0 || index === 0 || index === tempPoints.length - 1 || typeof _.pente !== 'undefined';
                    });

                // Compute percentage based on final cumulative distance
                trackpoints.forEach((pt) => {
                    pt.p = ((pt.k) / totalDistance) * 100;
                });

                // Now extract waypoints from <wpt>
                const wpts = Array.from(xml.getElementsByTagName('wpt'));

                const seen = new Set();
                const waypoints = wpts
                    // Filter waypoints to keep only relevant types
                    .filter((pt) => {
                        const type = pt.getElementsByTagName('type')[0]?.textContent || pt.getElementsByTagName('sym')[0]?.textContent || '';
                        if (type.includes('end_montagne_') || type.includes('montagne_')) {
                            return true;
                        }
                        return ['montagne', 'sprint', 'bonification', 'chrono', 'pave'].includes(type);
                    })
                    // Convert waypoints to objects with lat, lon, name, type, and km
                    .map((pt) => {
                        const lat = parseFloat(pt.getAttribute('lat'));
                        const lon = parseFloat(pt.getAttribute('lon'));
                        const name = (pt.getElementsByTagName('name')[0]?.textContent || '').replace(/\(.*?\)/, ''); // Supprimer le contenu entre parenthèses
                        const type = pt.getElementsByTagName('sym')[0]?.textContent || pt.getElementsByTagName('type')[0]?.textContent || '';
                        let km = parseFloat(pt.getElementsByTagName('type')[0]?.getAttribute('km')) || null;

                        // Find closest trackpoint
                        let closest = trackpoints[0];
                        let minDist = this.haversine(lat, lon, closest.lat, closest.lon);
                        for (const tp of trackpoints) {
                            const d = this.haversine(lat, lon, tp.lat, tp.lon);
                            if (d < minDist) {
                                closest = tp;
                                minDist = d;
                            }
                        }

                        km = parseFloat((km || closest.k).toFixed(1));

                        return {
                            lat,
                            lon,
                            name,
                            t: type,
                            e: closest.e,
                            k: km,
                            p: (km / totalDistance) * 100
                        };
                    })
                    // Filtre les waypoints pour ne garder que ceux qui sont uniques (même latitude et longitude)
                    .filter((wp) => {
                        const key = `${wp.lat}-${wp.lon}-${wp.k}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            return true;
                        }
                        return false;
                    })
                    // Enlève les waypoints de type 'end' et 'start'
                    .filter(wp => wp.t !== 'end' && wp.t !== 'start');

                waypoints.push({
                    lat: trackpoints[0].lat,
                    lon: trackpoints[0].lon,
                    name: this.infos?.specifics?.ville_depart || 'Départ',
                    t: 'start',
                    e: trackpoints[0].e,
                    k: trackpoints[0].k,
                    p: 0
                });
                if (!waypoints.some(wp => wp.k === trackpoints[trackpoints.length - 1].k)) {
                    waypoints.push({
                        lat: trackpoints[trackpoints.length - 1].lat,
                        lon: trackpoints[trackpoints.length - 1].lon,
                        name: this.infos?.specifics?.ville_arrivee || 'Arrivée',
                        t: 'end',
                        e: trackpoints[trackpoints.length - 1].e,
                        k: trackpoints[trackpoints.length - 1].k,
                        p: trackpoints[trackpoints.length - 1].p
                    });
                }
                waypoints.sort((a, b) => a.k - b.k);

                trackpoints[0].type = 'start';
                trackpoints[trackpoints.length - 1].type = 'end';

                const margin = 24 * trackpoints[trackpoints.length - 1].k / 624;

                // Ajout d'un départ et arrivée fictifs dans les trackpoints
                if (trackpoints.length > 0) {
                    trackpoints.unshift({
                        lat: trackpoints[0].lat - 0.00001,
                        lon: trackpoints[0].lon - 0.00001,
                        e: trackpoints[0].e,
                        k: trackpoints[0].k - margin,
                        p: 0
                    });
                    trackpoints.push({
                        lat: trackpoints[trackpoints.length - 1].lat,
                        lon: trackpoints[trackpoints.length - 1].lon,
                        e: trackpoints[trackpoints.length - 1].e,
                        k: trackpoints[trackpoints.length - 1].k + margin,
                        p: trackpoints[trackpoints.length - 1].p
                    });
                }

                return {
                    trackpoints,
                    waypoints,
                    totalDistance,
                    totalDenivele
                };
            },
            estimateWaypointsTime (totalDistance, totalDenivele, trackpoints) {
                if (this.infos?.specifics?.type_course !== 'normal' ||
                    this.infos?.status?.type === 'termine' ||
                    !this.$featureSwitch.isActive('live_cycling_estimate_time')) {
                    return;
                }
                const now = new Date();
                const dateStr = new Date(this.infos?.date).toLocaleString('fr-FR');
                const [hour, minute] = dateStr.split(' ')[1].split(':').map(Number);
                // On utilise l'heure et la minute de la date de l'événement
                const startDate = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                    hour || 0,
                    minute || 0,
                    0,
                    0
                );

                const currentKm = this.infos?.specifics?.distance_en_cours || 0;
                const elapsedTime = (now - startDate) / (1000 * 60 * 60);
                const realSpeed = currentKm > 0 && elapsedTime > 0
                    ? currentKm / elapsedTime
                    : null;
                const vitesse = (realSpeed && currentKm * 2 >= totalDistance) ? realSpeed : this.vitessePrevue(totalDistance, totalDenivele);

                // On enlève les marges avant/après le départ et l'arrivée
                const startTrackpoint = trackpoints.find(tp => tp.type === 'start') || trackpoints[0];
                const endTrackpoint = trackpoints.find(tp => tp.type === 'end') || trackpoints[trackpoints.length - 1];
                const _trackpoints = trackpoints.filter(tp => tp.k >= startTrackpoint?.k && tp.k <= endTrackpoint?.k);

                this.waypoints.forEach((wp, i) => {
                    if (Math.round(wp.k) <= Math.round(currentKm)) {
                        delete wp.estimatedTime;
                        return;
                    }

                    let tempsRestant;
                    if (realSpeed && currentKm * 2 >= totalDistance) {
                        tempsRestant = this.estimerTempsRestant(
                            currentKm,
                            wp.k,
                            vitesse,
                            _trackpoints
                        );
                    } else {
                        tempsRestant = (wp.k - currentKm) / vitesse;
                    }
                    const time = new Date((currentKm > 0 ? new Date() : startDate).getTime() + tempsRestant * 3600000);

                    // arrondir les minutes à 5 minutes près
                    time.setMinutes(Math.round(time.getMinutes() / 5) * 5);

                    wp.estimatedTime = this.$filters.date(time, 'HH\'h\'mm');
                });
            },
            facteurVitesse (pente) {
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
            },
            vitessePrevue (dist, dplus) {
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
            },
            estimerTempsRestant (dep, distanceRestante, vBase, profil) {
                let t = 0;
                let prec = dep;
                let cumulSegment = 0;
                const _profil = profil.filter(p => typeof p.pente !== 'undefined');
                for (let i = 0; i < _profil.length; i++) {
                    const p = _profil[i];
                    if (p.k <= dep) {
                        prec = p.k;
                        continue;
                    }
                    if (p.k > distanceRestante) { break; }
                    cumulSegment += (p.k - prec);
                    if (cumulSegment >= 1) {
                        t += cumulSegment / (vBase * this.facteurVitesse(p.pente));
                        cumulSegment = 0;
                    }
                    prec = p.k;
                }
                return t;
            },
            haversine (lat1, lon1, lat2, lon2) {
                const R = 6371;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) ** 2;
                return 2 * R * Math.asin(Math.sqrt(a));
            }
        }
    };
</script>

<style lang="scss" scoped>
    .ProfilGpx {
        width: 100%;
        min-height: 377px;

        &--empty {
            min-height: 0;
        }
    }
</style>
