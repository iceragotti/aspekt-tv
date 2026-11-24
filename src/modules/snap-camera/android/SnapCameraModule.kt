package expo.modules.snapcamera

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SnapCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SnapCamera")

    Function("triggerSnapFeedback") {
      "Snap feedback test triggered on Android."
    }
  }
}
