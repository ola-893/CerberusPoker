#[cfg(target_os = "solana")]
#[no_mangle]
pub unsafe extern "C" fn __getrandom_custom(dest: *mut u8, len: usize) -> u32 {
    let slice = std::slice::from_raw_parts_mut(dest, len);
    for b in slice {
        *b = 0;
    }
    0
}
