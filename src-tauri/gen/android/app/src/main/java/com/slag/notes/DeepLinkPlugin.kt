package com.slag.notes

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * A `slag://` link waits here between the intent and the webview's next question.
 *
 * The webview cannot see an intent: Android hands it to the activity, and the activity may be
 * cold (no frontend yet) or already running (the note has to open without a restart). One slot
 * covers both, and the frontend pulls it when it is able to — that is also why nothing is pushed.
 */
object LinkInbox {
  @Volatile
  var pending: String? = null
}

/**
 * Takes the parked link, once. Registered as an app-local plugin, reached through the
 * `take_deep_link` command, so the webview needs no ACL the plugin cannot declare.
 */
@TauriPlugin
class DeepLinkPlugin(host: Activity) : Plugin(host) {
  @Command
  fun take(invoke: Invoke) {
    val url = LinkInbox.pending
    LinkInbox.pending = null
    val result = JSObject()
    if (url != null) result.put("url", url)
    invoke.resolve(result)
  }
}
