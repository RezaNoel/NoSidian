fn main() {
    // Rebuild the Windows resource (exe icon) whenever the icons change, even
    // with a warm CI cache.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
