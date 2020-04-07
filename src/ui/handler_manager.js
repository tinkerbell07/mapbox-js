// @flow

import {Event} from '../util/evented';
import DOM from '../util/dom';
import type Map from './map';
import HandlerInertia from './handler_inertia';
import {MapEventHandler, BlockableMapEventHandler} from './handler/map_event';
import BoxZoomHandler from './handler/box_zoom';
import TapZoomHandler from './handler/tap_zoom';
import {MousePanHandler, MouseRotateHandler, MousePitchHandler} from './handler/mouse';
import TouchPanHandler from './handler/touch_pan';
import {TouchZoomHandler, TouchRotateHandler, TouchPitchHandler} from './handler/touch_zoom_rotate';
import KeyboardHandler from './handler/keyboard';
import ScrollZoomHandler from './handler/scroll_zoom';
import DoubleClickZoomHandler from './handler/shim/dblclick_zoom';
import ClickZoomHandler from './handler/click_zoom';
import TapDragZoomHandler from './handler/tap_drag_zoom';
import DragPanHandler from './handler/shim/drag_pan';
import DragRotateHandler from './handler/shim/drag_rotate';
import TouchZoomRotateHandler from './handler/shim/touch_zoom_rotate';
import {extend} from '../util/util';
import window from '../util/window';
import Point from '@mapbox/point-geometry';
import assert from 'assert';

export type InputEvent = MouseEvent | TouchEvent | KeyboardEvent | WheelEvent;

const isMoving = p => p.zoom || p.drag || p.pitch || p.rotate;

class RenderFrameEvent extends Event {
    type: 'renderFrame';
    timeStamp: number;
}

// Handlers interpret dom events and return camera changes that should be
// applied to the map (`HandlerResult`s). The camera changes are all deltas.
// The handler itself should have no knowledge of the map's current state.
// This makes it easier to merge multiple results and keeps handlers simpler.
// For example, if there is a mousedown and mousemove, the mousePan handler
// would return a `panDelta` on the mousemove.
export interface Handler {
    enable(): void;
    disable(): void;
    isEnabled(): boolean;
    isActive(): boolean;

    // `reset` can be called by the manager at any time and must reset everything to it's original state
    reset(): void;

    // Handlers can optionally implement these methods.
    // They are called with dom events whenever those dom evens are received.
    +touchstart?: (e: TouchEvent, points: Array<Point>) => HandlerResult | void;
    +touchmove?: (e: TouchEvent, points: Array<Point>) => HandlerResult | void;
    +touchend?: (e: TouchEvent, points: Array<Point>) => HandlerResult | void;
    +touchcancel?: (e: TouchEvent, points: Array<Point>) => HandlerResult | void;
    +mousedown?: (e: MouseEvent, point: Point) => HandlerResult | void;
    +mousemove?: (e: MouseEvent, point: Point) => HandlerResult | void;
    +mouseup?: (e: MouseEvent, point: Point) => HandlerResult | void;
    +dblclick?: (e: MouseEvent, point: Point) => HandlerResult | void;
    +wheel?: (e: WheelEvent, point: Point) => HandlerResult | void;
    +keydown?: (e: KeyboardEvent) => HandlerResult | void;
    +keyup?: (e: KeyboardEvent) => HandlerResult | void;

    // `renderFrame` is the only non-dom event. It is called during render
    // frames and can be used to smooth camera changes (see scroll handler).
    +renderFrame?: () => HandlerResult | void;
}

// All handler methods that are called with events can optionally return a `HandlerResult`.
export type HandlerResult = {|
    panDelta?: Point,
    zoomDelta?: number,
    bearingDelta?: number,
    pitchDelta?: number,
    // the point to not move when changing the camera
    around?: Point | null,
    // same as above, except for pinch actions, which are given higher priority
    pinchAround?: Point | null,
    // A method that can fire a one-off easing by directly changing the map's camera.
    cameraAnimation?: (map: Map) => any;

    // The last three properties are needed by only one handler: scrollzoom.
    // The DOM event to be used as the `originalEvent` on any camera change events.
    originalEvent?: any,
    // Makes the manager trigger a frame, allowing the handler to return multiple results over time (see scrollzoom).
    needsRenderFrame?: boolean,
    // The camera changes won't get recorded for inertial zooming.
    noInertia?: boolean
|};

function hasChange(result: HandlerResult) {
    return (result.panDelta && result.panDelta.mag()) || result.zoomDelta || result.bearingDelta || result.pitchDelta;
}

class HandlerManager {
    _map: Map;
    _el: HTMLElement;
    _handlers: Array<{ handlerName: string, handler: Handler, allowed: any }>;
    _eventsInProgress: Object;
    _frameId: number;
    _inertia: HandlerInertia;
    _bearingSnap: number;
    _handlersById: { [string]: Handler };
    _updatingCamera: boolean;
    _changes: Array<[HandlerResult, Object, any]>;
    _previousActiveHandlers: { [string]: Handler };
    _bearingChanged: boolean;

    constructor(map: Map, options: { interactive: boolean, pitchWithRotate: boolean, clickTolerance: number, bearingSnap: number}) {
        this._map = map;
        this._el = this._map.getCanvasContainer();
        this._handlers = [];
        this._handlersById = {};
        this._changes = [];

        this._inertia = new HandlerInertia(map);
        this._bearingSnap = options.bearingSnap;
        this._previousActiveHandlers = {};

        // Track whether map is currently moving, to compute start/move/end events
        this._eventsInProgress = {};

        this._addDefaultHandlers(options);

        // Bind touchstart and touchmove with passive: false because, even though
        // they only fire a map events and therefore could theoretically be
        // passive, binding with passive: true causes iOS not to respect
        // e.preventDefault() in _other_ handlers, even if they are non-passive
        // (see https://bugs.webkit.org/show_bug.cgi?id=184251)
        this._addListener(this._el, 'touchstart', {passive: false});
        this._addListener(this._el, 'touchmove', {passive: false});
        this._addListener(this._el, 'touchend');
        this._addListener(this._el, 'touchcancel');

        this._addListener(this._el, 'mousedown');
        this._addListener(this._el, 'mousemove');
        this._addListener(this._el, 'mouseup');

        // Bind window-level event listeners for move and up/end events. In the absence of
        // the pointer capture API, which is not supported by all necessary platforms,
        // window-level event listeners give us the best shot at capturing events that
        // fall outside the map canvas element. Use `{capture: true}` for the move event
        // to prevent map move events from being fired during a drag.
        this._addListener(window.document, 'mousemove', {capture: true}, 'windowMousemove');
        this._addListener(window.document, 'mouseup', undefined, 'windowMouseup');

        this._addListener(this._el, 'mouseover');
        this._addListener(this._el, 'mouseout');
        this._addListener(this._el, 'dblclick');
        this._addListener(this._el, 'click');

        this._addListener(this._el, 'keydown', {capture: false});
        this._addListener(this._el, 'keyup');

        this._addListener(this._el, 'wheel', {passive: false});
        this._addListener(this._el, 'contextmenu');

        DOM.addEventListener(window, 'blur', () => this.stop());
    }

    _addListener(element: Element, eventType: string, options: Object, name_?: string) {
        const name = name_ || eventType;
        DOM.addEventListener(element, eventType, e => this._processInputEvent(e, name), options);
    }

    _addDefaultHandlers(options: { interactive: boolean, pitchWithRotate: boolean, clickTolerance: number }) {
        const map = this._map;
        const el = map.getCanvasContainer();
        this._add('mapEvent', new MapEventHandler(map, options));

        const boxZoom = map.boxZoom = new BoxZoomHandler(map, options);
        this._add('boxZoom', boxZoom);

        const tapZoom = new TapZoomHandler();
        const clickZoom = new ClickZoomHandler();
        map.doubleClickZoom = new DoubleClickZoomHandler(clickZoom, tapZoom);
        this._add('tapZoom', tapZoom);
        this._add('clickZoom', clickZoom);

        const tapDragZoom = new TapDragZoomHandler();
        this._add('tapDragZoom', tapDragZoom);

        const touchPitch = map.touchPitch = new TouchPitchHandler();
        this._add('touchPitch', touchPitch);

        const mouseRotate = new MouseRotateHandler(options);
        const mousePitch = new MousePitchHandler(options);
        map.dragRotate = new DragRotateHandler(options, mouseRotate, mousePitch);
        this._add('mouseRotate', mouseRotate, ['mousePitch']);
        this._add('mousePitch', mousePitch, ['mouseRotate']);

        const mousePan = new MousePanHandler(options);
        const touchPan = new TouchPanHandler(options);
        map.dragPan = new DragPanHandler(el, mousePan, touchPan);
        this._add('mousePan', mousePan);
        this._add('touchPan', touchPan, ['touchZoom', 'touchRotate']);

        const touchRotate = new TouchRotateHandler();
        const touchZoom = new TouchZoomHandler();
        map.touchZoomRotate = new TouchZoomRotateHandler(el, touchZoom, touchRotate, tapDragZoom);
        this._add('touchRotate', touchRotate, ['touchPan', 'touchZoom']);
        this._add('touchZoom', touchZoom, ['touchPan', 'touchRotate']);

        const scrollZoom = map.scrollZoom = new ScrollZoomHandler(map, this);
        this._add('scrollZoom', scrollZoom, ['mousePan']);

        const keyboard = map.keyboard = new KeyboardHandler();
        this._add('keyboard', keyboard);

        this._add('blockableMapEvent', new BlockableMapEventHandler(map));

        for (const name of ['boxZoom', 'doubleClickZoom', 'tapDragZoom', 'touchPitch', 'dragRotate', 'dragPan', 'touchZoomRotate', 'scrollZoom', 'keyboard']) {
            if (options.interactive && (options: any)[name]) {
                (map: any)[name].enable((options: any)[name]);
            }
        }
    }

    _add(handlerName: string, handler: Handler, allowed?: Array<string>) {
        this._handlers.push({handlerName, handler, allowed});
        this._handlersById[handlerName] = handler;
    }

    stop() {
        // do nothing if this method was triggered by a gesture update
        if (this._updatingCamera) return;

        for (const {handler} of this._handlers) {
            handler.reset();
        }
        this._inertia.clear();
        this._fireEvents({}, {});
        this._changes = [];
    }

    isActive() {
        for (const {handler} of this._handlers) {
            if (handler.isActive()) return true;
        }
        return false;
    }

    isZooming() {
        return !!this._eventsInProgress.zoom || this._map.scrollZoom.isZooming();
    }
    isRotating() {
        return !!this._eventsInProgress.rotate;
    }

    _blockedByActive(activeHandlers: { [string]: Handler }, allowed: Array<string>, myName: string) {
        for (const name in activeHandlers) {
            if (name === myName) continue;
            if (!allowed || allowed.indexOf(name) < 0) {
                return true;
            }
        }
        return false;
    }

    _processInputEvent(e: InputEvent | RenderFrameEvent, eventName?: string) {

        this._updatingCamera = true;
        assert(e.timeStamp !== undefined);

        const inputEvent = e.type === 'renderFrame' ? undefined : ((e: any): InputEvent);

        /*
         * We don't call e.preventDefault() for any events by default.
         * Handlers are responsible for calling it where necessary.
         */

        const mergedHandlerResult: HandlerResult = {needsRenderFrame: false};
        const eventsInProgress = {};
        const activeHandlers = {};

        const points = e ? (e.targetTouches ?
            DOM.touchPos(this._el, ((e: any): TouchEvent).targetTouches) :
            DOM.mousePos(this._el, ((e: any): MouseEvent))) : null;

        for (const {handlerName, handler, allowed} of this._handlers) {
            if (!handler.isEnabled()) continue;

            let data: HandlerResult | void;
            if (this._blockedByActive(activeHandlers, allowed, handlerName)) {
                handler.reset();

            } else {
                if ((handler: any)[eventName || e.type]) {
                    data = (handler: any)[eventName || e.type](e, points);
                    this.mergeHandlerResult(mergedHandlerResult, eventsInProgress, data, handlerName, inputEvent);
                    if (data && data.needsRenderFrame) {
                        this._triggerRenderFrame();
                    }
                }
            }

            if (data || handler.isActive()) {
                activeHandlers[handlerName] = handler;
            }
        }

        const deactivatedHandlers = {};
        for (const name in this._previousActiveHandlers) {
            if (!activeHandlers[name]) {
                deactivatedHandlers[name] = inputEvent;
            }
        }
        this._previousActiveHandlers = activeHandlers;

        if (Object.keys(deactivatedHandlers).length || hasChange(mergedHandlerResult)) {
            this._changes.push([mergedHandlerResult, eventsInProgress, deactivatedHandlers]);
            this._triggerRenderFrame();
        }

        if (Object.keys(activeHandlers).length || hasChange(mergedHandlerResult)) {
            this._map._stop(true);
        }

        this._updatingCamera = false;

        const {cameraAnimation} = mergedHandlerResult;
        if (cameraAnimation) {
            this._inertia.clear();
            this._fireEvents({}, {});
            this._changes = [];
            cameraAnimation(this._map);
        }
    }

    mergeHandlerResult(mergedHandlerResult: HandlerResult, eventsInProgress: Object, handlerResult: HandlerResult, name: string, e?: InputEvent) {
        if (!handlerResult) return;

        extend(mergedHandlerResult, handlerResult);

        const eventData = {handlerName: name, originalEvent: handlerResult.originalEvent || e};

        // track which handler changed which camera property
        if (handlerResult.zoomDelta !== undefined) {
            eventsInProgress.zoom = eventData;
        }
        if (handlerResult.panDelta !== undefined) {
            eventsInProgress.drag = eventData;
        }
        if (handlerResult.pitchDelta !== undefined) {
            eventsInProgress.pitch = eventData;
        }
        if (handlerResult.bearingDelta !== undefined) {
            eventsInProgress.rotate = eventData;
        }

    }

    _applyChanges() {
        const combined = {};
        const combinedEventsInProgress = {};
        const combinedDeactivatedHandlers = {};

        for (const [change, eventsInProgress, deactivatedHandlers] of this._changes) {

            if (change.panDelta) combined.panDelta = (combined.panDelta || new Point(0, 0))._add(change.panDelta);
            if (change.zoomDelta) combined.zoomDelta = (combined.zoomDelta || 0) + change.zoomDelta;
            if (change.bearingDelta) combined.bearingDelta = (combined.bearingDelta || 0) + change.bearingDelta;
            if (change.pitchDelta) combined.pitchDelta = (combined.pitchDelta || 0) + change.pitchDelta;
            if (change.around !== undefined) combined.around = change.around;
            if (change.pinchAround !== undefined) combined.pinchAround = change.pinchAround;
            if (change.noInertia) combined.noInertia = change.noInertia;

            extend(combinedEventsInProgress, eventsInProgress);
            extend(combinedDeactivatedHandlers, deactivatedHandlers);
        }

        this._updateMapTransform(combined, combinedEventsInProgress, combinedDeactivatedHandlers);
        this._changes = [];
    }

    _updateMapTransform(combinedResult: any, combinedEventsInProgress: Object, deactivatedHandlers: Object) {

        const map = this._map;
        const tr = map.transform;

        if (!hasChange(combinedResult)) {
            return this._fireEvents(combinedEventsInProgress, deactivatedHandlers);
        }

        let {panDelta, zoomDelta, bearingDelta, pitchDelta, around, pinchAround} = combinedResult;

        if (pinchAround !== undefined) {
            around = pinchAround;
        }

        // stop any ongoing camera animations (easeTo, flyTo)
        map._stop(true);

        around = around || map.transform.centerPoint;
        const loc = tr.pointLocation(panDelta ? around.sub(panDelta) : around);
        if (bearingDelta) tr.bearing += bearingDelta;
        if (pitchDelta) tr.pitch += pitchDelta;
        if (zoomDelta) tr.zoom += zoomDelta;
        tr.setLocationAtPoint(loc, around);

        this._map._update();
        if (!combinedResult.noInertia) this._inertia.record(combinedResult);
        this._fireEvents(combinedEventsInProgress, deactivatedHandlers);

    }

    _fireEvents(newEventsInProgress: { [string]: Object }, deactivatedHandlers: Object) {

        const wasMoving = isMoving(this._eventsInProgress);
        const nowMoving = isMoving(newEventsInProgress);

        if (!wasMoving && nowMoving) {
            this._fireEvent('movestart', nowMoving.originalEvent);
        }

        for (const eventName in newEventsInProgress) {
            const {originalEvent} = newEventsInProgress[eventName];
            const isStart = !this._eventsInProgress[eventName];
            this._eventsInProgress[eventName] = newEventsInProgress[eventName];
            if (isStart) {
                this._fireEvent(`${eventName}start`, originalEvent);
            }
        }

        if (newEventsInProgress.rotate) this._bearingChanged = true;

        if (nowMoving) {
            this._fireEvent('move', nowMoving.originalEvent);
        }

        for (const eventName in newEventsInProgress) {
            const {originalEvent} = newEventsInProgress[eventName];
            this._fireEvent(eventName, originalEvent);
        }

        let originalEndEvent;
        for (const eventName in this._eventsInProgress) {
            const {handlerName, originalEvent} = this._eventsInProgress[eventName];
            if (!this._handlersById[handlerName].isActive()) {
                delete this._eventsInProgress[eventName];
                originalEndEvent = deactivatedHandlers[handlerName] || originalEvent;
                this._fireEvent(`${eventName}end`, originalEndEvent);
            }
        }

        const stillMoving = isMoving(this._eventsInProgress);
        if ((wasMoving || nowMoving) && !stillMoving) {
            this._updatingCamera = true;
            const inertialEase = this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions);

            const shouldSnapToNorth = bearing => bearing !== 0 && -this._bearingSnap < bearing && bearing < this._bearingSnap;

            if (inertialEase) {
                if (shouldSnapToNorth(inertialEase.bearing || this._map.getBearing())) {
                    inertialEase.bearing = 0;
                }
                this._map.easeTo(inertialEase, {originalEvent: originalEndEvent});
            } else {
                this._map.fire(new Event('moveend', {originalEvent: originalEndEvent}));
                if (shouldSnapToNorth(this._map.getBearing())) {
                    this._map.resetNorth();
                }
            }
            this._bearingChanged = false;
            this._updatingCamera = false;
        }

    }

    _fireEvent(type: string, e: *) {
        this._map.fire(new Event(type, e ? {originalEvent: e} : {}));
    }

    _triggerRenderFrame() {
        if (this._frameId === undefined) {
            this._frameId = this._map._requestRenderFrame(timeStamp => {
                delete this._frameId;
                this._processInputEvent(new RenderFrameEvent('renderFrame', {timeStamp}));
                this._applyChanges();
            });
        }
    }

}

export default HandlerManager;
