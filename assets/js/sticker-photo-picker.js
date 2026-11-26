class StickerPhotoPicker {
    static MAPLIBRE_URL = 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl';
    static STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
    static COPIED_DURATION = 1500;
    // Close enough to see streets, while keeping the surroundings in view.
    static PICK_ZOOM = 13;
    static LOCATION_TIMEOUT = 10000;
    static LOCATION_ERRORS = {
        1: 'Location access was denied. Click the map to place the pin instead.',
        2: 'Your location could not be found. Click the map to place the pin instead.',
        3: 'Finding your location took too long. Try again or click the map.',
    };
    // The tip of the pin is the bottom centre of the 24x32 box, which is where anchor 'bottom' puts the coordinates.
    static PIN_SVG = '<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true">'
        + '<path d="M12 32C12 32 0 19.5 0 12a12 12 0 0 1 24 0c0 7.5-12 20-12 20z" fill="#fff"/>'
        + '<path d="M12 28.5C12 28.5 2.5 18.5 2.5 12a9.5 9.5 0 0 1 19 0c0 6.5-9.5 16.5-9.5 16.5z" fill="#F26822"/>'
        + '<circle cx="12" cy="12" r="3.5" fill="#fff"/>'
        + '</svg>';

    constructor(container, readout) {
        this.container = container;
        this.coordinates = readout.querySelector('[data-coordinates]');
        this.copyButton = readout.querySelector('[data-copy]');
        this.copyLabel = this.copyButton.textContent;
        this.locateButton = readout.querySelector('[data-locate]');
        this.locateLabel = this.locateButton.textContent;
        this.locationError = readout.querySelector('[data-location-error]');
        this.marker = null;

        this.copyButton.addEventListener('click', () => this.copy());
        this.locateButton.addEventListener('click', () => this.locate());
        this.observeViewport();
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
        this.loadLibrary()
            .then(() => this.init())
            .catch(() => {
                this.container.querySelector('.sticker-map-placeholder').textContent = 'The map could not be loaded.';
            });
    }

    loadLibrary() {
        const load = (element) => new Promise((resolve, reject) => {
            element.onload = resolve;
            element.onerror = reject;
            document.head.appendChild(element);
        });

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = `${StickerPhotoPicker.MAPLIBRE_URL}.css`;
        const script = document.createElement('script');
        script.src = `${StickerPhotoPicker.MAPLIBRE_URL}.js`;

        // The pin relies on the .maplibregl-marker positioning, so wait for the CSS as well.
        return Promise.all([load(css), load(script)]);
    }

    init() {
        this.map = new maplibregl.Map({
            container: this.container,
            style: StickerPhotoPicker.STYLE_URL,
            center: [10, 30],
            zoom: 1.2,
        });
        this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        this.map.on('style.load', () => this.map.setProjection({ type: 'globe' }));
        this.map.on('load', () => {
            this.container.querySelector('.sticker-map-placeholder')?.remove();
        });
        this.map.on('click', (event) => {
            this.placePin(event.lngLat);
            this.zoomTo(event.lngLat);
        });
        // Only offer the button once there is a map to put the pin on.
        this.locateButton.hidden = !('geolocation' in navigator);
    }

    locate() {
        this.locationError.hidden = true;
        this.locateButton.disabled = true;
        this.locateButton.textContent = 'Locating…';

        const done = () => {
            this.locateButton.disabled = false;
            this.locateButton.textContent = this.locateLabel;
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                done();
                const lngLat = [position.coords.longitude, position.coords.latitude];
                this.placePin(lngLat);
                // Unlike a click, the location can be outside the current view, so always centre on it.
                this.map.flyTo({
                    center: lngLat,
                    zoom: Math.max(this.map.getZoom(), StickerPhotoPicker.PICK_ZOOM),
                    essential: true,
                });
            },
            (error) => {
                done();
                this.locationError.textContent = StickerPhotoPicker.LOCATION_ERRORS[error.code]
                    ?? StickerPhotoPicker.LOCATION_ERRORS[2];
                this.locationError.hidden = false;
            },
            { enableHighAccuracy: true, timeout: StickerPhotoPicker.LOCATION_TIMEOUT },
        );
    }

    placePin(lngLat) {
        if (!this.marker) {
            const pin = document.createElement('div');
            pin.className = 'sticker-picker-pin';
            pin.innerHTML = StickerPhotoPicker.PIN_SVG;
            this.marker = new maplibregl.Marker({ element: pin, draggable: true, anchor: 'bottom' })
                .setLngLat(lngLat)
                .addTo(this.map);
            this.marker.on('drag', () => this.showCoordinates());
        } else {
            this.marker.setLngLat(lngLat);
        }
        this.showCoordinates();
    }

    zoomTo(lngLat) {
        if (this.map.getZoom() >= StickerPhotoPicker.PICK_ZOOM) return;
        this.map.flyTo({ center: lngLat, zoom: StickerPhotoPicker.PICK_ZOOM, essential: true });
    }

    showCoordinates() {
        const { lat, lng } = this.marker.getLngLat().wrap();
        this.coordinates.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        this.coordinates.classList.add('is-set');
        this.locationError.hidden = true;
        this.copyButton.disabled = false;
    }

    async copy() {
        if (!this.marker) return;
        try {
            await navigator.clipboard.writeText(this.coordinates.textContent);
        } catch {
            return;
        }
        this.copyButton.textContent = 'Copied';
        clearTimeout(this.copiedTimeout);
        this.copiedTimeout = setTimeout(() => {
            this.copyButton.textContent = this.copyLabel;
        }, StickerPhotoPicker.COPIED_DURATION);
    }
}

const stickerPhotoPickerContainer = document.getElementById('sticker-photo-picker');
if (stickerPhotoPickerContainer) {
    new StickerPhotoPicker(
        stickerPhotoPickerContainer,
        document.getElementById('sticker-photo-picker-readout'),
    );
}
