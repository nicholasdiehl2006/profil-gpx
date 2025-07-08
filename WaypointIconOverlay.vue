<template>
    <div class="WaypointIconOverlay"
         v-if="ready">
        <div v-for="(wp, i) in cleanWaypoints"
             :key="i"
             class="WaypointIconOverlay__container"
             :style="{
                 left: (wp.x ?? 0) - 10 + 'px',
                 top: (wp.y ?? 0) - (wp.t.includes('end_') ? 54 : 30) + 'px',
             }">
            <img :src="`${iconPath}${wp.t}.svg?20250701`"
                 class="WaypointIconOverlay__icon" />

            <div class="WaypointIconOverlay__tooltip"
                 :class="{ 'WaypointIconOverlay__tooltip--left': wp.p > 50 }">
                <div class="WaypointIconOverlay__tooltipType"
                     :style="{ color: getTypeColor(wp.t) }">
                    {{ getTypeLabel(wp.t) }}
                </div>

                <div class="WaypointIconOverlay__tooltipName">
                    {{ wp.name.includes(' - ') ? wp.name?.split(" - ")[1] : (wp.name || "Nom inconnu") }}
                </div>
                <div class="WaypointIconOverlay__tooltipMeta">
                    altitude : {{ wp.e?.toFixed(0) || 0 }}m
                </div>
                <div class="WaypointIconOverlay__tooltipMeta"
                     v-if="endTrackpoint?.k - wp.k > 1">
                    distance à parcourir : {{ parseFloat(endTrackpoint?.k - wp.k).toFixed(1) }} km
                </div>
                <div class="WaypointIconOverlay__tooltipMeta"
                     v-if="wp.estimatedTime && wp.k > currentKm">
                    heure de passage : ≈{{ wp.estimatedTime }}
                </div>
            </div>
        </div>
    </div>
</template>

<script>
    import {
        analyserParcours,
        vitessePrevue,
        estimerTempsRestant,
        heureArrivee
    } from './arrivalEstimator.js';

    export default {
        name: 'WaypointIconOverlay',
        data () {
            return {
                profil: [],
                distanceTotale: 0,
                deniveleTotal: 0,
                iconCache: {},
                ready: false,
                localKm: 0 // this is what will be reactive
            };
        },
        props: {
            waypoints: {
                type: Array,
                required: true
            },
            startTime: Date,
            currentKm: {
                type: Number,
                default: 0
            },
            trackpoints: {
                type: Array,
                default: () => ([])
            },
            percentValue: { type: Number, default: 0 },
            webInfo: { type: Object, default: () => ({}) }
        },
        computed: {
            endTrackpoint () {
                return this.trackpoints.find(tp => tp.type === 'end') || {};
            },
            isFinishOnWaypoint () {
                return this.waypoints.some(wp => wp.t !== 'end' && parseFloat((this.endTrackpoint?.k - wp.k).toFixed(1)) === 0.0);
            },
            cleanWaypoints () {
                let prev = null;
                return this.waypoints
                    .map((wp, i, arr) => {
                        // Vérifie si le point précédent n'est pas trop proche
                        if (!prev) {
                            prev = arr[i - 1];
                        }
                        if (prev && Math.abs(prev.x - wp.x) < 15 && Math.abs(prev.y - wp.y) < 15) {
                            const newWp = {
                                ...wp,
                                y: prev.y - 25 // décaler le point pour éviter le chevauchement
                            };
                            prev = newWp;
                            return newWp;
                        }
                        prev = wp;
                        return wp;
                    })
                    .filter(Boolean);
            },
            iconPath () {
                return '/img/icons/track/cyclisme/' + (this.colorScheme.value === 'dark' ? 'dark/' : '');
            }
        },
        mounted () {
            if (this.trackpoints?.length) {
                this.localKm = this.currentKm; // set it on mount
                const result = analyserParcours(this.trackpoints);
                this.profil = result.profil;
                this.distanceTotale = result.distanceTotale;
                this.deniveleTotal = result.deniveleTotal;
            }
            this.ready = true;
        },
        methods: {
            getTypeLabel (type) {
                if (type.includes('montagne_hc') || type.includes('end_montagne_hc') || type.includes('end_hc')) {
                    return 'hors catégorie';
                } else if (type?.startsWith('montagne_')) {
                    const category = type.replace('montagne_', '');
                    return category === '1'
                        ? '1ère catégorie'
                        : `${category}ème catégorie`;
                } else if (type?.startsWith('end_montagne_')) {
                    const category = type.replace('end_montagne_', '');
                    return category === '1'
                        ? '1ère catégorie'
                        : `${category}ème catégorie`;
                } else if (type?.startsWith('end_')) {
                    const category = type.replace('end_', '');
                    return category === '1'
                        ? '1ère catégorie'
                        : `${category}ème catégorie`;
                } else if (type === 'montagne') {
                    return 'côte';
                } else if (type === 'start') {
                    return 'départ';
                } else if (type === 'end') {
                    return 'arrivée';
                } else if (type === 'chrono') {
                    return 'point intermédiaire';
                }
                return type;
            },
            getTypeColor (type) {
                switch (type) {
                case 'sprint':
                    return '#00A859';
                case 'bonification':
                    return '#5C9EFF';
                case 'pave':
                    return '#6C4A2D';
                case 'chrono':
                    return '#5C9EFF';
                default:
                    return '#D61E00'; // categories or anything else
                }
            },
            getETA (wpKm) {
                if (!this.trackpoints?.length || !this.webInfo?.date) {
                    return '--:--';
                }

                const startDate = new Date(this.webInfo.date);
                const { profil, deniveleTotal } = analyserParcours(this.trackpoints);

                const vitesse = vitessePrevue(wpKm, deniveleTotal);
                const remainingDistance = wpKm - this.currentKm;
                const tempsRestant = estimerTempsRestant(
                    this.currentKm,
                    remainingDistance,
                    vitesse,
                    profil
                );
                const arrivalDate = heureArrivee(startDate, tempsRestant);

                return this.$filters.date(arrivalDate, 'HH\'h\'mm');
            }
        }
    };
</script>

<style scoped lang="scss">
    .WaypointIconOverlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;

        &__container {
            position: absolute;
            pointer-events: auto;

            &:hover .WaypointIconOverlay__tooltip {
                display: flex;
            }
        }

        &__icon {
            width: 20px;
            min-height: 20px;
            cursor: pointer;
        }

        &__tooltip {
            position: absolute;
            bottom: 40px;
            left: 10px;
            z-index: 1;
            display: none; /* Initially hidden */
            flex-direction: column;
            gap: 2px;
            padding: 10px;
            box-sizing: border-box;
            border: 1px solid $color-grey2;
            border-radius: 4px;
            background-color: $color-white;
            white-space: nowrap;
            pointer-events: none;
            transform: none;
            @include fontfamily(regular);

            &::after {
                content: "";
                position: absolute;
                bottom: -5px;
                left: -1px;
                width: 6px;
                height: 10px;
                border-bottom: 1px solid $color-grey2;
                border-left: 1px solid $color-grey2;
                background: $color-white;
                transform: skew(0, -45deg);
            }

            &Type {
                color: $color-red;
                @include fontsize(12, 14);
            }

            &Name {
                margin-bottom: 4px;
                color: $color-black4;
                @include font(bold, 13, 14);
            }

            &Meta {
                color: $color-grey8;
                @include fontsize(12, 14);
            }

            &--left {
                transform: translateX(-100%);
            }

            &--left::after {
                left: auto;
                right: -1px;
                border-left: none;
                border-right: 1px solid $color-grey2;
                transform: skew(0, 45deg);
            }
        }
    }
</style>
