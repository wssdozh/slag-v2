package com.slag.notes

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.Display
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var isImeAnimating = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // The link is read before the webview exists, so the frontend can ask for it on its first
    // frame instead of waiting for an event that would arrive while it is still loading.
    LinkInbox.pending = deepLinkIn(intent)
    super.onCreate(savedInstanceState)
    trackImeInsets()
    requestMaxRefreshRate()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // singleTask: tapping a link with the app already open lands here, not in onCreate.
    setIntent(intent)
    LinkInbox.pending = deepLinkIn(intent)
  }

  private fun deepLinkIn(intent: Intent?): String? =
    intent?.dataString?.takeIf { it.startsWith("slag://") }

  override fun onResume() {
    super.onResume()
    // Leaving the app hands the display back to the system, which drops the
    // window to its default rate; ask again on every return to the foreground.
    requestMaxRefreshRate()
  }

  /**
   * Edge-to-edge turns off the framework's own IME resize, so `adjustResize`
   * in the manifest does nothing: the WebView keeps its full height, the
   * keyboard covers the composer, and the platform pans the page to reveal the
   * caret — that pan chasing the shrinking visual viewport is what reads as
   * jerky. Padding the content view by the IME inset shrinks the WebView for
   * real, and doing it from `onProgress` moves it in step with the keyboard
   * animation instead of snapping at the end of it.
   */
  private fun trackImeInsets() {
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      // While the IME animates, the dispatch already carries the final inset;
      // applying it here snaps the layout to the end position for one frame and
      // the animation then walks back from there. Let onProgress own that.
      if (isImeAnimating) zeroIme(insets) else applyImeInset(view, insets)
    }
    ViewCompat.setWindowInsetsAnimationCallback(
      content,
      object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
        override fun onPrepare(animation: WindowInsetsAnimationCompat) {
          isImeAnimating = animation.typeMask and WindowInsetsCompat.Type.ime() != 0
        }

        override fun onProgress(
          insets: WindowInsetsCompat,
          runningAnimations: MutableList<WindowInsetsAnimationCompat>,
        ): WindowInsetsCompat = applyImeInset(content, insets)

        override fun onEnd(animation: WindowInsetsAnimationCompat) {
          isImeAnimating = false
        }
      },
    )
  }

  /**
   * The IME inset is zeroed before it reaches the WebView: the WebView would
   * otherwise shrink its own visual viewport by the same amount and the page
   * would lose the space twice.
   */
  private fun applyImeInset(view: View, insets: WindowInsetsCompat): WindowInsetsCompat {
    view.setPadding(0, 0, 0, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
    return zeroIme(insets)
  }

  private fun zeroIme(insets: WindowInsetsCompat): WindowInsetsCompat =
    WindowInsetsCompat.Builder(insets)
      .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
      .build()

  /**
   * A 120Hz panel still serves this window at 60Hz until the window asks for
   * more — which is exactly what a scrolling feed reads as "low framerate".
   * Only the fastest mode at the current resolution qualifies: a resolution
   * switch costs more than the extra frames buy back.
   */
  private fun requestMaxRefreshRate() {
    val display: Display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      display ?: return
    } else {
      @Suppress("DEPRECATION")
      windowManager.defaultDisplay ?: return
    }
    val current = display.mode ?: return
    val fastest = display.supportedModes
      .filter {
        it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight
      }
      .maxByOrNull { it.refreshRate } ?: return
    if (fastest.refreshRate <= current.refreshRate + 1f) return
    window.attributes = window.attributes.apply { preferredDisplayModeId = fastest.modeId }
  }
}
