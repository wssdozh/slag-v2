package com.slag.notes

import android.app.Activity
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * The device gallery, straight from MediaStore. The webview cannot read `content://` URIs and
 * cannot query the media database, so the picker's grid gets its rows and thumbnails from here.
 */
@TauriPlugin
class MediaGalleryPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun ping(invoke: Invoke) {
    val result = JSObject()
    result.put("ok", true)
    result.put("sdk", Build.VERSION.SDK_INT)
    invoke.resolve(result)
  }
}
