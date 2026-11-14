package com.slag.notes

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class InstallApkArgs {
  lateinit var path: String
}

/**
 * Hands a downloaded apk to the system installer. Android has no way to install a package
 * silently, so this only opens the standard "Update?" dialog: the file goes out through the
 * launcher's own FileProvider (the `cache-path` from `file_paths.xml`) and the user confirms.
 *
 * `cacheDir` is resolved here rather than guessed in Rust: the provider grants exactly
 * `context.cacheDir`, and a path built on the Rust side would drift from it on the next
 * Tauri upgrade.
 */
@TauriPlugin
class ApkInstallerPlugin(private val activity: Activity) : Plugin(activity) {

  @Command
  fun cacheDir(invoke: Invoke) {
    val dir = File(activity.cacheDir, "updates")
    if (!dir.exists()) dir.mkdirs()
    invoke.resolve(JSObject().put("path", dir.absolutePath))
  }

  @Command
  fun install(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(InstallApkArgs::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !activity.packageManager.canRequestPackageInstalls()
      ) {
        invoke.reject("permission_required")
        return
      }
      val file = File(args.path)
      if (!file.exists() || file.length() == 0L) {
        invoke.reject("missing_file")
        return
      }
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "install_failed")
    }
  }

  @Command
  fun openSettings(invoke: Invoke) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
          data = Uri.parse("package:${activity.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
      }
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "settings_failed")
    }
  }
}
