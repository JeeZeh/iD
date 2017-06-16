import * as d3 from 'd3';
import _ from 'lodash';
import { d3keybinding } from '../lib/d3.keybinding.js';
import { t, textDirection } from '../util/locale';
import { rendererBackgroundSource } from '../renderer/index';
import { geoMetersToOffset, geoOffsetToMeters } from '../geo/index';
import { utilDetect } from '../util/detect';
import { utilSetTransform } from '../util/index';
import { svgIcon } from '../svg/index';
import { uiMapInMap } from './map_in_map';
import { uiCmd } from './cmd';
import { uiTooltipHtml } from './tooltipHtml';
import { tooltip } from '../util/tooltip';


export function uiBackground(context) {
    var key = 'B',
        detected = utilDetect(),
        opacities = [1, 0.75, 0.5, 0.25],
        directions = [
            ['right', [0.5, 0]],
            ['top', [0, -0.5]],
            ['left', [-0.5, 0]],
            ['bottom', [0, 0.5]]],
        opacityDefault = (context.storage('background-opacity') !== null) ?
            (+context.storage('background-opacity')) : 1.0,
        customTemplate = context.storage('background-custom-template') || '',
        previous;

    // Can be 0 from <1.3.0 use or due to issue #1923.
    if (opacityDefault === 0) opacityDefault = 1.0;


    function background(selection) {

        function sortSources(a, b) {
            return a.best() && !b.best() ? -1
                : b.best() && !a.best() ? 1
                : d3.descending(a.area(), b.area()) || d3.ascending(a.name(), b.name()) || 0;
        }


        function setOpacity(d) {
            var bg = context.container().selectAll('.layer-background')
                .transition()
                .style('opacity', d)
                .attr('data-opacity', d);

            if (!detected.opera) {
                utilSetTransform(bg, 0, 0);
            }

            opacityList.selectAll('li')
                .classed('active', function(_) { return _ === d; });

            context.storage('background-opacity', d);
        }


        function setTooltips(selection) {
            selection.each(function(d, i, nodes) {
                var item = d3.select(this).select('label'),
                    span = item.select('span'),
                    placement = (i < nodes.length / 2) ? 'bottom' : 'top',
                    description = d.description(),
                    isOverflowing = (span.property('clientWidth') !== span.property('scrollWidth'));

                if (d === previous) {
                    item.call(tooltip()
                        .placement(placement)
                        .html(true)
                        .title(function() {
                            var tip = '<div>' + t('background.switch') + '</div>';
                            return uiTooltipHtml(tip, uiCmd('⌘B'));
                        })
                    );
                } else if (description || isOverflowing) {
                    item.call(tooltip()
                        .placement(placement)
                        .title(description || d.name())
                    );
                } else {
                    item.call(tooltip().destroy);
                }
            });
        }


        function selectLayer() {
            function active(d) {
                return context.background().showsLayer(d);
            }

            content.selectAll('.layer, .custom_layer')
                .classed('active', active)
                .classed('switch', function(d) { return d === previous; })
                .call(setTooltips)
                .selectAll('input')
                .property('checked', active);
        }


        function clickSetSource(d) {
            d3.event.preventDefault();
            previous = context.background().baseLayerSource();
            context.background().baseLayerSource(d);
            selectLayer();
            document.activeElement.blur();
        }


        function editCustom() {
            d3.event.preventDefault();
            var template = window.prompt(t('background.custom_prompt'), customTemplate);
            if (template) {
                setCustom(template);
            } else {
                selectLayer();
            }
        }


        function setCustom(template) {
            context.storage('background-custom-template', template);
            var d = rendererBackgroundSource.Custom(template);
            content.selectAll('.custom_layer').datum(d);
            clickSetSource(d);
        }


        function clickSetOverlay(d) {
            d3.event.preventDefault();
            context.background().toggleOverlayLayer(d);
            selectLayer();
            document.activeElement.blur();
        }


        function drawList(layerList, type, change, filter) {
            var sources = context.background()
                .sources(context.map().extent())
                .filter(filter);

            var layerLinks = layerList.selectAll('li.layer')
                .data(sources, function(d) { return d.name(); });

            layerLinks.exit()
                .remove();

            var enter = layerLinks.enter()
                .insert('li', '.custom_layer')
                .attr('class', 'layer')
                .classed('best', function(d) { return d.best(); });

            enter.filter(function(d) { return d.best(); })
                .append('div')
                .attr('class', 'best')
                .call(tooltip()
                    .title(t('background.best_imagery'))
                    .placement((textDirection === 'rtl') ? 'right' : 'left'))
                .append('span')
                .html('&#9733;');

            var label = enter
                .append('label');

            label
                .append('input')
                .attr('type', type)
                .attr('name', 'layers')
                .on('change', change);

            label
                .append('span')
                .text(function(d) { return d.name(); });


            layerList.selectAll('li.layer')
                .sort(sortSources)
                .style('display', layerList.selectAll('li.layer').data().length > 0 ? 'block' : 'none');
        }


        function update() {
            backgroundList.call(drawList, 'radio', clickSetSource, function(d) { return !d.overlay; });
            overlayList.call(drawList, 'checkbox', clickSetOverlay, function(d) { return d.overlay; });

            selectLayer();

            var source = context.background().baseLayerSource();
            if (source.id === 'custom') {
                customTemplate = source.template;
            }

            updateOffsetVal();
        }


        function updateOffsetVal() {
            var meters = geoOffsetToMeters(context.background().offset()),
                x = +meters[0].toFixed(2),
                y = +meters[1].toFixed(2);

            d3.selectAll('.nudge-inner-rect')
                .select('input')
                .classed('error', false)
                .property('value', x + ', ' + y);

            d3.selectAll('.nudge-reset')
                .classed('disabled', function() {
                    return (x === 0 && y === 0);
                });
        }


        function resetOffset() {
            if (d3.event.button !== 0) return;
            context.background().offset([0, 0]);
            updateOffsetVal();
        }


        function nudge(d) {
            context.background().nudge(d, context.map().zoom());
            updateOffsetVal();
        }


        function buttonOffset(d) {
            if (d3.event.button !== 0) return;
            var timeout = window.setTimeout(function() {
                    interval = window.setInterval(nudge.bind(null, d), 100);
                }, 500),
                interval;

            function doneNudge() {
                window.clearTimeout(timeout);
                window.clearInterval(interval);
                d3.select(window)
                    .on('mouseup.buttonoffset', null, true)
                    .on('mousedown.buttonoffset', null, true);
            }

            d3.select(window)
                .on('mouseup.buttonoffset', doneNudge, true)
                .on('mousedown.buttonoffset', doneNudge, true);

            nudge(d);
        }


        function inputOffset() {
            if (d3.event.button !== 0) return;
            var input = d3.select(this);
            var d = input.node().value;

            if (d === '') return resetOffset();

            d = d.replace(/;/g, ',').split(',').map(function(n) {
                // if n is NaN, it will always get mapped to false.
                return !isNaN(n) && n;
            });

            if (d.length !== 2 || !d[0] || !d[1]) {
                input.classed('error', true);
                return;
            }

            context.background().offset(geoMetersToOffset(d));
            updateOffsetVal();
        }


        function dragOffset() {
            if (d3.event.button !== 0) return;
            var origin = [d3.event.clientX, d3.event.clientY];

            context.container()
                .append('div')
                .attr('class', 'nudge-surface');

            d3.select(window)
                .on('mousemove.offset', function() {
                    var latest = [d3.event.clientX, d3.event.clientY];
                    var d = [
                        -(origin[0] - latest[0]) / 4,
                        -(origin[1] - latest[1]) / 4
                    ];

                    origin = latest;
                    nudge(d);
                })
                .on('mouseup.offset', function() {
                    if (d3.event.button !== 0) return;
                    d3.selectAll('.nudge-surface')
                        .remove();

                    d3.select(window)
                        .on('mousemove.offset', null)
                        .on('mouseup.offset', null);
                });

            d3.event.preventDefault();
        }


        function hide() {
            setVisible(false);
        }


        function toggle() {
            if (d3.event) d3.event.preventDefault();
            tooltipBehavior.hide(button);
            setVisible(!button.classed('active'));
        }


        function quickSwitch() {
            if (previous) {
                clickSetSource(previous);
            }
        }


        function setVisible(show) {
            if (show !== shown) {
                button.classed('active', show);
                shown = show;

                if (show) {
                    selection
                        .on('mousedown.background-inside', function() {
                            d3.event.stopPropagation();
                        });

                    content
                        .style('display', 'block')
                        .style('right', '-300px')
                        .transition()
                        .duration(200)
                        .style('right', '0px');

                    content.selectAll('.layer, .custom_layer')
                        .call(setTooltips);

                } else {
                    content
                        .style('display', 'block')
                        .style('right', '0px')
                        .transition()
                        .duration(200)
                        .style('right', '-300px')
                        .on('end', function() {
                            d3.select(this).style('display', 'none');
                        });

                    selection
                        .on('mousedown.background-inside', null);
                }
            }
        }


        var content = selection
                .append('div')
                .attr('class', 'fillL map-overlay col3 content hide'),
            tooltipBehavior = tooltip()
                .placement((textDirection === 'rtl') ? 'right' : 'left')
                .html(true)
                .title(uiTooltipHtml(t('background.description'), key)),
            button = selection
                .append('button')
                .attr('tabindex', -1)
                .on('click', toggle)
                .call(svgIcon('#icon-layers', 'light'))
                .call(tooltipBehavior),
            shown = false;


        /* opacity switcher */

        var opawrap = content
                .append('div')
                .attr('class', 'opacity-options-wrapper');

        opawrap
            .append('h4')
            .text(t('background.title'));

        var opacityList = opawrap
            .append('ul')
            .attr('class', 'opacity-options');

        opacityList.selectAll('div.opacity')
            .data(opacities)
            .enter()
            .append('li')
            .attr('data-original-title', function(d) {
                return t('background.percent_brightness', { opacity: (d * 100) });
            })
            .on('click.set-opacity', setOpacity)
            .html('<div class="select-box"></div>')
            .call(tooltip()
                .placement((textDirection === 'rtl') ? 'right' : 'left'))
            .append('div')
            .attr('class', 'opacity')
            .style('opacity', function(d) { return 1.25 - d; });


        /* background switcher */

        var backgroundList = content
            .append('ul')
            .attr('class', 'layer-list')
            .attr('dir', 'auto');

        var custom = backgroundList
            .append('li')
            .attr('class', 'custom_layer')
            .datum(rendererBackgroundSource.Custom());

        custom
            .append('button')
            .attr('class', 'layer-browse')
            .call(tooltip()
                .title(t('background.custom_button'))
                .placement((textDirection === 'rtl') ? 'right' : 'left'))
            .on('click', editCustom)
            .call(svgIcon('#icon-search'));

        var label = custom
            .append('label');

        label
            .append('input')
            .attr('type', 'radio')
            .attr('name', 'layers')
            .on('change', function () {
                if (customTemplate) {
                    setCustom(customTemplate);
                } else {
                    editCustom();
                }
            });

        label
            .append('span')
            .text(t('background.custom'));

        content
            .append('div')
            .attr('class', 'imagery-faq')
            .append('a')
            .attr('target', '_blank')
            .attr('tabindex', -1)
            .call(svgIcon('#icon-out-link', 'inline'))
            .attr('href', 'https://github.com/openstreetmap/iD/blob/master/FAQ.md#how-can-i-report-an-issue-with-background-imagery')
            .append('span')
            .text(t('background.imagery_source_faq'));

        var overlayList = content
            .append('ul')
            .attr('class', 'layer-list');

        var controls = content
            .append('div')
            .attr('class', 'controls-list');


        /* minimap toggle */

        var minimapLabel = controls
            .append('label')
            .call(tooltip()
                .html(true)
                .title(uiTooltipHtml(t('background.minimap.tooltip'), '/'))
                .placement('top')
            );

        minimapLabel
            .classed('minimap-toggle', true)
            .append('input')
            .attr('type', 'checkbox')
            .on('change', function() {
                uiMapInMap.toggle();
                d3.event.preventDefault();
            });

        minimapLabel
            .append('span')
            .text(t('background.minimap.description'));


        /* imagery offset controls */

        var adjustments = content
            .append('div')
            .attr('class', 'adjustments');

        adjustments
            .append('a')
            .text(t('background.fix_misalignment'))
            .attr('href', '#')
            .classed('hide-toggle', true)
            .classed('expanded', false)
            .on('click', function() {
                if (d3.event.button !== 0) return;
                var exp = d3.select(this).classed('expanded');
                nudgeContainer.style('display', exp ? 'none' : 'block');
                d3.select(this).classed('expanded', !exp);
                d3.event.preventDefault();
            });

        var nudgeContainer = adjustments
            .append('div')
            .attr('class', 'nudge-container cf')
            .style('display', 'none');

        nudgeContainer
            .append('div')
            .attr('class', 'nudge-instructions')
            .text(t('background.offset'));

        var nudgeRect = nudgeContainer
            .append('div')
            .attr('class', 'nudge-outer-rect')
            .on('mousedown', dragOffset);

        nudgeRect
            .append('div')
            .attr('class', 'nudge-inner-rect')
            .append('input')
            .on('change', inputOffset)
            .on('mousedown', function() {
                if (d3.event.button !== 0) return;
                d3.event.stopPropagation();
            });

        nudgeContainer
            .append('div')
            .selectAll('button')
            .data(directions).enter()
            .append('button')
            .attr('class', function(d) { return d[0] + ' nudge'; })
            .on('mousedown', function(d) {
                if (d3.event.button !== 0) return;
                buttonOffset(d[1]);
            });

        nudgeContainer
            .append('button')
            .attr('title', t('background.reset'))
            .attr('class', 'nudge-reset disabled')
            .on('click', resetOffset)
            .call(
                (textDirection === 'rtl') ? svgIcon('#icon-redo') : svgIcon('#icon-undo')
            );

        context.map()
            .on('move.background-update', _.debounce(update, 1000));

        context.background()
            .on('change.background-update', update);


        update();
        setOpacity(opacityDefault);

        var keybinding = d3keybinding('background')
            .on(key, toggle)
            .on(uiCmd('⌘B'), quickSwitch)
            .on('F', hide)
            .on('H', hide);

        d3.select(document)
            .call(keybinding);

        context.surface().on('mousedown.background-outside', hide);
        context.container().on('mousedown.background-outside', hide);
    }

    return background;
}
