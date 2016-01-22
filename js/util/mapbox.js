'use strict';

var config = require('./config');
var browser = require('./browser');

function normalizeURL(url, pathPrefix, accessToken) {
    accessToken = accessToken || config.ACCESS_TOKEN;

    if (!accessToken && config.REQUIRE_ACCESS_TOKEN) {
        throw new Error('An API access token is required to use Mapbox GL. ' +
            'See https://www.mapbox.com/developers/api/#access-tokens');
    }

    url = url.replace(/^mapbox:\/\//, config.API_URL + pathPrefix);
    url += url.indexOf('?') !== -1 ? '&access_token=' : '?access_token=';

    if (config.REQUIRE_ACCESS_TOKEN) {
        if (accessToken[0] === 's') {
            throw new Error('Use a public access token (pk.*) with Mapbox GL JS, not a secret access token (sk.*). ' +
                'See https://www.mapbox.com/developers/api/#access-tokens');
        }

        url += accessToken;
    }

    return url;
}

module.exports.normalizeStyleURL = function(url, accessToken) {
    if (!url.match(/^mapbox:\/\/styles\//))
        return url;

    var split = url.split('/');
    var user = split[3];
    var style = split[4];
    var draft = split[5] ? '/draft' : '';
    return normalizeURL('mapbox://' + user + '/' + style + draft, '/styles/v1/', accessToken);
};

module.exports.normalizeSourceURL = function(url, accessToken) {
    if (!url.match(/^mapbox:\/\//))
        return url;

    // TileJSON requests need a secure flag appended to their URLs so
    // that the server knows to send SSL-ified resource references.
    return normalizeURL(url + '.json', '/v4/', accessToken) + '&secure';
};

module.exports.normalizeGlyphsURL = function(url, accessToken) {
    if (!url.match(/^mapbox:\/\//))
        return url;

    var user = url.split('/')[3];
    return normalizeURL('mapbox://' + user + '/{fontstack}/{range}.pbf', '/fonts/v1/', accessToken);
};

module.exports.normalizeSpriteURL = function(url, format, ext, accessToken) {
    if (!url.match(/^mapbox:\/\/sprites\//))
        return url + format + ext;

    var split = url.split('/');
    var user = split[3];
    var style = split[4];
    var draft = split[5] ? '/draft' : '';
    return normalizeURL('mapbox://' + user + '/' + style + draft + '/sprite' + format + ext, '/styles/v1/', accessToken);
};

module.exports.normalizeTileURL = function(url, sourceUrl) {
    if (!sourceUrl || !sourceUrl.match(/^mapbox:\/\//))
        return url;

    // Mapbox raster sources always use the @2x suffix on the v4 tile API
    // to ensure a maximum 512 image size.
    url = url.replace(/([?&]access_token=)tk\.[^&]+/, '$1' + config.ACCESS_TOKEN);
    var extension = browser.supportsWebp ? 'webp' : '$1';
    return url.replace(/\.((?:png|jpg)\d*)(?=$|\?)/, '@2x.' + extension);
};

module.exports.normalizeTileSize = function(tileSize, sourceUrl) {
    if (!sourceUrl || !sourceUrl.match(/^mapbox:\/\//))
        return tileSize;
    return browser.devicePixelRatio >= 2 ? 256 : 512;
};

