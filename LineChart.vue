<template>
    <div class="LineChart">
        <div class="LineChart__header">
            <div class="LineChart__headerLine">
                <div class="LineChart__headerInfo">
                    <img class="LineChart__headerIcon"
                         :src="`${iconPath}start.svg?20250701`" />
                    <span class="LineChart__headerCity">{{
                        webInfo.specifics.ville_depart || "Départ inconnu"
                    }}</span>
                </div>
                <div class="LineChart__headerTime">
                    <span class="LineChart__headerTimeLabel">{{ formattedStartTime }}</span>
                    <span class="LineChart__headerTimeInfo">départ</span>
                </div>
            </div>

            <div class="LineChart__headerDivider">
                <div class="LineChart__headerDots">
                    <div class="LineChart__headerDot"></div>
                    <div class="LineChart__headerDot"></div>
                    <div class="LineChart__headerDot"></div>
                </div>
                <div class="LineChart__headerDividerLine"></div>
            </div>

            <div class="LineChart__headerLine">
                <div class="LineChart__headerInfo">
                    <img class="LineChart__headerIcon"
                         :src="`${iconPath}end.svg?20250701`" />
                    <span class="LineChart__headerCity"
                          :data-infos="textUnderFinishCity">
                        {{ webInfo.specifics.ville_arrivee || "Arrivée inconnue" }}
                    </span>
                </div>
                <div class="LineChart__headerTime"
                     v-if="webInfo.specifics.type_course === 'normal' && webInfo.end_date">
                    <span class="LineChart__headerTimeLabel">{{ webInfo.end_date | date("HH'h'mm") }}</span>
                    <span class="LineChart__headerTimeInfo">arrivée</span>
                </div>
                <div class="LineChart__headerTime"
                     v-else-if="typeof estimatedFinishTime === 'string'">
                    <span class="LineChart__headerTimeLabel">{{ estimatedFinishTime ? `≈${estimatedFinishTime}` : '--:--' }}</span>
                    <span class="LineChart__headerTimeInfo"
                          v-if="estimatedFinishTime !== ''">arrivée estimée</span>
                </div>
            </div>
        </div>
        <div class="LineChart__chartContainer">
            <canvas ref="canvas"
                    class="LineChart__canvas"
                    style="width: 100%; height: 100%;"></canvas>

            <waypoint-icon-overlay v-if="$data._chart"
                                   :waypoints="_waypoints"
                                   :trackpoints="_trackpoints"
                                   :chart-ref="$data._chart"
                                   :start-time="startTime"
                                   :current-km="currentKm"
                                   :web-info="webInfo" />
        </div>
    </div>
</template>

<script>
    import { mapGetters } from 'vuex';
    import { Line } from 'vue-chartjs';
    import Chart from 'chart.js';

    import WaypointIconOverlay from './WaypointIconOverlay.vue';
    import {
        analyserParcours,
        vitessePrevue,
        estimerTempsRestant,
        heureArrivee
    } from './arrivalEstimator.js';
    import parseStyle from '@/utils/filters/parseStyle';

    function getClosestTrackpoint (k, trackpoints) {
        return trackpoints.reduce((prev, curr) =>
            Math.abs(curr.k - k) < Math.abs(prev.k - k) ? curr : prev
        );
    }

    export default {
        name: 'LineChart',
        data: () => {
            return {
                offsetX: 0,
                offsetY: 0,
                offsetTop: 0,
                offsetBottom: 0,
                blinkAlpha: 1,
                blinkDirection: -1,
                startTime: null
            };
        },
        props: {
            currentKm: { type: Number, default: 0 },
            chartData: { type: Object, required: true },
            options: { type: Object, default: () => ({}) },
            waypoints: { type: Array, default: () => [] },
            trackpoints: { type: Array, default: () => [] },
            webInfo: { type: Object, default: () => ({}) }
        },
        components: {
            WaypointIconOverlay
        },
        extends: Line,
        computed: {
            ...mapGetters({
                colorScheme: 'colorScheme'
            }),
            _waypoints () {
                const xScale = this.$data._chart?.scales['x-axis-0'];
                const yScale = this.$data._chart?.scales['y-axis-0'];
                if (!xScale || !yScale) { return this.waypoints; }

                return this.waypoints.map((wp) => {
                    return {
                        ...wp,
                        x: xScale.getPixelForValue(wp.k),
                        y: yScale.getPixelForValue(wp.e)
                    };
                });
            },
            _trackpoints () {
                const xScale = this.$data._chart?.scales['x-axis-0'];
                const yScale = this.$data._chart?.scales['y-axis-0'];
                if (!xScale || !yScale) { return this.trackpoints; }

                return this.trackpoints.map((tp) => {
                    return {
                        ...tp,
                        x: xScale.getPixelForValue(tp.k),
                        y: yScale.getPixelForValue(tp.e)
                    };
                });
            },
            realTrackpoints () {
                // retourne les trackpoints compris entre le départ et l'arrivée
                const startTrackpoint = this.trackpoints.find(tp => tp.type === 'start');
                const endTrackpoint = this.trackpoints.find(tp => tp.type === 'end');
                if (!startTrackpoint || !endTrackpoint) { return []; }

                return this.trackpoints.filter(tp => tp.k >= startTrackpoint.k && tp.k <= endTrackpoint.k);
            },
            animatedPercent () {
                if (this.webInfo.specifics.type_course === 'normal' && this.trackpoints?.length) {
                    let percent = (this.currentKm / (this.trackpoints?.[this.trackpoints?.length - 1]?.k + Math.abs(this.trackpoints[0]?.k))) * 100;
                    if (percent > 100) {
                        percent = 100;
                    } else if (percent < 0) {
                        percent = 0;
                    }
                    return percent;
                }
                return 0;
            },
            formattedStartTime () {
                const dateStr = this.webInfo?.date;
                if (!dateStr) { return 'Heure inconnue'; }

                return this.$filters.date(dateStr, 'HH\'h\'mm');
            },
            estimatedFinishTime () {
                if (!this._trackpoints?.length || !this.webInfo?.date) {
                    return '--:--';
                }

                return this._waypoints[this._waypoints.length - 1]?.estimatedTime || '';
            },
            textUnderFinishCity () {
                if (this.webInfo.status?.type === 'encours') {
                    if (this.webInfo.specifics?.type_course === 'normal') {
                        return `${Math.round(this.webInfo.specifics?.distance.value - this.webInfo.specifics?.distance_en_cours)}km restants`;
                    }
                }
                return '';
            },
            iconPath () {
                return '/img/icons/track/cyclisme/' + (this.colorScheme.value === 'dark' ? 'dark/' : '');
            }
        },
        watch: {
            chartData (newVal) {
                if (newVal?.datasets?.length) {
                    this.addFillToDatasets();
                    this.updateChart();
                }
            },
            animatedPercent () {
                this.updateChart();
            },
            colorScheme: {
                handler () {
                    this.init();
                },
                deep: true
            }
        },
        mounted () {
            this.init();
            this.startTime = new Date(this.webInfo.date);
        },

        methods: {
            init () {
                this.registerPlugins();
                this.addFillToDatasets();
                this.updateChart();
            },
            registerPlugins () {
                Chart.plugins.register(this.createPlugin('checkpointLinePlugin'));
                Chart.plugins.register(this.createPlugin('kilometragePlugin'));
                Chart.plugins.register(this.createPlugin('waypointCirclePlugin'));
                Chart.plugins.register(this.createPlugin('currentCirclePlugin'));
            },
            createPlugin (name) {
                switch (name) {
                case 'kilometragePlugin':
                    return {
                        afterDatasetsDraw: (chart) => {
                            const { ctx, scales, options } = chart;
                            const {
                                waypoints = [],
                                trackpoints = []
                            } = options;

                            if (
                                !waypoints.length ||
                                !scales['x-axis-0'] ||
                                !scales['y-axis-0']
                            ) { return; }

                            const xScale = scales['x-axis-0'];
                            const canvasHeight = chart.height;
                            const y = canvasHeight - 12; // same as currentCirclePlugin baseline

                            const closest = getClosestTrackpoint(this.currentKm, trackpoints);
                            const closestX = xScale.getPixelForValue(closest.k);

                            ctx.font = '10px "DINNextLTPro-Regular"';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';

                            let i = 0;
                            waypoints.forEach((km) => {
                                const x = xScale.getPixelForValue(km.k);
                                const label = Math.round(km.k);
                                const width = ctx.measureText(label).width;

                                // Avoid label overlap with closest marker
                                if (Math.abs(x - closestX) <= width && this.webInfo.status?.type !== 'termine') {
                                    ctx.fillStyle = 'rgba(122, 122, 121, 0.3)';
                                } else {
                                    ctx.fillStyle = this.colorScheme.value === 'light' ? '#7B7B7A' : '#C5C5C5';
                                }

                                // Avoid label collisions if very close
                                if (
                                    i > 0 &&
                                    Math.abs(x - xScale.getPixelForValue(waypoints[i - 1].k)) <=
                                    12
                                ) {
                                    ctx.fillText(label, x, y + 10);
                                } else {
                                    ctx.fillText(label, x, y);
                                }

                                i += 1;
                            });

                            if (this.currentKm > 0 &&
                                this.webInfo.specifics.type_course === 'normal' &&
                                this.webInfo.status?.type !== 'termine') {
                                // Highlight closest marker in red
                                ctx.fillStyle = '#D61E00';
                                ctx.fillText(this.currentKm, closestX, y);
                            }
                        }
                    };

                case 'waypointCirclePlugin':
                    return {
                        afterDatasetsDraw: (chart) => {
                            const { ctx, scales, options } = chart;
                            const circles = options.waypoints || [];
                            const trackpoints = options.trackpoints || [];
                            const xScale = scales['x-axis-0'];
                            const yScale = scales['y-axis-0'];

                            // 1. Draw waypoint circles
                            circles.forEach((circle) => {
                                const px = xScale.getPixelForValue(circle.k);
                                const py = yScale.getPixelForValue(circle.e);

                                ctx.beginPath();
                                ctx.arc(px, py, 2, 0, 2 * Math.PI);
                                ctx.fillStyle =
                                    circle.k === 0 ||
                                    circle.t === 'start' ||
                                    circle.t === 'end' ||
                                    circle.p === 0 ||
                                    circle.p === 100
                                        ? 'black'
                                        : (this.colorScheme.value === 'light' ? '#7B7B7A' : '#C5C5C5');
                                ctx.fill();
                            });

                            // 2. Draw black circles for first and last trackpoints
                            if (trackpoints.length >= 2) {
                                const first = trackpoints.find(tp => tp.type === 'start') || trackpoints[0];
                                const last = trackpoints.find(tp => tp.type === 'end') || trackpoints[trackpoints.length - 1];

                                [first, last].forEach((tp) => {
                                    const px = xScale.getPixelForValue(tp.k);
                                    const py = yScale.getPixelForValue(tp.e);
                                    ctx.beginPath();
                                    ctx.arc(px, py, 2, 0, 2 * Math.PI);
                                    ctx.fillStyle = 'black';
                                    ctx.fill();
                                });
                            }
                        }
                    };

                case 'checkpointLinePlugin':
                    return {
                        afterDatasetsDraw: (chart) => {
                            const { ctx, scales, options } = chart;
                            const lines = options.waypoints || [];
                            if (!lines.length || !scales['x-axis-0'] || !scales['y-axis-0']) { return; }

                            const xScale = scales['x-axis-0'];
                            const canvasHeight = chart.height;
                            const yBase = canvasHeight - 22;

                            lines.forEach((line, i) => {
                                const x = xScale.getPixelForValue(line.k) + 0.5;

                                // Determine if this line needs to be longer
                                let isOffset = false;
                                if (i > 0) {
                                    const prevX = xScale.getPixelForValue(lines[i - 1].k);
                                    if (Math.abs(x - prevX) <= 12) {
                                        isOffset = true;
                                    }
                                }

                                const yStart =
                                    scales['y-axis-0'].getPixelForValue(line.e) + 0.5;
                                const yEnd = isOffset ? yBase + 10 : yBase;

                                let y = yStart;
                                const color = this.colorScheme.value === 'light' ? 'rgb(128,128,128)' : '';
                                while (y < yEnd) {
                                    ctx.fillStyle = 'rgb(128,128,128)';
                                    ctx.beginPath();
                                    ctx.arc(x, y, 0.5, 0, 2 * Math.PI);
                                    ctx.fill();
                                    y += 3;
                                }
                            });
                        }
                    };

                case 'currentCirclePlugin':
                    return {
                        afterDatasetsDraw: (chart) => {
                            const { ctx, scales, options } = chart;
                            const { trackpoints = [] } = options;
                            if (this.currentKm <= 0 ||
                                this.webInfo.specifics.type_course !== 'normal' ||
                                this.webInfo.status?.type === 'termine') {
                                return; // Skip if currentKm is 0 or less
                            }
                            const xScale = scales['x-axis-0'];
                            const yScale = scales['y-axis-0'];
                            const closest = getClosestTrackpoint(this.currentKm, trackpoints);

                            if (!closest || !isFinite(closest.k) || !isFinite(closest.e)) { return; }

                            const px = xScale.getPixelForValue(closest.k);
                            const py = yScale.getPixelForValue(closest.e);

                            const topY = py;
                            const bottomY = chart.height - 20;
                            const step = 2;

                            // 1. Draw gradient line first
                            let y = topY;
                            while (y < bottomY) {
                                const t = (y - topY) / (bottomY - topY);
                                const r = Math.round(255 * (1 - t) + 128 * t);
                                const g = Math.round(0 * (1 - t) + 128 * t);
                                const b = Math.round(0 * (1 - t) + 128 * t);
                                const alpha = 1 - t;

                                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
                                ctx.beginPath();
                                ctx.arc(px + 0.5, y + 0.5, 0.5, 0, 2 * Math.PI);
                                ctx.fill();

                                y += step;
                            }

                            // 2. Draw the main circle last (on top)
                            ctx.beginPath();
                            ctx.arc(px, py, 4, 0, 2 * Math.PI);
                            ctx.fillStyle = '#D61E00';
                            ctx.fill();
                        }
                    };

                default:
                    return {};
                }
            },

            updateChart () {
                if (!this.chartData || !this.chartData.datasets) { return; }

                const canvas = this.$refs.canvas;
                if (!canvas) { return; } // Skip if canvas is not yet available
                const ctx = canvas.getContext('2d');

                // 🛠️ Fix resize issues
                canvas.width = canvas.clientWidth;
                canvas.height = canvas.clientHeight;

                const gradient = this.getGradientColor(
                    this.animatedPercent,
                    ctx,
                    canvas.clientWidth
                );

                this.chartData.datasets.forEach((dataset) => {
                    dataset.borderColor = gradient;
                });

                this.offsetX = canvas.getBoundingClientRect().left;
                this.offsetY = canvas.getBoundingClientRect().top;

                const mergedOptions = {
                    ...this.options,
                    waypoints: this._waypoints,
                    trackpoints: this._trackpoints,
                    webInfo: this.webInfo
                };

                this.renderChart(this.chartData, mergedOptions);
            },
            addFillToDatasets () {
                this.chartData.datasets.forEach((dataset) => {
                    dataset.backgroundColor = this.colorScheme.value === 'light' ? '#F8F8F8' : '#1D1D1B';
                    dataset.fill = 'end';
                    dataset.borderWidth = 4;
                    dataset.tension = 0.1;
                    dataset.pointRadius = 0;
                });
            },
            getGradientColor (p, ctx, canvasWidth) {
                const gradient = ctx.createLinearGradient(0, 0, canvasWidth, 0);
                const defaultColor = this.colorScheme.value === 'light' ? '#DDDDDD' : '#575756';
                const activeColor = parseStyle(this.webInfo?.specifics?.event_colors?.primary_color || {})?.['background-color'] || '#BAD2EB';

                const marginPercent = (Math.abs(this.trackpoints[0]?.k) / this.trackpoints?.[this.trackpoints?.length - 1]?.k) || 0.1;

                // gris jusqu'au début du parcours
                gradient.addColorStop(0, defaultColor);
                gradient.addColorStop(marginPercent, defaultColor);

                if (this.webInfo?.status?.type === 'termine') {
                    gradient.addColorStop(marginPercent + 0.00001, activeColor);
                    gradient.addColorStop(1 - marginPercent, activeColor);
                } else if (p > 0 && this.webInfo.specifics.type_course === 'normal') {
                    // couleur active
                    gradient.addColorStop(marginPercent + 0.00001, activeColor);

                    let activePercent = (p / 100);
                    if (activePercent > 1 - (marginPercent * 2)) {
                        activePercent = 1 - (marginPercent * 2);
                    }
                    gradient.addColorStop(activePercent + marginPercent, activeColor);
                    gradient.addColorStop(activePercent + marginPercent + 0.00001, defaultColor);
                    if (activePercent + marginPercent < 1 - marginPercent) {
                        gradient.addColorStop(1 - marginPercent, defaultColor);
                    }
                } else {
                    gradient.addColorStop(marginPercent + 0.00001, defaultColor);
                    gradient.addColorStop(1 - marginPercent, defaultColor);
                }

                gradient.addColorStop(1, defaultColor);

                return gradient;
            }
        }
    };
</script>

<style scoped lang="scss">
    .LineChart {
        position: relative;
        width: 100%;
        height: 100%;

        &__header {
            display: flex;
            flex-direction: column;
            gap: 8px;
            justify-content: space-between;
            width: 100%;
            max-width: 624px;
            padding: 20px $span-hr $span-vr-small;
            box-sizing: border-box;
            @include font(regular, 13);
            @include color(background-color, color-grey1);

            @media (min-width: $bp-tablet) {
                padding: 0 0 $span-vr 0;
            }

            &Line {
                display: flex;
                flex-direction: row;
                gap: 4px;
                justify-content: space-between;
                align-items: center;
            }

            &Info {
                display: flex;
                flex-direction: row;
                gap: 4px;
                align-items: center;
            }

            &Icon {
                width: 16px;
                height: 16px;
            }

            &City {
                @include font(bold, 16);
                @include color(color, color-black);

                &::after {
                    content: attr(data-infos);
                    position: absolute;
                    display: block;
                    @include font(regular, 13);
                    @include color(color, color-red);
                    margin-top: 2px;
                }
            }

            &Time {
                display: flex;
                flex-direction: column;
                align-items: flex-end;

                &Label {
                    @include font(regular, 16);
                    @include color(color, color-black);
                }

                &Info {
                    @include font(regular, 13);
                    @include color(color, color-grey8);
                }
            }

            &Divider {
                display: flex;
                flex: 1; /* 🟢 stretches the center */
                flex-direction: row;
                gap: 12px;
                align-items: center;

                &Line {
                    width: 100%;
                    height: 1px;
                    @include color(background-color, color-grey2);
                }
            }

            &Dots {
                display: flex;
                flex-direction: column;
                gap: 4px;
                align-items: left;
                margin-left: 6px;
            }

            &Dot {
                width: 4px;
                height: 4px;
                border-radius: 50%;
                @include color(background-color, color-grey3);
            }
        }

        &__canvas {
            width: 100% !important;
            height: 100% !important;
        }

        &__chartContainer {
            position: relative;
            max-width: 624px;
            height: 246px;
            @include color(background-color, color-white, color-black4-original);

            @media (min-width: $bp-tablet) {
                height: 259px;
            }
        }
    }

</style>
