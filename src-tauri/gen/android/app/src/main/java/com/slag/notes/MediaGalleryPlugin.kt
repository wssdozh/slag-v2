package com.slag.notes

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.os.Build
import android.provider.MediaStore
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class ListMediaArgs {
  lateinit var kind: String
  var offset: Int = 0
  var limit: Int = 60
}

/**
 * Rows of the device media database. This plugin only *lists*: thumbnails and bytes are read
 * through `tauri-plugin-android-fs`, which takes the `content://` URI a row carries, so nothing
 * here decodes a bitmap or holds a file in memory.
 *
 * Android 13 split storage access per media type, so the aliases differ by version: one legacy
 * grant below 33, three typed grants above.
 */
@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.READ_MEDIA_IMAGES], alias = "mediaImages"),
    Permission(strings = [Manifest.permission.READ_MEDIA_VIDEO], alias = "mediaVideo"),
    Permission(strings = [Manifest.permission.READ_MEDIA_AUDIO], alias = "mediaAudio"),
    Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "mediaLegacy"),
  ]
)
class MediaGalleryPlugin(host: Activity) : Plugin(host) {
  private val resolver = host.contentResolver
  private val isSplit = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

  @Command
  fun accessState(invoke: Invoke) {
    invoke.resolve(accessPayload())
  }

  @Command
  fun requestAccess(invoke: Invoke) {
    requestImages(invoke)
  }

  private fun requestImages(invoke: Invoke) {
    if (isSplit) requestPermissionForAlias("mediaImages", invoke, "onImages")
    else requestPermissionForAlias("mediaLegacy", invoke, "onLegacy")
  }

  @PermissionCallback
  private fun onImages(invoke: Invoke) {
    if (getPermissionState("mediaImages") == PermissionState.GRANTED) {
      requestPermissionForAlias("mediaVideo", invoke, "onVideo")
    } else {
      invoke.resolve(accessPayload())
    }
  }

  @PermissionCallback
  private fun onVideo(invoke: Invoke) {
    if (getPermissionState("mediaVideo") == PermissionState.GRANTED) {
      requestPermissionForAlias("mediaAudio", invoke, "onAudio")
    } else {
      invoke.resolve(accessPayload())
    }
  }

  @PermissionCallback
  private fun onAudio(invoke: Invoke) {
    invoke.resolve(accessPayload())
  }

  @PermissionCallback
  private fun onLegacy(invoke: Invoke) {
    invoke.resolve(accessPayload())
  }

  /** Every media type shares the one legacy grant below 33, so all three report it. */
  private fun accessPayload(): JSObject {
    val result = JSObject()
    result.put("images", stateOf(if (isSplit) "mediaImages" else "mediaLegacy"))
    result.put("video", stateOf(if (isSplit) "mediaVideo" else "mediaLegacy"))
    result.put("audio", stateOf(if (isSplit) "mediaAudio" else "mediaLegacy"))
    return result
  }

  private fun stateOf(alias: String): String = when (getPermissionState(alias)) {
    PermissionState.GRANTED -> "granted"
    PermissionState.DENIED -> "denied"
    else -> "prompt"
  }

  @Command
  fun listMedia(invoke: Invoke) {
    val args = invoke.parseArgs(ListMediaArgs::class.java)
    val collection = when (args.kind) {
      "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
      else -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED,
    )

    val items = JSArray()
    var hasMore = false

    // Paging is sliced here rather than with `LIMIT … OFFSET` in the sort order: some vendor
    // query implementations ignore it and return every row, which looked like an empty gallery.
    val cursor = resolver.query(
      collection,
      projection,
      null,
      null,
      "${MediaStore.MediaColumns.DATE_ADDED} DESC",
    )

    cursor?.use { rows ->
      hasMore = rows.count > args.offset + args.limit
      if (args.offset < rows.count && rows.moveToPosition(args.offset)) {
        var emitted = 0
        while (emitted < args.limit) {
          val id = rows.getLong(0)
          val item = JSObject()
          item.put("id", id.toString())
          item.put("uri", ContentUris.withAppendedId(collection, id).toString())
          item.put("kind", args.kind)
          item.put("name", rows.getString(1) ?: "")
          item.put("mimeType", rows.getString(2) ?: "application/octet-stream")
          item.put("size", rows.getLong(3).toDouble())
          item.put("dateAdded", rows.getLong(4).toDouble() * 1000.0)
          items.put(item)
          emitted += 1
          if (!rows.moveToNext()) break
        }
      }
    }

    val result = JSObject()
    result.put("items", items)
    result.put("hasMore", hasMore)
    invoke.resolve(result)
  }
}
