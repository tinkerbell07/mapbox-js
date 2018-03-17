import { test } from 'mapbox-gl-js-test';
import {
    Uniform1i,
    Uniform1f,
    Uniform2fv,
    Uniform3fv,
    Uniform4fv
} from '../../../src/render/uniform_binding';

test('Uniform1i', (t) => {
    // test counts ensure we don't call the gl.uniform* setters more than expected
    t.plan(4);

    const context = {
        gl: {
            uniform1i: () => { t.ok(true, 'sets value when unique'); }
        }
    };

    const u = new Uniform1i(context, 0);

    t.equal(u.current, 0, 'not set upon initialization');
    u.set(1);
    t.equal(u.current, 1, 'correctly set value');
    u.set(1);
    u.set(2);
    t.end();
});

test('Uniform1f', (t) => {
    t.plan(4);

    const context = {
        gl: {
            uniform1f: () => { t.ok(true, 'sets value when unique'); }
        }
    };

    const u = new Uniform1f(context, 0);

    t.equal(u.current, 0, 'not set upon initialization');
    u.set(1);
    t.equal(u.current, 1, 'correctly set value');
    u.set(1);
    u.set(2);
    t.end();
});

test('Uniform2fv', (t) => {
    t.plan(4);

    const context = {
        gl: {
            uniform2f: () => { t.ok(true, 'sets value when unique'); }
        }
    };

    const u = new Uniform2fv(context, 0);

    t.deepEqual(u.current, [0, 0], 'not set upon initialization');
    u.set([1, 1]);
    t.deepEqual(u.current, [1, 1], 'correctly set value');
    u.set([1, 1]);
    u.set([1, 2]);
    t.end();
});

test('Uniform3fv', (t) => {
    t.plan(4);

    const context = {
        gl: {
            uniform3f: () => { t.ok(true, 'sets value when unique'); }
        }
    };

    const u = new Uniform3fv(context, 0);

    t.deepEqual(u.current, [0, 0, 0], 'not set upon initialization');
    u.set([1, 1, 1]);
    t.deepEqual(u.current, [1, 1, 1], 'correctly set value');
    u.set([1, 1, 1]);
    u.set([1, 1, 2]);
    t.end();
});

test('Uniform4fv', (t) => {
    t.plan(4);

    const context = {
        gl: {
            uniform4f: () => { t.ok(true, 'sets value when unique'); }
        }
    };

    const u = new Uniform4fv(context, 0);

    t.deepEqual(u.current, [0, 0, 0, 0], 'not set upon initialization');
    u.set([1, 1, 1, 1]);
    t.deepEqual(u.current, [1, 1, 1, 1], 'correctly set value');
    u.set([1, 1, 1, 1]);
    u.set([2, 1, 1, 1]);
    t.end();
});
