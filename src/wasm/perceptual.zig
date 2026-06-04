// Perceptual image hashing for client-side duplicate detection.
// Exposed as WASM exports; JS handles canvas resize, this handles math.

// Static buffer — JS writes pixels here before calling dHash.
// Sized for the largest input we need: 9×8 RGBA = 288 bytes.
var pixel_buf: [9 * 8 * 4]u8 = undefined;

/// Returns a pointer to the shared pixel buffer.
/// JS must write a 9×8 RGBA pixel array here before calling dHash.
export fn getPixelBufPtr() [*]u8 {
    return &pixel_buf;
}

/// Difference hash (dHash) of a 9×8 RGBA pixel buffer.
/// Compares adjacent pixels in each row after converting to luma.
/// Returns a 64-bit hash.
export fn dHash() u64 {
    var hash: u64 = 0;
    var bit: u6 = 0;
    var y: u32 = 0;
    while (y < 8) : (y += 1) {
        var x: u32 = 0;
        while (x < 8) : (x += 1) {
            // BT.601 luma, scaled ×1000 to stay in integer arithmetic
            const left = (y * 9 + x) * 4;
            const right = (y * 9 + x + 1) * 4;
            const l1 = @as(u32, pixel_buf[left]) * 299 +
                @as(u32, pixel_buf[left + 1]) * 587 +
                @as(u32, pixel_buf[left + 2]) * 114;
            const l2 = @as(u32, pixel_buf[right]) * 299 +
                @as(u32, pixel_buf[right + 1]) * 587 +
                @as(u32, pixel_buf[right + 2]) * 114;
            if (l1 > l2) {
                hash |= @as(u64, 1) << bit;
            }
            // Safe: bit goes 0..63, u6 holds 0..63
            if (bit < 63) bit += 1;
        }
    }
    return hash;
}

/// Hamming distance between two 64-bit hashes.
/// ≤ 10 → likely duplicate; ≤ 20 → similar image.
export fn hammingDistance(a: u64, b: u64) u32 {
    return @popCount(a ^ b);
}
