(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*! Split.js - v1.3.5 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.Split = factory());
}(this, (function () { 'use strict';

// The programming goals of Split.js are to deliver readable, understandable and
// maintainable code, while at the same time manually optimizing for tiny minified file size,
// browser compatibility without additional requirements, graceful fallback (IE8 is supported)
// and very few assumptions about the user's page layout.
var global = window;
var document = global.document;

// Save a couple long function names that are used frequently.
// This optimization saves around 400 bytes.
var addEventListener = 'addEventListener';
var removeEventListener = 'removeEventListener';
var getBoundingClientRect = 'getBoundingClientRect';
var NOOP = function () { return false; };

// Figure out if we're in IE8 or not. IE8 will still render correctly,
// but will be static instead of draggable.
var isIE8 = global.attachEvent && !global[addEventListener];

// This library only needs two helper functions:
//
// The first determines which prefixes of CSS calc we need.
// We only need to do this once on startup, when this anonymous function is called.
//
// Tests -webkit, -moz and -o prefixes. Modified from StackOverflow:
// http://stackoverflow.com/questions/16625140/js-feature-detection-to-detect-the-usage-of-webkit-calc-over-calc/16625167#16625167
var calc = (['', '-webkit-', '-moz-', '-o-'].filter(function (prefix) {
    var el = document.createElement('div');
    el.style.cssText = "width:" + prefix + "calc(9px)";

    return (!!el.style.length)
}).shift()) + "calc";

// The second helper function allows elements and string selectors to be used
// interchangeably. In either case an element is returned. This allows us to
// do `Split([elem1, elem2])` as well as `Split(['#id1', '#id2'])`.
var elementOrSelector = function (el) {
    if (typeof el === 'string' || el instanceof String) {
        return document.querySelector(el)
    }

    return el
};

// The main function to initialize a split. Split.js thinks about each pair
// of elements as an independant pair. Dragging the gutter between two elements
// only changes the dimensions of elements in that pair. This is key to understanding
// how the following functions operate, since each function is bound to a pair.
//
// A pair object is shaped like this:
//
// {
//     a: DOM element,
//     b: DOM element,
//     aMin: Number,
//     bMin: Number,
//     dragging: Boolean,
//     parent: DOM element,
//     isFirst: Boolean,
//     isLast: Boolean,
//     direction: 'horizontal' | 'vertical'
// }
//
// The basic sequence:
//
// 1. Set defaults to something sane. `options` doesn't have to be passed at all.
// 2. Initialize a bunch of strings based on the direction we're splitting.
//    A lot of the behavior in the rest of the library is paramatized down to
//    rely on CSS strings and classes.
// 3. Define the dragging helper functions, and a few helpers to go with them.
// 4. Loop through the elements while pairing them off. Every pair gets an
//    `pair` object, a gutter, and special isFirst/isLast properties.
// 5. Actually size the pair elements, insert gutters and attach event listeners.
var Split = function (ids, options) {
    if ( options === void 0 ) options = {};

    var dimension;
    var clientDimension;
    var clientAxis;
    var position;
    var paddingA;
    var paddingB;
    var elements;

    // All DOM elements in the split should have a common parent. We can grab
    // the first elements parent and hope users read the docs because the
    // behavior will be whacky otherwise.
    var parent = elementOrSelector(ids[0]).parentNode;
    var parentFlexDirection = global.getComputedStyle(parent).flexDirection;

    // Set default options.sizes to equal percentages of the parent element.
    var sizes = options.sizes || ids.map(function () { return 100 / ids.length; });

    // Standardize minSize to an array if it isn't already. This allows minSize
    // to be passed as a number.
    var minSize = options.minSize !== undefined ? options.minSize : 100;
    var minSizes = Array.isArray(minSize) ? minSize : ids.map(function () { return minSize; });
    var gutterSize = options.gutterSize !== undefined ? options.gutterSize : 10;
    var snapOffset = options.snapOffset !== undefined ? options.snapOffset : 30;
    var direction = options.direction || 'horizontal';
    var cursor = options.cursor || (direction === 'horizontal' ? 'ew-resize' : 'ns-resize');
    var gutter = options.gutter || (function (i, gutterDirection) {
        var gut = document.createElement('div');
        gut.className = "gutter gutter-" + gutterDirection;
        return gut
    });
    var elementStyle = options.elementStyle || (function (dim, size, gutSize) {
        var style = {};

        if (typeof size !== 'string' && !(size instanceof String)) {
            if (!isIE8) {
                style[dim] = calc + "(" + size + "% - " + gutSize + "px)";
            } else {
                style[dim] = size + "%";
            }
        } else {
            style[dim] = size;
        }

        return style
    });
    var gutterStyle = options.gutterStyle || (function (dim, gutSize) { return (( obj = {}, obj[dim] = (gutSize + "px"), obj ))
        var obj; });

    // 2. Initialize a bunch of strings based on the direction we're splitting.
    // A lot of the behavior in the rest of the library is paramatized down to
    // rely on CSS strings and classes.
    if (direction === 'horizontal') {
        dimension = 'width';
        clientDimension = 'clientWidth';
        clientAxis = 'clientX';
        position = 'left';
        paddingA = 'paddingLeft';
        paddingB = 'paddingRight';
    } else if (direction === 'vertical') {
        dimension = 'height';
        clientDimension = 'clientHeight';
        clientAxis = 'clientY';
        position = 'top';
        paddingA = 'paddingTop';
        paddingB = 'paddingBottom';
    }

    // 3. Define the dragging helper functions, and a few helpers to go with them.
    // Each helper is bound to a pair object that contains it's metadata. This
    // also makes it easy to store references to listeners that that will be
    // added and removed.
    //
    // Even though there are no other functions contained in them, aliasing
    // this to self saves 50 bytes or so since it's used so frequently.
    //
    // The pair object saves metadata like dragging state, position and
    // event listener references.

    function setElementSize (el, size, gutSize) {
        // Split.js allows setting sizes via numbers (ideally), or if you must,
        // by string, like '300px'. This is less than ideal, because it breaks
        // the fluid layout that `calc(% - px)` provides. You're on your own if you do that,
        // make sure you calculate the gutter size by hand.
        var style = elementStyle(dimension, size, gutSize);

        // eslint-disable-next-line no-param-reassign
        Object.keys(style).forEach(function (prop) { return (el.style[prop] = style[prop]); });
    }

    function setGutterSize (gutterElement, gutSize) {
        var style = gutterStyle(dimension, gutSize);

        // eslint-disable-next-line no-param-reassign
        Object.keys(style).forEach(function (prop) { return (gutterElement.style[prop] = style[prop]); });
    }

    // Actually adjust the size of elements `a` and `b` to `offset` while dragging.
    // calc is used to allow calc(percentage + gutterpx) on the whole split instance,
    // which allows the viewport to be resized without additional logic.
    // Element a's size is the same as offset. b's size is total size - a size.
    // Both sizes are calculated from the initial parent percentage,
    // then the gutter size is subtracted.
    function adjust (offset) {
        var a = elements[this.a];
        var b = elements[this.b];
        var percentage = a.size + b.size;

        a.size = (offset / this.size) * percentage;
        b.size = (percentage - ((offset / this.size) * percentage));

        setElementSize(a.element, a.size, this.aGutterSize);
        setElementSize(b.element, b.size, this.bGutterSize);
    }

    // drag, where all the magic happens. The logic is really quite simple:
    //
    // 1. Ignore if the pair is not dragging.
    // 2. Get the offset of the event.
    // 3. Snap offset to min if within snappable range (within min + snapOffset).
    // 4. Actually adjust each element in the pair to offset.
    //
    // ---------------------------------------------------------------------
    // |    | <- a.minSize               ||              b.minSize -> |    |
    // |    |  | <- this.snapOffset      ||     this.snapOffset -> |  |    |
    // |    |  |                         ||                        |  |    |
    // |    |  |                         ||                        |  |    |
    // ---------------------------------------------------------------------
    // | <- this.start                                        this.size -> |
    function drag (e) {
        var offset;

        if (!this.dragging) { return }

        // Get the offset of the event from the first side of the
        // pair `this.start`. Supports touch events, but not multitouch, so only the first
        // finger `touches[0]` is counted.
        if ('touches' in e) {
            offset = e.touches[0][clientAxis] - this.start;
        } else {
            offset = e[clientAxis] - this.start;
        }

        // If within snapOffset of min or max, set offset to min or max.
        // snapOffset buffers a.minSize and b.minSize, so logic is opposite for both.
        // Include the appropriate gutter sizes to prevent overflows.
        if (offset <= elements[this.a].minSize + snapOffset + this.aGutterSize) {
            offset = elements[this.a].minSize + this.aGutterSize;
        } else if (offset >= this.size - (elements[this.b].minSize + snapOffset + this.bGutterSize)) {
            offset = this.size - (elements[this.b].minSize + this.bGutterSize);
        }

        // Actually adjust the size.
        adjust.call(this, offset);

        // Call the drag callback continously. Don't do anything too intensive
        // in this callback.
        if (options.onDrag) {
            options.onDrag();
        }
    }

    // Cache some important sizes when drag starts, so we don't have to do that
    // continously:
    //
    // `size`: The total size of the pair. First + second + first gutter + second gutter.
    // `start`: The leading side of the first element.
    //
    // ------------------------------------------------
    // |      aGutterSize -> |||                      |
    // |                     |||                      |
    // |                     |||                      |
    // |                     ||| <- bGutterSize       |
    // ------------------------------------------------
    // | <- start                             size -> |
    function calculateSizes () {
        // Figure out the parent size minus padding.
        var a = elements[this.a].element;
        var b = elements[this.b].element;

        this.size = a[getBoundingClientRect]()[dimension] + b[getBoundingClientRect]()[dimension] + this.aGutterSize + this.bGutterSize;
        this.start = a[getBoundingClientRect]()[position];
    }

    // stopDragging is very similar to startDragging in reverse.
    function stopDragging () {
        var self = this;
        var a = elements[self.a].element;
        var b = elements[self.b].element;

        if (self.dragging && options.onDragEnd) {
            options.onDragEnd();
        }

        self.dragging = false;

        // Remove the stored event listeners. This is why we store them.
        global[removeEventListener]('mouseup', self.stop);
        global[removeEventListener]('touchend', self.stop);
        global[removeEventListener]('touchcancel', self.stop);

        self.parent[removeEventListener]('mousemove', self.move);
        self.parent[removeEventListener]('touchmove', self.move);

        // Delete them once they are removed. I think this makes a difference
        // in memory usage with a lot of splits on one page. But I don't know for sure.
        delete self.stop;
        delete self.move;

        a[removeEventListener]('selectstart', NOOP);
        a[removeEventListener]('dragstart', NOOP);
        b[removeEventListener]('selectstart', NOOP);
        b[removeEventListener]('dragstart', NOOP);

        a.style.userSelect = '';
        a.style.webkitUserSelect = '';
        a.style.MozUserSelect = '';
        a.style.pointerEvents = '';

        b.style.userSelect = '';
        b.style.webkitUserSelect = '';
        b.style.MozUserSelect = '';
        b.style.pointerEvents = '';

        self.gutter.style.cursor = '';
        self.parent.style.cursor = '';
    }

    // startDragging calls `calculateSizes` to store the inital size in the pair object.
    // It also adds event listeners for mouse/touch events,
    // and prevents selection while dragging so avoid the selecting text.
    function startDragging (e) {
        // Alias frequently used variables to save space. 200 bytes.
        var self = this;
        var a = elements[self.a].element;
        var b = elements[self.b].element;

        // Call the onDragStart callback.
        if (!self.dragging && options.onDragStart) {
            options.onDragStart();
        }

        // Don't actually drag the element. We emulate that in the drag function.
        e.preventDefault();

        // Set the dragging property of the pair object.
        self.dragging = true;

        // Create two event listeners bound to the same pair object and store
        // them in the pair object.
        self.move = drag.bind(self);
        self.stop = stopDragging.bind(self);

        // All the binding. `window` gets the stop events in case we drag out of the elements.
        global[addEventListener]('mouseup', self.stop);
        global[addEventListener]('touchend', self.stop);
        global[addEventListener]('touchcancel', self.stop);

        self.parent[addEventListener]('mousemove', self.move);
        self.parent[addEventListener]('touchmove', self.move);

        // Disable selection. Disable!
        a[addEventListener]('selectstart', NOOP);
        a[addEventListener]('dragstart', NOOP);
        b[addEventListener]('selectstart', NOOP);
        b[addEventListener]('dragstart', NOOP);

        a.style.userSelect = 'none';
        a.style.webkitUserSelect = 'none';
        a.style.MozUserSelect = 'none';
        a.style.pointerEvents = 'none';

        b.style.userSelect = 'none';
        b.style.webkitUserSelect = 'none';
        b.style.MozUserSelect = 'none';
        b.style.pointerEvents = 'none';

        // Set the cursor, both on the gutter and the parent element.
        // Doing only a, b and gutter causes flickering.
        self.gutter.style.cursor = cursor;
        self.parent.style.cursor = cursor;

        // Cache the initial sizes of the pair.
        calculateSizes.call(self);
    }

    // 5. Create pair and element objects. Each pair has an index reference to
    // elements `a` and `b` of the pair (first and second elements).
    // Loop through the elements while pairing them off. Every pair gets a
    // `pair` object, a gutter, and isFirst/isLast properties.
    //
    // Basic logic:
    //
    // - Starting with the second element `i > 0`, create `pair` objects with
    //   `a = i - 1` and `b = i`
    // - Set gutter sizes based on the _pair_ being first/last. The first and last
    //   pair have gutterSize / 2, since they only have one half gutter, and not two.
    // - Create gutter elements and add event listeners.
    // - Set the size of the elements, minus the gutter sizes.
    //
    // -----------------------------------------------------------------------
    // |     i=0     |         i=1         |        i=2       |      i=3     |
    // |             |       isFirst       |                  |     isLast   |
    // |           pair 0                pair 1             pair 2           |
    // |             |                     |                  |              |
    // -----------------------------------------------------------------------
    var pairs = [];
    elements = ids.map(function (id, i) {
        // Create the element object.
        var element = {
            element: elementOrSelector(id),
            size: sizes[i],
            minSize: minSizes[i],
        };

        var pair;

        if (i > 0) {
            // Create the pair object with it's metadata.
            pair = {
                a: i - 1,
                b: i,
                dragging: false,
                isFirst: (i === 1),
                isLast: (i === ids.length - 1),
                direction: direction,
                parent: parent,
            };

            // For first and last pairs, first and last gutter width is half.
            pair.aGutterSize = gutterSize;
            pair.bGutterSize = gutterSize;

            if (pair.isFirst) {
                pair.aGutterSize = gutterSize / 2;
            }

            if (pair.isLast) {
                pair.bGutterSize = gutterSize / 2;
            }

            // if the parent has a reverse flex-direction, switch the pair elements.
            if (parentFlexDirection === 'row-reverse' || parentFlexDirection === 'column-reverse') {
                var temp = pair.a;
                pair.a = pair.b;
                pair.b = temp;
            }
        }

        // Determine the size of the current element. IE8 is supported by
        // staticly assigning sizes without draggable gutters. Assigns a string
        // to `size`.
        //
        // IE9 and above
        if (!isIE8) {
            // Create gutter elements for each pair.
            if (i > 0) {
                var gutterElement = gutter(i, direction);
                setGutterSize(gutterElement, gutterSize);

                gutterElement[addEventListener]('mousedown', startDragging.bind(pair));
                gutterElement[addEventListener]('touchstart', startDragging.bind(pair));

                parent.insertBefore(gutterElement, element.element);

                pair.gutter = gutterElement;
            }
        }

        // Set the element size to our determined size.
        // Half-size gutters for first and last elements.
        if (i === 0 || i === ids.length - 1) {
            setElementSize(element.element, element.size, gutterSize / 2);
        } else {
            setElementSize(element.element, element.size, gutterSize);
        }

        var computedSize = element.element[getBoundingClientRect]()[dimension];

        if (computedSize < element.minSize) {
            element.minSize = computedSize;
        }

        // After the first iteration, and we have a pair object, append it to the
        // list of pairs.
        if (i > 0) {
            pairs.push(pair);
        }

        return element
    });

    function setSizes (newSizes) {
        newSizes.forEach(function (newSize, i) {
            if (i > 0) {
                var pair = pairs[i - 1];
                var a = elements[pair.a];
                var b = elements[pair.b];

                a.size = newSizes[i - 1];
                b.size = newSize;

                setElementSize(a.element, a.size, pair.aGutterSize);
                setElementSize(b.element, b.size, pair.bGutterSize);
            }
        });
    }

    function destroy () {
        pairs.forEach(function (pair) {
            pair.parent.removeChild(pair.gutter);
            elements[pair.a].element.style[dimension] = '';
            elements[pair.b].element.style[dimension] = '';
        });
    }

    if (isIE8) {
        return {
            setSizes: setSizes,
            destroy: destroy,
        }
    }

    return {
        setSizes: setSizes,
        getSizes: function getSizes () {
            return elements.map(function (element) { return element.size; })
        },
        collapse: function collapse (i) {
            if (i === pairs.length) {
                var pair = pairs[i - 1];

                calculateSizes.call(pair);

                if (!isIE8) {
                    adjust.call(pair, pair.size - pair.bGutterSize);
                }
            } else {
                var pair$1 = pairs[i];

                calculateSizes.call(pair$1);

                if (!isIE8) {
                    adjust.call(pair$1, pair$1.aGutterSize);
                }
            }
        },
        destroy: destroy,
    }
};

return Split;

})));

},{}],2:[function(require,module,exports){
"use strict";


var Point          = require("./render/point.js").Point
var render_lowlevel = require("./render/render_lowlevel.js");

class BoundingBox
{
    constructor(x0, y0, x1, y1, angle)
    {
        this.centerPoint = new Point((x0+x1)/2,((y0+y1)/2))

        // Translating coordinate to reference center point.
        // This will be needed to properly rotate bounding box around object.
        // Top left point
        this.point0 = new Point(x0-this.centerPoint.x,y0-this.centerPoint.y);
        // Top right point
        this.point1 = new Point(x1-this.centerPoint.x,y0-this.centerPoint.y);
        // Bottom right point
        this.point2 = new Point(x1-this.centerPoint.x,y1-this.centerPoint.y);
        // Bottom left point
        this.point3 = new Point(x0-this.centerPoint.x,y1-this.centerPoint.y);

        this.angle = angle;

    }

    Render(guiContext, color)
    {
        // First fill the box.
        let renderOptions = {
            color: color,
            fill: true,
            globalAlpha: 0.2
        };

        render_lowlevel.RegularPolygon(
            guiContext,
            this.centerPoint,
            [this.point0, this.point1, this.point2, this.point3],
            this.angle,
            renderOptions
        );

        // Now stoke the box
        renderOptions = {
            color: color,
            fill: false,
            globalAlpha: 1,
            lineWidth: 0.33
        };

        render_lowlevel.RegularPolygon(
            guiContext,
            this.centerPoint,
            [this.point0, this.point1, this.point2, this.point3],
            this.angle,
            renderOptions
        );
    }

}

module.exports = {
    BoundingBox
};

},{"./render/point.js":39,"./render/render_lowlevel.js":41}],3:[function(require,module,exports){
"use strict";

/*
    Create a class to hold project metadata. 

    Class is defined as a singleton as there should only ever be one instance 
    of this class active at a time.

    By default at construction, all values are unknown, user must call Set() in 
    order to set metadata for the project.
*/
class Metadata
{
    constructor()
    {
        if (!Metadata.instance)
        {
            Metadata.instance = this;
            this.protocolVersion = 0;
            this.ecad            = "Unknown"
            this.company         = "Unknown"
            this.project_name    = "Unknown"
            this.revision        = "Unknown"
            this.date            = "Unknown"
            this.numTopParts     = 0;
            this.numTBottomParts = 0;
        }
        return Metadata.instance;
    }

    static GetInstance()
    {
        return this.instance;
    }

    Set(iPCB_JSON_Metadata)
    {
        this.protocolVersion = iPCB_JSON_Metadata.protocol_version;
        this.ecad            = iPCB_JSON_Metadata.ecad;
        this.company         = iPCB_JSON_Metadata.company;
        this.project_name    = iPCB_JSON_Metadata.project_name;
        this.revision        = iPCB_JSON_Metadata.revision;
        this.date            = iPCB_JSON_Metadata.date;
        this.numTopParts     = iPCB_JSON_Metadata.number_parts.top;
        this.numTBottomParts = iPCB_JSON_Metadata.number_parts.bottom;
    }
}

/*
    Create a new instance of MEtadata class. This will be the single
    instance that will be used throughout the program. Note that const is 
    used since the instance reference will never change BUT the internal
    data may change.
*/
const instance_Metadata = new Metadata();


module.exports = {
    Metadata
};

},{}],4:[function(require,module,exports){
var Point   = require("../render/point.js").Point

function GetPolygonVerticies(radius, numberSized)
{
    // Will store the verticies of the polygon.
    let polygonVerticies = [];
    // Assumes a polygon centered at (0,0)
    // Assumes that a circumscribed polygon. The formulas used belo are for a inscribed polygon. 
    // To convert between a circumscribed to an inscribed polygon, the radius for the outer polygon needs to be calculated.
    // Some of the theory for below comes from 
    // https://www.maa.org/external_archive/joma/Volume7/Aktumen/Polygon.html
    // // Its is some basic trig and geometry
    let alpha = (2*Math.PI / (2*numberSized));
    let inscribed_radius = radius /Math.cos(alpha);
    for (let i = 1; i <= numberSized; i++) 
    {

        polygonVerticies.push(new Point(inscribed_radius * Math.cos(2 * Math.PI * i / numberSized), inscribed_radius * Math.sin(2 * Math.PI * i / numberSized)));
    }

    return polygonVerticies;
}

module.exports = {
    GetPolygonVerticies
};

},{"../render/point.js":39}],5:[function(require,module,exports){
"use strict";

var Segment_Arc  = require("./Segment_Arc.js").Segment_Arc;
var Segment_Line = require("./Segment_Line.js").Segment_Line;

var Segment_Via_Round   = require("./Segment_Via_Round.js").Segment_Via_Round;
var Segment_Via_Square  = require("./Segment_Via_Square.js").Segment_Via_Square;
var Segment_Via_Octagon = require("./Segment_Via_Octagon.js").Segment_Via_Octagon;

var Segment_Polygon = require("./Segment_Polygon.js").Segment_Polygon;

var pcb                = require("../pcb.js");

class PCB_Layer
{
    constructor(iPCB_JSON_Layer)
    {
        this.name        = iPCB_JSON_Layer.name;
        this.paths       = [];

        for(let segment of iPCB_JSON_Layer.paths)
        {
            if(segment.type == "arc")
            {
                this.paths.push(new Segment_Arc(segment));
            }
            else if(segment.type == "line")
            {
                this.paths.push(new Segment_Line(segment));
            }
            else
            {
                console.log("ERROR: Unsupported segment type, ", segment.type);
            }
        }
    }

    Render(isViewFront, scalefactor)
    {
        for(let path of this.paths)
        {
            let ctx = pcb.GetLayerCanvas(path.layer, isViewFront).getContext("2d")
            path.Render(ctx, scalefactor);
        }
    }
}

module.exports = {
    PCB_Layer
};

},{"../pcb.js":33,"./Segment_Arc.js":17,"./Segment_Line.js":18,"./Segment_Polygon.js":19,"./Segment_Via_Octagon.js":20,"./Segment_Via_Round.js":21,"./Segment_Via_Square.js":22}],6:[function(require,module,exports){
"use strict";

var Package  = require("./Package.js").Package;

class PCB_Part
{
    constructor(iPCB_JSON_Part)
    {
        this.name        = iPCB_JSON_Part.name;
        this.value       = iPCB_JSON_Part.value;
        this.package     = new Package(iPCB_JSON_Part.package);
        this.attributes  = new Map();
        this.location    = iPCB_JSON_Part.location;

        // Iterate over all attributes and add the, to attribute map.
        for(let attribute of iPCB_JSON_Part.attributes)
        {
            this.attributes.set(attribute.name.toLowerCase(),attribute.value);
        }

    }

    Render(guiContext, isViewFront, isSelected)
    {
        this.package.Render(guiContext, isViewFront, this.location, isSelected);
    }
}

module.exports = {
    PCB_Part
};

},{"./Package.js":9}],7:[function(require,module,exports){
"use strict";


var pcb                = require("../pcb.js");

class PCB_TestPoint
{
    constructor(iPCB_JSON_TestPoint)
    {
        this.name        = iPCB_JSON_TestPoint.name;
        this.description = iPCB_JSON_TestPoint.description;
        this.expected    = iPCB_JSON_TestPoint.expected;
    }
}

module.exports = {
    PCB_TestPoint
};

},{"../pcb.js":33}],8:[function(require,module,exports){
"use strict";


var Segment_Arc  = require("./Segment_Arc.js").Segment_Arc;
var Segment_Line = require("./Segment_Line.js").Segment_Line;

var Segment_Via_Round   = require("./Segment_Via_Round.js").Segment_Via_Round;
var Segment_Via_Square  = require("./Segment_Via_Square.js").Segment_Via_Square;
var Segment_Via_Octagon = require("./Segment_Via_Octagon.js").Segment_Via_Octagon;

var Segment_Polygon = require("./Segment_Polygon.js").Segment_Polygon;

var pcb                = require("../pcb.js");

class PCB_Trace
{
    constructor(iPCB_JSON_Trace)
    {
        this.name = iPCB_JSON_Trace.name;
        this.segments = [];

        for(let segment of iPCB_JSON_Trace.segments)
        {
            if(segment.type == "arc")
            {
                this.segments.push(new Segment_Arc(segment));
            }
            else if(segment.type == "line")
            {
                this.segments.push(new Segment_Line(segment));
            }
            else if(segment.type == "via_round")
            {
                this.segments.push(new Segment_Via_Round(segment));
            }
            else if(segment.type == "via_square")
            {
                this.segments.push(new Segment_Via_Square(segment));
            }
            else if(segment.type == "via_octagon")
            {
                this.segments.push(new Segment_Via_Octagon(segment));
            }
            else if(segment.type == "polygon")
            {
                this.segments.push(new Segment_Polygon(segment));
            }
            else
            {
                console.log("ERROR: Unsupported segment type, ", segment.type);
            }
        }
    }

    Render(isViewFront, scalefactor)
    {
        for(let segment of this.segments)
        {
            let ctx = pcb.GetLayerCanvas(segment.layer, isViewFront).getContext("2d");
            segment.Render(ctx, scalefactor);
        }
    }
}

module.exports = {
    PCB_Trace
};

},{"../pcb.js":33,"./Segment_Arc.js":17,"./Segment_Line.js":18,"./Segment_Polygon.js":19,"./Segment_Via_Octagon.js":20,"./Segment_Via_Round.js":21,"./Segment_Via_Square.js":22}],9:[function(require,module,exports){
"use strict";

var BoundingBox  = require("../BoundingBox.js").BoundingBox;

var Package_Pad_Rectangle  = require("./Package_Pad_Rectangle.js").Package_Pad_Rectangle;
var Package_Pad_Oblong     = require("./Package_Pad_Oblong.js").Package_Pad_Oblong;
var Package_Pad_Round      = require("./Package_Pad_Round.js").Package_Pad_Round;
var Package_Pad_Octagon    = require("./Package_Pad_Octagon.js").Package_Pad_Octagon;
var Package_Pad_SMD    = require("./Package_Pad_SMD.js").Package_Pad_SMD;

var colormap           = require("../colormap.js");

class Package
{
    constructor(iPCB_JSON_Package)
    {
        this.boundingBox = new BoundingBox(iPCB_JSON_Package.bounding_box.x0, iPCB_JSON_Package.bounding_box.y0, iPCB_JSON_Package.bounding_box.x1, iPCB_JSON_Package.bounding_box.y1, iPCB_JSON_Package.bounding_box.angle);

        this.pads = [];

        for(let pad of iPCB_JSON_Package.pads)
        {
            if (pad.type == "rect")
            {
                this.pads.push(new Package_Pad_Rectangle(pad));
            }
            else if (pad.type == "oblong")
            {
                this.pads.push(new Package_Pad_Oblong(pad));
            }
            else if (pad.type == "round")
            {
                this.pads.push(new Package_Pad_Round(pad));
            }
            else if (pad.type == "octagon")
            {
                this.pads.push(new Package_Pad_Octagon(pad));
            }
            else if (pad.type == "smd")
            {
                this.pads.push(new Package_Pad_SMD(pad));
            }
            else
            {
                console.log("ERROR: Unsupported pad type ", pad.type);
            }
        }
    }

    Render(guiContext, isViewFront, location, isSelected)
    {
        for (let pad of this.pads)
        {
            if(    (((location == "F") && (pad.IsSMD()) &&  isViewFront))
                || (((location == "B") && (pad.IsSMD()) && !isViewFront))
                || (pad.IsTHT())
            )
            {
                let color = colormap.GetPadColor(pad.IsPin1(), isSelected, false);
                pad.Render(guiContext, color);
            }
        }

        if(    (isSelected && (location == "F") && isViewFront)
            || (isSelected && (location == "B") && !isViewFront)
          )
        {
            let color = colormap.GetBoundingBoxColor(isSelected, false);
            this.boundingBox.Render(guiContext, color);
        }
    }
}

module.exports = {
    Package
};

},{"../BoundingBox.js":2,"../colormap.js":26,"./Package_Pad_Oblong.js":11,"./Package_Pad_Octagon.js":12,"./Package_Pad_Rectangle.js":13,"./Package_Pad_Round.js":14,"./Package_Pad_SMD.js":15}],10:[function(require,module,exports){
"use strict";


class Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        this.pin1       = iPCB_JSON_Pad.pin1;
        this.type       = iPCB_JSON_Pad.type;
    }

    Render(isFront, location)
    {

    }

    IsSMD()
    {
        return (this.type == 'smd');
    }

    IsTHT()
    {
        return (this.type != 'smd');
    }

    IsPin1()
    {
        return this.pin1;
    }
}

module.exports = {
    Package_Pad
};

},{}],11:[function(require,module,exports){
"use strict";

var Package_Pad        = require("./Package_Pad.js").Package_Pad
var Point              = require("../render/point.js").Point
var render_lowlevel    = require("../render/render_lowlevel.js");


class Package_Pad_Oblong extends Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        super(iPCB_JSON_Pad);
        this.angle      = iPCB_JSON_Pad.angle;
        this.x          = iPCB_JSON_Pad.x;
        this.y          = iPCB_JSON_Pad.y;
        this.diameter   = iPCB_JSON_Pad.diameter;
        this.elongation = iPCB_JSON_Pad.elongation;
        this.drill      = iPCB_JSON_Pad.drill;  // TODO: This is not needed and is undefined if type is smd. True for all pad types.
    }


    /*
        An oblong pad can be thought of as having a rectangular middle with two semicircle ends. 

        EagleCAD provides provides three pieces of information for generating these pads. 
            1) Center point = Center of part
            2) Diameter = distance from center point to edge of semicircle
            3) Elongation =% ratio relating diameter to width

        The design also has 4 points of  interest, each representing the 
        corner of the rectangle. 

        To render the length and width are derived. This is divided in half to get the 
        values used to translate the central point to one of the verticies. 
    */
    Render(guiContext, color)
    {
        guiContext.save();
        // Diameter is the disnce from center of pad to tip of circle
        // elongation is a factor that related the diameter to the width
        // This is the total width
        let width   = this.diameter*this.elongation/100;
        
        // THe width of the rectangle is the diameter -half the radius.
        // See documentation on how these are calculated.
        let height  = (this.diameter-width/2)*2;

        // assumes oval is centered at (0,0)
        let centerPoint = new Point(this.x, this.y);

        let renderOptions = { 
            color: color,
            fill: true,
        };

        render_lowlevel.Oval( 
            guiContext,
            centerPoint,
            height,
            width,
            this.angle,
            renderOptions
        );

        renderOptions = {
            color: "#CCCCCC",
            fill: true,
        };

        render_lowlevel.Circle(
            guiContext,
            centerPoint,
            this.drill/2,
            renderOptions
        );

        guiContext.restore();
    }
}

module.exports = {
    Package_Pad_Oblong
};

},{"../render/point.js":39,"../render/render_lowlevel.js":41,"./Package_Pad.js":10}],12:[function(require,module,exports){
"use strict";

var Package_Pad     = require("./Package_Pad.js").Package_Pad
var Point           = require("../render/point.js").Point
var render_lowlevel = require("../render/render_lowlevel.js");
var colormap        = require("../colormap.js");

class Package_Pad_Octagon extends Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        super(iPCB_JSON_Pad);
        this.angle      = iPCB_JSON_Pad.angle;
        this.x          = iPCB_JSON_Pad.x;
        this.y          = iPCB_JSON_Pad.y;
        this.diameter   = iPCB_JSON_Pad.diameter;
        this.drill      = iPCB_JSON_Pad.drill;
    }

   Render(guiContext, color)
    {
        guiContext.save();
        // Will store the verticies of the polygon.
        let polygonVerticies = [];

        
        let n = 8;
        let r = this.diameter/2;
        // Assumes a polygon centered at (0,0)
        for (let i = 1; i <= n; i++) 
        {
            polygonVerticies.push(new Point(r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)));
        }

        let angle = (this.angle+45/2);
        let centerPoint = new Point(this.x, this.y);
        let renderOptions = { 
            color: color,
            fill: true,
        };

        render_lowlevel.RegularPolygon( 
            guiContext,
            centerPoint, 
            polygonVerticies,
            angle,
            renderOptions
        );


        renderOptions = {
            color: "#CCCCCC",
            fill: true,
        };

        render_lowlevel.Circle(
            guiContext,
            centerPoint,
            this.drill/2, 
            renderOptions
        );

        guiContext.restore();
    }
}

module.exports = {
    Package_Pad_Octagon
};

},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Package_Pad.js":10}],13:[function(require,module,exports){
"use strict";

var Package_Pad     = require("./Package_Pad.js").Package_Pad
var Point           = require("../render/point.js").Point
var render_lowlevel = require("../render/render_lowlevel.js");
var colormap        = require("../colormap.js");

class Package_Pad_Rectangle extends Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        super(iPCB_JSON_Pad);
        this.angle      = iPCB_JSON_Pad.angle;
        this.x          = iPCB_JSON_Pad.x;
        this.y          = iPCB_JSON_Pad.y;
        this.dx         = iPCB_JSON_Pad.dx;
        this.dy         = iPCB_JSON_Pad.dy;
        this.drill      = iPCB_JSON_Pad.drill;
    }

    Render(guiContext, color)
    {
        guiContext.save();
        let centerPoint = new Point(this.x, this.y);

        /*
                The following derive the corner points for the
                rectangular pad. These are calculated using the center 
                point of the rectangle along with the width and height 
                of the rectangle. 
        */
        // Top left point
        let point0 = new Point(-this.dx/2, this.dy/2);
        // Top right point
        let point1 = new Point(this.dx/2, this.dy/2);
        // Bottom right point
        let point2 = new Point(this.dx/2, -this.dy/2);
        // Bottom left point
        let point3 = new Point(-this.dx/2, -this.dy/2);

        let renderOptions = {
            color: color,
            fill: true,
        };

        render_lowlevel.RegularPolygon( 
            guiContext,
            centerPoint, 
            [point0, point1, point2, point3],
            this.angle,
            renderOptions
        );

        renderOptions = {
            color: "#CCCCCC",
            fill: true,
        };

        render_lowlevel.Circle(
            guiContext,
            centerPoint,
            this.drill/2, 
            renderOptions
        );

        guiContext.restore();
    }
}

module.exports = {
    Package_Pad_Rectangle
};

},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Package_Pad.js":10}],14:[function(require,module,exports){
"use strict";

var Package_Pad     = require("./Package_Pad.js").Package_Pad
var Point           = require("../render/point.js").Point
var render_lowlevel = require("../render/render_lowlevel.js");
var colormap        = require("../colormap.js");

class Package_Pad_Round extends Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        super(iPCB_JSON_Pad);
        this.angle      = iPCB_JSON_Pad.angle;
        this.x          = iPCB_JSON_Pad.x;
        this.y          = iPCB_JSON_Pad.y;
        this.diameter   = iPCB_JSON_Pad.diameter;
        this.drill      = iPCB_JSON_Pad.drill;
    }

    Render(guiContext, color)
    {
        guiContext.save();

        let centerPoint = new Point(this.x, this.y);
        let renderOptions = {
            color: color,
            fill: true,
        };

        render_lowlevel.Circle( 
            guiContext,
            centerPoint,                         
            this.drill, 
            renderOptions
        ); 

        renderOptions = {
            color: "#CCCCCC",
            fill: true,
        };

        render_lowlevel.Circle(
            guiContext,
            centerPoint,
            this.drill/2, 
            renderOptions
        );

        guiContext.restore();

    }
}

module.exports = {
    Package_Pad_Round
};

},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Package_Pad.js":10}],15:[function(require,module,exports){
"use strict";

var Package_Pad     = require("./Package_Pad.js").Package_Pad
var Point           = require("../render/point.js").Point
var render_lowlevel = require("../render/render_lowlevel.js");
var colormap        = require("../colormap.js");

class Package_Pad_SMD extends Package_Pad
{
    constructor(iPCB_JSON_Pad)
    {
        super(iPCB_JSON_Pad);
        this.angle      = iPCB_JSON_Pad.angle;
        this.x          = iPCB_JSON_Pad.x;
        this.y          = iPCB_JSON_Pad.y;
        this.dx         = iPCB_JSON_Pad.dx;
        this.dy         = iPCB_JSON_Pad.dy;
    }

    Render(guiContext, color)
    {
        guiContext.save();
        let centerPoint = new Point(this.x, this.y);

        /*
                The following derive the corner points for the
                rectangular pad. These are calculated using the center 
                point of the rectangle along with the width and height 
                of the rectangle. 
        */
        // Top left point
        let point0 = new Point(-this.dx/2, this.dy/2);
        // Top right point
        let point1 = new Point(this.dx/2, this.dy/2);
        // Bottom right point
        let point2 = new Point(this.dx/2, -this.dy/2);
        // Bottom left point
        let point3 = new Point(-this.dx/2, -this.dy/2);

        let renderOptions = {
            color: color,
            fill: true,
        };

        render_lowlevel.RegularPolygon( 
            guiContext,
            centerPoint, 
            [point0, point1, point2, point3],
            this.angle,
            renderOptions
        );

        guiContext.restore();
    }
}

module.exports = {
    Package_Pad_SMD
};

},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Package_Pad.js":10}],16:[function(require,module,exports){
"use strict";


class Segment
{
    constructor(iPCB_JSON_Segment)
    {
        
    }

    Render(guiContext, scalefactor)
    {

    }

}

module.exports = {
    Segment
};

},{}],17:[function(require,module,exports){
"use strict";


var Point           = require("../render/point.js").Point
var Segment         = require("./Segment.js").Segment
var render_lowlevel = require("../render/render_lowlevel.js");
var colorMap        = require("../colormap.js");

class Segment_Arc extends Segment
{
    constructor(iPCB_JSON_Segment)
    {
        super(iPCB_JSON_Segment);
        this.centerPoint = new Point(iPCB_JSON_Segment.cx0, iPCB_JSON_Segment.cy0);
        this.layer       = iPCB_JSON_Segment.layer;
        this.radius      = iPCB_JSON_Segment.radius;
        this.angle0      = iPCB_JSON_Segment.angle0;
        this.angle1      = iPCB_JSON_Segment.angle1;
        this.width       = iPCB_JSON_Segment.width;
        this.direction   = iPCB_JSON_Segment.direction;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();

        let renderOptions = { 
            color    : colorMap.GetTraceColor(this.layer),
            fill     : false,
            lineWidth: Math.max(1 / scalefactor, this.width),
            lineCap  : "round" 
        };

        render_lowlevel.Arc( 
            guiContext,
            this.centerPoint,
            this.radius,
            this.angle0,
            this.angle1,
            renderOptions
        );

        guiContext.restore();
    }

}

module.exports = {
    Segment_Arc
};


},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Segment.js":16}],18:[function(require,module,exports){
"use strict";

var Point           = require("../render/point.js").Point
var Segment         = require("./Segment.js").Segment
var render_lowlevel = require("../render/render_lowlevel.js");
var colorMap        = require("../colormap.js");

class Segment_Line extends Segment
{
    constructor(iPCB_JSON_Segment)
    {
        super(iPCB_JSON_Segment);
        this.startPoint  = new Point(iPCB_JSON_Segment.x0, iPCB_JSON_Segment.y0);
        this.endPoint    = new Point(iPCB_JSON_Segment.x1, iPCB_JSON_Segment.y1);
        this.layer       = iPCB_JSON_Segment.layer;
        this.width       = iPCB_JSON_Segment.width;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();

        let renderOptions = {
            color    : colorMap.GetTraceColor(this.layer),
            fill     : false,
            lineWidth: Math.max(1 / scalefactor, this.width),
            lineCap  : "round"
        };

        render_lowlevel.Line(
            guiContext,
            this.startPoint,
            this.endPoint,
            renderOptions
        );

        guiContext.restore();
    }
}

module.exports = {
    Segment_Line
};
},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Segment.js":16}],19:[function(require,module,exports){
"use strict";

var Point        = require("../render/point.js").Point
var Segment      = require("./Segment.js").Segment
var Segment_Arc  = require("./Segment_Arc.js").Segment_Arc
var Segment_Line = require("./Segment_Line.js").Segment_Line
var colorMap     = require("../colormap.js");
var render_lowlevel = require("../render/render_lowlevel.js");

class Segment_Polygon extends Segment
{
    constructor(iPCB_JSON_Polygon)
    {
        super(iPCB_JSON_Polygon);
        this.vertices = [];
        this.positive = iPCB_JSON_Polygon.positive;
        this.layer = iPCB_JSON_Polygon.layer;
        
        for(let segment of iPCB_JSON_Polygon.segments)
        {
            if(segment.type == "arc")
            {

            }
            else if(segment.type == "line")
            {
                /*
                    Following only works for eagle as polygons are composed solely of 
                    lines. If this is not true then the verticies array must be modified.
                */
                let point1 = (segment.x0, segment.x1);
                this.vertices.push(point1);
            }
            else
            {
                console.log("ERROR: Unsupported polygon segment type, ", segment.type);
            }
        }

    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();

        let compositionType = (this.positive) ? "source-over" : "destination-out";
        let renderOptions = {
            color: colorMap.GetTraceColor(this.layer),
            fill: true,
            compositionType: compositionType
        };

        render_lowlevel.IrregularPolygon(
            guiContext,
            this.vertices,
            renderOptions
        );
        guiContext.restore();
    }
}

module.exports = {
    Segment_Polygon
};
},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Segment.js":16,"./Segment_Arc.js":17,"./Segment_Line.js":18}],20:[function(require,module,exports){
"use strict";

var Point               = require("../render/point.js").Point
var Segment             = require("./Segment.js").Segment
var GetPolygonVerticies = require("./Helper.js").GetPolygonVerticies;
var render_lowlevel = require("../render/render_lowlevel.js");
var colorMap            = require("../colormap.js");

class Segment_Via_Octagon extends Segment
{
    constructor(iPCB_JSON_Segment)
    {
        super(iPCB_JSON_Segment);

        this.centerPoint   = new Point(iPCB_JSON_Segment.x, iPCB_JSON_Segment.y);
        this.diameter      = iPCB_JSON_Segment.diameter;
        this.drillDiameter = iPCB_JSON_Segment.drill;
        this.verticies     = GetPolygonVerticies(iPCB_JSON_Segment.diameter/2, 8);
        this.layer       = iPCB_JSON_Segment.layer;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();
        
        let angle = (45/2);

        let renderOptions = { 
            color: colorMap.GetViaColor(),
            fill: true,
        };

        render_lowlevel.RegularPolygon( 
            guiContext,
            this.centerPoint, 
            this.verticies,
            angle,
            renderOptions
        );

        // Draw drill hole
        renderOptions = {
            color: colorMap.GetDrillColor(),
            fill: true,
        };

        render_lowlevel.Circle( 
            guiContext,
            this.centerPoint,
            this.drillDiameter/2, 
            renderOptions
        ); 

        guiContext.restore();
    }
}

module.exports = {
    Segment_Via_Octagon
};

},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Helper.js":4,"./Segment.js":16}],21:[function(require,module,exports){
"use strict";

var Point    = require("../render/point.js").Point
var Segment  = require("./Segment.js").Segment
var render_lowlevel = require("../render/render_lowlevel.js");
var colorMap = require("../colormap.js");

class Segment_Via_Round extends Segment
{
    constructor(iPCB_JSON_Segment)
    {
        super(iPCB_JSON_Segment);
        this.centerPoint        = new Point(iPCB_JSON_Segment.x, iPCB_JSON_Segment.y);
        this.diameter           = iPCB_JSON_Segment.diameter;
        this.drillDiameter      = iPCB_JSON_Segment.drill;
        this.layer       = iPCB_JSON_Segment.layer;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();
        let renderOptions = {
            color: colorMap.GetViaColor(),
            fill: true,
        };

        render_lowlevel.Circle( 
            guiContext,
            this.centerPoint,
            this.diameter/2, 
            renderOptions
        ); 
        
        // Draw drill hole
        renderOptions = {
            color: colorMap.GetDrillColor(),
            fill: true,
        };

        render_lowlevel.Circle( 
            guiContext,
            this.centerPoint,
            this.drillDiameter/2, 
            renderOptions
        ); 

        // Restores context to state prior to this rendering function being called. 
        guiContext.restore();
    }
}

module.exports = {
    Segment_Via_Round
};
},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Segment.js":16}],22:[function(require,module,exports){
"use strict";

var Point               = require("../render/point.js").Point
var Segment             = require("./Segment.js").Segment
var GetPolygonVerticies = require("./Helper.js").GetPolygonVerticies;
var render_lowlevel = require("../render/render_lowlevel.js");
var colorMap            = require("../colormap.js");

class Segment_Via_Square extends Segment
{
    constructor(iPCB_JSON_Segment)
    {
        super(iPCB_JSON_Segment);
        this.centerPoint    = new Point(iPCB_JSON_Segment.x, iPCB_JSON_Segment.y);
        this.diameter       = iPCB_JSON_Segment.diameter;
        this.drillDiameter  = iPCB_JSON_Segment.drill;
        this.verticies      = GetPolygonVerticies(iPCB_JSON_Segment.diameter/2, 4);
        this.layer       = iPCB_JSON_Segment.layer;
    }

    Render(guiContext, scalefactor)
    {
        guiContext.save();

        // This is needed in order so that the shape is rendered with correct orientation, ie top of 
        // shape is parallel to top and bottom of the display.
        let angle = 45;

        let renderOptions = {
            color: colorMap.GetViaColor(),
            fill: true,
        };

        render_lowlevel.RegularPolygon( 
            guiContext,
            this.centerPoint, 
            this.verticies,
            angle,
            renderOptions
        );

        // Draw drill hole
        renderOptions = {
            color: colorMap.GetDrillColor(),
            fill: true,
        };

        render_lowlevel.Circle( 
            guiContext,
            this.centerPoint,
            this.drillDiameter/2, 
            renderOptions
        );

        guiContext.restore();
    }
}

module.exports = {
    Segment_Via_Square
};
},{"../colormap.js":26,"../render/point.js":39,"../render/render_lowlevel.js":41,"./Helper.js":4,"./Segment.js":16}],23:[function(require,module,exports){
"use strict";

class Part {
    constructor(value, footprint, reference, location, attributes, checkboxes)
    {
        this.quantity   = 1;
        this.value      = value;
        this.foorptint  = footprint;
        this.reference  = reference;
        this.location   = location;
        this.attributes = attributes;
        // TODO: Checkbox should be part of bom_table and not pat
        this.checkboxes = checkboxes;
    }

    CopyPart()
    {
        // XXX: This is not performing a deep copy, attributes is a map and this is being copied by 
        //      reference which is not quite what we want here. It should be a deep copy so once called
        //      this will result in a completely new object that will not reference one another
        return new Part(this.value, this.package, this.reference, this.location, this.attributes, this.checkboxes);
    }
}

module.exports = {
    Part
};

},{}],24:[function(require,module,exports){
"use strict";

var pcb              = require("./pcb.js");
var globalData       = require("./global.js");
var layer_table      = require("./layer_table.js");
var trace_table      = require("./trace_table.js");
var testpoint_table      = require("./testpoint_table.js");
var Table_LayerEntry = require("./render/Table_LayerEntry.js").Table_LayerEntry



function populateRightSideScreenTable()
{
    let rightSideTable_LayerTableBody = document.getElementById("layer_table");
    rightSideTable_LayerTableBody.removeAttribute("hidden");

    //let rightSideTable_TraceTableBody = document.getElementById("tracebody");
    //rightSideTable_TraceTableBody.removeAttribute("hidden");

    layer_table.populateLayerTable();
    trace_table.populateTraceTable();
    testpoint_table.populateTestPointTable();
}


module.exports = {
     populateRightSideScreenTable
};

},{"./global.js":28,"./layer_table.js":32,"./pcb.js":33,"./render/Table_LayerEntry.js":36,"./testpoint_table.js":42,"./trace_table.js":43}],25:[function(require,module,exports){
"use strict";
var globalData = require("./global.js");
var pcb        = require("./pcb.js");
var render     = require("./render.js");

function createCheckboxChangeHandler(checkbox, bomentry)
{
    return function(event)
    {
        if(bomentry.checkboxes.get(checkbox))
        {
            bomentry.checkboxes.set(checkbox,false);
            globalData.writeStorage("checkbox" + "_" + checkbox.toLowerCase() + "_" + bomentry.reference, "false");
        }
        else
        {
            bomentry.checkboxes.set(checkbox,true);
            globalData.writeStorage("checkbox" + "_" + checkbox.toLowerCase() + "_" + bomentry.reference, "true");
        }
        // Save currently highlited row
        let rowid = globalData.getCurrentHighlightedRowId();
        // Redraw the canvas
        render.RenderPCB(globalData.GetAllCanvas().front);
        render.RenderPCB(globalData.GetAllCanvas().back);
        // Redraw the BOM table
        populateBomTable();
        // Render current row so its highlighted
        document.getElementById(rowid).classList.add("highlighted");
        // Set current selected row global variable
        if(event.ctrlKey)
        {
            globalData.setCurrentHighlightedRowId(rowid, true);
        }
        else
        {
            globalData.setCurrentHighlightedRowId(rowid, false);
        }

        // If highlighted then a special color will be used for the part.
        render.drawHighlights(IsCheckboxClicked(globalData.getCurrentHighlightedRowId(), "placed"));
    };
}

function IsCheckboxClicked(bomrowid, checkboxname)
{
    let checkboxnum = 0;
    while (checkboxnum < globalData.getCheckboxes().length && globalData.getCheckboxes()[checkboxnum].toLowerCase() != checkboxname.toLowerCase())
    {
        checkboxnum++;
    }
    if (!bomrowid || checkboxnum >= globalData.getCheckboxes().length)
    {
        return;
    }
    let bomrow = document.getElementById(bomrowid);
    let checkbox = bomrow.childNodes[checkboxnum + 1].childNodes[0];
    return checkbox.checked;
}

function clearBOMTable()
{
    let bom = document.getElementById("bombody");

    while (bom.firstChild)
    {
        bom.removeChild(bom.firstChild);
    }
}

/*
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort

    JS treats values in compare as strings by default
    so need to use a function to sort numerically.
*/
function NumericCompare(a,b)
{
    return (a - b);
}

/*
    Takes as an argument a list of reference designations.
*/
function ConvertReferenceDesignatorsToRanges(ReferenceDesignations)
{
    /*
        Extract reference designation from the list.
        It is assumed the reference designation is  teh same across all
        in the input list.

        In addition also extract the numeric value in a separate list.
    */
    let numbers    = ReferenceDesignations.map(x => parseInt(x.split(/(\d+$)/)[1],10));
    // Only extract reference designation from first element as all others are assumed to be equal.
    let designator = ReferenceDesignations[0].split(/(\d+$)/)[0];

    /*
        Sort all numbers to be increasing
    */
    numbers.sort(NumericCompare);

    /*
        Following code was adapted from KiCost project. Code ported to JavaScript from Python.
        Removed a check for sub parts as iPCB deals with parts from a PCB perspective and not
        schematic perspective, this do not need sub part checking.
    */

    // No ranges found yet since we just started.
    let rangedReferenceDesignations = [];
    // First possible range is at the start of the list of numbers.
    let rangeStart = 0;

    // Go through list of numbers looking for 3 or more sequential numbers.
    while(rangeStart < numbers.length)
    {
        // Current range starts off as a single number.
        let numRange = numbers[rangeStart]
        // The next possible start of a range.
        let nextRangeStart = rangeStart + 1;

        // Look for sequences of three or more sequential numbers.
        for(let rangeEnd = (rangeStart+2); rangeEnd < numbers.length; rangeEnd++)
        {
            if(rangeEnd - rangeStart != numbers[rangeEnd] - numbers[rangeStart])
            {
                // Non-sequential numbers found, so break out of loop.
                break;
            }
            else
            {
                // Otherwise, extend the current range.
                numRange = String(numbers[rangeStart]) + "-" + String(numbers[rangeEnd])
                // 3 or more sequential numbers found, so next possible range must start after this one.
                nextRangeStart = rangeEnd + 1
            }
        }
        // Append the range (or single number) just found to the list of range.
        rangedReferenceDesignations.push(designator + numRange)
        // Point to the start of the next possible range and keep looking.
        rangeStart = nextRangeStart
    }
    return rangedReferenceDesignations
}

function populateBomBody()
{
    let bom = document.getElementById("bombody");

    clearBOMTable();

    globalData.setHighlightHandlers([]);
    globalData.setCurrentHighlightedRowId(null, false);

    let bomtable = pcb.GetBOM();

    if (globalData.getBomSortFunction())
    {
        bomtable = bomtable.slice().sort(globalData.getBomSortFunction());
    }

    for (let i in bomtable)
    {
        let bomentry = bomtable[i];
        let references = ConvertReferenceDesignatorsToRanges(bomentry.reference.split(',')).join(',');

        let tr = document.createElement("TR");
        let td = document.createElement("TD");
        let rownum = +i + 1;
        tr.id = "bomrow" + rownum;
        td.textContent = rownum;
        tr.appendChild(td);

        // Checkboxes
        let additionalCheckboxes = globalData.getBomCheckboxes().split(",");
        for (let checkbox of additionalCheckboxes)
        {
            checkbox = checkbox.trim();
            if (checkbox)
            {
                td = document.createElement("TD");
                let input = document.createElement("input");
                input.type = "checkbox";
                input.onchange = createCheckboxChangeHandler(checkbox, bomentry);
                // read the value in from local storage

                if(globalData.readStorage( "checkbox" + "_" + checkbox.toLowerCase() + "_" + bomentry.reference ) == "true")
                {
                    bomentry.checkboxes.set(checkbox,true)
                }
                else
                {
                    // Needed for when parts combined by value
                    if(bomentry.checkboxes.set !== undefined)
                    {
                        bomentry.checkboxes.set(checkbox,false)
                    }
                }

            // Needed for when parts combined by value
            if(bomentry.checkboxes.get !== undefined)
            {
                    if(bomentry.checkboxes.get(checkbox))
                    {
                        input.checked = true;
                    }
                    else
                    {
                        input.checked = false;
                    }
            }
                td.appendChild(input);
                tr.appendChild(td);
            }
        }

        // References
        td = document.createElement("TD");
        td.innerHTML = references;
        tr.appendChild(td);

        // Value
        td = document.createElement("TD");
        td.innerHTML = bomentry.value;
        tr.appendChild(td);

        // Attributes
        let additionalAttributes = globalData.getAdditionalAttributes().split(",");
        for (let x of additionalAttributes)
        {
            x = x.trim()
            if (x)
            {
                td = document.createElement("TD");
                td.innerHTML =pcb.getAttributeValue(bomentry, x.toLowerCase());
                tr.appendChild(td);
            }
        }

        if(globalData.getCombineValues())
        {
            td = document.createElement("TD");
            td.textContent = bomentry.quantity;
            tr.appendChild(td);
        }
        bom.appendChild(tr);


        bom.appendChild(tr);
        let handler = createRowHighlightHandler(tr.id, references);

         tr.onclick = handler;
         tr.onmousemove = handler;
         globalData.pushHighlightHandlers({
             id: tr.id,
             handler: handler,
             refs: references
         });
    }
}

function createRowHighlightHandler(rowid, refs)
{
    return function(event)
    {
        if(event.shiftKey || (event.type =="click"))
        {
            console.log(event)
            /*
                If control key pressed pressed, then keep original rows highlighted and
                highlight new selected row.
            */
            if(event.ctrlKey )
            {
                /* Only append the new cicked object if not currently highlited */
                let alreadySelected = false;
                /* Disable highlight on all rows */
                let highlitedRows = globalData.getCurrentHighlightedRowId()
                for(let highlitedRow of highlitedRows)
                {
                    // USed here so that the row if highlighted will not highlighted
                    if (highlitedRow == rowid)
                    {
                        alreadySelected = true;
                    }
                }

                if(alreadySelected == false)
                {
                    document.getElementById(rowid).classList.add("highlighted");
                    globalData.setCurrentHighlightedRowId(rowid, true);
                    globalData.setHighlightedRefs(refs, true);
                    render.drawHighlights(IsCheckboxClicked(rowid, "placed"));
                }
            }
            else
            {
                /* Disable highlight on all rows */
                let highlitedRows = globalData.getCurrentHighlightedRowId()
                for(let highlitedRow of highlitedRows)
                {
                    // USed here so that the row if highlighted will not highlighted
                    if (highlitedRow == rowid)
                    {
                        // Skip do nothing
                    }
                    else
                    {
                        document.getElementById(highlitedRow).classList.remove("highlighted");
                    }
                }
                // Highlight current clicked row
                document.getElementById(rowid).classList.add("highlighted");
                globalData.setCurrentHighlightedRowId(rowid, false);
                globalData.setHighlightedRefs(refs);
                render.drawHighlights(IsCheckboxClicked(rowid, "placed"));
            }
        }
    }
}

function setBomCheckboxes(value)
{
    globalData.setBomCheckboxes(value);
    globalData.writeStorage("bomCheckboxes", value);
    populateBomTable();
}

function setRemoveBOMEntries(value)
{
    globalData.setRemoveBOMEntries(value);
    globalData.writeStorage("removeBOMEntries", value);
    populateBomTable();
}

function populateBomTable()
{
    populateBomHeader();
    populateBomBody();

        /* Read filter string. Hide BOM elements that dont cintain string entry */
    let filterBOM = document.getElementById("bom-filter");
    Filter(filterBOM.value)
}

function populateBomHeader()
{
    let bomhead   = document.getElementById("bomhead");
    while (bomhead.firstChild)
    {
        bomhead.removeChild(bomhead.firstChild);
    }

    let tr = document.createElement("TR");
    let th = document.createElement("TH");
    th.classList.add("numCol");
    tr.appendChild(th);


    let additionalCheckboxes = globalData.getBomCheckboxes().split(",");
    additionalCheckboxes     = additionalCheckboxes.filter(function(e){return e});
    globalData.setCheckboxes(additionalCheckboxes);
    for (let x2 of additionalCheckboxes)
    {
        // remove beginning and trailing whitespace
        x2 = x2.trim()
        if (x2)
        {
            tr.appendChild(createColumnHeader(x2, "Checkboxes"));
        }
    }

    tr.appendChild(createColumnHeader("References", "References"));

    tr.appendChild(createColumnHeader("Value", "Value"));

    let additionalAttributes = globalData.getAdditionalAttributes().split(",");
    // Remove null, "", undefined, and 0 values
    additionalAttributes    =additionalAttributes.filter(function(e){return e});
    for (let x of additionalAttributes)
    {
        // remove beginning and trailing whitespace
        x = x.trim()
        if (x)
        {
            tr.appendChild(createColumnHeader(x, "Attributes"));
        }
    }

    if(globalData.getCombineValues())
    {
            //XXX: This comparison function is using positive and negative implicit
            tr.appendChild(createColumnHeader("Quantity", "Quantity"));
    }

    bomhead.appendChild(tr);
}

/*
    Creates a new column header and regenerates BOM table.
    BOM table is recreated since a new column has been added.
*/
function createColumnHeader(name, cls)
{
    let th = document.createElement("TH");
    th.innerHTML = name;
    th.classList.add(cls);
    let span = document.createElement("SPAN");
    th.appendChild(span);
    return th;
}

function Filter(s)
{
    s = s.toLowerCase();
    let bomBody = document.getElementById("bombody");

    for (let part of bomBody.rows)
    {
        // This is searching for the string across the entire rows
        // text.
        if(part.innerText.trim().toLowerCase().includes(s))
        {
            part.style.display = "";
        }
        else
        {
            part.style.display = "none";
        }
    }
}

function FilterByAttribute(s)
{
    s = s.toLowerCase();
    let bomBody = document.getElementById("bombody");

    if(s != "")
    {
        // Removes strings that are also empty which occur
        // if a comma is entered but not a another character ('aaa,').
        let filterStrings = s.split(",").filter(element => {return element !== ''});


        for (let part of bomBody.rows)
        {
            for(let filterString of filterStrings)
            {
                if(part.innerText.trim().toLowerCase().includes(filterString))
                {
                    part.style.display = "none";
                    break;
                }
                else
                {
                    part.style.display = "";
                }
            }
        }
    }
    else
    {
         for (let part of bomBody.rows)
        {
            part.style.display = "";
        }
    }
}

module.exports = {
    setBomCheckboxes, populateBomTable,
    setRemoveBOMEntries, clearBOMTable, Filter, FilterByAttribute
};

},{"./global.js":28,"./pcb.js":33,"./render.js":34}],26:[function(require,module,exports){
"use strict";

var globalData        = require("./global.js");

var ColorMap = new Map(
    [
        // Light Mode, Dark Mode
        ["Drill"                  ,["#CCCCCC"   , "#CCCCCC"]],
        ["BboundingBox_Default"   ,["#878787"   , "#878787"]],
        ["BboundingBox_Placed"    ,["#40D040"   , "#40D040"]],
        ["BboundingBox_Highlited" ,["#D04040"   , "#D04040"]],
        ["BboundingBox_Debug"     ,["#2977ff"   , "#2977ff"]],
        ["Pad_Default"            ,["#878787"   , "#878787"]],
        ["Pad_Pin1"               ,["#ffb629"   , "#ffb629"]],
        ["Pad_IsHighlited"        ,["#D04040"   , "#D04040"]],
        ["Pad_IsPlaced"           ,["#40D040"   , "#40D040"]],
        ["Default"                ,["#878787"   , "#878787"]]
    ]);



function SetColor(colorName, colorCode)
{
    ColorMap.set(colorName, [colorCode, colorCode]);
}

/*
    Currently 2 supported color palette. 
    Palette 0 is for light mode, and palette 1 
    id for dark mode.
*/
function GetColorPalette()
{
    return (globalData.readStorage("darkmode") === "true") ? 1 : 0;
}

function GetTraceColor(traceLayer)
{
    let traceColorMap = ColorMap.get(traceLayer);
    if (traceColorMap == undefined)
    {
        //console.log("WARNING: Invalid trace layer number, using default.");
        return ColorMap.get("Default")[GetColorPalette()];
    }
    else
    {
        return traceColorMap[GetColorPalette()];
    }
}


function GetBoundingBoxColor(isHighlited, isPlaced)
{
    // Order of color selection.
    if (isPlaced) 
    {
        let traceColorMap = ColorMap.get("BboundingBox_Placed");
        return traceColorMap[GetColorPalette()];
    }
    // Highlighted and not placed
    else if(isHighlited)
    {
        let traceColorMap = ColorMap.get("BboundingBox_Highlited");
        return traceColorMap[GetColorPalette()];
    }
    /*
        If debug mode is enabled then force drawing a bounding box
      not highlighted,  not placed, and debug mode active
    */
    else if(globalData.getDebugMode())
    {
        let traceColorMap = ColorMap.get("BboundingBox_Debug");
        return traceColorMap[GetColorPalette()];
    }
    else
    {
        let traceColorMap = ColorMap.get("BboundingBox_Default");
        return traceColorMap[GetColorPalette()];
    }
}


function GetPadColor(isPin1, isHighlited, isPlaced)
{
    if(isPin1)
    {
        let traceColorMap = ColorMap.get("Pad_Pin1");
        return traceColorMap[GetColorPalette()];
    }
    else if(isPlaced && isHighlited)
    {
        let traceColorMap = ColorMap.get("Pad_IsPlaced");
        return traceColorMap[GetColorPalette()];
    }
    else if(isHighlited)
    {
        let traceColorMap = ColorMap.get("Pad_IsHighlited");
        return traceColorMap[GetColorPalette()];
    }
    else
    {
        let traceColorMap = ColorMap.get("Pad_Default");
        return traceColorMap[GetColorPalette()];
    }
}

function GetViaColor()
{
    let traceColorMap = ColorMap.get("Vias");
    if (traceColorMap == undefined)
    {
        //console.log("WARNING: Invalid trace layer number, using default.");
        return ColorMap.get("Default")[GetColorPalette()];
    }
    else
    {
        return traceColorMap[GetColorPalette()];
    }
}

function GetDrillColor()
{
    let traceColorMap = ColorMap.get("Drill");
    if (traceColorMap == undefined)
    {
        //console.log("WARNING: Invalid trace layer number, using default.");
        return ColorMap.get("Default")[GetColorPalette()];
    }
    else
    {
        return traceColorMap[GetColorPalette()];
    }
}

module.exports = {
    GetTraceColor, GetBoundingBoxColor, GetPadColor,
    GetViaColor, GetDrillColor, SetColor
};

},{"./global.js":28}],27:[function(require,module,exports){
/*
    Functions for enabling or disabling full screen mode.

    Functions are taken from W3 School,

    https://www.w3schools.com/howto/howto_js_fullscreen.asp
*/
"use strict";


/* View in fullscreen */
function openFullscreen()
{
    let elem = document.documentElement;

    if (elem.requestFullscreen)
    {
        elem.requestFullscreen();
    }
    /* Safari */
    else if (elem.webkitRequestFullscreen)
    {
        elem.webkitRequestFullscreen();
    }
    /* IE11 */
    else if (elem.msRequestFullscreen)
    {
        elem.msRequestFullscreen();
    }
}

/* Close fullscreen */
function closeFullscreen()
{
    if (document.exitFullscreen)
    {
        document.exitFullscreen();
    }
    /* Safari */
    else if (document.webkitExitFullscreen)
    {
        document.webkitExitFullscreen();
    }
    /* IE11 */
    else if (document.msExitFullscreen)
    {
        document.msExitFullscreen();
    }
}

module.exports = {
  openFullscreen, closeFullscreen
};

},{}],28:[function(require,module,exports){
"use strict";



let pcb_traces = [];
let pcb_testpoints = [];
let pcb_layers = 0;
let pcb_parts = [];
let render_layers = 1;
let layer_list = new Map();


/*************************************************
              Board Rotation
*************************************************/
let storage = undefined;
const storagePrefix = "INTERACTIVE_PCB__"

function initStorage ()
{
    try
    {
        window.localStorage.getItem("blank");
        storage = window.localStorage;
    }
    catch (e)
    {
        console.log("ERROR: Storage init error");
    }

    if (!storage)
    {
        try
        {
            window.sessionStorage.getItem("blank");
            storage = window.sessionStorage;
        }
        catch (e)
        {
            console.log("ERROR: Session storage not available");
            // sessionStorage also not available
        }
    }
}

function readStorage(key)
{
    if (storage)
    {
        return storage.getItem(storagePrefix + "#" + key);
    }
    else
    {
        return null;
    }
}

function writeStorage(key, value)
{
    if (storage)
    {
        storage.setItem(storagePrefix + "#" + key, value);
    }
    else
    {
        console.log("ERROR: Storage not initialized");
    }
}

/************************************************/

/*************************************************
              Highlighted Refs
*************************************************/
let highlightedRefs = [];



function ConvertRangesToReferenceDesignators(text)
{
    // Split ignoring the spaces.
    let partial_ref = text.split(',')
    let refs = []

    for(let ref of partial_ref)
    {
        if(ref.match('-'))
        {
            let designator_name  = ref.match(/^\D+/)[0];
            let startNumber      = ref.match(/(\d+)-(\d+)/)[1];
            let endNumber        = ref.match(/(\d+)-(\d+)/)[2];

            for(let i = startNumber; i <= endNumber; i++)
            {
                refs.push(designator_name + String(i));
            }
        }
        else
        {
            refs.push(ref);
        }
    }
   return refs
}


function setHighlightedRefs(refs, isMulti)
{
    if(refs == null)
    {
        highlightedRefs = [];
    }
    else
    {
        if(isMulti)
        {
            // Skip
        }
        else
        {
            highlightedRefs = [];
        }

        let newRefs = ConvertRangesToReferenceDesignators(refs);
        for(let ref of newRefs)
        {
            highlightedRefs.push(ref);
        }
    }
}

function getHighlightedRefs()
{
    return highlightedRefs;
}

/************************************************/

/*************************************************
              Redraw On Drag
*************************************************/
let redrawOnDrag = true;

function setRedrawOnDrag(value)
{
    redrawOnDrag = value;
    writeStorage("redrawOnDrag", value);
}

function getRedrawOnDrag()
{
    return redrawOnDrag;
}

/************************************************/


/*************************************************
                 Debug Mode
*************************************************/
let debugMode = false;

function setDebugMode(value)
{
    debugMode = value;
    writeStorage("debugMode", value);
}

function getDebugMode()
{
    return debugMode;
}

/************************************************/

/*************************************************
layer Split
*************************************************/
let layersplit;

function setLayerSplit(value)
{
    layersplit = value;
}

function getLayerSplit()
{
    return layersplit;
}

function destroyLayerSplit()
{
    if(    (layersplit !== null)
        && (layersplit !== undefined)
      )
    {
        layersplit.destroy();
    }
}

/*************************************************
BOM Split
*************************************************/
let bomsplit;

function setBomSplit(value)
{
    bomsplit = value;
}

function getBomSplit()
{
    return bomsplit;
}

function destroyBomSplit()
{
    bomsplit.destroy();
}

/************************************************/

/*************************************************
Canvas Split
*************************************************/
let canvassplit;

function setCanvasSplit(value)
{
    canvassplit = value;
}

function getCanvasSplit()
{
    return canvassplit;
}

function destroyCanvasSplit()
{
    canvassplit.destroy();
}

function collapseCanvasSplit(value)
{
    canvassplit.collapse(value);
}

function setSizesCanvasSplit()
{
    canvassplit.setSizes([50, 50]);
}

/************************************************/

/*************************************************
Canvas Layout
*************************************************/
let canvaslayout = "FB";

/*XXX Found a bug at startup. Code assumes that canvas layout
is in one of three states. then system fails. he bug was that the
canvasLayout was being set to 'default' which is not a valid state.
So no is check that if default is sent in then set the layout to FB mode.
*/
/* TODO: Make the default check below actually check that the item
is in one of the three valid states. If not then set to FB, otherwise set to one of
the three valid states
*/
function setCanvasLayout(value)
{
    if(value == "default")
    {
        canvaslayout = "FB";
    }
    else
    {
        canvaslayout = value;
    }
}

function getCanvasLayout()
{
    return canvaslayout;
}

/************************************************/

/*************************************************
BOM Layout
*************************************************/
let bomlayout = "default";

function setBomLayout(value)
{
    bomlayout = value;
}

function getBomLayout()
{
    return bomlayout;
}

/************************************************/

/*************************************************
BOM Sort Function
*************************************************/
let bomSortFunction = null;

function setBomSortFunction(value)
{
    bomSortFunction = value;
}

function getBomSortFunction()
{
    return bomSortFunction;
}

/************************************************/

/*************************************************
Current Sort Column
*************************************************/
let currentSortColumn = null;

function setCurrentSortColumn(value)
{
    currentSortColumn = value;
}

function getCurrentSortColumn()
{
    return currentSortColumn;
}

/************************************************/

/*************************************************
Current Sort Order
*************************************************/
let currentSortOrder = null;

function setCurrentSortOrder(value)
{
    currentSortOrder = value;
}

function getCurrentSortOrder()
{
    return currentSortOrder;
}

/************************************************/

/*************************************************
Current Highlighted Row ID
*************************************************/
let currentHighlightedRowId = [];

function setCurrentHighlightedRowId(value, isMulti)
{
    if(value == null)
    {
        currentHighlightedRowId = [];
    }
    else
    {
        if(isMulti)
        {
            currentHighlightedRowId.push(value);
        }
        else
        {
            currentHighlightedRowId = [value];
        }
    }
}

function getCurrentHighlightedRowId()
{
    return currentHighlightedRowId;
}

/************************************************/

/*************************************************
Highlight Handlers
*************************************************/
let highlightHandlers = [];

function setHighlightHandlers(values)
{
    highlightHandlers = values;
}

function getHighlightHandlers(){
    return highlightHandlers;
}

function pushHighlightHandlers(value)
{
    highlightHandlers.push(value);
}

/************************************************/

/*************************************************
Checkboxes
*************************************************/
let checkboxes = [];

function setCheckboxes(values)
{
    checkboxes = values;
}

function getCheckboxes()
{
    return checkboxes;
}

/************************************************/

/*************************************************
BOM Checkboxes
*************************************************/
let bomCheckboxes = "";

function setBomCheckboxes(values)
{
    bomCheckboxes = values;
}

function getBomCheckboxes()
{
    return bomCheckboxes;
}
/************************************************/

/*************************************************
Remove BOM Entries
*************************************************/
let removeBOMEntries = "";

function setRemoveBOMEntries(values)
{
    removeBOMEntries = values;
}

function getRemoveBOMEntries()
{
    return removeBOMEntries;
}
/************************************************/


/*************************************************
Remove BOM Entries
*************************************************/
let additionalAttributes = "";

function setAdditionalAttributes(values)
{
    additionalAttributes = values;
}

function getAdditionalAttributes(){
    return additionalAttributes;
}
/************************************************/


/*************************************************
Highlight Pin 1
*************************************************/
let highlightpin1 = false;

function setHighlightPin1(value)
{
    writeStorage("highlightpin1", value);
    highlightpin1 = value;
}

function getHighlightPin1(){
    return highlightpin1;
}

/************************************************/

/*************************************************
Last Clicked Ref
*************************************************/
let lastClickedRef;

function setLastClickedRef(value)
{
    lastClickedRef = value;
}

function getLastClickedRef()
{
    return lastClickedRef;
}

/************************************************/


/*************************************************
Combine Values
*************************************************/
let combineValues = false;

function setCombineValues(value)
{
    writeStorage("combineValues", value);
    combineValues = value;
}

function getCombineValues()
{
    return combineValues;
}
/************************************************/



/*************************************************
Combine Values
*************************************************/
let hidePlacedParts = false;

function setHidePlacedParts(value)
{
    writeStorage("hidePlacedParts", value);
    hidePlacedParts = value;
}

function getHidePlacedParts()
{
    return hidePlacedParts;
}
/************************************************/

let allcanvas =  undefined;

function SetAllCanvas(value)
{
    allcanvas = value;
}

function GetAllCanvas()
{
    return allcanvas;
}


let boardRotation = 0;
function SetBoardRotation(value)
{
    boardRotation = value;
}

function GetBoardRotation()
{
    return boardRotation;
}


module.exports = {
    pcb_traces, pcb_layers, pcb_parts, render_layers, layer_list, pcb_testpoints,
    initStorage                , readStorage                , writeStorage          ,
    setHighlightedRefs         , getHighlightedRefs         ,
    setRedrawOnDrag            , getRedrawOnDrag            ,
    setDebugMode               , getDebugMode               ,
    setBomSplit                , getBomSplit                , destroyBomSplit       ,
    setLayerSplit              , getLayerSplit              , destroyLayerSplit     ,
    setCanvasSplit             , getCanvasSplit             , destroyCanvasSplit    , collapseCanvasSplit , setSizesCanvasSplit ,
    setCanvasLayout            , getCanvasLayout            ,
    setBomLayout               , getBomLayout               ,
    setBomSortFunction         , getBomSortFunction         ,
    setCurrentSortColumn       , getCurrentSortColumn       ,
    setCurrentSortOrder        , getCurrentSortOrder        ,
    setCurrentHighlightedRowId , getCurrentHighlightedRowId ,
    setHighlightHandlers       , getHighlightHandlers       , pushHighlightHandlers ,
    setCheckboxes              , getCheckboxes              ,
    setBomCheckboxes           , getBomCheckboxes           ,
    setRemoveBOMEntries        , getRemoveBOMEntries        ,
    setAdditionalAttributes    , getAdditionalAttributes    ,
    setHighlightPin1           , getHighlightPin1           ,
    setLastClickedRef          , getLastClickedRef          ,
    setCombineValues           , getCombineValues           ,
    setHidePlacedParts         , getHidePlacedParts         ,
    SetAllCanvas               , GetAllCanvas               ,
    SetBoardRotation           , GetBoardRotation

};

},{}],29:[function(require,module,exports){
var globalData = require("./global.js");
var render     = require("./render.js");

function handleMouseDown(e, layerdict)
{
    if (e.which != 1)
    {
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    layerdict.transform.mousestartx = e.offsetX;
    layerdict.transform.mousestarty = e.offsetY;
    layerdict.transform.mousedownx = e.offsetX;
    layerdict.transform.mousedowny = e.offsetY;
    layerdict.transform.mousedown = true;
}

function smoothScrollToRow(rowid)
{
    document.getElementById(rowid).scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
    });
}

function modulesClicked(event, references)
{
    let lastClickedIndex = references.indexOf(globalData.getLastClickedRef());
    let ref = references[(lastClickedIndex + 1) % references.length];
    for (let handler of globalData.getHighlightHandlers())
    {
        if (handler.refs.indexOf(ref) >= 0)
        {
            globalData.setLastClickedRef(ref);
            handler.handler(event);
            smoothScrollToRow(globalData.getCurrentHighlightedRowId());
            break;
        }
    }
}
function bboxScan(layer, x, y)
{
    let result = [];
    for (let part of pcbdata.parts)
    {
        if( part.location == layer)
        {
            let b = part.package.bounding_box;
            if (    (x > b.x0 )
                        && (x < b.x1 )
                        && (y > b.y0 )
                        && (y < b.y1 )
            )
            {
                result.push(part.name);
            }
        }
    }
    return result;
}


function handleMouseClick(e, layerdict)
{
    let x = e.offsetX;
    let y = e.offsetY;
    let t = layerdict.transform;
    if (layerdict.layer != "B")
    {
        x = (2 * x / t.zoom - t.panx + t.x) / -t.s;
    }
    else
    {
        x = (2 * x / t.zoom - t.panx - t.x) / t.s;
    }
    y = (2 * y / t.zoom - t.y - t.pany) / t.s;
    let v = render.RotateVector([x, y], -globalData.GetBoardRotation());
    let reflist = bboxScan(layerdict.layer, v[0], v[1], t);
    if (reflist.length > 0)
    {
        modulesClicked(e, reflist);
        render.drawHighlights();
    }
}

function handleMouseUp(e, layerdict)
{
    e.preventDefault();
    e.stopPropagation();
    if (    e.which == 1
         && layerdict.transform.mousedown
         && layerdict.transform.mousedownx == e.offsetX
         && layerdict.transform.mousedowny == e.offsetY
    )
    {
        // This is just a click
        handleMouseClick(e, layerdict);
        layerdict.transform.mousedown = false;
        return;
    }
    if (e.which == 3)
    {
        // Reset pan and zoom on right click.
        layerdict.transform.panx = 0;
        layerdict.transform.pany = 0;
        layerdict.transform.zoom = 1;
        render.RenderPCB(layerdict);
    }
    else if (!globalData.getRedrawOnDrag())
    {
        render.RenderPCB(layerdict);
    }
    render.drawHighlights();
    layerdict.transform.mousedown = false;
}

function handleMouseMove(e, layerdict)
{
    if (!layerdict.transform.mousedown)
    {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    let dx = e.offsetX - layerdict.transform.mousestartx;
    let dy = e.offsetY - layerdict.transform.mousestarty;
    layerdict.transform.panx += 2 * dx / layerdict.transform.zoom;
    layerdict.transform.pany += 2 * dy / layerdict.transform.zoom;
    layerdict.transform.mousestartx = e.offsetX;
    layerdict.transform.mousestarty = e.offsetY;

    if (globalData.getRedrawOnDrag())
    {
        render.RenderPCB(layerdict);
        render.drawHighlights();
    }
}

function handleMouseWheel(e, layerdict)
{
    e.preventDefault();
    e.stopPropagation();
    var t = layerdict.transform;
    var wheeldelta = e.deltaY;
    if (e.deltaMode == 1)
    {
        // FF only, scroll by lines
        wheeldelta *= 30;
    }
    else if (e.deltaMode == 2)
    {
        wheeldelta *= 300;
    }

    var m = Math.pow(1.1, -wheeldelta / 40);
    // Limit amount of zoom per tick.
    if (m > 2)
    {
        m = 2;
    }
    else if (m < 0.5)
    {
        m = 0.5;
    }

    t.zoom *= m;
    var zoomd = (1 - m) / t.zoom;
    t.panx += 2 * e.offsetX * zoomd;
    t.pany += 2 * e.offsetY * zoomd;
    render.RenderPCB(layerdict);
    render.drawHighlights();
}

function addMouseHandlers(div, layerdict)
{
    div.onmouseclick = function(e)
    {
        handleMouseClick(e, layerdict);
    };

    div.onmousedown = function(e)
    {
        handleMouseDown(e, layerdict);
    };

    div.onmousemove = function(e)
    {
        handleMouseMove(e, layerdict);
    };

    div.onmouseup = function(e)
    {
        handleMouseUp(e, layerdict);
    };

    div.onmouseout = function(e)
    {
        handleMouseUp(e, layerdict);
    };

    div.onwheel = function(e)
    {
        handleMouseWheel(e, layerdict);
    };


    for (var element of [div])
    {
        element.addEventListener("contextmenu", function(e)
        {
            e.preventDefault();
        }, false);
    }
}

module.exports = {
    addMouseHandlers, smoothScrollToRow
};

},{"./global.js":28,"./render.js":34}],30:[function(require,module,exports){
var globalData = require("./global.js");
var render     = require("./render.js");
var ipcb       = require("./ipcb.js");
var pcb        = require("./pcb.js");
var layerTable = require("./layer_table.js")
var bomTable   = require("./bom_table.js")

const boardRotation = document.getElementById("boardRotation");
boardRotation.oninput=function()
{
    render.SetBoardRotation(boardRotation.value);
};

const darkModeBox = document.getElementById("darkmodeCheckbox");
darkModeBox.onchange = function ()
{
    ipcb.setDarkMode(darkModeBox.checked);
};

const highlightpin1Checkbox =document.getElementById("highlightpin1Checkbox");
highlightpin1Checkbox.onchange=function()
{
    globalData.setHighlightPin1(highlightpin1Checkbox.checked);
    render.RenderPCB(globalData.GetAllCanvas().front);
    render.RenderPCB(globalData.GetAllCanvas().back);
};

const dragCheckbox = document.getElementById("dragCheckbox");
dragCheckbox.checked=function()
{
    globalData.setRedrawOnDrag(dragCheckbox.checked);
};
dragCheckbox.onchange=function()
{
    globalData.setRedrawOnDrag(dragCheckbox.checked);
};


const combineValues = document.getElementById("combineValues");
combineValues.onchange=function()
{
    globalData.setCombineValues(combineValues.checked);
    bomTable.populateBomTable();
};


const hidePlacedParts = document.getElementById("hidePlacedParts");
hidePlacedParts.onchange=function()
{
    globalData.setHidePlacedParts(hidePlacedParts.checked);
    bomTable.populateBomTable();
};

const debugModeBox = document.getElementById("debugMode");
debugModeBox.onchange=function()
{
    globalData.setDebugMode(debugModeBox.checked);
    render.RenderPCB(globalData.GetAllCanvas().front);
    render.RenderPCB(globalData.GetAllCanvas().back);
};



/* BOM Table FIlter */
const filterBOM = document.getElementById("bom-filter");
filterBOM.oninput=function()
{
    bomTable.Filter(filterBOM.value);
};

const clearFilterBOM = document.getElementById("clearBOMSearch");
clearFilterBOM.onclick=function()
{
    filterBOM.value="";
    bomTable.Filter(filterBOM.value);
};

const removeBOMEntries = document.getElementById("removeBOMEntries");
removeBOMEntries.oninput=function()
{
    bomTable.FilterByAttribute(removeBOMEntries.value);
};


/* Layer Table Filter */
const filterLayer = document.getElementById("layer-filter");
filterLayer.oninput=function()
{
    layerTable.Filter(filterLayer.value);
};

const clearFilterLayer = document.getElementById("clearLayerSearch");
clearFilterLayer.onclick=function()
{
    filterLayer.value="";
    layerTable.Filter(filterLayer.value);
};





const bomCheckboxes = document.getElementById("bomCheckboxes");
bomCheckboxes.oninput=function()
{
    bomTable.setBomCheckboxes(bomCheckboxes.value);
};

const additionalAttributes = document.getElementById("additionalAttributes");
additionalAttributes.oninput=function()
{
    ipcb.setAdditionalAttributes(additionalAttributes.value);
};

const fl_btn = document.getElementById("fl-btn");
fl_btn.onclick=function()
{
    ipcb.changeCanvasLayout("F");
};

const fb_btn = document.getElementById("fb-btn");
fb_btn.onclick=function()
{
    ipcb.changeCanvasLayout("FB");
};

const fullscreen_btn = document.getElementById("fullscreen-btn");
fullscreen_btn.onclick=function()
{
    ipcb.toggleFullScreen();
};

const bl_btn = document.getElementById("bl-btn");
bl_btn.onclick=function()
{
    ipcb.changeCanvasLayout("B");
};

const bom_btn = document.getElementById("bom-btn");
bom_btn.onclick=function()
{
    ipcb.changeBomLayout("BOM");
};

const lr_btn = document.getElementById("bom-lr-btn");
lr_btn.onclick=function()
{
    ipcb.changeBomLayout("LR");
};

const tb_btn = document.getElementById("bom-tb-btn");
tb_btn.onclick=function()
{
    ipcb.changeBomLayout("TB");
};

const pcb_btn = document.getElementById("pcb-btn");
pcb_btn.onclick=function()
{
    ipcb.changeBomLayout("PCB");
};

const lay_btn = document.getElementById("lay-btn");
lay_btn.onclick=function()
{
    ipcb.LayerTable_Toggle();
    ipcb.TestPointTable_Off();
    ipcb.TraceTable_Off();
    ipcb.Render_RightScreenTable();
};

const trace_btn = document.getElementById("trace-btn");
trace_btn.onclick=function()
{
    ipcb.LayerTable_Off();
    ipcb.TraceTable_Toggle();
    ipcb.TestPointTable_Off();
    ipcb.Render_RightScreenTable();
};

const testpoint_btn = document.getElementById("testpoint-btn");
testpoint_btn.onclick=function()
{
    ipcb.LayerTable_Off();
    ipcb.TraceTable_Off();
    ipcb.TestPointTable_Toggle();
    ipcb.Render_RightScreenTable();
};

const load_pcb = document.getElementById("pcbFileInput");
load_pcb.onchange=function()
{
  // Check for the various File API support.
  if (window.FileReader)
  {
      // FileReader are supported.

     var reader = new FileReader();
    // Read file into memory as UTF-8
    reader.readAsText(load_pcb.files[0]);

    // Handle errors load
    reader.onload = function loadHandler(event) {
                        pcbdata = JSON.parse(event.target.result);
                        // Delete all canvas entries
                        // Load new PCB data file
                        ipcb.LoadPCB(pcbdata);
                        ipcb.changeBomLayout(globalData.getBomLayout());
                    };

    reader.onerror = function errorHandler(evt) {
                          if(evt.target.error.name == "NotReadableError") {
                              alert("Cannot read file !");
                          }
                    };
  }
  else
  {
      alert('FileReader are not supported in this browser.');
  }
}

},{"./bom_table.js":25,"./global.js":28,"./ipcb.js":31,"./layer_table.js":32,"./pcb.js":33,"./render.js":34}],31:[function(require,module,exports){
/* DOM manipulation and misc code */

"use strict";


var Split             = require("split.js");
var globalData        = require("./global.js");
var render            = require("./render.js");
var renderCanvas      = require("./render/render_Canvas.js");
var pcb               = require("./pcb.js");
var handlers_mouse    = require("./handlers_mouse.js");
var layerTable        = require("./layer_table.js");
var bomTable          = require("./bom_table.js");
var Metadata          = require("./Metadata.js").Metadata;

var PCB_Trace = require("./PCB/PCB_Trace.js").PCB_Trace;
var PCB_TestPoint  = require("./PCB/PCB_TestPoint.js").PCB_TestPoint;
var PCB_Layer = require("./PCB/PCB_Layer.js").PCB_Layer;
var PCB_Part  = require("./PCB/PCB_Part.js").PCB_Part;

var Render_Layer = require("./render/Render_Layer.js").Render_Layer;
var version           = require("./version.js");

var Fullscreen = require("./fullscreen.js");
var colorMap        = require("./colormap.js");


var rightSideTable = require("./RightSideScreenTable.js")


/* Layer table */
let layerTableVisable     = true;
let traceTableVisable     = false;
let testPointTableVisable = false;

let rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
let mainLayout = "";



function setDarkMode(value)
{
    let topmostdiv = document.getElementById("topmostdiv");
    if (value)
    {
        topmostdiv.classList.add("dark");
    }
    else
    {
        topmostdiv.classList.remove("dark");
    }
    globalData.writeStorage("darkmode", value);


    const sheets = document.styleSheets[0].rules;
    for (var i = 0, len = sheets.length; i < len; i++)
    {
        if (sheets[i].selectorText == '.layer_checkbox')
        {
            if (value)
            {
                 sheets[i].style['filter'] = 'invert(100%)';
            }
            else
            {
                 sheets[i].style['filter'] = 'invert(0%)';
            }

        }
    }

    render.RenderPCB(globalData.GetAllCanvas().front);
    render.RenderPCB(globalData.GetAllCanvas().back);
}

function highlightPreviousRow(event)
{
    if (globalData.getCurrentHighlightedRowId().length == 1)
    {
        for (let i = 0; i < globalData.getHighlightHandlers().length - 1; i++)
        {
            if (globalData.getHighlightHandlers()[i + 1].id == globalData.getCurrentHighlightedRowId())
            {
                globalData.getHighlightHandlers()[i].handler(event);
                break;
            }
        }
        handlers_mouse.smoothScrollToRow(globalData.getCurrentHighlightedRowId());
    }
}

function highlightNextRow(event)
{
    if (globalData.getCurrentHighlightedRowId().length == 1)
    {
        for (let i = 1; i < globalData.getHighlightHandlers().length; i++)
        {
            if (globalData.getHighlightHandlers()[i - 1].id == globalData.getCurrentHighlightedRowId())
            {
                globalData.getHighlightHandlers()[i].handler(event);
                break;
            }
        }
        handlers_mouse.smoothScrollToRow(globalData.getCurrentHighlightedRowId());
    }
}

function modulesClicked(references)
{
    let lastClickedIndex = references.indexOf(globalData.getLastClickedRef());
    let ref = references[(lastClickedIndex + 1) % references.length];
    for (let handler of globalData.getHighlightHandlers())
    {
        if (handler.refs.indexOf(ref) >= 0)
        {
            globalData.setLastClickedRef(ref);
            handler.handler();
            handlers_mouse.smoothScrollToRow(globalData.getCurrentHighlightedRowId());
            break;
        }
    }
}

function changeCanvasLayout(layout)
{
    if(mainLayout != "BOM")
    {
        document.getElementById("fl-btn").classList.remove("depressed");
        document.getElementById("fb-btn").classList.remove("depressed");
        document.getElementById("bl-btn").classList.remove("depressed");

        switch (layout)
        {
        case "F":
            document.getElementById("fl-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM")
            {
                globalData.collapseCanvasSplit(1);
            }
            break;
        case "B":
            document.getElementById("bl-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM")
            {
                globalData.collapseCanvasSplit(0);
            }
            break;
        default:
            document.getElementById("fb-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM")
            {
                globalData.setSizesCanvasSplit([50, 50]);
            }
            break;
        }

        globalData.setCanvasLayout(layout);
        globalData.writeStorage("canvaslayout", layout);
        render.resizeAll();
    }
}

function populateMetadata()
{
    let metadata = Metadata.GetInstance();
    metadata.Set(pcbdata.metadata);

    if(metadata.revision == undefined)
    {
        document.getElementById("revision").innerHTML = "";
    }
    else
    {
        document.getElementById("revision").innerHTML = "Revision: " + metadata.revision.toString();
    }

    if(metadata.company == undefined)
    {
        document.getElementById("company").innerHTML = "";
    }
    else
    {
        document.getElementById("company").innerHTML  = metadata.company;
    }

    if(metadata.project_name == undefined)
    {
        document.getElementById("title").innerHTML = "";
    }
    else
    {
        document.getElementById("title").innerHTML = metadata.project_name;
    }

    if(metadata.date == undefined)
    {
        document.getElementById("filedate").innerHTML = "";
    }
    else
    {
        document.getElementById("filedate").innerHTML = metadata.date;
    }
}

function focusInputField(input)
{
    input.scrollIntoView(false);
    input.focus();
    input.select();
}

function focusBOMFilterField()
{
    focusInputField(document.getElementById("bom-filter"));
}

function toggleBomCheckbox(bomrowid, checkboxnum)
{
    if (!bomrowid || checkboxnum > globalData.getCheckboxes().length)
    {
        return;
    }
    let bomrow = document.getElementById(bomrowid);
    let checkbox = bomrow.childNodes[checkboxnum].childNodes[0];
    checkbox.checked = !checkbox.checked;
    checkbox.indeterminate = false;
    checkbox.onchange();
}

function removeGutterNode(node)
{
    for (let i = 0; i < node.childNodes.length; i++)
    {
        if (    (node.childNodes[i].classList )
             && (node.childNodes[i].classList.contains("gutter"))
        )
        {
            node.removeChild(node.childNodes[i]);
            break;
        }
    }
}

function cleanGutters()
{
    removeGutterNode(document.getElementById("bot"));
    removeGutterNode(document.getElementById("canvasdiv"));
}

function setAdditionalAttributes(value)
{
    globalData.setAdditionalAttributes(value);
    globalData.writeStorage("additionalAttributes", value);
    bomTable.populateBomTable();
}

// XXX: None of this seems to be working.
document.onkeydown = function(e)
{
    switch (e.key)
    {
        case "ArrowUp":
            highlightPreviousRow(e);
            e.preventDefault();
            break;
        case "ArrowDown":
            highlightNextRow(e);
            e.preventDefault();
            break;
        case "F11":
             e.preventDefault();
            break;
        default:
            break;
    }

    if (e.altKey)
    {
        switch (e.key)
        {
        case "f":
            focusBOMFilterField();
            e.preventDefault();
            break;
        case "z":
            changeBomLayout("BOM");
            e.preventDefault();
            break;
        case "x":
            changeBomLayout("LR");
            e.preventDefault();
            break;
        case "c":
            changeBomLayout("TB");
            e.preventDefault();
            break;
        case "v":
            changeCanvasLayout("F");
            e.preventDefault();
            break;
        case "b":
            changeCanvasLayout("FB");
            e.preventDefault();
            break;
        case "n":
            changeCanvasLayout("B");
            e.preventDefault();
            break;
        default:
            break;
        }
    }
};


document.getElementById("lay-btn").classList.add("depressed");
function LayerTable_Toggle()
{
    if (layerTableVisable)
    {
        layerTableVisable = false;
        document.getElementById("lay-btn").classList.remove("depressed");
    }
    else
    {
        layerTableVisable = true;
        document.getElementById("lay-btn").classList.add("depressed");
    }
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function LayerTable_Off()
{
    layerTableVisable = false;
    document.getElementById("lay-btn").classList.remove("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function LayerTable_On()
{
    layerTableVisable = true;
    document.getElementById("lay-btn").classList.add("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

document.getElementById("trace-btn").classList.remove("depressed");
function TraceTable_Toggle()
{
    if (traceTableVisable)
    {
        traceTableVisable = false;
        document.getElementById("trace-btn").classList.remove("depressed");
    }
    else
    {
        traceTableVisable = true;
        document.getElementById("trace-btn").classList.add("depressed");
    }
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TraceTable_Off()
{
    traceTableVisable = false;
    document.getElementById("trace-btn").classList.remove("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TraceTable_On()
{
    traceTableVisable = true;
    document.getElementById("trace-btn").classList.add("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

document.getElementById("testpoint-btn").classList.remove("depressed");
function TestPointTable_Toggle()
{
    if (testPointTableVisable)
    {
        testPointTableVisable = false;
        document.getElementById("testpoint-btn").classList.remove("depressed");
    }
    else
    {
        testPointTableVisable = true;
        document.getElementById("testpoint-btn").classList.add("depressed");
    }
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TestPointTable_Off()
{
    testPointTableVisable = false;
    document.getElementById("testpoint-btn").classList.remove("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function TestPointTable_On()
{
    testPointTableVisable = true;
    document.getElementById("testpoint-btn").classList.add("depressed");
    rightScreenTableVisable = layerTableVisable || traceTableVisable || testPointTableVisable;
    changeBomLayout(mainLayout);
}

function Render_RightScreenTable()
{
    let layerBody = document.getElementById("layer_table");
    let traceBody = document.getElementById("trace_table");
    let testPointBody = document.getElementById("testpoint_table");

    if(layerTableVisable)
    {
        layerBody.removeAttribute("hidden");
        traceBody.setAttribute("hidden", "hidden");
        testPointBody.setAttribute("hidden", "hidden");
    }
    else if(traceTableVisable)
    {
        layerBody.setAttribute("hidden", "hidden");
        traceBody.removeAttribute("hidden");
        testPointBody.setAttribute("hidden", "hidden");
    }
    else if(testPointTableVisable)
    {
        layerBody.setAttribute("hidden", "hidden");
        traceBody.setAttribute("hidden", "hidden");
        testPointBody.removeAttribute("hidden");
    }
    else
    {
        console.log("Right screen table disabled")
    }
}

function Create_Layers(pcbdata)
{
    globalData.layer_list = new Map();
    /* Create layer objects from JSON file */
    for(let layer of pcbdata.board.layers)
    {
        globalData.layer_list.set(layer.name, [new PCB_Layer(layer), new Render_Layer(layer)]);
    }

    /*
        Internally the following layers are used
            1. Pads
            2. Highlights
        If these were not created before, then they will be created here.
    */
    let layerPads       = {"name":"Pads", "paths": []};
    if(globalData.layer_list.get(layerPads.name) == undefined)
    {
        globalData.layer_list.set(layerPads.name, [new PCB_Layer(layerPads), new Render_Layer(layerPads)]);
    }

    let layerHighlights = {"name":"Highlights", "paths": []};
    if(globalData.layer_list.get(layerHighlights.name) == undefined)
    {
        globalData.layer_list.set(layerHighlights.name, [new PCB_Layer(layerHighlights), new Render_Layer(layerHighlights)]);
    }
}

function Create_Traces(pcbdata)
{
    globalData.pcb_traces = [];
    /* Create trace objects from JSON file */
    for(let trace of pcbdata.board.traces)
    {
        globalData.pcb_traces.push(new PCB_Trace(trace));
    }
}

function Create_TestPoints(pcbdata)
{
    globalData.pcb_testpoints = [];
    /* Create test point objects from JSON file */
    for(let testpoint of pcbdata.test_points)
    {
        globalData.pcb_testpoints.push(new PCB_TestPoint(testpoint));
    }
}

function Create_Parts(pcbdata)
{
    globalData.pcb_parts = [];
    /* Create layer objects from JSON file */
    for(let part of pcbdata.parts)
    {
        globalData.pcb_parts.push(new PCB_Part(part));
    }
}

function Create_Configuration(pcbdata)
{
    for(let config of pcbdata.configuration)
    {
        if(config.category=="color")
        {
            colorMap.SetColor(config.name, config.value);
        }
        else if(config.category=="setting")
        {
            if( config.name =="dark_mode")
            {
                globalData.writeStorage("darkmode", config.value == 1);
            }
            else if(config.name =="hight_first_pin")
            {
                globalData.writeStorage("highlightpin1", config.value == 1);
            }
            else if(config.name =="hide_placed_parts")
            {
                globalData.writeStorage("hidePlacedParts", config.value == 1);
            }
            else if(config.name =="combine_values")
            {
                globalData.writeStorage("combineValues", config.value == 1);
            }
            else if(config.name =="bom_pcb_layout")
            {
                globalData.writeStorage("bomlayout", config.value);
            }
            else if(config.name =="additional_table")
            {
                if( config.value == "Tr")
                {
                    layerTableVisable     = false;
                    traceTableVisable     = true;
                    testPointTableVisable = false;
                }
                else if( config.value == "Tp")
                {
                    layerTableVisable     = false;
                    traceTableVisable     = false;
                    testPointTableVisable = true;
                }
                else if( config.value == "Lr")
                {
                    layerTableVisable     = true;
                    traceTableVisable     = false;
                    testPointTableVisable = false;
                }
                else
                {
                    layerTableVisable     = false;
                    traceTableVisable     = false;
                    testPointTableVisable = false;
                }
            }
            else if(config.name =="bom_checkboxes")
            {
                let element = document.getElementById("bomCheckboxes");
                element.value = config.value;
                globalData.setBomCheckboxes(config.value);
                globalData.writeStorage("bomCheckboxes", config.value);
            }
            else if(config.name =="bom_part_attributes")
            {
                let element = document.getElementById("additionalAttributes");
                element.value = config.value;
                globalData.setAdditionalAttributes(config.value);
                globalData.writeStorage("additionalAttributes", config.value);
            }
            else
            {
               console.log("Warning: Unsupported setting parameter ", config.category, config.name, config.value);
            }
        }
        else
        {
            console.log("Warning: Unsupported parameter ", config.category, config.name);
        }
    }

}

function LoadPCB(pcbdata)
{
    // Update COnfiguration data
    Create_Configuration(pcbdata);

    // Remove all items from BOM table
    // And delete internal bom structure
    bomTable.clearBOMTable();
    pcb.DeleteBOM();
    // Create a new BOM table
    pcb.CreateBOM(pcbdata);

    for (let layer of globalData.layer_list)
    {
        renderCanvas.ClearCanvas(layer[1][globalData.render_layers].GetCanvas(true));
        renderCanvas.ClearCanvas(layer[1][globalData.render_layers].GetCanvas(false));
    }

    layerTable.clearLayerTable(); // <--- Actually viewed layer table
    Create_Layers(pcbdata); // <--- BAckground layer information
    rightSideTable.populateRightSideScreenTable();

    // Update Metadata
    let metadata = Metadata.GetInstance();
    metadata.Set(pcbdata.metadata);
    populateMetadata();

    // Create traces
    Create_Traces(pcbdata);

    // Create test points
    Create_TestPoints(pcbdata);

    // Parts
    Create_Parts(pcbdata);
}

function changeBomLayout(layout)
{
    mainLayout = layout;
    document.getElementById("bom-btn").classList.remove("depressed");
    document.getElementById("bom-lr-btn").classList.remove("depressed");
    document.getElementById("bom-tb-btn").classList.remove("depressed");
    document.getElementById("pcb-btn").classList.remove("depressed");
    switch (layout)
    {
    case "BOM":
        document.getElementById("bom-btn").classList.add("depressed");

        document.getElementById("fl-btn").classList.remove("depressed");
        document.getElementById("fb-btn").classList.remove("depressed");
        document.getElementById("bl-btn").classList.remove("depressed");



        if (globalData.getBomSplit())
        {
            if(rightScreenTableVisable)
            {
                globalData.destroyLayerSplit();
                globalData.setLayerSplit(null);
            }
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "none";
        document.getElementById("backcanvas").style.display = "none";
        if(rightScreenTableVisable)
        {
            rightScreenTableVisable = false;
            document.getElementById("lay-btn").classList.remove("depressed");
            document.getElementById("trace-btn").classList.remove("depressed");
            document.getElementById("testpoint-btn").classList.remove("depressed");
            document.getElementById("layerdiv").style.display = "none";
        }

        document.getElementById("bot").style.height = "";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        break;
    case "PCB":

        document.getElementById("pcb-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "none";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";

        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }

        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.remove(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.remove(   "split-horizontal");
        document.getElementById("frontcanvas").classList.add(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.add(   "split-horizontal");
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");
        }

        if (globalData.getBomSplit())
        {
            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(rightScreenTableVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }
        else
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [99, 0.1],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }

        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            direction: "vertical",
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));

        document.getElementById("canvasdiv"  ).style.height = "calc(99%)";

        break;
    case "TB":
        document.getElementById("bom-tb-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }
        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.remove(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.remove(   "split-horizontal");
        document.getElementById("frontcanvas").classList.add(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.add(   "split-horizontal");
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");
        }

        if (globalData.getBomSplit())
        {
            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(rightScreenTableVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }
        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            direction: "vertical",
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));


        break;
    case "LR":
        document.getElementById("bom-lr-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        if(rightScreenTableVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }
        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"    ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.add(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.add(   "split-horizontal");
        document.getElementById("frontcanvas").classList.remove(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.remove(   "split-horizontal");
        document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");

        if (globalData.getBomSplit())
        {

            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);

            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(rightScreenTableVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }

        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            direction: "vertical",
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));

        break;
    }
    globalData.setBomLayout(layout);
    globalData.writeStorage("bomlayout", layout);
    bomTable.populateBomTable();
    changeCanvasLayout(globalData.getCanvasLayout());
}

// TODO: Remove global variable. Used to test feature.
document.getElementById("fullscreen-btn").classList.remove("depressed");
let isFullscreen = false;
function toggleFullScreen()
{
    if(isFullscreen)
    {
        document.getElementById("fullscreen-btn").classList.remove("depressed");
        isFullscreen = false;
        Fullscreen.closeFullscreen();
    }
    else
    {
        document.getElementById("fullscreen-btn").classList.add("depressed");
        isFullscreen = true;
        Fullscreen.openFullscreen();
    }
}

//XXX: I would like this to be in the html functions js file. But this function needs to be
//     placed here, otherwise the application rendering becomes very very weird.
window.onload = function(e)
{
    console.time("on load");

    // Must occur early for storage parameters to be loaded. If not loaded early then
    // incorrect parameters may be used.
    globalData.initStorage();

    pcb.CreateBOM(pcbdata);
    let metadata = Metadata.GetInstance();
    metadata.Set(pcbdata.metadata);

    let versionNumberHTML       = document.getElementById("softwareVersion");
    versionNumberHTML.innerHTML = version.GetVersionString();
    console.log(version.GetVersionString());




    Create_Traces(pcbdata);
    Create_TestPoints(pcbdata);
    Create_Layers(pcbdata);
    Create_Parts(pcbdata);
    Create_Configuration(pcbdata);

    rightSideTable.populateRightSideScreenTable();

    // Must be called after loading PCB as rendering required the bounding box information for PCB
    render.initRender();


    //cleanGutters();

    populateMetadata();

    // Create canvas layers. One canvas per pcb layer



    // Set up mouse event handlers
    handlers_mouse.addMouseHandlers(document.getElementById("frontcanvas"), globalData.GetAllCanvas().front);
    handlers_mouse.addMouseHandlers(document.getElementById("backcanvas") , globalData.GetAllCanvas().back);

    console.log(globalData.readStorage("bomlayout"))

    globalData.setBomLayout(globalData.readStorage("bomlayout"));
    if (!globalData.getBomLayout())
    {
        globalData.setBomLayout("LR");
    }
    globalData.setCanvasLayout(globalData.readStorage("canvaslayout"));
    if (!globalData.getCanvasLayout())
    {
        globalData.setCanvasLayout("FB");
    }

    globalData.setBomCheckboxes(globalData.readStorage("bomCheckboxes"));
    if (globalData.getBomCheckboxes() === null)
    {
        globalData.setBomCheckboxes("");
    }

    globalData.setRemoveBOMEntries(globalData.readStorage("removeBOMEntries"));
    if (globalData.getRemoveBOMEntries() === null)
    {
        globalData.setRemoveBOMEntries("");
    }

    globalData.setAdditionalAttributes(globalData.readStorage("additionalAttributes"));
    if (globalData.getAdditionalAttributes() === null)
    {
        globalData.setAdditionalAttributes("");
    }

    if (globalData.readStorage("redrawOnDrag") === "false")
    {
        document.getElementById("dragCheckbox").checked = false;
        globalData.setRedrawOnDrag(false);
    }

    if (globalData.readStorage("darkmode") === "true")
    {
        document.getElementById("darkmodeCheckbox").checked = true;
        setDarkMode(true);
    }

    if (globalData.readStorage("hidePlacedParts") === "true")
    {
        document.getElementById("hidePlacedParts").checked = true;
        globalData.setHidePlacedParts(true);
    }

    if (globalData.readStorage("highlightpin1") === "true")
    {
        document.getElementById("highlightpin1Checkbox").checked = true;
        globalData.setHighlightPin1(true);
        render.RenderPCB(globalData.GetAllCanvas().front);
        render.RenderPCB(globalData.GetAllCanvas().back);
    }

    // If this is true then combine parts and display quantity
    if (globalData.readStorage("combineValues") === "true")
    {
        document.getElementById("combineValues").checked = true;
        globalData.setCombineValues(true);
    }

    if (globalData.readStorage("debugMode") === "true")
    {
        document.getElementById("debugMode").checked = true;
        globalData.setDebugMode(true);
    }

    // Read the value of board rotation from local storage
    let boardRotation = globalData.readStorage("boardRotation");
    /*
        Adjusted to match how the update rotation angle is calculated.
        If null, then angle not in local storage, set to 180 degrees.
    */
    if (boardRotation === null)
    {
        boardRotation = 180;
    }
    else
    {
        boardRotation = parseInt(boardRotation);
    }

    // Set internal global variable for board rotation.
    globalData.SetBoardRotation(boardRotation);
    document.getElementById("boardRotation").value = (boardRotation-180) / 5;
    document.getElementById("rotationDegree").textContent = (boardRotation-180);

    // Triggers render
    changeBomLayout(globalData.getBomLayout());
    console.timeEnd("on load");
};

window.onresize = render.resizeAll;
window.matchMedia("print").addListener(render.resizeAll);

module.exports = {
    changeBomLayout        , setDarkMode      , changeCanvasLayout,
    setAdditionalAttributes, LayerTable_Toggle, TraceTable_Toggle,
    TestPointTable_Toggle  , toggleFullScreen , LoadPCB, LayerTable_Off,
    LayerTable_On          , TraceTable_Off   , TraceTable_On,
    TestPointTable_Off     , TestPointTable_On, Render_RightScreenTable
};

},{"./Metadata.js":3,"./PCB/PCB_Layer.js":5,"./PCB/PCB_Part.js":6,"./PCB/PCB_TestPoint.js":7,"./PCB/PCB_Trace.js":8,"./RightSideScreenTable.js":24,"./bom_table.js":25,"./colormap.js":26,"./fullscreen.js":27,"./global.js":28,"./handlers_mouse.js":29,"./layer_table.js":32,"./pcb.js":33,"./render.js":34,"./render/Render_Layer.js":35,"./render/render_Canvas.js":40,"./version.js":44,"split.js":1}],32:[function(require,module,exports){
/*
    Layer table forms the right half of display. The table contains each of the 
    used layers in the design along with check boxes to show/hide the layer.

    The following function interfaces the layers for the project to the GUI.


    Layer table is composed of three parts:
        1. Search bar
        2. Header
        3. Layers

    Search bar allows users to type a word and layer names matching what 
    has been typed will remain while all other entries will be hidden.

    Header simply displays column names for each each column.

    Last layer ,body, displays an entry per used layer that are not
    filtered out.
*/
"use strict";

var pcb        = require("./pcb.js");
var globalData = require("./global.js");
var Table_LayerEntry = require("./render/Table_LayerEntry.js").Table_LayerEntry

function populateLayerTable()
{
    /* Populate header and BOM body. Place into DOM */
    populateLayerHeader();
    populateLayerBody();

    /* Read filter string. Hide BOM elements that dont cintain string entry */
    let filterLayer = document.getElementById("layer-filter");
    Filter(filterLayer.value)
}


let filterLayer = "";
function getFilterLayer() 
{
    return filterLayer;
}

function populateLayerHeader()
{
    let layerHead = document.getElementById("layerhead");
    while (layerHead.firstChild) 
    {
        layerHead.removeChild(layerHead.firstChild);
    }

    // Header row
    let tr = document.createElement("TR");
    // Defines the
    let th = document.createElement("TH");

    th.classList.add("visiableCol");

    let tr2 = document.createElement("TR");
    let thf = document.createElement("TH"); // front
    let thb = document.createElement("TH"); // back
    let thc = document.createElement("TH"); // color

    thf.innerHTML = "Front"
    thb.innerHTML = "Back"
    thc.innerHTML = "Color"
    tr2.appendChild(thf)
    tr2.appendChild(thb)
    tr2.appendChild(thc)

    th.innerHTML = "Visible";
    th.colSpan = 3
    let span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    th = document.createElement("TH");
    th.innerHTML = "Layer";
    th.rowSpan = 2;
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    layerHead.appendChild(tr);
    layerHead.appendChild(tr2);
}

function populateLayerBody()
{
    let layerBody = document.getElementById("layerbody");
    while (layerBody.firstChild) 
    {
        layerBody.removeChild(layerBody.firstChild);
    }

    // remove entries that do not match filter
    for (let layer of globalData.layer_list)
    {
        layerbody.appendChild(new Table_LayerEntry(layer[1][globalData.pcb_layers]));
    }
}

function Filter(s)
{
    s = s.toLowerCase();
    let layerBody = document.getElementById("layerbody");
    
    for (let layer of layerBody.rows)
    {

        if(layer.innerText.trim().toLowerCase().includes(s))
        {
            layer.style.display = "";
        }
        else
        {
            layer.style.display = "none";
        }
    }
   
}

module.exports = {
    Filter, populateLayerTable
}
},{"./global.js":28,"./pcb.js":33,"./render/Table_LayerEntry.js":36}],33:[function(require,module,exports){
/*
    This file contains all of the definitions for working with pcbdata.json. 
    This file declares all of the access functions and interfaces for converting 
    the json file into an internal data structure. 
*/

"use strict";
var Part     = require("./Part.js");
var globalData = require("./global.js");


/***************************************************************************************************
                                         PCB Part Interfaces
**************************************************************************************************/
// This will hold the part objects. There is one entry per part
// Format of a part is as follows
// [VALUE,PACKAGE,REFRENECE DESIGNATOR, ,LOCATION, ATTRIBUTE],
// where ATTRIBUTE is a dict of ATTRIBUTE NAME : ATTRIBUTE VALUE
let BOM = [];

let BOM_Combined = new Map();

//TODO: There should be steps here for validating the data and putting it into a 
//      format that is valid for our application
function CreateBOM(pcbdataStructure)
{
    // For every part in the input file, convert it to our internal 
    // representation data structure.
    for(let part of pcbdataStructure.parts)
    {
        // extract the part data. This is here so I can iterate the design 
        // when I make changes to the underlying json file.
        let value     = part.value;
        let footprint = "";
        let reference = part.name;
        let location  = part.location;

        let attributes = new Map(); // Create a empty dictionary
        for(let i of part.attributes)
        {
            attributes.set(i.name.toLowerCase(),i.value.toLowerCase());
        }

        let checkboxes = new Map();
        // Add the par to the global part array
        BOM.push(new Part.Part(value, footprint, reference, location, attributes, checkboxes));

        if(BOM_Combined.has(value))
        {
            let exisingPart = BOM_Combined.get(value)
            exisingPart.quantity = exisingPart.quantity + 1;
            exisingPart.reference = exisingPart.reference + "," + reference;
        }
        else
        {
            // Add the par to the global part array
            BOM_Combined.set(value, new Part.Part(value, footprint, reference, location, [], []));
        }
    }
}

function GetBOM()
{
     if(globalData.getCombineValues())
     {
        let result = []

        for(let parts of BOM_Combined.values())
        {
            result.push(parts)
        }
        return result;
     }
     else
     {
        return BOM;
     }
}

function DeleteBOM()
{
    BOM = [];
    BOM_Combined = new Map();
}

function getAttributeValue(part, attributeToLookup)
{
    let attributes = part.attributes;
    let result = "";

    if(!globalData.getCombineValues())
    {
        if(attributeToLookup == "name")
        {
            result = part.reference;
        }
        else
        {
                result = (attributes.has(attributeToLookup) ? attributes.get(attributeToLookup) : "");
        }
    }
    // Check that the attribute exists by looking up its name. If it exists
    // the return the value for the attribute, otherwise return an empty string. 
    return result;
}

/***************************************************************************************************
                                         PCB Layers Interfaces
***************************************************************************************************/

function GetLayerCanvas(layerName, isFront)
{
    let layerCanvas = globalData.layer_list.get(layerName);

    if(layerCanvas == undefined)
    {
        return undefined;
    }
    else
    {
        return layerCanvas[globalData.render_layers].GetCanvas(isFront);
    }
}

module.exports = {
    CreateBOM, GetBOM, DeleteBOM, getAttributeValue, GetLayerCanvas
};
},{"./Part.js":23,"./global.js":28}],34:[function(require,module,exports){
/* PCB rendering code */

"use strict";

var globalData         = require("./global.js");
var render_canvas      = require("./render/render_Canvas.js");
var pcb                = require("./pcb.js");

function DrawTraces(isViewFront, scalefactor)
{
    for (let trace of globalData.pcb_traces)
    {
        trace.Render(isViewFront, scalefactor);
    }
}

function DrawLayers(isViewFront, scalefactor)
{
    for (let layer of globalData.layer_list)
    {
        layer[1][0].Render(isViewFront, scalefactor);
    }
}

function DrawModules(isViewFront)
{
    // TODO: Global function here. GUI context should be passed as
    //       an argument to the function.
    let guiContext = pcb.GetLayerCanvas("Pads", isViewFront).getContext("2d")
    for (let part of globalData.pcb_parts)
    {
        part.Render(guiContext, isViewFront, false);
    }
}

function DrawHighlitedModules(isViewFront, layer, scalefactor, refs)
{
    // TODO: Global function here. GUI context should be passed as
    //       an argument to the function.
    let guiContext = pcb.GetLayerCanvas("Highlights", isViewFront).getContext("2d")
    // Draw selected parts on highlight layer.
    for (let part of globalData.pcb_parts)
    {
        if(refs.includes(part.name))
        {
            part.Render(guiContext, isViewFront, true);
        }
    }
}

function RenderPCB(canvasdict)
{
    render_canvas.RedrawCanvas(canvasdict);
    let isViewFront = (canvasdict.layer === "F");

    /*
        Renders entire PCB for specified view
        Rendering occurs in three steps
            1. Modules
            2. Traces
            3. Layers

        Step 3 essentially renders items on layers not rendered in 1 or 2.
        This could be silkscreen, cutouts, board edge, etc...
    */
    DrawModules(isViewFront);
    DrawTraces (isViewFront, canvasdict.transform.s);
    DrawLayers (isViewFront, canvasdict.transform.s);
}

function ClearCanvas()
{
    initRender();
}

function RotateVector(v, angle)
{
    return render_canvas.rotateVector(v, angle);
}

function initRender()
{
    let allcanvas = {
        front: {
            transform: {
                x: 0,
                y: 0,
                s: 1,
                panx: 0,
                pany: 0,
                zoom: 1,
                mousestartx: 0,
                mousestarty: 0,
                mousedown: false,
            },
            layer: "F",
        },
        back: {
            transform: {
                x: 0,
                y: 0,
                s: 1,
                panx: 0,
                pany: 0,
                zoom: 1,
                mousestartx: 0,
                mousestarty: 0,
                mousedown: false,
            },
            layer: "B",
        }
    };
    // Sets the data strucure to a default value.
    globalData.SetAllCanvas(allcanvas);
    // Set the scale so the PCB will be scaled and centered correctly.
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().front);
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().back);
}

function drawHighlightsOnLayer(canvasdict)
{
    let isViewFront = (canvasdict.layer === "F");
    render_canvas.ClearHighlights(canvasdict);

    DrawHighlitedModules(isViewFront, canvasdict.layer, canvasdict.transform.s, globalData.getHighlightedRefs());
}

function drawHighlights()
{
    drawHighlightsOnLayer(globalData.GetAllCanvas().front);
    drawHighlightsOnLayer(globalData.GetAllCanvas().back);
}

function resizeAll()
{
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().front);
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().back);
    RenderPCB(globalData.GetAllCanvas().front);
    RenderPCB(globalData.GetAllCanvas().back);
}

function rerenderAll()
{
    RenderPCB(globalData.GetAllCanvas().front);
    RenderPCB(globalData.GetAllCanvas().back);
}

function SetBoardRotation(value)
{
    /*
        The board when drawn by default is show rotated -180 degrees.
        The following will add 180 degrees to what the user calculates so that the PCB
        will be drawn in the correct orientation, i.e. displayed as shown in ECAD program.
        Internally the range of degrees is stored as 0 -> 360
    */
    globalData.SetBoardRotation((value * 5)+180);
    globalData.writeStorage("boardRotation", globalData.GetBoardRotation());
    /*
        Display the correct range of degrees which is -180 -> 180.
        The following just remaps 360 degrees to be in the range -180 -> 180.
    */
    document.getElementById("rotationDegree").textContent = (globalData.GetBoardRotation()-180);
    resizeAll();
}

module.exports = {
    initRender, resizeAll, RenderPCB, drawHighlights, RotateVector, SetBoardRotation, ClearCanvas, rerenderAll
};

},{"./global.js":28,"./pcb.js":33,"./render/render_Canvas.js":40}],35:[function(require,module,exports){
"use strict";

let layerZNumber = 0;

class Render_Layer
{
    // Render should take as an argument the model not the raw JSON data
    constructor(iPCB_JSON_Layer)
    {
        this.visible_front = true;
        this.visible_back  = true;
        this.front_id      = "layer_front_" + iPCB_JSON_Layer.name;
        this.back_id       = "layer_rear_"  + iPCB_JSON_Layer.name;

        let canvas_front           = document.getElementById("front-canvas-list");
        let layer_front            = document.createElement("canvas");
        layer_front.id             = this.front_id;
        layer_front.style.zIndex   = layerZNumber;
        layer_front.style.position = "absolute";
        layer_front.style.left     = 0;
        layer_front.style.top      = 0;
        canvas_front.appendChild(layer_front);

        let canvas_back           = document.getElementById("back-canvas-list");
        let layer_back            = document.createElement("canvas");
        layer_back.id             = this.back_id;
        layer_back.style.zIndex   = layerZNumber;
        layer_back.style.position = "absolute";
        layer_back.style.left     = 0;
        layer_back.style.top      = 0;
        canvas_back.appendChild(layer_back);


        this.canvas_front = document.getElementById(this.front_id);
        this.canvas_back  = document.getElementById(this.back_id);


        layerZNumber = layerZNumber + 1;
    }

    SetVisibility(isFront, visibility)
    {
        if(isFront)
        {
            this.visible_front = visibility;
            if(visibility)
            {
                this.canvas_front.style.display="";
            }
            else
            {
                this.canvas_front.style.display="none";
            }
        }
        else
        {
            this.visible_back  = visibility;
            if(visibility)
            {
                this.canvas_back.style.display="";
            }
            else
            {
                this.canvas_back.style.display="none";
            }
        }
    }

    IsVisible(isFront)
    {
        if(isFront)
        {
            return this.visible_front;
        }
        else
        {
            return this.visible_back;
        }
    }

    GetCanvas(isFront)
    {
        if(isFront)
        {
            return this.canvas_front;
        }
        else
        {
            return this.canvas_back;
        }
    }
}



module.exports =
{
    Render_Layer
};
},{}],36:[function(require,module,exports){
"use strict";

var globalData = require("../global.js");
var colorMap   = require("../colormap.js");
var render     = require("../render.js");

function createLayerCheckboxChangeHandler(layer, isFront)
{
    return function()
    {
        /*
            The following will correctly signal to the canvas what PCB layers should be displayed.
        */
        if(isFront)
        {
            if(globalData.readStorage( "checkbox_layer_front_" + layer.name + "_visible" ) == "true")
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,false);
                globalData.writeStorage("checkbox_layer_front_" + layer.name + "_visible", "false");
            }
            else
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,true);
                globalData.writeStorage("checkbox_layer_front_" + layer.name + "_visible", "true");
            }
        }
        else
        {
            if(globalData.readStorage( "checkbox_layer_back_" + layer.name + "_visible" ) == "true")
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,false);
                globalData.writeStorage("checkbox_layer_back_" + layer.name + "_visible", "false");
            }
            else
            {
                globalData.layer_list.get(layer.name)[globalData.render_layers].SetVisibility(isFront,true);
                globalData.writeStorage("checkbox_layer_back_" + layer.name + "_visible", "true");
            }
        }
    }
}

class Table_LayerEntry
{
    constructor(layer)
    {
        this.visible_front = true;
        this.visible_back  = true;

        this.layerName = layer.name;
        this.activeColorSpanElement = document.createElement("Span");

        // Assumes that all layers are visible by default.
        if (globalData.readStorage( "checkbox_layer_front_" + this.layerName + "_visible" ) == null)
        {
            this.visible_front = true;
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(true,true);
            globalData.writeStorage("checkbox_layer_front_" + this.layerName + "_visible", "true");
        }
        else if ( globalData.readStorage( "checkbox_layer_front_" + this.layerName + "_visible" ) == "true")
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(true,true);
            this.visible_front = true;
        }
        else
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(true,false);
            this.visible_front = false;
        }

        if (globalData.readStorage( "checkbox_layer_back_" + this.layerName + "_visible" ) == null)
        {
            this.visible_back = true;
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(false,true);
            globalData.writeStorage("checkbox_layer_back_" + this.layerName + "_visible", "true");
        }
        // Assumes that all layers are visible by default.
        else if (globalData.readStorage( "checkbox_layer_back_" + this.layerName + "_visible" ) == "true")
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(false,true);
            this.visible_back = true;
        }
        else
        {
            globalData.layer_list.get(this.layerName)[globalData.render_layers].SetVisibility(false,false);
            this.visible_back = false;
        }

        // Assumes that all layers are visible by default.
        if (globalData.readStorage( "checkbox_layer_color_" + this.layerName) == null )
        {

        }
        else
        {

        }


        let tr = document.createElement("TR");
        tr.appendChild(this.CreateCheckbox_Visible(layer, true));
        tr.appendChild(this.CreateCheckbox_Visible(layer, false));
        tr.appendChild(this.CreateCheckbox_Color(layer));

        // Layer
        let td = document.createElement("TD");
        td.innerHTML = this.layerName;
        tr.appendChild(td);
        return tr;
    }

    /*
        Create a checkbox entry for layer table.

        When checked (visible) an eye icon will be used
        and when unselected (not visible) an eye icon will
        slash will be used.
    */
    CreateCheckbox_Visible(layer, isFront)
    {
        let newlabel = document.createElement("Label");
        let td       = document.createElement("TD");
        let input    = document.createElement("input");

        input.type = "checkbox";
        newlabel.classList.add("check_box_layer")
        if(isFront)
        {
            input.checked = this.visible_front;
        }
        else
        {
            input.checked = this.visible_back;
        }

        input.onchange = createLayerCheckboxChangeHandler(layer, isFront);

        var span = document.createElement("Span");
        span.classList.add("layer_checkbox")

        newlabel.appendChild(input);
        newlabel.appendChild(span);
        td.appendChild(newlabel);
        return td;
    }

    UpdateActiveSpanElementColor(event)
    {
        this.activeColorSpanElement.style.backgroundColor = event.target.value;
        colorMap.SetColor(this.layerName,event.target.value );
        render.rerenderAll();
    }

    CreateCheckbox_Color(layer)
    {
        let newlabel = document.createElement("Label");
        let td       = document.createElement("TD");
        let input    = document.createElement("input");

        input.type = "color";
        let colorCode = colorMap.GetTraceColor(this.layerName)

        if(colorCode.length > 7)
        {
            console.log("WARNING: Only RGB color codes supported", colorCode);
            colorCode = colorCode.substring(0, 7);
            input.value = colorCode;
            input.defaultValue = colorCode;
        }
        else
        {
            input.value = colorCode;
            input.defaultValue = colorCode;
        }

        input.addEventListener("change", this.UpdateActiveSpanElementColor.bind(this), false);

        newlabel.classList.add("check_box_color")

        this.activeColorSpanElement.classList.add("checkmark_color")
        this.activeColorSpanElement.style.backgroundColor = colorMap.GetTraceColor(this.layerName);

        newlabel.appendChild(input);
        newlabel.appendChild(this.activeColorSpanElement);
        td.appendChild(newlabel);
        return td;
    }
}

module.exports = {
    Table_LayerEntry
};

},{"../colormap.js":26,"../global.js":28,"../render.js":34}],37:[function(require,module,exports){
"use strict";

var globalData = require("../global.js");





class Table_TestPointEntry
{
    constructor(testPoint)
    {

        let tr = document.createElement("TR");

        // trace name
        let td = document.createElement("TD");
        td.innerHTML = testPoint.name
        tr.appendChild(td);

        td = document.createElement("TD");
        td.innerHTML = testPoint.expected;
        tr.appendChild(td);

        td = document.createElement("TD");
        td.contentEditable = "true"
        tr.appendChild(td);

        td = document.createElement("TD");
        td.innerHTML = testPoint.description;
        tr.appendChild(td);





        return tr;
    }
}

module.exports = {
    Table_TestPointEntry
};

},{"../global.js":28}],38:[function(require,module,exports){
"use strict";

var globalData = require("../global.js");
var colorMap   = require("../colormap.js");

class Table_TraceEntry
{
    constructor(trace)
    {

        let tr = document.createElement("TR");
        
        // trace name
        let td = document.createElement("TD");
        td.innerHTML = trace.name;
        tr.appendChild(td);
        
        td = document.createElement("TD");
        td.innerHTML = "0.0 Omega";
        tr.appendChild(td);

        td = document.createElement("TD");
        td.innerHTML = "0.0 L";
        tr.appendChild(td);
        

        return tr;
    }
}

module.exports = {
    Table_TraceEntry
};

},{"../colormap.js":26,"../global.js":28}],39:[function(require,module,exports){
"use strict";

class Point {
    constructor(x, y)
    {
        this.x = x;
        this.y = y;
    }
}

module.exports = {
    Point
};

},{}],40:[function(require,module,exports){
"use strict";
var pcb        = require("../pcb.js");
var globalData = require("../global.js");
var Render_Layer = require("./Render_Layer.js").Render_Layer;

function prepareCanvas(canvas, flip, transform) 
{
    let ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(transform.zoom, transform.zoom);
    ctx.translate(transform.panx, transform.pany);
    if (flip) 
    {
        ctx.scale(-1, 1);
    }
    ctx.translate(transform.x, transform.y);
    ctx.rotate(globalData.GetBoardRotation()*Math.PI/180);
    ctx.scale(transform.s, transform.s);
}

function rotateVector(v, angle) 
{
    angle = angle*Math.PI/180;
    return [
        v[0] * Math.cos(angle) - v[1] * Math.sin(angle),
        v[0] * Math.sin(angle) + v[1] * Math.cos(angle)
    ];
}

function recalcLayerScale(canvasdict, canvas) 
{
    let layerID = (canvasdict.layer === "F") ? "frontcanvas" : "backcanvas" ;
    let width   = document.getElementById(layerID).clientWidth * 2;
    let height  = document.getElementById(layerID).clientHeight * 2;
    let bbox    = applyRotation(pcbdata.board.bounding_box);
    let scalefactor = 0.98 * Math.min( width / (bbox.x1 - bbox.x0), height / (bbox.y1 - bbox.y0));

    if (scalefactor < 0.1)
    {
        scalefactor = 1;
    }

    canvasdict.transform.s = scalefactor;

    if ((canvasdict.layer != "B"))
    {
        canvasdict.transform.x = -((bbox.x1 + bbox.x0) * scalefactor + width) * 0.5;
    }
    else
    {
        canvasdict.transform.x = -((bbox.x1 + bbox.x0) * scalefactor - width) * 0.5;
    }
    canvasdict.transform.y = -((bbox.y1 + bbox.y0) * scalefactor - height) * 0.5;

    if(canvasdict.layer ==="F")
    {
        canvas.width        = width;
        canvas.height       = height;
        canvas.style.width  = (width / 2) + "px";
        canvas.style.height = (height / 2) + "px";
    }
    else
    {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = (width / 2) + "px";
        canvas.style.height = (height / 2) + "px";
    }
}

function applyRotation(bbox) 
{
    let corners = [
        [bbox.x0, bbox.y0],
        [bbox.x0, bbox.y1],
        [bbox.x1, bbox.y0],
        [bbox.x1, bbox.y1],
    ];
    corners = corners.map((v) => rotateVector(v, globalData.GetBoardRotation()));
    return {
        x0: corners.reduce((a, v) => Math.min(a, v[0]), Infinity),
        y0: corners.reduce((a, v) => Math.min(a, v[1]), Infinity),
        x1: corners.reduce((a, v) => Math.max(a, v[0]), -Infinity),
        y1: corners.reduce((a, v) => Math.max(a, v[1]), -Infinity),
    };
}

function ClearHighlights(canvasdict)
{
    let canvas = pcb.GetLayerCanvas("Highlights", (canvasdict.layer === "F"));
    ClearCanvas(canvas);
}

function ClearCanvas(canvas) 
{
    let ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function prepareLayer(canvasdict, canvas)
{
    let flip = (canvasdict.layer != "B");

    if(canvasdict.layer === "F")
    {
        prepareCanvas(canvas, flip, canvasdict.transform);
    }
    else
    {
        prepareCanvas(canvas, flip, canvasdict.transform);
    }
}

function RedrawCanvas(layerdict)
{
    let isFront = (layerdict.layer === "F")

    for (let layer of globalData.layer_list)
    {
        let canvas = layer[1][globalData.render_layers].GetCanvas(isFront)
        prepareLayer(layerdict, canvas);
        ClearCanvas(canvas);
    }
}

function ResizeCanvas(layerdict)
{
    let flip = (layerdict.layer != "B");
    let isFront = (layerdict.layer === "F")

    for (let layer of globalData.layer_list)
    {
        let canvas = layer[1][globalData.render_layers].GetCanvas(isFront)
        recalcLayerScale(layerdict, canvas);
        prepareCanvas(canvas, flip, layerdict.transform);
        ClearCanvas(canvas);
    }
}


module.exports = {
    ResizeCanvas, RedrawCanvas, rotateVector, ClearHighlights, ClearCanvas
};
},{"../global.js":28,"../pcb.js":33,"./Render_Layer.js":35}],41:[function(require,module,exports){
"use strict";

var Point = require("./point.js").Point;

function Arc(guiContext, centerPoint, radius, angleStart, angleEnd, renderOptions )
{
    guiContext.save();

    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }

    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.lineCap)
    {
        guiContext.lineCap = renderOptions.lineCap;
    }


    // https://www.w3schools.com/tags/canvas_arc.asp
    guiContext.beginPath();
    guiContext.arc( centerPoint.x, centerPoint.y, radius, angleStart*Math.PI/180, angleEnd*Math.PI/180);

    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}

function Line(guiContext, startPoint, endPoint, renderOptions )
{
    guiContext.save();

    if( renderOptions.color)
    {
        guiContext.fillStyle   =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }

    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.lineCap)
    {
        guiContext.lineCap = renderOptions.lineCap;
    }

    guiContext.beginPath();
    guiContext.moveTo(startPoint.x, startPoint.y);
    guiContext.lineTo(endPoint.x, endPoint.y);

    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}

function RegularPolygon(guiContext, centerPoint, vertices, angle, renderOptions )
{

    guiContext.save();
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }
    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.globalAlpha)
    {
        guiContext.globalAlpha = renderOptions.globalAlpha;
    }

    guiContext.translate(centerPoint.x, centerPoint.y);
    /* 
       Rotate origin based on angle given
       NOTE: compared to oblong pads, no additional modification is required
             of angle to get the angle to rotate correctly.
    */
    guiContext.rotate(angle*Math.PI/180);

    /* 
       Rotate origin based on angle given
       NOTE: compared to oblong pads, no additional modification is required
             of angle to get the angle to rotate correctly.
    */
    //guiContext.rotate((angle)*Math.PI/180);

    guiContext.beginPath();
    guiContext.moveTo(vertices[0].x,vertices[0].y);

    for(var i = 1; i < vertices.length; i++)
    {
        guiContext.lineTo(vertices[i].x,vertices[i].y);
    }
    guiContext.closePath();
    
    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}


function IrregularPolygon(guiContext, vertices, renderOptions )
{

    guiContext.save();
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }
    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.globalAlpha)
    {
        guiContext.globalAlpha = renderOptions.globalAlpha;
    }

    if(renderOptions.compositionType)
    {
        guiContext.globalCompositeOperation  = renderOptions.compositionType;
    }

    guiContext.beginPath();
    guiContext.moveTo(vertices[0].x,vertices[0].y);

    for(var i = 1; i < vertices.length; i++)
    {
        guiContext.lineTo(vertices[i].x,vertices[i].y);
    }
    guiContext.closePath();

    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}


function Circle(guiContext, centerPoint, radius, renderOptions)
{
    guiContext.save();
    
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }

    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    /* Draw the drill hole */
    guiContext.beginPath();
    guiContext.arc(centerPoint.x,centerPoint.y, radius, 0, 2*Math.PI);

    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();
}


/*
    To render an oval some javascript trickery is used. To half circles are rendered, 
    and since by default when drawing shapes they will by default be connected by at 
    least one point if close path is not called. So by just calling the top and bottom 
    half circles, the rectangular center of the half circle will be filled.
*/
function Oval(guiContext, centerPoint, height, width, angle, renderOptions)
{

    // Center point of both circles.
    let centerPoint1 = new Point(0, -height/2);
    let centerPoint2 = new Point(0, height/2);
    let radius = width/2;

    guiContext.save();
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;
    }

    /*
        The following only really needs to draw two semicircles as internally the semicircles will 
        attach to each other to create the completed object.
     */

    guiContext.translate(centerPoint.x, centerPoint.y);
    /* 
       Rotate origin based on angle given
       NOTE: For some reason EagleCAD items are rotated by 90 degrees by default. 
             This corrects for that so items are displayed correctly.
             This seems to also only be required for oblong pads. This is most likely due to the 
             arc functions used.
    */
    guiContext.rotate((angle-90)*Math.PI/180);

    guiContext.beginPath();
    guiContext.arc(centerPoint1.x, centerPoint1.y, radius, Math.PI,0);
    guiContext.arc(centerPoint2.x, centerPoint2.y, radius, 0, Math.PI );
    guiContext.closePath();
    
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    // Restores context to state prior to this rendering function being called. 
    guiContext.restore();
}


module.exports = {
    Arc, Line, RegularPolygon, IrregularPolygon, Circle, Oval
};

},{"./point.js":39}],42:[function(require,module,exports){
/*
    Layer table forms the right half of display. The table contains each of the
    used layers in the design along with check boxes to show/hide the layer.

    The following function interfaces the layers for the project to the GUI.


    Layer table is composed of three parts:
        1. Search bar
        2. Header
        3. Layers

    Search bar allows users to type a word and layer names matching what
    has been typed will remain while all other entries will be hidden.

    Header simply displays column names for each each column.

    Last layer ,body, displays an entry per used layer that are not
    filtered out.
*/
"use strict";

var pcb        = require("./pcb.js");
var globalData = require("./global.js");
var Table_TestPointEntry = require("./render/Table_TestPointEntry.js").Table_TestPointEntry

function populateTestPointTable()
{
    /* Populate header and BOM body. Place into DOM */
    populateTestPointHeader();
    populateTestPointBody();
}

let filterLayer = "";
function getFilterTestPoint()
{
    return filterLayer;
}

function populateTestPointHeader()
{
    let layerHead = document.getElementById("testpointhead");
    while (layerHead.firstChild)
    {
        layerHead.removeChild(layerHead.firstChild);
    }

    // Header row
    let tr = document.createElement("TR");
    // Defines the
    let th = document.createElement("TH");

    th.classList.add("visiableCol");

    th.innerHTML = "Test Point";
    let span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    th = document.createElement("TH");
    th.innerHTML = "Expected";
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    th = document.createElement("TH");
    th.innerHTML = "Measured";
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    th = document.createElement("TH");
    th.innerHTML = "Description";
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    layerHead.appendChild(tr);
}

function populateTestPointBody()
{
    let testPointBody = document.getElementById("testpointbody");
    while (testPointBody.firstChild)
    {
        testPointBody.removeChild(testPointBody.firstChild);
    }

    // remove entries that do not match filter
    for (let testpoint of globalData.pcb_testpoints)
    {
        testPointBody.appendChild(new Table_TestPointEntry(testpoint));
    }
}

function Filter(s)
{

}

module.exports = {
    populateTestPointTable
}

},{"./global.js":28,"./pcb.js":33,"./render/Table_TestPointEntry.js":37}],43:[function(require,module,exports){
/*
    Layer table forms the right half of display. The table contains each of the
    used layers in the design along with check boxes to show/hide the layer.

    The following function interfaces the layers for the project to the GUI.


    Layer table is composed of three parts:
        1. Search bar
        2. Header
        3. Layers

    Search bar allows users to type a word and layer names matching what
    has been typed will remain while all other entries will be hidden.

    Header simply displays column names for each each column.

    Last layer ,body, displays an entry per used layer that are not
    filtered out.
*/
"use strict";

var pcb        = require("./pcb.js");
var globalData = require("./global.js");
var Table_TraceEntry = require("./render/Table_TraceEntry.js").Table_TraceEntry

function populateTraceTable()
{
    /* Populate header and BOM body. Place into DOM */
    populateTraceHeader();
    populateTraceBody();
}


let filterLayer = "";
function getFilterLayer()
{
    return filterLayer;
}

function populateTraceHeader()
{
    let layerHead = document.getElementById("tracehead");
    while (layerHead.firstChild)
    {
        layerHead.removeChild(layerHead.firstChild);
    }

    // Header row
    let tr = document.createElement("TR");
    // Defines the
    let th = document.createElement("TH");

    th.classList.add("visiableCol");


    th.innerHTML = "Trace";
    let span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    th = document.createElement("TH");
    th.innerHTML = "Ohms";
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);


    th = document.createElement("TH");
    th.innerHTML = "Inductance";
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    layerHead.appendChild(tr);
}

function populateTraceBody()
{
    let traceBody = document.getElementById("tracebody");
    while (traceBody.firstChild)
    {
        traceBody.removeChild(traceBody.firstChild);
    }

    // remove entries that do not match filter
    for (let trace of globalData.pcb_traces)
    {
        traceBody.appendChild(new Table_TraceEntry(trace));
    }
}

function Filter(s)
{

}

module.exports = {
    populateTraceTable
}

},{"./global.js":28,"./pcb.js":33,"./render/Table_TraceEntry.js":38}],44:[function(require,module,exports){
"use strict";

let versionString_Major = 3;
let versionString_Minor = 'X';
let versionString_Patch = 'X';

let versionString_isAlpha = true;

function GetVersionString()
{

    let result = 'V' + String(versionString_Major) + '.' + String(versionString_Minor) + '.' + String(versionString_Patch)

    if(versionString_isAlpha)
    {
        result = result + "-Alpha"
    }

    return result;

}

module.exports = {
    GetVersionString
};

},{}]},{},[31,34,30,33,26])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvc3BsaXQuanMvc3BsaXQuanMiLCJzcmMvQm91bmRpbmdCb3guanMiLCJzcmMvTWV0YWRhdGEuanMiLCJzcmMvUENCL0hlbHBlci5qcyIsInNyYy9QQ0IvUENCX0xheWVyLmpzIiwic3JjL1BDQi9QQ0JfUGFydC5qcyIsInNyYy9QQ0IvUENCX1Rlc3RQb2ludC5qcyIsInNyYy9QQ0IvUENCX1RyYWNlLmpzIiwic3JjL1BDQi9QYWNrYWdlLmpzIiwic3JjL1BDQi9QYWNrYWdlX1BhZC5qcyIsInNyYy9QQ0IvUGFja2FnZV9QYWRfT2Jsb25nLmpzIiwic3JjL1BDQi9QYWNrYWdlX1BhZF9PY3RhZ29uLmpzIiwic3JjL1BDQi9QYWNrYWdlX1BhZF9SZWN0YW5nbGUuanMiLCJzcmMvUENCL1BhY2thZ2VfUGFkX1JvdW5kLmpzIiwic3JjL1BDQi9QYWNrYWdlX1BhZF9TTUQuanMiLCJzcmMvUENCL1NlZ21lbnQuanMiLCJzcmMvUENCL1NlZ21lbnRfQXJjLmpzIiwic3JjL1BDQi9TZWdtZW50X0xpbmUuanMiLCJzcmMvUENCL1NlZ21lbnRfUG9seWdvbi5qcyIsInNyYy9QQ0IvU2VnbWVudF9WaWFfT2N0YWdvbi5qcyIsInNyYy9QQ0IvU2VnbWVudF9WaWFfUm91bmQuanMiLCJzcmMvUENCL1NlZ21lbnRfVmlhX1NxdWFyZS5qcyIsInNyYy9QYXJ0LmpzIiwic3JjL1JpZ2h0U2lkZVNjcmVlblRhYmxlLmpzIiwic3JjL2JvbV90YWJsZS5qcyIsInNyYy9jb2xvcm1hcC5qcyIsInNyYy9mdWxsc2NyZWVuLmpzIiwic3JjL2dsb2JhbC5qcyIsInNyYy9oYW5kbGVyc19tb3VzZS5qcyIsInNyYy9odG1sRnVuY3Rpb25zLmpzIiwic3JjL2lwY2IuanMiLCJzcmMvbGF5ZXJfdGFibGUuanMiLCJzcmMvcGNiLmpzIiwic3JjL3JlbmRlci5qcyIsInNyYy9yZW5kZXIvUmVuZGVyX0xheWVyLmpzIiwic3JjL3JlbmRlci9UYWJsZV9MYXllckVudHJ5LmpzIiwic3JjL3JlbmRlci9UYWJsZV9UZXN0UG9pbnRFbnRyeS5qcyIsInNyYy9yZW5kZXIvVGFibGVfVHJhY2VFbnRyeS5qcyIsInNyYy9yZW5kZXIvcG9pbnQuanMiLCJzcmMvcmVuZGVyL3JlbmRlcl9DYW52YXMuanMiLCJzcmMvcmVuZGVyL3JlbmRlcl9sb3dsZXZlbC5qcyIsInNyYy90ZXN0cG9pbnRfdGFibGUuanMiLCJzcmMvdHJhY2VfdGFibGUuanMiLCJzcmMvdmVyc2lvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4aEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeGRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOU5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKiEgU3BsaXQuanMgLSB2MS4zLjUgKi9cblxuKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcblx0dHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCkgOlxuXHR0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOlxuXHQoZ2xvYmFsLlNwbGl0ID0gZmFjdG9yeSgpKTtcbn0odGhpcywgKGZ1bmN0aW9uICgpIHsgJ3VzZSBzdHJpY3QnO1xuXG4vLyBUaGUgcHJvZ3JhbW1pbmcgZ29hbHMgb2YgU3BsaXQuanMgYXJlIHRvIGRlbGl2ZXIgcmVhZGFibGUsIHVuZGVyc3RhbmRhYmxlIGFuZFxuLy8gbWFpbnRhaW5hYmxlIGNvZGUsIHdoaWxlIGF0IHRoZSBzYW1lIHRpbWUgbWFudWFsbHkgb3B0aW1pemluZyBmb3IgdGlueSBtaW5pZmllZCBmaWxlIHNpemUsXG4vLyBicm93c2VyIGNvbXBhdGliaWxpdHkgd2l0aG91dCBhZGRpdGlvbmFsIHJlcXVpcmVtZW50cywgZ3JhY2VmdWwgZmFsbGJhY2sgKElFOCBpcyBzdXBwb3J0ZWQpXG4vLyBhbmQgdmVyeSBmZXcgYXNzdW1wdGlvbnMgYWJvdXQgdGhlIHVzZXIncyBwYWdlIGxheW91dC5cbnZhciBnbG9iYWwgPSB3aW5kb3c7XG52YXIgZG9jdW1lbnQgPSBnbG9iYWwuZG9jdW1lbnQ7XG5cbi8vIFNhdmUgYSBjb3VwbGUgbG9uZyBmdW5jdGlvbiBuYW1lcyB0aGF0IGFyZSB1c2VkIGZyZXF1ZW50bHkuXG4vLyBUaGlzIG9wdGltaXphdGlvbiBzYXZlcyBhcm91bmQgNDAwIGJ5dGVzLlxudmFyIGFkZEV2ZW50TGlzdGVuZXIgPSAnYWRkRXZlbnRMaXN0ZW5lcic7XG52YXIgcmVtb3ZlRXZlbnRMaXN0ZW5lciA9ICdyZW1vdmVFdmVudExpc3RlbmVyJztcbnZhciBnZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAnZ2V0Qm91bmRpbmdDbGllbnRSZWN0JztcbnZhciBOT09QID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gZmFsc2U7IH07XG5cbi8vIEZpZ3VyZSBvdXQgaWYgd2UncmUgaW4gSUU4IG9yIG5vdC4gSUU4IHdpbGwgc3RpbGwgcmVuZGVyIGNvcnJlY3RseSxcbi8vIGJ1dCB3aWxsIGJlIHN0YXRpYyBpbnN0ZWFkIG9mIGRyYWdnYWJsZS5cbnZhciBpc0lFOCA9IGdsb2JhbC5hdHRhY2hFdmVudCAmJiAhZ2xvYmFsW2FkZEV2ZW50TGlzdGVuZXJdO1xuXG4vLyBUaGlzIGxpYnJhcnkgb25seSBuZWVkcyB0d28gaGVscGVyIGZ1bmN0aW9uczpcbi8vXG4vLyBUaGUgZmlyc3QgZGV0ZXJtaW5lcyB3aGljaCBwcmVmaXhlcyBvZiBDU1MgY2FsYyB3ZSBuZWVkLlxuLy8gV2Ugb25seSBuZWVkIHRvIGRvIHRoaXMgb25jZSBvbiBzdGFydHVwLCB3aGVuIHRoaXMgYW5vbnltb3VzIGZ1bmN0aW9uIGlzIGNhbGxlZC5cbi8vXG4vLyBUZXN0cyAtd2Via2l0LCAtbW96IGFuZCAtbyBwcmVmaXhlcy4gTW9kaWZpZWQgZnJvbSBTdGFja092ZXJmbG93OlxuLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xNjYyNTE0MC9qcy1mZWF0dXJlLWRldGVjdGlvbi10by1kZXRlY3QtdGhlLXVzYWdlLW9mLXdlYmtpdC1jYWxjLW92ZXItY2FsYy8xNjYyNTE2NyMxNjYyNTE2N1xudmFyIGNhbGMgPSAoWycnLCAnLXdlYmtpdC0nLCAnLW1vei0nLCAnLW8tJ10uZmlsdGVyKGZ1bmN0aW9uIChwcmVmaXgpIHtcbiAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbC5zdHlsZS5jc3NUZXh0ID0gXCJ3aWR0aDpcIiArIHByZWZpeCArIFwiY2FsYyg5cHgpXCI7XG5cbiAgICByZXR1cm4gKCEhZWwuc3R5bGUubGVuZ3RoKVxufSkuc2hpZnQoKSkgKyBcImNhbGNcIjtcblxuLy8gVGhlIHNlY29uZCBoZWxwZXIgZnVuY3Rpb24gYWxsb3dzIGVsZW1lbnRzIGFuZCBzdHJpbmcgc2VsZWN0b3JzIHRvIGJlIHVzZWRcbi8vIGludGVyY2hhbmdlYWJseS4gSW4gZWl0aGVyIGNhc2UgYW4gZWxlbWVudCBpcyByZXR1cm5lZC4gVGhpcyBhbGxvd3MgdXMgdG9cbi8vIGRvIGBTcGxpdChbZWxlbTEsIGVsZW0yXSlgIGFzIHdlbGwgYXMgYFNwbGl0KFsnI2lkMScsICcjaWQyJ10pYC5cbnZhciBlbGVtZW50T3JTZWxlY3RvciA9IGZ1bmN0aW9uIChlbCkge1xuICAgIGlmICh0eXBlb2YgZWwgPT09ICdzdHJpbmcnIHx8IGVsIGluc3RhbmNlb2YgU3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGVsKVxuICAgIH1cblxuICAgIHJldHVybiBlbFxufTtcblxuLy8gVGhlIG1haW4gZnVuY3Rpb24gdG8gaW5pdGlhbGl6ZSBhIHNwbGl0LiBTcGxpdC5qcyB0aGlua3MgYWJvdXQgZWFjaCBwYWlyXG4vLyBvZiBlbGVtZW50cyBhcyBhbiBpbmRlcGVuZGFudCBwYWlyLiBEcmFnZ2luZyB0aGUgZ3V0dGVyIGJldHdlZW4gdHdvIGVsZW1lbnRzXG4vLyBvbmx5IGNoYW5nZXMgdGhlIGRpbWVuc2lvbnMgb2YgZWxlbWVudHMgaW4gdGhhdCBwYWlyLiBUaGlzIGlzIGtleSB0byB1bmRlcnN0YW5kaW5nXG4vLyBob3cgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgb3BlcmF0ZSwgc2luY2UgZWFjaCBmdW5jdGlvbiBpcyBib3VuZCB0byBhIHBhaXIuXG4vL1xuLy8gQSBwYWlyIG9iamVjdCBpcyBzaGFwZWQgbGlrZSB0aGlzOlxuLy9cbi8vIHtcbi8vICAgICBhOiBET00gZWxlbWVudCxcbi8vICAgICBiOiBET00gZWxlbWVudCxcbi8vICAgICBhTWluOiBOdW1iZXIsXG4vLyAgICAgYk1pbjogTnVtYmVyLFxuLy8gICAgIGRyYWdnaW5nOiBCb29sZWFuLFxuLy8gICAgIHBhcmVudDogRE9NIGVsZW1lbnQsXG4vLyAgICAgaXNGaXJzdDogQm9vbGVhbixcbi8vICAgICBpc0xhc3Q6IEJvb2xlYW4sXG4vLyAgICAgZGlyZWN0aW9uOiAnaG9yaXpvbnRhbCcgfCAndmVydGljYWwnXG4vLyB9XG4vL1xuLy8gVGhlIGJhc2ljIHNlcXVlbmNlOlxuLy9cbi8vIDEuIFNldCBkZWZhdWx0cyB0byBzb21ldGhpbmcgc2FuZS4gYG9wdGlvbnNgIGRvZXNuJ3QgaGF2ZSB0byBiZSBwYXNzZWQgYXQgYWxsLlxuLy8gMi4gSW5pdGlhbGl6ZSBhIGJ1bmNoIG9mIHN0cmluZ3MgYmFzZWQgb24gdGhlIGRpcmVjdGlvbiB3ZSdyZSBzcGxpdHRpbmcuXG4vLyAgICBBIGxvdCBvZiB0aGUgYmVoYXZpb3IgaW4gdGhlIHJlc3Qgb2YgdGhlIGxpYnJhcnkgaXMgcGFyYW1hdGl6ZWQgZG93biB0b1xuLy8gICAgcmVseSBvbiBDU1Mgc3RyaW5ncyBhbmQgY2xhc3Nlcy5cbi8vIDMuIERlZmluZSB0aGUgZHJhZ2dpbmcgaGVscGVyIGZ1bmN0aW9ucywgYW5kIGEgZmV3IGhlbHBlcnMgdG8gZ28gd2l0aCB0aGVtLlxuLy8gNC4gTG9vcCB0aHJvdWdoIHRoZSBlbGVtZW50cyB3aGlsZSBwYWlyaW5nIHRoZW0gb2ZmLiBFdmVyeSBwYWlyIGdldHMgYW5cbi8vICAgIGBwYWlyYCBvYmplY3QsIGEgZ3V0dGVyLCBhbmQgc3BlY2lhbCBpc0ZpcnN0L2lzTGFzdCBwcm9wZXJ0aWVzLlxuLy8gNS4gQWN0dWFsbHkgc2l6ZSB0aGUgcGFpciBlbGVtZW50cywgaW5zZXJ0IGd1dHRlcnMgYW5kIGF0dGFjaCBldmVudCBsaXN0ZW5lcnMuXG52YXIgU3BsaXQgPSBmdW5jdGlvbiAoaWRzLCBvcHRpb25zKSB7XG4gICAgaWYgKCBvcHRpb25zID09PSB2b2lkIDAgKSBvcHRpb25zID0ge307XG5cbiAgICB2YXIgZGltZW5zaW9uO1xuICAgIHZhciBjbGllbnREaW1lbnNpb247XG4gICAgdmFyIGNsaWVudEF4aXM7XG4gICAgdmFyIHBvc2l0aW9uO1xuICAgIHZhciBwYWRkaW5nQTtcbiAgICB2YXIgcGFkZGluZ0I7XG4gICAgdmFyIGVsZW1lbnRzO1xuXG4gICAgLy8gQWxsIERPTSBlbGVtZW50cyBpbiB0aGUgc3BsaXQgc2hvdWxkIGhhdmUgYSBjb21tb24gcGFyZW50LiBXZSBjYW4gZ3JhYlxuICAgIC8vIHRoZSBmaXJzdCBlbGVtZW50cyBwYXJlbnQgYW5kIGhvcGUgdXNlcnMgcmVhZCB0aGUgZG9jcyBiZWNhdXNlIHRoZVxuICAgIC8vIGJlaGF2aW9yIHdpbGwgYmUgd2hhY2t5IG90aGVyd2lzZS5cbiAgICB2YXIgcGFyZW50ID0gZWxlbWVudE9yU2VsZWN0b3IoaWRzWzBdKS5wYXJlbnROb2RlO1xuICAgIHZhciBwYXJlbnRGbGV4RGlyZWN0aW9uID0gZ2xvYmFsLmdldENvbXB1dGVkU3R5bGUocGFyZW50KS5mbGV4RGlyZWN0aW9uO1xuXG4gICAgLy8gU2V0IGRlZmF1bHQgb3B0aW9ucy5zaXplcyB0byBlcXVhbCBwZXJjZW50YWdlcyBvZiB0aGUgcGFyZW50IGVsZW1lbnQuXG4gICAgdmFyIHNpemVzID0gb3B0aW9ucy5zaXplcyB8fCBpZHMubWFwKGZ1bmN0aW9uICgpIHsgcmV0dXJuIDEwMCAvIGlkcy5sZW5ndGg7IH0pO1xuXG4gICAgLy8gU3RhbmRhcmRpemUgbWluU2l6ZSB0byBhbiBhcnJheSBpZiBpdCBpc24ndCBhbHJlYWR5LiBUaGlzIGFsbG93cyBtaW5TaXplXG4gICAgLy8gdG8gYmUgcGFzc2VkIGFzIGEgbnVtYmVyLlxuICAgIHZhciBtaW5TaXplID0gb3B0aW9ucy5taW5TaXplICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLm1pblNpemUgOiAxMDA7XG4gICAgdmFyIG1pblNpemVzID0gQXJyYXkuaXNBcnJheShtaW5TaXplKSA/IG1pblNpemUgOiBpZHMubWFwKGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1pblNpemU7IH0pO1xuICAgIHZhciBndXR0ZXJTaXplID0gb3B0aW9ucy5ndXR0ZXJTaXplICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmd1dHRlclNpemUgOiAxMDtcbiAgICB2YXIgc25hcE9mZnNldCA9IG9wdGlvbnMuc25hcE9mZnNldCAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5zbmFwT2Zmc2V0IDogMzA7XG4gICAgdmFyIGRpcmVjdGlvbiA9IG9wdGlvbnMuZGlyZWN0aW9uIHx8ICdob3Jpem9udGFsJztcbiAgICB2YXIgY3Vyc29yID0gb3B0aW9ucy5jdXJzb3IgfHwgKGRpcmVjdGlvbiA9PT0gJ2hvcml6b250YWwnID8gJ2V3LXJlc2l6ZScgOiAnbnMtcmVzaXplJyk7XG4gICAgdmFyIGd1dHRlciA9IG9wdGlvbnMuZ3V0dGVyIHx8IChmdW5jdGlvbiAoaSwgZ3V0dGVyRGlyZWN0aW9uKSB7XG4gICAgICAgIHZhciBndXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZ3V0LmNsYXNzTmFtZSA9IFwiZ3V0dGVyIGd1dHRlci1cIiArIGd1dHRlckRpcmVjdGlvbjtcbiAgICAgICAgcmV0dXJuIGd1dFxuICAgIH0pO1xuICAgIHZhciBlbGVtZW50U3R5bGUgPSBvcHRpb25zLmVsZW1lbnRTdHlsZSB8fCAoZnVuY3Rpb24gKGRpbSwgc2l6ZSwgZ3V0U2l6ZSkge1xuICAgICAgICB2YXIgc3R5bGUgPSB7fTtcblxuICAgICAgICBpZiAodHlwZW9mIHNpemUgIT09ICdzdHJpbmcnICYmICEoc2l6ZSBpbnN0YW5jZW9mIFN0cmluZykpIHtcbiAgICAgICAgICAgIGlmICghaXNJRTgpIHtcbiAgICAgICAgICAgICAgICBzdHlsZVtkaW1dID0gY2FsYyArIFwiKFwiICsgc2l6ZSArIFwiJSAtIFwiICsgZ3V0U2l6ZSArIFwicHgpXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0eWxlW2RpbV0gPSBzaXplICsgXCIlXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdHlsZVtkaW1dID0gc2l6ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdHlsZVxuICAgIH0pO1xuICAgIHZhciBndXR0ZXJTdHlsZSA9IG9wdGlvbnMuZ3V0dGVyU3R5bGUgfHwgKGZ1bmN0aW9uIChkaW0sIGd1dFNpemUpIHsgcmV0dXJuICgoIG9iaiA9IHt9LCBvYmpbZGltXSA9IChndXRTaXplICsgXCJweFwiKSwgb2JqICkpXG4gICAgICAgIHZhciBvYmo7IH0pO1xuXG4gICAgLy8gMi4gSW5pdGlhbGl6ZSBhIGJ1bmNoIG9mIHN0cmluZ3MgYmFzZWQgb24gdGhlIGRpcmVjdGlvbiB3ZSdyZSBzcGxpdHRpbmcuXG4gICAgLy8gQSBsb3Qgb2YgdGhlIGJlaGF2aW9yIGluIHRoZSByZXN0IG9mIHRoZSBsaWJyYXJ5IGlzIHBhcmFtYXRpemVkIGRvd24gdG9cbiAgICAvLyByZWx5IG9uIENTUyBzdHJpbmdzIGFuZCBjbGFzc2VzLlxuICAgIGlmIChkaXJlY3Rpb24gPT09ICdob3Jpem9udGFsJykge1xuICAgICAgICBkaW1lbnNpb24gPSAnd2lkdGgnO1xuICAgICAgICBjbGllbnREaW1lbnNpb24gPSAnY2xpZW50V2lkdGgnO1xuICAgICAgICBjbGllbnRBeGlzID0gJ2NsaWVudFgnO1xuICAgICAgICBwb3NpdGlvbiA9ICdsZWZ0JztcbiAgICAgICAgcGFkZGluZ0EgPSAncGFkZGluZ0xlZnQnO1xuICAgICAgICBwYWRkaW5nQiA9ICdwYWRkaW5nUmlnaHQnO1xuICAgIH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSAndmVydGljYWwnKSB7XG4gICAgICAgIGRpbWVuc2lvbiA9ICdoZWlnaHQnO1xuICAgICAgICBjbGllbnREaW1lbnNpb24gPSAnY2xpZW50SGVpZ2h0JztcbiAgICAgICAgY2xpZW50QXhpcyA9ICdjbGllbnRZJztcbiAgICAgICAgcG9zaXRpb24gPSAndG9wJztcbiAgICAgICAgcGFkZGluZ0EgPSAncGFkZGluZ1RvcCc7XG4gICAgICAgIHBhZGRpbmdCID0gJ3BhZGRpbmdCb3R0b20nO1xuICAgIH1cblxuICAgIC8vIDMuIERlZmluZSB0aGUgZHJhZ2dpbmcgaGVscGVyIGZ1bmN0aW9ucywgYW5kIGEgZmV3IGhlbHBlcnMgdG8gZ28gd2l0aCB0aGVtLlxuICAgIC8vIEVhY2ggaGVscGVyIGlzIGJvdW5kIHRvIGEgcGFpciBvYmplY3QgdGhhdCBjb250YWlucyBpdCdzIG1ldGFkYXRhLiBUaGlzXG4gICAgLy8gYWxzbyBtYWtlcyBpdCBlYXN5IHRvIHN0b3JlIHJlZmVyZW5jZXMgdG8gbGlzdGVuZXJzIHRoYXQgdGhhdCB3aWxsIGJlXG4gICAgLy8gYWRkZWQgYW5kIHJlbW92ZWQuXG4gICAgLy9cbiAgICAvLyBFdmVuIHRob3VnaCB0aGVyZSBhcmUgbm8gb3RoZXIgZnVuY3Rpb25zIGNvbnRhaW5lZCBpbiB0aGVtLCBhbGlhc2luZ1xuICAgIC8vIHRoaXMgdG8gc2VsZiBzYXZlcyA1MCBieXRlcyBvciBzbyBzaW5jZSBpdCdzIHVzZWQgc28gZnJlcXVlbnRseS5cbiAgICAvL1xuICAgIC8vIFRoZSBwYWlyIG9iamVjdCBzYXZlcyBtZXRhZGF0YSBsaWtlIGRyYWdnaW5nIHN0YXRlLCBwb3NpdGlvbiBhbmRcbiAgICAvLyBldmVudCBsaXN0ZW5lciByZWZlcmVuY2VzLlxuXG4gICAgZnVuY3Rpb24gc2V0RWxlbWVudFNpemUgKGVsLCBzaXplLCBndXRTaXplKSB7XG4gICAgICAgIC8vIFNwbGl0LmpzIGFsbG93cyBzZXR0aW5nIHNpemVzIHZpYSBudW1iZXJzIChpZGVhbGx5KSwgb3IgaWYgeW91IG11c3QsXG4gICAgICAgIC8vIGJ5IHN0cmluZywgbGlrZSAnMzAwcHgnLiBUaGlzIGlzIGxlc3MgdGhhbiBpZGVhbCwgYmVjYXVzZSBpdCBicmVha3NcbiAgICAgICAgLy8gdGhlIGZsdWlkIGxheW91dCB0aGF0IGBjYWxjKCUgLSBweClgIHByb3ZpZGVzLiBZb3UncmUgb24geW91ciBvd24gaWYgeW91IGRvIHRoYXQsXG4gICAgICAgIC8vIG1ha2Ugc3VyZSB5b3UgY2FsY3VsYXRlIHRoZSBndXR0ZXIgc2l6ZSBieSBoYW5kLlxuICAgICAgICB2YXIgc3R5bGUgPSBlbGVtZW50U3R5bGUoZGltZW5zaW9uLCBzaXplLCBndXRTaXplKTtcblxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcGFyYW0tcmVhc3NpZ25cbiAgICAgICAgT2JqZWN0LmtleXMoc3R5bGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHsgcmV0dXJuIChlbC5zdHlsZVtwcm9wXSA9IHN0eWxlW3Byb3BdKTsgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0R3V0dGVyU2l6ZSAoZ3V0dGVyRWxlbWVudCwgZ3V0U2l6ZSkge1xuICAgICAgICB2YXIgc3R5bGUgPSBndXR0ZXJTdHlsZShkaW1lbnNpb24sIGd1dFNpemUpO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1wYXJhbS1yZWFzc2lnblxuICAgICAgICBPYmplY3Qua2V5cyhzdHlsZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkgeyByZXR1cm4gKGd1dHRlckVsZW1lbnQuc3R5bGVbcHJvcF0gPSBzdHlsZVtwcm9wXSk7IH0pO1xuICAgIH1cblxuICAgIC8vIEFjdHVhbGx5IGFkanVzdCB0aGUgc2l6ZSBvZiBlbGVtZW50cyBgYWAgYW5kIGBiYCB0byBgb2Zmc2V0YCB3aGlsZSBkcmFnZ2luZy5cbiAgICAvLyBjYWxjIGlzIHVzZWQgdG8gYWxsb3cgY2FsYyhwZXJjZW50YWdlICsgZ3V0dGVycHgpIG9uIHRoZSB3aG9sZSBzcGxpdCBpbnN0YW5jZSxcbiAgICAvLyB3aGljaCBhbGxvd3MgdGhlIHZpZXdwb3J0IHRvIGJlIHJlc2l6ZWQgd2l0aG91dCBhZGRpdGlvbmFsIGxvZ2ljLlxuICAgIC8vIEVsZW1lbnQgYSdzIHNpemUgaXMgdGhlIHNhbWUgYXMgb2Zmc2V0LiBiJ3Mgc2l6ZSBpcyB0b3RhbCBzaXplIC0gYSBzaXplLlxuICAgIC8vIEJvdGggc2l6ZXMgYXJlIGNhbGN1bGF0ZWQgZnJvbSB0aGUgaW5pdGlhbCBwYXJlbnQgcGVyY2VudGFnZSxcbiAgICAvLyB0aGVuIHRoZSBndXR0ZXIgc2l6ZSBpcyBzdWJ0cmFjdGVkLlxuICAgIGZ1bmN0aW9uIGFkanVzdCAob2Zmc2V0KSB7XG4gICAgICAgIHZhciBhID0gZWxlbWVudHNbdGhpcy5hXTtcbiAgICAgICAgdmFyIGIgPSBlbGVtZW50c1t0aGlzLmJdO1xuICAgICAgICB2YXIgcGVyY2VudGFnZSA9IGEuc2l6ZSArIGIuc2l6ZTtcblxuICAgICAgICBhLnNpemUgPSAob2Zmc2V0IC8gdGhpcy5zaXplKSAqIHBlcmNlbnRhZ2U7XG4gICAgICAgIGIuc2l6ZSA9IChwZXJjZW50YWdlIC0gKChvZmZzZXQgLyB0aGlzLnNpemUpICogcGVyY2VudGFnZSkpO1xuXG4gICAgICAgIHNldEVsZW1lbnRTaXplKGEuZWxlbWVudCwgYS5zaXplLCB0aGlzLmFHdXR0ZXJTaXplKTtcbiAgICAgICAgc2V0RWxlbWVudFNpemUoYi5lbGVtZW50LCBiLnNpemUsIHRoaXMuYkd1dHRlclNpemUpO1xuICAgIH1cblxuICAgIC8vIGRyYWcsIHdoZXJlIGFsbCB0aGUgbWFnaWMgaGFwcGVucy4gVGhlIGxvZ2ljIGlzIHJlYWxseSBxdWl0ZSBzaW1wbGU6XG4gICAgLy9cbiAgICAvLyAxLiBJZ25vcmUgaWYgdGhlIHBhaXIgaXMgbm90IGRyYWdnaW5nLlxuICAgIC8vIDIuIEdldCB0aGUgb2Zmc2V0IG9mIHRoZSBldmVudC5cbiAgICAvLyAzLiBTbmFwIG9mZnNldCB0byBtaW4gaWYgd2l0aGluIHNuYXBwYWJsZSByYW5nZSAod2l0aGluIG1pbiArIHNuYXBPZmZzZXQpLlxuICAgIC8vIDQuIEFjdHVhbGx5IGFkanVzdCBlYWNoIGVsZW1lbnQgaW4gdGhlIHBhaXIgdG8gb2Zmc2V0LlxuICAgIC8vXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gfCAgICB8IDwtIGEubWluU2l6ZSAgICAgICAgICAgICAgIHx8ICAgICAgICAgICAgICBiLm1pblNpemUgLT4gfCAgICB8XG4gICAgLy8gfCAgICB8ICB8IDwtIHRoaXMuc25hcE9mZnNldCAgICAgIHx8ICAgICB0aGlzLnNuYXBPZmZzZXQgLT4gfCAgfCAgICB8XG4gICAgLy8gfCAgICB8ICB8ICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgfCAgICB8XG4gICAgLy8gfCAgICB8ICB8ICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgfCAgICB8XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gfCA8LSB0aGlzLnN0YXJ0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2l6ZSAtPiB8XG4gICAgZnVuY3Rpb24gZHJhZyAoZSkge1xuICAgICAgICB2YXIgb2Zmc2V0O1xuXG4gICAgICAgIGlmICghdGhpcy5kcmFnZ2luZykgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIEdldCB0aGUgb2Zmc2V0IG9mIHRoZSBldmVudCBmcm9tIHRoZSBmaXJzdCBzaWRlIG9mIHRoZVxuICAgICAgICAvLyBwYWlyIGB0aGlzLnN0YXJ0YC4gU3VwcG9ydHMgdG91Y2ggZXZlbnRzLCBidXQgbm90IG11bHRpdG91Y2gsIHNvIG9ubHkgdGhlIGZpcnN0XG4gICAgICAgIC8vIGZpbmdlciBgdG91Y2hlc1swXWAgaXMgY291bnRlZC5cbiAgICAgICAgaWYgKCd0b3VjaGVzJyBpbiBlKSB7XG4gICAgICAgICAgICBvZmZzZXQgPSBlLnRvdWNoZXNbMF1bY2xpZW50QXhpc10gLSB0aGlzLnN0YXJ0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb2Zmc2V0ID0gZVtjbGllbnRBeGlzXSAtIHRoaXMuc3RhcnQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3aXRoaW4gc25hcE9mZnNldCBvZiBtaW4gb3IgbWF4LCBzZXQgb2Zmc2V0IHRvIG1pbiBvciBtYXguXG4gICAgICAgIC8vIHNuYXBPZmZzZXQgYnVmZmVycyBhLm1pblNpemUgYW5kIGIubWluU2l6ZSwgc28gbG9naWMgaXMgb3Bwb3NpdGUgZm9yIGJvdGguXG4gICAgICAgIC8vIEluY2x1ZGUgdGhlIGFwcHJvcHJpYXRlIGd1dHRlciBzaXplcyB0byBwcmV2ZW50IG92ZXJmbG93cy5cbiAgICAgICAgaWYgKG9mZnNldCA8PSBlbGVtZW50c1t0aGlzLmFdLm1pblNpemUgKyBzbmFwT2Zmc2V0ICsgdGhpcy5hR3V0dGVyU2l6ZSkge1xuICAgICAgICAgICAgb2Zmc2V0ID0gZWxlbWVudHNbdGhpcy5hXS5taW5TaXplICsgdGhpcy5hR3V0dGVyU2l6ZTtcbiAgICAgICAgfSBlbHNlIGlmIChvZmZzZXQgPj0gdGhpcy5zaXplIC0gKGVsZW1lbnRzW3RoaXMuYl0ubWluU2l6ZSArIHNuYXBPZmZzZXQgKyB0aGlzLmJHdXR0ZXJTaXplKSkge1xuICAgICAgICAgICAgb2Zmc2V0ID0gdGhpcy5zaXplIC0gKGVsZW1lbnRzW3RoaXMuYl0ubWluU2l6ZSArIHRoaXMuYkd1dHRlclNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWN0dWFsbHkgYWRqdXN0IHRoZSBzaXplLlxuICAgICAgICBhZGp1c3QuY2FsbCh0aGlzLCBvZmZzZXQpO1xuXG4gICAgICAgIC8vIENhbGwgdGhlIGRyYWcgY2FsbGJhY2sgY29udGlub3VzbHkuIERvbid0IGRvIGFueXRoaW5nIHRvbyBpbnRlbnNpdmVcbiAgICAgICAgLy8gaW4gdGhpcyBjYWxsYmFjay5cbiAgICAgICAgaWYgKG9wdGlvbnMub25EcmFnKSB7XG4gICAgICAgICAgICBvcHRpb25zLm9uRHJhZygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2FjaGUgc29tZSBpbXBvcnRhbnQgc2l6ZXMgd2hlbiBkcmFnIHN0YXJ0cywgc28gd2UgZG9uJ3QgaGF2ZSB0byBkbyB0aGF0XG4gICAgLy8gY29udGlub3VzbHk6XG4gICAgLy9cbiAgICAvLyBgc2l6ZWA6IFRoZSB0b3RhbCBzaXplIG9mIHRoZSBwYWlyLiBGaXJzdCArIHNlY29uZCArIGZpcnN0IGd1dHRlciArIHNlY29uZCBndXR0ZXIuXG4gICAgLy8gYHN0YXJ0YDogVGhlIGxlYWRpbmcgc2lkZSBvZiB0aGUgZmlyc3QgZWxlbWVudC5cbiAgICAvL1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHwgICAgICBhR3V0dGVyU2l6ZSAtPiB8fHwgICAgICAgICAgICAgICAgICAgICAgfFxuICAgIC8vIHwgICAgICAgICAgICAgICAgICAgICB8fHwgICAgICAgICAgICAgICAgICAgICAgfFxuICAgIC8vIHwgICAgICAgICAgICAgICAgICAgICB8fHwgICAgICAgICAgICAgICAgICAgICAgfFxuICAgIC8vIHwgICAgICAgICAgICAgICAgICAgICB8fHwgPC0gYkd1dHRlclNpemUgICAgICAgfFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHwgPC0gc3RhcnQgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpemUgLT4gfFxuICAgIGZ1bmN0aW9uIGNhbGN1bGF0ZVNpemVzICgpIHtcbiAgICAgICAgLy8gRmlndXJlIG91dCB0aGUgcGFyZW50IHNpemUgbWludXMgcGFkZGluZy5cbiAgICAgICAgdmFyIGEgPSBlbGVtZW50c1t0aGlzLmFdLmVsZW1lbnQ7XG4gICAgICAgIHZhciBiID0gZWxlbWVudHNbdGhpcy5iXS5lbGVtZW50O1xuXG4gICAgICAgIHRoaXMuc2l6ZSA9IGFbZ2V0Qm91bmRpbmdDbGllbnRSZWN0XSgpW2RpbWVuc2lvbl0gKyBiW2dldEJvdW5kaW5nQ2xpZW50UmVjdF0oKVtkaW1lbnNpb25dICsgdGhpcy5hR3V0dGVyU2l6ZSArIHRoaXMuYkd1dHRlclNpemU7XG4gICAgICAgIHRoaXMuc3RhcnQgPSBhW2dldEJvdW5kaW5nQ2xpZW50UmVjdF0oKVtwb3NpdGlvbl07XG4gICAgfVxuXG4gICAgLy8gc3RvcERyYWdnaW5nIGlzIHZlcnkgc2ltaWxhciB0byBzdGFydERyYWdnaW5nIGluIHJldmVyc2UuXG4gICAgZnVuY3Rpb24gc3RvcERyYWdnaW5nICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgYSA9IGVsZW1lbnRzW3NlbGYuYV0uZWxlbWVudDtcbiAgICAgICAgdmFyIGIgPSBlbGVtZW50c1tzZWxmLmJdLmVsZW1lbnQ7XG5cbiAgICAgICAgaWYgKHNlbGYuZHJhZ2dpbmcgJiYgb3B0aW9ucy5vbkRyYWdFbmQpIHtcbiAgICAgICAgICAgIG9wdGlvbnMub25EcmFnRW5kKCk7XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLmRyYWdnaW5nID0gZmFsc2U7XG5cbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBzdG9yZWQgZXZlbnQgbGlzdGVuZXJzLiBUaGlzIGlzIHdoeSB3ZSBzdG9yZSB0aGVtLlxuICAgICAgICBnbG9iYWxbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ21vdXNldXAnLCBzZWxmLnN0b3ApO1xuICAgICAgICBnbG9iYWxbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ3RvdWNoZW5kJywgc2VsZi5zdG9wKTtcbiAgICAgICAgZ2xvYmFsW3JlbW92ZUV2ZW50TGlzdGVuZXJdKCd0b3VjaGNhbmNlbCcsIHNlbGYuc3RvcCk7XG5cbiAgICAgICAgc2VsZi5wYXJlbnRbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ21vdXNlbW92ZScsIHNlbGYubW92ZSk7XG4gICAgICAgIHNlbGYucGFyZW50W3JlbW92ZUV2ZW50TGlzdGVuZXJdKCd0b3VjaG1vdmUnLCBzZWxmLm1vdmUpO1xuXG4gICAgICAgIC8vIERlbGV0ZSB0aGVtIG9uY2UgdGhleSBhcmUgcmVtb3ZlZC4gSSB0aGluayB0aGlzIG1ha2VzIGEgZGlmZmVyZW5jZVxuICAgICAgICAvLyBpbiBtZW1vcnkgdXNhZ2Ugd2l0aCBhIGxvdCBvZiBzcGxpdHMgb24gb25lIHBhZ2UuIEJ1dCBJIGRvbid0IGtub3cgZm9yIHN1cmUuXG4gICAgICAgIGRlbGV0ZSBzZWxmLnN0b3A7XG4gICAgICAgIGRlbGV0ZSBzZWxmLm1vdmU7XG5cbiAgICAgICAgYVtyZW1vdmVFdmVudExpc3RlbmVyXSgnc2VsZWN0c3RhcnQnLCBOT09QKTtcbiAgICAgICAgYVtyZW1vdmVFdmVudExpc3RlbmVyXSgnZHJhZ3N0YXJ0JywgTk9PUCk7XG4gICAgICAgIGJbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ3NlbGVjdHN0YXJ0JywgTk9PUCk7XG4gICAgICAgIGJbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ2RyYWdzdGFydCcsIE5PT1ApO1xuXG4gICAgICAgIGEuc3R5bGUudXNlclNlbGVjdCA9ICcnO1xuICAgICAgICBhLnN0eWxlLndlYmtpdFVzZXJTZWxlY3QgPSAnJztcbiAgICAgICAgYS5zdHlsZS5Nb3pVc2VyU2VsZWN0ID0gJyc7XG4gICAgICAgIGEuc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuXG4gICAgICAgIGIuc3R5bGUudXNlclNlbGVjdCA9ICcnO1xuICAgICAgICBiLnN0eWxlLndlYmtpdFVzZXJTZWxlY3QgPSAnJztcbiAgICAgICAgYi5zdHlsZS5Nb3pVc2VyU2VsZWN0ID0gJyc7XG4gICAgICAgIGIuc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuXG4gICAgICAgIHNlbGYuZ3V0dGVyLnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICBzZWxmLnBhcmVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICB9XG5cbiAgICAvLyBzdGFydERyYWdnaW5nIGNhbGxzIGBjYWxjdWxhdGVTaXplc2AgdG8gc3RvcmUgdGhlIGluaXRhbCBzaXplIGluIHRoZSBwYWlyIG9iamVjdC5cbiAgICAvLyBJdCBhbHNvIGFkZHMgZXZlbnQgbGlzdGVuZXJzIGZvciBtb3VzZS90b3VjaCBldmVudHMsXG4gICAgLy8gYW5kIHByZXZlbnRzIHNlbGVjdGlvbiB3aGlsZSBkcmFnZ2luZyBzbyBhdm9pZCB0aGUgc2VsZWN0aW5nIHRleHQuXG4gICAgZnVuY3Rpb24gc3RhcnREcmFnZ2luZyAoZSkge1xuICAgICAgICAvLyBBbGlhcyBmcmVxdWVudGx5IHVzZWQgdmFyaWFibGVzIHRvIHNhdmUgc3BhY2UuIDIwMCBieXRlcy5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgYSA9IGVsZW1lbnRzW3NlbGYuYV0uZWxlbWVudDtcbiAgICAgICAgdmFyIGIgPSBlbGVtZW50c1tzZWxmLmJdLmVsZW1lbnQ7XG5cbiAgICAgICAgLy8gQ2FsbCB0aGUgb25EcmFnU3RhcnQgY2FsbGJhY2suXG4gICAgICAgIGlmICghc2VsZi5kcmFnZ2luZyAmJiBvcHRpb25zLm9uRHJhZ1N0YXJ0KSB7XG4gICAgICAgICAgICBvcHRpb25zLm9uRHJhZ1N0YXJ0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEb24ndCBhY3R1YWxseSBkcmFnIHRoZSBlbGVtZW50LiBXZSBlbXVsYXRlIHRoYXQgaW4gdGhlIGRyYWcgZnVuY3Rpb24uXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICAvLyBTZXQgdGhlIGRyYWdnaW5nIHByb3BlcnR5IG9mIHRoZSBwYWlyIG9iamVjdC5cbiAgICAgICAgc2VsZi5kcmFnZ2luZyA9IHRydWU7XG5cbiAgICAgICAgLy8gQ3JlYXRlIHR3byBldmVudCBsaXN0ZW5lcnMgYm91bmQgdG8gdGhlIHNhbWUgcGFpciBvYmplY3QgYW5kIHN0b3JlXG4gICAgICAgIC8vIHRoZW0gaW4gdGhlIHBhaXIgb2JqZWN0LlxuICAgICAgICBzZWxmLm1vdmUgPSBkcmFnLmJpbmQoc2VsZik7XG4gICAgICAgIHNlbGYuc3RvcCA9IHN0b3BEcmFnZ2luZy5iaW5kKHNlbGYpO1xuXG4gICAgICAgIC8vIEFsbCB0aGUgYmluZGluZy4gYHdpbmRvd2AgZ2V0cyB0aGUgc3RvcCBldmVudHMgaW4gY2FzZSB3ZSBkcmFnIG91dCBvZiB0aGUgZWxlbWVudHMuXG4gICAgICAgIGdsb2JhbFthZGRFdmVudExpc3RlbmVyXSgnbW91c2V1cCcsIHNlbGYuc3RvcCk7XG4gICAgICAgIGdsb2JhbFthZGRFdmVudExpc3RlbmVyXSgndG91Y2hlbmQnLCBzZWxmLnN0b3ApO1xuICAgICAgICBnbG9iYWxbYWRkRXZlbnRMaXN0ZW5lcl0oJ3RvdWNoY2FuY2VsJywgc2VsZi5zdG9wKTtcblxuICAgICAgICBzZWxmLnBhcmVudFthZGRFdmVudExpc3RlbmVyXSgnbW91c2Vtb3ZlJywgc2VsZi5tb3ZlKTtcbiAgICAgICAgc2VsZi5wYXJlbnRbYWRkRXZlbnRMaXN0ZW5lcl0oJ3RvdWNobW92ZScsIHNlbGYubW92ZSk7XG5cbiAgICAgICAgLy8gRGlzYWJsZSBzZWxlY3Rpb24uIERpc2FibGUhXG4gICAgICAgIGFbYWRkRXZlbnRMaXN0ZW5lcl0oJ3NlbGVjdHN0YXJ0JywgTk9PUCk7XG4gICAgICAgIGFbYWRkRXZlbnRMaXN0ZW5lcl0oJ2RyYWdzdGFydCcsIE5PT1ApO1xuICAgICAgICBiW2FkZEV2ZW50TGlzdGVuZXJdKCdzZWxlY3RzdGFydCcsIE5PT1ApO1xuICAgICAgICBiW2FkZEV2ZW50TGlzdGVuZXJdKCdkcmFnc3RhcnQnLCBOT09QKTtcblxuICAgICAgICBhLnN0eWxlLnVzZXJTZWxlY3QgPSAnbm9uZSc7XG4gICAgICAgIGEuc3R5bGUud2Via2l0VXNlclNlbGVjdCA9ICdub25lJztcbiAgICAgICAgYS5zdHlsZS5Nb3pVc2VyU2VsZWN0ID0gJ25vbmUnO1xuICAgICAgICBhLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG5cbiAgICAgICAgYi5zdHlsZS51c2VyU2VsZWN0ID0gJ25vbmUnO1xuICAgICAgICBiLnN0eWxlLndlYmtpdFVzZXJTZWxlY3QgPSAnbm9uZSc7XG4gICAgICAgIGIuc3R5bGUuTW96VXNlclNlbGVjdCA9ICdub25lJztcbiAgICAgICAgYi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXG4gICAgICAgIC8vIFNldCB0aGUgY3Vyc29yLCBib3RoIG9uIHRoZSBndXR0ZXIgYW5kIHRoZSBwYXJlbnQgZWxlbWVudC5cbiAgICAgICAgLy8gRG9pbmcgb25seSBhLCBiIGFuZCBndXR0ZXIgY2F1c2VzIGZsaWNrZXJpbmcuXG4gICAgICAgIHNlbGYuZ3V0dGVyLnN0eWxlLmN1cnNvciA9IGN1cnNvcjtcbiAgICAgICAgc2VsZi5wYXJlbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yO1xuXG4gICAgICAgIC8vIENhY2hlIHRoZSBpbml0aWFsIHNpemVzIG9mIHRoZSBwYWlyLlxuICAgICAgICBjYWxjdWxhdGVTaXplcy5jYWxsKHNlbGYpO1xuICAgIH1cblxuICAgIC8vIDUuIENyZWF0ZSBwYWlyIGFuZCBlbGVtZW50IG9iamVjdHMuIEVhY2ggcGFpciBoYXMgYW4gaW5kZXggcmVmZXJlbmNlIHRvXG4gICAgLy8gZWxlbWVudHMgYGFgIGFuZCBgYmAgb2YgdGhlIHBhaXIgKGZpcnN0IGFuZCBzZWNvbmQgZWxlbWVudHMpLlxuICAgIC8vIExvb3AgdGhyb3VnaCB0aGUgZWxlbWVudHMgd2hpbGUgcGFpcmluZyB0aGVtIG9mZi4gRXZlcnkgcGFpciBnZXRzIGFcbiAgICAvLyBgcGFpcmAgb2JqZWN0LCBhIGd1dHRlciwgYW5kIGlzRmlyc3QvaXNMYXN0IHByb3BlcnRpZXMuXG4gICAgLy9cbiAgICAvLyBCYXNpYyBsb2dpYzpcbiAgICAvL1xuICAgIC8vIC0gU3RhcnRpbmcgd2l0aCB0aGUgc2Vjb25kIGVsZW1lbnQgYGkgPiAwYCwgY3JlYXRlIGBwYWlyYCBvYmplY3RzIHdpdGhcbiAgICAvLyAgIGBhID0gaSAtIDFgIGFuZCBgYiA9IGlgXG4gICAgLy8gLSBTZXQgZ3V0dGVyIHNpemVzIGJhc2VkIG9uIHRoZSBfcGFpcl8gYmVpbmcgZmlyc3QvbGFzdC4gVGhlIGZpcnN0IGFuZCBsYXN0XG4gICAgLy8gICBwYWlyIGhhdmUgZ3V0dGVyU2l6ZSAvIDIsIHNpbmNlIHRoZXkgb25seSBoYXZlIG9uZSBoYWxmIGd1dHRlciwgYW5kIG5vdCB0d28uXG4gICAgLy8gLSBDcmVhdGUgZ3V0dGVyIGVsZW1lbnRzIGFuZCBhZGQgZXZlbnQgbGlzdGVuZXJzLlxuICAgIC8vIC0gU2V0IHRoZSBzaXplIG9mIHRoZSBlbGVtZW50cywgbWludXMgdGhlIGd1dHRlciBzaXplcy5cbiAgICAvL1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gfCAgICAgaT0wICAgICB8ICAgICAgICAgaT0xICAgICAgICAgfCAgICAgICAgaT0yICAgICAgIHwgICAgICBpPTMgICAgIHxcbiAgICAvLyB8ICAgICAgICAgICAgIHwgICAgICAgaXNGaXJzdCAgICAgICB8ICAgICAgICAgICAgICAgICAgfCAgICAgaXNMYXN0ICAgfFxuICAgIC8vIHwgICAgICAgICAgIHBhaXIgMCAgICAgICAgICAgICAgICBwYWlyIDEgICAgICAgICAgICAgcGFpciAyICAgICAgICAgICB8XG4gICAgLy8gfCAgICAgICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgfCAgICAgICAgICAgICAgICAgIHwgICAgICAgICAgICAgIHxcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBwYWlycyA9IFtdO1xuICAgIGVsZW1lbnRzID0gaWRzLm1hcChmdW5jdGlvbiAoaWQsIGkpIHtcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSBlbGVtZW50IG9iamVjdC5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSB7XG4gICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50T3JTZWxlY3RvcihpZCksXG4gICAgICAgICAgICBzaXplOiBzaXplc1tpXSxcbiAgICAgICAgICAgIG1pblNpemU6IG1pblNpemVzW2ldLFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBwYWlyO1xuXG4gICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSBwYWlyIG9iamVjdCB3aXRoIGl0J3MgbWV0YWRhdGEuXG4gICAgICAgICAgICBwYWlyID0ge1xuICAgICAgICAgICAgICAgIGE6IGkgLSAxLFxuICAgICAgICAgICAgICAgIGI6IGksXG4gICAgICAgICAgICAgICAgZHJhZ2dpbmc6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGlzRmlyc3Q6IChpID09PSAxKSxcbiAgICAgICAgICAgICAgICBpc0xhc3Q6IChpID09PSBpZHMubGVuZ3RoIC0gMSksXG4gICAgICAgICAgICAgICAgZGlyZWN0aW9uOiBkaXJlY3Rpb24sXG4gICAgICAgICAgICAgICAgcGFyZW50OiBwYXJlbnQsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBGb3IgZmlyc3QgYW5kIGxhc3QgcGFpcnMsIGZpcnN0IGFuZCBsYXN0IGd1dHRlciB3aWR0aCBpcyBoYWxmLlxuICAgICAgICAgICAgcGFpci5hR3V0dGVyU2l6ZSA9IGd1dHRlclNpemU7XG4gICAgICAgICAgICBwYWlyLmJHdXR0ZXJTaXplID0gZ3V0dGVyU2l6ZTtcblxuICAgICAgICAgICAgaWYgKHBhaXIuaXNGaXJzdCkge1xuICAgICAgICAgICAgICAgIHBhaXIuYUd1dHRlclNpemUgPSBndXR0ZXJTaXplIC8gMjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHBhaXIuaXNMYXN0KSB7XG4gICAgICAgICAgICAgICAgcGFpci5iR3V0dGVyU2l6ZSA9IGd1dHRlclNpemUgLyAyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgcGFyZW50IGhhcyBhIHJldmVyc2UgZmxleC1kaXJlY3Rpb24sIHN3aXRjaCB0aGUgcGFpciBlbGVtZW50cy5cbiAgICAgICAgICAgIGlmIChwYXJlbnRGbGV4RGlyZWN0aW9uID09PSAncm93LXJldmVyc2UnIHx8IHBhcmVudEZsZXhEaXJlY3Rpb24gPT09ICdjb2x1bW4tcmV2ZXJzZScpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGVtcCA9IHBhaXIuYTtcbiAgICAgICAgICAgICAgICBwYWlyLmEgPSBwYWlyLmI7XG4gICAgICAgICAgICAgICAgcGFpci5iID0gdGVtcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSB0aGUgc2l6ZSBvZiB0aGUgY3VycmVudCBlbGVtZW50LiBJRTggaXMgc3VwcG9ydGVkIGJ5XG4gICAgICAgIC8vIHN0YXRpY2x5IGFzc2lnbmluZyBzaXplcyB3aXRob3V0IGRyYWdnYWJsZSBndXR0ZXJzLiBBc3NpZ25zIGEgc3RyaW5nXG4gICAgICAgIC8vIHRvIGBzaXplYC5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gSUU5IGFuZCBhYm92ZVxuICAgICAgICBpZiAoIWlzSUU4KSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgZ3V0dGVyIGVsZW1lbnRzIGZvciBlYWNoIHBhaXIuXG4gICAgICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgZ3V0dGVyRWxlbWVudCA9IGd1dHRlcihpLCBkaXJlY3Rpb24pO1xuICAgICAgICAgICAgICAgIHNldEd1dHRlclNpemUoZ3V0dGVyRWxlbWVudCwgZ3V0dGVyU2l6ZSk7XG5cbiAgICAgICAgICAgICAgICBndXR0ZXJFbGVtZW50W2FkZEV2ZW50TGlzdGVuZXJdKCdtb3VzZWRvd24nLCBzdGFydERyYWdnaW5nLmJpbmQocGFpcikpO1xuICAgICAgICAgICAgICAgIGd1dHRlckVsZW1lbnRbYWRkRXZlbnRMaXN0ZW5lcl0oJ3RvdWNoc3RhcnQnLCBzdGFydERyYWdnaW5nLmJpbmQocGFpcikpO1xuXG4gICAgICAgICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShndXR0ZXJFbGVtZW50LCBlbGVtZW50LmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgcGFpci5ndXR0ZXIgPSBndXR0ZXJFbGVtZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0IHRoZSBlbGVtZW50IHNpemUgdG8gb3VyIGRldGVybWluZWQgc2l6ZS5cbiAgICAgICAgLy8gSGFsZi1zaXplIGd1dHRlcnMgZm9yIGZpcnN0IGFuZCBsYXN0IGVsZW1lbnRzLlxuICAgICAgICBpZiAoaSA9PT0gMCB8fCBpID09PSBpZHMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgc2V0RWxlbWVudFNpemUoZWxlbWVudC5lbGVtZW50LCBlbGVtZW50LnNpemUsIGd1dHRlclNpemUgLyAyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNldEVsZW1lbnRTaXplKGVsZW1lbnQuZWxlbWVudCwgZWxlbWVudC5zaXplLCBndXR0ZXJTaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjb21wdXRlZFNpemUgPSBlbGVtZW50LmVsZW1lbnRbZ2V0Qm91bmRpbmdDbGllbnRSZWN0XSgpW2RpbWVuc2lvbl07XG5cbiAgICAgICAgaWYgKGNvbXB1dGVkU2l6ZSA8IGVsZW1lbnQubWluU2l6ZSkge1xuICAgICAgICAgICAgZWxlbWVudC5taW5TaXplID0gY29tcHV0ZWRTaXplO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWZ0ZXIgdGhlIGZpcnN0IGl0ZXJhdGlvbiwgYW5kIHdlIGhhdmUgYSBwYWlyIG9iamVjdCwgYXBwZW5kIGl0IHRvIHRoZVxuICAgICAgICAvLyBsaXN0IG9mIHBhaXJzLlxuICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgIHBhaXJzLnB1c2gocGFpcik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudFxuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gc2V0U2l6ZXMgKG5ld1NpemVzKSB7XG4gICAgICAgIG5ld1NpemVzLmZvckVhY2goZnVuY3Rpb24gKG5ld1NpemUsIGkpIHtcbiAgICAgICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgICAgIHZhciBwYWlyID0gcGFpcnNbaSAtIDFdO1xuICAgICAgICAgICAgICAgIHZhciBhID0gZWxlbWVudHNbcGFpci5hXTtcbiAgICAgICAgICAgICAgICB2YXIgYiA9IGVsZW1lbnRzW3BhaXIuYl07XG5cbiAgICAgICAgICAgICAgICBhLnNpemUgPSBuZXdTaXplc1tpIC0gMV07XG4gICAgICAgICAgICAgICAgYi5zaXplID0gbmV3U2l6ZTtcblxuICAgICAgICAgICAgICAgIHNldEVsZW1lbnRTaXplKGEuZWxlbWVudCwgYS5zaXplLCBwYWlyLmFHdXR0ZXJTaXplKTtcbiAgICAgICAgICAgICAgICBzZXRFbGVtZW50U2l6ZShiLmVsZW1lbnQsIGIuc2l6ZSwgcGFpci5iR3V0dGVyU2l6ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgICAgICBwYWlycy5mb3JFYWNoKGZ1bmN0aW9uIChwYWlyKSB7XG4gICAgICAgICAgICBwYWlyLnBhcmVudC5yZW1vdmVDaGlsZChwYWlyLmd1dHRlcik7XG4gICAgICAgICAgICBlbGVtZW50c1twYWlyLmFdLmVsZW1lbnQuc3R5bGVbZGltZW5zaW9uXSA9ICcnO1xuICAgICAgICAgICAgZWxlbWVudHNbcGFpci5iXS5lbGVtZW50LnN0eWxlW2RpbWVuc2lvbl0gPSAnJztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGlzSUU4KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzZXRTaXplczogc2V0U2l6ZXMsXG4gICAgICAgICAgICBkZXN0cm95OiBkZXN0cm95LFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2V0U2l6ZXM6IHNldFNpemVzLFxuICAgICAgICBnZXRTaXplczogZnVuY3Rpb24gZ2V0U2l6ZXMgKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnRzLm1hcChmdW5jdGlvbiAoZWxlbWVudCkgeyByZXR1cm4gZWxlbWVudC5zaXplOyB9KVxuICAgICAgICB9LFxuICAgICAgICBjb2xsYXBzZTogZnVuY3Rpb24gY29sbGFwc2UgKGkpIHtcbiAgICAgICAgICAgIGlmIChpID09PSBwYWlycy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFpciA9IHBhaXJzW2kgLSAxXTtcblxuICAgICAgICAgICAgICAgIGNhbGN1bGF0ZVNpemVzLmNhbGwocGFpcik7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWlzSUU4KSB7XG4gICAgICAgICAgICAgICAgICAgIGFkanVzdC5jYWxsKHBhaXIsIHBhaXIuc2l6ZSAtIHBhaXIuYkd1dHRlclNpemUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHBhaXIkMSA9IHBhaXJzW2ldO1xuXG4gICAgICAgICAgICAgICAgY2FsY3VsYXRlU2l6ZXMuY2FsbChwYWlyJDEpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFpc0lFOCkge1xuICAgICAgICAgICAgICAgICAgICBhZGp1c3QuY2FsbChwYWlyJDEsIHBhaXIkMS5hR3V0dGVyU2l6ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBkZXN0cm95OiBkZXN0cm95LFxuICAgIH1cbn07XG5cbnJldHVybiBTcGxpdDtcblxufSkpKTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cbnZhciBQb2ludCAgICAgICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlci9wb2ludC5qc1wiKS5Qb2ludFxudmFyIHJlbmRlcl9sb3dsZXZlbCA9IHJlcXVpcmUoXCIuL3JlbmRlci9yZW5kZXJfbG93bGV2ZWwuanNcIik7XG5cbmNsYXNzIEJvdW5kaW5nQm94XG57XG4gICAgY29uc3RydWN0b3IoeDAsIHkwLCB4MSwgeTEsIGFuZ2xlKVxuICAgIHtcbiAgICAgICAgdGhpcy5jZW50ZXJQb2ludCA9IG5ldyBQb2ludCgoeDAreDEpLzIsKCh5MCt5MSkvMikpXG5cbiAgICAgICAgLy8gVHJhbnNsYXRpbmcgY29vcmRpbmF0ZSB0byByZWZlcmVuY2UgY2VudGVyIHBvaW50LlxuICAgICAgICAvLyBUaGlzIHdpbGwgYmUgbmVlZGVkIHRvIHByb3Blcmx5IHJvdGF0ZSBib3VuZGluZyBib3ggYXJvdW5kIG9iamVjdC5cbiAgICAgICAgLy8gVG9wIGxlZnQgcG9pbnRcbiAgICAgICAgdGhpcy5wb2ludDAgPSBuZXcgUG9pbnQoeDAtdGhpcy5jZW50ZXJQb2ludC54LHkwLXRoaXMuY2VudGVyUG9pbnQueSk7XG4gICAgICAgIC8vIFRvcCByaWdodCBwb2ludFxuICAgICAgICB0aGlzLnBvaW50MSA9IG5ldyBQb2ludCh4MS10aGlzLmNlbnRlclBvaW50LngseTAtdGhpcy5jZW50ZXJQb2ludC55KTtcbiAgICAgICAgLy8gQm90dG9tIHJpZ2h0IHBvaW50XG4gICAgICAgIHRoaXMucG9pbnQyID0gbmV3IFBvaW50KHgxLXRoaXMuY2VudGVyUG9pbnQueCx5MS10aGlzLmNlbnRlclBvaW50LnkpO1xuICAgICAgICAvLyBCb3R0b20gbGVmdCBwb2ludFxuICAgICAgICB0aGlzLnBvaW50MyA9IG5ldyBQb2ludCh4MC10aGlzLmNlbnRlclBvaW50LngseTEtdGhpcy5jZW50ZXJQb2ludC55KTtcblxuICAgICAgICB0aGlzLmFuZ2xlID0gYW5nbGU7XG5cbiAgICB9XG5cbiAgICBSZW5kZXIoZ3VpQ29udGV4dCwgY29sb3IpXG4gICAge1xuICAgICAgICAvLyBGaXJzdCBmaWxsIHRoZSBib3guXG4gICAgICAgIGxldCByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IGNvbG9yLFxuICAgICAgICAgICAgZmlsbDogdHJ1ZSxcbiAgICAgICAgICAgIGdsb2JhbEFscGhhOiAwLjJcbiAgICAgICAgfTtcblxuICAgICAgICByZW5kZXJfbG93bGV2ZWwuUmVndWxhclBvbHlnb24oXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgdGhpcy5jZW50ZXJQb2ludCxcbiAgICAgICAgICAgIFt0aGlzLnBvaW50MCwgdGhpcy5wb2ludDEsIHRoaXMucG9pbnQyLCB0aGlzLnBvaW50M10sXG4gICAgICAgICAgICB0aGlzLmFuZ2xlLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIE5vdyBzdG9rZSB0aGUgYm94XG4gICAgICAgIHJlbmRlck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjb2xvcjogY29sb3IsXG4gICAgICAgICAgICBmaWxsOiBmYWxzZSxcbiAgICAgICAgICAgIGdsb2JhbEFscGhhOiAxLFxuICAgICAgICAgICAgbGluZVdpZHRoOiAwLjMzXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLlJlZ3VsYXJQb2x5Z29uKFxuICAgICAgICAgICAgZ3VpQ29udGV4dCxcbiAgICAgICAgICAgIHRoaXMuY2VudGVyUG9pbnQsXG4gICAgICAgICAgICBbdGhpcy5wb2ludDAsIHRoaXMucG9pbnQxLCB0aGlzLnBvaW50MiwgdGhpcy5wb2ludDNdLFxuICAgICAgICAgICAgdGhpcy5hbmdsZSxcbiAgICAgICAgICAgIHJlbmRlck9wdGlvbnNcbiAgICAgICAgKTtcbiAgICB9XG5cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgQm91bmRpbmdCb3hcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuLypcbiAgICBDcmVhdGUgYSBjbGFzcyB0byBob2xkIHByb2plY3QgbWV0YWRhdGEuIFxuXG4gICAgQ2xhc3MgaXMgZGVmaW5lZCBhcyBhIHNpbmdsZXRvbiBhcyB0aGVyZSBzaG91bGQgb25seSBldmVyIGJlIG9uZSBpbnN0YW5jZSBcbiAgICBvZiB0aGlzIGNsYXNzIGFjdGl2ZSBhdCBhIHRpbWUuXG5cbiAgICBCeSBkZWZhdWx0IGF0IGNvbnN0cnVjdGlvbiwgYWxsIHZhbHVlcyBhcmUgdW5rbm93biwgdXNlciBtdXN0IGNhbGwgU2V0KCkgaW4gXG4gICAgb3JkZXIgdG8gc2V0IG1ldGFkYXRhIGZvciB0aGUgcHJvamVjdC5cbiovXG5jbGFzcyBNZXRhZGF0YVxue1xuICAgIGNvbnN0cnVjdG9yKClcbiAgICB7XG4gICAgICAgIGlmICghTWV0YWRhdGEuaW5zdGFuY2UpXG4gICAgICAgIHtcbiAgICAgICAgICAgIE1ldGFkYXRhLmluc3RhbmNlID0gdGhpcztcbiAgICAgICAgICAgIHRoaXMucHJvdG9jb2xWZXJzaW9uID0gMDtcbiAgICAgICAgICAgIHRoaXMuZWNhZCAgICAgICAgICAgID0gXCJVbmtub3duXCJcbiAgICAgICAgICAgIHRoaXMuY29tcGFueSAgICAgICAgID0gXCJVbmtub3duXCJcbiAgICAgICAgICAgIHRoaXMucHJvamVjdF9uYW1lICAgID0gXCJVbmtub3duXCJcbiAgICAgICAgICAgIHRoaXMucmV2aXNpb24gICAgICAgID0gXCJVbmtub3duXCJcbiAgICAgICAgICAgIHRoaXMuZGF0ZSAgICAgICAgICAgID0gXCJVbmtub3duXCJcbiAgICAgICAgICAgIHRoaXMubnVtVG9wUGFydHMgICAgID0gMDtcbiAgICAgICAgICAgIHRoaXMubnVtVEJvdHRvbVBhcnRzID0gMDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gTWV0YWRhdGEuaW5zdGFuY2U7XG4gICAgfVxuXG4gICAgc3RhdGljIEdldEluc3RhbmNlKClcbiAgICB7XG4gICAgICAgIHJldHVybiB0aGlzLmluc3RhbmNlO1xuICAgIH1cblxuICAgIFNldChpUENCX0pTT05fTWV0YWRhdGEpXG4gICAge1xuICAgICAgICB0aGlzLnByb3RvY29sVmVyc2lvbiA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5wcm90b2NvbF92ZXJzaW9uO1xuICAgICAgICB0aGlzLmVjYWQgICAgICAgICAgICA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5lY2FkO1xuICAgICAgICB0aGlzLmNvbXBhbnkgICAgICAgICA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5jb21wYW55O1xuICAgICAgICB0aGlzLnByb2plY3RfbmFtZSAgICA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5wcm9qZWN0X25hbWU7XG4gICAgICAgIHRoaXMucmV2aXNpb24gICAgICAgID0gaVBDQl9KU09OX01ldGFkYXRhLnJldmlzaW9uO1xuICAgICAgICB0aGlzLmRhdGUgICAgICAgICAgICA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5kYXRlO1xuICAgICAgICB0aGlzLm51bVRvcFBhcnRzICAgICA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5udW1iZXJfcGFydHMudG9wO1xuICAgICAgICB0aGlzLm51bVRCb3R0b21QYXJ0cyA9IGlQQ0JfSlNPTl9NZXRhZGF0YS5udW1iZXJfcGFydHMuYm90dG9tO1xuICAgIH1cbn1cblxuLypcbiAgICBDcmVhdGUgYSBuZXcgaW5zdGFuY2Ugb2YgTUV0YWRhdGEgY2xhc3MuIFRoaXMgd2lsbCBiZSB0aGUgc2luZ2xlXG4gICAgaW5zdGFuY2UgdGhhdCB3aWxsIGJlIHVzZWQgdGhyb3VnaG91dCB0aGUgcHJvZ3JhbS4gTm90ZSB0aGF0IGNvbnN0IGlzIFxuICAgIHVzZWQgc2luY2UgdGhlIGluc3RhbmNlIHJlZmVyZW5jZSB3aWxsIG5ldmVyIGNoYW5nZSBCVVQgdGhlIGludGVybmFsXG4gICAgZGF0YSBtYXkgY2hhbmdlLlxuKi9cbmNvbnN0IGluc3RhbmNlX01ldGFkYXRhID0gbmV3IE1ldGFkYXRhKCk7XG5cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgTWV0YWRhdGFcbn07XG4iLCJ2YXIgUG9pbnQgICA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcG9pbnQuanNcIikuUG9pbnRcblxuZnVuY3Rpb24gR2V0UG9seWdvblZlcnRpY2llcyhyYWRpdXMsIG51bWJlclNpemVkKVxue1xuICAgIC8vIFdpbGwgc3RvcmUgdGhlIHZlcnRpY2llcyBvZiB0aGUgcG9seWdvbi5cbiAgICBsZXQgcG9seWdvblZlcnRpY2llcyA9IFtdO1xuICAgIC8vIEFzc3VtZXMgYSBwb2x5Z29uIGNlbnRlcmVkIGF0ICgwLDApXG4gICAgLy8gQXNzdW1lcyB0aGF0IGEgY2lyY3Vtc2NyaWJlZCBwb2x5Z29uLiBUaGUgZm9ybXVsYXMgdXNlZCBiZWxvIGFyZSBmb3IgYSBpbnNjcmliZWQgcG9seWdvbi4gXG4gICAgLy8gVG8gY29udmVydCBiZXR3ZWVuIGEgY2lyY3Vtc2NyaWJlZCB0byBhbiBpbnNjcmliZWQgcG9seWdvbiwgdGhlIHJhZGl1cyBmb3IgdGhlIG91dGVyIHBvbHlnb24gbmVlZHMgdG8gYmUgY2FsY3VsYXRlZC5cbiAgICAvLyBTb21lIG9mIHRoZSB0aGVvcnkgZm9yIGJlbG93IGNvbWVzIGZyb20gXG4gICAgLy8gaHR0cHM6Ly93d3cubWFhLm9yZy9leHRlcm5hbF9hcmNoaXZlL2pvbWEvVm9sdW1lNy9Ba3R1bWVuL1BvbHlnb24uaHRtbFxuICAgIC8vIC8vIEl0cyBpcyBzb21lIGJhc2ljIHRyaWcgYW5kIGdlb21ldHJ5XG4gICAgbGV0IGFscGhhID0gKDIqTWF0aC5QSSAvICgyKm51bWJlclNpemVkKSk7XG4gICAgbGV0IGluc2NyaWJlZF9yYWRpdXMgPSByYWRpdXMgL01hdGguY29zKGFscGhhKTtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBudW1iZXJTaXplZDsgaSsrKSBcbiAgICB7XG5cbiAgICAgICAgcG9seWdvblZlcnRpY2llcy5wdXNoKG5ldyBQb2ludChpbnNjcmliZWRfcmFkaXVzICogTWF0aC5jb3MoMiAqIE1hdGguUEkgKiBpIC8gbnVtYmVyU2l6ZWQpLCBpbnNjcmliZWRfcmFkaXVzICogTWF0aC5zaW4oMiAqIE1hdGguUEkgKiBpIC8gbnVtYmVyU2l6ZWQpKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBvbHlnb25WZXJ0aWNpZXM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEdldFBvbHlnb25WZXJ0aWNpZXNcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFNlZ21lbnRfQXJjICA9IHJlcXVpcmUoXCIuL1NlZ21lbnRfQXJjLmpzXCIpLlNlZ21lbnRfQXJjO1xudmFyIFNlZ21lbnRfTGluZSA9IHJlcXVpcmUoXCIuL1NlZ21lbnRfTGluZS5qc1wiKS5TZWdtZW50X0xpbmU7XG5cbnZhciBTZWdtZW50X1ZpYV9Sb3VuZCAgID0gcmVxdWlyZShcIi4vU2VnbWVudF9WaWFfUm91bmQuanNcIikuU2VnbWVudF9WaWFfUm91bmQ7XG52YXIgU2VnbWVudF9WaWFfU3F1YXJlICA9IHJlcXVpcmUoXCIuL1NlZ21lbnRfVmlhX1NxdWFyZS5qc1wiKS5TZWdtZW50X1ZpYV9TcXVhcmU7XG52YXIgU2VnbWVudF9WaWFfT2N0YWdvbiA9IHJlcXVpcmUoXCIuL1NlZ21lbnRfVmlhX09jdGFnb24uanNcIikuU2VnbWVudF9WaWFfT2N0YWdvbjtcblxudmFyIFNlZ21lbnRfUG9seWdvbiA9IHJlcXVpcmUoXCIuL1NlZ21lbnRfUG9seWdvbi5qc1wiKS5TZWdtZW50X1BvbHlnb247XG5cbnZhciBwY2IgICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi4vcGNiLmpzXCIpO1xuXG5jbGFzcyBQQ0JfTGF5ZXJcbntcbiAgICBjb25zdHJ1Y3RvcihpUENCX0pTT05fTGF5ZXIpXG4gICAge1xuICAgICAgICB0aGlzLm5hbWUgICAgICAgID0gaVBDQl9KU09OX0xheWVyLm5hbWU7XG4gICAgICAgIHRoaXMucGF0aHMgICAgICAgPSBbXTtcblxuICAgICAgICBmb3IobGV0IHNlZ21lbnQgb2YgaVBDQl9KU09OX0xheWVyLnBhdGhzKVxuICAgICAgICB7XG4gICAgICAgICAgICBpZihzZWdtZW50LnR5cGUgPT0gXCJhcmNcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhzLnB1c2gobmV3IFNlZ21lbnRfQXJjKHNlZ21lbnQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYoc2VnbWVudC50eXBlID09IFwibGluZVwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMucGF0aHMucHVzaChuZXcgU2VnbWVudF9MaW5lKHNlZ21lbnQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVSUk9SOiBVbnN1cHBvcnRlZCBzZWdtZW50IHR5cGUsIFwiLCBzZWdtZW50LnR5cGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgUmVuZGVyKGlzVmlld0Zyb250LCBzY2FsZWZhY3RvcilcbiAgICB7XG4gICAgICAgIGZvcihsZXQgcGF0aCBvZiB0aGlzLnBhdGhzKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgY3R4ID0gcGNiLkdldExheWVyQ2FudmFzKHBhdGgubGF5ZXIsIGlzVmlld0Zyb250KS5nZXRDb250ZXh0KFwiMmRcIilcbiAgICAgICAgICAgIHBhdGguUmVuZGVyKGN0eCwgc2NhbGVmYWN0b3IpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQQ0JfTGF5ZXJcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBhY2thZ2UgID0gcmVxdWlyZShcIi4vUGFja2FnZS5qc1wiKS5QYWNrYWdlO1xuXG5jbGFzcyBQQ0JfUGFydFxue1xuICAgIGNvbnN0cnVjdG9yKGlQQ0JfSlNPTl9QYXJ0KVxuICAgIHtcbiAgICAgICAgdGhpcy5uYW1lICAgICAgICA9IGlQQ0JfSlNPTl9QYXJ0Lm5hbWU7XG4gICAgICAgIHRoaXMudmFsdWUgICAgICAgPSBpUENCX0pTT05fUGFydC52YWx1ZTtcbiAgICAgICAgdGhpcy5wYWNrYWdlICAgICA9IG5ldyBQYWNrYWdlKGlQQ0JfSlNPTl9QYXJ0LnBhY2thZ2UpO1xuICAgICAgICB0aGlzLmF0dHJpYnV0ZXMgID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmxvY2F0aW9uICAgID0gaVBDQl9KU09OX1BhcnQubG9jYXRpb247XG5cbiAgICAgICAgLy8gSXRlcmF0ZSBvdmVyIGFsbCBhdHRyaWJ1dGVzIGFuZCBhZGQgdGhlLCB0byBhdHRyaWJ1dGUgbWFwLlxuICAgICAgICBmb3IobGV0IGF0dHJpYnV0ZSBvZiBpUENCX0pTT05fUGFydC5hdHRyaWJ1dGVzKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLmF0dHJpYnV0ZXMuc2V0KGF0dHJpYnV0ZS5uYW1lLnRvTG93ZXJDYXNlKCksYXR0cmlidXRlLnZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgUmVuZGVyKGd1aUNvbnRleHQsIGlzVmlld0Zyb250LCBpc1NlbGVjdGVkKVxuICAgIHtcbiAgICAgICAgdGhpcy5wYWNrYWdlLlJlbmRlcihndWlDb250ZXh0LCBpc1ZpZXdGcm9udCwgdGhpcy5sb2NhdGlvbiwgaXNTZWxlY3RlZCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQQ0JfUGFydFxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cbnZhciBwY2IgICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi4vcGNiLmpzXCIpO1xuXG5jbGFzcyBQQ0JfVGVzdFBvaW50XG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1Rlc3RQb2ludClcbiAgICB7XG4gICAgICAgIHRoaXMubmFtZSAgICAgICAgPSBpUENCX0pTT05fVGVzdFBvaW50Lm5hbWU7XG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBpUENCX0pTT05fVGVzdFBvaW50LmRlc2NyaXB0aW9uO1xuICAgICAgICB0aGlzLmV4cGVjdGVkICAgID0gaVBDQl9KU09OX1Rlc3RQb2ludC5leHBlY3RlZDtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFBDQl9UZXN0UG9pbnRcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuXG52YXIgU2VnbWVudF9BcmMgID0gcmVxdWlyZShcIi4vU2VnbWVudF9BcmMuanNcIikuU2VnbWVudF9BcmM7XG52YXIgU2VnbWVudF9MaW5lID0gcmVxdWlyZShcIi4vU2VnbWVudF9MaW5lLmpzXCIpLlNlZ21lbnRfTGluZTtcblxudmFyIFNlZ21lbnRfVmlhX1JvdW5kICAgPSByZXF1aXJlKFwiLi9TZWdtZW50X1ZpYV9Sb3VuZC5qc1wiKS5TZWdtZW50X1ZpYV9Sb3VuZDtcbnZhciBTZWdtZW50X1ZpYV9TcXVhcmUgID0gcmVxdWlyZShcIi4vU2VnbWVudF9WaWFfU3F1YXJlLmpzXCIpLlNlZ21lbnRfVmlhX1NxdWFyZTtcbnZhciBTZWdtZW50X1ZpYV9PY3RhZ29uID0gcmVxdWlyZShcIi4vU2VnbWVudF9WaWFfT2N0YWdvbi5qc1wiKS5TZWdtZW50X1ZpYV9PY3RhZ29uO1xuXG52YXIgU2VnbWVudF9Qb2x5Z29uID0gcmVxdWlyZShcIi4vU2VnbWVudF9Qb2x5Z29uLmpzXCIpLlNlZ21lbnRfUG9seWdvbjtcblxudmFyIHBjYiAgICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuLi9wY2IuanNcIik7XG5cbmNsYXNzIFBDQl9UcmFjZVxue1xuICAgIGNvbnN0cnVjdG9yKGlQQ0JfSlNPTl9UcmFjZSlcbiAgICB7XG4gICAgICAgIHRoaXMubmFtZSA9IGlQQ0JfSlNPTl9UcmFjZS5uYW1lO1xuICAgICAgICB0aGlzLnNlZ21lbnRzID0gW107XG5cbiAgICAgICAgZm9yKGxldCBzZWdtZW50IG9mIGlQQ0JfSlNPTl9UcmFjZS5zZWdtZW50cylcbiAgICAgICAge1xuICAgICAgICAgICAgaWYoc2VnbWVudC50eXBlID09IFwiYXJjXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWdtZW50cy5wdXNoKG5ldyBTZWdtZW50X0FyYyhzZWdtZW50KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmKHNlZ21lbnQudHlwZSA9PSBcImxpbmVcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlZ21lbnRzLnB1c2gobmV3IFNlZ21lbnRfTGluZShzZWdtZW50KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmKHNlZ21lbnQudHlwZSA9PSBcInZpYV9yb3VuZFwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VnbWVudHMucHVzaChuZXcgU2VnbWVudF9WaWFfUm91bmQoc2VnbWVudCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihzZWdtZW50LnR5cGUgPT0gXCJ2aWFfc3F1YXJlXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWdtZW50cy5wdXNoKG5ldyBTZWdtZW50X1ZpYV9TcXVhcmUoc2VnbWVudCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihzZWdtZW50LnR5cGUgPT0gXCJ2aWFfb2N0YWdvblwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VnbWVudHMucHVzaChuZXcgU2VnbWVudF9WaWFfT2N0YWdvbihzZWdtZW50KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmKHNlZ21lbnQudHlwZSA9PSBcInBvbHlnb25cIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlZ21lbnRzLnB1c2gobmV3IFNlZ21lbnRfUG9seWdvbihzZWdtZW50KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJFUlJPUjogVW5zdXBwb3J0ZWQgc2VnbWVudCB0eXBlLCBcIiwgc2VnbWVudC50eXBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIFJlbmRlcihpc1ZpZXdGcm9udCwgc2NhbGVmYWN0b3IpXG4gICAge1xuICAgICAgICBmb3IobGV0IHNlZ21lbnQgb2YgdGhpcy5zZWdtZW50cylcbiAgICAgICAge1xuICAgICAgICAgICAgbGV0IGN0eCA9IHBjYi5HZXRMYXllckNhbnZhcyhzZWdtZW50LmxheWVyLCBpc1ZpZXdGcm9udCkuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgICAgICAgICAgc2VnbWVudC5SZW5kZXIoY3R4LCBzY2FsZWZhY3Rvcik7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFBDQl9UcmFjZVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgQm91bmRpbmdCb3ggID0gcmVxdWlyZShcIi4uL0JvdW5kaW5nQm94LmpzXCIpLkJvdW5kaW5nQm94O1xuXG52YXIgUGFja2FnZV9QYWRfUmVjdGFuZ2xlICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkX1JlY3RhbmdsZS5qc1wiKS5QYWNrYWdlX1BhZF9SZWN0YW5nbGU7XG52YXIgUGFja2FnZV9QYWRfT2Jsb25nICAgICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkX09ibG9uZy5qc1wiKS5QYWNrYWdlX1BhZF9PYmxvbmc7XG52YXIgUGFja2FnZV9QYWRfUm91bmQgICAgICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkX1JvdW5kLmpzXCIpLlBhY2thZ2VfUGFkX1JvdW5kO1xudmFyIFBhY2thZ2VfUGFkX09jdGFnb24gICAgPSByZXF1aXJlKFwiLi9QYWNrYWdlX1BhZF9PY3RhZ29uLmpzXCIpLlBhY2thZ2VfUGFkX09jdGFnb247XG52YXIgUGFja2FnZV9QYWRfU01EICAgID0gcmVxdWlyZShcIi4vUGFja2FnZV9QYWRfU01ELmpzXCIpLlBhY2thZ2VfUGFkX1NNRDtcblxudmFyIGNvbG9ybWFwICAgICAgICAgICA9IHJlcXVpcmUoXCIuLi9jb2xvcm1hcC5qc1wiKTtcblxuY2xhc3MgUGFja2FnZVxue1xuICAgIGNvbnN0cnVjdG9yKGlQQ0JfSlNPTl9QYWNrYWdlKVxuICAgIHtcbiAgICAgICAgdGhpcy5ib3VuZGluZ0JveCA9IG5ldyBCb3VuZGluZ0JveChpUENCX0pTT05fUGFja2FnZS5ib3VuZGluZ19ib3gueDAsIGlQQ0JfSlNPTl9QYWNrYWdlLmJvdW5kaW5nX2JveC55MCwgaVBDQl9KU09OX1BhY2thZ2UuYm91bmRpbmdfYm94LngxLCBpUENCX0pTT05fUGFja2FnZS5ib3VuZGluZ19ib3gueTEsIGlQQ0JfSlNPTl9QYWNrYWdlLmJvdW5kaW5nX2JveC5hbmdsZSk7XG5cbiAgICAgICAgdGhpcy5wYWRzID0gW107XG5cbiAgICAgICAgZm9yKGxldCBwYWQgb2YgaVBDQl9KU09OX1BhY2thZ2UucGFkcylcbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKHBhZC50eXBlID09IFwicmVjdFwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMucGFkcy5wdXNoKG5ldyBQYWNrYWdlX1BhZF9SZWN0YW5nbGUocGFkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChwYWQudHlwZSA9PSBcIm9ibG9uZ1wiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMucGFkcy5wdXNoKG5ldyBQYWNrYWdlX1BhZF9PYmxvbmcocGFkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChwYWQudHlwZSA9PSBcInJvdW5kXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYWRzLnB1c2gobmV3IFBhY2thZ2VfUGFkX1JvdW5kKHBhZCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAocGFkLnR5cGUgPT0gXCJvY3RhZ29uXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYWRzLnB1c2gobmV3IFBhY2thZ2VfUGFkX09jdGFnb24ocGFkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChwYWQudHlwZSA9PSBcInNtZFwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMucGFkcy5wdXNoKG5ldyBQYWNrYWdlX1BhZF9TTUQocGFkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJFUlJPUjogVW5zdXBwb3J0ZWQgcGFkIHR5cGUgXCIsIHBhZC50eXBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIFJlbmRlcihndWlDb250ZXh0LCBpc1ZpZXdGcm9udCwgbG9jYXRpb24sIGlzU2VsZWN0ZWQpXG4gICAge1xuICAgICAgICBmb3IgKGxldCBwYWQgb2YgdGhpcy5wYWRzKVxuICAgICAgICB7XG4gICAgICAgICAgICBpZiggICAgKCgobG9jYXRpb24gPT0gXCJGXCIpICYmIChwYWQuSXNTTUQoKSkgJiYgIGlzVmlld0Zyb250KSlcbiAgICAgICAgICAgICAgICB8fCAoKChsb2NhdGlvbiA9PSBcIkJcIikgJiYgKHBhZC5Jc1NNRCgpKSAmJiAhaXNWaWV3RnJvbnQpKVxuICAgICAgICAgICAgICAgIHx8IChwYWQuSXNUSFQoKSlcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgY29sb3IgPSBjb2xvcm1hcC5HZXRQYWRDb2xvcihwYWQuSXNQaW4xKCksIGlzU2VsZWN0ZWQsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICBwYWQuUmVuZGVyKGd1aUNvbnRleHQsIGNvbG9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCAgICAoaXNTZWxlY3RlZCAmJiAobG9jYXRpb24gPT0gXCJGXCIpICYmIGlzVmlld0Zyb250KVxuICAgICAgICAgICAgfHwgKGlzU2VsZWN0ZWQgJiYgKGxvY2F0aW9uID09IFwiQlwiKSAmJiAhaXNWaWV3RnJvbnQpXG4gICAgICAgICAgKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgY29sb3IgPSBjb2xvcm1hcC5HZXRCb3VuZGluZ0JveENvbG9yKGlzU2VsZWN0ZWQsIGZhbHNlKTtcbiAgICAgICAgICAgIHRoaXMuYm91bmRpbmdCb3guUmVuZGVyKGd1aUNvbnRleHQsIGNvbG9yKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUGFja2FnZVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cbmNsYXNzIFBhY2thZ2VfUGFkXG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1BhZClcbiAgICB7XG4gICAgICAgIHRoaXMucGluMSAgICAgICA9IGlQQ0JfSlNPTl9QYWQucGluMTtcbiAgICAgICAgdGhpcy50eXBlICAgICAgID0gaVBDQl9KU09OX1BhZC50eXBlO1xuICAgIH1cblxuICAgIFJlbmRlcihpc0Zyb250LCBsb2NhdGlvbilcbiAgICB7XG5cbiAgICB9XG5cbiAgICBJc1NNRCgpXG4gICAge1xuICAgICAgICByZXR1cm4gKHRoaXMudHlwZSA9PSAnc21kJyk7XG4gICAgfVxuXG4gICAgSXNUSFQoKVxuICAgIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLnR5cGUgIT0gJ3NtZCcpO1xuICAgIH1cblxuICAgIElzUGluMSgpXG4gICAge1xuICAgICAgICByZXR1cm4gdGhpcy5waW4xO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUGFja2FnZV9QYWRcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBhY2thZ2VfUGFkICAgICAgICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkLmpzXCIpLlBhY2thZ2VfUGFkXG52YXIgUG9pbnQgICAgICAgICAgICAgID0gcmVxdWlyZShcIi4uL3JlbmRlci9wb2ludC5qc1wiKS5Qb2ludFxudmFyIHJlbmRlcl9sb3dsZXZlbCAgICA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xuXG5cbmNsYXNzIFBhY2thZ2VfUGFkX09ibG9uZyBleHRlbmRzIFBhY2thZ2VfUGFkXG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1BhZClcbiAgICB7XG4gICAgICAgIHN1cGVyKGlQQ0JfSlNPTl9QYWQpO1xuICAgICAgICB0aGlzLmFuZ2xlICAgICAgPSBpUENCX0pTT05fUGFkLmFuZ2xlO1xuICAgICAgICB0aGlzLnggICAgICAgICAgPSBpUENCX0pTT05fUGFkLng7XG4gICAgICAgIHRoaXMueSAgICAgICAgICA9IGlQQ0JfSlNPTl9QYWQueTtcbiAgICAgICAgdGhpcy5kaWFtZXRlciAgID0gaVBDQl9KU09OX1BhZC5kaWFtZXRlcjtcbiAgICAgICAgdGhpcy5lbG9uZ2F0aW9uID0gaVBDQl9KU09OX1BhZC5lbG9uZ2F0aW9uO1xuICAgICAgICB0aGlzLmRyaWxsICAgICAgPSBpUENCX0pTT05fUGFkLmRyaWxsOyAgLy8gVE9ETzogVGhpcyBpcyBub3QgbmVlZGVkIGFuZCBpcyB1bmRlZmluZWQgaWYgdHlwZSBpcyBzbWQuIFRydWUgZm9yIGFsbCBwYWQgdHlwZXMuXG4gICAgfVxuXG5cbiAgICAvKlxuICAgICAgICBBbiBvYmxvbmcgcGFkIGNhbiBiZSB0aG91Z2h0IG9mIGFzIGhhdmluZyBhIHJlY3Rhbmd1bGFyIG1pZGRsZSB3aXRoIHR3byBzZW1pY2lyY2xlIGVuZHMuIFxuXG4gICAgICAgIEVhZ2xlQ0FEIHByb3ZpZGVzIHByb3ZpZGVzIHRocmVlIHBpZWNlcyBvZiBpbmZvcm1hdGlvbiBmb3IgZ2VuZXJhdGluZyB0aGVzZSBwYWRzLiBcbiAgICAgICAgICAgIDEpIENlbnRlciBwb2ludCA9IENlbnRlciBvZiBwYXJ0XG4gICAgICAgICAgICAyKSBEaWFtZXRlciA9IGRpc3RhbmNlIGZyb20gY2VudGVyIHBvaW50IHRvIGVkZ2Ugb2Ygc2VtaWNpcmNsZVxuICAgICAgICAgICAgMykgRWxvbmdhdGlvbiA9JSByYXRpbyByZWxhdGluZyBkaWFtZXRlciB0byB3aWR0aFxuXG4gICAgICAgIFRoZSBkZXNpZ24gYWxzbyBoYXMgNCBwb2ludHMgb2YgIGludGVyZXN0LCBlYWNoIHJlcHJlc2VudGluZyB0aGUgXG4gICAgICAgIGNvcm5lciBvZiB0aGUgcmVjdGFuZ2xlLiBcblxuICAgICAgICBUbyByZW5kZXIgdGhlIGxlbmd0aCBhbmQgd2lkdGggYXJlIGRlcml2ZWQuIFRoaXMgaXMgZGl2aWRlZCBpbiBoYWxmIHRvIGdldCB0aGUgXG4gICAgICAgIHZhbHVlcyB1c2VkIHRvIHRyYW5zbGF0ZSB0aGUgY2VudHJhbCBwb2ludCB0byBvbmUgb2YgdGhlIHZlcnRpY2llcy4gXG4gICAgKi9cbiAgICBSZW5kZXIoZ3VpQ29udGV4dCwgY29sb3IpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LnNhdmUoKTtcbiAgICAgICAgLy8gRGlhbWV0ZXIgaXMgdGhlIGRpc25jZSBmcm9tIGNlbnRlciBvZiBwYWQgdG8gdGlwIG9mIGNpcmNsZVxuICAgICAgICAvLyBlbG9uZ2F0aW9uIGlzIGEgZmFjdG9yIHRoYXQgcmVsYXRlZCB0aGUgZGlhbWV0ZXIgdG8gdGhlIHdpZHRoXG4gICAgICAgIC8vIFRoaXMgaXMgdGhlIHRvdGFsIHdpZHRoXG4gICAgICAgIGxldCB3aWR0aCAgID0gdGhpcy5kaWFtZXRlcip0aGlzLmVsb25nYXRpb24vMTAwO1xuICAgICAgICBcbiAgICAgICAgLy8gVEhlIHdpZHRoIG9mIHRoZSByZWN0YW5nbGUgaXMgdGhlIGRpYW1ldGVyIC1oYWxmIHRoZSByYWRpdXMuXG4gICAgICAgIC8vIFNlZSBkb2N1bWVudGF0aW9uIG9uIGhvdyB0aGVzZSBhcmUgY2FsY3VsYXRlZC5cbiAgICAgICAgbGV0IGhlaWdodCAgPSAodGhpcy5kaWFtZXRlci13aWR0aC8yKSoyO1xuXG4gICAgICAgIC8vIGFzc3VtZXMgb3ZhbCBpcyBjZW50ZXJlZCBhdCAoMCwwKVxuICAgICAgICBsZXQgY2VudGVyUG9pbnQgPSBuZXcgUG9pbnQodGhpcy54LCB0aGlzLnkpO1xuXG4gICAgICAgIGxldCByZW5kZXJPcHRpb25zID0geyBcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvcixcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLk92YWwoIFxuICAgICAgICAgICAgZ3VpQ29udGV4dCxcbiAgICAgICAgICAgIGNlbnRlclBvaW50LFxuICAgICAgICAgICAgaGVpZ2h0LFxuICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgICB0aGlzLmFuZ2xlLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuXG4gICAgICAgIHJlbmRlck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjb2xvcjogXCIjQ0NDQ0NDXCIsXG4gICAgICAgICAgICBmaWxsOiB0cnVlLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJlbmRlcl9sb3dsZXZlbC5DaXJjbGUoXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgY2VudGVyUG9pbnQsXG4gICAgICAgICAgICB0aGlzLmRyaWxsLzIsXG4gICAgICAgICAgICByZW5kZXJPcHRpb25zXG4gICAgICAgICk7XG5cbiAgICAgICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQYWNrYWdlX1BhZF9PYmxvbmdcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBhY2thZ2VfUGFkICAgICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkLmpzXCIpLlBhY2thZ2VfUGFkXG52YXIgUG9pbnQgICAgICAgICAgID0gcmVxdWlyZShcIi4uL3JlbmRlci9wb2ludC5qc1wiKS5Qb2ludFxudmFyIHJlbmRlcl9sb3dsZXZlbCA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xudmFyIGNvbG9ybWFwICAgICAgICA9IHJlcXVpcmUoXCIuLi9jb2xvcm1hcC5qc1wiKTtcblxuY2xhc3MgUGFja2FnZV9QYWRfT2N0YWdvbiBleHRlbmRzIFBhY2thZ2VfUGFkXG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1BhZClcbiAgICB7XG4gICAgICAgIHN1cGVyKGlQQ0JfSlNPTl9QYWQpO1xuICAgICAgICB0aGlzLmFuZ2xlICAgICAgPSBpUENCX0pTT05fUGFkLmFuZ2xlO1xuICAgICAgICB0aGlzLnggICAgICAgICAgPSBpUENCX0pTT05fUGFkLng7XG4gICAgICAgIHRoaXMueSAgICAgICAgICA9IGlQQ0JfSlNPTl9QYWQueTtcbiAgICAgICAgdGhpcy5kaWFtZXRlciAgID0gaVBDQl9KU09OX1BhZC5kaWFtZXRlcjtcbiAgICAgICAgdGhpcy5kcmlsbCAgICAgID0gaVBDQl9KU09OX1BhZC5kcmlsbDtcbiAgICB9XG5cbiAgIFJlbmRlcihndWlDb250ZXh0LCBjb2xvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xuICAgICAgICAvLyBXaWxsIHN0b3JlIHRoZSB2ZXJ0aWNpZXMgb2YgdGhlIHBvbHlnb24uXG4gICAgICAgIGxldCBwb2x5Z29uVmVydGljaWVzID0gW107XG5cbiAgICAgICAgXG4gICAgICAgIGxldCBuID0gODtcbiAgICAgICAgbGV0IHIgPSB0aGlzLmRpYW1ldGVyLzI7XG4gICAgICAgIC8vIEFzc3VtZXMgYSBwb2x5Z29uIGNlbnRlcmVkIGF0ICgwLDApXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IG47IGkrKykgXG4gICAgICAgIHtcbiAgICAgICAgICAgIHBvbHlnb25WZXJ0aWNpZXMucHVzaChuZXcgUG9pbnQociAqIE1hdGguY29zKDIgKiBNYXRoLlBJICogaSAvIG4pLCByICogTWF0aC5zaW4oMiAqIE1hdGguUEkgKiBpIC8gbikpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBhbmdsZSA9ICh0aGlzLmFuZ2xlKzQ1LzIpO1xuICAgICAgICBsZXQgY2VudGVyUG9pbnQgPSBuZXcgUG9pbnQodGhpcy54LCB0aGlzLnkpO1xuICAgICAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHsgXG4gICAgICAgICAgICBjb2xvcjogY29sb3IsXG4gICAgICAgICAgICBmaWxsOiB0cnVlLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJlbmRlcl9sb3dsZXZlbC5SZWd1bGFyUG9seWdvbiggXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgY2VudGVyUG9pbnQsIFxuICAgICAgICAgICAgcG9seWdvblZlcnRpY2llcyxcbiAgICAgICAgICAgIGFuZ2xlLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuXG5cbiAgICAgICAgcmVuZGVyT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNvbG9yOiBcIiNDQ0NDQ0NcIixcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZShcbiAgICAgICAgICAgIGd1aUNvbnRleHQsXG4gICAgICAgICAgICBjZW50ZXJQb2ludCxcbiAgICAgICAgICAgIHRoaXMuZHJpbGwvMiwgXG4gICAgICAgICAgICByZW5kZXJPcHRpb25zXG4gICAgICAgICk7XG5cbiAgICAgICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQYWNrYWdlX1BhZF9PY3RhZ29uXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBQYWNrYWdlX1BhZCAgICAgPSByZXF1aXJlKFwiLi9QYWNrYWdlX1BhZC5qc1wiKS5QYWNrYWdlX1BhZFxudmFyIFBvaW50ICAgICAgICAgICA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcG9pbnQuanNcIikuUG9pbnRcbnZhciByZW5kZXJfbG93bGV2ZWwgPSByZXF1aXJlKFwiLi4vcmVuZGVyL3JlbmRlcl9sb3dsZXZlbC5qc1wiKTtcbnZhciBjb2xvcm1hcCAgICAgICAgPSByZXF1aXJlKFwiLi4vY29sb3JtYXAuanNcIik7XG5cbmNsYXNzIFBhY2thZ2VfUGFkX1JlY3RhbmdsZSBleHRlbmRzIFBhY2thZ2VfUGFkXG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1BhZClcbiAgICB7XG4gICAgICAgIHN1cGVyKGlQQ0JfSlNPTl9QYWQpO1xuICAgICAgICB0aGlzLmFuZ2xlICAgICAgPSBpUENCX0pTT05fUGFkLmFuZ2xlO1xuICAgICAgICB0aGlzLnggICAgICAgICAgPSBpUENCX0pTT05fUGFkLng7XG4gICAgICAgIHRoaXMueSAgICAgICAgICA9IGlQQ0JfSlNPTl9QYWQueTtcbiAgICAgICAgdGhpcy5keCAgICAgICAgID0gaVBDQl9KU09OX1BhZC5keDtcbiAgICAgICAgdGhpcy5keSAgICAgICAgID0gaVBDQl9KU09OX1BhZC5keTtcbiAgICAgICAgdGhpcy5kcmlsbCAgICAgID0gaVBDQl9KU09OX1BhZC5kcmlsbDtcbiAgICB9XG5cbiAgICBSZW5kZXIoZ3VpQ29udGV4dCwgY29sb3IpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LnNhdmUoKTtcbiAgICAgICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHRoaXMueCwgdGhpcy55KTtcblxuICAgICAgICAvKlxuICAgICAgICAgICAgICAgIFRoZSBmb2xsb3dpbmcgZGVyaXZlIHRoZSBjb3JuZXIgcG9pbnRzIGZvciB0aGVcbiAgICAgICAgICAgICAgICByZWN0YW5ndWxhciBwYWQuIFRoZXNlIGFyZSBjYWxjdWxhdGVkIHVzaW5nIHRoZSBjZW50ZXIgXG4gICAgICAgICAgICAgICAgcG9pbnQgb2YgdGhlIHJlY3RhbmdsZSBhbG9uZyB3aXRoIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IFxuICAgICAgICAgICAgICAgIG9mIHRoZSByZWN0YW5nbGUuIFxuICAgICAgICAqL1xuICAgICAgICAvLyBUb3AgbGVmdCBwb2ludFxuICAgICAgICBsZXQgcG9pbnQwID0gbmV3IFBvaW50KC10aGlzLmR4LzIsIHRoaXMuZHkvMik7XG4gICAgICAgIC8vIFRvcCByaWdodCBwb2ludFxuICAgICAgICBsZXQgcG9pbnQxID0gbmV3IFBvaW50KHRoaXMuZHgvMiwgdGhpcy5keS8yKTtcbiAgICAgICAgLy8gQm90dG9tIHJpZ2h0IHBvaW50XG4gICAgICAgIGxldCBwb2ludDIgPSBuZXcgUG9pbnQodGhpcy5keC8yLCAtdGhpcy5keS8yKTtcbiAgICAgICAgLy8gQm90dG9tIGxlZnQgcG9pbnRcbiAgICAgICAgbGV0IHBvaW50MyA9IG5ldyBQb2ludCgtdGhpcy5keC8yLCAtdGhpcy5keS8yKTtcblxuICAgICAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNvbG9yOiBjb2xvcixcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLlJlZ3VsYXJQb2x5Z29uKCBcbiAgICAgICAgICAgIGd1aUNvbnRleHQsXG4gICAgICAgICAgICBjZW50ZXJQb2ludCwgXG4gICAgICAgICAgICBbcG9pbnQwLCBwb2ludDEsIHBvaW50MiwgcG9pbnQzXSxcbiAgICAgICAgICAgIHRoaXMuYW5nbGUsXG4gICAgICAgICAgICByZW5kZXJPcHRpb25zXG4gICAgICAgICk7XG5cbiAgICAgICAgcmVuZGVyT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNvbG9yOiBcIiNDQ0NDQ0NcIixcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZShcbiAgICAgICAgICAgIGd1aUNvbnRleHQsXG4gICAgICAgICAgICBjZW50ZXJQb2ludCxcbiAgICAgICAgICAgIHRoaXMuZHJpbGwvMiwgXG4gICAgICAgICAgICByZW5kZXJPcHRpb25zXG4gICAgICAgICk7XG5cbiAgICAgICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQYWNrYWdlX1BhZF9SZWN0YW5nbGVcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBhY2thZ2VfUGFkICAgICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkLmpzXCIpLlBhY2thZ2VfUGFkXG52YXIgUG9pbnQgICAgICAgICAgID0gcmVxdWlyZShcIi4uL3JlbmRlci9wb2ludC5qc1wiKS5Qb2ludFxudmFyIHJlbmRlcl9sb3dsZXZlbCA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xudmFyIGNvbG9ybWFwICAgICAgICA9IHJlcXVpcmUoXCIuLi9jb2xvcm1hcC5qc1wiKTtcblxuY2xhc3MgUGFja2FnZV9QYWRfUm91bmQgZXh0ZW5kcyBQYWNrYWdlX1BhZFxue1xuICAgIGNvbnN0cnVjdG9yKGlQQ0JfSlNPTl9QYWQpXG4gICAge1xuICAgICAgICBzdXBlcihpUENCX0pTT05fUGFkKTtcbiAgICAgICAgdGhpcy5hbmdsZSAgICAgID0gaVBDQl9KU09OX1BhZC5hbmdsZTtcbiAgICAgICAgdGhpcy54ICAgICAgICAgID0gaVBDQl9KU09OX1BhZC54O1xuICAgICAgICB0aGlzLnkgICAgICAgICAgPSBpUENCX0pTT05fUGFkLnk7XG4gICAgICAgIHRoaXMuZGlhbWV0ZXIgICA9IGlQQ0JfSlNPTl9QYWQuZGlhbWV0ZXI7XG4gICAgICAgIHRoaXMuZHJpbGwgICAgICA9IGlQQ0JfSlNPTl9QYWQuZHJpbGw7XG4gICAgfVxuXG4gICAgUmVuZGVyKGd1aUNvbnRleHQsIGNvbG9yKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5zYXZlKCk7XG5cbiAgICAgICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHRoaXMueCwgdGhpcy55KTtcbiAgICAgICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjb2xvcjogY29sb3IsXG4gICAgICAgICAgICBmaWxsOiB0cnVlLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJlbmRlcl9sb3dsZXZlbC5DaXJjbGUoIFxuICAgICAgICAgICAgZ3VpQ29udGV4dCxcbiAgICAgICAgICAgIGNlbnRlclBvaW50LCAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMuZHJpbGwsIFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApOyBcblxuICAgICAgICByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IFwiI0NDQ0NDQ1wiLFxuICAgICAgICAgICAgZmlsbDogdHJ1ZSxcbiAgICAgICAgfTtcblxuICAgICAgICByZW5kZXJfbG93bGV2ZWwuQ2lyY2xlKFxuICAgICAgICAgICAgZ3VpQ29udGV4dCxcbiAgICAgICAgICAgIGNlbnRlclBvaW50LFxuICAgICAgICAgICAgdGhpcy5kcmlsbC8yLCBcbiAgICAgICAgICAgIHJlbmRlck9wdGlvbnNcbiAgICAgICAgKTtcblxuICAgICAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcblxuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUGFja2FnZV9QYWRfUm91bmRcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBhY2thZ2VfUGFkICAgICA9IHJlcXVpcmUoXCIuL1BhY2thZ2VfUGFkLmpzXCIpLlBhY2thZ2VfUGFkXG52YXIgUG9pbnQgICAgICAgICAgID0gcmVxdWlyZShcIi4uL3JlbmRlci9wb2ludC5qc1wiKS5Qb2ludFxudmFyIHJlbmRlcl9sb3dsZXZlbCA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xudmFyIGNvbG9ybWFwICAgICAgICA9IHJlcXVpcmUoXCIuLi9jb2xvcm1hcC5qc1wiKTtcblxuY2xhc3MgUGFja2FnZV9QYWRfU01EIGV4dGVuZHMgUGFja2FnZV9QYWRcbntcbiAgICBjb25zdHJ1Y3RvcihpUENCX0pTT05fUGFkKVxuICAgIHtcbiAgICAgICAgc3VwZXIoaVBDQl9KU09OX1BhZCk7XG4gICAgICAgIHRoaXMuYW5nbGUgICAgICA9IGlQQ0JfSlNPTl9QYWQuYW5nbGU7XG4gICAgICAgIHRoaXMueCAgICAgICAgICA9IGlQQ0JfSlNPTl9QYWQueDtcbiAgICAgICAgdGhpcy55ICAgICAgICAgID0gaVBDQl9KU09OX1BhZC55O1xuICAgICAgICB0aGlzLmR4ICAgICAgICAgPSBpUENCX0pTT05fUGFkLmR4O1xuICAgICAgICB0aGlzLmR5ICAgICAgICAgPSBpUENCX0pTT05fUGFkLmR5O1xuICAgIH1cblxuICAgIFJlbmRlcihndWlDb250ZXh0LCBjb2xvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xuICAgICAgICBsZXQgY2VudGVyUG9pbnQgPSBuZXcgUG9pbnQodGhpcy54LCB0aGlzLnkpO1xuXG4gICAgICAgIC8qXG4gICAgICAgICAgICAgICAgVGhlIGZvbGxvd2luZyBkZXJpdmUgdGhlIGNvcm5lciBwb2ludHMgZm9yIHRoZVxuICAgICAgICAgICAgICAgIHJlY3Rhbmd1bGFyIHBhZC4gVGhlc2UgYXJlIGNhbGN1bGF0ZWQgdXNpbmcgdGhlIGNlbnRlciBcbiAgICAgICAgICAgICAgICBwb2ludCBvZiB0aGUgcmVjdGFuZ2xlIGFsb25nIHdpdGggdGhlIHdpZHRoIGFuZCBoZWlnaHQgXG4gICAgICAgICAgICAgICAgb2YgdGhlIHJlY3RhbmdsZS4gXG4gICAgICAgICovXG4gICAgICAgIC8vIFRvcCBsZWZ0IHBvaW50XG4gICAgICAgIGxldCBwb2ludDAgPSBuZXcgUG9pbnQoLXRoaXMuZHgvMiwgdGhpcy5keS8yKTtcbiAgICAgICAgLy8gVG9wIHJpZ2h0IHBvaW50XG4gICAgICAgIGxldCBwb2ludDEgPSBuZXcgUG9pbnQodGhpcy5keC8yLCB0aGlzLmR5LzIpO1xuICAgICAgICAvLyBCb3R0b20gcmlnaHQgcG9pbnRcbiAgICAgICAgbGV0IHBvaW50MiA9IG5ldyBQb2ludCh0aGlzLmR4LzIsIC10aGlzLmR5LzIpO1xuICAgICAgICAvLyBCb3R0b20gbGVmdCBwb2ludFxuICAgICAgICBsZXQgcG9pbnQzID0gbmV3IFBvaW50KC10aGlzLmR4LzIsIC10aGlzLmR5LzIpO1xuXG4gICAgICAgIGxldCByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IGNvbG9yLFxuICAgICAgICAgICAgZmlsbDogdHJ1ZSxcbiAgICAgICAgfTtcblxuICAgICAgICByZW5kZXJfbG93bGV2ZWwuUmVndWxhclBvbHlnb24oIFxuICAgICAgICAgICAgZ3VpQ29udGV4dCxcbiAgICAgICAgICAgIGNlbnRlclBvaW50LCBcbiAgICAgICAgICAgIFtwb2ludDAsIHBvaW50MSwgcG9pbnQyLCBwb2ludDNdLFxuICAgICAgICAgICAgdGhpcy5hbmdsZSxcbiAgICAgICAgICAgIHJlbmRlck9wdGlvbnNcbiAgICAgICAgKTtcblxuICAgICAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFBhY2thZ2VfUGFkX1NNRFxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cbmNsYXNzIFNlZ21lbnRcbntcbiAgICBjb25zdHJ1Y3RvcihpUENCX0pTT05fU2VnbWVudClcbiAgICB7XG4gICAgICAgIFxuICAgIH1cblxuICAgIFJlbmRlcihndWlDb250ZXh0LCBzY2FsZWZhY3RvcilcbiAgICB7XG5cbiAgICB9XG5cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgU2VnbWVudFxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cbnZhciBQb2ludCAgICAgICAgICAgPSByZXF1aXJlKFwiLi4vcmVuZGVyL3BvaW50LmpzXCIpLlBvaW50XG52YXIgU2VnbWVudCAgICAgICAgID0gcmVxdWlyZShcIi4vU2VnbWVudC5qc1wiKS5TZWdtZW50XG52YXIgcmVuZGVyX2xvd2xldmVsID0gcmVxdWlyZShcIi4uL3JlbmRlci9yZW5kZXJfbG93bGV2ZWwuanNcIik7XG52YXIgY29sb3JNYXAgICAgICAgID0gcmVxdWlyZShcIi4uL2NvbG9ybWFwLmpzXCIpO1xuXG5jbGFzcyBTZWdtZW50X0FyYyBleHRlbmRzIFNlZ21lbnRcbntcbiAgICBjb25zdHJ1Y3RvcihpUENCX0pTT05fU2VnbWVudClcbiAgICB7XG4gICAgICAgIHN1cGVyKGlQQ0JfSlNPTl9TZWdtZW50KTtcbiAgICAgICAgdGhpcy5jZW50ZXJQb2ludCA9IG5ldyBQb2ludChpUENCX0pTT05fU2VnbWVudC5jeDAsIGlQQ0JfSlNPTl9TZWdtZW50LmN5MCk7XG4gICAgICAgIHRoaXMubGF5ZXIgICAgICAgPSBpUENCX0pTT05fU2VnbWVudC5sYXllcjtcbiAgICAgICAgdGhpcy5yYWRpdXMgICAgICA9IGlQQ0JfSlNPTl9TZWdtZW50LnJhZGl1cztcbiAgICAgICAgdGhpcy5hbmdsZTAgICAgICA9IGlQQ0JfSlNPTl9TZWdtZW50LmFuZ2xlMDtcbiAgICAgICAgdGhpcy5hbmdsZTEgICAgICA9IGlQQ0JfSlNPTl9TZWdtZW50LmFuZ2xlMTtcbiAgICAgICAgdGhpcy53aWR0aCAgICAgICA9IGlQQ0JfSlNPTl9TZWdtZW50LndpZHRoO1xuICAgICAgICB0aGlzLmRpcmVjdGlvbiAgID0gaVBDQl9KU09OX1NlZ21lbnQuZGlyZWN0aW9uO1xuICAgIH1cblxuICAgIFJlbmRlcihndWlDb250ZXh0LCBzY2FsZWZhY3RvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xuXG4gICAgICAgIGxldCByZW5kZXJPcHRpb25zID0geyBcbiAgICAgICAgICAgIGNvbG9yICAgIDogY29sb3JNYXAuR2V0VHJhY2VDb2xvcih0aGlzLmxheWVyKSxcbiAgICAgICAgICAgIGZpbGwgICAgIDogZmFsc2UsXG4gICAgICAgICAgICBsaW5lV2lkdGg6IE1hdGgubWF4KDEgLyBzY2FsZWZhY3RvciwgdGhpcy53aWR0aCksXG4gICAgICAgICAgICBsaW5lQ2FwICA6IFwicm91bmRcIiBcbiAgICAgICAgfTtcblxuICAgICAgICByZW5kZXJfbG93bGV2ZWwuQXJjKCBcbiAgICAgICAgICAgIGd1aUNvbnRleHQsXG4gICAgICAgICAgICB0aGlzLmNlbnRlclBvaW50LFxuICAgICAgICAgICAgdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICB0aGlzLmFuZ2xlMCxcbiAgICAgICAgICAgIHRoaXMuYW5nbGUxLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuXG4gICAgICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xuICAgIH1cblxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBTZWdtZW50X0FyY1xufTtcblxuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBQb2ludCAgICAgICAgICAgPSByZXF1aXJlKFwiLi4vcmVuZGVyL3BvaW50LmpzXCIpLlBvaW50XG52YXIgU2VnbWVudCAgICAgICAgID0gcmVxdWlyZShcIi4vU2VnbWVudC5qc1wiKS5TZWdtZW50XG52YXIgcmVuZGVyX2xvd2xldmVsID0gcmVxdWlyZShcIi4uL3JlbmRlci9yZW5kZXJfbG93bGV2ZWwuanNcIik7XG52YXIgY29sb3JNYXAgICAgICAgID0gcmVxdWlyZShcIi4uL2NvbG9ybWFwLmpzXCIpO1xuXG5jbGFzcyBTZWdtZW50X0xpbmUgZXh0ZW5kcyBTZWdtZW50XG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1NlZ21lbnQpXG4gICAge1xuICAgICAgICBzdXBlcihpUENCX0pTT05fU2VnbWVudCk7XG4gICAgICAgIHRoaXMuc3RhcnRQb2ludCAgPSBuZXcgUG9pbnQoaVBDQl9KU09OX1NlZ21lbnQueDAsIGlQQ0JfSlNPTl9TZWdtZW50LnkwKTtcbiAgICAgICAgdGhpcy5lbmRQb2ludCAgICA9IG5ldyBQb2ludChpUENCX0pTT05fU2VnbWVudC54MSwgaVBDQl9KU09OX1NlZ21lbnQueTEpO1xuICAgICAgICB0aGlzLmxheWVyICAgICAgID0gaVBDQl9KU09OX1NlZ21lbnQubGF5ZXI7XG4gICAgICAgIHRoaXMud2lkdGggICAgICAgPSBpUENCX0pTT05fU2VnbWVudC53aWR0aDtcbiAgICB9XG5cbiAgICBSZW5kZXIoZ3VpQ29udGV4dCwgc2NhbGVmYWN0b3IpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LnNhdmUoKTtcblxuICAgICAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNvbG9yICAgIDogY29sb3JNYXAuR2V0VHJhY2VDb2xvcih0aGlzLmxheWVyKSxcbiAgICAgICAgICAgIGZpbGwgICAgIDogZmFsc2UsXG4gICAgICAgICAgICBsaW5lV2lkdGg6IE1hdGgubWF4KDEgLyBzY2FsZWZhY3RvciwgdGhpcy53aWR0aCksXG4gICAgICAgICAgICBsaW5lQ2FwICA6IFwicm91bmRcIlxuICAgICAgICB9O1xuXG4gICAgICAgIHJlbmRlcl9sb3dsZXZlbC5MaW5lKFxuICAgICAgICAgICAgZ3VpQ29udGV4dCxcbiAgICAgICAgICAgIHRoaXMuc3RhcnRQb2ludCxcbiAgICAgICAgICAgIHRoaXMuZW5kUG9pbnQsXG4gICAgICAgICAgICByZW5kZXJPcHRpb25zXG4gICAgICAgICk7XG5cbiAgICAgICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBTZWdtZW50X0xpbmVcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBQb2ludCAgICAgICAgPSByZXF1aXJlKFwiLi4vcmVuZGVyL3BvaW50LmpzXCIpLlBvaW50XG52YXIgU2VnbWVudCAgICAgID0gcmVxdWlyZShcIi4vU2VnbWVudC5qc1wiKS5TZWdtZW50XG52YXIgU2VnbWVudF9BcmMgID0gcmVxdWlyZShcIi4vU2VnbWVudF9BcmMuanNcIikuU2VnbWVudF9BcmNcbnZhciBTZWdtZW50X0xpbmUgPSByZXF1aXJlKFwiLi9TZWdtZW50X0xpbmUuanNcIikuU2VnbWVudF9MaW5lXG52YXIgY29sb3JNYXAgICAgID0gcmVxdWlyZShcIi4uL2NvbG9ybWFwLmpzXCIpO1xudmFyIHJlbmRlcl9sb3dsZXZlbCA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xuXG5jbGFzcyBTZWdtZW50X1BvbHlnb24gZXh0ZW5kcyBTZWdtZW50XG57XG4gICAgY29uc3RydWN0b3IoaVBDQl9KU09OX1BvbHlnb24pXG4gICAge1xuICAgICAgICBzdXBlcihpUENCX0pTT05fUG9seWdvbik7XG4gICAgICAgIHRoaXMudmVydGljZXMgPSBbXTtcbiAgICAgICAgdGhpcy5wb3NpdGl2ZSA9IGlQQ0JfSlNPTl9Qb2x5Z29uLnBvc2l0aXZlO1xuICAgICAgICB0aGlzLmxheWVyID0gaVBDQl9KU09OX1BvbHlnb24ubGF5ZXI7XG4gICAgICAgIFxuICAgICAgICBmb3IobGV0IHNlZ21lbnQgb2YgaVBDQl9KU09OX1BvbHlnb24uc2VnbWVudHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmKHNlZ21lbnQudHlwZSA9PSBcImFyY1wiKVxuICAgICAgICAgICAge1xuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmKHNlZ21lbnQudHlwZSA9PSBcImxpbmVcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAgICBGb2xsb3dpbmcgb25seSB3b3JrcyBmb3IgZWFnbGUgYXMgcG9seWdvbnMgYXJlIGNvbXBvc2VkIHNvbGVseSBvZiBcbiAgICAgICAgICAgICAgICAgICAgbGluZXMuIElmIHRoaXMgaXMgbm90IHRydWUgdGhlbiB0aGUgdmVydGljaWVzIGFycmF5IG11c3QgYmUgbW9kaWZpZWQuXG4gICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBsZXQgcG9pbnQxID0gKHNlZ21lbnQueDAsIHNlZ21lbnQueDEpO1xuICAgICAgICAgICAgICAgIHRoaXMudmVydGljZXMucHVzaChwb2ludDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRVJST1I6IFVuc3VwcG9ydGVkIHBvbHlnb24gc2VnbWVudCB0eXBlLCBcIiwgc2VnbWVudC50eXBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgUmVuZGVyKGd1aUNvbnRleHQsIHNjYWxlZmFjdG9yKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5zYXZlKCk7XG5cbiAgICAgICAgbGV0IGNvbXBvc2l0aW9uVHlwZSA9ICh0aGlzLnBvc2l0aXZlKSA/IFwic291cmNlLW92ZXJcIiA6IFwiZGVzdGluYXRpb24tb3V0XCI7XG4gICAgICAgIGxldCByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IGNvbG9yTWFwLkdldFRyYWNlQ29sb3IodGhpcy5sYXllciksXG4gICAgICAgICAgICBmaWxsOiB0cnVlLFxuICAgICAgICAgICAgY29tcG9zaXRpb25UeXBlOiBjb21wb3NpdGlvblR5cGVcbiAgICAgICAgfTtcblxuICAgICAgICByZW5kZXJfbG93bGV2ZWwuSXJyZWd1bGFyUG9seWdvbihcbiAgICAgICAgICAgIGd1aUNvbnRleHQsXG4gICAgICAgICAgICB0aGlzLnZlcnRpY2VzLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuICAgICAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFNlZ21lbnRfUG9seWdvblxufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBvaW50ICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi4vcmVuZGVyL3BvaW50LmpzXCIpLlBvaW50XG52YXIgU2VnbWVudCAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL1NlZ21lbnQuanNcIikuU2VnbWVudFxudmFyIEdldFBvbHlnb25WZXJ0aWNpZXMgPSByZXF1aXJlKFwiLi9IZWxwZXIuanNcIikuR2V0UG9seWdvblZlcnRpY2llcztcbnZhciByZW5kZXJfbG93bGV2ZWwgPSByZXF1aXJlKFwiLi4vcmVuZGVyL3JlbmRlcl9sb3dsZXZlbC5qc1wiKTtcbnZhciBjb2xvck1hcCAgICAgICAgICAgID0gcmVxdWlyZShcIi4uL2NvbG9ybWFwLmpzXCIpO1xuXG5jbGFzcyBTZWdtZW50X1ZpYV9PY3RhZ29uIGV4dGVuZHMgU2VnbWVudFxue1xuICAgIGNvbnN0cnVjdG9yKGlQQ0JfSlNPTl9TZWdtZW50KVxuICAgIHtcbiAgICAgICAgc3VwZXIoaVBDQl9KU09OX1NlZ21lbnQpO1xuXG4gICAgICAgIHRoaXMuY2VudGVyUG9pbnQgICA9IG5ldyBQb2ludChpUENCX0pTT05fU2VnbWVudC54LCBpUENCX0pTT05fU2VnbWVudC55KTtcbiAgICAgICAgdGhpcy5kaWFtZXRlciAgICAgID0gaVBDQl9KU09OX1NlZ21lbnQuZGlhbWV0ZXI7XG4gICAgICAgIHRoaXMuZHJpbGxEaWFtZXRlciA9IGlQQ0JfSlNPTl9TZWdtZW50LmRyaWxsO1xuICAgICAgICB0aGlzLnZlcnRpY2llcyAgICAgPSBHZXRQb2x5Z29uVmVydGljaWVzKGlQQ0JfSlNPTl9TZWdtZW50LmRpYW1ldGVyLzIsIDgpO1xuICAgICAgICB0aGlzLmxheWVyICAgICAgID0gaVBDQl9KU09OX1NlZ21lbnQubGF5ZXI7XG4gICAgfVxuXG4gICAgUmVuZGVyKGd1aUNvbnRleHQsIHNjYWxlZmFjdG9yKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5zYXZlKCk7XG4gICAgICAgIFxuICAgICAgICBsZXQgYW5nbGUgPSAoNDUvMik7XG5cbiAgICAgICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxuICAgICAgICAgICAgY29sb3I6IGNvbG9yTWFwLkdldFZpYUNvbG9yKCksXG4gICAgICAgICAgICBmaWxsOiB0cnVlLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJlbmRlcl9sb3dsZXZlbC5SZWd1bGFyUG9seWdvbiggXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgdGhpcy5jZW50ZXJQb2ludCwgXG4gICAgICAgICAgICB0aGlzLnZlcnRpY2llcyxcbiAgICAgICAgICAgIGFuZ2xlLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIERyYXcgZHJpbGwgaG9sZVxuICAgICAgICByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IGNvbG9yTWFwLkdldERyaWxsQ29sb3IoKSxcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZSggXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgdGhpcy5jZW50ZXJQb2ludCxcbiAgICAgICAgICAgIHRoaXMuZHJpbGxEaWFtZXRlci8yLCBcbiAgICAgICAgICAgIHJlbmRlck9wdGlvbnNcbiAgICAgICAgKTsgXG5cbiAgICAgICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBTZWdtZW50X1ZpYV9PY3RhZ29uXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBQb2ludCAgICA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcG9pbnQuanNcIikuUG9pbnRcbnZhciBTZWdtZW50ICA9IHJlcXVpcmUoXCIuL1NlZ21lbnQuanNcIikuU2VnbWVudFxudmFyIHJlbmRlcl9sb3dsZXZlbCA9IHJlcXVpcmUoXCIuLi9yZW5kZXIvcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xudmFyIGNvbG9yTWFwID0gcmVxdWlyZShcIi4uL2NvbG9ybWFwLmpzXCIpO1xuXG5jbGFzcyBTZWdtZW50X1ZpYV9Sb3VuZCBleHRlbmRzIFNlZ21lbnRcbntcbiAgICBjb25zdHJ1Y3RvcihpUENCX0pTT05fU2VnbWVudClcbiAgICB7XG4gICAgICAgIHN1cGVyKGlQQ0JfSlNPTl9TZWdtZW50KTtcbiAgICAgICAgdGhpcy5jZW50ZXJQb2ludCAgICAgICAgPSBuZXcgUG9pbnQoaVBDQl9KU09OX1NlZ21lbnQueCwgaVBDQl9KU09OX1NlZ21lbnQueSk7XG4gICAgICAgIHRoaXMuZGlhbWV0ZXIgICAgICAgICAgID0gaVBDQl9KU09OX1NlZ21lbnQuZGlhbWV0ZXI7XG4gICAgICAgIHRoaXMuZHJpbGxEaWFtZXRlciAgICAgID0gaVBDQl9KU09OX1NlZ21lbnQuZHJpbGw7XG4gICAgICAgIHRoaXMubGF5ZXIgICAgICAgPSBpUENCX0pTT05fU2VnbWVudC5sYXllcjtcbiAgICB9XG5cbiAgICBSZW5kZXIoZ3VpQ29udGV4dCwgc2NhbGVmYWN0b3IpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LnNhdmUoKTtcbiAgICAgICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjb2xvcjogY29sb3JNYXAuR2V0VmlhQ29sb3IoKSxcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZSggXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgdGhpcy5jZW50ZXJQb2ludCxcbiAgICAgICAgICAgIHRoaXMuZGlhbWV0ZXIvMiwgXG4gICAgICAgICAgICByZW5kZXJPcHRpb25zXG4gICAgICAgICk7IFxuICAgICAgICBcbiAgICAgICAgLy8gRHJhdyBkcmlsbCBob2xlXG4gICAgICAgIHJlbmRlck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjb2xvcjogY29sb3JNYXAuR2V0RHJpbGxDb2xvcigpLFxuICAgICAgICAgICAgZmlsbDogdHJ1ZSxcbiAgICAgICAgfTtcblxuICAgICAgICByZW5kZXJfbG93bGV2ZWwuQ2lyY2xlKCBcbiAgICAgICAgICAgIGd1aUNvbnRleHQsXG4gICAgICAgICAgICB0aGlzLmNlbnRlclBvaW50LFxuICAgICAgICAgICAgdGhpcy5kcmlsbERpYW1ldGVyLzIsIFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApOyBcblxuICAgICAgICAvLyBSZXN0b3JlcyBjb250ZXh0IHRvIHN0YXRlIHByaW9yIHRvIHRoaXMgcmVuZGVyaW5nIGZ1bmN0aW9uIGJlaW5nIGNhbGxlZC4gXG4gICAgICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgU2VnbWVudF9WaWFfUm91bmRcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBQb2ludCAgICAgICAgICAgICAgID0gcmVxdWlyZShcIi4uL3JlbmRlci9wb2ludC5qc1wiKS5Qb2ludFxudmFyIFNlZ21lbnQgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9TZWdtZW50LmpzXCIpLlNlZ21lbnRcbnZhciBHZXRQb2x5Z29uVmVydGljaWVzID0gcmVxdWlyZShcIi4vSGVscGVyLmpzXCIpLkdldFBvbHlnb25WZXJ0aWNpZXM7XG52YXIgcmVuZGVyX2xvd2xldmVsID0gcmVxdWlyZShcIi4uL3JlbmRlci9yZW5kZXJfbG93bGV2ZWwuanNcIik7XG52YXIgY29sb3JNYXAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuLi9jb2xvcm1hcC5qc1wiKTtcblxuY2xhc3MgU2VnbWVudF9WaWFfU3F1YXJlIGV4dGVuZHMgU2VnbWVudFxue1xuICAgIGNvbnN0cnVjdG9yKGlQQ0JfSlNPTl9TZWdtZW50KVxuICAgIHtcbiAgICAgICAgc3VwZXIoaVBDQl9KU09OX1NlZ21lbnQpO1xuICAgICAgICB0aGlzLmNlbnRlclBvaW50ICAgID0gbmV3IFBvaW50KGlQQ0JfSlNPTl9TZWdtZW50LngsIGlQQ0JfSlNPTl9TZWdtZW50LnkpO1xuICAgICAgICB0aGlzLmRpYW1ldGVyICAgICAgID0gaVBDQl9KU09OX1NlZ21lbnQuZGlhbWV0ZXI7XG4gICAgICAgIHRoaXMuZHJpbGxEaWFtZXRlciAgPSBpUENCX0pTT05fU2VnbWVudC5kcmlsbDtcbiAgICAgICAgdGhpcy52ZXJ0aWNpZXMgICAgICA9IEdldFBvbHlnb25WZXJ0aWNpZXMoaVBDQl9KU09OX1NlZ21lbnQuZGlhbWV0ZXIvMiwgNCk7XG4gICAgICAgIHRoaXMubGF5ZXIgICAgICAgPSBpUENCX0pTT05fU2VnbWVudC5sYXllcjtcbiAgICB9XG5cbiAgICBSZW5kZXIoZ3VpQ29udGV4dCwgc2NhbGVmYWN0b3IpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LnNhdmUoKTtcblxuICAgICAgICAvLyBUaGlzIGlzIG5lZWRlZCBpbiBvcmRlciBzbyB0aGF0IHRoZSBzaGFwZSBpcyByZW5kZXJlZCB3aXRoIGNvcnJlY3Qgb3JpZW50YXRpb24sIGllIHRvcCBvZiBcbiAgICAgICAgLy8gc2hhcGUgaXMgcGFyYWxsZWwgdG8gdG9wIGFuZCBib3R0b20gb2YgdGhlIGRpc3BsYXkuXG4gICAgICAgIGxldCBhbmdsZSA9IDQ1O1xuXG4gICAgICAgIGxldCByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IGNvbG9yTWFwLkdldFZpYUNvbG9yKCksXG4gICAgICAgICAgICBmaWxsOiB0cnVlLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJlbmRlcl9sb3dsZXZlbC5SZWd1bGFyUG9seWdvbiggXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgdGhpcy5jZW50ZXJQb2ludCwgXG4gICAgICAgICAgICB0aGlzLnZlcnRpY2llcyxcbiAgICAgICAgICAgIGFuZ2xlLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9uc1xuICAgICAgICApO1xuXG4gICAgICAgIC8vIERyYXcgZHJpbGwgaG9sZVxuICAgICAgICByZW5kZXJPcHRpb25zID0ge1xuICAgICAgICAgICAgY29sb3I6IGNvbG9yTWFwLkdldERyaWxsQ29sb3IoKSxcbiAgICAgICAgICAgIGZpbGw6IHRydWUsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZSggXG4gICAgICAgICAgICBndWlDb250ZXh0LFxuICAgICAgICAgICAgdGhpcy5jZW50ZXJQb2ludCxcbiAgICAgICAgICAgIHRoaXMuZHJpbGxEaWFtZXRlci8yLCBcbiAgICAgICAgICAgIHJlbmRlck9wdGlvbnNcbiAgICAgICAgKTtcblxuICAgICAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFNlZ21lbnRfVmlhX1NxdWFyZVxufTsiLCJcInVzZSBzdHJpY3RcIjtcblxuY2xhc3MgUGFydCB7XG4gICAgY29uc3RydWN0b3IodmFsdWUsIGZvb3RwcmludCwgcmVmZXJlbmNlLCBsb2NhdGlvbiwgYXR0cmlidXRlcywgY2hlY2tib3hlcylcbiAgICB7XG4gICAgICAgIHRoaXMucXVhbnRpdHkgICA9IDE7XG4gICAgICAgIHRoaXMudmFsdWUgICAgICA9IHZhbHVlO1xuICAgICAgICB0aGlzLmZvb3JwdGludCAgPSBmb290cHJpbnQ7XG4gICAgICAgIHRoaXMucmVmZXJlbmNlICA9IHJlZmVyZW5jZTtcbiAgICAgICAgdGhpcy5sb2NhdGlvbiAgID0gbG9jYXRpb247XG4gICAgICAgIHRoaXMuYXR0cmlidXRlcyA9IGF0dHJpYnV0ZXM7XG4gICAgICAgIC8vIFRPRE86IENoZWNrYm94IHNob3VsZCBiZSBwYXJ0IG9mIGJvbV90YWJsZSBhbmQgbm90IHBhdFxuICAgICAgICB0aGlzLmNoZWNrYm94ZXMgPSBjaGVja2JveGVzO1xuICAgIH1cblxuICAgIENvcHlQYXJ0KClcbiAgICB7XG4gICAgICAgIC8vIFhYWDogVGhpcyBpcyBub3QgcGVyZm9ybWluZyBhIGRlZXAgY29weSwgYXR0cmlidXRlcyBpcyBhIG1hcCBhbmQgdGhpcyBpcyBiZWluZyBjb3BpZWQgYnkgXG4gICAgICAgIC8vICAgICAgcmVmZXJlbmNlIHdoaWNoIGlzIG5vdCBxdWl0ZSB3aGF0IHdlIHdhbnQgaGVyZS4gSXQgc2hvdWxkIGJlIGEgZGVlcCBjb3B5IHNvIG9uY2UgY2FsbGVkXG4gICAgICAgIC8vICAgICAgdGhpcyB3aWxsIHJlc3VsdCBpbiBhIGNvbXBsZXRlbHkgbmV3IG9iamVjdCB0aGF0IHdpbGwgbm90IHJlZmVyZW5jZSBvbmUgYW5vdGhlclxuICAgICAgICByZXR1cm4gbmV3IFBhcnQodGhpcy52YWx1ZSwgdGhpcy5wYWNrYWdlLCB0aGlzLnJlZmVyZW5jZSwgdGhpcy5sb2NhdGlvbiwgdGhpcy5hdHRyaWJ1dGVzLCB0aGlzLmNoZWNrYm94ZXMpO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUGFydFxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgcGNiICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3BjYi5qc1wiKTtcbnZhciBnbG9iYWxEYXRhICAgICAgID0gcmVxdWlyZShcIi4vZ2xvYmFsLmpzXCIpO1xudmFyIGxheWVyX3RhYmxlICAgICAgPSByZXF1aXJlKFwiLi9sYXllcl90YWJsZS5qc1wiKTtcbnZhciB0cmFjZV90YWJsZSAgICAgID0gcmVxdWlyZShcIi4vdHJhY2VfdGFibGUuanNcIik7XG52YXIgdGVzdHBvaW50X3RhYmxlICAgICAgPSByZXF1aXJlKFwiLi90ZXN0cG9pbnRfdGFibGUuanNcIik7XG52YXIgVGFibGVfTGF5ZXJFbnRyeSA9IHJlcXVpcmUoXCIuL3JlbmRlci9UYWJsZV9MYXllckVudHJ5LmpzXCIpLlRhYmxlX0xheWVyRW50cnlcblxuXG5cbmZ1bmN0aW9uIHBvcHVsYXRlUmlnaHRTaWRlU2NyZWVuVGFibGUoKVxue1xuICAgIGxldCByaWdodFNpZGVUYWJsZV9MYXllclRhYmxlQm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXJfdGFibGVcIik7XG4gICAgcmlnaHRTaWRlVGFibGVfTGF5ZXJUYWJsZUJvZHkucmVtb3ZlQXR0cmlidXRlKFwiaGlkZGVuXCIpO1xuXG4gICAgLy9sZXQgcmlnaHRTaWRlVGFibGVfVHJhY2VUYWJsZUJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRyYWNlYm9keVwiKTtcbiAgICAvL3JpZ2h0U2lkZVRhYmxlX1RyYWNlVGFibGVCb2R5LnJlbW92ZUF0dHJpYnV0ZShcImhpZGRlblwiKTtcblxuICAgIGxheWVyX3RhYmxlLnBvcHVsYXRlTGF5ZXJUYWJsZSgpO1xuICAgIHRyYWNlX3RhYmxlLnBvcHVsYXRlVHJhY2VUYWJsZSgpO1xuICAgIHRlc3Rwb2ludF90YWJsZS5wb3B1bGF0ZVRlc3RQb2ludFRhYmxlKCk7XG59XG5cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgIHBvcHVsYXRlUmlnaHRTaWRlU2NyZWVuVGFibGVcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcbnZhciBnbG9iYWxEYXRhID0gcmVxdWlyZShcIi4vZ2xvYmFsLmpzXCIpO1xudmFyIHBjYiAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XG52YXIgcmVuZGVyICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlci5qc1wiKTtcblxuZnVuY3Rpb24gY3JlYXRlQ2hlY2tib3hDaGFuZ2VIYW5kbGVyKGNoZWNrYm94LCBib21lbnRyeSlcbntcbiAgICByZXR1cm4gZnVuY3Rpb24oZXZlbnQpXG4gICAge1xuICAgICAgICBpZihib21lbnRyeS5jaGVja2JveGVzLmdldChjaGVja2JveCkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGJvbWVudHJ5LmNoZWNrYm94ZXMuc2V0KGNoZWNrYm94LGZhbHNlKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiY2hlY2tib3hcIiArIFwiX1wiICsgY2hlY2tib3gudG9Mb3dlckNhc2UoKSArIFwiX1wiICsgYm9tZW50cnkucmVmZXJlbmNlLCBcImZhbHNlXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgYm9tZW50cnkuY2hlY2tib3hlcy5zZXQoY2hlY2tib3gsdHJ1ZSk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImNoZWNrYm94XCIgKyBcIl9cIiArIGNoZWNrYm94LnRvTG93ZXJDYXNlKCkgKyBcIl9cIiArIGJvbWVudHJ5LnJlZmVyZW5jZSwgXCJ0cnVlXCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFNhdmUgY3VycmVudGx5IGhpZ2hsaXRlZCByb3dcbiAgICAgICAgbGV0IHJvd2lkID0gZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpO1xuICAgICAgICAvLyBSZWRyYXcgdGhlIGNhbnZhc1xuICAgICAgICByZW5kZXIuUmVuZGVyUENCKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgICAgICByZW5kZXIuUmVuZGVyUENCKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XG4gICAgICAgIC8vIFJlZHJhdyB0aGUgQk9NIHRhYmxlXG4gICAgICAgIHBvcHVsYXRlQm9tVGFibGUoKTtcbiAgICAgICAgLy8gUmVuZGVyIGN1cnJlbnQgcm93IHNvIGl0cyBoaWdobGlnaHRlZFxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChyb3dpZCkuY2xhc3NMaXN0LmFkZChcImhpZ2hsaWdodGVkXCIpO1xuICAgICAgICAvLyBTZXQgY3VycmVudCBzZWxlY3RlZCByb3cgZ2xvYmFsIHZhcmlhYmxlXG4gICAgICAgIGlmKGV2ZW50LmN0cmxLZXkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQocm93aWQsIHRydWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZChyb3dpZCwgZmFsc2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgaGlnaGxpZ2h0ZWQgdGhlbiBhIHNwZWNpYWwgY29sb3Igd2lsbCBiZSB1c2VkIGZvciB0aGUgcGFydC5cbiAgICAgICAgcmVuZGVyLmRyYXdIaWdobGlnaHRzKElzQ2hlY2tib3hDbGlja2VkKGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKSwgXCJwbGFjZWRcIikpO1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIElzQ2hlY2tib3hDbGlja2VkKGJvbXJvd2lkLCBjaGVja2JveG5hbWUpXG57XG4gICAgbGV0IGNoZWNrYm94bnVtID0gMDtcbiAgICB3aGlsZSAoY2hlY2tib3hudW0gPCBnbG9iYWxEYXRhLmdldENoZWNrYm94ZXMoKS5sZW5ndGggJiYgZ2xvYmFsRGF0YS5nZXRDaGVja2JveGVzKClbY2hlY2tib3hudW1dLnRvTG93ZXJDYXNlKCkgIT0gY2hlY2tib3huYW1lLnRvTG93ZXJDYXNlKCkpXG4gICAge1xuICAgICAgICBjaGVja2JveG51bSsrO1xuICAgIH1cbiAgICBpZiAoIWJvbXJvd2lkIHx8IGNoZWNrYm94bnVtID49IGdsb2JhbERhdGEuZ2V0Q2hlY2tib3hlcygpLmxlbmd0aClcbiAgICB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IGJvbXJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGJvbXJvd2lkKTtcbiAgICBsZXQgY2hlY2tib3ggPSBib21yb3cuY2hpbGROb2Rlc1tjaGVja2JveG51bSArIDFdLmNoaWxkTm9kZXNbMF07XG4gICAgcmV0dXJuIGNoZWNrYm94LmNoZWNrZWQ7XG59XG5cbmZ1bmN0aW9uIGNsZWFyQk9NVGFibGUoKVxue1xuICAgIGxldCBib20gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbWJvZHlcIik7XG5cbiAgICB3aGlsZSAoYm9tLmZpcnN0Q2hpbGQpXG4gICAge1xuICAgICAgICBib20ucmVtb3ZlQ2hpbGQoYm9tLmZpcnN0Q2hpbGQpO1xuICAgIH1cbn1cblxuLypcbiAgICBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9zb3J0XG5cbiAgICBKUyB0cmVhdHMgdmFsdWVzIGluIGNvbXBhcmUgYXMgc3RyaW5ncyBieSBkZWZhdWx0XG4gICAgc28gbmVlZCB0byB1c2UgYSBmdW5jdGlvbiB0byBzb3J0IG51bWVyaWNhbGx5LlxuKi9cbmZ1bmN0aW9uIE51bWVyaWNDb21wYXJlKGEsYilcbntcbiAgICByZXR1cm4gKGEgLSBiKTtcbn1cblxuLypcbiAgICBUYWtlcyBhcyBhbiBhcmd1bWVudCBhIGxpc3Qgb2YgcmVmZXJlbmNlIGRlc2lnbmF0aW9ucy5cbiovXG5mdW5jdGlvbiBDb252ZXJ0UmVmZXJlbmNlRGVzaWduYXRvcnNUb1JhbmdlcyhSZWZlcmVuY2VEZXNpZ25hdGlvbnMpXG57XG4gICAgLypcbiAgICAgICAgRXh0cmFjdCByZWZlcmVuY2UgZGVzaWduYXRpb24gZnJvbSB0aGUgbGlzdC5cbiAgICAgICAgSXQgaXMgYXNzdW1lZCB0aGUgcmVmZXJlbmNlIGRlc2lnbmF0aW9uIGlzICB0ZWggc2FtZSBhY3Jvc3MgYWxsXG4gICAgICAgIGluIHRoZSBpbnB1dCBsaXN0LlxuXG4gICAgICAgIEluIGFkZGl0aW9uIGFsc28gZXh0cmFjdCB0aGUgbnVtZXJpYyB2YWx1ZSBpbiBhIHNlcGFyYXRlIGxpc3QuXG4gICAgKi9cbiAgICBsZXQgbnVtYmVycyAgICA9IFJlZmVyZW5jZURlc2lnbmF0aW9ucy5tYXAoeCA9PiBwYXJzZUludCh4LnNwbGl0KC8oXFxkKyQpLylbMV0sMTApKTtcbiAgICAvLyBPbmx5IGV4dHJhY3QgcmVmZXJlbmNlIGRlc2lnbmF0aW9uIGZyb20gZmlyc3QgZWxlbWVudCBhcyBhbGwgb3RoZXJzIGFyZSBhc3N1bWVkIHRvIGJlIGVxdWFsLlxuICAgIGxldCBkZXNpZ25hdG9yID0gUmVmZXJlbmNlRGVzaWduYXRpb25zWzBdLnNwbGl0KC8oXFxkKyQpLylbMF07XG5cbiAgICAvKlxuICAgICAgICBTb3J0IGFsbCBudW1iZXJzIHRvIGJlIGluY3JlYXNpbmdcbiAgICAqL1xuICAgIG51bWJlcnMuc29ydChOdW1lcmljQ29tcGFyZSk7XG5cbiAgICAvKlxuICAgICAgICBGb2xsb3dpbmcgY29kZSB3YXMgYWRhcHRlZCBmcm9tIEtpQ29zdCBwcm9qZWN0LiBDb2RlIHBvcnRlZCB0byBKYXZhU2NyaXB0IGZyb20gUHl0aG9uLlxuICAgICAgICBSZW1vdmVkIGEgY2hlY2sgZm9yIHN1YiBwYXJ0cyBhcyBpUENCIGRlYWxzIHdpdGggcGFydHMgZnJvbSBhIFBDQiBwZXJzcGVjdGl2ZSBhbmQgbm90XG4gICAgICAgIHNjaGVtYXRpYyBwZXJzcGVjdGl2ZSwgdGhpcyBkbyBub3QgbmVlZCBzdWIgcGFydCBjaGVja2luZy5cbiAgICAqL1xuXG4gICAgLy8gTm8gcmFuZ2VzIGZvdW5kIHlldCBzaW5jZSB3ZSBqdXN0IHN0YXJ0ZWQuXG4gICAgbGV0IHJhbmdlZFJlZmVyZW5jZURlc2lnbmF0aW9ucyA9IFtdO1xuICAgIC8vIEZpcnN0IHBvc3NpYmxlIHJhbmdlIGlzIGF0IHRoZSBzdGFydCBvZiB0aGUgbGlzdCBvZiBudW1iZXJzLlxuICAgIGxldCByYW5nZVN0YXJ0ID0gMDtcblxuICAgIC8vIEdvIHRocm91Z2ggbGlzdCBvZiBudW1iZXJzIGxvb2tpbmcgZm9yIDMgb3IgbW9yZSBzZXF1ZW50aWFsIG51bWJlcnMuXG4gICAgd2hpbGUocmFuZ2VTdGFydCA8IG51bWJlcnMubGVuZ3RoKVxuICAgIHtcbiAgICAgICAgLy8gQ3VycmVudCByYW5nZSBzdGFydHMgb2ZmIGFzIGEgc2luZ2xlIG51bWJlci5cbiAgICAgICAgbGV0IG51bVJhbmdlID0gbnVtYmVyc1tyYW5nZVN0YXJ0XVxuICAgICAgICAvLyBUaGUgbmV4dCBwb3NzaWJsZSBzdGFydCBvZiBhIHJhbmdlLlxuICAgICAgICBsZXQgbmV4dFJhbmdlU3RhcnQgPSByYW5nZVN0YXJ0ICsgMTtcblxuICAgICAgICAvLyBMb29rIGZvciBzZXF1ZW5jZXMgb2YgdGhyZWUgb3IgbW9yZSBzZXF1ZW50aWFsIG51bWJlcnMuXG4gICAgICAgIGZvcihsZXQgcmFuZ2VFbmQgPSAocmFuZ2VTdGFydCsyKTsgcmFuZ2VFbmQgPCBudW1iZXJzLmxlbmd0aDsgcmFuZ2VFbmQrKylcbiAgICAgICAge1xuICAgICAgICAgICAgaWYocmFuZ2VFbmQgLSByYW5nZVN0YXJ0ICE9IG51bWJlcnNbcmFuZ2VFbmRdIC0gbnVtYmVyc1tyYW5nZVN0YXJ0XSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAvLyBOb24tc2VxdWVudGlhbCBudW1iZXJzIGZvdW5kLCBzbyBicmVhayBvdXQgb2YgbG9vcC5cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAvLyBPdGhlcndpc2UsIGV4dGVuZCB0aGUgY3VycmVudCByYW5nZS5cbiAgICAgICAgICAgICAgICBudW1SYW5nZSA9IFN0cmluZyhudW1iZXJzW3JhbmdlU3RhcnRdKSArIFwiLVwiICsgU3RyaW5nKG51bWJlcnNbcmFuZ2VFbmRdKVxuICAgICAgICAgICAgICAgIC8vIDMgb3IgbW9yZSBzZXF1ZW50aWFsIG51bWJlcnMgZm91bmQsIHNvIG5leHQgcG9zc2libGUgcmFuZ2UgbXVzdCBzdGFydCBhZnRlciB0aGlzIG9uZS5cbiAgICAgICAgICAgICAgICBuZXh0UmFuZ2VTdGFydCA9IHJhbmdlRW5kICsgMVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFwcGVuZCB0aGUgcmFuZ2UgKG9yIHNpbmdsZSBudW1iZXIpIGp1c3QgZm91bmQgdG8gdGhlIGxpc3Qgb2YgcmFuZ2UuXG4gICAgICAgIHJhbmdlZFJlZmVyZW5jZURlc2lnbmF0aW9ucy5wdXNoKGRlc2lnbmF0b3IgKyBudW1SYW5nZSlcbiAgICAgICAgLy8gUG9pbnQgdG8gdGhlIHN0YXJ0IG9mIHRoZSBuZXh0IHBvc3NpYmxlIHJhbmdlIGFuZCBrZWVwIGxvb2tpbmcuXG4gICAgICAgIHJhbmdlU3RhcnQgPSBuZXh0UmFuZ2VTdGFydFxuICAgIH1cbiAgICByZXR1cm4gcmFuZ2VkUmVmZXJlbmNlRGVzaWduYXRpb25zXG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlQm9tQm9keSgpXG57XG4gICAgbGV0IGJvbSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tYm9keVwiKTtcblxuICAgIGNsZWFyQk9NVGFibGUoKTtcblxuICAgIGdsb2JhbERhdGEuc2V0SGlnaGxpZ2h0SGFuZGxlcnMoW10pO1xuICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQobnVsbCwgZmFsc2UpO1xuXG4gICAgbGV0IGJvbXRhYmxlID0gcGNiLkdldEJPTSgpO1xuXG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tU29ydEZ1bmN0aW9uKCkpXG4gICAge1xuICAgICAgICBib210YWJsZSA9IGJvbXRhYmxlLnNsaWNlKCkuc29ydChnbG9iYWxEYXRhLmdldEJvbVNvcnRGdW5jdGlvbigpKTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpIGluIGJvbXRhYmxlKVxuICAgIHtcbiAgICAgICAgbGV0IGJvbWVudHJ5ID0gYm9tdGFibGVbaV07XG4gICAgICAgIGxldCByZWZlcmVuY2VzID0gQ29udmVydFJlZmVyZW5jZURlc2lnbmF0b3JzVG9SYW5nZXMoYm9tZW50cnkucmVmZXJlbmNlLnNwbGl0KCcsJykpLmpvaW4oJywnKTtcblxuICAgICAgICBsZXQgdHIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVFJcIik7XG4gICAgICAgIGxldCB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgbGV0IHJvd251bSA9ICtpICsgMTtcbiAgICAgICAgdHIuaWQgPSBcImJvbXJvd1wiICsgcm93bnVtO1xuICAgICAgICB0ZC50ZXh0Q29udGVudCA9IHJvd251bTtcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xuXG4gICAgICAgIC8vIENoZWNrYm94ZXNcbiAgICAgICAgbGV0IGFkZGl0aW9uYWxDaGVja2JveGVzID0gZ2xvYmFsRGF0YS5nZXRCb21DaGVja2JveGVzKCkuc3BsaXQoXCIsXCIpO1xuICAgICAgICBmb3IgKGxldCBjaGVja2JveCBvZiBhZGRpdGlvbmFsQ2hlY2tib3hlcylcbiAgICAgICAge1xuICAgICAgICAgICAgY2hlY2tib3ggPSBjaGVja2JveC50cmltKCk7XG4gICAgICAgICAgICBpZiAoY2hlY2tib3gpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XG4gICAgICAgICAgICAgICAgbGV0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICAgICAgICAgIGlucHV0LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgICAgICAgICAgICAgaW5wdXQub25jaGFuZ2UgPSBjcmVhdGVDaGVja2JveENoYW5nZUhhbmRsZXIoY2hlY2tib3gsIGJvbWVudHJ5KTtcbiAgICAgICAgICAgICAgICAvLyByZWFkIHRoZSB2YWx1ZSBpbiBmcm9tIGxvY2FsIHN0b3JhZ2VcblxuICAgICAgICAgICAgICAgIGlmKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hcIiArIFwiX1wiICsgY2hlY2tib3gudG9Mb3dlckNhc2UoKSArIFwiX1wiICsgYm9tZW50cnkucmVmZXJlbmNlICkgPT0gXCJ0cnVlXCIpXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBib21lbnRyeS5jaGVja2JveGVzLnNldChjaGVja2JveCx0cnVlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAvLyBOZWVkZWQgZm9yIHdoZW4gcGFydHMgY29tYmluZWQgYnkgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgaWYoYm9tZW50cnkuY2hlY2tib3hlcy5zZXQgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9tZW50cnkuY2hlY2tib3hlcy5zZXQoY2hlY2tib3gsZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5lZWRlZCBmb3Igd2hlbiBwYXJ0cyBjb21iaW5lZCBieSB2YWx1ZVxuICAgICAgICAgICAgaWYoYm9tZW50cnkuY2hlY2tib3hlcy5nZXQgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgaWYoYm9tZW50cnkuY2hlY2tib3hlcy5nZXQoY2hlY2tib3gpKVxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dC5jaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRkLmFwcGVuZENoaWxkKGlucHV0KTtcbiAgICAgICAgICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZWZlcmVuY2VzXG4gICAgICAgIHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xuICAgICAgICB0ZC5pbm5lckhUTUwgPSByZWZlcmVuY2VzO1xuICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XG5cbiAgICAgICAgLy8gVmFsdWVcbiAgICAgICAgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XG4gICAgICAgIHRkLmlubmVySFRNTCA9IGJvbWVudHJ5LnZhbHVlO1xuICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XG5cbiAgICAgICAgLy8gQXR0cmlidXRlc1xuICAgICAgICBsZXQgYWRkaXRpb25hbEF0dHJpYnV0ZXMgPSBnbG9iYWxEYXRhLmdldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKCkuc3BsaXQoXCIsXCIpO1xuICAgICAgICBmb3IgKGxldCB4IG9mIGFkZGl0aW9uYWxBdHRyaWJ1dGVzKVxuICAgICAgICB7XG4gICAgICAgICAgICB4ID0geC50cmltKClcbiAgICAgICAgICAgIGlmICh4KVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xuICAgICAgICAgICAgICAgIHRkLmlubmVySFRNTCA9cGNiLmdldEF0dHJpYnV0ZVZhbHVlKGJvbWVudHJ5LCB4LnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICAgICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGdsb2JhbERhdGEuZ2V0Q29tYmluZVZhbHVlcygpKVxuICAgICAgICB7XG4gICAgICAgICAgICB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgICAgIHRkLnRleHRDb250ZW50ID0gYm9tZW50cnkucXVhbnRpdHk7XG4gICAgICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgICAgIH1cbiAgICAgICAgYm9tLmFwcGVuZENoaWxkKHRyKTtcblxuXG4gICAgICAgIGJvbS5hcHBlbmRDaGlsZCh0cik7XG4gICAgICAgIGxldCBoYW5kbGVyID0gY3JlYXRlUm93SGlnaGxpZ2h0SGFuZGxlcih0ci5pZCwgcmVmZXJlbmNlcyk7XG5cbiAgICAgICAgIHRyLm9uY2xpY2sgPSBoYW5kbGVyO1xuICAgICAgICAgdHIub25tb3VzZW1vdmUgPSBoYW5kbGVyO1xuICAgICAgICAgZ2xvYmFsRGF0YS5wdXNoSGlnaGxpZ2h0SGFuZGxlcnMoe1xuICAgICAgICAgICAgIGlkOiB0ci5pZCxcbiAgICAgICAgICAgICBoYW5kbGVyOiBoYW5kbGVyLFxuICAgICAgICAgICAgIHJlZnM6IHJlZmVyZW5jZXNcbiAgICAgICAgIH0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlUm93SGlnaGxpZ2h0SGFuZGxlcihyb3dpZCwgcmVmcylcbntcbiAgICByZXR1cm4gZnVuY3Rpb24oZXZlbnQpXG4gICAge1xuICAgICAgICBpZihldmVudC5zaGlmdEtleSB8fCAoZXZlbnQudHlwZSA9PVwiY2xpY2tcIikpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGV2ZW50KVxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICBJZiBjb250cm9sIGtleSBwcmVzc2VkIHByZXNzZWQsIHRoZW4ga2VlcCBvcmlnaW5hbCByb3dzIGhpZ2hsaWdodGVkIGFuZFxuICAgICAgICAgICAgICAgIGhpZ2hsaWdodCBuZXcgc2VsZWN0ZWQgcm93LlxuICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGlmKGV2ZW50LmN0cmxLZXkgKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIC8qIE9ubHkgYXBwZW5kIHRoZSBuZXcgY2lja2VkIG9iamVjdCBpZiBub3QgY3VycmVudGx5IGhpZ2hsaXRlZCAqL1xuICAgICAgICAgICAgICAgIGxldCBhbHJlYWR5U2VsZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAvKiBEaXNhYmxlIGhpZ2hsaWdodCBvbiBhbGwgcm93cyAqL1xuICAgICAgICAgICAgICAgIGxldCBoaWdobGl0ZWRSb3dzID0gZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpXG4gICAgICAgICAgICAgICAgZm9yKGxldCBoaWdobGl0ZWRSb3cgb2YgaGlnaGxpdGVkUm93cylcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVTZWQgaGVyZSBzbyB0aGF0IHRoZSByb3cgaWYgaGlnaGxpZ2h0ZWQgd2lsbCBub3QgaGlnaGxpZ2h0ZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhpZ2hsaXRlZFJvdyA9PSByb3dpZClcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWxyZWFkeVNlbGVjdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmKGFscmVhZHlTZWxlY3RlZCA9PSBmYWxzZSlcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHJvd2lkKS5jbGFzc0xpc3QuYWRkKFwiaGlnaGxpZ2h0ZWRcIik7XG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQocm93aWQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLnNldEhpZ2hsaWdodGVkUmVmcyhyZWZzLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyLmRyYXdIaWdobGlnaHRzKElzQ2hlY2tib3hDbGlja2VkKHJvd2lkLCBcInBsYWNlZFwiKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIC8qIERpc2FibGUgaGlnaGxpZ2h0IG9uIGFsbCByb3dzICovXG4gICAgICAgICAgICAgICAgbGV0IGhpZ2hsaXRlZFJvd3MgPSBnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKClcbiAgICAgICAgICAgICAgICBmb3IobGV0IGhpZ2hsaXRlZFJvdyBvZiBoaWdobGl0ZWRSb3dzKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVVNlZCBoZXJlIHNvIHRoYXQgdGhlIHJvdyBpZiBoaWdobGlnaHRlZCB3aWxsIG5vdCBoaWdobGlnaHRlZFxuICAgICAgICAgICAgICAgICAgICBpZiAoaGlnaGxpdGVkUm93ID09IHJvd2lkKVxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIGRvIG5vdGhpbmdcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGhpZ2hsaXRlZFJvdykuY2xhc3NMaXN0LnJlbW92ZShcImhpZ2hsaWdodGVkXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIEhpZ2hsaWdodCBjdXJyZW50IGNsaWNrZWQgcm93XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQocm93aWQpLmNsYXNzTGlzdC5hZGQoXCJoaWdobGlnaHRlZFwiKTtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLnNldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKHJvd2lkLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRIaWdobGlnaHRlZFJlZnMocmVmcyk7XG4gICAgICAgICAgICAgICAgcmVuZGVyLmRyYXdIaWdobGlnaHRzKElzQ2hlY2tib3hDbGlja2VkKHJvd2lkLCBcInBsYWNlZFwiKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNldEJvbUNoZWNrYm94ZXModmFsdWUpXG57XG4gICAgZ2xvYmFsRGF0YS5zZXRCb21DaGVja2JveGVzKHZhbHVlKTtcbiAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImJvbUNoZWNrYm94ZXNcIiwgdmFsdWUpO1xuICAgIHBvcHVsYXRlQm9tVGFibGUoKTtcbn1cblxuZnVuY3Rpb24gc2V0UmVtb3ZlQk9NRW50cmllcyh2YWx1ZSlcbntcbiAgICBnbG9iYWxEYXRhLnNldFJlbW92ZUJPTUVudHJpZXModmFsdWUpO1xuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwicmVtb3ZlQk9NRW50cmllc1wiLCB2YWx1ZSk7XG4gICAgcG9wdWxhdGVCb21UYWJsZSgpO1xufVxuXG5mdW5jdGlvbiBwb3B1bGF0ZUJvbVRhYmxlKClcbntcbiAgICBwb3B1bGF0ZUJvbUhlYWRlcigpO1xuICAgIHBvcHVsYXRlQm9tQm9keSgpO1xuXG4gICAgICAgIC8qIFJlYWQgZmlsdGVyIHN0cmluZy4gSGlkZSBCT00gZWxlbWVudHMgdGhhdCBkb250IGNpbnRhaW4gc3RyaW5nIGVudHJ5ICovXG4gICAgbGV0IGZpbHRlckJPTSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWZpbHRlclwiKTtcbiAgICBGaWx0ZXIoZmlsdGVyQk9NLnZhbHVlKVxufVxuXG5mdW5jdGlvbiBwb3B1bGF0ZUJvbUhlYWRlcigpXG57XG4gICAgbGV0IGJvbWhlYWQgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9taGVhZFwiKTtcbiAgICB3aGlsZSAoYm9taGVhZC5maXJzdENoaWxkKVxuICAgIHtcbiAgICAgICAgYm9taGVhZC5yZW1vdmVDaGlsZChib21oZWFkLmZpcnN0Q2hpbGQpO1xuICAgIH1cblxuICAgIGxldCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUUlwiKTtcbiAgICBsZXQgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XG4gICAgdGguY2xhc3NMaXN0LmFkZChcIm51bUNvbFwiKTtcbiAgICB0ci5hcHBlbmRDaGlsZCh0aCk7XG5cblxuICAgIGxldCBhZGRpdGlvbmFsQ2hlY2tib3hlcyA9IGdsb2JhbERhdGEuZ2V0Qm9tQ2hlY2tib3hlcygpLnNwbGl0KFwiLFwiKTtcbiAgICBhZGRpdGlvbmFsQ2hlY2tib3hlcyAgICAgPSBhZGRpdGlvbmFsQ2hlY2tib3hlcy5maWx0ZXIoZnVuY3Rpb24oZSl7cmV0dXJuIGV9KTtcbiAgICBnbG9iYWxEYXRhLnNldENoZWNrYm94ZXMoYWRkaXRpb25hbENoZWNrYm94ZXMpO1xuICAgIGZvciAobGV0IHgyIG9mIGFkZGl0aW9uYWxDaGVja2JveGVzKVxuICAgIHtcbiAgICAgICAgLy8gcmVtb3ZlIGJlZ2lubmluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxuICAgICAgICB4MiA9IHgyLnRyaW0oKVxuICAgICAgICBpZiAoeDIpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRyLmFwcGVuZENoaWxkKGNyZWF0ZUNvbHVtbkhlYWRlcih4MiwgXCJDaGVja2JveGVzXCIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRyLmFwcGVuZENoaWxkKGNyZWF0ZUNvbHVtbkhlYWRlcihcIlJlZmVyZW5jZXNcIiwgXCJSZWZlcmVuY2VzXCIpKTtcblxuICAgIHRyLmFwcGVuZENoaWxkKGNyZWF0ZUNvbHVtbkhlYWRlcihcIlZhbHVlXCIsIFwiVmFsdWVcIikpO1xuXG4gICAgbGV0IGFkZGl0aW9uYWxBdHRyaWJ1dGVzID0gZ2xvYmFsRGF0YS5nZXRBZGRpdGlvbmFsQXR0cmlidXRlcygpLnNwbGl0KFwiLFwiKTtcbiAgICAvLyBSZW1vdmUgbnVsbCwgXCJcIiwgdW5kZWZpbmVkLCBhbmQgMCB2YWx1ZXNcbiAgICBhZGRpdGlvbmFsQXR0cmlidXRlcyAgICA9YWRkaXRpb25hbEF0dHJpYnV0ZXMuZmlsdGVyKGZ1bmN0aW9uKGUpe3JldHVybiBlfSk7XG4gICAgZm9yIChsZXQgeCBvZiBhZGRpdGlvbmFsQXR0cmlidXRlcylcbiAgICB7XG4gICAgICAgIC8vIHJlbW92ZSBiZWdpbm5pbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgeCA9IHgudHJpbSgpXG4gICAgICAgIGlmICh4KVxuICAgICAgICB7XG4gICAgICAgICAgICB0ci5hcHBlbmRDaGlsZChjcmVhdGVDb2x1bW5IZWFkZXIoeCwgXCJBdHRyaWJ1dGVzXCIpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmKGdsb2JhbERhdGEuZ2V0Q29tYmluZVZhbHVlcygpKVxuICAgIHtcbiAgICAgICAgICAgIC8vWFhYOiBUaGlzIGNvbXBhcmlzb24gZnVuY3Rpb24gaXMgdXNpbmcgcG9zaXRpdmUgYW5kIG5lZ2F0aXZlIGltcGxpY2l0XG4gICAgICAgICAgICB0ci5hcHBlbmRDaGlsZChjcmVhdGVDb2x1bW5IZWFkZXIoXCJRdWFudGl0eVwiLCBcIlF1YW50aXR5XCIpKTtcbiAgICB9XG5cbiAgICBib21oZWFkLmFwcGVuZENoaWxkKHRyKTtcbn1cblxuLypcbiAgICBDcmVhdGVzIGEgbmV3IGNvbHVtbiBoZWFkZXIgYW5kIHJlZ2VuZXJhdGVzIEJPTSB0YWJsZS5cbiAgICBCT00gdGFibGUgaXMgcmVjcmVhdGVkIHNpbmNlIGEgbmV3IGNvbHVtbiBoYXMgYmVlbiBhZGRlZC5cbiovXG5mdW5jdGlvbiBjcmVhdGVDb2x1bW5IZWFkZXIobmFtZSwgY2xzKVxue1xuICAgIGxldCB0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUSFwiKTtcbiAgICB0aC5pbm5lckhUTUwgPSBuYW1lO1xuICAgIHRoLmNsYXNzTGlzdC5hZGQoY2xzKTtcbiAgICBsZXQgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJTUEFOXCIpO1xuICAgIHRoLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgIHJldHVybiB0aDtcbn1cblxuZnVuY3Rpb24gRmlsdGVyKHMpXG57XG4gICAgcyA9IHMudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgYm9tQm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tYm9keVwiKTtcblxuICAgIGZvciAobGV0IHBhcnQgb2YgYm9tQm9keS5yb3dzKVxuICAgIHtcbiAgICAgICAgLy8gVGhpcyBpcyBzZWFyY2hpbmcgZm9yIHRoZSBzdHJpbmcgYWNyb3NzIHRoZSBlbnRpcmUgcm93c1xuICAgICAgICAvLyB0ZXh0LlxuICAgICAgICBpZihwYXJ0LmlubmVyVGV4dC50cmltKCkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhzKSlcbiAgICAgICAge1xuICAgICAgICAgICAgcGFydC5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHBhcnQuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBGaWx0ZXJCeUF0dHJpYnV0ZShzKVxue1xuICAgIHMgPSBzLnRvTG93ZXJDYXNlKCk7XG4gICAgbGV0IGJvbUJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbWJvZHlcIik7XG5cbiAgICBpZihzICE9IFwiXCIpXG4gICAge1xuICAgICAgICAvLyBSZW1vdmVzIHN0cmluZ3MgdGhhdCBhcmUgYWxzbyBlbXB0eSB3aGljaCBvY2N1clxuICAgICAgICAvLyBpZiBhIGNvbW1hIGlzIGVudGVyZWQgYnV0IG5vdCBhIGFub3RoZXIgY2hhcmFjdGVyICgnYWFhLCcpLlxuICAgICAgICBsZXQgZmlsdGVyU3RyaW5ncyA9IHMuc3BsaXQoXCIsXCIpLmZpbHRlcihlbGVtZW50ID0+IHtyZXR1cm4gZWxlbWVudCAhPT0gJyd9KTtcblxuXG4gICAgICAgIGZvciAobGV0IHBhcnQgb2YgYm9tQm9keS5yb3dzKVxuICAgICAgICB7XG4gICAgICAgICAgICBmb3IobGV0IGZpbHRlclN0cmluZyBvZiBmaWx0ZXJTdHJpbmdzKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGlmKHBhcnQuaW5uZXJUZXh0LnRyaW0oKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlclN0cmluZykpXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnQuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgICBmb3IgKGxldCBwYXJ0IG9mIGJvbUJvZHkucm93cylcbiAgICAgICAge1xuICAgICAgICAgICAgcGFydC5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgc2V0Qm9tQ2hlY2tib3hlcywgcG9wdWxhdGVCb21UYWJsZSxcbiAgICBzZXRSZW1vdmVCT01FbnRyaWVzLCBjbGVhckJPTVRhYmxlLCBGaWx0ZXIsIEZpbHRlckJ5QXR0cmlidXRlXG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBnbG9iYWxEYXRhICAgICAgICA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcblxudmFyIENvbG9yTWFwID0gbmV3IE1hcChcbiAgICBbXG4gICAgICAgIC8vIExpZ2h0IE1vZGUsIERhcmsgTW9kZVxuICAgICAgICBbXCJEcmlsbFwiICAgICAgICAgICAgICAgICAgLFtcIiNDQ0NDQ0NcIiAgICwgXCIjQ0NDQ0NDXCJdXSxcbiAgICAgICAgW1wiQmJvdW5kaW5nQm94X0RlZmF1bHRcIiAgICxbXCIjODc4Nzg3XCIgICAsIFwiIzg3ODc4N1wiXV0sXG4gICAgICAgIFtcIkJib3VuZGluZ0JveF9QbGFjZWRcIiAgICAsW1wiIzQwRDA0MFwiICAgLCBcIiM0MEQwNDBcIl1dLFxuICAgICAgICBbXCJCYm91bmRpbmdCb3hfSGlnaGxpdGVkXCIgLFtcIiNEMDQwNDBcIiAgICwgXCIjRDA0MDQwXCJdXSxcbiAgICAgICAgW1wiQmJvdW5kaW5nQm94X0RlYnVnXCIgICAgICxbXCIjMjk3N2ZmXCIgICAsIFwiIzI5NzdmZlwiXV0sXG4gICAgICAgIFtcIlBhZF9EZWZhdWx0XCIgICAgICAgICAgICAsW1wiIzg3ODc4N1wiICAgLCBcIiM4Nzg3ODdcIl1dLFxuICAgICAgICBbXCJQYWRfUGluMVwiICAgICAgICAgICAgICAgLFtcIiNmZmI2MjlcIiAgICwgXCIjZmZiNjI5XCJdXSxcbiAgICAgICAgW1wiUGFkX0lzSGlnaGxpdGVkXCIgICAgICAgICxbXCIjRDA0MDQwXCIgICAsIFwiI0QwNDA0MFwiXV0sXG4gICAgICAgIFtcIlBhZF9Jc1BsYWNlZFwiICAgICAgICAgICAsW1wiIzQwRDA0MFwiICAgLCBcIiM0MEQwNDBcIl1dLFxuICAgICAgICBbXCJEZWZhdWx0XCIgICAgICAgICAgICAgICAgLFtcIiM4Nzg3ODdcIiAgICwgXCIjODc4Nzg3XCJdXVxuICAgIF0pO1xuXG5cblxuZnVuY3Rpb24gU2V0Q29sb3IoY29sb3JOYW1lLCBjb2xvckNvZGUpXG57XG4gICAgQ29sb3JNYXAuc2V0KGNvbG9yTmFtZSwgW2NvbG9yQ29kZSwgY29sb3JDb2RlXSk7XG59XG5cbi8qXG4gICAgQ3VycmVudGx5IDIgc3VwcG9ydGVkIGNvbG9yIHBhbGV0dGUuIFxuICAgIFBhbGV0dGUgMCBpcyBmb3IgbGlnaHQgbW9kZSwgYW5kIHBhbGV0dGUgMSBcbiAgICBpZCBmb3IgZGFyayBtb2RlLlxuKi9cbmZ1bmN0aW9uIEdldENvbG9yUGFsZXR0ZSgpXG57XG4gICAgcmV0dXJuIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiZGFya21vZGVcIikgPT09IFwidHJ1ZVwiKSA/IDEgOiAwO1xufVxuXG5mdW5jdGlvbiBHZXRUcmFjZUNvbG9yKHRyYWNlTGF5ZXIpXG57XG4gICAgbGV0IHRyYWNlQ29sb3JNYXAgPSBDb2xvck1hcC5nZXQodHJhY2VMYXllcik7XG4gICAgaWYgKHRyYWNlQ29sb3JNYXAgPT0gdW5kZWZpbmVkKVxuICAgIHtcbiAgICAgICAgLy9jb25zb2xlLmxvZyhcIldBUk5JTkc6IEludmFsaWQgdHJhY2UgbGF5ZXIgbnVtYmVyLCB1c2luZyBkZWZhdWx0LlwiKTtcbiAgICAgICAgcmV0dXJuIENvbG9yTWFwLmdldChcIkRlZmF1bHRcIilbR2V0Q29sb3JQYWxldHRlKCldO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICByZXR1cm4gdHJhY2VDb2xvck1hcFtHZXRDb2xvclBhbGV0dGUoKV07XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIEdldEJvdW5kaW5nQm94Q29sb3IoaXNIaWdobGl0ZWQsIGlzUGxhY2VkKVxue1xuICAgIC8vIE9yZGVyIG9mIGNvbG9yIHNlbGVjdGlvbi5cbiAgICBpZiAoaXNQbGFjZWQpIFxuICAgIHtcbiAgICAgICAgbGV0IHRyYWNlQ29sb3JNYXAgPSBDb2xvck1hcC5nZXQoXCJCYm91bmRpbmdCb3hfUGxhY2VkXCIpO1xuICAgICAgICByZXR1cm4gdHJhY2VDb2xvck1hcFtHZXRDb2xvclBhbGV0dGUoKV07XG4gICAgfVxuICAgIC8vIEhpZ2hsaWdodGVkIGFuZCBub3QgcGxhY2VkXG4gICAgZWxzZSBpZihpc0hpZ2hsaXRlZClcbiAgICB7XG4gICAgICAgIGxldCB0cmFjZUNvbG9yTWFwID0gQ29sb3JNYXAuZ2V0KFwiQmJvdW5kaW5nQm94X0hpZ2hsaXRlZFwiKTtcbiAgICAgICAgcmV0dXJuIHRyYWNlQ29sb3JNYXBbR2V0Q29sb3JQYWxldHRlKCldO1xuICAgIH1cbiAgICAvKlxuICAgICAgICBJZiBkZWJ1ZyBtb2RlIGlzIGVuYWJsZWQgdGhlbiBmb3JjZSBkcmF3aW5nIGEgYm91bmRpbmcgYm94XG4gICAgICBub3QgaGlnaGxpZ2h0ZWQsICBub3QgcGxhY2VkLCBhbmQgZGVidWcgbW9kZSBhY3RpdmVcbiAgICAqL1xuICAgIGVsc2UgaWYoZ2xvYmFsRGF0YS5nZXREZWJ1Z01vZGUoKSlcbiAgICB7XG4gICAgICAgIGxldCB0cmFjZUNvbG9yTWFwID0gQ29sb3JNYXAuZ2V0KFwiQmJvdW5kaW5nQm94X0RlYnVnXCIpO1xuICAgICAgICByZXR1cm4gdHJhY2VDb2xvck1hcFtHZXRDb2xvclBhbGV0dGUoKV07XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGxldCB0cmFjZUNvbG9yTWFwID0gQ29sb3JNYXAuZ2V0KFwiQmJvdW5kaW5nQm94X0RlZmF1bHRcIik7XG4gICAgICAgIHJldHVybiB0cmFjZUNvbG9yTWFwW0dldENvbG9yUGFsZXR0ZSgpXTtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gR2V0UGFkQ29sb3IoaXNQaW4xLCBpc0hpZ2hsaXRlZCwgaXNQbGFjZWQpXG57XG4gICAgaWYoaXNQaW4xKVxuICAgIHtcbiAgICAgICAgbGV0IHRyYWNlQ29sb3JNYXAgPSBDb2xvck1hcC5nZXQoXCJQYWRfUGluMVwiKTtcbiAgICAgICAgcmV0dXJuIHRyYWNlQ29sb3JNYXBbR2V0Q29sb3JQYWxldHRlKCldO1xuICAgIH1cbiAgICBlbHNlIGlmKGlzUGxhY2VkICYmIGlzSGlnaGxpdGVkKVxuICAgIHtcbiAgICAgICAgbGV0IHRyYWNlQ29sb3JNYXAgPSBDb2xvck1hcC5nZXQoXCJQYWRfSXNQbGFjZWRcIik7XG4gICAgICAgIHJldHVybiB0cmFjZUNvbG9yTWFwW0dldENvbG9yUGFsZXR0ZSgpXTtcbiAgICB9XG4gICAgZWxzZSBpZihpc0hpZ2hsaXRlZClcbiAgICB7XG4gICAgICAgIGxldCB0cmFjZUNvbG9yTWFwID0gQ29sb3JNYXAuZ2V0KFwiUGFkX0lzSGlnaGxpdGVkXCIpO1xuICAgICAgICByZXR1cm4gdHJhY2VDb2xvck1hcFtHZXRDb2xvclBhbGV0dGUoKV07XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGxldCB0cmFjZUNvbG9yTWFwID0gQ29sb3JNYXAuZ2V0KFwiUGFkX0RlZmF1bHRcIik7XG4gICAgICAgIHJldHVybiB0cmFjZUNvbG9yTWFwW0dldENvbG9yUGFsZXR0ZSgpXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIEdldFZpYUNvbG9yKClcbntcbiAgICBsZXQgdHJhY2VDb2xvck1hcCA9IENvbG9yTWFwLmdldChcIlZpYXNcIik7XG4gICAgaWYgKHRyYWNlQ29sb3JNYXAgPT0gdW5kZWZpbmVkKVxuICAgIHtcbiAgICAgICAgLy9jb25zb2xlLmxvZyhcIldBUk5JTkc6IEludmFsaWQgdHJhY2UgbGF5ZXIgbnVtYmVyLCB1c2luZyBkZWZhdWx0LlwiKTtcbiAgICAgICAgcmV0dXJuIENvbG9yTWFwLmdldChcIkRlZmF1bHRcIilbR2V0Q29sb3JQYWxldHRlKCldO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICByZXR1cm4gdHJhY2VDb2xvck1hcFtHZXRDb2xvclBhbGV0dGUoKV07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBHZXREcmlsbENvbG9yKClcbntcbiAgICBsZXQgdHJhY2VDb2xvck1hcCA9IENvbG9yTWFwLmdldChcIkRyaWxsXCIpO1xuICAgIGlmICh0cmFjZUNvbG9yTWFwID09IHVuZGVmaW5lZClcbiAgICB7XG4gICAgICAgIC8vY29uc29sZS5sb2coXCJXQVJOSU5HOiBJbnZhbGlkIHRyYWNlIGxheWVyIG51bWJlciwgdXNpbmcgZGVmYXVsdC5cIik7XG4gICAgICAgIHJldHVybiBDb2xvck1hcC5nZXQoXCJEZWZhdWx0XCIpW0dldENvbG9yUGFsZXR0ZSgpXTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgcmV0dXJuIHRyYWNlQ29sb3JNYXBbR2V0Q29sb3JQYWxldHRlKCldO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgR2V0VHJhY2VDb2xvciwgR2V0Qm91bmRpbmdCb3hDb2xvciwgR2V0UGFkQ29sb3IsXG4gICAgR2V0VmlhQ29sb3IsIEdldERyaWxsQ29sb3IsIFNldENvbG9yXG59O1xuIiwiLypcbiAgICBGdW5jdGlvbnMgZm9yIGVuYWJsaW5nIG9yIGRpc2FibGluZyBmdWxsIHNjcmVlbiBtb2RlLlxuXG4gICAgRnVuY3Rpb25zIGFyZSB0YWtlbiBmcm9tIFczIFNjaG9vbCxcblxuICAgIGh0dHBzOi8vd3d3Lnczc2Nob29scy5jb20vaG93dG8vaG93dG9fanNfZnVsbHNjcmVlbi5hc3BcbiovXG5cInVzZSBzdHJpY3RcIjtcblxuXG4vKiBWaWV3IGluIGZ1bGxzY3JlZW4gKi9cbmZ1bmN0aW9uIG9wZW5GdWxsc2NyZWVuKClcbntcbiAgICBsZXQgZWxlbSA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcblxuICAgIGlmIChlbGVtLnJlcXVlc3RGdWxsc2NyZWVuKVxuICAgIHtcbiAgICAgICAgZWxlbS5yZXF1ZXN0RnVsbHNjcmVlbigpO1xuICAgIH1cbiAgICAvKiBTYWZhcmkgKi9cbiAgICBlbHNlIGlmIChlbGVtLndlYmtpdFJlcXVlc3RGdWxsc2NyZWVuKVxuICAgIHtcbiAgICAgICAgZWxlbS53ZWJraXRSZXF1ZXN0RnVsbHNjcmVlbigpO1xuICAgIH1cbiAgICAvKiBJRTExICovXG4gICAgZWxzZSBpZiAoZWxlbS5tc1JlcXVlc3RGdWxsc2NyZWVuKVxuICAgIHtcbiAgICAgICAgZWxlbS5tc1JlcXVlc3RGdWxsc2NyZWVuKCk7XG4gICAgfVxufVxuXG4vKiBDbG9zZSBmdWxsc2NyZWVuICovXG5mdW5jdGlvbiBjbG9zZUZ1bGxzY3JlZW4oKVxue1xuICAgIGlmIChkb2N1bWVudC5leGl0RnVsbHNjcmVlbilcbiAgICB7XG4gICAgICAgIGRvY3VtZW50LmV4aXRGdWxsc2NyZWVuKCk7XG4gICAgfVxuICAgIC8qIFNhZmFyaSAqL1xuICAgIGVsc2UgaWYgKGRvY3VtZW50LndlYmtpdEV4aXRGdWxsc2NyZWVuKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQud2Via2l0RXhpdEZ1bGxzY3JlZW4oKTtcbiAgICB9XG4gICAgLyogSUUxMSAqL1xuICAgIGVsc2UgaWYgKGRvY3VtZW50Lm1zRXhpdEZ1bGxzY3JlZW4pXG4gICAge1xuICAgICAgICBkb2N1bWVudC5tc0V4aXRGdWxsc2NyZWVuKCk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgb3BlbkZ1bGxzY3JlZW4sIGNsb3NlRnVsbHNjcmVlblxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5cblxubGV0IHBjYl90cmFjZXMgPSBbXTtcbmxldCBwY2JfdGVzdHBvaW50cyA9IFtdO1xubGV0IHBjYl9sYXllcnMgPSAwO1xubGV0IHBjYl9wYXJ0cyA9IFtdO1xubGV0IHJlbmRlcl9sYXllcnMgPSAxO1xubGV0IGxheWVyX2xpc3QgPSBuZXcgTWFwKCk7XG5cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgQm9hcmQgUm90YXRpb25cbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5sZXQgc3RvcmFnZSA9IHVuZGVmaW5lZDtcbmNvbnN0IHN0b3JhZ2VQcmVmaXggPSBcIklOVEVSQUNUSVZFX1BDQl9fXCJcblxuZnVuY3Rpb24gaW5pdFN0b3JhZ2UgKClcbntcbiAgICB0cnlcbiAgICB7XG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShcImJsYW5rXCIpO1xuICAgICAgICBzdG9yYWdlID0gd2luZG93LmxvY2FsU3RvcmFnZTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpXG4gICAge1xuICAgICAgICBjb25zb2xlLmxvZyhcIkVSUk9SOiBTdG9yYWdlIGluaXQgZXJyb3JcIik7XG4gICAgfVxuXG4gICAgaWYgKCFzdG9yYWdlKVxuICAgIHtcbiAgICAgICAgdHJ5XG4gICAgICAgIHtcbiAgICAgICAgICAgIHdpbmRvdy5zZXNzaW9uU3RvcmFnZS5nZXRJdGVtKFwiYmxhbmtcIik7XG4gICAgICAgICAgICBzdG9yYWdlID0gd2luZG93LnNlc3Npb25TdG9yYWdlO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlKVxuICAgICAgICB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVSUk9SOiBTZXNzaW9uIHN0b3JhZ2Ugbm90IGF2YWlsYWJsZVwiKTtcbiAgICAgICAgICAgIC8vIHNlc3Npb25TdG9yYWdlIGFsc28gbm90IGF2YWlsYWJsZVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZWFkU3RvcmFnZShrZXkpXG57XG4gICAgaWYgKHN0b3JhZ2UpXG4gICAge1xuICAgICAgICByZXR1cm4gc3RvcmFnZS5nZXRJdGVtKHN0b3JhZ2VQcmVmaXggKyBcIiNcIiArIGtleSk7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gd3JpdGVTdG9yYWdlKGtleSwgdmFsdWUpXG57XG4gICAgaWYgKHN0b3JhZ2UpXG4gICAge1xuICAgICAgICBzdG9yYWdlLnNldEl0ZW0oc3RvcmFnZVByZWZpeCArIFwiI1wiICsga2V5LCB2YWx1ZSk7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiRVJST1I6IFN0b3JhZ2Ugbm90IGluaXRpYWxpemVkXCIpO1xuICAgIH1cbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgSGlnaGxpZ2h0ZWQgUmVmc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBoaWdobGlnaHRlZFJlZnMgPSBbXTtcblxuXG5cbmZ1bmN0aW9uIENvbnZlcnRSYW5nZXNUb1JlZmVyZW5jZURlc2lnbmF0b3JzKHRleHQpXG57XG4gICAgLy8gU3BsaXQgaWdub3JpbmcgdGhlIHNwYWNlcy5cbiAgICBsZXQgcGFydGlhbF9yZWYgPSB0ZXh0LnNwbGl0KCcsJylcbiAgICBsZXQgcmVmcyA9IFtdXG5cbiAgICBmb3IobGV0IHJlZiBvZiBwYXJ0aWFsX3JlZilcbiAgICB7XG4gICAgICAgIGlmKHJlZi5tYXRjaCgnLScpKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgZGVzaWduYXRvcl9uYW1lICA9IHJlZi5tYXRjaCgvXlxcRCsvKVswXTtcbiAgICAgICAgICAgIGxldCBzdGFydE51bWJlciAgICAgID0gcmVmLm1hdGNoKC8oXFxkKyktKFxcZCspLylbMV07XG4gICAgICAgICAgICBsZXQgZW5kTnVtYmVyICAgICAgICA9IHJlZi5tYXRjaCgvKFxcZCspLShcXGQrKS8pWzJdO1xuXG4gICAgICAgICAgICBmb3IobGV0IGkgPSBzdGFydE51bWJlcjsgaSA8PSBlbmROdW1iZXI7IGkrKylcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWZzLnB1c2goZGVzaWduYXRvcl9uYW1lICsgU3RyaW5nKGkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJlZnMucHVzaChyZWYpO1xuICAgICAgICB9XG4gICAgfVxuICAgcmV0dXJuIHJlZnNcbn1cblxuXG5mdW5jdGlvbiBzZXRIaWdobGlnaHRlZFJlZnMocmVmcywgaXNNdWx0aSlcbntcbiAgICBpZihyZWZzID09IG51bGwpXG4gICAge1xuICAgICAgICBoaWdobGlnaHRlZFJlZnMgPSBbXTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgaWYoaXNNdWx0aSlcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gU2tpcFxuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgaGlnaGxpZ2h0ZWRSZWZzID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgbmV3UmVmcyA9IENvbnZlcnRSYW5nZXNUb1JlZmVyZW5jZURlc2lnbmF0b3JzKHJlZnMpO1xuICAgICAgICBmb3IobGV0IHJlZiBvZiBuZXdSZWZzKVxuICAgICAgICB7XG4gICAgICAgICAgICBoaWdobGlnaHRlZFJlZnMucHVzaChyZWYpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRIaWdobGlnaHRlZFJlZnMoKVxue1xuICAgIHJldHVybiBoaWdobGlnaHRlZFJlZnM7XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgIFJlZHJhdyBPbiBEcmFnXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IHJlZHJhd09uRHJhZyA9IHRydWU7XG5cbmZ1bmN0aW9uIHNldFJlZHJhd09uRHJhZyh2YWx1ZSlcbntcbiAgICByZWRyYXdPbkRyYWcgPSB2YWx1ZTtcbiAgICB3cml0ZVN0b3JhZ2UoXCJyZWRyYXdPbkRyYWdcIiwgdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBnZXRSZWRyYXdPbkRyYWcoKVxue1xuICAgIHJldHVybiByZWRyYXdPbkRyYWc7XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgRGVidWcgTW9kZVxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBkZWJ1Z01vZGUgPSBmYWxzZTtcblxuZnVuY3Rpb24gc2V0RGVidWdNb2RlKHZhbHVlKVxue1xuICAgIGRlYnVnTW9kZSA9IHZhbHVlO1xuICAgIHdyaXRlU3RvcmFnZShcImRlYnVnTW9kZVwiLCB2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGdldERlYnVnTW9kZSgpXG57XG4gICAgcmV0dXJuIGRlYnVnTW9kZTtcbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbmxheWVyIFNwbGl0XG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IGxheWVyc3BsaXQ7XG5cbmZ1bmN0aW9uIHNldExheWVyU3BsaXQodmFsdWUpXG57XG4gICAgbGF5ZXJzcGxpdCA9IHZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRMYXllclNwbGl0KClcbntcbiAgICByZXR1cm4gbGF5ZXJzcGxpdDtcbn1cblxuZnVuY3Rpb24gZGVzdHJveUxheWVyU3BsaXQoKVxue1xuICAgIGlmKCAgICAobGF5ZXJzcGxpdCAhPT0gbnVsbClcbiAgICAgICAgJiYgKGxheWVyc3BsaXQgIT09IHVuZGVmaW5lZClcbiAgICAgIClcbiAgICB7XG4gICAgICAgIGxheWVyc3BsaXQuZGVzdHJveSgpO1xuICAgIH1cbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbkJPTSBTcGxpdFxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBib21zcGxpdDtcblxuZnVuY3Rpb24gc2V0Qm9tU3BsaXQodmFsdWUpXG57XG4gICAgYm9tc3BsaXQgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0Qm9tU3BsaXQoKVxue1xuICAgIHJldHVybiBib21zcGxpdDtcbn1cblxuZnVuY3Rpb24gZGVzdHJveUJvbVNwbGl0KClcbntcbiAgICBib21zcGxpdC5kZXN0cm95KCk7XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5DYW52YXMgU3BsaXRcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5sZXQgY2FudmFzc3BsaXQ7XG5cbmZ1bmN0aW9uIHNldENhbnZhc1NwbGl0KHZhbHVlKVxue1xuICAgIGNhbnZhc3NwbGl0ID0gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldENhbnZhc1NwbGl0KClcbntcbiAgICByZXR1cm4gY2FudmFzc3BsaXQ7XG59XG5cbmZ1bmN0aW9uIGRlc3Ryb3lDYW52YXNTcGxpdCgpXG57XG4gICAgY2FudmFzc3BsaXQuZGVzdHJveSgpO1xufVxuXG5mdW5jdGlvbiBjb2xsYXBzZUNhbnZhc1NwbGl0KHZhbHVlKVxue1xuICAgIGNhbnZhc3NwbGl0LmNvbGxhcHNlKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gc2V0U2l6ZXNDYW52YXNTcGxpdCgpXG57XG4gICAgY2FudmFzc3BsaXQuc2V0U2l6ZXMoWzUwLCA1MF0pO1xufVxuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuQ2FudmFzIExheW91dFxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBjYW52YXNsYXlvdXQgPSBcIkZCXCI7XG5cbi8qWFhYIEZvdW5kIGEgYnVnIGF0IHN0YXJ0dXAuIENvZGUgYXNzdW1lcyB0aGF0IGNhbnZhcyBsYXlvdXRcbmlzIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXMuIHRoZW4gc3lzdGVtIGZhaWxzLiBoZSBidWcgd2FzIHRoYXQgdGhlXG5jYW52YXNMYXlvdXQgd2FzIGJlaW5nIHNldCB0byAnZGVmYXVsdCcgd2hpY2ggaXMgbm90IGEgdmFsaWQgc3RhdGUuXG5TbyBubyBpcyBjaGVjayB0aGF0IGlmIGRlZmF1bHQgaXMgc2VudCBpbiB0aGVuIHNldCB0aGUgbGF5b3V0IHRvIEZCIG1vZGUuXG4qL1xuLyogVE9ETzogTWFrZSB0aGUgZGVmYXVsdCBjaGVjayBiZWxvdyBhY3R1YWxseSBjaGVjayB0aGF0IHRoZSBpdGVtXG5pcyBpbiBvbmUgb2YgdGhlIHRocmVlIHZhbGlkIHN0YXRlcy4gSWYgbm90IHRoZW4gc2V0IHRvIEZCLCBvdGhlcndpc2Ugc2V0IHRvIG9uZSBvZlxudGhlIHRocmVlIHZhbGlkIHN0YXRlc1xuKi9cbmZ1bmN0aW9uIHNldENhbnZhc0xheW91dCh2YWx1ZSlcbntcbiAgICBpZih2YWx1ZSA9PSBcImRlZmF1bHRcIilcbiAgICB7XG4gICAgICAgIGNhbnZhc2xheW91dCA9IFwiRkJcIjtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgY2FudmFzbGF5b3V0ID0gdmFsdWU7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRDYW52YXNMYXlvdXQoKVxue1xuICAgIHJldHVybiBjYW52YXNsYXlvdXQ7XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5CT00gTGF5b3V0XG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IGJvbWxheW91dCA9IFwiZGVmYXVsdFwiO1xuXG5mdW5jdGlvbiBzZXRCb21MYXlvdXQodmFsdWUpXG57XG4gICAgYm9tbGF5b3V0ID0gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldEJvbUxheW91dCgpXG57XG4gICAgcmV0dXJuIGJvbWxheW91dDtcbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbkJPTSBTb3J0IEZ1bmN0aW9uXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IGJvbVNvcnRGdW5jdGlvbiA9IG51bGw7XG5cbmZ1bmN0aW9uIHNldEJvbVNvcnRGdW5jdGlvbih2YWx1ZSlcbntcbiAgICBib21Tb3J0RnVuY3Rpb24gPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0Qm9tU29ydEZ1bmN0aW9uKClcbntcbiAgICByZXR1cm4gYm9tU29ydEZ1bmN0aW9uO1xufVxuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuQ3VycmVudCBTb3J0IENvbHVtblxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBjdXJyZW50U29ydENvbHVtbiA9IG51bGw7XG5cbmZ1bmN0aW9uIHNldEN1cnJlbnRTb3J0Q29sdW1uKHZhbHVlKVxue1xuICAgIGN1cnJlbnRTb3J0Q29sdW1uID0gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldEN1cnJlbnRTb3J0Q29sdW1uKClcbntcbiAgICByZXR1cm4gY3VycmVudFNvcnRDb2x1bW47XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5DdXJyZW50IFNvcnQgT3JkZXJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5sZXQgY3VycmVudFNvcnRPcmRlciA9IG51bGw7XG5cbmZ1bmN0aW9uIHNldEN1cnJlbnRTb3J0T3JkZXIodmFsdWUpXG57XG4gICAgY3VycmVudFNvcnRPcmRlciA9IHZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRDdXJyZW50U29ydE9yZGVyKClcbntcbiAgICByZXR1cm4gY3VycmVudFNvcnRPcmRlcjtcbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbkN1cnJlbnQgSGlnaGxpZ2h0ZWQgUm93IElEXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IGN1cnJlbnRIaWdobGlnaHRlZFJvd0lkID0gW107XG5cbmZ1bmN0aW9uIHNldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKHZhbHVlLCBpc011bHRpKVxue1xuICAgIGlmKHZhbHVlID09IG51bGwpXG4gICAge1xuICAgICAgICBjdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCA9IFtdO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICBpZihpc011bHRpKVxuICAgICAgICB7XG4gICAgICAgICAgICBjdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZC5wdXNoKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGN1cnJlbnRIaWdobGlnaHRlZFJvd0lkID0gW3ZhbHVlXTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKVxue1xuICAgIHJldHVybiBjdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZDtcbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbkhpZ2hsaWdodCBIYW5kbGVyc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBoaWdobGlnaHRIYW5kbGVycyA9IFtdO1xuXG5mdW5jdGlvbiBzZXRIaWdobGlnaHRIYW5kbGVycyh2YWx1ZXMpXG57XG4gICAgaGlnaGxpZ2h0SGFuZGxlcnMgPSB2YWx1ZXM7XG59XG5cbmZ1bmN0aW9uIGdldEhpZ2hsaWdodEhhbmRsZXJzKCl7XG4gICAgcmV0dXJuIGhpZ2hsaWdodEhhbmRsZXJzO1xufVxuXG5mdW5jdGlvbiBwdXNoSGlnaGxpZ2h0SGFuZGxlcnModmFsdWUpXG57XG4gICAgaGlnaGxpZ2h0SGFuZGxlcnMucHVzaCh2YWx1ZSk7XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5DaGVja2JveGVzXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IGNoZWNrYm94ZXMgPSBbXTtcblxuZnVuY3Rpb24gc2V0Q2hlY2tib3hlcyh2YWx1ZXMpXG57XG4gICAgY2hlY2tib3hlcyA9IHZhbHVlcztcbn1cblxuZnVuY3Rpb24gZ2V0Q2hlY2tib3hlcygpXG57XG4gICAgcmV0dXJuIGNoZWNrYm94ZXM7XG59XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5CT00gQ2hlY2tib3hlc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBib21DaGVja2JveGVzID0gXCJcIjtcblxuZnVuY3Rpb24gc2V0Qm9tQ2hlY2tib3hlcyh2YWx1ZXMpXG57XG4gICAgYm9tQ2hlY2tib3hlcyA9IHZhbHVlcztcbn1cblxuZnVuY3Rpb24gZ2V0Qm9tQ2hlY2tib3hlcygpXG57XG4gICAgcmV0dXJuIGJvbUNoZWNrYm94ZXM7XG59XG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuUmVtb3ZlIEJPTSBFbnRyaWVzXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IHJlbW92ZUJPTUVudHJpZXMgPSBcIlwiO1xuXG5mdW5jdGlvbiBzZXRSZW1vdmVCT01FbnRyaWVzKHZhbHVlcylcbntcbiAgICByZW1vdmVCT01FbnRyaWVzID0gdmFsdWVzO1xufVxuXG5mdW5jdGlvbiBnZXRSZW1vdmVCT01FbnRyaWVzKClcbntcbiAgICByZXR1cm4gcmVtb3ZlQk9NRW50cmllcztcbn1cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcblJlbW92ZSBCT00gRW50cmllc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBhZGRpdGlvbmFsQXR0cmlidXRlcyA9IFwiXCI7XG5cbmZ1bmN0aW9uIHNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKHZhbHVlcylcbntcbiAgICBhZGRpdGlvbmFsQXR0cmlidXRlcyA9IHZhbHVlcztcbn1cblxuZnVuY3Rpb24gZ2V0QWRkaXRpb25hbEF0dHJpYnV0ZXMoKXtcbiAgICByZXR1cm4gYWRkaXRpb25hbEF0dHJpYnV0ZXM7XG59XG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG5IaWdobGlnaHQgUGluIDFcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5sZXQgaGlnaGxpZ2h0cGluMSA9IGZhbHNlO1xuXG5mdW5jdGlvbiBzZXRIaWdobGlnaHRQaW4xKHZhbHVlKVxue1xuICAgIHdyaXRlU3RvcmFnZShcImhpZ2hsaWdodHBpbjFcIiwgdmFsdWUpO1xuICAgIGhpZ2hsaWdodHBpbjEgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0SGlnaGxpZ2h0UGluMSgpe1xuICAgIHJldHVybiBoaWdobGlnaHRwaW4xO1xufVxuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuTGFzdCBDbGlja2VkIFJlZlxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmxldCBsYXN0Q2xpY2tlZFJlZjtcblxuZnVuY3Rpb24gc2V0TGFzdENsaWNrZWRSZWYodmFsdWUpXG57XG4gICAgbGFzdENsaWNrZWRSZWYgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0TGFzdENsaWNrZWRSZWYoKVxue1xuICAgIHJldHVybiBsYXN0Q2xpY2tlZFJlZjtcbn1cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuQ29tYmluZSBWYWx1ZXNcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5sZXQgY29tYmluZVZhbHVlcyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBzZXRDb21iaW5lVmFsdWVzKHZhbHVlKVxue1xuICAgIHdyaXRlU3RvcmFnZShcImNvbWJpbmVWYWx1ZXNcIiwgdmFsdWUpO1xuICAgIGNvbWJpbmVWYWx1ZXMgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29tYmluZVZhbHVlcygpXG57XG4gICAgcmV0dXJuIGNvbWJpbmVWYWx1ZXM7XG59XG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5cblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbkNvbWJpbmUgVmFsdWVzXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xubGV0IGhpZGVQbGFjZWRQYXJ0cyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBzZXRIaWRlUGxhY2VkUGFydHModmFsdWUpXG57XG4gICAgd3JpdGVTdG9yYWdlKFwiaGlkZVBsYWNlZFBhcnRzXCIsIHZhbHVlKTtcbiAgICBoaWRlUGxhY2VkUGFydHMgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0SGlkZVBsYWNlZFBhcnRzKClcbntcbiAgICByZXR1cm4gaGlkZVBsYWNlZFBhcnRzO1xufVxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxubGV0IGFsbGNhbnZhcyA9ICB1bmRlZmluZWQ7XG5cbmZ1bmN0aW9uIFNldEFsbENhbnZhcyh2YWx1ZSlcbntcbiAgICBhbGxjYW52YXMgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gR2V0QWxsQ2FudmFzKClcbntcbiAgICByZXR1cm4gYWxsY2FudmFzO1xufVxuXG5cbmxldCBib2FyZFJvdGF0aW9uID0gMDtcbmZ1bmN0aW9uIFNldEJvYXJkUm90YXRpb24odmFsdWUpXG57XG4gICAgYm9hcmRSb3RhdGlvbiA9IHZhbHVlO1xufVxuXG5mdW5jdGlvbiBHZXRCb2FyZFJvdGF0aW9uKClcbntcbiAgICByZXR1cm4gYm9hcmRSb3RhdGlvbjtcbn1cblxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBwY2JfdHJhY2VzLCBwY2JfbGF5ZXJzLCBwY2JfcGFydHMsIHJlbmRlcl9sYXllcnMsIGxheWVyX2xpc3QsIHBjYl90ZXN0cG9pbnRzLFxuICAgIGluaXRTdG9yYWdlICAgICAgICAgICAgICAgICwgcmVhZFN0b3JhZ2UgICAgICAgICAgICAgICAgLCB3cml0ZVN0b3JhZ2UgICAgICAgICAgLFxuICAgIHNldEhpZ2hsaWdodGVkUmVmcyAgICAgICAgICwgZ2V0SGlnaGxpZ2h0ZWRSZWZzICAgICAgICAgLFxuICAgIHNldFJlZHJhd09uRHJhZyAgICAgICAgICAgICwgZ2V0UmVkcmF3T25EcmFnICAgICAgICAgICAgLFxuICAgIHNldERlYnVnTW9kZSAgICAgICAgICAgICAgICwgZ2V0RGVidWdNb2RlICAgICAgICAgICAgICAgLFxuICAgIHNldEJvbVNwbGl0ICAgICAgICAgICAgICAgICwgZ2V0Qm9tU3BsaXQgICAgICAgICAgICAgICAgLCBkZXN0cm95Qm9tU3BsaXQgICAgICAgLFxuICAgIHNldExheWVyU3BsaXQgICAgICAgICAgICAgICwgZ2V0TGF5ZXJTcGxpdCAgICAgICAgICAgICAgLCBkZXN0cm95TGF5ZXJTcGxpdCAgICAgLFxuICAgIHNldENhbnZhc1NwbGl0ICAgICAgICAgICAgICwgZ2V0Q2FudmFzU3BsaXQgICAgICAgICAgICAgLCBkZXN0cm95Q2FudmFzU3BsaXQgICAgLCBjb2xsYXBzZUNhbnZhc1NwbGl0ICwgc2V0U2l6ZXNDYW52YXNTcGxpdCAsXG4gICAgc2V0Q2FudmFzTGF5b3V0ICAgICAgICAgICAgLCBnZXRDYW52YXNMYXlvdXQgICAgICAgICAgICAsXG4gICAgc2V0Qm9tTGF5b3V0ICAgICAgICAgICAgICAgLCBnZXRCb21MYXlvdXQgICAgICAgICAgICAgICAsXG4gICAgc2V0Qm9tU29ydEZ1bmN0aW9uICAgICAgICAgLCBnZXRCb21Tb3J0RnVuY3Rpb24gICAgICAgICAsXG4gICAgc2V0Q3VycmVudFNvcnRDb2x1bW4gICAgICAgLCBnZXRDdXJyZW50U29ydENvbHVtbiAgICAgICAsXG4gICAgc2V0Q3VycmVudFNvcnRPcmRlciAgICAgICAgLCBnZXRDdXJyZW50U29ydE9yZGVyICAgICAgICAsXG4gICAgc2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQgLCBnZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCAsXG4gICAgc2V0SGlnaGxpZ2h0SGFuZGxlcnMgICAgICAgLCBnZXRIaWdobGlnaHRIYW5kbGVycyAgICAgICAsIHB1c2hIaWdobGlnaHRIYW5kbGVycyAsXG4gICAgc2V0Q2hlY2tib3hlcyAgICAgICAgICAgICAgLCBnZXRDaGVja2JveGVzICAgICAgICAgICAgICAsXG4gICAgc2V0Qm9tQ2hlY2tib3hlcyAgICAgICAgICAgLCBnZXRCb21DaGVja2JveGVzICAgICAgICAgICAsXG4gICAgc2V0UmVtb3ZlQk9NRW50cmllcyAgICAgICAgLCBnZXRSZW1vdmVCT01FbnRyaWVzICAgICAgICAsXG4gICAgc2V0QWRkaXRpb25hbEF0dHJpYnV0ZXMgICAgLCBnZXRBZGRpdGlvbmFsQXR0cmlidXRlcyAgICAsXG4gICAgc2V0SGlnaGxpZ2h0UGluMSAgICAgICAgICAgLCBnZXRIaWdobGlnaHRQaW4xICAgICAgICAgICAsXG4gICAgc2V0TGFzdENsaWNrZWRSZWYgICAgICAgICAgLCBnZXRMYXN0Q2xpY2tlZFJlZiAgICAgICAgICAsXG4gICAgc2V0Q29tYmluZVZhbHVlcyAgICAgICAgICAgLCBnZXRDb21iaW5lVmFsdWVzICAgICAgICAgICAsXG4gICAgc2V0SGlkZVBsYWNlZFBhcnRzICAgICAgICAgLCBnZXRIaWRlUGxhY2VkUGFydHMgICAgICAgICAsXG4gICAgU2V0QWxsQ2FudmFzICAgICAgICAgICAgICAgLCBHZXRBbGxDYW52YXMgICAgICAgICAgICAgICAsXG4gICAgU2V0Qm9hcmRSb3RhdGlvbiAgICAgICAgICAgLCBHZXRCb2FyZFJvdGF0aW9uXG5cbn07XG4iLCJ2YXIgZ2xvYmFsRGF0YSA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcbnZhciByZW5kZXIgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyLmpzXCIpO1xuXG5mdW5jdGlvbiBoYW5kbGVNb3VzZURvd24oZSwgbGF5ZXJkaWN0KVxue1xuICAgIGlmIChlLndoaWNoICE9IDEpXG4gICAge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlc3RhcnR4ID0gZS5vZmZzZXRYO1xuICAgIGxheWVyZGljdC50cmFuc2Zvcm0ubW91c2VzdGFydHkgPSBlLm9mZnNldFk7XG4gICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd254ID0gZS5vZmZzZXRYO1xuICAgIGxheWVyZGljdC50cmFuc2Zvcm0ubW91c2Vkb3dueSA9IGUub2Zmc2V0WTtcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93biA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIHNtb290aFNjcm9sbFRvUm93KHJvd2lkKVxue1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHJvd2lkKS5zY3JvbGxJbnRvVmlldyh7XG4gICAgICAgIGJlaGF2aW9yOiBcInNtb290aFwiLFxuICAgICAgICBibG9jazogXCJjZW50ZXJcIixcbiAgICAgICAgaW5saW5lOiBcIm5lYXJlc3RcIlxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBtb2R1bGVzQ2xpY2tlZChldmVudCwgcmVmZXJlbmNlcylcbntcbiAgICBsZXQgbGFzdENsaWNrZWRJbmRleCA9IHJlZmVyZW5jZXMuaW5kZXhPZihnbG9iYWxEYXRhLmdldExhc3RDbGlja2VkUmVmKCkpO1xuICAgIGxldCByZWYgPSByZWZlcmVuY2VzWyhsYXN0Q2xpY2tlZEluZGV4ICsgMSkgJSByZWZlcmVuY2VzLmxlbmd0aF07XG4gICAgZm9yIChsZXQgaGFuZGxlciBvZiBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKCkpXG4gICAge1xuICAgICAgICBpZiAoaGFuZGxlci5yZWZzLmluZGV4T2YocmVmKSA+PSAwKVxuICAgICAgICB7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExhc3RDbGlja2VkUmVmKHJlZik7XG4gICAgICAgICAgICBoYW5kbGVyLmhhbmRsZXIoZXZlbnQpO1xuICAgICAgICAgICAgc21vb3RoU2Nyb2xsVG9Sb3coZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gYmJveFNjYW4obGF5ZXIsIHgsIHkpXG57XG4gICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgIGZvciAobGV0IHBhcnQgb2YgcGNiZGF0YS5wYXJ0cylcbiAgICB7XG4gICAgICAgIGlmKCBwYXJ0LmxvY2F0aW9uID09IGxheWVyKVxuICAgICAgICB7XG4gICAgICAgICAgICBsZXQgYiA9IHBhcnQucGFja2FnZS5ib3VuZGluZ19ib3g7XG4gICAgICAgICAgICBpZiAoICAgICh4ID4gYi54MCApXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAoeCA8IGIueDEgKVxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgKHkgPiBiLnkwIClcbiAgICAgICAgICAgICAgICAgICAgICAgICYmICh5IDwgYi55MSApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gocGFydC5uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5cbmZ1bmN0aW9uIGhhbmRsZU1vdXNlQ2xpY2soZSwgbGF5ZXJkaWN0KVxue1xuICAgIGxldCB4ID0gZS5vZmZzZXRYO1xuICAgIGxldCB5ID0gZS5vZmZzZXRZO1xuICAgIGxldCB0ID0gbGF5ZXJkaWN0LnRyYW5zZm9ybTtcbiAgICBpZiAobGF5ZXJkaWN0LmxheWVyICE9IFwiQlwiKVxuICAgIHtcbiAgICAgICAgeCA9ICgyICogeCAvIHQuem9vbSAtIHQucGFueCArIHQueCkgLyAtdC5zO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICB4ID0gKDIgKiB4IC8gdC56b29tIC0gdC5wYW54IC0gdC54KSAvIHQucztcbiAgICB9XG4gICAgeSA9ICgyICogeSAvIHQuem9vbSAtIHQueSAtIHQucGFueSkgLyB0LnM7XG4gICAgbGV0IHYgPSByZW5kZXIuUm90YXRlVmVjdG9yKFt4LCB5XSwgLWdsb2JhbERhdGEuR2V0Qm9hcmRSb3RhdGlvbigpKTtcbiAgICBsZXQgcmVmbGlzdCA9IGJib3hTY2FuKGxheWVyZGljdC5sYXllciwgdlswXSwgdlsxXSwgdCk7XG4gICAgaWYgKHJlZmxpc3QubGVuZ3RoID4gMClcbiAgICB7XG4gICAgICAgIG1vZHVsZXNDbGlja2VkKGUsIHJlZmxpc3QpO1xuICAgICAgICByZW5kZXIuZHJhd0hpZ2hsaWdodHMoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1vdXNlVXAoZSwgbGF5ZXJkaWN0KVxue1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGlmICggICAgZS53aGljaCA9PSAxXG4gICAgICAgICAmJiBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93blxuICAgICAgICAgJiYgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd254ID09IGUub2Zmc2V0WFxuICAgICAgICAgJiYgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd255ID09IGUub2Zmc2V0WVxuICAgIClcbiAgICB7XG4gICAgICAgIC8vIFRoaXMgaXMganVzdCBhIGNsaWNrXG4gICAgICAgIGhhbmRsZU1vdXNlQ2xpY2soZSwgbGF5ZXJkaWN0KTtcbiAgICAgICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd24gPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZS53aGljaCA9PSAzKVxuICAgIHtcbiAgICAgICAgLy8gUmVzZXQgcGFuIGFuZCB6b29tIG9uIHJpZ2h0IGNsaWNrLlxuICAgICAgICBsYXllcmRpY3QudHJhbnNmb3JtLnBhbnggPSAwO1xuICAgICAgICBsYXllcmRpY3QudHJhbnNmb3JtLnBhbnkgPSAwO1xuICAgICAgICBsYXllcmRpY3QudHJhbnNmb3JtLnpvb20gPSAxO1xuICAgICAgICByZW5kZXIuUmVuZGVyUENCKGxheWVyZGljdCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKCFnbG9iYWxEYXRhLmdldFJlZHJhd09uRHJhZygpKVxuICAgIHtcbiAgICAgICAgcmVuZGVyLlJlbmRlclBDQihsYXllcmRpY3QpO1xuICAgIH1cbiAgICByZW5kZXIuZHJhd0hpZ2hsaWdodHMoKTtcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93biA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVNb3VzZU1vdmUoZSwgbGF5ZXJkaWN0KVxue1xuICAgIGlmICghbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd24pXG4gICAge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGxldCBkeCA9IGUub2Zmc2V0WCAtIGxheWVyZGljdC50cmFuc2Zvcm0ubW91c2VzdGFydHg7XG4gICAgbGV0IGR5ID0gZS5vZmZzZXRZIC0gbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZXN0YXJ0eTtcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLnBhbnggKz0gMiAqIGR4IC8gbGF5ZXJkaWN0LnRyYW5zZm9ybS56b29tO1xuICAgIGxheWVyZGljdC50cmFuc2Zvcm0ucGFueSArPSAyICogZHkgLyBsYXllcmRpY3QudHJhbnNmb3JtLnpvb207XG4gICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZXN0YXJ0eCA9IGUub2Zmc2V0WDtcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlc3RhcnR5ID0gZS5vZmZzZXRZO1xuXG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0UmVkcmF3T25EcmFnKCkpXG4gICAge1xuICAgICAgICByZW5kZXIuUmVuZGVyUENCKGxheWVyZGljdCk7XG4gICAgICAgIHJlbmRlci5kcmF3SGlnaGxpZ2h0cygpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlTW91c2VXaGVlbChlLCBsYXllcmRpY3QpXG57XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgdmFyIHQgPSBsYXllcmRpY3QudHJhbnNmb3JtO1xuICAgIHZhciB3aGVlbGRlbHRhID0gZS5kZWx0YVk7XG4gICAgaWYgKGUuZGVsdGFNb2RlID09IDEpXG4gICAge1xuICAgICAgICAvLyBGRiBvbmx5LCBzY3JvbGwgYnkgbGluZXNcbiAgICAgICAgd2hlZWxkZWx0YSAqPSAzMDtcbiAgICB9XG4gICAgZWxzZSBpZiAoZS5kZWx0YU1vZGUgPT0gMilcbiAgICB7XG4gICAgICAgIHdoZWVsZGVsdGEgKj0gMzAwO1xuICAgIH1cblxuICAgIHZhciBtID0gTWF0aC5wb3coMS4xLCAtd2hlZWxkZWx0YSAvIDQwKTtcbiAgICAvLyBMaW1pdCBhbW91bnQgb2Ygem9vbSBwZXIgdGljay5cbiAgICBpZiAobSA+IDIpXG4gICAge1xuICAgICAgICBtID0gMjtcbiAgICB9XG4gICAgZWxzZSBpZiAobSA8IDAuNSlcbiAgICB7XG4gICAgICAgIG0gPSAwLjU7XG4gICAgfVxuXG4gICAgdC56b29tICo9IG07XG4gICAgdmFyIHpvb21kID0gKDEgLSBtKSAvIHQuem9vbTtcbiAgICB0LnBhbnggKz0gMiAqIGUub2Zmc2V0WCAqIHpvb21kO1xuICAgIHQucGFueSArPSAyICogZS5vZmZzZXRZICogem9vbWQ7XG4gICAgcmVuZGVyLlJlbmRlclBDQihsYXllcmRpY3QpO1xuICAgIHJlbmRlci5kcmF3SGlnaGxpZ2h0cygpO1xufVxuXG5mdW5jdGlvbiBhZGRNb3VzZUhhbmRsZXJzKGRpdiwgbGF5ZXJkaWN0KVxue1xuICAgIGRpdi5vbm1vdXNlY2xpY2sgPSBmdW5jdGlvbihlKVxuICAgIHtcbiAgICAgICAgaGFuZGxlTW91c2VDbGljayhlLCBsYXllcmRpY3QpO1xuICAgIH07XG5cbiAgICBkaXYub25tb3VzZWRvd24gPSBmdW5jdGlvbihlKVxuICAgIHtcbiAgICAgICAgaGFuZGxlTW91c2VEb3duKGUsIGxheWVyZGljdCk7XG4gICAgfTtcblxuICAgIGRpdi5vbm1vdXNlbW92ZSA9IGZ1bmN0aW9uKGUpXG4gICAge1xuICAgICAgICBoYW5kbGVNb3VzZU1vdmUoZSwgbGF5ZXJkaWN0KTtcbiAgICB9O1xuXG4gICAgZGl2Lm9ubW91c2V1cCA9IGZ1bmN0aW9uKGUpXG4gICAge1xuICAgICAgICBoYW5kbGVNb3VzZVVwKGUsIGxheWVyZGljdCk7XG4gICAgfTtcblxuICAgIGRpdi5vbm1vdXNlb3V0ID0gZnVuY3Rpb24oZSlcbiAgICB7XG4gICAgICAgIGhhbmRsZU1vdXNlVXAoZSwgbGF5ZXJkaWN0KTtcbiAgICB9O1xuXG4gICAgZGl2Lm9ud2hlZWwgPSBmdW5jdGlvbihlKVxuICAgIHtcbiAgICAgICAgaGFuZGxlTW91c2VXaGVlbChlLCBsYXllcmRpY3QpO1xuICAgIH07XG5cblxuICAgIGZvciAodmFyIGVsZW1lbnQgb2YgW2Rpdl0pXG4gICAge1xuICAgICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjb250ZXh0bWVudVwiLCBmdW5jdGlvbihlKVxuICAgICAgICB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH0sIGZhbHNlKTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGFkZE1vdXNlSGFuZGxlcnMsIHNtb290aFNjcm9sbFRvUm93XG59O1xuIiwidmFyIGdsb2JhbERhdGEgPSByZXF1aXJlKFwiLi9nbG9iYWwuanNcIik7XG52YXIgcmVuZGVyICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlci5qc1wiKTtcbnZhciBpcGNiICAgICAgID0gcmVxdWlyZShcIi4vaXBjYi5qc1wiKTtcbnZhciBwY2IgICAgICAgID0gcmVxdWlyZShcIi4vcGNiLmpzXCIpO1xudmFyIGxheWVyVGFibGUgPSByZXF1aXJlKFwiLi9sYXllcl90YWJsZS5qc1wiKVxudmFyIGJvbVRhYmxlICAgPSByZXF1aXJlKFwiLi9ib21fdGFibGUuanNcIilcblxuY29uc3QgYm9hcmRSb3RhdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9hcmRSb3RhdGlvblwiKTtcbmJvYXJkUm90YXRpb24ub25pbnB1dD1mdW5jdGlvbigpXG57XG4gICAgcmVuZGVyLlNldEJvYXJkUm90YXRpb24oYm9hcmRSb3RhdGlvbi52YWx1ZSk7XG59O1xuXG5jb25zdCBkYXJrTW9kZUJveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGFya21vZGVDaGVja2JveFwiKTtcbmRhcmtNb2RlQm94Lm9uY2hhbmdlID0gZnVuY3Rpb24gKClcbntcbiAgICBpcGNiLnNldERhcmtNb2RlKGRhcmtNb2RlQm94LmNoZWNrZWQpO1xufTtcblxuY29uc3QgaGlnaGxpZ2h0cGluMUNoZWNrYm94ID1kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhpZ2hsaWdodHBpbjFDaGVja2JveFwiKTtcbmhpZ2hsaWdodHBpbjFDaGVja2JveC5vbmNoYW5nZT1mdW5jdGlvbigpXG57XG4gICAgZ2xvYmFsRGF0YS5zZXRIaWdobGlnaHRQaW4xKGhpZ2hsaWdodHBpbjFDaGVja2JveC5jaGVja2VkKTtcbiAgICByZW5kZXIuUmVuZGVyUENCKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIHJlbmRlci5SZW5kZXJQQ0IoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrKTtcbn07XG5cbmNvbnN0IGRyYWdDaGVja2JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZHJhZ0NoZWNrYm94XCIpO1xuZHJhZ0NoZWNrYm94LmNoZWNrZWQ9ZnVuY3Rpb24oKVxue1xuICAgIGdsb2JhbERhdGEuc2V0UmVkcmF3T25EcmFnKGRyYWdDaGVja2JveC5jaGVja2VkKTtcbn07XG5kcmFnQ2hlY2tib3gub25jaGFuZ2U9ZnVuY3Rpb24oKVxue1xuICAgIGdsb2JhbERhdGEuc2V0UmVkcmF3T25EcmFnKGRyYWdDaGVja2JveC5jaGVja2VkKTtcbn07XG5cblxuY29uc3QgY29tYmluZVZhbHVlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29tYmluZVZhbHVlc1wiKTtcbmNvbWJpbmVWYWx1ZXMub25jaGFuZ2U9ZnVuY3Rpb24oKVxue1xuICAgIGdsb2JhbERhdGEuc2V0Q29tYmluZVZhbHVlcyhjb21iaW5lVmFsdWVzLmNoZWNrZWQpO1xuICAgIGJvbVRhYmxlLnBvcHVsYXRlQm9tVGFibGUoKTtcbn07XG5cblxuY29uc3QgaGlkZVBsYWNlZFBhcnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoaWRlUGxhY2VkUGFydHNcIik7XG5oaWRlUGxhY2VkUGFydHMub25jaGFuZ2U9ZnVuY3Rpb24oKVxue1xuICAgIGdsb2JhbERhdGEuc2V0SGlkZVBsYWNlZFBhcnRzKGhpZGVQbGFjZWRQYXJ0cy5jaGVja2VkKTtcbiAgICBib21UYWJsZS5wb3B1bGF0ZUJvbVRhYmxlKCk7XG59O1xuXG5jb25zdCBkZWJ1Z01vZGVCb3ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnTW9kZVwiKTtcbmRlYnVnTW9kZUJveC5vbmNoYW5nZT1mdW5jdGlvbigpXG57XG4gICAgZ2xvYmFsRGF0YS5zZXREZWJ1Z01vZGUoZGVidWdNb2RlQm94LmNoZWNrZWQpO1xuICAgIHJlbmRlci5SZW5kZXJQQ0IoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5mcm9udCk7XG4gICAgcmVuZGVyLlJlbmRlclBDQihnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xufTtcblxuXG5cbi8qIEJPTSBUYWJsZSBGSWx0ZXIgKi9cbmNvbnN0IGZpbHRlckJPTSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWZpbHRlclwiKTtcbmZpbHRlckJPTS5vbmlucHV0PWZ1bmN0aW9uKClcbntcbiAgICBib21UYWJsZS5GaWx0ZXIoZmlsdGVyQk9NLnZhbHVlKTtcbn07XG5cbmNvbnN0IGNsZWFyRmlsdGVyQk9NID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhckJPTVNlYXJjaFwiKTtcbmNsZWFyRmlsdGVyQk9NLm9uY2xpY2s9ZnVuY3Rpb24oKVxue1xuICAgIGZpbHRlckJPTS52YWx1ZT1cIlwiO1xuICAgIGJvbVRhYmxlLkZpbHRlcihmaWx0ZXJCT00udmFsdWUpO1xufTtcblxuY29uc3QgcmVtb3ZlQk9NRW50cmllcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVtb3ZlQk9NRW50cmllc1wiKTtcbnJlbW92ZUJPTUVudHJpZXMub25pbnB1dD1mdW5jdGlvbigpXG57XG4gICAgYm9tVGFibGUuRmlsdGVyQnlBdHRyaWJ1dGUocmVtb3ZlQk9NRW50cmllcy52YWx1ZSk7XG59O1xuXG5cbi8qIExheWVyIFRhYmxlIEZpbHRlciAqL1xuY29uc3QgZmlsdGVyTGF5ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyLWZpbHRlclwiKTtcbmZpbHRlckxheWVyLm9uaW5wdXQ9ZnVuY3Rpb24oKVxue1xuICAgIGxheWVyVGFibGUuRmlsdGVyKGZpbHRlckxheWVyLnZhbHVlKTtcbn07XG5cbmNvbnN0IGNsZWFyRmlsdGVyTGF5ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsZWFyTGF5ZXJTZWFyY2hcIik7XG5jbGVhckZpbHRlckxheWVyLm9uY2xpY2s9ZnVuY3Rpb24oKVxue1xuICAgIGZpbHRlckxheWVyLnZhbHVlPVwiXCI7XG4gICAgbGF5ZXJUYWJsZS5GaWx0ZXIoZmlsdGVyTGF5ZXIudmFsdWUpO1xufTtcblxuXG5cblxuXG5jb25zdCBib21DaGVja2JveGVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21DaGVja2JveGVzXCIpO1xuYm9tQ2hlY2tib3hlcy5vbmlucHV0PWZ1bmN0aW9uKClcbntcbiAgICBib21UYWJsZS5zZXRCb21DaGVja2JveGVzKGJvbUNoZWNrYm94ZXMudmFsdWUpO1xufTtcblxuY29uc3QgYWRkaXRpb25hbEF0dHJpYnV0ZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZGl0aW9uYWxBdHRyaWJ1dGVzXCIpO1xuYWRkaXRpb25hbEF0dHJpYnV0ZXMub25pbnB1dD1mdW5jdGlvbigpXG57XG4gICAgaXBjYi5zZXRBZGRpdGlvbmFsQXR0cmlidXRlcyhhZGRpdGlvbmFsQXR0cmlidXRlcy52YWx1ZSk7XG59O1xuXG5jb25zdCBmbF9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZsLWJ0blwiKTtcbmZsX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLmNoYW5nZUNhbnZhc0xheW91dChcIkZcIik7XG59O1xuXG5jb25zdCBmYl9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZiLWJ0blwiKTtcbmZiX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLmNoYW5nZUNhbnZhc0xheW91dChcIkZCXCIpO1xufTtcblxuY29uc3QgZnVsbHNjcmVlbl9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpO1xuZnVsbHNjcmVlbl9idG4ub25jbGljaz1mdW5jdGlvbigpXG57XG4gICAgaXBjYi50b2dnbGVGdWxsU2NyZWVuKCk7XG59O1xuXG5jb25zdCBibF9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJsLWJ0blwiKTtcbmJsX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLmNoYW5nZUNhbnZhc0xheW91dChcIkJcIik7XG59O1xuXG5jb25zdCBib21fYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tYnRuXCIpO1xuYm9tX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLmNoYW5nZUJvbUxheW91dChcIkJPTVwiKTtcbn07XG5cbmNvbnN0IGxyX2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWxyLWJ0blwiKTtcbmxyX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLmNoYW5nZUJvbUxheW91dChcIkxSXCIpO1xufTtcblxuY29uc3QgdGJfYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tdGItYnRuXCIpO1xudGJfYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxue1xuICAgIGlwY2IuY2hhbmdlQm9tTGF5b3V0KFwiVEJcIik7XG59O1xuXG5jb25zdCBwY2JfYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwY2ItYnRuXCIpO1xucGNiX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLmNoYW5nZUJvbUxheW91dChcIlBDQlwiKTtcbn07XG5cbmNvbnN0IGxheV9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheS1idG5cIik7XG5sYXlfYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxue1xuICAgIGlwY2IuTGF5ZXJUYWJsZV9Ub2dnbGUoKTtcbiAgICBpcGNiLlRlc3RQb2ludFRhYmxlX09mZigpO1xuICAgIGlwY2IuVHJhY2VUYWJsZV9PZmYoKTtcbiAgICBpcGNiLlJlbmRlcl9SaWdodFNjcmVlblRhYmxlKCk7XG59O1xuXG5jb25zdCB0cmFjZV9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRyYWNlLWJ0blwiKTtcbnRyYWNlX2J0bi5vbmNsaWNrPWZ1bmN0aW9uKClcbntcbiAgICBpcGNiLkxheWVyVGFibGVfT2ZmKCk7XG4gICAgaXBjYi5UcmFjZVRhYmxlX1RvZ2dsZSgpO1xuICAgIGlwY2IuVGVzdFBvaW50VGFibGVfT2ZmKCk7XG4gICAgaXBjYi5SZW5kZXJfUmlnaHRTY3JlZW5UYWJsZSgpO1xufTtcblxuY29uc3QgdGVzdHBvaW50X2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGVzdHBvaW50LWJ0blwiKTtcbnRlc3Rwb2ludF9idG4ub25jbGljaz1mdW5jdGlvbigpXG57XG4gICAgaXBjYi5MYXllclRhYmxlX09mZigpO1xuICAgIGlwY2IuVHJhY2VUYWJsZV9PZmYoKTtcbiAgICBpcGNiLlRlc3RQb2ludFRhYmxlX1RvZ2dsZSgpO1xuICAgIGlwY2IuUmVuZGVyX1JpZ2h0U2NyZWVuVGFibGUoKTtcbn07XG5cbmNvbnN0IGxvYWRfcGNiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwY2JGaWxlSW5wdXRcIik7XG5sb2FkX3BjYi5vbmNoYW5nZT1mdW5jdGlvbigpXG57XG4gIC8vIENoZWNrIGZvciB0aGUgdmFyaW91cyBGaWxlIEFQSSBzdXBwb3J0LlxuICBpZiAod2luZG93LkZpbGVSZWFkZXIpXG4gIHtcbiAgICAgIC8vIEZpbGVSZWFkZXIgYXJlIHN1cHBvcnRlZC5cblxuICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAvLyBSZWFkIGZpbGUgaW50byBtZW1vcnkgYXMgVVRGLThcbiAgICByZWFkZXIucmVhZEFzVGV4dChsb2FkX3BjYi5maWxlc1swXSk7XG5cbiAgICAvLyBIYW5kbGUgZXJyb3JzIGxvYWRcbiAgICByZWFkZXIub25sb2FkID0gZnVuY3Rpb24gbG9hZEhhbmRsZXIoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBjYmRhdGEgPSBKU09OLnBhcnNlKGV2ZW50LnRhcmdldC5yZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRGVsZXRlIGFsbCBjYW52YXMgZW50cmllc1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTG9hZCBuZXcgUENCIGRhdGEgZmlsZVxuICAgICAgICAgICAgICAgICAgICAgICAgaXBjYi5Mb2FkUENCKHBjYmRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXBjYi5jaGFuZ2VCb21MYXlvdXQoZ2xvYmFsRGF0YS5nZXRCb21MYXlvdXQoKSk7XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICByZWFkZXIub25lcnJvciA9IGZ1bmN0aW9uIGVycm9ySGFuZGxlcihldnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoZXZ0LnRhcmdldC5lcnJvci5uYW1lID09IFwiTm90UmVhZGFibGVFcnJvclwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbGVydChcIkNhbm5vdCByZWFkIGZpbGUgIVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuICB9XG4gIGVsc2VcbiAge1xuICAgICAgYWxlcnQoJ0ZpbGVSZWFkZXIgYXJlIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyLicpO1xuICB9XG59XG4iLCIvKiBET00gbWFuaXB1bGF0aW9uIGFuZCBtaXNjIGNvZGUgKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cblxudmFyIFNwbGl0ICAgICAgICAgICAgID0gcmVxdWlyZShcInNwbGl0LmpzXCIpO1xudmFyIGdsb2JhbERhdGEgICAgICAgID0gcmVxdWlyZShcIi4vZ2xvYmFsLmpzXCIpO1xudmFyIHJlbmRlciAgICAgICAgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyLmpzXCIpO1xudmFyIHJlbmRlckNhbnZhcyAgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyL3JlbmRlcl9DYW52YXMuanNcIik7XG52YXIgcGNiICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XG52YXIgaGFuZGxlcnNfbW91c2UgICAgPSByZXF1aXJlKFwiLi9oYW5kbGVyc19tb3VzZS5qc1wiKTtcbnZhciBsYXllclRhYmxlICAgICAgICA9IHJlcXVpcmUoXCIuL2xheWVyX3RhYmxlLmpzXCIpO1xudmFyIGJvbVRhYmxlICAgICAgICAgID0gcmVxdWlyZShcIi4vYm9tX3RhYmxlLmpzXCIpO1xudmFyIE1ldGFkYXRhICAgICAgICAgID0gcmVxdWlyZShcIi4vTWV0YWRhdGEuanNcIikuTWV0YWRhdGE7XG5cbnZhciBQQ0JfVHJhY2UgPSByZXF1aXJlKFwiLi9QQ0IvUENCX1RyYWNlLmpzXCIpLlBDQl9UcmFjZTtcbnZhciBQQ0JfVGVzdFBvaW50ICA9IHJlcXVpcmUoXCIuL1BDQi9QQ0JfVGVzdFBvaW50LmpzXCIpLlBDQl9UZXN0UG9pbnQ7XG52YXIgUENCX0xheWVyID0gcmVxdWlyZShcIi4vUENCL1BDQl9MYXllci5qc1wiKS5QQ0JfTGF5ZXI7XG52YXIgUENCX1BhcnQgID0gcmVxdWlyZShcIi4vUENCL1BDQl9QYXJ0LmpzXCIpLlBDQl9QYXJ0O1xuXG52YXIgUmVuZGVyX0xheWVyID0gcmVxdWlyZShcIi4vcmVuZGVyL1JlbmRlcl9MYXllci5qc1wiKS5SZW5kZXJfTGF5ZXI7XG52YXIgdmVyc2lvbiAgICAgICAgICAgPSByZXF1aXJlKFwiLi92ZXJzaW9uLmpzXCIpO1xuXG52YXIgRnVsbHNjcmVlbiA9IHJlcXVpcmUoXCIuL2Z1bGxzY3JlZW4uanNcIik7XG52YXIgY29sb3JNYXAgICAgICAgID0gcmVxdWlyZShcIi4vY29sb3JtYXAuanNcIik7XG5cblxudmFyIHJpZ2h0U2lkZVRhYmxlID0gcmVxdWlyZShcIi4vUmlnaHRTaWRlU2NyZWVuVGFibGUuanNcIilcblxuXG4vKiBMYXllciB0YWJsZSAqL1xubGV0IGxheWVyVGFibGVWaXNhYmxlICAgICA9IHRydWU7XG5sZXQgdHJhY2VUYWJsZVZpc2FibGUgICAgID0gZmFsc2U7XG5sZXQgdGVzdFBvaW50VGFibGVWaXNhYmxlID0gZmFsc2U7XG5cbmxldCByaWdodFNjcmVlblRhYmxlVmlzYWJsZSA9IGxheWVyVGFibGVWaXNhYmxlIHx8IHRyYWNlVGFibGVWaXNhYmxlIHx8IHRlc3RQb2ludFRhYmxlVmlzYWJsZTtcbmxldCBtYWluTGF5b3V0ID0gXCJcIjtcblxuXG5cbmZ1bmN0aW9uIHNldERhcmtNb2RlKHZhbHVlKVxue1xuICAgIGxldCB0b3Btb3N0ZGl2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0b3Btb3N0ZGl2XCIpO1xuICAgIGlmICh2YWx1ZSlcbiAgICB7XG4gICAgICAgIHRvcG1vc3RkaXYuY2xhc3NMaXN0LmFkZChcImRhcmtcIik7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIHRvcG1vc3RkaXYuY2xhc3NMaXN0LnJlbW92ZShcImRhcmtcIik7XG4gICAgfVxuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiZGFya21vZGVcIiwgdmFsdWUpO1xuXG5cbiAgICBjb25zdCBzaGVldHMgPSBkb2N1bWVudC5zdHlsZVNoZWV0c1swXS5ydWxlcztcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc2hlZXRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKVxuICAgIHtcbiAgICAgICAgaWYgKHNoZWV0c1tpXS5zZWxlY3RvclRleHQgPT0gJy5sYXllcl9jaGVja2JveCcpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgc2hlZXRzW2ldLnN0eWxlWydmaWx0ZXInXSA9ICdpbnZlcnQoMTAwJSknO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICBzaGVldHNbaV0uc3R5bGVbJ2ZpbHRlciddID0gJ2ludmVydCgwJSknO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZW5kZXIuUmVuZGVyUENCKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIHJlbmRlci5SZW5kZXJQQ0IoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrKTtcbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0UHJldmlvdXNSb3coZXZlbnQpXG57XG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKS5sZW5ndGggPT0gMSlcbiAgICB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpLmxlbmd0aCAtIDE7IGkrKylcbiAgICAgICAge1xuICAgICAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0SGFuZGxlcnMoKVtpICsgMV0uaWQgPT0gZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0SGFuZGxlcnMoKVtpXS5oYW5kbGVyKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBoYW5kbGVyc19tb3VzZS5zbW9vdGhTY3JvbGxUb1JvdyhnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0TmV4dFJvdyhldmVudClcbntcbiAgICBpZiAoZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpLmxlbmd0aCA9PSAxKVxuICAgIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKCkubGVuZ3RoOyBpKyspXG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKClbaSAtIDFdLmlkID09IGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKClbaV0uaGFuZGxlcihldmVudCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaGFuZGxlcnNfbW91c2Uuc21vb3RoU2Nyb2xsVG9Sb3coZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1vZHVsZXNDbGlja2VkKHJlZmVyZW5jZXMpXG57XG4gICAgbGV0IGxhc3RDbGlja2VkSW5kZXggPSByZWZlcmVuY2VzLmluZGV4T2YoZ2xvYmFsRGF0YS5nZXRMYXN0Q2xpY2tlZFJlZigpKTtcbiAgICBsZXQgcmVmID0gcmVmZXJlbmNlc1sobGFzdENsaWNrZWRJbmRleCArIDEpICUgcmVmZXJlbmNlcy5sZW5ndGhdO1xuICAgIGZvciAobGV0IGhhbmRsZXIgb2YgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpKVxuICAgIHtcbiAgICAgICAgaWYgKGhhbmRsZXIucmVmcy5pbmRleE9mKHJlZikgPj0gMClcbiAgICAgICAge1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRMYXN0Q2xpY2tlZFJlZihyZWYpO1xuICAgICAgICAgICAgaGFuZGxlci5oYW5kbGVyKCk7XG4gICAgICAgICAgICBoYW5kbGVyc19tb3VzZS5zbW9vdGhTY3JvbGxUb1JvdyhnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNoYW5nZUNhbnZhc0xheW91dChsYXlvdXQpXG57XG4gICAgaWYobWFpbkxheW91dCAhPSBcIkJPTVwiKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmbC1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmYi1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJibC1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcblxuICAgICAgICBzd2l0Y2ggKGxheW91dClcbiAgICAgICAge1xuICAgICAgICBjYXNlIFwiRlwiOlxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmbC1idG5cIikuY2xhc3NMaXN0LmFkZChcImRlcHJlc3NlZFwiKTtcbiAgICAgICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEJvbUxheW91dCgpICE9IFwiQk9NXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5jb2xsYXBzZUNhbnZhc1NwbGl0KDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJCXCI6XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJsLWJ0blwiKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xuICAgICAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tTGF5b3V0KCkgIT0gXCJCT01cIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLmNvbGxhcHNlQ2FudmFzU3BsaXQoMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmItYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRCb21MYXlvdXQoKSAhPSBcIkJPTVwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0U2l6ZXNDYW52YXNTcGxpdChbNTAsIDUwXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzTGF5b3V0KGxheW91dCk7XG4gICAgICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiY2FudmFzbGF5b3V0XCIsIGxheW91dCk7XG4gICAgICAgIHJlbmRlci5yZXNpemVBbGwoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlTWV0YWRhdGEoKVxue1xuICAgIGxldCBtZXRhZGF0YSA9IE1ldGFkYXRhLkdldEluc3RhbmNlKCk7XG4gICAgbWV0YWRhdGEuU2V0KHBjYmRhdGEubWV0YWRhdGEpO1xuXG4gICAgaWYobWV0YWRhdGEucmV2aXNpb24gPT0gdW5kZWZpbmVkKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZXZpc2lvblwiKS5pbm5lckhUTUwgPSBcIlwiO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJldmlzaW9uXCIpLmlubmVySFRNTCA9IFwiUmV2aXNpb246IFwiICsgbWV0YWRhdGEucmV2aXNpb24udG9TdHJpbmcoKTtcbiAgICB9XG5cbiAgICBpZihtZXRhZGF0YS5jb21wYW55ID09IHVuZGVmaW5lZClcbiAgICB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29tcGFueVwiKS5pbm5lckhUTUwgPSBcIlwiO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvbXBhbnlcIikuaW5uZXJIVE1MICA9IG1ldGFkYXRhLmNvbXBhbnk7XG4gICAgfVxuXG4gICAgaWYobWV0YWRhdGEucHJvamVjdF9uYW1lID09IHVuZGVmaW5lZClcbiAgICB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGl0bGVcIikuaW5uZXJIVE1MID0gXCJcIjtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0aXRsZVwiKS5pbm5lckhUTUwgPSBtZXRhZGF0YS5wcm9qZWN0X25hbWU7XG4gICAgfVxuXG4gICAgaWYobWV0YWRhdGEuZGF0ZSA9PSB1bmRlZmluZWQpXG4gICAge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbGVkYXRlXCIpLmlubmVySFRNTCA9IFwiXCI7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmlsZWRhdGVcIikuaW5uZXJIVE1MID0gbWV0YWRhdGEuZGF0ZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZvY3VzSW5wdXRGaWVsZChpbnB1dClcbntcbiAgICBpbnB1dC5zY3JvbGxJbnRvVmlldyhmYWxzZSk7XG4gICAgaW5wdXQuZm9jdXMoKTtcbiAgICBpbnB1dC5zZWxlY3QoKTtcbn1cblxuZnVuY3Rpb24gZm9jdXNCT01GaWx0ZXJGaWVsZCgpXG57XG4gICAgZm9jdXNJbnB1dEZpZWxkKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWZpbHRlclwiKSk7XG59XG5cbmZ1bmN0aW9uIHRvZ2dsZUJvbUNoZWNrYm94KGJvbXJvd2lkLCBjaGVja2JveG51bSlcbntcbiAgICBpZiAoIWJvbXJvd2lkIHx8IGNoZWNrYm94bnVtID4gZ2xvYmFsRGF0YS5nZXRDaGVja2JveGVzKCkubGVuZ3RoKVxuICAgIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgYm9tcm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYm9tcm93aWQpO1xuICAgIGxldCBjaGVja2JveCA9IGJvbXJvdy5jaGlsZE5vZGVzW2NoZWNrYm94bnVtXS5jaGlsZE5vZGVzWzBdO1xuICAgIGNoZWNrYm94LmNoZWNrZWQgPSAhY2hlY2tib3guY2hlY2tlZDtcbiAgICBjaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gICAgY2hlY2tib3gub25jaGFuZ2UoKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlR3V0dGVyTm9kZShub2RlKVxue1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxuICAgIHtcbiAgICAgICAgaWYgKCAgICAobm9kZS5jaGlsZE5vZGVzW2ldLmNsYXNzTGlzdCApXG4gICAgICAgICAgICAgJiYgKG5vZGUuY2hpbGROb2Rlc1tpXS5jbGFzc0xpc3QuY29udGFpbnMoXCJndXR0ZXJcIikpXG4gICAgICAgIClcbiAgICAgICAge1xuICAgICAgICAgICAgbm9kZS5yZW1vdmVDaGlsZChub2RlLmNoaWxkTm9kZXNbaV0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFuR3V0dGVycygpXG57XG4gICAgcmVtb3ZlR3V0dGVyTm9kZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvdFwiKSk7XG4gICAgcmVtb3ZlR3V0dGVyTm9kZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc2RpdlwiKSk7XG59XG5cbmZ1bmN0aW9uIHNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKHZhbHVlKVxue1xuICAgIGdsb2JhbERhdGEuc2V0QWRkaXRpb25hbEF0dHJpYnV0ZXModmFsdWUpO1xuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiYWRkaXRpb25hbEF0dHJpYnV0ZXNcIiwgdmFsdWUpO1xuICAgIGJvbVRhYmxlLnBvcHVsYXRlQm9tVGFibGUoKTtcbn1cblxuLy8gWFhYOiBOb25lIG9mIHRoaXMgc2VlbXMgdG8gYmUgd29ya2luZy5cbmRvY3VtZW50Lm9ua2V5ZG93biA9IGZ1bmN0aW9uKGUpXG57XG4gICAgc3dpdGNoIChlLmtleSlcbiAgICB7XG4gICAgICAgIGNhc2UgXCJBcnJvd1VwXCI6XG4gICAgICAgICAgICBoaWdobGlnaHRQcmV2aW91c1JvdyhlKTtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiQXJyb3dEb3duXCI6XG4gICAgICAgICAgICBoaWdobGlnaHROZXh0Um93KGUpO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJGMTFcIjpcbiAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChlLmFsdEtleSlcbiAgICB7XG4gICAgICAgIHN3aXRjaCAoZS5rZXkpXG4gICAgICAgIHtcbiAgICAgICAgY2FzZSBcImZcIjpcbiAgICAgICAgICAgIGZvY3VzQk9NRmlsdGVyRmllbGQoKTtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwielwiOlxuICAgICAgICAgICAgY2hhbmdlQm9tTGF5b3V0KFwiQk9NXCIpO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ4XCI6XG4gICAgICAgICAgICBjaGFuZ2VCb21MYXlvdXQoXCJMUlwiKTtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY1wiOlxuICAgICAgICAgICAgY2hhbmdlQm9tTGF5b3V0KFwiVEJcIik7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZcIjpcbiAgICAgICAgICAgIGNoYW5nZUNhbnZhc0xheW91dChcIkZcIik7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImJcIjpcbiAgICAgICAgICAgIGNoYW5nZUNhbnZhc0xheW91dChcIkZCXCIpO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJuXCI6XG4gICAgICAgICAgICBjaGFuZ2VDYW52YXNMYXlvdXQoXCJCXCIpO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn07XG5cblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXktYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG5mdW5jdGlvbiBMYXllclRhYmxlX1RvZ2dsZSgpXG57XG4gICAgaWYgKGxheWVyVGFibGVWaXNhYmxlKVxuICAgIHtcbiAgICAgICAgbGF5ZXJUYWJsZVZpc2FibGUgPSBmYWxzZTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXktYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGxheWVyVGFibGVWaXNhYmxlID0gdHJ1ZTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXktYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgfVxuICAgIHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlID0gbGF5ZXJUYWJsZVZpc2FibGUgfHwgdHJhY2VUYWJsZVZpc2FibGUgfHwgdGVzdFBvaW50VGFibGVWaXNhYmxlO1xuICAgIGNoYW5nZUJvbUxheW91dChtYWluTGF5b3V0KTtcbn1cblxuZnVuY3Rpb24gTGF5ZXJUYWJsZV9PZmYoKVxue1xuICAgIGxheWVyVGFibGVWaXNhYmxlID0gZmFsc2U7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXktYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG4gICAgcmlnaHRTY3JlZW5UYWJsZVZpc2FibGUgPSBsYXllclRhYmxlVmlzYWJsZSB8fCB0cmFjZVRhYmxlVmlzYWJsZSB8fCB0ZXN0UG9pbnRUYWJsZVZpc2FibGU7XG4gICAgY2hhbmdlQm9tTGF5b3V0KG1haW5MYXlvdXQpO1xufVxuXG5mdW5jdGlvbiBMYXllclRhYmxlX09uKClcbntcbiAgICBsYXllclRhYmxlVmlzYWJsZSA9IHRydWU7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXktYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgcmlnaHRTY3JlZW5UYWJsZVZpc2FibGUgPSBsYXllclRhYmxlVmlzYWJsZSB8fCB0cmFjZVRhYmxlVmlzYWJsZSB8fCB0ZXN0UG9pbnRUYWJsZVZpc2FibGU7XG4gICAgY2hhbmdlQm9tTGF5b3V0KG1haW5MYXlvdXQpO1xufVxuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRyYWNlLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuZnVuY3Rpb24gVHJhY2VUYWJsZV9Ub2dnbGUoKVxue1xuICAgIGlmICh0cmFjZVRhYmxlVmlzYWJsZSlcbiAgICB7XG4gICAgICAgIHRyYWNlVGFibGVWaXNhYmxlID0gZmFsc2U7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHJhY2UtYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIHRyYWNlVGFibGVWaXNhYmxlID0gdHJ1ZTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0cmFjZS1idG5cIikuY2xhc3NMaXN0LmFkZChcImRlcHJlc3NlZFwiKTtcbiAgICB9XG4gICAgcmlnaHRTY3JlZW5UYWJsZVZpc2FibGUgPSBsYXllclRhYmxlVmlzYWJsZSB8fCB0cmFjZVRhYmxlVmlzYWJsZSB8fCB0ZXN0UG9pbnRUYWJsZVZpc2FibGU7XG4gICAgY2hhbmdlQm9tTGF5b3V0KG1haW5MYXlvdXQpO1xufVxuXG5mdW5jdGlvbiBUcmFjZVRhYmxlX09mZigpXG57XG4gICAgdHJhY2VUYWJsZVZpc2FibGUgPSBmYWxzZTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRyYWNlLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgIHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlID0gbGF5ZXJUYWJsZVZpc2FibGUgfHwgdHJhY2VUYWJsZVZpc2FibGUgfHwgdGVzdFBvaW50VGFibGVWaXNhYmxlO1xuICAgIGNoYW5nZUJvbUxheW91dChtYWluTGF5b3V0KTtcbn1cblxuZnVuY3Rpb24gVHJhY2VUYWJsZV9PbigpXG57XG4gICAgdHJhY2VUYWJsZVZpc2FibGUgPSB0cnVlO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHJhY2UtYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgcmlnaHRTY3JlZW5UYWJsZVZpc2FibGUgPSBsYXllclRhYmxlVmlzYWJsZSB8fCB0cmFjZVRhYmxlVmlzYWJsZSB8fCB0ZXN0UG9pbnRUYWJsZVZpc2FibGU7XG4gICAgY2hhbmdlQm9tTGF5b3V0KG1haW5MYXlvdXQpO1xufVxuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRlc3Rwb2ludC1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcbmZ1bmN0aW9uIFRlc3RQb2ludFRhYmxlX1RvZ2dsZSgpXG57XG4gICAgaWYgKHRlc3RQb2ludFRhYmxlVmlzYWJsZSlcbiAgICB7XG4gICAgICAgIHRlc3RQb2ludFRhYmxlVmlzYWJsZSA9IGZhbHNlO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRlc3Rwb2ludC1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgdGVzdFBvaW50VGFibGVWaXNhYmxlID0gdHJ1ZTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0ZXN0cG9pbnQtYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgfVxuICAgIHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlID0gbGF5ZXJUYWJsZVZpc2FibGUgfHwgdHJhY2VUYWJsZVZpc2FibGUgfHwgdGVzdFBvaW50VGFibGVWaXNhYmxlO1xuICAgIGNoYW5nZUJvbUxheW91dChtYWluTGF5b3V0KTtcbn1cblxuZnVuY3Rpb24gVGVzdFBvaW50VGFibGVfT2ZmKClcbntcbiAgICB0ZXN0UG9pbnRUYWJsZVZpc2FibGUgPSBmYWxzZTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRlc3Rwb2ludC1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcbiAgICByaWdodFNjcmVlblRhYmxlVmlzYWJsZSA9IGxheWVyVGFibGVWaXNhYmxlIHx8IHRyYWNlVGFibGVWaXNhYmxlIHx8IHRlc3RQb2ludFRhYmxlVmlzYWJsZTtcbiAgICBjaGFuZ2VCb21MYXlvdXQobWFpbkxheW91dCk7XG59XG5cbmZ1bmN0aW9uIFRlc3RQb2ludFRhYmxlX09uKClcbntcbiAgICB0ZXN0UG9pbnRUYWJsZVZpc2FibGUgPSB0cnVlO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGVzdHBvaW50LWJ0blwiKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xuICAgIHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlID0gbGF5ZXJUYWJsZVZpc2FibGUgfHwgdHJhY2VUYWJsZVZpc2FibGUgfHwgdGVzdFBvaW50VGFibGVWaXNhYmxlO1xuICAgIGNoYW5nZUJvbUxheW91dChtYWluTGF5b3V0KTtcbn1cblxuZnVuY3Rpb24gUmVuZGVyX1JpZ2h0U2NyZWVuVGFibGUoKVxue1xuICAgIGxldCBsYXllckJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyX3RhYmxlXCIpO1xuICAgIGxldCB0cmFjZUJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRyYWNlX3RhYmxlXCIpO1xuICAgIGxldCB0ZXN0UG9pbnRCb2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0ZXN0cG9pbnRfdGFibGVcIik7XG5cbiAgICBpZihsYXllclRhYmxlVmlzYWJsZSlcbiAgICB7XG4gICAgICAgIGxheWVyQm9keS5yZW1vdmVBdHRyaWJ1dGUoXCJoaWRkZW5cIik7XG4gICAgICAgIHRyYWNlQm9keS5zZXRBdHRyaWJ1dGUoXCJoaWRkZW5cIiwgXCJoaWRkZW5cIik7XG4gICAgICAgIHRlc3RQb2ludEJvZHkuc2V0QXR0cmlidXRlKFwiaGlkZGVuXCIsIFwiaGlkZGVuXCIpO1xuICAgIH1cbiAgICBlbHNlIGlmKHRyYWNlVGFibGVWaXNhYmxlKVxuICAgIHtcbiAgICAgICAgbGF5ZXJCb2R5LnNldEF0dHJpYnV0ZShcImhpZGRlblwiLCBcImhpZGRlblwiKTtcbiAgICAgICAgdHJhY2VCb2R5LnJlbW92ZUF0dHJpYnV0ZShcImhpZGRlblwiKTtcbiAgICAgICAgdGVzdFBvaW50Qm9keS5zZXRBdHRyaWJ1dGUoXCJoaWRkZW5cIiwgXCJoaWRkZW5cIik7XG4gICAgfVxuICAgIGVsc2UgaWYodGVzdFBvaW50VGFibGVWaXNhYmxlKVxuICAgIHtcbiAgICAgICAgbGF5ZXJCb2R5LnNldEF0dHJpYnV0ZShcImhpZGRlblwiLCBcImhpZGRlblwiKTtcbiAgICAgICAgdHJhY2VCb2R5LnNldEF0dHJpYnV0ZShcImhpZGRlblwiLCBcImhpZGRlblwiKTtcbiAgICAgICAgdGVzdFBvaW50Qm9keS5yZW1vdmVBdHRyaWJ1dGUoXCJoaWRkZW5cIik7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiUmlnaHQgc2NyZWVuIHRhYmxlIGRpc2FibGVkXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBDcmVhdGVfTGF5ZXJzKHBjYmRhdGEpXG57XG4gICAgZ2xvYmFsRGF0YS5sYXllcl9saXN0ID0gbmV3IE1hcCgpO1xuICAgIC8qIENyZWF0ZSBsYXllciBvYmplY3RzIGZyb20gSlNPTiBmaWxlICovXG4gICAgZm9yKGxldCBsYXllciBvZiBwY2JkYXRhLmJvYXJkLmxheWVycylcbiAgICB7XG4gICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5zZXQobGF5ZXIubmFtZSwgW25ldyBQQ0JfTGF5ZXIobGF5ZXIpLCBuZXcgUmVuZGVyX0xheWVyKGxheWVyKV0pO1xuICAgIH1cblxuICAgIC8qXG4gICAgICAgIEludGVybmFsbHkgdGhlIGZvbGxvd2luZyBsYXllcnMgYXJlIHVzZWRcbiAgICAgICAgICAgIDEuIFBhZHNcbiAgICAgICAgICAgIDIuIEhpZ2hsaWdodHNcbiAgICAgICAgSWYgdGhlc2Ugd2VyZSBub3QgY3JlYXRlZCBiZWZvcmUsIHRoZW4gdGhleSB3aWxsIGJlIGNyZWF0ZWQgaGVyZS5cbiAgICAqL1xuICAgIGxldCBsYXllclBhZHMgICAgICAgPSB7XCJuYW1lXCI6XCJQYWRzXCIsIFwicGF0aHNcIjogW119O1xuICAgIGlmKGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQobGF5ZXJQYWRzLm5hbWUpID09IHVuZGVmaW5lZClcbiAgICB7XG4gICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5zZXQobGF5ZXJQYWRzLm5hbWUsIFtuZXcgUENCX0xheWVyKGxheWVyUGFkcyksIG5ldyBSZW5kZXJfTGF5ZXIobGF5ZXJQYWRzKV0pO1xuICAgIH1cblxuICAgIGxldCBsYXllckhpZ2hsaWdodHMgPSB7XCJuYW1lXCI6XCJIaWdobGlnaHRzXCIsIFwicGF0aHNcIjogW119O1xuICAgIGlmKGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQobGF5ZXJIaWdobGlnaHRzLm5hbWUpID09IHVuZGVmaW5lZClcbiAgICB7XG4gICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5zZXQobGF5ZXJIaWdobGlnaHRzLm5hbWUsIFtuZXcgUENCX0xheWVyKGxheWVySGlnaGxpZ2h0cyksIG5ldyBSZW5kZXJfTGF5ZXIobGF5ZXJIaWdobGlnaHRzKV0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gQ3JlYXRlX1RyYWNlcyhwY2JkYXRhKVxue1xuICAgIGdsb2JhbERhdGEucGNiX3RyYWNlcyA9IFtdO1xuICAgIC8qIENyZWF0ZSB0cmFjZSBvYmplY3RzIGZyb20gSlNPTiBmaWxlICovXG4gICAgZm9yKGxldCB0cmFjZSBvZiBwY2JkYXRhLmJvYXJkLnRyYWNlcylcbiAgICB7XG4gICAgICAgIGdsb2JhbERhdGEucGNiX3RyYWNlcy5wdXNoKG5ldyBQQ0JfVHJhY2UodHJhY2UpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIENyZWF0ZV9UZXN0UG9pbnRzKHBjYmRhdGEpXG57XG4gICAgZ2xvYmFsRGF0YS5wY2JfdGVzdHBvaW50cyA9IFtdO1xuICAgIC8qIENyZWF0ZSB0ZXN0IHBvaW50IG9iamVjdHMgZnJvbSBKU09OIGZpbGUgKi9cbiAgICBmb3IobGV0IHRlc3Rwb2ludCBvZiBwY2JkYXRhLnRlc3RfcG9pbnRzKVxuICAgIHtcbiAgICAgICAgZ2xvYmFsRGF0YS5wY2JfdGVzdHBvaW50cy5wdXNoKG5ldyBQQ0JfVGVzdFBvaW50KHRlc3Rwb2ludCkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gQ3JlYXRlX1BhcnRzKHBjYmRhdGEpXG57XG4gICAgZ2xvYmFsRGF0YS5wY2JfcGFydHMgPSBbXTtcbiAgICAvKiBDcmVhdGUgbGF5ZXIgb2JqZWN0cyBmcm9tIEpTT04gZmlsZSAqL1xuICAgIGZvcihsZXQgcGFydCBvZiBwY2JkYXRhLnBhcnRzKVxuICAgIHtcbiAgICAgICAgZ2xvYmFsRGF0YS5wY2JfcGFydHMucHVzaChuZXcgUENCX1BhcnQocGFydCkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gQ3JlYXRlX0NvbmZpZ3VyYXRpb24ocGNiZGF0YSlcbntcbiAgICBmb3IobGV0IGNvbmZpZyBvZiBwY2JkYXRhLmNvbmZpZ3VyYXRpb24pXG4gICAge1xuICAgICAgICBpZihjb25maWcuY2F0ZWdvcnk9PVwiY29sb3JcIilcbiAgICAgICAge1xuICAgICAgICAgICAgY29sb3JNYXAuU2V0Q29sb3IoY29uZmlnLm5hbWUsIGNvbmZpZy52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZihjb25maWcuY2F0ZWdvcnk9PVwic2V0dGluZ1wiKVxuICAgICAgICB7XG4gICAgICAgICAgICBpZiggY29uZmlnLm5hbWUgPT1cImRhcmtfbW9kZVwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiZGFya21vZGVcIiwgY29uZmlnLnZhbHVlID09IDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihjb25maWcubmFtZSA9PVwiaGlnaHRfZmlyc3RfcGluXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJoaWdobGlnaHRwaW4xXCIsIGNvbmZpZy52YWx1ZSA9PSAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYoY29uZmlnLm5hbWUgPT1cImhpZGVfcGxhY2VkX3BhcnRzXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJoaWRlUGxhY2VkUGFydHNcIiwgY29uZmlnLnZhbHVlID09IDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihjb25maWcubmFtZSA9PVwiY29tYmluZV92YWx1ZXNcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImNvbWJpbmVWYWx1ZXNcIiwgY29uZmlnLnZhbHVlID09IDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihjb25maWcubmFtZSA9PVwiYm9tX3BjYl9sYXlvdXRcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImJvbWxheW91dFwiLCBjb25maWcudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZihjb25maWcubmFtZSA9PVwiYWRkaXRpb25hbF90YWJsZVwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGlmKCBjb25maWcudmFsdWUgPT0gXCJUclwiKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXJUYWJsZVZpc2FibGUgICAgID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRyYWNlVGFibGVWaXNhYmxlICAgICA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RQb2ludFRhYmxlVmlzYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmKCBjb25maWcudmFsdWUgPT0gXCJUcFwiKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXJUYWJsZVZpc2FibGUgICAgID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRyYWNlVGFibGVWaXNhYmxlICAgICA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB0ZXN0UG9pbnRUYWJsZVZpc2FibGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmKCBjb25maWcudmFsdWUgPT0gXCJMclwiKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXJUYWJsZVZpc2FibGUgICAgID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdHJhY2VUYWJsZVZpc2FibGUgICAgID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RQb2ludFRhYmxlVmlzYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBsYXllclRhYmxlVmlzYWJsZSAgICAgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdHJhY2VUYWJsZVZpc2FibGUgICAgID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RQb2ludFRhYmxlVmlzYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYoY29uZmlnLm5hbWUgPT1cImJvbV9jaGVja2JveGVzXCIpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbGV0IGVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbUNoZWNrYm94ZXNcIik7XG4gICAgICAgICAgICAgICAgZWxlbWVudC52YWx1ZSA9IGNvbmZpZy52YWx1ZTtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLnNldEJvbUNoZWNrYm94ZXMoY29uZmlnLnZhbHVlKTtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImJvbUNoZWNrYm94ZXNcIiwgY29uZmlnLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYoY29uZmlnLm5hbWUgPT1cImJvbV9wYXJ0X2F0dHJpYnV0ZXNcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBsZXQgZWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWRkaXRpb25hbEF0dHJpYnV0ZXNcIik7XG4gICAgICAgICAgICAgICAgZWxlbWVudC52YWx1ZSA9IGNvbmZpZy52YWx1ZTtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLnNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKGNvbmZpZy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJhZGRpdGlvbmFsQXR0cmlidXRlc1wiLCBjb25maWcudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJXYXJuaW5nOiBVbnN1cHBvcnRlZCBzZXR0aW5nIHBhcmFtZXRlciBcIiwgY29uZmlnLmNhdGVnb3J5LCBjb25maWcubmFtZSwgY29uZmlnLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiV2FybmluZzogVW5zdXBwb3J0ZWQgcGFyYW1ldGVyIFwiLCBjb25maWcuY2F0ZWdvcnksIGNvbmZpZy5uYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5mdW5jdGlvbiBMb2FkUENCKHBjYmRhdGEpXG57XG4gICAgLy8gVXBkYXRlIENPbmZpZ3VyYXRpb24gZGF0YVxuICAgIENyZWF0ZV9Db25maWd1cmF0aW9uKHBjYmRhdGEpO1xuXG4gICAgLy8gUmVtb3ZlIGFsbCBpdGVtcyBmcm9tIEJPTSB0YWJsZVxuICAgIC8vIEFuZCBkZWxldGUgaW50ZXJuYWwgYm9tIHN0cnVjdHVyZVxuICAgIGJvbVRhYmxlLmNsZWFyQk9NVGFibGUoKTtcbiAgICBwY2IuRGVsZXRlQk9NKCk7XG4gICAgLy8gQ3JlYXRlIGEgbmV3IEJPTSB0YWJsZVxuICAgIHBjYi5DcmVhdGVCT00ocGNiZGF0YSk7XG5cbiAgICBmb3IgKGxldCBsYXllciBvZiBnbG9iYWxEYXRhLmxheWVyX2xpc3QpXG4gICAge1xuICAgICAgICByZW5kZXJDYW52YXMuQ2xlYXJDYW52YXMobGF5ZXJbMV1bZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5HZXRDYW52YXModHJ1ZSkpO1xuICAgICAgICByZW5kZXJDYW52YXMuQ2xlYXJDYW52YXMobGF5ZXJbMV1bZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5HZXRDYW52YXMoZmFsc2UpKTtcbiAgICB9XG5cbiAgICBsYXllclRhYmxlLmNsZWFyTGF5ZXJUYWJsZSgpOyAvLyA8LS0tIEFjdHVhbGx5IHZpZXdlZCBsYXllciB0YWJsZVxuICAgIENyZWF0ZV9MYXllcnMocGNiZGF0YSk7IC8vIDwtLS0gQkFja2dyb3VuZCBsYXllciBpbmZvcm1hdGlvblxuICAgIHJpZ2h0U2lkZVRhYmxlLnBvcHVsYXRlUmlnaHRTaWRlU2NyZWVuVGFibGUoKTtcblxuICAgIC8vIFVwZGF0ZSBNZXRhZGF0YVxuICAgIGxldCBtZXRhZGF0YSA9IE1ldGFkYXRhLkdldEluc3RhbmNlKCk7XG4gICAgbWV0YWRhdGEuU2V0KHBjYmRhdGEubWV0YWRhdGEpO1xuICAgIHBvcHVsYXRlTWV0YWRhdGEoKTtcblxuICAgIC8vIENyZWF0ZSB0cmFjZXNcbiAgICBDcmVhdGVfVHJhY2VzKHBjYmRhdGEpO1xuXG4gICAgLy8gQ3JlYXRlIHRlc3QgcG9pbnRzXG4gICAgQ3JlYXRlX1Rlc3RQb2ludHMocGNiZGF0YSk7XG5cbiAgICAvLyBQYXJ0c1xuICAgIENyZWF0ZV9QYXJ0cyhwY2JkYXRhKTtcbn1cblxuZnVuY3Rpb24gY2hhbmdlQm9tTGF5b3V0KGxheW91dClcbntcbiAgICBtYWluTGF5b3V0ID0gbGF5b3V0O1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWxyLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLXRiLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicGNiLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgIHN3aXRjaCAobGF5b3V0KVxuICAgIHtcbiAgICBjYXNlIFwiQk9NXCI6XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWJ0blwiKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xuXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmwtYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmItYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmwtYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG5cblxuXG4gICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEJvbVNwbGl0KCkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmKHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUxheWVyU3BsaXQoKTtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lCb21TcGxpdCgpO1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21TcGxpdChudWxsKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUNhbnZhc1NwbGl0KCk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldENhbnZhc1NwbGl0KG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21kaXZcIikuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJvbnRjYW52YXNcIikuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJhY2tjYW52YXNcIikuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICBpZihyaWdodFNjcmVlblRhYmxlVmlzYWJsZSlcbiAgICAgICAge1xuICAgICAgICAgICAgcmlnaHRTY3JlZW5UYWJsZVZpc2FibGUgPSBmYWxzZTtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5LWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0cmFjZS1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGVzdHBvaW50LWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiKS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgIH1cblxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvdFwiKS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xuXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGF0YWRpdlwiICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIlBDQlwiOlxuXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicGNiLWJ0blwiICAgICApLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIpLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmcm9udGNhbnZhc1wiKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrY2FudmFzXCIgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcblxuICAgICAgICBpZihyaWdodFNjcmVlblRhYmxlVmlzYWJsZSlcbiAgICAgICAge1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXJkaXZcIiAgICkuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib3RcIiAgICAgICAgKS5zdHlsZS5oZWlnaHQgPSBcImNhbGMoOTAlKVwiO1xuXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGF0YWRpdlwiICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21kaXZcIiAgICAgKS5jbGFzc0xpc3QucmVtb3ZlKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNkaXZcIiAgKS5jbGFzc0xpc3QucmVtb3ZlKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmcm9udGNhbnZhc1wiKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrY2FudmFzXCIgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgaWYocmlnaHRTY3JlZW5UYWJsZVZpc2FibGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXJkaXZcIiAgICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRCb21TcGxpdCgpKVxuICAgICAgICB7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lMYXllclNwbGl0KCk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQobnVsbCk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lCb21TcGxpdCgpO1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21TcGxpdChudWxsKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUNhbnZhc1NwbGl0KCk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldENhbnZhc1NwbGl0KG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYocmlnaHRTY3JlZW5UYWJsZVZpc2FibGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChTcGxpdChbXCIjZGF0YWRpdlwiLCBcIiNsYXllcmRpdlwiXSwge1xuICAgICAgICAgICAgICAgIHNpemVzOiBbODAsIDIwXSxcbiAgICAgICAgICAgICAgICBvbkRyYWdFbmQ6IHJlbmRlci5yZXNpemVBbGwsXG4gICAgICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcbiAgICAgICAgICAgICAgICBjdXJzb3I6IFwiY29sLXJlc2l6ZVwiXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQoU3BsaXQoW1wiI2RhdGFkaXZcIiwgXCIjbGF5ZXJkaXZcIl0sIHtcbiAgICAgICAgICAgICAgICBzaXplczogWzk5LCAwLjFdLFxuICAgICAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcbiAgICAgICAgICAgICAgICBndXR0ZXJTaXplOiA1LFxuICAgICAgICAgICAgICAgIGN1cnNvcjogXCJjb2wtcmVzaXplXCJcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQoU3BsaXQoW1wiI2JvbWRpdlwiLCBcIiNjYW52YXNkaXZcIl0sIHtcbiAgICAgICAgICAgIGRpcmVjdGlvbjogXCJ2ZXJ0aWNhbFwiLFxuICAgICAgICAgICAgc2l6ZXM6IFs1MCwgNTBdLFxuICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcbiAgICAgICAgICAgIGN1cnNvcjogXCJyb3ctcmVzaXplXCJcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzU3BsaXQoU3BsaXQoW1wiI2Zyb250Y2FudmFzXCIsIFwiI2JhY2tjYW52YXNcIl0sIHtcbiAgICAgICAgICAgIHNpemVzOiBbNTAsIDUwXSxcbiAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXG4gICAgICAgICAgICBvbkRyYWdFbmQ6IHJlbmRlci5yZXNpemVBbGwsXG4gICAgICAgICAgICBjdXJzb3I6IFwicm93LXJlc2l6ZVwiXG4gICAgICAgIH0pKTtcblxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc2RpdlwiICApLnN0eWxlLmhlaWdodCA9IFwiY2FsYyg5OSUpXCI7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIlRCXCI6XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLXRiLWJ0blwiICAgICApLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIpLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJhY2tjYW52YXNcIiApLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgICAgICBpZihyaWdodFNjcmVlblRhYmxlVmlzYWJsZSlcbiAgICAgICAge1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXJkaXZcIiAgICkuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICB9XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm90XCIgICAgICAgICkuc3R5bGUuaGVpZ2h0ID0gXCJjYWxjKDkwJSlcIjtcblxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRhdGFkaXZcIiAgICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIgICAgICkuY2xhc3NMaXN0LnJlbW92ZSggICBcInNwbGl0LWhvcml6b250YWxcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzZGl2XCIgICkuY2xhc3NMaXN0LnJlbW92ZSggICBcInNwbGl0LWhvcml6b250YWxcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJvbnRjYW52YXNcIikuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XG4gICAgICAgIGlmKHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlKVxuICAgICAgICB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyZGl2XCIgICApLmNsYXNzTGlzdC5hZGQoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tU3BsaXQoKSlcbiAgICAgICAge1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95TGF5ZXJTcGxpdCgpO1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRMYXllclNwbGl0KG51bGwpO1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95Qm9tU3BsaXQoKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQobnVsbCk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lDYW52YXNTcGxpdCgpO1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNTcGxpdChudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlKVxuICAgICAgICB7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQoU3BsaXQoW1wiI2RhdGFkaXZcIiwgXCIjbGF5ZXJkaXZcIl0sIHtcbiAgICAgICAgICAgICAgICBzaXplczogWzgwLCAyMF0sXG4gICAgICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxuICAgICAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXG4gICAgICAgICAgICAgICAgY3Vyc29yOiBcImNvbC1yZXNpemVcIlxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQoU3BsaXQoW1wiI2JvbWRpdlwiLCBcIiNjYW52YXNkaXZcIl0sIHtcbiAgICAgICAgICAgIGRpcmVjdGlvbjogXCJ2ZXJ0aWNhbFwiLFxuICAgICAgICAgICAgc2l6ZXM6IFs1MCwgNTBdLFxuICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcbiAgICAgICAgICAgIGN1cnNvcjogXCJyb3ctcmVzaXplXCJcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzU3BsaXQoU3BsaXQoW1wiI2Zyb250Y2FudmFzXCIsIFwiI2JhY2tjYW52YXNcIl0sIHtcbiAgICAgICAgICAgIHNpemVzOiBbNTAsIDUwXSxcbiAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXG4gICAgICAgICAgICBvbkRyYWdFbmQ6IHJlbmRlci5yZXNpemVBbGwsXG4gICAgICAgICAgICBjdXJzb3I6IFwicm93LXJlc2l6ZVwiXG4gICAgICAgIH0pKTtcblxuXG4gICAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJMUlwiOlxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbS1sci1idG5cIiAgICAgKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbWRpdlwiKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmcm9udGNhbnZhc1wiKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrY2FudmFzXCIgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgaWYocmlnaHRTY3JlZW5UYWJsZVZpc2FibGUpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXJkaXZcIiAgICkuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyZGl2XCIgICApLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvdFwiICAgICAgICApLnN0eWxlLmhlaWdodCA9IFwiY2FsYyg5MCUpXCI7XG5cbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkYXRhZGl2XCIgICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21kaXZcIiAgICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNkaXZcIiAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmcm9udGNhbnZhc1wiKS5jbGFzc0xpc3QucmVtb3ZlKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrY2FudmFzXCIgKS5jbGFzc0xpc3QucmVtb3ZlKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcblxuICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRCb21TcGxpdCgpKVxuICAgICAgICB7XG5cbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUxheWVyU3BsaXQoKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChudWxsKTtcblxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95Qm9tU3BsaXQoKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQobnVsbCk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lDYW52YXNTcGxpdCgpO1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNTcGxpdChudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHJpZ2h0U2NyZWVuVGFibGVWaXNhYmxlKVxuICAgICAgICB7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQoU3BsaXQoW1wiI2RhdGFkaXZcIiwgXCIjbGF5ZXJkaXZcIl0sIHtcbiAgICAgICAgICAgICAgICBzaXplczogWzgwLCAyMF0sXG4gICAgICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxuICAgICAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXG4gICAgICAgICAgICAgICAgY3Vyc29yOiBcImNvbC1yZXNpemVcIlxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21TcGxpdChTcGxpdChbXCIjYm9tZGl2XCIsIFwiI2NhbnZhc2RpdlwiXSwge1xuICAgICAgICAgICAgc2l6ZXM6IFs1MCwgNTBdLFxuICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcbiAgICAgICAgICAgIGN1cnNvcjogXCJyb3ctcmVzaXplXCJcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzU3BsaXQoU3BsaXQoW1wiI2Zyb250Y2FudmFzXCIsIFwiI2JhY2tjYW52YXNcIl0sIHtcbiAgICAgICAgICAgIHNpemVzOiBbNTAsIDUwXSxcbiAgICAgICAgICAgIGRpcmVjdGlvbjogXCJ2ZXJ0aWNhbFwiLFxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcbiAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcbiAgICAgICAgICAgIGN1cnNvcjogXCJyb3ctcmVzaXplXCJcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBnbG9iYWxEYXRhLnNldEJvbUxheW91dChsYXlvdXQpO1xuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiYm9tbGF5b3V0XCIsIGxheW91dCk7XG4gICAgYm9tVGFibGUucG9wdWxhdGVCb21UYWJsZSgpO1xuICAgIGNoYW5nZUNhbnZhc0xheW91dChnbG9iYWxEYXRhLmdldENhbnZhc0xheW91dCgpKTtcbn1cblxuLy8gVE9ETzogUmVtb3ZlIGdsb2JhbCB2YXJpYWJsZS4gVXNlZCB0byB0ZXN0IGZlYXR1cmUuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG5sZXQgaXNGdWxsc2NyZWVuID0gZmFsc2U7XG5mdW5jdGlvbiB0b2dnbGVGdWxsU2NyZWVuKClcbntcbiAgICBpZihpc0Z1bGxzY3JlZW4pXG4gICAge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XG4gICAgICAgIGlzRnVsbHNjcmVlbiA9IGZhbHNlO1xuICAgICAgICBGdWxsc2NyZWVuLmNsb3NlRnVsbHNjcmVlbigpO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XG4gICAgICAgIGlzRnVsbHNjcmVlbiA9IHRydWU7XG4gICAgICAgIEZ1bGxzY3JlZW4ub3BlbkZ1bGxzY3JlZW4oKTtcbiAgICB9XG59XG5cbi8vWFhYOiBJIHdvdWxkIGxpa2UgdGhpcyB0byBiZSBpbiB0aGUgaHRtbCBmdW5jdGlvbnMganMgZmlsZS4gQnV0IHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmVcbi8vICAgICBwbGFjZWQgaGVyZSwgb3RoZXJ3aXNlIHRoZSBhcHBsaWNhdGlvbiByZW5kZXJpbmcgYmVjb21lcyB2ZXJ5IHZlcnkgd2VpcmQuXG53aW5kb3cub25sb2FkID0gZnVuY3Rpb24oZSlcbntcbiAgICBjb25zb2xlLnRpbWUoXCJvbiBsb2FkXCIpO1xuXG4gICAgLy8gTXVzdCBvY2N1ciBlYXJseSBmb3Igc3RvcmFnZSBwYXJhbWV0ZXJzIHRvIGJlIGxvYWRlZC4gSWYgbm90IGxvYWRlZCBlYXJseSB0aGVuXG4gICAgLy8gaW5jb3JyZWN0IHBhcmFtZXRlcnMgbWF5IGJlIHVzZWQuXG4gICAgZ2xvYmFsRGF0YS5pbml0U3RvcmFnZSgpO1xuXG4gICAgcGNiLkNyZWF0ZUJPTShwY2JkYXRhKTtcbiAgICBsZXQgbWV0YWRhdGEgPSBNZXRhZGF0YS5HZXRJbnN0YW5jZSgpO1xuICAgIG1ldGFkYXRhLlNldChwY2JkYXRhLm1ldGFkYXRhKTtcblxuICAgIGxldCB2ZXJzaW9uTnVtYmVySFRNTCAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic29mdHdhcmVWZXJzaW9uXCIpO1xuICAgIHZlcnNpb25OdW1iZXJIVE1MLmlubmVySFRNTCA9IHZlcnNpb24uR2V0VmVyc2lvblN0cmluZygpO1xuICAgIGNvbnNvbGUubG9nKHZlcnNpb24uR2V0VmVyc2lvblN0cmluZygpKTtcblxuXG5cblxuICAgIENyZWF0ZV9UcmFjZXMocGNiZGF0YSk7XG4gICAgQ3JlYXRlX1Rlc3RQb2ludHMocGNiZGF0YSk7XG4gICAgQ3JlYXRlX0xheWVycyhwY2JkYXRhKTtcbiAgICBDcmVhdGVfUGFydHMocGNiZGF0YSk7XG4gICAgQ3JlYXRlX0NvbmZpZ3VyYXRpb24ocGNiZGF0YSk7XG5cbiAgICByaWdodFNpZGVUYWJsZS5wb3B1bGF0ZVJpZ2h0U2lkZVNjcmVlblRhYmxlKCk7XG5cbiAgICAvLyBNdXN0IGJlIGNhbGxlZCBhZnRlciBsb2FkaW5nIFBDQiBhcyByZW5kZXJpbmcgcmVxdWlyZWQgdGhlIGJvdW5kaW5nIGJveCBpbmZvcm1hdGlvbiBmb3IgUENCXG4gICAgcmVuZGVyLmluaXRSZW5kZXIoKTtcblxuXG4gICAgLy9jbGVhbkd1dHRlcnMoKTtcblxuICAgIHBvcHVsYXRlTWV0YWRhdGEoKTtcblxuICAgIC8vIENyZWF0ZSBjYW52YXMgbGF5ZXJzLiBPbmUgY2FudmFzIHBlciBwY2IgbGF5ZXJcblxuXG5cbiAgICAvLyBTZXQgdXAgbW91c2UgZXZlbnQgaGFuZGxlcnNcbiAgICBoYW5kbGVyc19tb3VzZS5hZGRNb3VzZUhhbmRsZXJzKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJvbnRjYW52YXNcIiksIGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIGhhbmRsZXJzX21vdXNlLmFkZE1vdXNlSGFuZGxlcnMoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrY2FudmFzXCIpICwgZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrKTtcblxuICAgIGNvbnNvbGUubG9nKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoXCJib21sYXlvdXRcIikpXG5cbiAgICBnbG9iYWxEYXRhLnNldEJvbUxheW91dChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiYm9tbGF5b3V0XCIpKTtcbiAgICBpZiAoIWdsb2JhbERhdGEuZ2V0Qm9tTGF5b3V0KCkpXG4gICAge1xuICAgICAgICBnbG9iYWxEYXRhLnNldEJvbUxheW91dChcIkxSXCIpO1xuICAgIH1cbiAgICBnbG9iYWxEYXRhLnNldENhbnZhc0xheW91dChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiY2FudmFzbGF5b3V0XCIpKTtcbiAgICBpZiAoIWdsb2JhbERhdGEuZ2V0Q2FudmFzTGF5b3V0KCkpXG4gICAge1xuICAgICAgICBnbG9iYWxEYXRhLnNldENhbnZhc0xheW91dChcIkZCXCIpO1xuICAgIH1cblxuICAgIGdsb2JhbERhdGEuc2V0Qm9tQ2hlY2tib3hlcyhnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiYm9tQ2hlY2tib3hlc1wiKSk7XG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tQ2hlY2tib3hlcygpID09PSBudWxsKVxuICAgIHtcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21DaGVja2JveGVzKFwiXCIpO1xuICAgIH1cblxuICAgIGdsb2JhbERhdGEuc2V0UmVtb3ZlQk9NRW50cmllcyhnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwicmVtb3ZlQk9NRW50cmllc1wiKSk7XG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0UmVtb3ZlQk9NRW50cmllcygpID09PSBudWxsKVxuICAgIHtcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRSZW1vdmVCT01FbnRyaWVzKFwiXCIpO1xuICAgIH1cblxuICAgIGdsb2JhbERhdGEuc2V0QWRkaXRpb25hbEF0dHJpYnV0ZXMoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImFkZGl0aW9uYWxBdHRyaWJ1dGVzXCIpKTtcbiAgICBpZiAoZ2xvYmFsRGF0YS5nZXRBZGRpdGlvbmFsQXR0cmlidXRlcygpID09PSBudWxsKVxuICAgIHtcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRBZGRpdGlvbmFsQXR0cmlidXRlcyhcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcInJlZHJhd09uRHJhZ1wiKSA9PT0gXCJmYWxzZVwiKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkcmFnQ2hlY2tib3hcIikuY2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICBnbG9iYWxEYXRhLnNldFJlZHJhd09uRHJhZyhmYWxzZSk7XG4gICAgfVxuXG4gICAgaWYgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoXCJkYXJrbW9kZVwiKSA9PT0gXCJ0cnVlXCIpXG4gICAge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRhcmttb2RlQ2hlY2tib3hcIikuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIHNldERhcmtNb2RlKHRydWUpO1xuICAgIH1cblxuICAgIGlmIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiaGlkZVBsYWNlZFBhcnRzXCIpID09PSBcInRydWVcIilcbiAgICB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGlkZVBsYWNlZFBhcnRzXCIpLmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICBnbG9iYWxEYXRhLnNldEhpZGVQbGFjZWRQYXJ0cyh0cnVlKTtcbiAgICB9XG5cbiAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImhpZ2hsaWdodHBpbjFcIikgPT09IFwidHJ1ZVwiKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoaWdobGlnaHRwaW4xQ2hlY2tib3hcIikuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIGdsb2JhbERhdGEuc2V0SGlnaGxpZ2h0UGluMSh0cnVlKTtcbiAgICAgICAgcmVuZGVyLlJlbmRlclBDQihnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250KTtcbiAgICAgICAgcmVuZGVyLlJlbmRlclBDQihnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xuICAgIH1cblxuICAgIC8vIElmIHRoaXMgaXMgdHJ1ZSB0aGVuIGNvbWJpbmUgcGFydHMgYW5kIGRpc3BsYXkgcXVhbnRpdHlcbiAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImNvbWJpbmVWYWx1ZXNcIikgPT09IFwidHJ1ZVwiKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb21iaW5lVmFsdWVzXCIpLmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICBnbG9iYWxEYXRhLnNldENvbWJpbmVWYWx1ZXModHJ1ZSk7XG4gICAgfVxuXG4gICAgaWYgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoXCJkZWJ1Z01vZGVcIikgPT09IFwidHJ1ZVwiKVxuICAgIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z01vZGVcIikuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIGdsb2JhbERhdGEuc2V0RGVidWdNb2RlKHRydWUpO1xuICAgIH1cblxuICAgIC8vIFJlYWQgdGhlIHZhbHVlIG9mIGJvYXJkIHJvdGF0aW9uIGZyb20gbG9jYWwgc3RvcmFnZVxuICAgIGxldCBib2FyZFJvdGF0aW9uID0gZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImJvYXJkUm90YXRpb25cIik7XG4gICAgLypcbiAgICAgICAgQWRqdXN0ZWQgdG8gbWF0Y2ggaG93IHRoZSB1cGRhdGUgcm90YXRpb24gYW5nbGUgaXMgY2FsY3VsYXRlZC5cbiAgICAgICAgSWYgbnVsbCwgdGhlbiBhbmdsZSBub3QgaW4gbG9jYWwgc3RvcmFnZSwgc2V0IHRvIDE4MCBkZWdyZWVzLlxuICAgICovXG4gICAgaWYgKGJvYXJkUm90YXRpb24gPT09IG51bGwpXG4gICAge1xuICAgICAgICBib2FyZFJvdGF0aW9uID0gMTgwO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICBib2FyZFJvdGF0aW9uID0gcGFyc2VJbnQoYm9hcmRSb3RhdGlvbik7XG4gICAgfVxuXG4gICAgLy8gU2V0IGludGVybmFsIGdsb2JhbCB2YXJpYWJsZSBmb3IgYm9hcmQgcm90YXRpb24uXG4gICAgZ2xvYmFsRGF0YS5TZXRCb2FyZFJvdGF0aW9uKGJvYXJkUm90YXRpb24pO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9hcmRSb3RhdGlvblwiKS52YWx1ZSA9IChib2FyZFJvdGF0aW9uLTE4MCkgLyA1O1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm90YXRpb25EZWdyZWVcIikudGV4dENvbnRlbnQgPSAoYm9hcmRSb3RhdGlvbi0xODApO1xuXG4gICAgLy8gVHJpZ2dlcnMgcmVuZGVyXG4gICAgY2hhbmdlQm9tTGF5b3V0KGdsb2JhbERhdGEuZ2V0Qm9tTGF5b3V0KCkpO1xuICAgIGNvbnNvbGUudGltZUVuZChcIm9uIGxvYWRcIik7XG59O1xuXG53aW5kb3cub25yZXNpemUgPSByZW5kZXIucmVzaXplQWxsO1xud2luZG93Lm1hdGNoTWVkaWEoXCJwcmludFwiKS5hZGRMaXN0ZW5lcihyZW5kZXIucmVzaXplQWxsKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgY2hhbmdlQm9tTGF5b3V0ICAgICAgICAsIHNldERhcmtNb2RlICAgICAgLCBjaGFuZ2VDYW52YXNMYXlvdXQsXG4gICAgc2V0QWRkaXRpb25hbEF0dHJpYnV0ZXMsIExheWVyVGFibGVfVG9nZ2xlLCBUcmFjZVRhYmxlX1RvZ2dsZSxcbiAgICBUZXN0UG9pbnRUYWJsZV9Ub2dnbGUgICwgdG9nZ2xlRnVsbFNjcmVlbiAsIExvYWRQQ0IsIExheWVyVGFibGVfT2ZmLFxuICAgIExheWVyVGFibGVfT24gICAgICAgICAgLCBUcmFjZVRhYmxlX09mZiAgICwgVHJhY2VUYWJsZV9PbixcbiAgICBUZXN0UG9pbnRUYWJsZV9PZmYgICAgICwgVGVzdFBvaW50VGFibGVfT24sIFJlbmRlcl9SaWdodFNjcmVlblRhYmxlXG59O1xuIiwiLypcbiAgICBMYXllciB0YWJsZSBmb3JtcyB0aGUgcmlnaHQgaGFsZiBvZiBkaXNwbGF5LiBUaGUgdGFibGUgY29udGFpbnMgZWFjaCBvZiB0aGUgXG4gICAgdXNlZCBsYXllcnMgaW4gdGhlIGRlc2lnbiBhbG9uZyB3aXRoIGNoZWNrIGJveGVzIHRvIHNob3cvaGlkZSB0aGUgbGF5ZXIuXG5cbiAgICBUaGUgZm9sbG93aW5nIGZ1bmN0aW9uIGludGVyZmFjZXMgdGhlIGxheWVycyBmb3IgdGhlIHByb2plY3QgdG8gdGhlIEdVSS5cblxuXG4gICAgTGF5ZXIgdGFibGUgaXMgY29tcG9zZWQgb2YgdGhyZWUgcGFydHM6XG4gICAgICAgIDEuIFNlYXJjaCBiYXJcbiAgICAgICAgMi4gSGVhZGVyXG4gICAgICAgIDMuIExheWVyc1xuXG4gICAgU2VhcmNoIGJhciBhbGxvd3MgdXNlcnMgdG8gdHlwZSBhIHdvcmQgYW5kIGxheWVyIG5hbWVzIG1hdGNoaW5nIHdoYXQgXG4gICAgaGFzIGJlZW4gdHlwZWQgd2lsbCByZW1haW4gd2hpbGUgYWxsIG90aGVyIGVudHJpZXMgd2lsbCBiZSBoaWRkZW4uXG5cbiAgICBIZWFkZXIgc2ltcGx5IGRpc3BsYXlzIGNvbHVtbiBuYW1lcyBmb3IgZWFjaCBlYWNoIGNvbHVtbi5cblxuICAgIExhc3QgbGF5ZXIgLGJvZHksIGRpc3BsYXlzIGFuIGVudHJ5IHBlciB1c2VkIGxheWVyIHRoYXQgYXJlIG5vdFxuICAgIGZpbHRlcmVkIG91dC5cbiovXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIHBjYiAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XG52YXIgZ2xvYmFsRGF0YSA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcbnZhciBUYWJsZV9MYXllckVudHJ5ID0gcmVxdWlyZShcIi4vcmVuZGVyL1RhYmxlX0xheWVyRW50cnkuanNcIikuVGFibGVfTGF5ZXJFbnRyeVxuXG5mdW5jdGlvbiBwb3B1bGF0ZUxheWVyVGFibGUoKVxue1xuICAgIC8qIFBvcHVsYXRlIGhlYWRlciBhbmQgQk9NIGJvZHkuIFBsYWNlIGludG8gRE9NICovXG4gICAgcG9wdWxhdGVMYXllckhlYWRlcigpO1xuICAgIHBvcHVsYXRlTGF5ZXJCb2R5KCk7XG5cbiAgICAvKiBSZWFkIGZpbHRlciBzdHJpbmcuIEhpZGUgQk9NIGVsZW1lbnRzIHRoYXQgZG9udCBjaW50YWluIHN0cmluZyBlbnRyeSAqL1xuICAgIGxldCBmaWx0ZXJMYXllciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXItZmlsdGVyXCIpO1xuICAgIEZpbHRlcihmaWx0ZXJMYXllci52YWx1ZSlcbn1cblxuXG5sZXQgZmlsdGVyTGF5ZXIgPSBcIlwiO1xuZnVuY3Rpb24gZ2V0RmlsdGVyTGF5ZXIoKSBcbntcbiAgICByZXR1cm4gZmlsdGVyTGF5ZXI7XG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlTGF5ZXJIZWFkZXIoKVxue1xuICAgIGxldCBsYXllckhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyaGVhZFwiKTtcbiAgICB3aGlsZSAobGF5ZXJIZWFkLmZpcnN0Q2hpbGQpIFxuICAgIHtcbiAgICAgICAgbGF5ZXJIZWFkLnJlbW92ZUNoaWxkKGxheWVySGVhZC5maXJzdENoaWxkKTtcbiAgICB9XG5cbiAgICAvLyBIZWFkZXIgcm93XG4gICAgbGV0IHRyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRSXCIpO1xuICAgIC8vIERlZmluZXMgdGhlXG4gICAgbGV0IHRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpO1xuXG4gICAgdGguY2xhc3NMaXN0LmFkZChcInZpc2lhYmxlQ29sXCIpO1xuXG4gICAgbGV0IHRyMiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUUlwiKTtcbiAgICBsZXQgdGhmID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpOyAvLyBmcm9udFxuICAgIGxldCB0aGIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7IC8vIGJhY2tcbiAgICBsZXQgdGhjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpOyAvLyBjb2xvclxuXG4gICAgdGhmLmlubmVySFRNTCA9IFwiRnJvbnRcIlxuICAgIHRoYi5pbm5lckhUTUwgPSBcIkJhY2tcIlxuICAgIHRoYy5pbm5lckhUTUwgPSBcIkNvbG9yXCJcbiAgICB0cjIuYXBwZW5kQ2hpbGQodGhmKVxuICAgIHRyMi5hcHBlbmRDaGlsZCh0aGIpXG4gICAgdHIyLmFwcGVuZENoaWxkKHRoYylcblxuICAgIHRoLmlubmVySFRNTCA9IFwiVmlzaWJsZVwiO1xuICAgIHRoLmNvbFNwYW4gPSAzXG4gICAgbGV0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiU1BBTlwiKTtcbiAgICBzcGFuLmNsYXNzTGlzdC5hZGQoXCJub25lXCIpO1xuICAgIHRoLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgIHRyLmFwcGVuZENoaWxkKHRoKTtcblxuICAgIHRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpO1xuICAgIHRoLmlubmVySFRNTCA9IFwiTGF5ZXJcIjtcbiAgICB0aC5yb3dTcGFuID0gMjtcbiAgICBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlNQQU5cIik7XG4gICAgc3Bhbi5jbGFzc0xpc3QuYWRkKFwibm9uZVwiKTtcbiAgICB0aC5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICB0ci5hcHBlbmRDaGlsZCh0aCk7XG5cbiAgICBsYXllckhlYWQuYXBwZW5kQ2hpbGQodHIpO1xuICAgIGxheWVySGVhZC5hcHBlbmRDaGlsZCh0cjIpO1xufVxuXG5mdW5jdGlvbiBwb3B1bGF0ZUxheWVyQm9keSgpXG57XG4gICAgbGV0IGxheWVyQm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXJib2R5XCIpO1xuICAgIHdoaWxlIChsYXllckJvZHkuZmlyc3RDaGlsZCkgXG4gICAge1xuICAgICAgICBsYXllckJvZHkucmVtb3ZlQ2hpbGQobGF5ZXJCb2R5LmZpcnN0Q2hpbGQpO1xuICAgIH1cblxuICAgIC8vIHJlbW92ZSBlbnRyaWVzIHRoYXQgZG8gbm90IG1hdGNoIGZpbHRlclxuICAgIGZvciAobGV0IGxheWVyIG9mIGdsb2JhbERhdGEubGF5ZXJfbGlzdClcbiAgICB7XG4gICAgICAgIGxheWVyYm9keS5hcHBlbmRDaGlsZChuZXcgVGFibGVfTGF5ZXJFbnRyeShsYXllclsxXVtnbG9iYWxEYXRhLnBjYl9sYXllcnNdKSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBGaWx0ZXIocylcbntcbiAgICBzID0gcy50b0xvd2VyQ2FzZSgpO1xuICAgIGxldCBsYXllckJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyYm9keVwiKTtcbiAgICBcbiAgICBmb3IgKGxldCBsYXllciBvZiBsYXllckJvZHkucm93cylcbiAgICB7XG5cbiAgICAgICAgaWYobGF5ZXIuaW5uZXJUZXh0LnRyaW0oKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHMpKVxuICAgICAgICB7XG4gICAgICAgICAgICBsYXllci5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxheWVyLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgfVxuICAgIH1cbiAgIFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBGaWx0ZXIsIHBvcHVsYXRlTGF5ZXJUYWJsZVxufSIsIi8qXG4gICAgVGhpcyBmaWxlIGNvbnRhaW5zIGFsbCBvZiB0aGUgZGVmaW5pdGlvbnMgZm9yIHdvcmtpbmcgd2l0aCBwY2JkYXRhLmpzb24uIFxuICAgIFRoaXMgZmlsZSBkZWNsYXJlcyBhbGwgb2YgdGhlIGFjY2VzcyBmdW5jdGlvbnMgYW5kIGludGVyZmFjZXMgZm9yIGNvbnZlcnRpbmcgXG4gICAgdGhlIGpzb24gZmlsZSBpbnRvIGFuIGludGVybmFsIGRhdGEgc3RydWN0dXJlLiBcbiovXG5cblwidXNlIHN0cmljdFwiO1xudmFyIFBhcnQgICAgID0gcmVxdWlyZShcIi4vUGFydC5qc1wiKTtcbnZhciBnbG9iYWxEYXRhID0gcmVxdWlyZShcIi4vZ2xvYmFsLmpzXCIpO1xuXG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUENCIFBhcnQgSW50ZXJmYWNlc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG4vLyBUaGlzIHdpbGwgaG9sZCB0aGUgcGFydCBvYmplY3RzLiBUaGVyZSBpcyBvbmUgZW50cnkgcGVyIHBhcnRcbi8vIEZvcm1hdCBvZiBhIHBhcnQgaXMgYXMgZm9sbG93c1xuLy8gW1ZBTFVFLFBBQ0tBR0UsUkVGUkVORUNFIERFU0lHTkFUT1IsICxMT0NBVElPTiwgQVRUUklCVVRFXSxcbi8vIHdoZXJlIEFUVFJJQlVURSBpcyBhIGRpY3Qgb2YgQVRUUklCVVRFIE5BTUUgOiBBVFRSSUJVVEUgVkFMVUVcbmxldCBCT00gPSBbXTtcblxubGV0IEJPTV9Db21iaW5lZCA9IG5ldyBNYXAoKTtcblxuLy9UT0RPOiBUaGVyZSBzaG91bGQgYmUgc3RlcHMgaGVyZSBmb3IgdmFsaWRhdGluZyB0aGUgZGF0YSBhbmQgcHV0dGluZyBpdCBpbnRvIGEgXG4vLyAgICAgIGZvcm1hdCB0aGF0IGlzIHZhbGlkIGZvciBvdXIgYXBwbGljYXRpb25cbmZ1bmN0aW9uIENyZWF0ZUJPTShwY2JkYXRhU3RydWN0dXJlKVxue1xuICAgIC8vIEZvciBldmVyeSBwYXJ0IGluIHRoZSBpbnB1dCBmaWxlLCBjb252ZXJ0IGl0IHRvIG91ciBpbnRlcm5hbCBcbiAgICAvLyByZXByZXNlbnRhdGlvbiBkYXRhIHN0cnVjdHVyZS5cbiAgICBmb3IobGV0IHBhcnQgb2YgcGNiZGF0YVN0cnVjdHVyZS5wYXJ0cylcbiAgICB7XG4gICAgICAgIC8vIGV4dHJhY3QgdGhlIHBhcnQgZGF0YS4gVGhpcyBpcyBoZXJlIHNvIEkgY2FuIGl0ZXJhdGUgdGhlIGRlc2lnbiBcbiAgICAgICAgLy8gd2hlbiBJIG1ha2UgY2hhbmdlcyB0byB0aGUgdW5kZXJseWluZyBqc29uIGZpbGUuXG4gICAgICAgIGxldCB2YWx1ZSAgICAgPSBwYXJ0LnZhbHVlO1xuICAgICAgICBsZXQgZm9vdHByaW50ID0gXCJcIjtcbiAgICAgICAgbGV0IHJlZmVyZW5jZSA9IHBhcnQubmFtZTtcbiAgICAgICAgbGV0IGxvY2F0aW9uICA9IHBhcnQubG9jYXRpb247XG5cbiAgICAgICAgbGV0IGF0dHJpYnV0ZXMgPSBuZXcgTWFwKCk7IC8vIENyZWF0ZSBhIGVtcHR5IGRpY3Rpb25hcnlcbiAgICAgICAgZm9yKGxldCBpIG9mIHBhcnQuYXR0cmlidXRlcylcbiAgICAgICAge1xuICAgICAgICAgICAgYXR0cmlidXRlcy5zZXQoaS5uYW1lLnRvTG93ZXJDYXNlKCksaS52YWx1ZS50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBjaGVja2JveGVzID0gbmV3IE1hcCgpO1xuICAgICAgICAvLyBBZGQgdGhlIHBhciB0byB0aGUgZ2xvYmFsIHBhcnQgYXJyYXlcbiAgICAgICAgQk9NLnB1c2gobmV3IFBhcnQuUGFydCh2YWx1ZSwgZm9vdHByaW50LCByZWZlcmVuY2UsIGxvY2F0aW9uLCBhdHRyaWJ1dGVzLCBjaGVja2JveGVzKSk7XG5cbiAgICAgICAgaWYoQk9NX0NvbWJpbmVkLmhhcyh2YWx1ZSkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxldCBleGlzaW5nUGFydCA9IEJPTV9Db21iaW5lZC5nZXQodmFsdWUpXG4gICAgICAgICAgICBleGlzaW5nUGFydC5xdWFudGl0eSA9IGV4aXNpbmdQYXJ0LnF1YW50aXR5ICsgMTtcbiAgICAgICAgICAgIGV4aXNpbmdQYXJ0LnJlZmVyZW5jZSA9IGV4aXNpbmdQYXJ0LnJlZmVyZW5jZSArIFwiLFwiICsgcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgLy8gQWRkIHRoZSBwYXIgdG8gdGhlIGdsb2JhbCBwYXJ0IGFycmF5XG4gICAgICAgICAgICBCT01fQ29tYmluZWQuc2V0KHZhbHVlLCBuZXcgUGFydC5QYXJ0KHZhbHVlLCBmb290cHJpbnQsIHJlZmVyZW5jZSwgbG9jYXRpb24sIFtdLCBbXSkpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBHZXRCT00oKVxue1xuICAgICBpZihnbG9iYWxEYXRhLmdldENvbWJpbmVWYWx1ZXMoKSlcbiAgICAge1xuICAgICAgICBsZXQgcmVzdWx0ID0gW11cblxuICAgICAgICBmb3IobGV0IHBhcnRzIG9mIEJPTV9Db21iaW5lZC52YWx1ZXMoKSlcbiAgICAgICAge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gocGFydHMpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgfVxuICAgICBlbHNlXG4gICAgIHtcbiAgICAgICAgcmV0dXJuIEJPTTtcbiAgICAgfVxufVxuXG5mdW5jdGlvbiBEZWxldGVCT00oKVxue1xuICAgIEJPTSA9IFtdO1xuICAgIEJPTV9Db21iaW5lZCA9IG5ldyBNYXAoKTtcbn1cblxuZnVuY3Rpb24gZ2V0QXR0cmlidXRlVmFsdWUocGFydCwgYXR0cmlidXRlVG9Mb29rdXApXG57XG4gICAgbGV0IGF0dHJpYnV0ZXMgPSBwYXJ0LmF0dHJpYnV0ZXM7XG4gICAgbGV0IHJlc3VsdCA9IFwiXCI7XG5cbiAgICBpZighZ2xvYmFsRGF0YS5nZXRDb21iaW5lVmFsdWVzKCkpXG4gICAge1xuICAgICAgICBpZihhdHRyaWJ1dGVUb0xvb2t1cCA9PSBcIm5hbWVcIilcbiAgICAgICAge1xuICAgICAgICAgICAgcmVzdWx0ID0gcGFydC5yZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gKGF0dHJpYnV0ZXMuaGFzKGF0dHJpYnV0ZVRvTG9va3VwKSA/IGF0dHJpYnV0ZXMuZ2V0KGF0dHJpYnV0ZVRvTG9va3VwKSA6IFwiXCIpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vIENoZWNrIHRoYXQgdGhlIGF0dHJpYnV0ZSBleGlzdHMgYnkgbG9va2luZyB1cCBpdHMgbmFtZS4gSWYgaXQgZXhpc3RzXG4gICAgLy8gdGhlIHJldHVybiB0aGUgdmFsdWUgZm9yIHRoZSBhdHRyaWJ1dGUsIG90aGVyd2lzZSByZXR1cm4gYW4gZW1wdHkgc3RyaW5nLiBcbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBDQiBMYXllcnMgSW50ZXJmYWNlc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5mdW5jdGlvbiBHZXRMYXllckNhbnZhcyhsYXllck5hbWUsIGlzRnJvbnQpXG57XG4gICAgbGV0IGxheWVyQ2FudmFzID0gZ2xvYmFsRGF0YS5sYXllcl9saXN0LmdldChsYXllck5hbWUpO1xuXG4gICAgaWYobGF5ZXJDYW52YXMgPT0gdW5kZWZpbmVkKVxuICAgIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgcmV0dXJuIGxheWVyQ2FudmFzW2dsb2JhbERhdGEucmVuZGVyX2xheWVyc10uR2V0Q2FudmFzKGlzRnJvbnQpO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgQ3JlYXRlQk9NLCBHZXRCT00sIERlbGV0ZUJPTSwgZ2V0QXR0cmlidXRlVmFsdWUsIEdldExheWVyQ2FudmFzXG59OyIsIi8qIFBDQiByZW5kZXJpbmcgY29kZSAqL1xuXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIGdsb2JhbERhdGEgICAgICAgICA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcbnZhciByZW5kZXJfY2FudmFzICAgICAgPSByZXF1aXJlKFwiLi9yZW5kZXIvcmVuZGVyX0NhbnZhcy5qc1wiKTtcbnZhciBwY2IgICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XG5cbmZ1bmN0aW9uIERyYXdUcmFjZXMoaXNWaWV3RnJvbnQsIHNjYWxlZmFjdG9yKVxue1xuICAgIGZvciAobGV0IHRyYWNlIG9mIGdsb2JhbERhdGEucGNiX3RyYWNlcylcbiAgICB7XG4gICAgICAgIHRyYWNlLlJlbmRlcihpc1ZpZXdGcm9udCwgc2NhbGVmYWN0b3IpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gRHJhd0xheWVycyhpc1ZpZXdGcm9udCwgc2NhbGVmYWN0b3IpXG57XG4gICAgZm9yIChsZXQgbGF5ZXIgb2YgZ2xvYmFsRGF0YS5sYXllcl9saXN0KVxuICAgIHtcbiAgICAgICAgbGF5ZXJbMV1bMF0uUmVuZGVyKGlzVmlld0Zyb250LCBzY2FsZWZhY3Rvcik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBEcmF3TW9kdWxlcyhpc1ZpZXdGcm9udClcbntcbiAgICAvLyBUT0RPOiBHbG9iYWwgZnVuY3Rpb24gaGVyZS4gR1VJIGNvbnRleHQgc2hvdWxkIGJlIHBhc3NlZCBhc1xuICAgIC8vICAgICAgIGFuIGFyZ3VtZW50IHRvIHRoZSBmdW5jdGlvbi5cbiAgICBsZXQgZ3VpQ29udGV4dCA9IHBjYi5HZXRMYXllckNhbnZhcyhcIlBhZHNcIiwgaXNWaWV3RnJvbnQpLmdldENvbnRleHQoXCIyZFwiKVxuICAgIGZvciAobGV0IHBhcnQgb2YgZ2xvYmFsRGF0YS5wY2JfcGFydHMpXG4gICAge1xuICAgICAgICBwYXJ0LlJlbmRlcihndWlDb250ZXh0LCBpc1ZpZXdGcm9udCwgZmFsc2UpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gRHJhd0hpZ2hsaXRlZE1vZHVsZXMoaXNWaWV3RnJvbnQsIGxheWVyLCBzY2FsZWZhY3RvciwgcmVmcylcbntcbiAgICAvLyBUT0RPOiBHbG9iYWwgZnVuY3Rpb24gaGVyZS4gR1VJIGNvbnRleHQgc2hvdWxkIGJlIHBhc3NlZCBhc1xuICAgIC8vICAgICAgIGFuIGFyZ3VtZW50IHRvIHRoZSBmdW5jdGlvbi5cbiAgICBsZXQgZ3VpQ29udGV4dCA9IHBjYi5HZXRMYXllckNhbnZhcyhcIkhpZ2hsaWdodHNcIiwgaXNWaWV3RnJvbnQpLmdldENvbnRleHQoXCIyZFwiKVxuICAgIC8vIERyYXcgc2VsZWN0ZWQgcGFydHMgb24gaGlnaGxpZ2h0IGxheWVyLlxuICAgIGZvciAobGV0IHBhcnQgb2YgZ2xvYmFsRGF0YS5wY2JfcGFydHMpXG4gICAge1xuICAgICAgICBpZihyZWZzLmluY2x1ZGVzKHBhcnQubmFtZSkpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHBhcnQuUmVuZGVyKGd1aUNvbnRleHQsIGlzVmlld0Zyb250LCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gUmVuZGVyUENCKGNhbnZhc2RpY3QpXG57XG4gICAgcmVuZGVyX2NhbnZhcy5SZWRyYXdDYW52YXMoY2FudmFzZGljdCk7XG4gICAgbGV0IGlzVmlld0Zyb250ID0gKGNhbnZhc2RpY3QubGF5ZXIgPT09IFwiRlwiKTtcblxuICAgIC8qXG4gICAgICAgIFJlbmRlcnMgZW50aXJlIFBDQiBmb3Igc3BlY2lmaWVkIHZpZXdcbiAgICAgICAgUmVuZGVyaW5nIG9jY3VycyBpbiB0aHJlZSBzdGVwc1xuICAgICAgICAgICAgMS4gTW9kdWxlc1xuICAgICAgICAgICAgMi4gVHJhY2VzXG4gICAgICAgICAgICAzLiBMYXllcnNcblxuICAgICAgICBTdGVwIDMgZXNzZW50aWFsbHkgcmVuZGVycyBpdGVtcyBvbiBsYXllcnMgbm90IHJlbmRlcmVkIGluIDEgb3IgMi5cbiAgICAgICAgVGhpcyBjb3VsZCBiZSBzaWxrc2NyZWVuLCBjdXRvdXRzLCBib2FyZCBlZGdlLCBldGMuLi5cbiAgICAqL1xuICAgIERyYXdNb2R1bGVzKGlzVmlld0Zyb250KTtcbiAgICBEcmF3VHJhY2VzIChpc1ZpZXdGcm9udCwgY2FudmFzZGljdC50cmFuc2Zvcm0ucyk7XG4gICAgRHJhd0xheWVycyAoaXNWaWV3RnJvbnQsIGNhbnZhc2RpY3QudHJhbnNmb3JtLnMpO1xufVxuXG5mdW5jdGlvbiBDbGVhckNhbnZhcygpXG57XG4gICAgaW5pdFJlbmRlcigpO1xufVxuXG5mdW5jdGlvbiBSb3RhdGVWZWN0b3IodiwgYW5nbGUpXG57XG4gICAgcmV0dXJuIHJlbmRlcl9jYW52YXMucm90YXRlVmVjdG9yKHYsIGFuZ2xlKTtcbn1cblxuZnVuY3Rpb24gaW5pdFJlbmRlcigpXG57XG4gICAgbGV0IGFsbGNhbnZhcyA9IHtcbiAgICAgICAgZnJvbnQ6IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybToge1xuICAgICAgICAgICAgICAgIHg6IDAsXG4gICAgICAgICAgICAgICAgeTogMCxcbiAgICAgICAgICAgICAgICBzOiAxLFxuICAgICAgICAgICAgICAgIHBhbng6IDAsXG4gICAgICAgICAgICAgICAgcGFueTogMCxcbiAgICAgICAgICAgICAgICB6b29tOiAxLFxuICAgICAgICAgICAgICAgIG1vdXNlc3RhcnR4OiAwLFxuICAgICAgICAgICAgICAgIG1vdXNlc3RhcnR5OiAwLFxuICAgICAgICAgICAgICAgIG1vdXNlZG93bjogZmFsc2UsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGF5ZXI6IFwiRlwiLFxuICAgICAgICB9LFxuICAgICAgICBiYWNrOiB7XG4gICAgICAgICAgICB0cmFuc2Zvcm06IHtcbiAgICAgICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgICAgIHk6IDAsXG4gICAgICAgICAgICAgICAgczogMSxcbiAgICAgICAgICAgICAgICBwYW54OiAwLFxuICAgICAgICAgICAgICAgIHBhbnk6IDAsXG4gICAgICAgICAgICAgICAgem9vbTogMSxcbiAgICAgICAgICAgICAgICBtb3VzZXN0YXJ0eDogMCxcbiAgICAgICAgICAgICAgICBtb3VzZXN0YXJ0eTogMCxcbiAgICAgICAgICAgICAgICBtb3VzZWRvd246IGZhbHNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxheWVyOiBcIkJcIixcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gU2V0cyB0aGUgZGF0YSBzdHJ1Y3VyZSB0byBhIGRlZmF1bHQgdmFsdWUuXG4gICAgZ2xvYmFsRGF0YS5TZXRBbGxDYW52YXMoYWxsY2FudmFzKTtcbiAgICAvLyBTZXQgdGhlIHNjYWxlIHNvIHRoZSBQQ0Igd2lsbCBiZSBzY2FsZWQgYW5kIGNlbnRlcmVkIGNvcnJlY3RseS5cbiAgICByZW5kZXJfY2FudmFzLlJlc2l6ZUNhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250KTtcbiAgICByZW5kZXJfY2FudmFzLlJlc2l6ZUNhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xufVxuXG5mdW5jdGlvbiBkcmF3SGlnaGxpZ2h0c09uTGF5ZXIoY2FudmFzZGljdClcbntcbiAgICBsZXQgaXNWaWV3RnJvbnQgPSAoY2FudmFzZGljdC5sYXllciA9PT0gXCJGXCIpO1xuICAgIHJlbmRlcl9jYW52YXMuQ2xlYXJIaWdobGlnaHRzKGNhbnZhc2RpY3QpO1xuXG4gICAgRHJhd0hpZ2hsaXRlZE1vZHVsZXMoaXNWaWV3RnJvbnQsIGNhbnZhc2RpY3QubGF5ZXIsIGNhbnZhc2RpY3QudHJhbnNmb3JtLnMsIGdsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0ZWRSZWZzKCkpO1xufVxuXG5mdW5jdGlvbiBkcmF3SGlnaGxpZ2h0cygpXG57XG4gICAgZHJhd0hpZ2hsaWdodHNPbkxheWVyKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIGRyYXdIaWdobGlnaHRzT25MYXllcihnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xufVxuXG5mdW5jdGlvbiByZXNpemVBbGwoKVxue1xuICAgIHJlbmRlcl9jYW52YXMuUmVzaXplQ2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIHJlbmRlcl9jYW52YXMuUmVzaXplQ2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XG4gICAgUmVuZGVyUENCKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIFJlbmRlclBDQihnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xufVxuXG5mdW5jdGlvbiByZXJlbmRlckFsbCgpXG57XG4gICAgUmVuZGVyUENCKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xuICAgIFJlbmRlclBDQihnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xufVxuXG5mdW5jdGlvbiBTZXRCb2FyZFJvdGF0aW9uKHZhbHVlKVxue1xuICAgIC8qXG4gICAgICAgIFRoZSBib2FyZCB3aGVuIGRyYXduIGJ5IGRlZmF1bHQgaXMgc2hvdyByb3RhdGVkIC0xODAgZGVncmVlcy5cbiAgICAgICAgVGhlIGZvbGxvd2luZyB3aWxsIGFkZCAxODAgZGVncmVlcyB0byB3aGF0IHRoZSB1c2VyIGNhbGN1bGF0ZXMgc28gdGhhdCB0aGUgUENCXG4gICAgICAgIHdpbGwgYmUgZHJhd24gaW4gdGhlIGNvcnJlY3Qgb3JpZW50YXRpb24sIGkuZS4gZGlzcGxheWVkIGFzIHNob3duIGluIEVDQUQgcHJvZ3JhbS5cbiAgICAgICAgSW50ZXJuYWxseSB0aGUgcmFuZ2Ugb2YgZGVncmVlcyBpcyBzdG9yZWQgYXMgMCAtPiAzNjBcbiAgICAqL1xuICAgIGdsb2JhbERhdGEuU2V0Qm9hcmRSb3RhdGlvbigodmFsdWUgKiA1KSsxODApO1xuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiYm9hcmRSb3RhdGlvblwiLCBnbG9iYWxEYXRhLkdldEJvYXJkUm90YXRpb24oKSk7XG4gICAgLypcbiAgICAgICAgRGlzcGxheSB0aGUgY29ycmVjdCByYW5nZSBvZiBkZWdyZWVzIHdoaWNoIGlzIC0xODAgLT4gMTgwLlxuICAgICAgICBUaGUgZm9sbG93aW5nIGp1c3QgcmVtYXBzIDM2MCBkZWdyZWVzIHRvIGJlIGluIHRoZSByYW5nZSAtMTgwIC0+IDE4MC5cbiAgICAqL1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm90YXRpb25EZWdyZWVcIikudGV4dENvbnRlbnQgPSAoZ2xvYmFsRGF0YS5HZXRCb2FyZFJvdGF0aW9uKCktMTgwKTtcbiAgICByZXNpemVBbGwoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgaW5pdFJlbmRlciwgcmVzaXplQWxsLCBSZW5kZXJQQ0IsIGRyYXdIaWdobGlnaHRzLCBSb3RhdGVWZWN0b3IsIFNldEJvYXJkUm90YXRpb24sIENsZWFyQ2FudmFzLCByZXJlbmRlckFsbFxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5sZXQgbGF5ZXJaTnVtYmVyID0gMDtcblxuY2xhc3MgUmVuZGVyX0xheWVyXG57XG4gICAgLy8gUmVuZGVyIHNob3VsZCB0YWtlIGFzIGFuIGFyZ3VtZW50IHRoZSBtb2RlbCBub3QgdGhlIHJhdyBKU09OIGRhdGFcbiAgICBjb25zdHJ1Y3RvcihpUENCX0pTT05fTGF5ZXIpXG4gICAge1xuICAgICAgICB0aGlzLnZpc2libGVfZnJvbnQgPSB0cnVlO1xuICAgICAgICB0aGlzLnZpc2libGVfYmFjayAgPSB0cnVlO1xuICAgICAgICB0aGlzLmZyb250X2lkICAgICAgPSBcImxheWVyX2Zyb250X1wiICsgaVBDQl9KU09OX0xheWVyLm5hbWU7XG4gICAgICAgIHRoaXMuYmFja19pZCAgICAgICA9IFwibGF5ZXJfcmVhcl9cIiAgKyBpUENCX0pTT05fTGF5ZXIubmFtZTtcblxuICAgICAgICBsZXQgY2FudmFzX2Zyb250ICAgICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJvbnQtY2FudmFzLWxpc3RcIik7XG4gICAgICAgIGxldCBsYXllcl9mcm9udCAgICAgICAgICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcbiAgICAgICAgbGF5ZXJfZnJvbnQuaWQgICAgICAgICAgICAgPSB0aGlzLmZyb250X2lkO1xuICAgICAgICBsYXllcl9mcm9udC5zdHlsZS56SW5kZXggICA9IGxheWVyWk51bWJlcjtcbiAgICAgICAgbGF5ZXJfZnJvbnQuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICAgIGxheWVyX2Zyb250LnN0eWxlLmxlZnQgICAgID0gMDtcbiAgICAgICAgbGF5ZXJfZnJvbnQuc3R5bGUudG9wICAgICAgPSAwO1xuICAgICAgICBjYW52YXNfZnJvbnQuYXBwZW5kQ2hpbGQobGF5ZXJfZnJvbnQpO1xuXG4gICAgICAgIGxldCBjYW52YXNfYmFjayAgICAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJhY2stY2FudmFzLWxpc3RcIik7XG4gICAgICAgIGxldCBsYXllcl9iYWNrICAgICAgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgICAgICBsYXllcl9iYWNrLmlkICAgICAgICAgICAgID0gdGhpcy5iYWNrX2lkO1xuICAgICAgICBsYXllcl9iYWNrLnN0eWxlLnpJbmRleCAgID0gbGF5ZXJaTnVtYmVyO1xuICAgICAgICBsYXllcl9iYWNrLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xuICAgICAgICBsYXllcl9iYWNrLnN0eWxlLmxlZnQgICAgID0gMDtcbiAgICAgICAgbGF5ZXJfYmFjay5zdHlsZS50b3AgICAgICA9IDA7XG4gICAgICAgIGNhbnZhc19iYWNrLmFwcGVuZENoaWxkKGxheWVyX2JhY2spO1xuXG5cbiAgICAgICAgdGhpcy5jYW52YXNfZnJvbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0aGlzLmZyb250X2lkKTtcbiAgICAgICAgdGhpcy5jYW52YXNfYmFjayAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0aGlzLmJhY2tfaWQpO1xuXG5cbiAgICAgICAgbGF5ZXJaTnVtYmVyID0gbGF5ZXJaTnVtYmVyICsgMTtcbiAgICB9XG5cbiAgICBTZXRWaXNpYmlsaXR5KGlzRnJvbnQsIHZpc2liaWxpdHkpXG4gICAge1xuICAgICAgICBpZihpc0Zyb250KVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnZpc2libGVfZnJvbnQgPSB2aXNpYmlsaXR5O1xuICAgICAgICAgICAgaWYodmlzaWJpbGl0eSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhc19mcm9udC5zdHlsZS5kaXNwbGF5PVwiXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXNfZnJvbnQuc3R5bGUuZGlzcGxheT1cIm5vbmVcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMudmlzaWJsZV9iYWNrICA9IHZpc2liaWxpdHk7XG4gICAgICAgICAgICBpZih2aXNpYmlsaXR5KVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzX2JhY2suc3R5bGUuZGlzcGxheT1cIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzX2JhY2suc3R5bGUuZGlzcGxheT1cIm5vbmVcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIElzVmlzaWJsZShpc0Zyb250KVxuICAgIHtcbiAgICAgICAgaWYoaXNGcm9udClcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmlzaWJsZV9mcm9udDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnZpc2libGVfYmFjaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEdldENhbnZhcyhpc0Zyb250KVxuICAgIHtcbiAgICAgICAgaWYoaXNGcm9udClcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FudmFzX2Zyb250O1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FudmFzX2JhY2s7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9XG57XG4gICAgUmVuZGVyX0xheWVyXG59OyIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZ2xvYmFsRGF0YSA9IHJlcXVpcmUoXCIuLi9nbG9iYWwuanNcIik7XG52YXIgY29sb3JNYXAgICA9IHJlcXVpcmUoXCIuLi9jb2xvcm1hcC5qc1wiKTtcbnZhciByZW5kZXIgICAgID0gcmVxdWlyZShcIi4uL3JlbmRlci5qc1wiKTtcblxuZnVuY3Rpb24gY3JlYXRlTGF5ZXJDaGVja2JveENoYW5nZUhhbmRsZXIobGF5ZXIsIGlzRnJvbnQpXG57XG4gICAgcmV0dXJuIGZ1bmN0aW9uKClcbiAgICB7XG4gICAgICAgIC8qXG4gICAgICAgICAgICBUaGUgZm9sbG93aW5nIHdpbGwgY29ycmVjdGx5IHNpZ25hbCB0byB0aGUgY2FudmFzIHdoYXQgUENCIGxheWVycyBzaG91bGQgYmUgZGlzcGxheWVkLlxuICAgICAgICAqL1xuICAgICAgICBpZihpc0Zyb250KVxuICAgICAgICB7XG4gICAgICAgICAgICBpZihnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKCBcImNoZWNrYm94X2xheWVyX2Zyb250X1wiICsgbGF5ZXIubmFtZSArIFwiX3Zpc2libGVcIiApID09IFwidHJ1ZVwiKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQobGF5ZXIubmFtZSlbZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5TZXRWaXNpYmlsaXR5KGlzRnJvbnQsZmFsc2UpO1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiY2hlY2tib3hfbGF5ZXJfZnJvbnRfXCIgKyBsYXllci5uYW1lICsgXCJfdmlzaWJsZVwiLCBcImZhbHNlXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQobGF5ZXIubmFtZSlbZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5TZXRWaXNpYmlsaXR5KGlzRnJvbnQsdHJ1ZSk7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJjaGVja2JveF9sYXllcl9mcm9udF9cIiArIGxheWVyLm5hbWUgKyBcIl92aXNpYmxlXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGlmKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hfbGF5ZXJfYmFja19cIiArIGxheWVyLm5hbWUgKyBcIl92aXNpYmxlXCIgKSA9PSBcInRydWVcIilcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLmxheWVyX2xpc3QuZ2V0KGxheWVyLm5hbWUpW2dsb2JhbERhdGEucmVuZGVyX2xheWVyc10uU2V0VmlzaWJpbGl0eShpc0Zyb250LGZhbHNlKTtcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImNoZWNrYm94X2xheWVyX2JhY2tfXCIgKyBsYXllci5uYW1lICsgXCJfdmlzaWJsZVwiLCBcImZhbHNlXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQobGF5ZXIubmFtZSlbZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5TZXRWaXNpYmlsaXR5KGlzRnJvbnQsdHJ1ZSk7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJjaGVja2JveF9sYXllcl9iYWNrX1wiICsgbGF5ZXIubmFtZSArIFwiX3Zpc2libGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5jbGFzcyBUYWJsZV9MYXllckVudHJ5XG57XG4gICAgY29uc3RydWN0b3IobGF5ZXIpXG4gICAge1xuICAgICAgICB0aGlzLnZpc2libGVfZnJvbnQgPSB0cnVlO1xuICAgICAgICB0aGlzLnZpc2libGVfYmFjayAgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMubGF5ZXJOYW1lID0gbGF5ZXIubmFtZTtcbiAgICAgICAgdGhpcy5hY3RpdmVDb2xvclNwYW5FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlNwYW5cIik7XG5cbiAgICAgICAgLy8gQXNzdW1lcyB0aGF0IGFsbCBsYXllcnMgYXJlIHZpc2libGUgYnkgZGVmYXVsdC5cbiAgICAgICAgaWYgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hfbGF5ZXJfZnJvbnRfXCIgKyB0aGlzLmxheWVyTmFtZSArIFwiX3Zpc2libGVcIiApID09IG51bGwpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHRoaXMudmlzaWJsZV9mcm9udCA9IHRydWU7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmxheWVyX2xpc3QuZ2V0KHRoaXMubGF5ZXJOYW1lKVtnbG9iYWxEYXRhLnJlbmRlcl9sYXllcnNdLlNldFZpc2liaWxpdHkodHJ1ZSx0cnVlKTtcbiAgICAgICAgICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiY2hlY2tib3hfbGF5ZXJfZnJvbnRfXCIgKyB0aGlzLmxheWVyTmFtZSArIFwiX3Zpc2libGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCBnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKCBcImNoZWNrYm94X2xheWVyX2Zyb250X1wiICsgdGhpcy5sYXllck5hbWUgKyBcIl92aXNpYmxlXCIgKSA9PSBcInRydWVcIilcbiAgICAgICAge1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5sYXllcl9saXN0LmdldCh0aGlzLmxheWVyTmFtZSlbZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5TZXRWaXNpYmlsaXR5KHRydWUsdHJ1ZSk7XG4gICAgICAgICAgICB0aGlzLnZpc2libGVfZnJvbnQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgZ2xvYmFsRGF0YS5sYXllcl9saXN0LmdldCh0aGlzLmxheWVyTmFtZSlbZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5TZXRWaXNpYmlsaXR5KHRydWUsZmFsc2UpO1xuICAgICAgICAgICAgdGhpcy52aXNpYmxlX2Zyb250ID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZSggXCJjaGVja2JveF9sYXllcl9iYWNrX1wiICsgdGhpcy5sYXllck5hbWUgKyBcIl92aXNpYmxlXCIgKSA9PSBudWxsKVxuICAgICAgICB7XG4gICAgICAgICAgICB0aGlzLnZpc2libGVfYmFjayA9IHRydWU7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLmxheWVyX2xpc3QuZ2V0KHRoaXMubGF5ZXJOYW1lKVtnbG9iYWxEYXRhLnJlbmRlcl9sYXllcnNdLlNldFZpc2liaWxpdHkoZmFsc2UsdHJ1ZSk7XG4gICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImNoZWNrYm94X2xheWVyX2JhY2tfXCIgKyB0aGlzLmxheWVyTmFtZSArIFwiX3Zpc2libGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFzc3VtZXMgdGhhdCBhbGwgbGF5ZXJzIGFyZSB2aXNpYmxlIGJ5IGRlZmF1bHQuXG4gICAgICAgIGVsc2UgaWYgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hfbGF5ZXJfYmFja19cIiArIHRoaXMubGF5ZXJOYW1lICsgXCJfdmlzaWJsZVwiICkgPT0gXCJ0cnVlXCIpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQodGhpcy5sYXllck5hbWUpW2dsb2JhbERhdGEucmVuZGVyX2xheWVyc10uU2V0VmlzaWJpbGl0eShmYWxzZSx0cnVlKTtcbiAgICAgICAgICAgIHRoaXMudmlzaWJsZV9iYWNrID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHtcbiAgICAgICAgICAgIGdsb2JhbERhdGEubGF5ZXJfbGlzdC5nZXQodGhpcy5sYXllck5hbWUpW2dsb2JhbERhdGEucmVuZGVyX2xheWVyc10uU2V0VmlzaWJpbGl0eShmYWxzZSxmYWxzZSk7XG4gICAgICAgICAgICB0aGlzLnZpc2libGVfYmFjayA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQXNzdW1lcyB0aGF0IGFsbCBsYXllcnMgYXJlIHZpc2libGUgYnkgZGVmYXVsdC5cbiAgICAgICAgaWYgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hfbGF5ZXJfY29sb3JfXCIgKyB0aGlzLmxheWVyTmFtZSkgPT0gbnVsbCApXG4gICAgICAgIHtcblxuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuXG4gICAgICAgIH1cblxuXG4gICAgICAgIGxldCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUUlwiKTtcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGhpcy5DcmVhdGVDaGVja2JveF9WaXNpYmxlKGxheWVyLCB0cnVlKSk7XG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRoaXMuQ3JlYXRlQ2hlY2tib3hfVmlzaWJsZShsYXllciwgZmFsc2UpKTtcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGhpcy5DcmVhdGVDaGVja2JveF9Db2xvcihsYXllcikpO1xuXG4gICAgICAgIC8vIExheWVyXG4gICAgICAgIGxldCB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgdGQuaW5uZXJIVE1MID0gdGhpcy5sYXllck5hbWU7XG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcbiAgICAgICAgcmV0dXJuIHRyO1xuICAgIH1cblxuICAgIC8qXG4gICAgICAgIENyZWF0ZSBhIGNoZWNrYm94IGVudHJ5IGZvciBsYXllciB0YWJsZS5cblxuICAgICAgICBXaGVuIGNoZWNrZWQgKHZpc2libGUpIGFuIGV5ZSBpY29uIHdpbGwgYmUgdXNlZFxuICAgICAgICBhbmQgd2hlbiB1bnNlbGVjdGVkIChub3QgdmlzaWJsZSkgYW4gZXllIGljb24gd2lsbFxuICAgICAgICBzbGFzaCB3aWxsIGJlIHVzZWQuXG4gICAgKi9cbiAgICBDcmVhdGVDaGVja2JveF9WaXNpYmxlKGxheWVyLCBpc0Zyb250KVxuICAgIHtcbiAgICAgICAgbGV0IG5ld2xhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIkxhYmVsXCIpO1xuICAgICAgICBsZXQgdGQgICAgICAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XG4gICAgICAgIGxldCBpbnB1dCAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcblxuICAgICAgICBpbnB1dC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgICAgICBuZXdsYWJlbC5jbGFzc0xpc3QuYWRkKFwiY2hlY2tfYm94X2xheWVyXCIpXG4gICAgICAgIGlmKGlzRnJvbnQpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGlucHV0LmNoZWNrZWQgPSB0aGlzLnZpc2libGVfZnJvbnQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB7XG4gICAgICAgICAgICBpbnB1dC5jaGVja2VkID0gdGhpcy52aXNpYmxlX2JhY2s7XG4gICAgICAgIH1cblxuICAgICAgICBpbnB1dC5vbmNoYW5nZSA9IGNyZWF0ZUxheWVyQ2hlY2tib3hDaGFuZ2VIYW5kbGVyKGxheWVyLCBpc0Zyb250KTtcblxuICAgICAgICB2YXIgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJTcGFuXCIpO1xuICAgICAgICBzcGFuLmNsYXNzTGlzdC5hZGQoXCJsYXllcl9jaGVja2JveFwiKVxuXG4gICAgICAgIG5ld2xhYmVsLmFwcGVuZENoaWxkKGlucHV0KTtcbiAgICAgICAgbmV3bGFiZWwuYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgICAgIHRkLmFwcGVuZENoaWxkKG5ld2xhYmVsKTtcbiAgICAgICAgcmV0dXJuIHRkO1xuICAgIH1cblxuICAgIFVwZGF0ZUFjdGl2ZVNwYW5FbGVtZW50Q29sb3IoZXZlbnQpXG4gICAge1xuICAgICAgICB0aGlzLmFjdGl2ZUNvbG9yU3BhbkVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gZXZlbnQudGFyZ2V0LnZhbHVlO1xuICAgICAgICBjb2xvck1hcC5TZXRDb2xvcih0aGlzLmxheWVyTmFtZSxldmVudC50YXJnZXQudmFsdWUgKTtcbiAgICAgICAgcmVuZGVyLnJlcmVuZGVyQWxsKCk7XG4gICAgfVxuXG4gICAgQ3JlYXRlQ2hlY2tib3hfQ29sb3IobGF5ZXIpXG4gICAge1xuICAgICAgICBsZXQgbmV3bGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiTGFiZWxcIik7XG4gICAgICAgIGxldCB0ZCAgICAgICA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgbGV0IGlucHV0ICAgID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuXG4gICAgICAgIGlucHV0LnR5cGUgPSBcImNvbG9yXCI7XG4gICAgICAgIGxldCBjb2xvckNvZGUgPSBjb2xvck1hcC5HZXRUcmFjZUNvbG9yKHRoaXMubGF5ZXJOYW1lKVxuXG4gICAgICAgIGlmKGNvbG9yQ29kZS5sZW5ndGggPiA3KVxuICAgICAgICB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIldBUk5JTkc6IE9ubHkgUkdCIGNvbG9yIGNvZGVzIHN1cHBvcnRlZFwiLCBjb2xvckNvZGUpO1xuICAgICAgICAgICAgY29sb3JDb2RlID0gY29sb3JDb2RlLnN1YnN0cmluZygwLCA3KTtcbiAgICAgICAgICAgIGlucHV0LnZhbHVlID0gY29sb3JDb2RlO1xuICAgICAgICAgICAgaW5wdXQuZGVmYXVsdFZhbHVlID0gY29sb3JDb2RlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAge1xuICAgICAgICAgICAgaW5wdXQudmFsdWUgPSBjb2xvckNvZGU7XG4gICAgICAgICAgICBpbnB1dC5kZWZhdWx0VmFsdWUgPSBjb2xvckNvZGU7XG4gICAgICAgIH1cblxuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuVXBkYXRlQWN0aXZlU3BhbkVsZW1lbnRDb2xvci5iaW5kKHRoaXMpLCBmYWxzZSk7XG5cbiAgICAgICAgbmV3bGFiZWwuY2xhc3NMaXN0LmFkZChcImNoZWNrX2JveF9jb2xvclwiKVxuXG4gICAgICAgIHRoaXMuYWN0aXZlQ29sb3JTcGFuRWxlbWVudC5jbGFzc0xpc3QuYWRkKFwiY2hlY2ttYXJrX2NvbG9yXCIpXG4gICAgICAgIHRoaXMuYWN0aXZlQ29sb3JTcGFuRWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBjb2xvck1hcC5HZXRUcmFjZUNvbG9yKHRoaXMubGF5ZXJOYW1lKTtcblxuICAgICAgICBuZXdsYWJlbC5hcHBlbmRDaGlsZChpbnB1dCk7XG4gICAgICAgIG5ld2xhYmVsLmFwcGVuZENoaWxkKHRoaXMuYWN0aXZlQ29sb3JTcGFuRWxlbWVudCk7XG4gICAgICAgIHRkLmFwcGVuZENoaWxkKG5ld2xhYmVsKTtcbiAgICAgICAgcmV0dXJuIHRkO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgVGFibGVfTGF5ZXJFbnRyeVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZ2xvYmFsRGF0YSA9IHJlcXVpcmUoXCIuLi9nbG9iYWwuanNcIik7XG5cblxuXG5cblxuY2xhc3MgVGFibGVfVGVzdFBvaW50RW50cnlcbntcbiAgICBjb25zdHJ1Y3Rvcih0ZXN0UG9pbnQpXG4gICAge1xuXG4gICAgICAgIGxldCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUUlwiKTtcblxuICAgICAgICAvLyB0cmFjZSBuYW1lXG4gICAgICAgIGxldCB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgdGQuaW5uZXJIVE1MID0gdGVzdFBvaW50Lm5hbWVcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xuXG4gICAgICAgIHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xuICAgICAgICB0ZC5pbm5lckhUTUwgPSB0ZXN0UG9pbnQuZXhwZWN0ZWQ7XG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcblxuICAgICAgICB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgdGQuY29udGVudEVkaXRhYmxlID0gXCJ0cnVlXCJcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xuXG4gICAgICAgIHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xuICAgICAgICB0ZC5pbm5lckhUTUwgPSB0ZXN0UG9pbnQuZGVzY3JpcHRpb247XG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcblxuXG5cblxuXG4gICAgICAgIHJldHVybiB0cjtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIFRhYmxlX1Rlc3RQb2ludEVudHJ5XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBnbG9iYWxEYXRhID0gcmVxdWlyZShcIi4uL2dsb2JhbC5qc1wiKTtcbnZhciBjb2xvck1hcCAgID0gcmVxdWlyZShcIi4uL2NvbG9ybWFwLmpzXCIpO1xuXG5jbGFzcyBUYWJsZV9UcmFjZUVudHJ5XG57XG4gICAgY29uc3RydWN0b3IodHJhY2UpXG4gICAge1xuXG4gICAgICAgIGxldCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUUlwiKTtcbiAgICAgICAgXG4gICAgICAgIC8vIHRyYWNlIG5hbWVcbiAgICAgICAgbGV0IHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xuICAgICAgICB0ZC5pbm5lckhUTUwgPSB0cmFjZS5uYW1lO1xuICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgICAgIFxuICAgICAgICB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcbiAgICAgICAgdGQuaW5uZXJIVE1MID0gXCIwLjAgT21lZ2FcIjtcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xuXG4gICAgICAgIHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xuICAgICAgICB0ZC5pbm5lckhUTUwgPSBcIjAuMCBMXCI7XG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcbiAgICAgICAgXG5cbiAgICAgICAgcmV0dXJuIHRyO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgVGFibGVfVHJhY2VFbnRyeVxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5jbGFzcyBQb2ludCB7XG4gICAgY29uc3RydWN0b3IoeCwgeSlcbiAgICB7XG4gICAgICAgIHRoaXMueCA9IHg7XG4gICAgICAgIHRoaXMueSA9IHk7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBQb2ludFxufTtcbiIsIlwidXNlIHN0cmljdFwiO1xudmFyIHBjYiAgICAgICAgPSByZXF1aXJlKFwiLi4vcGNiLmpzXCIpO1xudmFyIGdsb2JhbERhdGEgPSByZXF1aXJlKFwiLi4vZ2xvYmFsLmpzXCIpO1xudmFyIFJlbmRlcl9MYXllciA9IHJlcXVpcmUoXCIuL1JlbmRlcl9MYXllci5qc1wiKS5SZW5kZXJfTGF5ZXI7XG5cbmZ1bmN0aW9uIHByZXBhcmVDYW52YXMoY2FudmFzLCBmbGlwLCB0cmFuc2Zvcm0pIFxue1xuICAgIGxldCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGN0eC5zZXRUcmFuc2Zvcm0oMSwgMCwgMCwgMSwgMCwgMCk7XG4gICAgY3R4LnNjYWxlKHRyYW5zZm9ybS56b29tLCB0cmFuc2Zvcm0uem9vbSk7XG4gICAgY3R4LnRyYW5zbGF0ZSh0cmFuc2Zvcm0ucGFueCwgdHJhbnNmb3JtLnBhbnkpO1xuICAgIGlmIChmbGlwKSBcbiAgICB7XG4gICAgICAgIGN0eC5zY2FsZSgtMSwgMSk7XG4gICAgfVxuICAgIGN0eC50cmFuc2xhdGUodHJhbnNmb3JtLngsIHRyYW5zZm9ybS55KTtcbiAgICBjdHgucm90YXRlKGdsb2JhbERhdGEuR2V0Qm9hcmRSb3RhdGlvbigpKk1hdGguUEkvMTgwKTtcbiAgICBjdHguc2NhbGUodHJhbnNmb3JtLnMsIHRyYW5zZm9ybS5zKTtcbn1cblxuZnVuY3Rpb24gcm90YXRlVmVjdG9yKHYsIGFuZ2xlKSBcbntcbiAgICBhbmdsZSA9IGFuZ2xlKk1hdGguUEkvMTgwO1xuICAgIHJldHVybiBbXG4gICAgICAgIHZbMF0gKiBNYXRoLmNvcyhhbmdsZSkgLSB2WzFdICogTWF0aC5zaW4oYW5nbGUpLFxuICAgICAgICB2WzBdICogTWF0aC5zaW4oYW5nbGUpICsgdlsxXSAqIE1hdGguY29zKGFuZ2xlKVxuICAgIF07XG59XG5cbmZ1bmN0aW9uIHJlY2FsY0xheWVyU2NhbGUoY2FudmFzZGljdCwgY2FudmFzKSBcbntcbiAgICBsZXQgbGF5ZXJJRCA9IChjYW52YXNkaWN0LmxheWVyID09PSBcIkZcIikgPyBcImZyb250Y2FudmFzXCIgOiBcImJhY2tjYW52YXNcIiA7XG4gICAgbGV0IHdpZHRoICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChsYXllcklEKS5jbGllbnRXaWR0aCAqIDI7XG4gICAgbGV0IGhlaWdodCAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChsYXllcklEKS5jbGllbnRIZWlnaHQgKiAyO1xuICAgIGxldCBiYm94ICAgID0gYXBwbHlSb3RhdGlvbihwY2JkYXRhLmJvYXJkLmJvdW5kaW5nX2JveCk7XG4gICAgbGV0IHNjYWxlZmFjdG9yID0gMC45OCAqIE1hdGgubWluKCB3aWR0aCAvIChiYm94LngxIC0gYmJveC54MCksIGhlaWdodCAvIChiYm94LnkxIC0gYmJveC55MCkpO1xuXG4gICAgaWYgKHNjYWxlZmFjdG9yIDwgMC4xKVxuICAgIHtcbiAgICAgICAgc2NhbGVmYWN0b3IgPSAxO1xuICAgIH1cblxuICAgIGNhbnZhc2RpY3QudHJhbnNmb3JtLnMgPSBzY2FsZWZhY3RvcjtcblxuICAgIGlmICgoY2FudmFzZGljdC5sYXllciAhPSBcIkJcIikpXG4gICAge1xuICAgICAgICBjYW52YXNkaWN0LnRyYW5zZm9ybS54ID0gLSgoYmJveC54MSArIGJib3gueDApICogc2NhbGVmYWN0b3IgKyB3aWR0aCkgKiAwLjU7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGNhbnZhc2RpY3QudHJhbnNmb3JtLnggPSAtKChiYm94LngxICsgYmJveC54MCkgKiBzY2FsZWZhY3RvciAtIHdpZHRoKSAqIDAuNTtcbiAgICB9XG4gICAgY2FudmFzZGljdC50cmFuc2Zvcm0ueSA9IC0oKGJib3gueTEgKyBiYm94LnkwKSAqIHNjYWxlZmFjdG9yIC0gaGVpZ2h0KSAqIDAuNTtcblxuICAgIGlmKGNhbnZhc2RpY3QubGF5ZXIgPT09XCJGXCIpXG4gICAge1xuICAgICAgICBjYW52YXMud2lkdGggICAgICAgID0gd2lkdGg7XG4gICAgICAgIGNhbnZhcy5oZWlnaHQgICAgICAgPSBoZWlnaHQ7XG4gICAgICAgIGNhbnZhcy5zdHlsZS53aWR0aCAgPSAod2lkdGggLyAyKSArIFwicHhcIjtcbiAgICAgICAgY2FudmFzLnN0eWxlLmhlaWdodCA9IChoZWlnaHQgLyAyKSArIFwicHhcIjtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgY2FudmFzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIGNhbnZhcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGNhbnZhcy5zdHlsZS53aWR0aCA9ICh3aWR0aCAvIDIpICsgXCJweFwiO1xuICAgICAgICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gKGhlaWdodCAvIDIpICsgXCJweFwiO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXBwbHlSb3RhdGlvbihiYm94KSBcbntcbiAgICBsZXQgY29ybmVycyA9IFtcbiAgICAgICAgW2Jib3gueDAsIGJib3gueTBdLFxuICAgICAgICBbYmJveC54MCwgYmJveC55MV0sXG4gICAgICAgIFtiYm94LngxLCBiYm94LnkwXSxcbiAgICAgICAgW2Jib3gueDEsIGJib3gueTFdLFxuICAgIF07XG4gICAgY29ybmVycyA9IGNvcm5lcnMubWFwKCh2KSA9PiByb3RhdGVWZWN0b3IodiwgZ2xvYmFsRGF0YS5HZXRCb2FyZFJvdGF0aW9uKCkpKTtcbiAgICByZXR1cm4ge1xuICAgICAgICB4MDogY29ybmVycy5yZWR1Y2UoKGEsIHYpID0+IE1hdGgubWluKGEsIHZbMF0pLCBJbmZpbml0eSksXG4gICAgICAgIHkwOiBjb3JuZXJzLnJlZHVjZSgoYSwgdikgPT4gTWF0aC5taW4oYSwgdlsxXSksIEluZmluaXR5KSxcbiAgICAgICAgeDE6IGNvcm5lcnMucmVkdWNlKChhLCB2KSA9PiBNYXRoLm1heChhLCB2WzBdKSwgLUluZmluaXR5KSxcbiAgICAgICAgeTE6IGNvcm5lcnMucmVkdWNlKChhLCB2KSA9PiBNYXRoLm1heChhLCB2WzFdKSwgLUluZmluaXR5KSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBDbGVhckhpZ2hsaWdodHMoY2FudmFzZGljdClcbntcbiAgICBsZXQgY2FudmFzID0gcGNiLkdldExheWVyQ2FudmFzKFwiSGlnaGxpZ2h0c1wiLCAoY2FudmFzZGljdC5sYXllciA9PT0gXCJGXCIpKTtcbiAgICBDbGVhckNhbnZhcyhjYW52YXMpO1xufVxuXG5mdW5jdGlvbiBDbGVhckNhbnZhcyhjYW52YXMpIFxue1xuICAgIGxldCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgIGN0eC5zYXZlKCk7XG4gICAgY3R4LnNldFRyYW5zZm9ybSgxLCAwLCAwLCAxLCAwLCAwKTtcbiAgICBjdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XG4gICAgY3R4LnJlc3RvcmUoKTtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZUxheWVyKGNhbnZhc2RpY3QsIGNhbnZhcylcbntcbiAgICBsZXQgZmxpcCA9IChjYW52YXNkaWN0LmxheWVyICE9IFwiQlwiKTtcblxuICAgIGlmKGNhbnZhc2RpY3QubGF5ZXIgPT09IFwiRlwiKVxuICAgIHtcbiAgICAgICAgcHJlcGFyZUNhbnZhcyhjYW52YXMsIGZsaXAsIGNhbnZhc2RpY3QudHJhbnNmb3JtKTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgcHJlcGFyZUNhbnZhcyhjYW52YXMsIGZsaXAsIGNhbnZhc2RpY3QudHJhbnNmb3JtKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFJlZHJhd0NhbnZhcyhsYXllcmRpY3QpXG57XG4gICAgbGV0IGlzRnJvbnQgPSAobGF5ZXJkaWN0LmxheWVyID09PSBcIkZcIilcblxuICAgIGZvciAobGV0IGxheWVyIG9mIGdsb2JhbERhdGEubGF5ZXJfbGlzdClcbiAgICB7XG4gICAgICAgIGxldCBjYW52YXMgPSBsYXllclsxXVtnbG9iYWxEYXRhLnJlbmRlcl9sYXllcnNdLkdldENhbnZhcyhpc0Zyb250KVxuICAgICAgICBwcmVwYXJlTGF5ZXIobGF5ZXJkaWN0LCBjYW52YXMpO1xuICAgICAgICBDbGVhckNhbnZhcyhjYW52YXMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gUmVzaXplQ2FudmFzKGxheWVyZGljdClcbntcbiAgICBsZXQgZmxpcCA9IChsYXllcmRpY3QubGF5ZXIgIT0gXCJCXCIpO1xuICAgIGxldCBpc0Zyb250ID0gKGxheWVyZGljdC5sYXllciA9PT0gXCJGXCIpXG5cbiAgICBmb3IgKGxldCBsYXllciBvZiBnbG9iYWxEYXRhLmxheWVyX2xpc3QpXG4gICAge1xuICAgICAgICBsZXQgY2FudmFzID0gbGF5ZXJbMV1bZ2xvYmFsRGF0YS5yZW5kZXJfbGF5ZXJzXS5HZXRDYW52YXMoaXNGcm9udClcbiAgICAgICAgcmVjYWxjTGF5ZXJTY2FsZShsYXllcmRpY3QsIGNhbnZhcyk7XG4gICAgICAgIHByZXBhcmVDYW52YXMoY2FudmFzLCBmbGlwLCBsYXllcmRpY3QudHJhbnNmb3JtKTtcbiAgICAgICAgQ2xlYXJDYW52YXMoY2FudmFzKTtcbiAgICB9XG59XG5cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgUmVzaXplQ2FudmFzLCBSZWRyYXdDYW52YXMsIHJvdGF0ZVZlY3RvciwgQ2xlYXJIaWdobGlnaHRzLCBDbGVhckNhbnZhc1xufTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFBvaW50ID0gcmVxdWlyZShcIi4vcG9pbnQuanNcIikuUG9pbnQ7XG5cbmZ1bmN0aW9uIEFyYyhndWlDb250ZXh0LCBjZW50ZXJQb2ludCwgcmFkaXVzLCBhbmdsZVN0YXJ0LCBhbmdsZUVuZCwgcmVuZGVyT3B0aW9ucyApXG57XG4gICAgZ3VpQ29udGV4dC5zYXZlKCk7XG5cbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZmlsbFN0eWxlICA9ICByZW5kZXJPcHRpb25zLmNvbG9yO1xuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7ICAgICAgICBcbiAgICB9XG5cbiAgICAvLyBJZiBvdmVyd3JpdGluZyBsaW5lIHdpZHRoLCB0aGVuIHVwZGF0ZSB0aGF0IGhlcmVcbiAgICBpZihyZW5kZXJPcHRpb25zLmxpbmVXaWR0aClcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XG4gICAgfVxuXG4gICAgaWYocmVuZGVyT3B0aW9ucy5saW5lQ2FwKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5saW5lQ2FwID0gcmVuZGVyT3B0aW9ucy5saW5lQ2FwO1xuICAgIH1cblxuXG4gICAgLy8gaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS90YWdzL2NhbnZhc19hcmMuYXNwXG4gICAgZ3VpQ29udGV4dC5iZWdpblBhdGgoKTtcbiAgICBndWlDb250ZXh0LmFyYyggY2VudGVyUG9pbnQueCwgY2VudGVyUG9pbnQueSwgcmFkaXVzLCBhbmdsZVN0YXJ0Kk1hdGguUEkvMTgwLCBhbmdsZUVuZCpNYXRoLlBJLzE4MCk7XG5cbiAgICAvLyBJZiBmaWxsIGlzIHRydWUsIGZpbGwgdGhlIGJveCwgb3RoZXJ3aXNlIGp1c3QgbWFrZSBhbiBvdXRsaW5lXG4gICAgaWYocmVuZGVyT3B0aW9ucy5maWxsKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsKCk7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlKCk7XG4gICAgfVxuXG4gICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG5cbn1cblxuZnVuY3Rpb24gTGluZShndWlDb250ZXh0LCBzdGFydFBvaW50LCBlbmRQb2ludCwgcmVuZGVyT3B0aW9ucyApXG57XG4gICAgZ3VpQ29udGV4dC5zYXZlKCk7XG5cbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZmlsbFN0eWxlICAgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjtcbiAgICAgICAgZ3VpQ29udGV4dC5zdHJva2VTdHlsZSA9ICByZW5kZXJPcHRpb25zLmNvbG9yOyAgICAgICAgXG4gICAgfVxuXG4gICAgLy8gSWYgb3ZlcndyaXRpbmcgbGluZSB3aWR0aCwgdGhlbiB1cGRhdGUgdGhhdCBoZXJlXG4gICAgaWYocmVuZGVyT3B0aW9ucy5saW5lV2lkdGgpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LmxpbmVXaWR0aCA9IHJlbmRlck9wdGlvbnMubGluZVdpZHRoO1xuICAgIH1cblxuICAgIGlmKHJlbmRlck9wdGlvbnMubGluZUNhcClcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQubGluZUNhcCA9IHJlbmRlck9wdGlvbnMubGluZUNhcDtcbiAgICB9XG5cbiAgICBndWlDb250ZXh0LmJlZ2luUGF0aCgpO1xuICAgIGd1aUNvbnRleHQubW92ZVRvKHN0YXJ0UG9pbnQueCwgc3RhcnRQb2ludC55KTtcbiAgICBndWlDb250ZXh0LmxpbmVUbyhlbmRQb2ludC54LCBlbmRQb2ludC55KTtcblxuICAgIC8vIElmIGZpbGwgaXMgdHJ1ZSwgZmlsbCB0aGUgYm94LCBvdGhlcndpc2UganVzdCBtYWtlIGFuIG91dGxpbmVcbiAgICBpZihyZW5kZXJPcHRpb25zLmZpbGwpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LmZpbGwoKTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcblxufVxuXG5mdW5jdGlvbiBSZWd1bGFyUG9seWdvbihndWlDb250ZXh0LCBjZW50ZXJQb2ludCwgdmVydGljZXMsIGFuZ2xlLCByZW5kZXJPcHRpb25zIClcbntcblxuICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xuICAgIGlmKCByZW5kZXJPcHRpb25zLmNvbG9yKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsU3R5bGUgID0gIHJlbmRlck9wdGlvbnMuY29sb3I7XG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlU3R5bGUgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjsgICAgICAgIFxuICAgIH1cbiAgICAvLyBJZiBvdmVyd3JpdGluZyBsaW5lIHdpZHRoLCB0aGVuIHVwZGF0ZSB0aGF0IGhlcmVcbiAgICBpZihyZW5kZXJPcHRpb25zLmxpbmVXaWR0aClcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XG4gICAgfVxuXG4gICAgaWYocmVuZGVyT3B0aW9ucy5nbG9iYWxBbHBoYSlcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZ2xvYmFsQWxwaGEgPSByZW5kZXJPcHRpb25zLmdsb2JhbEFscGhhO1xuICAgIH1cblxuICAgIGd1aUNvbnRleHQudHJhbnNsYXRlKGNlbnRlclBvaW50LngsIGNlbnRlclBvaW50LnkpO1xuICAgIC8qIFxuICAgICAgIFJvdGF0ZSBvcmlnaW4gYmFzZWQgb24gYW5nbGUgZ2l2ZW5cbiAgICAgICBOT1RFOiBjb21wYXJlZCB0byBvYmxvbmcgcGFkcywgbm8gYWRkaXRpb25hbCBtb2RpZmljYXRpb24gaXMgcmVxdWlyZWRcbiAgICAgICAgICAgICBvZiBhbmdsZSB0byBnZXQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSBjb3JyZWN0bHkuXG4gICAgKi9cbiAgICBndWlDb250ZXh0LnJvdGF0ZShhbmdsZSpNYXRoLlBJLzE4MCk7XG5cbiAgICAvKiBcbiAgICAgICBSb3RhdGUgb3JpZ2luIGJhc2VkIG9uIGFuZ2xlIGdpdmVuXG4gICAgICAgTk9URTogY29tcGFyZWQgdG8gb2Jsb25nIHBhZHMsIG5vIGFkZGl0aW9uYWwgbW9kaWZpY2F0aW9uIGlzIHJlcXVpcmVkXG4gICAgICAgICAgICAgb2YgYW5nbGUgdG8gZ2V0IHRoZSBhbmdsZSB0byByb3RhdGUgY29ycmVjdGx5LlxuICAgICovXG4gICAgLy9ndWlDb250ZXh0LnJvdGF0ZSgoYW5nbGUpKk1hdGguUEkvMTgwKTtcblxuICAgIGd1aUNvbnRleHQuYmVnaW5QYXRoKCk7XG4gICAgZ3VpQ29udGV4dC5tb3ZlVG8odmVydGljZXNbMF0ueCx2ZXJ0aWNlc1swXS55KTtcblxuICAgIGZvcih2YXIgaSA9IDE7IGkgPCB2ZXJ0aWNlcy5sZW5ndGg7IGkrKylcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQubGluZVRvKHZlcnRpY2VzW2ldLngsdmVydGljZXNbaV0ueSk7XG4gICAgfVxuICAgIGd1aUNvbnRleHQuY2xvc2VQYXRoKCk7XG4gICAgXG4gICAgLy8gSWYgZmlsbCBpcyB0cnVlLCBmaWxsIHRoZSBib3gsIG90aGVyd2lzZSBqdXN0IG1ha2UgYW4gb3V0bGluZVxuICAgIGlmKHJlbmRlck9wdGlvbnMuZmlsbClcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZmlsbCgpO1xuICAgIH1cbiAgICBlbHNlXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LnN0cm9rZSgpO1xuICAgIH1cblxuICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xuXG59XG5cblxuZnVuY3Rpb24gSXJyZWd1bGFyUG9seWdvbihndWlDb250ZXh0LCB2ZXJ0aWNlcywgcmVuZGVyT3B0aW9ucyApXG57XG5cbiAgICBndWlDb250ZXh0LnNhdmUoKTtcbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZmlsbFN0eWxlICA9ICByZW5kZXJPcHRpb25zLmNvbG9yO1xuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7ICAgICAgICBcbiAgICB9XG4gICAgLy8gSWYgb3ZlcndyaXRpbmcgbGluZSB3aWR0aCwgdGhlbiB1cGRhdGUgdGhhdCBoZXJlXG4gICAgaWYocmVuZGVyT3B0aW9ucy5saW5lV2lkdGgpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LmxpbmVXaWR0aCA9IHJlbmRlck9wdGlvbnMubGluZVdpZHRoO1xuICAgIH1cblxuICAgIGlmKHJlbmRlck9wdGlvbnMuZ2xvYmFsQWxwaGEpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0Lmdsb2JhbEFscGhhID0gcmVuZGVyT3B0aW9ucy5nbG9iYWxBbHBoYTtcbiAgICB9XG5cbiAgICBpZihyZW5kZXJPcHRpb25zLmNvbXBvc2l0aW9uVHlwZSlcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZ2xvYmFsQ29tcG9zaXRlT3BlcmF0aW9uICA9IHJlbmRlck9wdGlvbnMuY29tcG9zaXRpb25UeXBlO1xuICAgIH1cblxuICAgIGd1aUNvbnRleHQuYmVnaW5QYXRoKCk7XG4gICAgZ3VpQ29udGV4dC5tb3ZlVG8odmVydGljZXNbMF0ueCx2ZXJ0aWNlc1swXS55KTtcblxuICAgIGZvcih2YXIgaSA9IDE7IGkgPCB2ZXJ0aWNlcy5sZW5ndGg7IGkrKylcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQubGluZVRvKHZlcnRpY2VzW2ldLngsdmVydGljZXNbaV0ueSk7XG4gICAgfVxuICAgIGd1aUNvbnRleHQuY2xvc2VQYXRoKCk7XG5cbiAgICAvLyBJZiBmaWxsIGlzIHRydWUsIGZpbGwgdGhlIGJveCwgb3RoZXJ3aXNlIGp1c3QgbWFrZSBhbiBvdXRsaW5lXG4gICAgaWYocmVuZGVyT3B0aW9ucy5maWxsKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsKCk7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlKCk7XG4gICAgfVxuXG4gICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XG5cbn1cblxuXG5mdW5jdGlvbiBDaXJjbGUoZ3VpQ29udGV4dCwgY2VudGVyUG9pbnQsIHJhZGl1cywgcmVuZGVyT3B0aW9ucylcbntcbiAgICBndWlDb250ZXh0LnNhdmUoKTtcbiAgICBcbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuZmlsbFN0eWxlICA9ICByZW5kZXJPcHRpb25zLmNvbG9yO1xuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7ICAgICAgICBcbiAgICB9XG5cbiAgICBpZihyZW5kZXJPcHRpb25zLmxpbmVXaWR0aClcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XG4gICAgfVxuXG4gICAgLyogRHJhdyB0aGUgZHJpbGwgaG9sZSAqL1xuICAgIGd1aUNvbnRleHQuYmVnaW5QYXRoKCk7XG4gICAgZ3VpQ29udGV4dC5hcmMoY2VudGVyUG9pbnQueCxjZW50ZXJQb2ludC55LCByYWRpdXMsIDAsIDIqTWF0aC5QSSk7XG5cbiAgICBpZihyZW5kZXJPcHRpb25zLmZpbGwpXG4gICAge1xuICAgICAgICBndWlDb250ZXh0LmZpbGwoKTtcbiAgICB9XG4gICAgZWxzZVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcbn1cblxuXG4vKlxuICAgIFRvIHJlbmRlciBhbiBvdmFsIHNvbWUgamF2YXNjcmlwdCB0cmlja2VyeSBpcyB1c2VkLiBUbyBoYWxmIGNpcmNsZXMgYXJlIHJlbmRlcmVkLCBcbiAgICBhbmQgc2luY2UgYnkgZGVmYXVsdCB3aGVuIGRyYXdpbmcgc2hhcGVzIHRoZXkgd2lsbCBieSBkZWZhdWx0IGJlIGNvbm5lY3RlZCBieSBhdCBcbiAgICBsZWFzdCBvbmUgcG9pbnQgaWYgY2xvc2UgcGF0aCBpcyBub3QgY2FsbGVkLiBTbyBieSBqdXN0IGNhbGxpbmcgdGhlIHRvcCBhbmQgYm90dG9tIFxuICAgIGhhbGYgY2lyY2xlcywgdGhlIHJlY3Rhbmd1bGFyIGNlbnRlciBvZiB0aGUgaGFsZiBjaXJjbGUgd2lsbCBiZSBmaWxsZWQuXG4qL1xuZnVuY3Rpb24gT3ZhbChndWlDb250ZXh0LCBjZW50ZXJQb2ludCwgaGVpZ2h0LCB3aWR0aCwgYW5nbGUsIHJlbmRlck9wdGlvbnMpXG57XG5cbiAgICAvLyBDZW50ZXIgcG9pbnQgb2YgYm90aCBjaXJjbGVzLlxuICAgIGxldCBjZW50ZXJQb2ludDEgPSBuZXcgUG9pbnQoMCwgLWhlaWdodC8yKTtcbiAgICBsZXQgY2VudGVyUG9pbnQyID0gbmV3IFBvaW50KDAsIGhlaWdodC8yKTtcbiAgICBsZXQgcmFkaXVzID0gd2lkdGgvMjtcblxuICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xuICAgIGlmKCByZW5kZXJPcHRpb25zLmNvbG9yKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsU3R5bGUgID0gIHJlbmRlck9wdGlvbnMuY29sb3I7XG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlU3R5bGUgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjtcbiAgICB9XG5cbiAgICAvKlxuICAgICAgICBUaGUgZm9sbG93aW5nIG9ubHkgcmVhbGx5IG5lZWRzIHRvIGRyYXcgdHdvIHNlbWljaXJjbGVzIGFzIGludGVybmFsbHkgdGhlIHNlbWljaXJjbGVzIHdpbGwgXG4gICAgICAgIGF0dGFjaCB0byBlYWNoIG90aGVyIHRvIGNyZWF0ZSB0aGUgY29tcGxldGVkIG9iamVjdC5cbiAgICAgKi9cblxuICAgIGd1aUNvbnRleHQudHJhbnNsYXRlKGNlbnRlclBvaW50LngsIGNlbnRlclBvaW50LnkpO1xuICAgIC8qIFxuICAgICAgIFJvdGF0ZSBvcmlnaW4gYmFzZWQgb24gYW5nbGUgZ2l2ZW5cbiAgICAgICBOT1RFOiBGb3Igc29tZSByZWFzb24gRWFnbGVDQUQgaXRlbXMgYXJlIHJvdGF0ZWQgYnkgOTAgZGVncmVlcyBieSBkZWZhdWx0LiBcbiAgICAgICAgICAgICBUaGlzIGNvcnJlY3RzIGZvciB0aGF0IHNvIGl0ZW1zIGFyZSBkaXNwbGF5ZWQgY29ycmVjdGx5LlxuICAgICAgICAgICAgIFRoaXMgc2VlbXMgdG8gYWxzbyBvbmx5IGJlIHJlcXVpcmVkIGZvciBvYmxvbmcgcGFkcy4gVGhpcyBpcyBtb3N0IGxpa2VseSBkdWUgdG8gdGhlIFxuICAgICAgICAgICAgIGFyYyBmdW5jdGlvbnMgdXNlZC5cbiAgICAqL1xuICAgIGd1aUNvbnRleHQucm90YXRlKChhbmdsZS05MCkqTWF0aC5QSS8xODApO1xuXG4gICAgZ3VpQ29udGV4dC5iZWdpblBhdGgoKTtcbiAgICBndWlDb250ZXh0LmFyYyhjZW50ZXJQb2ludDEueCwgY2VudGVyUG9pbnQxLnksIHJhZGl1cywgTWF0aC5QSSwwKTtcbiAgICBndWlDb250ZXh0LmFyYyhjZW50ZXJQb2ludDIueCwgY2VudGVyUG9pbnQyLnksIHJhZGl1cywgMCwgTWF0aC5QSSApO1xuICAgIGd1aUNvbnRleHQuY2xvc2VQYXRoKCk7XG4gICAgXG4gICAgaWYocmVuZGVyT3B0aW9ucy5maWxsKVxuICAgIHtcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsKCk7XG4gICAgfVxuICAgIGVsc2VcbiAgICB7XG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlKCk7XG4gICAgfVxuXG4gICAgLy8gUmVzdG9yZXMgY29udGV4dCB0byBzdGF0ZSBwcmlvciB0byB0aGlzIHJlbmRlcmluZyBmdW5jdGlvbiBiZWluZyBjYWxsZWQuIFxuICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xufVxuXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIEFyYywgTGluZSwgUmVndWxhclBvbHlnb24sIElycmVndWxhclBvbHlnb24sIENpcmNsZSwgT3ZhbFxufTtcbiIsIi8qXG4gICAgTGF5ZXIgdGFibGUgZm9ybXMgdGhlIHJpZ2h0IGhhbGYgb2YgZGlzcGxheS4gVGhlIHRhYmxlIGNvbnRhaW5zIGVhY2ggb2YgdGhlXG4gICAgdXNlZCBsYXllcnMgaW4gdGhlIGRlc2lnbiBhbG9uZyB3aXRoIGNoZWNrIGJveGVzIHRvIHNob3cvaGlkZSB0aGUgbGF5ZXIuXG5cbiAgICBUaGUgZm9sbG93aW5nIGZ1bmN0aW9uIGludGVyZmFjZXMgdGhlIGxheWVycyBmb3IgdGhlIHByb2plY3QgdG8gdGhlIEdVSS5cblxuXG4gICAgTGF5ZXIgdGFibGUgaXMgY29tcG9zZWQgb2YgdGhyZWUgcGFydHM6XG4gICAgICAgIDEuIFNlYXJjaCBiYXJcbiAgICAgICAgMi4gSGVhZGVyXG4gICAgICAgIDMuIExheWVyc1xuXG4gICAgU2VhcmNoIGJhciBhbGxvd3MgdXNlcnMgdG8gdHlwZSBhIHdvcmQgYW5kIGxheWVyIG5hbWVzIG1hdGNoaW5nIHdoYXRcbiAgICBoYXMgYmVlbiB0eXBlZCB3aWxsIHJlbWFpbiB3aGlsZSBhbGwgb3RoZXIgZW50cmllcyB3aWxsIGJlIGhpZGRlbi5cblxuICAgIEhlYWRlciBzaW1wbHkgZGlzcGxheXMgY29sdW1uIG5hbWVzIGZvciBlYWNoIGVhY2ggY29sdW1uLlxuXG4gICAgTGFzdCBsYXllciAsYm9keSwgZGlzcGxheXMgYW4gZW50cnkgcGVyIHVzZWQgbGF5ZXIgdGhhdCBhcmUgbm90XG4gICAgZmlsdGVyZWQgb3V0LlxuKi9cblwidXNlIHN0cmljdFwiO1xuXG52YXIgcGNiICAgICAgICA9IHJlcXVpcmUoXCIuL3BjYi5qc1wiKTtcbnZhciBnbG9iYWxEYXRhID0gcmVxdWlyZShcIi4vZ2xvYmFsLmpzXCIpO1xudmFyIFRhYmxlX1Rlc3RQb2ludEVudHJ5ID0gcmVxdWlyZShcIi4vcmVuZGVyL1RhYmxlX1Rlc3RQb2ludEVudHJ5LmpzXCIpLlRhYmxlX1Rlc3RQb2ludEVudHJ5XG5cbmZ1bmN0aW9uIHBvcHVsYXRlVGVzdFBvaW50VGFibGUoKVxue1xuICAgIC8qIFBvcHVsYXRlIGhlYWRlciBhbmQgQk9NIGJvZHkuIFBsYWNlIGludG8gRE9NICovXG4gICAgcG9wdWxhdGVUZXN0UG9pbnRIZWFkZXIoKTtcbiAgICBwb3B1bGF0ZVRlc3RQb2ludEJvZHkoKTtcbn1cblxubGV0IGZpbHRlckxheWVyID0gXCJcIjtcbmZ1bmN0aW9uIGdldEZpbHRlclRlc3RQb2ludCgpXG57XG4gICAgcmV0dXJuIGZpbHRlckxheWVyO1xufVxuXG5mdW5jdGlvbiBwb3B1bGF0ZVRlc3RQb2ludEhlYWRlcigpXG57XG4gICAgbGV0IGxheWVySGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGVzdHBvaW50aGVhZFwiKTtcbiAgICB3aGlsZSAobGF5ZXJIZWFkLmZpcnN0Q2hpbGQpXG4gICAge1xuICAgICAgICBsYXllckhlYWQucmVtb3ZlQ2hpbGQobGF5ZXJIZWFkLmZpcnN0Q2hpbGQpO1xuICAgIH1cblxuICAgIC8vIEhlYWRlciByb3dcbiAgICBsZXQgdHIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVFJcIik7XG4gICAgLy8gRGVmaW5lcyB0aGVcbiAgICBsZXQgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XG5cbiAgICB0aC5jbGFzc0xpc3QuYWRkKFwidmlzaWFibGVDb2xcIik7XG5cbiAgICB0aC5pbm5lckhUTUwgPSBcIlRlc3QgUG9pbnRcIjtcbiAgICBsZXQgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJTUEFOXCIpO1xuICAgIHNwYW4uY2xhc3NMaXN0LmFkZChcIm5vbmVcIik7XG4gICAgdGguYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgdHIuYXBwZW5kQ2hpbGQodGgpO1xuXG4gICAgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XG4gICAgdGguaW5uZXJIVE1MID0gXCJFeHBlY3RlZFwiO1xuICAgIHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiU1BBTlwiKTtcbiAgICBzcGFuLmNsYXNzTGlzdC5hZGQoXCJub25lXCIpO1xuICAgIHRoLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgIHRyLmFwcGVuZENoaWxkKHRoKTtcblxuICAgIHRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpO1xuICAgIHRoLmlubmVySFRNTCA9IFwiTWVhc3VyZWRcIjtcbiAgICBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlNQQU5cIik7XG4gICAgc3Bhbi5jbGFzc0xpc3QuYWRkKFwibm9uZVwiKTtcbiAgICB0aC5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICB0ci5hcHBlbmRDaGlsZCh0aCk7XG5cbiAgICB0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUSFwiKTtcbiAgICB0aC5pbm5lckhUTUwgPSBcIkRlc2NyaXB0aW9uXCI7XG4gICAgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJTUEFOXCIpO1xuICAgIHNwYW4uY2xhc3NMaXN0LmFkZChcIm5vbmVcIik7XG4gICAgdGguYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgdHIuYXBwZW5kQ2hpbGQodGgpO1xuXG4gICAgbGF5ZXJIZWFkLmFwcGVuZENoaWxkKHRyKTtcbn1cblxuZnVuY3Rpb24gcG9wdWxhdGVUZXN0UG9pbnRCb2R5KClcbntcbiAgICBsZXQgdGVzdFBvaW50Qm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGVzdHBvaW50Ym9keVwiKTtcbiAgICB3aGlsZSAodGVzdFBvaW50Qm9keS5maXJzdENoaWxkKVxuICAgIHtcbiAgICAgICAgdGVzdFBvaW50Qm9keS5yZW1vdmVDaGlsZCh0ZXN0UG9pbnRCb2R5LmZpcnN0Q2hpbGQpO1xuICAgIH1cblxuICAgIC8vIHJlbW92ZSBlbnRyaWVzIHRoYXQgZG8gbm90IG1hdGNoIGZpbHRlclxuICAgIGZvciAobGV0IHRlc3Rwb2ludCBvZiBnbG9iYWxEYXRhLnBjYl90ZXN0cG9pbnRzKVxuICAgIHtcbiAgICAgICAgdGVzdFBvaW50Qm9keS5hcHBlbmRDaGlsZChuZXcgVGFibGVfVGVzdFBvaW50RW50cnkodGVzdHBvaW50KSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBGaWx0ZXIocylcbntcblxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBwb3B1bGF0ZVRlc3RQb2ludFRhYmxlXG59XG4iLCIvKlxuICAgIExheWVyIHRhYmxlIGZvcm1zIHRoZSByaWdodCBoYWxmIG9mIGRpc3BsYXkuIFRoZSB0YWJsZSBjb250YWlucyBlYWNoIG9mIHRoZVxuICAgIHVzZWQgbGF5ZXJzIGluIHRoZSBkZXNpZ24gYWxvbmcgd2l0aCBjaGVjayBib3hlcyB0byBzaG93L2hpZGUgdGhlIGxheWVyLlxuXG4gICAgVGhlIGZvbGxvd2luZyBmdW5jdGlvbiBpbnRlcmZhY2VzIHRoZSBsYXllcnMgZm9yIHRoZSBwcm9qZWN0IHRvIHRoZSBHVUkuXG5cblxuICAgIExheWVyIHRhYmxlIGlzIGNvbXBvc2VkIG9mIHRocmVlIHBhcnRzOlxuICAgICAgICAxLiBTZWFyY2ggYmFyXG4gICAgICAgIDIuIEhlYWRlclxuICAgICAgICAzLiBMYXllcnNcblxuICAgIFNlYXJjaCBiYXIgYWxsb3dzIHVzZXJzIHRvIHR5cGUgYSB3b3JkIGFuZCBsYXllciBuYW1lcyBtYXRjaGluZyB3aGF0XG4gICAgaGFzIGJlZW4gdHlwZWQgd2lsbCByZW1haW4gd2hpbGUgYWxsIG90aGVyIGVudHJpZXMgd2lsbCBiZSBoaWRkZW4uXG5cbiAgICBIZWFkZXIgc2ltcGx5IGRpc3BsYXlzIGNvbHVtbiBuYW1lcyBmb3IgZWFjaCBlYWNoIGNvbHVtbi5cblxuICAgIExhc3QgbGF5ZXIgLGJvZHksIGRpc3BsYXlzIGFuIGVudHJ5IHBlciB1c2VkIGxheWVyIHRoYXQgYXJlIG5vdFxuICAgIGZpbHRlcmVkIG91dC5cbiovXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIHBjYiAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XG52YXIgZ2xvYmFsRGF0YSA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcbnZhciBUYWJsZV9UcmFjZUVudHJ5ID0gcmVxdWlyZShcIi4vcmVuZGVyL1RhYmxlX1RyYWNlRW50cnkuanNcIikuVGFibGVfVHJhY2VFbnRyeVxuXG5mdW5jdGlvbiBwb3B1bGF0ZVRyYWNlVGFibGUoKVxue1xuICAgIC8qIFBvcHVsYXRlIGhlYWRlciBhbmQgQk9NIGJvZHkuIFBsYWNlIGludG8gRE9NICovXG4gICAgcG9wdWxhdGVUcmFjZUhlYWRlcigpO1xuICAgIHBvcHVsYXRlVHJhY2VCb2R5KCk7XG59XG5cblxubGV0IGZpbHRlckxheWVyID0gXCJcIjtcbmZ1bmN0aW9uIGdldEZpbHRlckxheWVyKClcbntcbiAgICByZXR1cm4gZmlsdGVyTGF5ZXI7XG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlVHJhY2VIZWFkZXIoKVxue1xuICAgIGxldCBsYXllckhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRyYWNlaGVhZFwiKTtcbiAgICB3aGlsZSAobGF5ZXJIZWFkLmZpcnN0Q2hpbGQpXG4gICAge1xuICAgICAgICBsYXllckhlYWQucmVtb3ZlQ2hpbGQobGF5ZXJIZWFkLmZpcnN0Q2hpbGQpO1xuICAgIH1cblxuICAgIC8vIEhlYWRlciByb3dcbiAgICBsZXQgdHIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVFJcIik7XG4gICAgLy8gRGVmaW5lcyB0aGVcbiAgICBsZXQgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XG5cbiAgICB0aC5jbGFzc0xpc3QuYWRkKFwidmlzaWFibGVDb2xcIik7XG5cblxuICAgIHRoLmlubmVySFRNTCA9IFwiVHJhY2VcIjtcbiAgICBsZXQgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJTUEFOXCIpO1xuICAgIHNwYW4uY2xhc3NMaXN0LmFkZChcIm5vbmVcIik7XG4gICAgdGguYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgdHIuYXBwZW5kQ2hpbGQodGgpO1xuXG4gICAgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XG4gICAgdGguaW5uZXJIVE1MID0gXCJPaG1zXCI7XG4gICAgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJTUEFOXCIpO1xuICAgIHNwYW4uY2xhc3NMaXN0LmFkZChcIm5vbmVcIik7XG4gICAgdGguYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgdHIuYXBwZW5kQ2hpbGQodGgpO1xuXG5cbiAgICB0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUSFwiKTtcbiAgICB0aC5pbm5lckhUTUwgPSBcIkluZHVjdGFuY2VcIjtcbiAgICBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlNQQU5cIik7XG4gICAgc3Bhbi5jbGFzc0xpc3QuYWRkKFwibm9uZVwiKTtcbiAgICB0aC5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICB0ci5hcHBlbmRDaGlsZCh0aCk7XG5cbiAgICBsYXllckhlYWQuYXBwZW5kQ2hpbGQodHIpO1xufVxuXG5mdW5jdGlvbiBwb3B1bGF0ZVRyYWNlQm9keSgpXG57XG4gICAgbGV0IHRyYWNlQm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHJhY2Vib2R5XCIpO1xuICAgIHdoaWxlICh0cmFjZUJvZHkuZmlyc3RDaGlsZClcbiAgICB7XG4gICAgICAgIHRyYWNlQm9keS5yZW1vdmVDaGlsZCh0cmFjZUJvZHkuZmlyc3RDaGlsZCk7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIGVudHJpZXMgdGhhdCBkbyBub3QgbWF0Y2ggZmlsdGVyXG4gICAgZm9yIChsZXQgdHJhY2Ugb2YgZ2xvYmFsRGF0YS5wY2JfdHJhY2VzKVxuICAgIHtcbiAgICAgICAgdHJhY2VCb2R5LmFwcGVuZENoaWxkKG5ldyBUYWJsZV9UcmFjZUVudHJ5KHRyYWNlKSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBGaWx0ZXIocylcbntcblxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBwb3B1bGF0ZVRyYWNlVGFibGVcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG5sZXQgdmVyc2lvblN0cmluZ19NYWpvciA9IDM7XG5sZXQgdmVyc2lvblN0cmluZ19NaW5vciA9ICdYJztcbmxldCB2ZXJzaW9uU3RyaW5nX1BhdGNoID0gJ1gnO1xuXG5sZXQgdmVyc2lvblN0cmluZ19pc0FscGhhID0gdHJ1ZTtcblxuZnVuY3Rpb24gR2V0VmVyc2lvblN0cmluZygpXG57XG5cbiAgICBsZXQgcmVzdWx0ID0gJ1YnICsgU3RyaW5nKHZlcnNpb25TdHJpbmdfTWFqb3IpICsgJy4nICsgU3RyaW5nKHZlcnNpb25TdHJpbmdfTWlub3IpICsgJy4nICsgU3RyaW5nKHZlcnNpb25TdHJpbmdfUGF0Y2gpXG5cbiAgICBpZih2ZXJzaW9uU3RyaW5nX2lzQWxwaGEpXG4gICAge1xuICAgICAgICByZXN1bHQgPSByZXN1bHQgKyBcIi1BbHBoYVwiXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcblxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBHZXRWZXJzaW9uU3RyaW5nXG59O1xuIl19
