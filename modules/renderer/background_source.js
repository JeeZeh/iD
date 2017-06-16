import * as d3 from 'd3';
import _ from 'lodash';
import { t } from '../util/locale';
import { geoExtent, geoPolygonIntersectsPolygon } from '../geo/index';
import { jsonpRequest } from '../util/jsonp_request';


export function rendererBackgroundSource(data) {
    var source = _.clone(data),
        offset = [0, 0],
        name = source.name,
        description = source.description,
        best = !!source.best;

    source.scaleExtent = data.scaleExtent || [0, 20];
    source.overzoom = data.overzoom !== false;


    source.offset = function(_) {
        if (!arguments.length) return offset;
        offset = _;
        return source;
    };


    source.nudge = function(_, zoomlevel) {
        offset[0] += _[0] / Math.pow(2, zoomlevel);
        offset[1] += _[1] / Math.pow(2, zoomlevel);
        return source;
    };


    source.name = function() {
        return t('imagery.' + source.id + '.name', { default: name });
    };


    source.description = function() {
        return t('imagery.' + source.id + '.description', { default: description });
    };


    source.best = function() {
        return best;
    };


    source.area = function() {
        if (!data.polygon) return Number.MAX_VALUE;  // worldwide
        var area = d3.geoArea({ type: 'MultiPolygon', coordinates: [ data.polygon ] });
        return isNaN(area) ? 0 : area;
    };


    source.imageryUsed = function() {
        return name || source.id;
    };


    source.url = function(coord) {
        return data.template
            .replace('{x}', coord[0])
            .replace('{y}', coord[1])
            // TMS-flipped y coordinate
            .replace(/\{[t-]y\}/, Math.pow(2, coord[2]) - coord[1] - 1)
            .replace(/\{z(oom)?\}/, coord[2])
            .replace(/\{switch:([^}]+)\}/, function(s, r) {
                var subdomains = r.split(',');
                return subdomains[(coord[0] + coord[1]) % subdomains.length];
            })
            .replace('{u}', function() {
                var u = '';
                for (var zoom = coord[2]; zoom > 0; zoom--) {
                    var b = 0;
                    var mask = 1 << (zoom - 1);
                    if ((coord[0] & mask) !== 0) b++;
                    if ((coord[1] & mask) !== 0) b += 2;
                    u += b.toString();
                }
                return u;
            });
    };


    source.intersects = function(extent) {
        extent = extent.polygon();
        return !data.polygon || data.polygon.some(function(polygon) {
            return geoPolygonIntersectsPolygon(polygon, extent, true);
        });
    };


    source.validZoom = function(z) {
        return source.scaleExtent[0] <= z &&
            (source.overzoom || source.scaleExtent[1] > z);
    };


    source.isLocatorOverlay = function() {
        return source.id === 'mapbox_locator_overlay';
    };


    source.copyrightNotices = function() {};


    return source;
}


rendererBackgroundSource.Bing = function(data, dispatch) {
    // http://msdn.microsoft.com/en-us/library/ff701716.aspx
    // http://msdn.microsoft.com/en-us/library/ff701701.aspx

    data.template = 'https://ecn.t{switch:0,1,2,3}.tiles.virtualearth.net/tiles/a{u}.jpeg?g=587&mkt=en-gb&n=z';

    var bing = rendererBackgroundSource(data),
        key = 'Arzdiw4nlOJzRwOz__qailc8NiR31Tt51dN2D7cm57NrnceZnCpgOkmJhNpGoppU', // Same as P2 and JOSM
        url = 'https://dev.virtualearth.net/REST/v1/Imagery/Metadata/Aerial?include=ImageryProviders&key=' +
            key + '&jsonp={callback}',
        providers = [];

    jsonpRequest(url, function(json) {
        providers = json.resourceSets[0].resources[0].imageryProviders.map(function(provider) {
            return {
                attribution: provider.attribution,
                areas: provider.coverageAreas.map(function(area) {
                    return {
                        zoom: [area.zoomMin, area.zoomMax],
                        extent: geoExtent([area.bbox[1], area.bbox[0]], [area.bbox[3], area.bbox[2]])
                    };
                })
            };
        });
        dispatch.call('change');
    });

    bing.copyrightNotices = function(zoom, extent) {
        zoom = Math.min(zoom, 21);
        return providers.filter(function(provider) {
            return _.some(provider.areas, function(area) {
                return extent.intersects(area.extent) &&
                    area.zoom[0] <= zoom &&
                    area.zoom[1] >= zoom;
            });
        }).map(function(provider) {
            return provider.attribution;
        }).join(', ');
    };

    bing.logo = 'bing_maps.png';
    bing.terms_url = 'https://blog.openstreetmap.org/2010/11/30/microsoft-imagery-details';

    return bing;
};


rendererBackgroundSource.None = function() {
    var source = rendererBackgroundSource({ id: 'none', template: '' });

    source.name = function() {
        return t('background.none');
    };

    source.imageryUsed = function() {
        return 'None';
    };

    source.area = function() {
        return -1;  // sources in background pane are sorted by area
    };

    return source;
};


rendererBackgroundSource.Custom = function(template) {
    var source = rendererBackgroundSource({ id: 'custom', template: template });

    source.name = function() {
        return t('background.custom');
    };

    source.imageryUsed = function() {
        return 'Custom (' + template + ')';
    };

    source.area = function() {
        return -2;  // sources in background pane are sorted by area
    };

    return source;
};
