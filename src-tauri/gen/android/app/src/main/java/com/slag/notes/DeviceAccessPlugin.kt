package com.slag.notes

import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class DeviceAccessArgs {
  lateinit var target: String
}

/**
 * The three grants a reminder needs and none of which is a runtime dialog:
 *
 * - `SYSTEM_ALERT_WINDOW` (draw over other apps) — the reminder panel has to appear while another
 *   app owns the screen. `Settings.canDrawOverlays` reports it, the switch lives in system settings.
 * - `USE_FULL_SCREEN_INTENT` — since Android 14 an alarm may only take the whole screen when the
 *   person allowed it for this app; `canUseFullScreenIntent` exists only from 34, everything older
 *   had no switch at all and is reported as allowed.
 * - `POST_NOTIFICATIONS` — a runtime permission the notification plugin requests for itself; here
 *   it is only reported, so the settings screen can say whether the OS will show anything.
 *
 * Nothing here asks for a permission: `open` only routes to the right system screen, and the
 * frontend re-reads `status` when the app comes back to the foreground.
 */
@TauriPlugin
class DeviceAccessPlugin(private val activity: Activity) : Plugin(activity) {

  @Command
  fun status(invoke: Invoke) {
    val fullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val manager = activity.getSystemService(NotificationManager::class.java)
      manager?.canUseFullScreenIntent() ?: false
    } else {
      true
    }
    invoke.resolve(
      JSObject()
        .put("overlay", Settings.canDrawOverlays(activity))
        .put("notifications", NotificationManagerCompat.from(activity).areNotificationsEnabled())
        .put("fullScreenIntent", fullScreen)
    )
  }

  /**
   * `canRequestPackageInstalls` is the only place the app can learn whether the system installer
   * will accept the apk; the updater asks for it so the button is honest before the download.
   */
  @Command
  fun canInstall(invoke: Invoke) {
    val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      activity.packageManager.canRequestPackageInstalls()
    invoke.resolve(JSObject().put("canInstall", allowed))
  }

  @Command
  fun open(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(DeviceAccessArgs::class.java)
      val intent = when (args.target) {
        "overlay" ->
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}"))
        "fullScreen" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Intent(
              Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
              Uri.parse("package:${activity.packageName}")
            )
          } else {
            notificationSettings()
          }
        else -> notificationSettings()
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
      invoke.resolve()
    } catch (error: Exception) {
      // A vendor build can ship without the screen; the UI then keeps saying "not allowed".
      invoke.reject(error.message ?: "settings_failed")
    }
  }

  private fun notificationSettings(): Intent =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    } else {
      // API 24–25 has no per-app notification screen of its own.
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
    }
}
