package com.slag.notes

import android.os.Build
import android.os.Bundle
import android.view.Display
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestMaxRefreshRate()
  }

  override fun onResume() {
    super.onResume()
    // Leaving the app hands the display back to the system, which drops the
    // window to its default rate; ask again on every return to the foreground.
    requestMaxRefreshRate()
  }

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
