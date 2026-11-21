fn main() {
    // Rebuild the Windows resource (exe icon) whenever the icons change, even
    // with a warm CI cache.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    // The Google client is compiled in from the build environment.
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_SECRET");
    tauri_build::build()
}
