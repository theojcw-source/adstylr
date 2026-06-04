use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewConfig {
    width: u32,
    height: u32,
    #[serde(default = "default_fit")]
    fit: String,
    #[serde(default)]
    background: Option<String>,
    #[serde(default)]
    image_transform: ImageTransform,
    #[serde(default)]
    gradients: GradientConfig,
    #[serde(default)]
    color_blocks: Vec<ColorBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageTransform {
    #[serde(default = "default_scale")]
    scale: f32,
    #[serde(default)]
    x: f32,
    #[serde(default)]
    y: f32,
}

impl Default for ImageTransform {
    fn default() -> Self {
        Self {
            scale: 1.0,
            x: 0.0,
            y: 0.0,
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct GradientConfig {
    #[serde(default)]
    top: Option<String>,
    #[serde(default)]
    top_opacity: f32,
    #[serde(default)]
    bottom: Option<String>,
    #[serde(default)]
    bottom_opacity: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ColorBlock {
    color: String,
    #[serde(default = "default_opacity")]
    opacity: f32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
pub fn render_preview(
    config_json: &str,
    source_rgba: &[u8],
    source_width: u32,
    source_height: u32,
) -> Result<Vec<u8>, JsValue> {
    if source_width == 0 || source_height == 0 {
        return Err(JsValue::from_str("source dimensions are required"));
    }

    let expected_len = source_width as usize * source_height as usize * 4;
    if source_rgba.len() < expected_len {
        return Err(JsValue::from_str("source_rgba is smaller than source dimensions"));
    }

    let config: PreviewConfig = serde_json::from_str(config_json)
        .map_err(|error| JsValue::from_str(&format!("invalid config JSON: {error}")))?;

    if config.width == 0 || config.height == 0 {
        return Err(JsValue::from_str("preview dimensions are required"));
    }

    let background = parse_hex(config.background.as_deref().unwrap_or("#000000"));
    let mut output = vec![0; config.width as usize * config.height as usize * 4];
    fill(&mut output, background);
    draw_source_image(
        &mut output,
        config.width,
        config.height,
        source_rgba,
        source_width,
        source_height,
        &config.fit,
        &config.image_transform,
    );
    apply_gradient(&mut output, config.width, config.height, &config.gradients);
    for block in &config.color_blocks {
        draw_color_block(&mut output, config.width, config.height, block);
    }

    Ok(output)
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn draw_source_image(
    output: &mut [u8],
    width: u32,
    height: u32,
    source: &[u8],
    source_width: u32,
    source_height: u32,
    fit: &str,
    transform: &ImageTransform,
) {
    let scale_x = width as f32 / source_width as f32;
    let scale_y = height as f32 / source_height as f32;
    let fit_scale = if fit == "contain" {
        scale_x.min(scale_y)
    } else {
        scale_x.max(scale_y)
    };
    let scale = (fit_scale * transform.scale.max(0.01)).max(0.01);
    let drawn_width = source_width as f32 * scale;
    let drawn_height = source_height as f32 * scale;
    let offset_x = (width as f32 - drawn_width) * 0.5 + transform.x;
    let offset_y = (height as f32 - drawn_height) * 0.5 + transform.y;

    for y in 0..height {
        for x in 0..width {
            let src_x = (x as f32 - offset_x) / scale;
            let src_y = (y as f32 - offset_y) / scale;
            if src_x < 0.0
                || src_y < 0.0
                || src_x >= source_width as f32
                || src_y >= source_height as f32
            {
                continue;
            }

            let pixel = sample_bilinear(source, source_width, source_height, src_x, src_y);
            blend_pixel(output, width, x, y, pixel, pixel[3] as f32 / 255.0);
        }
    }
}

fn sample_bilinear(source: &[u8], width: u32, height: u32, x: f32, y: f32) -> [u8; 4] {
    let x0 = x.floor().clamp(0.0, (width - 1) as f32) as u32;
    let y0 = y.floor().clamp(0.0, (height - 1) as f32) as u32;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);
    let wx = x - x.floor();
    let wy = y - y.floor();

    let c00 = source_pixel(source, width, x0, y0);
    let c10 = source_pixel(source, width, x1, y0);
    let c01 = source_pixel(source, width, x0, y1);
    let c11 = source_pixel(source, width, x1, y1);

    [
        interpolate(c00[0], c10[0], c01[0], c11[0], wx, wy),
        interpolate(c00[1], c10[1], c01[1], c11[1], wx, wy),
        interpolate(c00[2], c10[2], c01[2], c11[2], wx, wy),
        interpolate(c00[3], c10[3], c01[3], c11[3], wx, wy),
    ]
}

fn source_pixel(source: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
    let index = (y as usize * width as usize + x as usize) * 4;
    [
        source[index],
        source[index + 1],
        source[index + 2],
        source[index + 3],
    ]
}

fn interpolate(c00: u8, c10: u8, c01: u8, c11: u8, wx: f32, wy: f32) -> u8 {
    let top = c00 as f32 * (1.0 - wx) + c10 as f32 * wx;
    let bottom = c01 as f32 * (1.0 - wx) + c11 as f32 * wx;
    (top * (1.0 - wy) + bottom * wy)
        .round()
        .clamp(0.0, 255.0) as u8
}

fn apply_gradient(output: &mut [u8], width: u32, height: u32, gradient: &GradientConfig) {
    let top = parse_hex(gradient.top.as_deref().unwrap_or("#000000"));
    let bottom = parse_hex(gradient.bottom.as_deref().unwrap_or("#000000"));
    let top_opacity = gradient.top_opacity.clamp(0.0, 1.6);
    let bottom_opacity = gradient.bottom_opacity.clamp(0.0, 1.6);

    for y in 0..height {
        let t = if height <= 1 {
            0.0
        } else {
            y as f32 / (height - 1) as f32
        };
        let color = [
            lerp(top[0], bottom[0], t),
            lerp(top[1], bottom[1], t),
            lerp(top[2], bottom[2], t),
            255,
        ];
        let opacity = top_opacity * (1.0 - t) + bottom_opacity * t;
        for x in 0..width {
            blend_pixel(output, width, x, y, color, opacity);
        }
    }
}

fn draw_color_block(output: &mut [u8], width: u32, height: u32, block: &ColorBlock) {
    let color = parse_hex(&block.color);
    let opacity = block.opacity.clamp(0.0, 1.0);
    let x0 = block.x.max(0) as u32;
    let y0 = block.y.max(0) as u32;
    let x1 = (block.x + block.width as i32).clamp(0, width as i32) as u32;
    let y1 = (block.y + block.height as i32).clamp(0, height as i32) as u32;

    for y in y0..y1 {
        for x in x0..x1 {
            blend_pixel(output, width, x, y, color, opacity);
        }
    }
}

fn fill(output: &mut [u8], color: [u8; 4]) {
    for pixel in output.chunks_exact_mut(4) {
        pixel.copy_from_slice(&color);
    }
}

fn blend_pixel(output: &mut [u8], width: u32, x: u32, y: u32, color: [u8; 4], opacity: f32) {
    let index = (y as usize * width as usize + x as usize) * 4;
    let alpha = (opacity * color[3] as f32 / 255.0).clamp(0.0, 1.0);
    output[index] = blend_channel(output[index], color[0], alpha);
    output[index + 1] = blend_channel(output[index + 1], color[1], alpha);
    output[index + 2] = blend_channel(output[index + 2], color[2], alpha);
    output[index + 3] = 255;
}

fn blend_channel(dst: u8, src: u8, alpha: f32) -> u8 {
    (src as f32 * alpha + dst as f32 * (1.0 - alpha))
        .round()
        .clamp(0.0, 255.0) as u8
}

fn parse_hex(value: &str) -> [u8; 4] {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return [0, 0, 0, 255];
    }

    let parsed = u32::from_str_radix(hex, 16).unwrap_or(0);
    [
        ((parsed >> 16) & 0xff) as u8,
        ((parsed >> 8) & 0xff) as u8,
        (parsed & 0xff) as u8,
        255,
    ]
}

fn lerp(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 * (1.0 - t) + b as f32 * t)
        .round()
        .clamp(0.0, 255.0) as u8
}

fn default_fit() -> String {
    "cover".to_string()
}

fn default_scale() -> f32 {
    1.0
}

fn default_opacity() -> f32 {
    1.0
}
