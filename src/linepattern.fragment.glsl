#ifdef GL_ES
precision mediump float;
#else
#define lowp
#define mediump
#define highp
#endif

#ifndef MAPBOX_GL_JS
uniform vec2 u_linewidth;
#endif
uniform float u_blur;

uniform vec2 u_pattern_size_a;
uniform vec2 u_pattern_size_b;
uniform vec2 u_pattern_tl_a;
uniform vec2 u_pattern_br_a;
uniform vec2 u_pattern_tl_b;
uniform vec2 u_pattern_br_b;
uniform float u_fade;
uniform float u_opacity;

uniform sampler2D u_image;

varying vec2 v_normal;
#ifdef MAPBOX_GL_JS
varying vec2 v_linewidth;
#endif
varying float v_linesofar;
varying float v_gamma_scale;

void main() {
    // Calculate the distance of the pixel from the line in pixels.
#ifndef MAPBOX_GL_JS
    float dist = length(v_normal) * u_linewidth.s;
#else
    float dist = length(v_normal) * v_linewidth.s;
#endif

    // Calculate the antialiasing fade factor. This is either when fading in
    // the line in case of an offset line (v_linewidth.t) or when fading out
    // (v_linewidth.s)
    float blur = u_blur * v_gamma_scale;
#ifndef MAPBOX_GL_JS
    float alpha = clamp(min(dist - (u_linewidth.t - blur), u_linewidth.s - dist) / blur, 0.0, 1.0);
#else
    float alpha = clamp(min(dist - (v_linewidth.t - blur), v_linewidth.s - dist) / blur, 0.0, 1.0);
#endif

    float x_a = mod(v_linesofar / u_pattern_size_a.x, 1.0);
    float x_b = mod(v_linesofar / u_pattern_size_b.x, 1.0);
#ifndef MAPBOX_GL_JS
    float y_a = 0.5 + (v_normal.y * u_linewidth.s / u_pattern_size_a.y);
    float y_b = 0.5 + (v_normal.y * u_linewidth.s / u_pattern_size_b.y);
    vec2 pos_a = mix(u_pattern_tl_a, u_pattern_br_a, vec2(x_a, y_a));
    vec2 pos_b = mix(u_pattern_tl_b, u_pattern_br_b, vec2(x_b, y_b));
#else
    float y_a = 0.5 + (v_normal.y * v_linewidth.s / u_pattern_size_a.y);
    float y_b = 0.5 + (v_normal.y * v_linewidth.s / u_pattern_size_b.y);
    vec2 pos_a = mix(u_pattern_tl_a, u_pattern_br_a, vec2(x_a, y_a));
    vec2 pos_b = mix(u_pattern_tl_b, u_pattern_br_b, vec2(x_b, y_b));
#endif

    vec4 color = mix(texture2D(u_image, pos_a), texture2D(u_image, pos_b), u_fade);

    alpha *= u_opacity;

    gl_FragColor = color * alpha;

#ifdef OVERDRAW_INSPECTOR
    gl_FragColor = vec4(1.0);
#endif
}
