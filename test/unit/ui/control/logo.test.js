import {test} from '../../../util/test.js';
import {createMap as globalCreateMap} from '../../../util/index.js';
import VectorTileSource from '../../../../src/source/vector_tile_source.js';

function createMap(t, logoPosition, logoRequired, deleteStyle) {
    const options = {
        style: {
            version: 8,
            sources: {
                'composite': createSource({
                    minzoom: 1,
                    maxzoom: 10,
                    attribution: "Mapbox",
                    tiles: [
                        "http://example.com/{z}/{x}/{y}.png"
                    ]
                }, logoRequired)
            },
            layers: []
        },
        logoPosition: logoPosition || undefined,
        deleteStyle: deleteStyle || undefined
    };

    if (deleteStyle) delete options.style;
    return globalCreateMap(t, options);
}

function createSource(options, logoRequired) {
    const source = new VectorTileSource('id', options, {send () {}});
    source.onAdd({
        _requestManager: {
            _skuToken: '1234567890123',
            canonicalizeTileset: tileJSON => tileJSON.tiles
        },
        transform: {angle: 0, pitch: 0, showCollisionBoxes: false},
        _getMapId: () => 1
    });
    source.on('error', (e) => {
        throw e.error;
    });
    const logoFlag = "mapbox_logo";
    source[logoFlag] = logoRequired === undefined ? true : logoRequired;
    return source;
}

test('LogoControl appears in bottom-left by default', (t) => {
    const map = createMap(t);
    map.on('load', () => {
        t.equal(map.getContainer().querySelectorAll(
            '.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-logo'
        ).length, 1);
        t.end();
    });
});

test('LogoControl appears in the position specified by the position option', (t) => {
    const map = createMap(t, 'top-left');
    map.on('load', () => {
        t.equal(map.getContainer().querySelectorAll(
            '.mapboxgl-ctrl-top-left .mapboxgl-ctrl-logo'
        ).length, 1);
        t.end();
    });
});

test('LogoControl is displayed when no style is supplied', (t) => {
    const map = createMap(t, 'bottom-left', false, true, true);
    t.equal(map.getContainer().querySelector('.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl').style.display, 'block');
    t.end();
});

test('LogoControl is not displayed when the mapbox_logo property is false', (t) => {
    const map = createMap(t, 'top-left', false);
    map.on('load', () => {
        t.equal(map.getContainer().querySelectorAll('.mapboxgl-ctrl-top-left > .mapboxgl-ctrl')[0].style.display, 'none');
        t.end();
    });
});

test('LogoControl is not added more than once', (t) => {
    const map = createMap(t);
    const source = createSource({
        minzoom: 1,
        maxzoom: 10,
        attribution: "Mapbox",
        tiles: [
            "http://example.com/{z}/{x}/{y}.png"
        ]
    });
    map.on('load', () => {
        t.equal(map.getContainer().querySelectorAll('.mapboxgl-ctrl-logo').length, 1, 'first LogoControl');
        map.addSource('source2', source);
        map.on('sourcedata', (e) => {
            if (e.isSourceLoaded && e.sourceId === 'source2' && e.sourceDataType === 'metadata') {
                t.equal(map.getContainer().querySelectorAll('.mapboxgl-ctrl-logo').length, 1, 'only one LogoControl is added with multiple sources');
                t.end();
            }
        });
    });
});

test('LogoControl appears in compact mode if container is less then 250 pixel wide', (t) => {
    const map = createMap(t);
    const container = map.getContainer();

    Object.defineProperty(map.getContainer(), 'getBoundingClientRect', {value: () => ({height: 200, width: 255})});
    Object.defineProperty(map.getCanvasContainer(), 'offsetWidth', {value: 255, configurable: true});
    map.resize();

    t.equal(container.querySelectorAll('.mapboxgl-ctrl-logo:not(.mapboxgl-compact)').length, 1);

    Object.defineProperty(map.getContainer(), 'getBoundingClientRect', {value: () => ({height: 200, width: 245})});
    Object.defineProperty(map.getCanvasContainer(), 'offsetWidth', {value: 245, configurable: true});
    map.resize();

    t.equal(container.querySelectorAll('.mapboxgl-ctrl-logo.mapboxgl-compact').length, 1);

    t.end();
});

test('LogoControl has `rel` nooper and nofollow', (t) => {
    const map = createMap(t);

    map.on('load', () => {
        const container = map.getContainer();
        const logo = container.querySelector('.mapboxgl-ctrl-logo');

        t.equal(logo.rel, 'noopener nofollow');

        t.end();
    });
});
