package com.slag.notes

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.PermissionState
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream

@InvokeArg
class ListMediaArgs {
  lateinit var kind: String
  var offset: Int = 0
  var limit: Int = 60
}

@InvokeArg
class ReadMediaArgs {
  lateinit var id: String
}

/**
 * The device gallery, straight from MediaStore. The webview cannot query the media database and
 * cannot read `content://` URIs, so rows arrive here and thumbnails leave as inline JPEG: the
 * picker's grid never touches the file system itself.
 */
@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.READ_MEDIA_IMAGES], alias = "mediaImages"),
    Permission(strings = [Manifest.permission.READ_MEDIA_VIDEO], alias = "mediaVideo"),
  ]
)
class MediaGalleryPlugin(private val activity: Activity) : Plugin(activity) {
  private val contentResolver get() = activity.contentResolver

  @Command
  fun ping(invoke: Invoke) {
    val result = JSObject()
    result.put("ok", true)
    result.put("sdk", Build.VERSION.SDK_INT)
    invoke.resolve(result)
  }

  @Command
  fun accessState(invoke: Invoke) {
    val result = JSObject()
    result.put("images", getPermissionState("mediaImages")?.toString() ?: "prompt")
    result.put("video", getPermissionState("mediaVideo")?.toString() ?: "prompt")
    invoke.resolve(result)
  }

  @Command
  fun requestAccess(invoke: Invoke) {
    requestPermissionForAlias("mediaImages", invoke, "onImagesAccess")
  }

  @PermissionCallback
  private fun onImagesAccess(invoke: Invoke) {
    if (getPermissionState("mediaImages") == PermissionState.GRANTED) {
      requestPermissionForAlias("mediaVideo", invoke, "onVideoAccess")
    } else {
      resolveAccess(invoke)
    }
  }

  @PermissionCallback
  private fun onVideoAccess(invoke: Invoke) {
    resolveAccess(invoke)
  }

  private fun resolveAccess(invoke: Invoke) {
    val result = JSObject()
    result.put("images", getPermissionState("mediaImages")?.toString() ?: "prompt")
    result.put("video", getPermissionState("mediaVideo")?.toString() ?: "prompt")
    invoke.resolve(result)
  }

  @Command
  fun listMedia(invoke: Invoke) {
    val args = invoke.parseArgs(ListMediaArgs::class.java)
    val isVideo = args.kind == "video"
    val collection = if (isVideo) {
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    } else {
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }
    val idColumn = if (isVideo) MediaStore.Video.Media._ID else MediaStore.Images.Media._ID
    val projection = arrayOf(
      idColumn,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED,
    )
    val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC LIMIT ${args.limit} OFFSET ${args.offset}"

    val items = JSArray()
    contentResolver.query(collection, projection, null, null, sortOrder)?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getLong(0)
        val uri = ContentUris.withAppendedId(collection, id)
        val item = JSObject()
        item.put("id", id.toString())
        item.put("kind", args.kind)
        item.put("name", cursor.getString(1) ?: "")
        item.put("mimeType", cursor.getString(2) ?: "application/octet-stream")
        item.put("size", cursor.getLong(3))
        item.put("dateAdded", cursor.getLong(4) * 1000L)
        thumbnail(uri)?.let { item.put("thumb", it) }
        items.put(item)
      }
    }

    val result = JSObject()
    result.put("items", items)
    result.put("hasMore", items.length() == args.limit)
    invoke.resolve(result)
  }

  @Command
  fun readMedia(invoke: Invoke) {
    val args = invoke.parseArgs(ReadMediaArgs::class.java)
    val collections = listOf(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
    for (collection in collections) {
      val uri = ContentUris.withAppendedId(collection, args.id.toLongOrNull() ?: -1L)
      val bytes = try {
        contentResolver.openInputStream(uri)?.use { it.readBytes() }
      } catch (error: Exception) {
        null
      }
      if (bytes == null) continue
      val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
      val result = JSObject()
      result.put("mimeType", mimeType)
      result.put("size", bytes.size)
      result.put("dataUrl", "data:$mimeType;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
      invoke.resolve(result)
      return
    }
    invoke.reject("Медиа недоступно")
  }

  /** A 160px JPEG for the grid cell; the full file is only read when the note is created. */
  private fun thumbnail(uri: Uri): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    return try {
      val bitmap = contentResolver.loadThumbnail(uri, Size(160, 160), null)
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
      bitmap.recycle()
      "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    } catch (error: Exception) {
      null
    }
  }
}
