function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function attribute_to_object(attributes) {
    const result = {};
    for (const attribute of attributes) {
        result[attribute.name] = attribute.value;
    }
    return result;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    flushing = false;
    seen_callbacks.clear();
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
let SvelteElement;
if (typeof HTMLElement === 'function') {
    SvelteElement = class extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
        }
        connectedCallback() {
            // @ts-ignore todo: improve typings
            for (const key in this.$$.slotted) {
                // @ts-ignore todo: improve typings
                this.appendChild(this.$$.slotted[key]);
            }
        }
        attributeChangedCallback(attr, _oldValue, newValue) {
            this[attr] = newValue;
        }
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            // TODO should this delegate to addEventListener?
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    };
}

/* src/components/sparkLine.svelte generated by Svelte v3.31.2 */

function create_fragment(ctx) {
	let svg;
	let polyline;
	let polyline_points_value;

	return {
		c() {
			svg = svg_element("svg");
			polyline = svg_element("polyline");
			this.c = noop;
			attr(polyline, "stroke", /*lineColor*/ ctx[2]);
			attr(polyline, "fill", /*fillColor*/ ctx[3]);
			attr(polyline, "stroke-width", /*strokeWidth*/ ctx[4]);
			attr(polyline, "stroke-linejoin", "round");
			attr(polyline, "shape-rendering", "geometricPrecision");
			attr(polyline, "points", polyline_points_value = "\n      " + /*coordinates*/ ctx[5] + "\n    ");
			attr(svg, "class", "sparkLine");
			attr(svg, "height", /*height*/ ctx[1]);
			attr(svg, "width", /*width*/ ctx[0]);
		},
		m(target, anchor) {
			insert(target, svg, anchor);
			append(svg, polyline);
		},
		p(ctx, [dirty]) {
			if (dirty & /*lineColor*/ 4) {
				attr(polyline, "stroke", /*lineColor*/ ctx[2]);
			}

			if (dirty & /*fillColor*/ 8) {
				attr(polyline, "fill", /*fillColor*/ ctx[3]);
			}

			if (dirty & /*strokeWidth*/ 16) {
				attr(polyline, "stroke-width", /*strokeWidth*/ ctx[4]);
			}

			if (dirty & /*coordinates*/ 32 && polyline_points_value !== (polyline_points_value = "\n      " + /*coordinates*/ ctx[5] + "\n    ")) {
				attr(polyline, "points", polyline_points_value);
			}

			if (dirty & /*height*/ 2) {
				attr(svg, "height", /*height*/ ctx[1]);
			}

			if (dirty & /*width*/ 1) {
				attr(svg, "width", /*width*/ ctx[0]);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

function normalize(pulse, height) {
	var maxVal = Math.max(...pulse);
	var minVal = Math.min(...pulse);

	return pulse.map(value => {
		var result = (value - minVal) / (maxVal - minVal) * height;
		return height - result;
	});
}

function instance($$self, $$props, $$invalidate) {
	let coordinates;
	let { width = 130 } = $$props;
	let { height = 30 } = $$props;
	let { lineColor = "#b5ddfa" } = $$props;
	let { fillColor = "#ecf7fe" } = $$props;
	let { values = "100, 300, 150, 350, 450, 600, 700" } = $$props;
	let { strokeWidth = 1 } = $$props;
	

	function calcCoordinates(pulse, height, width) {
		let values = pulse.split(",").map(num => parseInt(num));
		let tickWidth = width / values.length;
		let yAxisVal = normalize(values, height);
		let xAxisVal = values.map((_v, idx) => idx * tickWidth);
		let dataSet = values.map((_v, idx) => [xAxisVal[idx], yAxisVal[idx]]);
		let first = [-2, height];
		let last = [dataSet[dataSet.length - 1][0] + 2, height];
		dataSet.unshift(first);
		dataSet.push(last);
		let coordinates = "";

		for (let i = 0; i < dataSet.length; i++) {
			coordinates = coordinates + `${dataSet[i][0]},${dataSet[i][1]}\n`;
		}

		return coordinates;
	}

	

	$$self.$$set = $$props => {
		if ("width" in $$props) $$invalidate(0, width = $$props.width);
		if ("height" in $$props) $$invalidate(1, height = $$props.height);
		if ("lineColor" in $$props) $$invalidate(2, lineColor = $$props.lineColor);
		if ("fillColor" in $$props) $$invalidate(3, fillColor = $$props.fillColor);
		if ("values" in $$props) $$invalidate(6, values = $$props.values);
		if ("strokeWidth" in $$props) $$invalidate(4, strokeWidth = $$props.strokeWidth);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*values, height, width*/ 67) {
			 $$invalidate(5, coordinates = calcCoordinates(values, height, width));
		}
	};

	return [width, height, lineColor, fillColor, strokeWidth, coordinates, values];
}

class SparkLine extends SvelteElement {
	constructor(options) {
		super();
		this.shadowRoot.innerHTML = `<style>.sparkLine{overflow:hidden}</style>`;

		init(
			this,
			{
				target: this.shadowRoot,
				props: attribute_to_object(this.attributes)
			},
			instance,
			create_fragment,
			safe_not_equal,
			{
				width: 0,
				height: 1,
				lineColor: 2,
				fillColor: 3,
				values: 6,
				strokeWidth: 4
			}
		);

		if (options) {
			if (options.target) {
				insert(options.target, this, options.anchor);
			}

			if (options.props) {
				this.$set(options.props);
				flush();
			}
		}
	}

	static get observedAttributes() {
		return ["width", "height", "lineColor", "fillColor", "values", "strokeWidth"];
	}

	get width() {
		return this.$$.ctx[0];
	}

	set width(width) {
		this.$set({ width });
		flush();
	}

	get height() {
		return this.$$.ctx[1];
	}

	set height(height) {
		this.$set({ height });
		flush();
	}

	get lineColor() {
		return this.$$.ctx[2];
	}

	set lineColor(lineColor) {
		this.$set({ lineColor });
		flush();
	}

	get fillColor() {
		return this.$$.ctx[3];
	}

	set fillColor(fillColor) {
		this.$set({ fillColor });
		flush();
	}

	get values() {
		return this.$$.ctx[6];
	}

	set values(values) {
		this.$set({ values });
		flush();
	}

	get strokeWidth() {
		return this.$$.ctx[4];
	}

	set strokeWidth(strokeWidth) {
		this.$set({ strokeWidth });
		flush();
	}
}

customElements.define("chart-sparkline", SparkLine);

export default SparkLine;
