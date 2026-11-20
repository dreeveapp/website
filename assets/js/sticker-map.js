class StickerMap {
    static MAPLIBRE_URL = 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl';
    static STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
    static ORANGE = '#F26822';
    static CLUSTER_MAX_ZOOM = 12;
    static DEEP_LINK_ZOOM = 9;

    constructor(container, {
        dataUrl = 'stickers.geojson',
        mapUrl = '/sticker-map',
        preview = false,
        lazy = false,
        deepLinks = false,
    } = {}) {
        this.container = container;
        this.dataUrl = dataUrl;
        this.mapUrl = mapUrl;
        this.preview = preview;
        this.deepLinks = deepLinks;
        this.features = new Map();
        this.markers = new Map();
        this.shown = new Set();
        this.dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

        if (preview) {
            container.addEventListener('click', (event) => {
                if (event.target.closest('a, .maplibregl-ctrl')) return;
                window.location.href = mapUrl;
            });
        }
        lazy ? this.observeViewport() : this.load();
    }

    observeViewport() {
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            this.load();
        }, { rootMargin: '400px 0px' });
        observer.observe(this.container);
    }

    load() {
        Promise.all([this.loadLibrary(), this.loadData()])
            .then(([, data]) => this.init(data))
            .catch(() => {
                this.container.querySelector('.sticker-map-placeholder').textContent = 'The map could not be loaded.';
            });
    }

    loadLibrary() {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = `${StickerMap.MAPLIBRE_URL}.css`;
        document.head.appendChild(css);

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${StickerMap.MAPLIBRE_URL}.js`;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async loadData() {
        const response = await fetch(this.dataUrl);
        if (!response.ok) throw new Error(`Could not load ${this.dataUrl}`);
        return response.json();
    }

    init(data) {
        for (const feature of data.features) {
            this.features.set(feature.properties.id, feature);
        }

        this.map = new maplibregl.Map({
            container: this.container,
            style: StickerMap.STYLE_URL,
            center: [10, 30],
            zoom: 1.2,
            interactive: !this.preview,
        });
        if (!this.preview) {
            this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') this.closePopups();
            });
        }
        this.map.on('style.load', () => this.map.setProjection({ type: 'globe' }));
        this.map.on('load', () => {
            this.container.querySelector('.sticker-map-placeholder')?.remove();
            this.addStickers(data);
            if (this.deepLinks) this.initDeepLinks();
        });
    }

    addStickers(data) {
        this.map.addSource('stickers', {
            type: 'geojson',
            data,
            cluster: true,
            clusterRadius: 50,
            clusterMaxZoom: StickerMap.CLUSTER_MAX_ZOOM,
        });
        this.map.addLayer({
            id: 'sticker-clusters',
            type: 'circle',
            source: 'stickers',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': StickerMap.ORANGE,
                'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
            },
        });
        this.map.addLayer({
            id: 'sticker-cluster-count',
            type: 'symbol',
            source: 'stickers',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['Noto Sans Bold'],
                'text-size': 13,
            },
            paint: { 'text-color': '#ffffff' },
        });

        if (!this.preview) {
            this.map.on('click', 'sticker-clusters', async (event) => {
                const [cluster] = event.features;
                const zoom = await this.map.getSource('stickers').getClusterExpansionZoom(cluster.properties.cluster_id);
                this.map.easeTo({ center: cluster.geometry.coordinates, zoom });
            });
            this.map.on('mouseenter', 'sticker-clusters', () => { this.map.getCanvas().style.cursor = 'pointer'; });
            this.map.on('mouseleave', 'sticker-clusters', () => { this.map.getCanvas().style.cursor = ''; });
        }
        this.map.on('render', () => this.syncMarkers());
    }

    syncMarkers() {
        if (!this.map.isSourceLoaded('stickers')) return;

        const visible = new Set();
        for (const feature of this.map.querySourceFeatures('stickers')) {
            if (feature.properties.cluster) continue;
            const { id } = feature.properties;
            visible.add(id);
            if (this.shown.has(id)) continue;
            if (!this.markers.has(id)) {
                this.markers.set(id, this.createMarker(feature));
            }
            this.markers.get(id).addTo(this.map);
            this.shown.add(id);
        }

        for (const id of this.shown) {
            if (visible.has(id)) continue;
            this.markers.get(id).remove();
            this.shown.delete(id);
        }
    }

    createMarker(feature) {
        const { id, place, photo } = feature.properties;
        const pin = document.createElement(this.preview ? 'a' : 'button');
        if (this.preview) {
            pin.href = `${this.mapUrl}#${encodeURIComponent(id)}`;
        } else {
            pin.type = 'button';
        }
        pin.className = 'sticker-pin';
        const thumbnail = document.createElement('span');
        thumbnail.style.backgroundImage = `url("${photo}")`;
        pin.appendChild(thumbnail);
        pin.setAttribute('aria-label', `Dreeve sticker in ${place}`);

        const marker = new maplibregl.Marker({ element: pin }).setLngLat(feature.geometry.coordinates);
        if (!this.preview) marker.setPopup(this.createPopup(feature));

        return marker;
    }

    createPopup(feature) {
        const { id, place, date, photo } = feature.properties;
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = photo;
        img.alt = `Dreeve sticker in ${place}`;
        img.loading = 'lazy';
        const caption = document.createElement('figcaption');
        const title = document.createElement('strong');
        title.textContent = place;
        const time = document.createElement('time');
        time.dateTime = date;
        time.textContent = this.dateFormat.format(new Date(date));
        caption.append(title, time);
        figure.append(img, caption);

        const popup = new maplibregl.Popup({ offset: 24, maxWidth: 'none', closeButton: false, className: 'sticker-popup' })
            .setDOMContent(figure);
        popup.on('open', () => {
            requestAnimationFrame(() => this.panPopupIntoView(popup));
            if (this.deepLinks) history.replaceState(null, '', `#${encodeURIComponent(id)}`);
        });
        popup.on('close', () => {
            if (this.deepLinks && this.hashId() === id) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        });

        return popup;
    }

    closePopups() {
        for (const marker of this.markers.values()) {
            if (marker.getPopup().isOpen()) marker.togglePopup();
        }
    }

    panPopupIntoView(popup, padding = 16) {
        const element = popup.getElement();
        if (!element) return;

        const box = element.getBoundingClientRect();
        const bounds = this.container.getBoundingClientRect();
        const overflow = (start, end, min, max) => {
            if (start < min + padding) return start - min - padding;
            if (end > max - padding) return end - max + padding;
            return 0;
        };
        const dx = overflow(box.left, box.right, bounds.left, bounds.right);
        const dy = overflow(box.top, box.bottom, bounds.top, bounds.bottom);
        if (dx || dy) this.map.panBy([dx, dy]);
    }

    initDeepLinks() {
        const openFromHash = () => {
            const id = this.hashId();
            if (id) this.openSticker(id);
        };
        openFromHash();
        window.addEventListener('hashchange', openFromHash);
    }

    hashId() {
        return decodeURIComponent(window.location.hash.slice(1));
    }

    async openSticker(id) {
        const feature = this.features.get(id);
        if (!feature) return;

        // Try a regional zoom first; if the sticker is still inside a cluster there,
        // go past clusterMaxZoom where every sticker has its own marker.
        for (const zoom of [StickerMap.DEEP_LINK_ZOOM, StickerMap.CLUSTER_MAX_ZOOM + 1]) {
            await this.flyTo(feature.geometry.coordinates, Math.max(zoom, this.map.getZoom()));
            if (this.shown.has(id)) break;
        }

        const marker = this.markers.get(id);
        if (this.shown.has(id) && !marker.getPopup().isOpen()) marker.togglePopup();
    }

    flyTo(center, zoom) {
        const idle = this.map.once('idle');
        this.map.flyTo({ center, zoom, essential: true });
        return idle;
    }
}

const stickerMapContainer = document.getElementById('sticker-map');
if (stickerMapContainer) {
    const { preview, lazy, deepLinks } = stickerMapContainer.dataset;
    new StickerMap(stickerMapContainer, {
        preview: preview !== undefined,
        lazy: lazy !== undefined,
        deepLinks: deepLinks !== undefined,
    });
}
