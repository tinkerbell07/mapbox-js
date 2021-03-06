import {test} from '../../util/test.js';
import emptyStyle from '../../../src/style-spec/empty.js';
import {validateStyle} from '../../../src/style-spec/validate_style.min.js';

test('it generates something', (t) => {
    const style = emptyStyle();
    t.ok(style);
    t.end();
});

test('generated empty style is a valid style', (t) => {
    const errors = validateStyle(emptyStyle());
    t.equal(errors.length, 0);
    t.end();
});
